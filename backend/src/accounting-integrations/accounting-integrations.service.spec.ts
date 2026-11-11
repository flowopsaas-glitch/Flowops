import { createHmac } from 'crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IntegrationCryptoService } from '../integrations/integration-crypto.service';
import { AccountingIntegrationsService } from './accounting-integrations.service';
import { decodeEnvelope, encodeEnvelope, isSealedToken } from './accounting-token-cipher';

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

// A real 32-byte key, so the crypto service is genuinely configured in these
// tests rather than silently running in its unconfigured state.
const ENC_KEY = '6v2oaLkUu87Wri63V41iaojKoE3vvJqqad+Re1f2IMM=';

const makeConfig = (jwtSecret: string, encKey: string) =>
  ({
    get: jest.fn((k: string, d?: any) => {
      if (k === 'JWT_SECRET') return jwtSecret;
      if (k === 'APP_URL') return 'https://app.flowop.work';
      if (k === 'INTEGRATIONS_ENC_KEY') return encKey;
      return d;
    }),
  } as any);

const sealer = new IntegrationCryptoService(makeConfig(SECRET, ENC_KEY));

const sign = (payloadObj: any, secret: string) => {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
};

function makeHarness(opts: { jwtSecret?: string; entitled?: boolean; encKey?: string; invoice?: any } = {}) {
  const jwtSecret = opts.jwtSecret ?? SECRET;
  const entitled = opts.entitled ?? true;
  const encKey = opts.encKey === undefined ? ENC_KEY : opts.encKey;

  const conns: any[] = [];
  const logs: any[] = [];
  const received: any[] = [];

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
    updateMany: jest.fn(async ({ where, data }: any) => {
      // A `where` clause is a conjunction — match every term present, not a
      // hardcoded id+companyId pair, so a call scoped by withTenant (id only)
      // and one scoped explicitly (id + companyId) both behave correctly.
      const c = conns.find((x) => Object.entries(where).every(([k, v]) => x[k] === v));
      if (!c) return { count: 0 };
      Object.assign(c, data);
      return { count: 1 };
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
    invoice: { findFirst: jest.fn(async () => opts.invoice ?? null), findMany: jest.fn(async () => []) },
    creditNote: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    // The real service scopes the re-seal write with withTenant; the fake just
    // hands the delegate back the same client.
    withTenant: jest.fn(async (_cid: string, fn: any) => fn(prisma)),
    __conns: conns,
    __logs: logs,
  };

  const config: any = makeConfig(jwtSecret, encKey);
  const crypto: any = new IntegrationCryptoService(makeConfig(jwtSecret, encKey));

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
    pushInvoice: jest.fn(async (pc: any) => {
      // Mirrors the real provider, which refuses to call out without a token.
      if (!pc.accessToken) throw new Error('Xero connection is missing an access token.');
      received.push(pc);
      return { externalId: 'ext-1' };
    }),
    pushCreditNote: jest.fn(async () => ({ externalId: 'ext-1' })),
    refresh: jest.fn(async (rt: string) => ({
      accessToken: `at-refreshed-from-${rt}`,
      refreshToken: `rt-rotated-from-${rt}`,
      expiresInSec: 1800,
    })),
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
    received,
    svc: new AccountingIntegrationsService(prisma, config, billing, oauthProvider, oauthProvider, fileProvider, crypto),
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
    // Tokens are now encrypted at rest (see the suite below). What must also
    // hold is that no read path hands them to a caller — listConnections
    // projects them away.
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

describe('AccountingIntegrationsService — OAuth tokens at rest', () => {
  const INVOICE: any = {
    id: 'inv-1', invoiceNumber: 'INV-1', clientName: 'Acme', clientEmail: 'a@b.co',
    createdAt: new Date(), dueDate: new Date(), subtotal: 100, tax: 15, total: 115,
    items: [{ description: 'Freight', quantity: 1, unitPrice: 100 }],
  };

  const seal = (plain: string) => encodeEnvelope(sealer.encrypt(plain));

  const futureConn = (over: any = {}) => ({
    id: 'conn-1', companyId: COMPANY, provider: 'XERO', status: 'CONNECTED',
    accessToken: seal('at-live'), refreshToken: seal('rt-live'),
    tokenExpiresAt: new Date(Date.now() + 3_600_000),
    ...over,
  });

  it('writes no clear token when the OAuth callback completes', async () => {
    const h = makeHarness();
    const state = sign({ companyId: COMPANY, provider: 'XERO', ts: Date.now() }, SECRET);
    await h.svc.handleCallback('code-1', state);

    const row = h.prisma.__conns[0];
    // FAILED BEFORE: accessToken and refreshToken went straight from the
    // provider's token response into a @db.Text column. Anything that can read
    // the database — a backup, a replica, a support dump, a SQL injection that
    // only selects — holds a live credential for that customer's ledger.
    expect(row.accessToken).not.toContain('at-code-1');
    expect(row.refreshToken).not.toContain('rt-1');
    expect(isSealedToken(row.accessToken)).toBe(true);
    expect(isSealedToken(row.refreshToken)).toBe(true);
  });

  it('hands the provider the real token, not the sealed one', async () => {
    const h = makeHarness({ invoice: INVOICE });
    h.prisma.__conns.push(futureConn());

    await h.svc.syncInvoice(COMPANY, 'inv-1');

    expect(h.received).toHaveLength(1);
    expect(h.received[0].accessToken).toEqual('at-live');
    expect(h.received[0].refreshToken).toEqual('rt-live');
  });

  it('still syncs a row written before encryption existed, and re-seals it', async () => {
    const h = makeHarness({ invoice: INVOICE });
    h.prisma.__conns.push(futureConn({ accessToken: 'at-legacy', refreshToken: 'rt-legacy' }));

    await h.svc.syncInvoice(COMPANY, 'inv-1');

    // The connection keeps working — nobody has to re-authorise their ledger.
    expect(h.received[0].accessToken).toEqual('at-legacy');
    // And the clear token is gone after the first read, so rows that are never
    // used are the only ones left holding plaintext.
    const row = h.prisma.__conns[0];
    expect(isSealedToken(row.accessToken)).toBe(true);
    expect(sealer.decrypt(decodeEnvelope(row.accessToken))).toEqual('at-legacy');
  });

  it('re-seals the rotated tokens after a refresh', async () => {
    const h = makeHarness({ invoice: INVOICE });
    h.prisma.__conns.push(futureConn({ tokenExpiresAt: new Date(Date.now() - 1_000) }));

    await h.svc.syncInvoice(COMPANY, 'inv-1');

    const row = h.prisma.__conns[0];
    expect(h.received[0].accessToken).toEqual('at-refreshed-from-rt-live');
    expect(row.accessToken).not.toContain('at-refreshed-from-rt-live');
    expect(sealer.decrypt(decodeEnvelope(row.accessToken))).toEqual('at-refreshed-from-rt-live');
    expect(sealer.decrypt(decodeEnvelope(row.refreshToken))).toEqual('rt-rotated-from-rt-live');
  });

  it('refuses to store a clear token when no encryption key is configured', async () => {
    const h = makeHarness({ encKey: '' });
    const state = sign({ companyId: COMPANY, provider: 'XERO', ts: Date.now() }, SECRET);

    const out = await h.svc.handleCallback('code-1', state);

    // Fail closed. A connection holding a clear token is worse than no
    // connection, so the callback reports the error and writes nothing.
    expect(out).toContain('integration=error');
    expect(h.prisma.__conns).toHaveLength(0);
  });

  it('never turns a tampered envelope into a usable credential', async () => {
    const h = makeHarness({ invoice: INVOICE });
    const [v, iv, authTag, ct] = seal('at-live').split('.');
    const tampered = [v, iv, authTag, (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1)].join('.');

    h.prisma.__conns.push(futureConn({ accessToken: tampered }));

    const out: any = await h.svc.syncInvoice(COMPANY, 'inv-1');

    expect(out.results[0].status).toEqual('FAILED');
    expect(h.received).toHaveLength(0);
  });
});
