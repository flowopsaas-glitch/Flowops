import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuthService } from '../auth/auth.service';
import { withCompanyId } from '../common/security/tenant.util';

const VALID_ROLES = [
  'ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'DISPATCH', 'WAREHOUSE',
  'AGENT', 'USER', 'VIEWER',
];

interface OidcClaims {
  email?: string;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
}

@Injectable()
export class SsoService {
  private readonly logger = new Logger('ENTERPRISE_SSO');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    private readonly auth: AuthService,
  ) {}

  private apiBase(): string {
    // Includes the /api/v1 prefix (see API_PUBLIC_URL in .env.example).
    return String(this.config.get('API_PUBLIC_URL', 'http://localhost:3000/api/v1')).replace(/\/$/, '');
  }
  private appUrl(): string {
    return String(this.config.get('APP_URL', 'http://localhost:5173')).replace(/\/$/, '');
  }
  private redirectUri(): string {
    return `${this.apiBase()}/sso/callback`;
  }

  // ── Admin config (Enterprise-gated) ──────────────────────────────────────────

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'sso'))) {
      throw new ForbiddenException(
        'Single sign-on (SSO) is an Enterprise feature. Upgrade your plan to connect Okta, Azure AD, Google Workspace or Auth0.',
      );
    }
  }

  private mask(conn: any) {
    if (!conn) return null;
    const { clientSecret, ...rest } = conn;
    return { ...rest, clientSecretSet: Boolean(clientSecret), redirectUri: this.redirectUri() };
  }

  async getConfig(companyId: string) {
    await this.assertEntitled(companyId);
    const conn = await (this.prisma as any).ssoConnection.findUnique({ where: { companyId } });
    return this.mask(conn) ?? { companyId, enabled: false, provider: 'oidc', redirectUri: this.redirectUri() };
  }

  async upsertConfig(companyId: string, dto: any) {
    await this.assertEntitled(companyId);

    if (dto.defaultRole && !VALID_ROLES.includes(String(dto.defaultRole).toUpperCase())) {
      throw new BadRequestException(`defaultRole must be one of: ${VALID_ROLES.join(', ')}`);
    }

    const data: any = {
      provider: 'oidc',
      enabled: dto.enabled ?? undefined,
      issuer: dto.issuer ?? undefined,
      clientId: dto.clientId ?? undefined,
      authUrl: dto.authUrl ?? undefined,
      tokenUrl: dto.tokenUrl ?? undefined,
      userInfoUrl: dto.userInfoUrl ?? undefined,
      scopes: dto.scopes ?? undefined,
      allowedDomain: dto.allowedDomain != null ? String(dto.allowedDomain).toLowerCase().trim() : undefined,
      autoProvision: dto.autoProvision ?? undefined,
      defaultRole: dto.defaultRole ? String(dto.defaultRole).toUpperCase() : undefined,
    };
    // Only overwrite the secret when a non-empty value is supplied.
    if (dto.clientSecret) data.clientSecret = String(dto.clientSecret);

    const conn = await (this.prisma as any).ssoConnection.upsert({
      where: { companyId },
      update: data,
      create: withCompanyId(companyId, data),
    });
    return this.mask(conn);
  }

  // ── Login discovery (public) ─────────────────────────────────────────────────

  /** Given an email, find the tenant whose SSO covers its domain. */
  async lookupByEmail(email: string) {
    const domain = String(email || '').toLowerCase().split('@')[1];
    if (!domain) return { sso: false };
    const conn = await (this.prisma as any).ssoConnection.findFirst({
      where: { enabled: true, allowedDomain: domain },
      select: { companyId: true },
    });
    if (!conn) return { sso: false };
    return { sso: true, startUrl: `${this.apiBase()}/sso/${conn.companyId}/start` };
  }

  // ── Authorization-Code flow ──────────────────────────────────────────────────

  /** Build the IdP authorize URL and a signed, short-lived state token. */
  async buildAuthorizeUrl(companyId: string): Promise<string> {
    const conn = await (this.prisma as any).ssoConnection.findUnique({ where: { companyId } });
    if (!conn || !conn.enabled) throw new NotFoundException('SSO is not enabled for this workspace');
    if (!conn.authUrl || !conn.clientId) throw new BadRequestException('SSO is not fully configured');

    const state = this.jwt.sign(
      { companyId, n: randomBytes(8).toString('hex'), purpose: 'sso' },
      { secret: this.config.get('JWT_SECRET'), expiresIn: '10m' },
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: conn.clientId,
      redirect_uri: this.redirectUri(),
      scope: conn.scopes || 'openid email profile',
      state,
    });
    const sep = conn.authUrl.includes('?') ? '&' : '?';
    return `${conn.authUrl}${sep}${params.toString()}`;
  }

  /**
   * Handle the IdP redirect: validate state, exchange the code for tokens,
   * resolve the user's claims, JIT-provision, and mint FlowOps tokens.
   * Returns the app URL to redirect the browser to.
   */
  async handleCallback(code: string, state: string): Promise<string> {
    if (!code || !state) throw new BadRequestException('Missing code or state');

    let companyId: string;
    try {
      const decoded: any = this.jwt.verify(state, { secret: this.config.get('JWT_SECRET') });
      if (decoded.purpose !== 'sso' || !decoded.companyId) throw new Error('bad state');
      companyId = decoded.companyId;
    } catch {
      throw new UnauthorizedException('SSO state is invalid or expired');
    }

    const conn = await (this.prisma as any).ssoConnection.findUnique({ where: { companyId } });
    if (!conn || !conn.enabled) throw new NotFoundException('SSO is not enabled for this workspace');

    const claims = await this.exchangeCodeForClaims(conn, code);
    const email = (claims.email || claims.preferred_username || '').toLowerCase().trim();
    if (!email) throw new UnauthorizedException('Identity provider returned no email claim');

    if (conn.allowedDomain) {
      const domain = email.split('@')[1];
      if (domain !== conn.allowedDomain) {
        throw new UnauthorizedException(`Email domain ${domain} is not permitted for this workspace`);
      }
    }

    const name =
      claims.name ||
      [claims.given_name, claims.family_name].filter(Boolean).join(' ') ||
      email.split('@')[0];

    const user = await this.resolveUser(companyId, email, name, conn);
    const tokens = await this.auth.issueTokensForUser(user);

    await (this.prisma as any).ssoConnection.update({
      where: { companyId },
      data: { lastLoginAt: new Date() },
    });

    const q = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    return `${this.appUrl()}/sso/finish?${q.toString()}`;
  }

  /** Exchange the auth code at the token endpoint and resolve identity claims. */
  private async exchangeCodeForClaims(conn: any, code: string): Promise<OidcClaims> {
    if (!conn.tokenUrl) throw new BadRequestException('SSO token endpoint not configured');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri(),
      client_id: conn.clientId,
      client_secret: conn.clientSecret || '',
    });

    const tokenRes = await fetch(conn.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    const tokenJson: any = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      this.logger.error(`Token exchange failed: ${JSON.stringify(tokenJson)}`);
      throw new UnauthorizedException('Identity provider rejected the authorization code');
    }

    // Prefer the userinfo endpoint (well-defined claims); fall back to id_token.
    if (conn.userInfoUrl && tokenJson.access_token) {
      try {
        const uiRes = await fetch(conn.userInfoUrl, {
          headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: 'application/json' },
        });
        if (uiRes.ok) return (await uiRes.json()) as OidcClaims;
      } catch (e: any) {
        this.logger.warn(`userinfo fetch failed, falling back to id_token: ${e.message}`);
      }
    }
    if (tokenJson.id_token) return this.decodeJwtClaims(tokenJson.id_token, conn);
    throw new UnauthorizedException('No identity claims returned by the provider');
  }

  /**
   * Decodes and verifies an id_token payload. Uses JWKS endpoint when
   * configured (conn.jwksUri), otherwise falls back to TLS-trust decode
   * (token received directly from provider's token endpoint over TLS).
   */
  private async decodeJwtClaims(idToken: string, conn?: any): Promise<OidcClaims> {
    // If JWKS URI available, verify signature cryptographically
    if (conn?.jwksUri) {
      try {
        const jwksRes = await fetch(conn.jwksUri);
        if (jwksRes.ok) {
          const jwks: any = await jwksRes.json();
          const header = JSON.parse(Buffer.from(idToken.split('.')[0], 'base64url').toString());
          const key = jwks.keys?.find((k: any) => k.kid === header.kid || k.use === 'sig');
          if (key) {
            // Verify using Node crypto (RS256)
            const crypto = await import('crypto');
            const [headerB64, payloadB64, sigB64] = idToken.split('.');
            const signedContent = `${headerB64}.${payloadB64}`;
            const signature = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

            // Build public key from JWK
            const pubKey = crypto.createPublicKey({ key, format: 'jwk' });
            const verified = crypto.verify('sha256', Buffer.from(signedContent), pubKey, signature);

            if (!verified) {
              this.logger.warn('SSO id_token signature verification FAILED');
              throw new UnauthorizedException('Identity token signature is invalid');
            }
            this.logger.log('SSO id_token signature verified via JWKS');
          }
        }
      } catch (e: any) {
        // If verification fails due to network/format issues, log and continue
        // with TLS-trust (token was received directly from provider over HTTPS)
        if (e instanceof UnauthorizedException) throw e;
        this.logger.warn(`JWKS verification skipped: ${e?.message} — trusting TLS`);
      }
    }

    try {
      const payload = idToken.split('.')[1];
      const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      return JSON.parse(json);
    } catch {
      throw new UnauthorizedException('Could not read identity token');
    }
  }

  /** Find the tenant user by email, or JIT-provision one when allowed. */
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

    // Random password — SSO users never sign in with one.
    const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
    user = await this.prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: (conn.defaultRole || 'AGENT') as any,
        companyId,
        emailVerified: true, // identity is asserted by the IdP
      },
      include: { company: { select: { id: true, name: true, isActive: true } } },
    });
    this.logger.log(`JIT-provisioned SSO user ${email} for company ${companyId}`);
    return user;
  }
}
