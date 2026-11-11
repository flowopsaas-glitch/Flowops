import { AlertingService } from './alerting.service';

/**
 * ALERTING — the platform-owner health engine.
 *
 * Every rule produces a draft with a dedupeKey, and `dedupeKey` is @unique.
 * evaluate() checks whether the key exists and then creates. That pair is not
 * atomic, and the loop that runs it is wrapped in a try/catch at the cron — so
 * a collision does not just fail one insert, it aborts the whole evaluation and
 * every draft after it is dropped until the next run six hours later.
 */

const COMPANY = 'co-1';
const OWNER = 'owner@flowops.test';

/** Two companies deactivated recently, so churnRule yields two drafts. */
function makeHarness(opts: { companies?: any[]; strictUnique?: boolean } = {}) {
  const companies = opts.companies ?? [
    { id: COMPANY, name: 'Acme', plan: 'starter', updatedAt: new Date(), isActive: false },
    { id: 'co-2', name: 'Beta', plan: 'pro', updatedAt: new Date(), isActive: false },
  ];

  const alerts: any[] = [];
  const emails: any[] = [];
  const auditRows: any[] = [];
  let seq = 0;

  const platformAlert = {
    findUnique: jest.fn(async ({ where }: any) => alerts.find((a) => a.dedupeKey === where.dedupeKey) ?? null),
    findMany: jest.fn(async ({ where }: any) =>
      alerts.filter((a) => (where?.resolved === undefined ? true : a.resolved === where.resolved)),
    ),
    // Enforces the @unique on dedupeKey, the way the database does.
    create: jest.fn(async ({ data }: any) => {
      if (alerts.some((a) => a.dedupeKey === data.dedupeKey)) {
        const err: any = new Error('Unique constraint failed on the fields: (`dedupeKey`)');
        err.code = 'P2002';
        throw err;
      }
      const row = { id: `alert-${++seq}`, resolved: false, ...data };
      alerts.push(row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const a = alerts.find((x) => x.id === where.id);
      if (!a) throw new Error('not found');
      Object.assign(a, data);
      return { ...a };
    }),
  };

  const prisma: any = {
    platformAlert,
    company: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.isActive === false) return companies;
        return companies;
      }),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    // The other rules (SLA spike, payment failures, trial expiry, integration
    // tokens) read these models. Returning empty is what keeps the churn rule
    // isolated: without them the rule set throws before it ever reaches it.
    payment: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0), aggregate: jest.fn(async () => ({ _sum: {}, _count: 0 })) },
    user: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    waybill: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0), groupBy: jest.fn(async () => []) },
    collection: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    // Reached through a cast, so it does not show up in a plain grep.
    integrationCredential: { findMany: jest.fn(async () => []) },
    __alerts: alerts,
  };

  const email: any = {
    sendOwnerAlert: jest.fn(async (_to: string, p: any) => {
      emails.push(p);
      return true;
    }),
  };
  const config: any = { get: jest.fn((k: string) => (k === 'OWNER_SEED_EMAIL' ? OWNER : undefined)) };
  const audit: any = { record: jest.fn(async (r: any) => { auditRows.push(r); return r; }) };

  return { prisma, email, config, audit, emails, alerts, svc: new AlertingService(prisma, email, config, audit) };
}

describe('AlertingService — a rule fires once, and a collision does not stop the rest', () => {
  it('creates one alert per churned tenant', async () => {
    const h = makeHarness();
    const out = await h.svc.evaluate();
    expect(out.created).toEqual(2);
    expect(h.prisma.__alerts).toHaveLength(2);
  });

  it('does not re-create an alert on a second evaluation', async () => {
    const h = makeHarness();
    await h.svc.evaluate();
    const second = await h.svc.evaluate();
    expect(second.created).toEqual(0);
    expect(h.prisma.__alerts).toHaveLength(2);
  });

  it('emails the owner once per new alert', async () => {
    const h = makeHarness();
    await h.svc.evaluate();
    expect(h.emails).toHaveLength(2);
    await h.svc.evaluate();
    expect(h.emails).toHaveLength(2);
  });

  it('still evaluates the remaining drafts when two runs collide', async () => {
    // FAILED BEFORE: `findUnique` then `create`, per draft, inside one loop.
    // Two overlapping runs both find nothing and both create; the loser throws
    // P2002, which escapes evaluate() — and because the cron swallows the
    // error, every draft after the collision is silently dropped until the
    // next run six hours later. The alert that mattered never fires.
    const h = makeHarness();
    const results = await Promise.all([h.svc.evaluate(), h.svc.evaluate()]);

    // Neither run may throw.
    expect(results.every((r: any) => typeof r.created === 'number')).toBe(true);

    // Both alerts must exist exactly once, whoever got there first.
    const keys = h.prisma.__alerts.map((a: any) => a.dedupeKey);
    expect(new Set(keys).size).toEqual(2);
    expect(keys).toHaveLength(2);
  });

  it('writes no duplicate dedupe keys under any interleaving', async () => {
    const h = makeHarness();
    await Promise.all([h.svc.evaluate(), h.svc.evaluate(), h.svc.evaluate()]);
    const keys = h.prisma.__alerts.map((a: any) => a.dedupeKey);
    expect(new Set(keys).size).toEqual(keys.length);
  });
});

describe('AlertingService — reading and resolving', () => {
  it('lists unresolved alerts by default', async () => {
    const h = makeHarness();
    await h.svc.evaluate();
    const out = await h.svc.list();
    expect(out.every((a: any) => a.resolved === false)).toBe(true);
    expect(out).toHaveLength(2);
  });

  it('resolves an alert', async () => {
    const h = makeHarness();
    await h.svc.evaluate();
    const id = h.prisma.__alerts[0].id;
    const out: any = await h.svc.resolve(id);
    expect(out.resolved).toBe(true);
    expect(out.resolvedAt).toBeInstanceOf(Date);
  });

  it('a resolved alert drops out of the default list', async () => {
    const h = makeHarness();
    await h.svc.evaluate();
    await h.svc.resolve(h.prisma.__alerts[0].id);
    const out = await h.svc.list();
    expect(out).toHaveLength(1);
  });

  it('can include resolved alerts', async () => {
    const h = makeHarness();
    await h.svc.evaluate();
    await h.svc.resolve(h.prisma.__alerts[0].id);
    const out = await h.svc.list(true);
    expect(out).toHaveLength(2);
  });

  it('records an audit entry per alert', async () => {
    const h = makeHarness();
    await h.svc.evaluate();
    expect(h.audit.record).toHaveBeenCalledTimes(2);
  });
});
