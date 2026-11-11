import { createHmac } from 'crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountingIntegrationsService } from './accounting-integrations.service';

/**
 * ACCOUNTING INTEGRATIONS — the paid AI Accounting Bridge (Xero / Sage / Pastel).
 *
 * The OAuth callback is the interesting surface: it is a public browser
 * redirect with no JWT, so the signed `state` is the only thing carrying which
 * company this connection belongs to. That makes the key it is signed with
 * load-bearing — and it falls back to an empty string.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';
const SECRET = 'real-jwt-secret';

const sign = (payloadObj: any, secret: string) => {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
};

function makeHarness(opts: { jwtSecret?: string; entitled?: boolean } = {}) {
  const jwtSecret = opts.jwtSecret ?? SECRET;
  const entitled = opts.entitled ?? true;

  const conns: any[] = [];
  const logs: any[] = [];

  const accountingConnection = {
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const k = where.companyId_provider;
      const found = conns.find((c) => c.companyId === k.companyId && c.provider === k.provider);
      if (found) {
        Object.assign(found, update);
        return { ...found };
      }
      const row = { id: `conn-${conns.length + 1}`, ...create };
      conns.push(row);
      return { ...row };
    }),
    findMany: jest.fn(async ({ where }: any) => conns.filter((c) => c.companyId === where.companyId)),
    findFirst: jest.fn(
      async ({ where }: any) => conns.find((c) => c.id === where.id && c.companyId === where.companyId) ?? null,
    ),
    findUniqueOrThrow: jest.fn(async ({ where }: any) => {
      const c = conns.find((x) => x.id === where.id);
      if (!c) throw new Error('not found');
      return { ...c };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const c = conns.find((x) => x.id === where.id);
      if (!c) throw new Error('not found');
      Object.assign(c, data);
      return { ...c };
    }),
  };

  const prisma: any = {
    accountingConnection,
    accountingSyncLog: {
      create: jest.fn(async ({ data }: any) => {
        logs.push(data);
        return { ...data };
      }),
      findMany: jest.fn(async ({ where }: any) => logs.filter((l) => l.companyId === where.companyId)),
    },
    invoice: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    creditNote: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    __conns: conns,
    __logs: logs,
  };

  const config: any = {
    get: jest.fn((k: string, d?: any) => {
      if (k === 'JWT_SECRET') return jwtSecret;
      if (k === 'APP_URL') return 'https://app.flowop.work';
      return d;
    }),
  };

  const billing: any = { hasFeature: jest.fn(async () => entitled) };

  const oauthProvider: any = {
    name: 'Xero',
    usesOAuth: true,
    isConfigured: () => true,
    getAuthUrl: (state: string) => `https://login.xero.com/authorize?state=${state}`,
    exchangeCode: jest.fn(async (code: string) => ({
      accessToken: `at-${code}`,
      refreshToken: 'rt-1',
      expiresInSec: 1800,
      tenantId: 'tenant-1',
      tenantName: 'Attacker Ledger',
    })),
    pushInvoice: jest.fn(async () => ({ externalId: 'ext-1' })),
    pushCreditNote: jest.fn(async () => ({ externalId: 'ext-1' })),
  };

  const fileProvider: any = {
    name: 'Pastel',
    usesOAuth: false,
    isConfigured: () => true,
    pushInvoice: jest.fn(async () => ({ externalId: 'ext-1' })),
    pushCreditNote: jest.fn(async () => ({ externalId: 'ext-1' })),
  };

  return {
    prisma,
    config,
    billing,
    oauthProvider,
    fileProvider,
    svc: new AccountingIntegrationsService(prisma, config, billing, oauthProvider, oauthProvider, fileProvider),
  };
}

describe('AccountingIntegrationsService — the OAuth state is the only tenant proof', () => {
  it('accepts a correctly signed callback', async () => {
    const h = makeHarness();
    const state = sign({ companyId: COMPANY, provider: 'XERO', ts: Date.now() }, SECRET);
    const out = await h.svc.handleCallback('code-1', state);
    expect(out).toContain('integration=connected');
    expect(h.prisma.__conns[0].companyId).toEqual(COMPANY);
  });

  it('rejects a state whose signature does not match', async () => {
    const h = makeHarness();
    const state = sign({ companyId: COMPANY, provider: 'XERO', ts: Date.now() }, 'wrong-secret');
    const out = await h.svc.handleCallback('code-1', state);
    expect(out).toContain('reason=bad_state');
    expect(h.prisma.__conns).toHaveLength(0);
  });

  it('rejects a state older than the 15-minute window', async () => {
    const h = makeHarness();
    const state = sign({ companyId: COMPANY, provider: 'XERO', ts: Date.now() - 16 * 60 * 1000 }, SECRET);
    const out = await h.svc.handleCallback('code-1', state);
    expect(out).toContain('reason=bad_state');
  });

  it('refuses a state forged with the empty key when no secret is configured', async () => {
    // FAILED BEFORE: `config.get('JWT_SECRET') || ''`. With the variable unset the
    // signing key is the empty string, and HMAC-SHA256 with an empty key is
    // something anyone can compute. So an attacker can mint a state naming any
    // company they like, pair it with an OAuth code from their own Xero account,
    // and land a connection inside the victim's tenant pointing at the
    // attacker's ledger — every invoice the victim syncs then arrives on the
    // attacker's side. This is the second time this audit has found a secret
    // falling back to a blank and the check failing open; see whatsapp.
    const h = makeHarness({ jwtSecret: '' });
    const forged = sign({ companyId: VICTIM, provider: 'XERO', ts: Date.now() }, '');

    const out = await h.svc.handleCallback('attacker-code', forged);

    expect(out).toContain('bad_state');
    expect(h.prisma.__conns).toHaveLength(0);
  });

  it('never accepts an unsigned or malformed state', async () => {
    const h = makeHarness();
    for (const state of ['', 'payload-only', '.', 'a.b']) {
      expect(await h.svc.handleCallback('code-1', state)).toContain('bad_state');
    }
  });
});

describe('AccountingIntegrationsService — the paid gate', () => {
  it('refuses to list connections for a tenant without the feature', async () => {
    const h = makeHarness({ entitled: false });
    await expect(h.svc.listConnections(COMPANY)).rejects.toThrow(ForbiddenException);
  });

  it('refuses to sync an invoice for a tenant without the feature', async () => {
    const h = makeHarness({ entitled: false });
    await expect(h.svc.syncInvoice(COMPANY, 'inv-1')).rejects.toThrow(ForbiddenException);
  });

  it('refuses to export for a tenant without the feature', async () => {
    const h = makeHarness({ entitled: false });
    await expect(h.svc.exportPastel(COMPANY, {})).rejects.toThrow(ForbiddenException);
  });

  it('refuses to reconcile for a tenant without the feature', async () => {
    const h = makeHarness({ entitled: false });
    await expect(h.svc.reconcile(COMPANY)).rejects.toThrow(ForbiddenException);
  });
});

describe('AccountingIntegrationsService — tenant scoping and secret handling', () => {
  it('disconnect cannot touch another tenant’s connection', async () => {
    const h = makeHarness();
    h.prisma.__conns.push({ id: 'conn-1', companyId: VICTIM, provider: 'XERO', status: 'CONNECTED' });
    await expect(h.svc.disconnect('conn-1', COMPANY)).rejects.toThrow(NotFoundException);
    expect(h.prisma.__conns[0].status).toEqual('CONNECTED');
  });

  it('syncInvoice cannot push another tenant’s invoice', async () => {
    const h = makeHarness();
    await expect(h.svc.syncInvoice(COMPANY, 'inv-other')).rejects.toThrow(NotFoundException);
  });

  it('listConnections never returns tokens', async () => {
    // The tokens sit in a plaintext column (flagged separately, needs a
    // migration). What must hold today is that no read path hands them to a
    // caller — listConnections projects them away.
    const h = makeHarness();
    h.prisma.__conns.push({
      id: 'conn-1', companyId: COMPANY, provider: 'XERO', status: 'CONNECTED',
      accessToken: 'at-secret', refreshToken: 'rt-secret',
    });
    const out = await h.svc.listConnections(COMPANY);
    expect(JSON.stringify(out)).not.toContain('at-secret');
    expect(JSON.stringify(out)).not.toContain('rt-secret');
  });

  it('clears stored tokens on disconnect', async () => {
    const h = makeHarness();
    h.prisma.__conns.push({
      id: 'conn-1', companyId: COMPANY, provider: 'XERO', status: 'CONNECTED',
      accessToken: 'at-secret', refreshToken: 'rt-secret',
    });
    await h.svc.disconnect('conn-1', COMPANY);
    expect(h.prisma.__conns[0].accessToken).toBeNull();
    expect(h.prisma.__conns[0].refreshToken).toBeNull();
  });
});
