import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { SsoService } from './sso.service';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('fake-hash') }));

const ENCRYPTION_KEY = '11'.repeat(32);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function makeHarness() {
  const entries = new Map<string, string>();
  const redis = {
    entries,
    set: jest.fn(async (key: string, value: string, ...options: any[]) => {
      if (options.includes('NX') && entries.has(key)) return null;
      entries.set(key, value);
      return 'OK';
    }),
    eval: jest.fn(async (_script: string, _keyCount: number, key: string, browserBindingHash: string) => {
      const raw = entries.get(key);
      if (!raw) return '';
      let decoded: any;
      try { decoded = JSON.parse(raw); } catch { entries.delete(key); return ''; }
      if (decoded.browserBindingHash !== browserBindingHash) return '';
      entries.delete(key);
      return raw;
    }),
  };
  const connection = {
    companyId: 'company-1',
    enabled: true,
    issuer: 'https://idp.example.net/tenant',
    clientId: 'client-1',
    clientSecret: 'unused-by-stubbed-discovery',
    scopes: 'openid email profile',
    allowedDomain: 'example.net',
    autoProvision: false,
    defaultRole: 'AGENT',
  };
  const prisma = {
    ssoConnection: {
      findUnique: jest.fn().mockResolvedValue(connection),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(async ({ where, create, update }: any) => ({
        ...create,
        ...update,
        companyId: where.companyId,
      })),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'person@example.net',
        isActive: true,
        company: { id: 'company-1', name: 'Acme', isActive: true },
      }),
      create: jest.fn(),
    },
    company: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'SSO_SECRET_ENCRYPTION_KEY') return ENCRYPTION_KEY;
      if (key === 'API_PUBLIC_URL') return 'https://api.flowop.work/api/v1';
      if (key === 'APP_URL') return 'https://app.flowop.work';
      return fallback;
    }),
  };
  const billing = { hasFeature: jest.fn().mockResolvedValue(true) };
  const auth = { issueTokensForUser: jest.fn().mockResolvedValue({ access_token: 'access', refresh_token: 'refresh' }) };
  const service = new SsoService(prisma as any, config as any, billing as any, auth as any, redis as any);
  return { service, prisma, config, billing, auth, redis, connection };
}

describe('SsoService hardening', () => {
  let current: ReturnType<typeof makeHarness> | undefined;

  afterEach(async () => {
    await current?.service.onModuleDestroy();
    current = undefined;
    jest.restoreAllMocks();
  });

  it('encrypts provider secrets at rest and never returns the secret to the caller', async () => {
    current = makeHarness();
    const { service, prisma } = current;

    const result = await service.upsertConfig('company-1', { clientSecret: ' provider-secret ' });
    const args = (prisma.ssoConnection.upsert as jest.Mock).mock.calls[0][0];
    const stored = args.create.clientSecret;

    expect(stored).toMatch(/^enc:v1:/);
    expect(stored).not.toContain('provider-secret');
    expect((service as any).decryptSecret(stored)).toBe('provider-secret');
    expect(result.clientSecretSet).toBe(true);
    expect(result).not.toHaveProperty('clientSecret');
  });

  it('clears a legacy plaintext secret on the next config write', async () => {
    current = makeHarness();
    const { service, prisma } = current;
    (prisma.ssoConnection.findUnique as jest.Mock).mockResolvedValue({
      ...current.connection,
      enabled: false,
      clientSecret: 'legacy-plaintext',
    });

    await service.upsertConfig('company-1', { enabled: false });
    const args = (prisma.ssoConnection.upsert as jest.Mock).mock.calls[0][0];

    expect(args.update.clientSecret).toBeNull();
  });

  it('rejects malformed booleans and custom endpoints before persisting config', async () => {
    current = makeHarness();
    const { service, prisma } = current;

    await expect(service.upsertConfig('company-1', { enabled: 'true' })).rejects.toThrow(BadRequestException);
    await expect(service.upsertConfig('company-1', { authUrl: 'https://attacker.example.net/token' }))
      .rejects.toThrow(BadRequestException);
    await expect(service.upsertConfig('company-1', { defaultRole: 'ADMIN' }))
      .rejects.toThrow(BadRequestException);
    await expect(service.upsertConfig('company-1', { defaultRole: 'COMPANY_ADMIN' }))
      .rejects.toThrow(BadRequestException);
    expect(prisma.ssoConnection.upsert).not.toHaveBeenCalled();
  });

  it('accepts a public HTTPS issuer and rejects private, malformed, or unsafe endpoints', () => {
    current = makeHarness();
    const parse = (current.service as any).parseSafeHttpsUrl.bind(current.service);

    expect(parse('https://login.example.net/tenant').hostname).toBe('login.example.net');
    for (const url of [
      'http://login.example.net',
      'https://user:secret@login.example.net',
      'https://127.0.0.1/metadata',
      'https://[::1]/metadata',
      'https://service.internal/metadata',
      'https://login.example.net:8443/metadata',
      'https://login.example.net/metadata?redirect=http://127.0.0.1',
    ]) {
      expect(() => parse(url)).toThrow(BadRequestException);
    }
  });

  it('fails closed when a legacy plaintext secret reaches OIDC discovery', async () => {
    current = makeHarness();
    const oidc = { discovery: jest.fn() };

    await expect((current.service as any).discover({
      issuer: 'https://idp.example.net',
      clientId: 'client-1',
      clientSecret: 'legacy-plaintext',
    }, oidc)).rejects.toThrow(InternalServerErrorException);
    expect(oidc.discovery).not.toHaveBeenCalled();
  });

  it('stores browser-bound PKCE state and exchanges only a one-time code, never bearer tokens in a URL', async () => {
    current = makeHarness();
    const { service, prisma, redis, auth } = current;
    const oidc = {
      customFetch: Symbol('customFetch'),
      randomState: jest.fn().mockReturnValue('state-value'),
      randomNonce: jest.fn().mockReturnValue('nonce-value'),
      randomPKCECodeVerifier: jest.fn().mockReturnValue('pkce-verifier'),
      calculatePKCECodeChallenge: jest.fn().mockResolvedValue('pkce-challenge'),
      buildAuthorizationUrl: jest.fn((_config: unknown, params: Record<string, string>) => {
        const url = new URL('https://idp.example.net/authorize');
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        return url;
      }),
      authorizationCodeGrant: jest.fn().mockResolvedValue({
        claims: () => ({
          sub: 'subject-1',
          email: 'person@example.net',
          email_verified: true,
          name: 'Person Example',
        }),
      }),
    };
    jest.spyOn(service as any, 'oidcClient').mockResolvedValue(oidc);
    jest.spyOn(service as any, 'discover').mockResolvedValue({ idp: true });
    jest.spyOn(service as any, 'resolveUser').mockResolvedValue({ id: 'user-1' });

    const { url, browserBinding } = await service.buildAuthorizeUrl('company-1');
    const stateKey = `flowops:sso:state:${hash('state-value')}`;
    const stateRecord = JSON.parse(redis.entries.get(stateKey)!);
    expect(url).toContain('pkce-challenge');
    expect(stateRecord).toMatchObject({
      companyId: 'company-1',
      state: 'state-value',
      nonce: 'nonce-value',
      codeVerifier: 'pkce-verifier',
      browserBindingHash: hash(browserBinding),
    });
    expect(redis.set).toHaveBeenCalledWith(stateKey, expect.any(String), 'EX', 300, 'NX');

    await expect(service.handleCallback('idp-code', 'state-value', 'x'.repeat(43)))
      .rejects.toThrow(UnauthorizedException);
    expect(redis.entries.has(stateKey)).toBe(true); // a different browser cannot burn the valid flow

    const finishUrl = await service.handleCallback('idp-code', 'state-value', browserBinding);
    const finish = new URL(finishUrl);
    const exchangeCode = finish.searchParams.get('code')!;
    expect(finish.pathname).toBe('/sso/finish');
    expect(finish.searchParams.has('access_token')).toBe(false);
    expect(finish.searchParams.has('refresh_token')).toBe(false);
    expect(oidc.authorizationCodeGrant).toHaveBeenCalledWith(
      { idp: true },
      expect.any(URL),
      expect.objectContaining({
        pkceCodeVerifier: 'pkce-verifier',
        expectedState: 'state-value',
        expectedNonce: 'nonce-value',
        idTokenExpected: true,
      }),
    );

    const exchanged = await service.exchangeCode(exchangeCode, browserBinding);
    expect(exchanged).toEqual({ access_token: 'access', refresh_token: 'refresh' });
    expect(auth.issueTokensForUser).toHaveBeenCalledTimes(1);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1', companyId: 'company-1' },
    }));
    await expect(service.exchangeCode(exchangeCode, browserBinding)).rejects.toThrow(UnauthorizedException);
  });

  it('does not provision or issue a session for an unverified OIDC email', async () => {
    current = makeHarness();
    const { service, prisma, redis } = current;
    const browserBinding = 'b'.repeat(43);
    const state = 'state-unverified';
    redis.entries.set(`flowops:sso:state:${hash(state)}`, JSON.stringify({
      companyId: 'company-1',
      state,
      nonce: 'nonce',
      codeVerifier: 'verifier',
      browserBindingHash: hash(browserBinding),
    }));
    const oidc = {
      customFetch: Symbol('customFetch'),
      authorizationCodeGrant: jest.fn().mockResolvedValue({
        claims: () => ({ sub: 'subject-1', email: 'person@example.net', email_verified: false }),
      }),
    };
    jest.spyOn(service as any, 'oidcClient').mockResolvedValue(oidc);
    jest.spyOn(service as any, 'discover').mockResolvedValue({ idp: true });

    await expect(service.handleCallback('idp-code', state, browserBinding)).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
