import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';
import { domainToASCII } from 'url';
import { lookup as dnsLookupCallback } from 'dns';
import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';
import Redis from 'ioredis';
import { Agent, fetch as undiciFetch, Response as UndiciResponse } from 'undici';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuthService } from '../auth/auth.service';
import { withCompanyId } from '../common/security/tenant.util';
import { REDIS_CLIENT } from '../redis/redis.module';

// JIT provisioning must never grant either platform- or tenant-administrator
// privileges. Keep these roles aligned with the non-admin choices in SSO UI.
const VALID_ROLES = ['MANAGER', 'DISPATCH', 'WAREHOUSE', 'AGENT', 'USER', 'VIEWER'];
const STATE_TTL_SECONDS = 300;
const EXCHANGE_TTL_SECONDS = 60;
const MAX_IDP_RESPONSE_BYTES = 1_048_576;
type OidcFetchResponse = Awaited<ReturnType<typeof undiciFetch>>;
const IMPORT_ESM = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

const CONSUME_BROWSER_BOUND_VALUE = `
local value = redis.call('GET', KEYS[1])
if not value then return '' end
local ok, decoded = pcall(cjson.decode, value)
if not ok or type(decoded) ~= 'table' then
  redis.call('DEL', KEYS[1])
  return ''
end
if decoded.browserBindingHash ~= ARGV[1] then return '' end
redis.call('DEL', KEYS[1])
return value
`;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isValidPublicDnsHostname(hostname: string): boolean {
  const normalized = String(hostname ?? '').toLowerCase();
  const labels = normalized.split('.');
  return Boolean(
    normalized.length <= 253 &&
    !isIP(normalized) &&
    labels.length >= 2 &&
    labels.every((label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) &&
    !/(^|\.)(localhost|local|internal|test|example)$/.test(normalized),
  );
}

function normalizeEmailAddress(raw: unknown): { email: string; domain: string } | null {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!email || email.length > 254) return null;
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64 || !parts[1]) return null;
  const [localPart, rawDomain] = parts;
  if (/\s/.test(localPart) || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) return null;
  const domain = domainToASCII(rawDomain);
  if (!isValidPublicDnsHostname(domain)) return null;
  return { email, domain };
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  return true;
}

@Injectable()
export class SsoService implements OnModuleDestroy {
  private readonly logger = new Logger('ENTERPRISE_SSO');
  private oidcModulePromise: Promise<any> | null = null;
  private readonly oidcDispatcher = new Agent({
    connections: 4,
    pipelining: 1,
    connect: {
      lookup: (hostname: string, options: any, callback?: any) => {
        const done = typeof options === 'function' ? options : callback;
        const lookupOptions = typeof options === 'function' ? {} : options ?? {};
        if (isIP(hostname)) {
          done(new Error('OIDC endpoints must use a public DNS hostname'));
          return;
        }
        dnsLookupCallback(hostname, { all: true, verbatim: true, family: 4 }, (error, addresses) => {
          if (error) return done(error);
          const publicAddresses = (addresses ?? []).filter((entry: any) => entry.family === 4);
          if (!publicAddresses.length || publicAddresses.some((entry: any) => !isPublicIpv4(entry.address))) {
            return done(new Error('OIDC endpoint resolved to a non-public IP address'));
          }
          if (lookupOptions.all) return done(null, publicAddresses);
          return done(null, publicAddresses[0].address, 4);
        });
      },
    },
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    private readonly auth: AuthService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.oidcDispatcher.close();
  }

  private configuredBase(key: string, fallback: string): string {
    const raw = String(this.config.get(key, fallback)).trim().replace(/\/$/, '');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new InternalServerErrorException(`${key} must be a valid absolute URL`);
    }
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash) {
      throw new InternalServerErrorException(`${key} must use HTTPS and must not contain credentials, query, or fragment`);
    }
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  }

  private apiBase(): string {
    return this.configuredBase('API_PUBLIC_URL', 'http://localhost:3000/api/v1');
  }

  private appUrl(): string {
    return this.configuredBase('APP_URL', 'http://localhost:5173');
  }

  private redirectUri(): string {
    return `${this.apiBase()}/sso/callback`;
  }

  bindingCookieOptions() {
    const api = new URL(this.apiBase());
    const secure = api.protocol === 'https:';
    const prefix = api.pathname.replace(/\/$/, '');
    return {
      httpOnly: true,
      secure,
      sameSite: (secure ? 'none' : 'lax') as 'none' | 'lax',
      path: `${prefix}/sso` || '/sso',
      maxAge: STATE_TTL_SECONDS * 1000,
    };
  }

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'sso'))) {
      throw new ForbiddenException(
        'Single sign-on (SSO) is an Enterprise feature. Upgrade your plan to connect an identity provider.',
      );
    }
  }

  private mask(conn: any) {
    if (!conn) return null;
    const {
      clientSecret,
      authUrl: _legacyAuthUrl,
      tokenUrl: _legacyTokenUrl,
      userInfoUrl: _legacyUserInfoUrl,
      ...rest
    } = conn;
    return {
      ...rest,
      clientSecretSet: this.isEncryptedSecret(clientSecret),
      redirectUri: this.redirectUri(),
    };
  }

  async getConfig(companyId: string) {
    await this.assertEntitled(companyId);
    const conn = await (this.prisma as any).ssoConnection.findUnique({ where: { companyId } });
    return this.mask(conn) ?? { companyId, enabled: false, provider: 'oidc', redirectUri: this.redirectUri() };
  }

  async upsertConfig(companyId: string, dto: any) {
    await this.assertEntitled(companyId);
    dto = dto && typeof dto === 'object' && !Array.isArray(dto) ? dto : {};
    if (dto.enabled !== undefined && typeof dto.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }
    if (dto.autoProvision !== undefined && typeof dto.autoProvision !== 'boolean') {
      throw new BadRequestException('autoProvision must be a boolean');
    }

    for (const legacyEndpoint of ['authUrl', 'tokenUrl', 'userInfoUrl']) {
      if (dto?.[legacyEndpoint]) {
        throw new BadRequestException('Configure the OIDC issuer only; endpoints are obtained from trusted discovery metadata');
      }
    }
    if (dto.defaultRole && !VALID_ROLES.includes(String(dto.defaultRole).toUpperCase())) {
      throw new BadRequestException(`defaultRole must be one of: ${VALID_ROLES.join(', ')}`);
    }

    const existing = await (this.prisma as any).ssoConnection.findUnique({ where: { companyId } });
    let issuer = existing?.issuer ?? null;
    if (dto.issuer !== undefined) {
      const value = String(dto.issuer ?? '').trim();
      issuer = value || null;
      if (issuer) {
        if (issuer.length > 2048) throw new BadRequestException('Issuer URL is too long');
        const issuerUrl = this.parseSafeHttpsUrl(issuer);
        await this.assertPublicHostname(issuerUrl.hostname);
      }
    }

    let clientId = existing?.clientId ?? null;
    if (dto.clientId !== undefined) {
      const value = String(dto.clientId ?? '').trim();
      clientId = value || null;
      if (clientId && clientId.length > 512) throw new BadRequestException('Client ID is too long');
    }

    let encryptedSecret = existing?.clientSecret ?? null;
    const suppliedSecret = typeof dto.clientSecret === 'string' ? dto.clientSecret.trim() : '';
    const discardLegacySecret = Boolean(existing?.clientSecret && !this.isEncryptedSecret(existing.clientSecret));
    if (discardLegacySecret && !suppliedSecret) encryptedSecret = null;
    if (suppliedSecret) {
      if (suppliedSecret.length > 4096) throw new BadRequestException('Client secret is too long');
      encryptedSecret = this.encryptSecret(suppliedSecret);
    }

    const enabled = dto.enabled ?? existing?.enabled ?? false;
    if (enabled && (!issuer || !clientId || !this.isEncryptedSecret(encryptedSecret))) {
      throw new BadRequestException(
        'To enable SSO, configure an HTTPS issuer, client ID, and re-enter the client secret after setting SSO_SECRET_ENCRYPTION_KEY',
      );
    }

    let allowedDomain = existing?.allowedDomain ?? null;
    if (dto.allowedDomain !== undefined) {
      const rawDomain = String(dto.allowedDomain ?? '').trim().toLowerCase();
      if (!rawDomain) {
        allowedDomain = null;
      } else {
        const domain = domainToASCII(rawDomain);
        if (!isValidPublicDnsHostname(domain)) {
          throw new BadRequestException('allowedDomain must be one public DNS domain without a wildcard');
        }
        allowedDomain = domain;
      }
    }

    const data: any = {
      provider: 'oidc',
      enabled,
      issuer,
      clientId,
      scopes: dto.scopes === undefined
        ? (existing?.scopes || 'openid email profile')
        : this.normalizeScopes(dto.scopes),
      allowedDomain,
      autoProvision: dto.autoProvision ?? existing?.autoProvision ?? true,
      defaultRole: dto.defaultRole ? String(dto.defaultRole).toUpperCase() : (existing?.defaultRole || 'AGENT'),
    };
    if (suppliedSecret) data.clientSecret = encryptedSecret;
    else if (discardLegacySecret) data.clientSecret = null;

    const conn = await (this.prisma as any).ssoConnection.upsert({
      where: { companyId },
      update: data,
      create: withCompanyId(companyId, { ...data, clientSecret: encryptedSecret ?? undefined }),
    });
    return this.mask(conn);
  }

  private normalizeScopes(value: unknown): string {
    const input = String(value ?? 'openid email profile').trim().split(/\s+/).filter(Boolean);
    const scopes = [...new Set(input)];
    if (!scopes.includes('openid')) scopes.unshift('openid');
    if (!scopes.includes('email')) scopes.push('email');
    if (scopes.length > 30 || scopes.some((scope) => scope.length > 100)) {
      throw new BadRequestException('OIDC scopes are invalid or too long');
    }
    return scopes.join(' ');
  }

  private parseSafeHttpsUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('OIDC issuer must be a valid absolute URL');
    }
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.port && url.port !== '443') ||
      !isValidPublicDnsHostname(url.hostname)
    ) {
      throw new BadRequestException('OIDC endpoints must use HTTPS on a public DNS hostname');
    }
    return url;
  }

  private async assertPublicHostname(hostname: string): Promise<void> {
    let records: Array<{ address: string; family: number }>;
    try {
      records = await dnsLookup(hostname, { all: true, verbatim: true, family: 4 });
    } catch {
      throw new BadRequestException('OIDC issuer hostname did not resolve to a public IPv4 address');
    }
    if (!records.length || records.some((record) => record.family !== 4 || !isPublicIpv4(record.address))) {
      throw new BadRequestException('OIDC issuer hostname must resolve only to public IP addresses');
    }
  }

  private isEncryptedSecret(secret: unknown): boolean {
    return typeof secret === 'string' && secret.startsWith('enc:v1:');
  }

  private encryptionKey(): Buffer {
    const configured = String(this.config.get('SSO_SECRET_ENCRYPTION_KEY', '')).trim();
    if (!configured) {
      throw new InternalServerErrorException('SSO secret encryption is not configured');
    }
    const key = /^[0-9a-f]{64}$/i.test(configured)
      ? Buffer.from(configured, 'hex')
      : Buffer.from(configured, 'base64');
    if (key.length !== 32) {
      throw new InternalServerErrorException('SSO_SECRET_ENCRYPTION_KEY must encode exactly 32 bytes');
    }
    return key;
  }

  private encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
  }

  private decryptSecret(stored: unknown): string {
    if (!this.isEncryptedSecret(stored)) {
      throw new InternalServerErrorException('Legacy SSO secret must be re-entered; plaintext secrets are not accepted');
    }
    const [, version, ivValue, tagValue, ciphertextValue] = String(stored).split(':');
    if (version !== 'v1' || !ivValue || !tagValue || ciphertextValue === undefined) {
      throw new InternalServerErrorException('Stored SSO secret has an unsupported encryption format');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(ivValue, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException('Stored SSO secret cannot be decrypted with the configured key');
    }
  }

  private async oidcClient(): Promise<any> {
    this.oidcModulePromise ??= IMPORT_ESM('openid-client');
    return this.oidcModulePromise;
  }

  /**
   * The agent pins each connection to a DNS-resolved public IPv4 address. The
   * customFetch refuses redirects and bounds IdP response bodies, preventing
   * discovery/JWKS metadata from turning tenant configuration into an SSRF path.
   */
  private async safeOidcFetch(url: string, options: any): Promise<OidcFetchResponse> {
    const parsed = this.parseSafeHttpsUrl(url);
    const response = await undiciFetch(parsed, {
      ...options,
      dispatcher: this.oidcDispatcher,
      redirect: 'manual',
    } as any);
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error('OIDC endpoint redirects are not allowed');
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_IDP_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new Error('OIDC response exceeds the size limit');
    }
    if (!response.body) return response;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let result = await reader.read();
    while (!result.done) {
      const { value } = result;
      total += value.byteLength;
      if (total > MAX_IDP_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('OIDC response exceeds the size limit');
      }
      chunks.push(value);
      result = await reader.read();
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    return new UndiciResponse(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  private async discover(conn: any, oidc: any): Promise<any> {
    if (!conn?.issuer || !conn?.clientId || !conn?.clientSecret) {
      throw new BadRequestException('SSO issuer, client ID, and encrypted client secret must be configured');
    }
    const secret = this.decryptSecret(conn.clientSecret);
    const config = await oidc.discovery(
      new URL(conn.issuer),
      conn.clientId,
      { client_secret: secret },
      oidc.ClientSecretBasic(secret),
      {
        [oidc.customFetch]: (url: string, options: any) => this.safeOidcFetch(url, options),
        timeout: 5,
      },
    );
    const metadata = config.serverMetadata();
    if (!metadata.authorization_endpoint || !metadata.token_endpoint || !metadata.jwks_uri) {
      throw new UnauthorizedException('Identity provider discovery metadata is incomplete');
    }
    for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.jwks_uri, metadata.userinfo_endpoint]) {
      if (!endpoint) continue;
      const safeEndpoint = this.parseSafeHttpsUrl(endpoint);
      await this.assertPublicHostname(safeEndpoint.hostname);
    }
    const methods = metadata.token_endpoint_auth_methods_supported;
    if (Array.isArray(methods) && !methods.includes('client_secret_basic')) {
      throw new BadRequestException('The identity provider must support client_secret_basic authentication');
    }
    return config;
  }

  // ── Login discovery (public) ──────────────────────────────────────────────

  async lookupByEmail(rawEmail: string) {
    const parsedEmail = normalizeEmailAddress(rawEmail);
    if (!parsedEmail) return { sso: false };
    const conn = await (this.prisma as any).ssoConnection.findFirst({
      where: { enabled: true, allowedDomain: parsedEmail.domain },
      select: { companyId: true },
    });
    if (!conn) return { sso: false };
    return { sso: true, startUrl: `${this.apiBase()}/sso/${encodeURIComponent(conn.companyId)}/start` };
  }

  // ── Authorization-Code flow ───────────────────────────────────────────────

  async buildAuthorizeUrl(companyId: string): Promise<{ url: string; browserBinding: string }> {
    const conn = await (this.prisma as any).ssoConnection.findUnique({ where: { companyId } });
    if (!conn || !conn.enabled) throw new NotFoundException('SSO is not enabled for this workspace');

    const oidc = await this.oidcClient();
    const config = await this.discover(conn, oidc);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const browserBinding = randomBytes(32).toString('base64url');
    const stateRecord = {
      companyId,
      state,
      nonce,
      codeVerifier,
      browserBindingHash: sha256(browserBinding),
    };
    const stateWrite = await this.redis.set(
      `flowops:sso:state:${sha256(state)}`,
      JSON.stringify(stateRecord),
      'EX', STATE_TTL_SECONDS,
      'NX',
    );
    if (stateWrite !== 'OK') throw new InternalServerErrorException('Could not create an SSO login state');

    const scopes = this.normalizeScopes(conn.scopes || 'openid email profile');
    const redirect = oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUri(),
      scope: scopes,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return { url: redirect.href, browserBinding };
  }

  async handleCallback(code: string, state: string, browserBinding: string): Promise<string> {
    if (typeof code !== 'string' || !code.trim() || code.length > 4096 ||
        typeof state !== 'string' || !state.trim() || state.length > 2048) {
      throw new BadRequestException('Missing or invalid authorization code/state');
    }
    if (typeof browserBinding !== 'string' || browserBinding.length < 32 || browserBinding.length > 256) {
      throw new UnauthorizedException('SSO browser binding is missing or invalid');
    }

    const rawState = await this.redis.eval(
      CONSUME_BROWSER_BOUND_VALUE,
      1,
      `flowops:sso:state:${sha256(state)}`,
      sha256(browserBinding),
    );
    if (typeof rawState !== 'string' || !rawState) {
      throw new UnauthorizedException('SSO state is invalid, expired, already used, or not bound to this browser');
    }

    let saved: any;
    try {
      saved = JSON.parse(rawState);
    } catch {
      throw new UnauthorizedException('SSO state is invalid');
    }
    if (
      saved.state !== state ||
      typeof saved.companyId !== 'string' || !saved.companyId ||
      typeof saved.nonce !== 'string' || !saved.nonce ||
      typeof saved.codeVerifier !== 'string' || !saved.codeVerifier
    ) {
      throw new UnauthorizedException('SSO state is invalid');
    }

    const conn = await (this.prisma as any).ssoConnection.findUnique({ where: { companyId: saved.companyId } });
    if (!conn || !conn.enabled) throw new NotFoundException('SSO is not enabled for this workspace');

    const oidc = await this.oidcClient();
    const config = await this.discover(conn, oidc);
    const callbackUrl = new URL(this.redirectUri());
    callbackUrl.searchParams.set('code', code);
    callbackUrl.searchParams.set('state', state);

    let tokenResponse: any;
    try {
      tokenResponse = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: saved.codeVerifier,
        expectedState: saved.state,
        expectedNonce: saved.nonce,
        idTokenExpected: true,
      });
    } catch (error: any) {
      this.logger.warn(`OIDC authorization response rejected: ${error?.name ?? 'validation error'}`);
      throw new UnauthorizedException('Identity provider response failed OIDC validation');
    }

    const claims = tokenResponse.claims?.();
    const parsedEmail = normalizeEmailAddress(claims?.email);
    if (!claims?.sub || !parsedEmail || claims.email_verified !== true) {
      throw new UnauthorizedException('Identity provider must return a verified email and subject');
    }
    const { email, domain: emailDomain } = parsedEmail;
    if (conn.allowedDomain && emailDomain !== String(conn.allowedDomain).toLowerCase()) {
      throw new UnauthorizedException('The verified email domain is not permitted for this workspace');
    }

    const name = String(
      claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || email.split('@')[0],
    ).slice(0, 200);
    const user = await this.resolveUser(saved.companyId, email, name, conn);

    const finishCode = randomBytes(32).toString('base64url');
    const codeWrite = await this.redis.set(
      `flowops:sso:exchange:${sha256(finishCode)}`,
      JSON.stringify({ userId: user.id, companyId: saved.companyId, browserBindingHash: sha256(browserBinding) }),
      'EX', EXCHANGE_TTL_SECONDS,
      'NX',
    );
    if (codeWrite !== 'OK') throw new InternalServerErrorException('Could not create the one-time SSO exchange code');
    return `${this.appUrl()}/sso/finish?code=${encodeURIComponent(finishCode)}`;
  }

  async exchangeCode(code: string, browserBinding: string) {
    if (typeof code !== 'string' || !code.trim() || code.length > 256) {
      throw new BadRequestException('A valid one-time SSO exchange code is required');
    }
    if (typeof browserBinding !== 'string' || browserBinding.length < 32 || browserBinding.length > 256) {
      throw new UnauthorizedException('SSO browser binding is missing or invalid');
    }
    const rawExchange = await this.redis.eval(
      CONSUME_BROWSER_BOUND_VALUE,
      1,
      `flowops:sso:exchange:${sha256(code)}`,
      sha256(browserBinding),
    );
    if (typeof rawExchange !== 'string' || !rawExchange) {
      throw new UnauthorizedException('SSO exchange code is invalid, expired, already used, or not bound to this browser');
    }

    let exchange: any;
    try {
      exchange = JSON.parse(rawExchange);
    } catch {
      throw new UnauthorizedException('SSO exchange code is invalid');
    }
    if (typeof exchange.userId !== 'string' || !exchange.userId ||
        typeof exchange.companyId !== 'string' || !exchange.companyId) {
      throw new UnauthorizedException('SSO exchange code is invalid');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: exchange.userId, companyId: exchange.companyId },
      include: { company: { select: { id: true, name: true, isActive: true } } },
    });
    if (!user || !user.isActive || !user.company?.isActive) {
      throw new UnauthorizedException('Account is inactive or workspace suspended');
    }

    const tokens = await this.auth.issueTokensForUser(user);
    await (this.prisma as any).ssoConnection.update({
      where: { companyId: exchange.companyId },
      data: { lastLoginAt: new Date() },
    });
    return tokens;
  }

  /** Find the tenant user by verified email, or JIT-provision one when allowed. */
  private async resolveUser(companyId: string, email: string, name: string, conn: any) {
    let user = await this.prisma.user.findFirst({
      where: { email, companyId },
      include: { company: { select: { id: true, name: true, isActive: true } } },
    });

    if (user) {
      if (!user.isActive || !user.company.isActive) {
        throw new UnauthorizedException('Account is inactive or workspace suspended');
      }
      return user;
    }

    if (!conn.autoProvision) {
      throw new UnauthorizedException('No FlowOps account for this email and auto-provisioning is off');
    }

    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { isActive: true } });
    if (!company?.isActive) throw new UnauthorizedException('Workspace is suspended');

    const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
    user = await this.prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: (conn.defaultRole || 'AGENT') as any,
        companyId,
        emailVerified: true,
      },
      include: { company: { select: { id: true, name: true, isActive: true } } },
    });
    this.logger.log(`JIT-provisioned SSO user for company ${companyId}`);
    return user;
  }
}
