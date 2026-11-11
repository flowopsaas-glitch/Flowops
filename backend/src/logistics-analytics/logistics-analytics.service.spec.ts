import { LogisticsAnalyticsService } from './logistics-analytics.service';

/**
 * LOGISTICS ANALYTICS — the paid KPI dashboard.
 *
 * Revenue and COD collected are Float columns holding rands. They are written
 * from SQL SUMs with no rounding, while the very next line rounds
 * costPerDelivery — so the module already knows money needs rounding and does it
 * in one place out of three.
 *
 * The AI insights block also returns whatever Groq sent, straight into a column
 * that gets rendered on the dashboard.
 */

const COMPANY = 'co-1';

function makePrisma(over: { revenueSum?: number; codSum?: number } = {}) {
  const stored: any[] = [];
  const tenants: string[] = [];
  const revenueSum = over.revenueSum ?? 0;
  const codSum = over.codSum ?? 0;

  const logisticsAnalytics = {
    findUnique: jest.fn(async ({ where }: any) => {
      const k = where?.companyId_period;
      return stored.find((s) => s.companyId === k?.companyId && s.period === k?.period) ?? null;
    }),
    findMany: jest.fn(async ({ where }: any) =>
      stored.filter((s) => s.companyId === where?.companyId && where.period.in.includes(s.period)),
    ),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const k = where.companyId_period;
      const i = stored.findIndex((s) => s.companyId === k.companyId && s.period === k.period);
      if (i >= 0) {
        stored[i] = { ...stored[i], ...update };
        return { ...stored[i] };
      }
      const row = { id: 'la-1', ...create };
      stored.push(row);
      return { ...row };
    }),
  };

  const model = (sum: number) => ({
    count: jest.fn(async () => 0),
    aggregate: jest.fn(async () => ({ _sum: { total: sum, codAmount: codSum }, _avg: { customerRating: null } })),
    findMany: jest.fn(async () => []),
    groupBy: jest.fn(async () => []),
  });

  const prisma: any = {
    logisticsAnalytics,
    waybill: model(revenueSum),
    invoice: model(revenueSum),
    driver: model(revenueSum),
    shipment: model(revenueSum),
    collection: model(revenueSum),
    withTenant: jest.fn(async (companyId: string, fn: any) => {
      tenants.push(companyId);
      return fn(prisma);
    }),
    __stored: stored,
    __tenants: tenants,
  };
  return prisma;
}

const build = (prisma: any, groqKey?: string) =>
  new LogisticsAnalyticsService(prisma, { get: jest.fn(() => groqKey) } as any);

describe('LogisticsAnalyticsService — money is rounded before it is stored', () => {
  it('does not store a float artefact in revenue', async () => {
    // FAILED BEFORE: `revenueAgg._sum.total || 0`, stored raw. A SQL SUM over
    // float rands comes back with binary-float noise — the same value that
    // broke digital-payments, arriving here as 3070.0000000000005.
    const prisma = makePrisma({ revenueSum: 0.1 + 0.2 });
    const out: any = await build(prisma).refreshAnalytics(COMPANY);

    expect(out.revenue).toEqual(0.3);
    expect(String(out.revenue)).not.toMatch(/\d{9,}/);
  });

  it('does not store a float artefact in COD collected', async () => {
    const prisma = makePrisma({ codSum: 0.1 + 0.2 });
    const out: any = await build(prisma).refreshAnalytics(COMPANY);

    expect(out.codCollected).toEqual(0.3);
    expect(String(out.codCollected)).not.toMatch(/\d{9,}/);
  });

  it('keeps revenue to whole cents', async () => {
    const prisma = makePrisma({ revenueSum: 1234.5678 });
    const out: any = await build(prisma).refreshAnalytics(COMPANY);
    expect(out.revenue).toEqual(1234.57);
  });

  it('rounds the sum of many small invoices rather than drifting', async () => {
    // 3 x 0.1 summed as floats is 0.30000000000000004.
    const prisma = makePrisma({ revenueSum: 0.1 + 0.1 + 0.1 });
    const out: any = await build(prisma).refreshAnalytics(COMPANY);
    expect(out.revenue).toEqual(0.3);
  });

  it('stores zero when there is no revenue in the period', async () => {
    const prisma = makePrisma({ revenueSum: 0 });
    const out: any = await build(prisma).refreshAnalytics(COMPANY);
    expect(out.revenue).toEqual(0);
  });
});

describe('LogisticsAnalyticsService — AI insights are validated', () => {
  const withGroq = (payload: any) => {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: json } }] }),
    }));
  };

  it('drops a non-object AI payload instead of storing it', async () => {
    withGroq('"just a string"');
    const prisma = makePrisma();
    const out: any = await build(prisma, 'key').refreshAnalytics(COMPANY);
    expect(out.aiInsights).toBeNull();
  });

  it('drops trends that are not an array of strings', async () => {
    // FAILED BEFORE: `return parsed` — whatever the model sent was stored and
    // rendered. An object where an array is expected blows up the dashboard.
    withGroq({ summary: 'ok', trends: { a: 1 }, recommendations: [] });
    const prisma = makePrisma();
    const out: any = await build(prisma, 'key').refreshAnalytics(COMPANY);
    expect(Array.isArray(out.aiInsights?.trends)).toBe(true);
  });

  it('keeps a well-formed payload', async () => {
    withGroq({ summary: 'On-time is up.', trends: ['Faster PODs'], recommendations: ['Add a driver'] });
    const prisma = makePrisma();
    const out: any = await build(prisma, 'key').refreshAnalytics(COMPANY);
    expect(out.aiInsights?.summary).toEqual('On-time is up.');
    expect(out.aiInsights?.trends).toEqual(['Faster PODs']);
  });

  it('does not call Groq when no key is configured', async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new Error('should not be called');
    });
    const prisma = makePrisma();
    const out: any = await build(prisma, undefined).refreshAnalytics(COMPANY);
    expect(out.aiInsights).toBeNull();
  });
});

describe('LogisticsAnalyticsService — tenant scoping', () => {
  it('reads only its own tenant’s snapshot', async () => {
    const prisma = makePrisma();
    prisma.__stored.push({ id: 'la-1', companyId: 'co-2', period: '2026-10', totalDeliveries: 99 });

    const out: any = await build(prisma).getAnalytics(COMPANY, '2026-10');

    expect(out.companyId).toEqual(COMPANY);
  });

  it('writes the snapshot under its own tenant', async () => {
    const prisma = makePrisma();
    await build(prisma).refreshAnalytics(COMPANY);
    expect(prisma.__stored.every((s: any) => s.companyId === COMPANY)).toBe(true);
  });

  it('reuses an existing snapshot instead of recomputing', async () => {
    const prisma = makePrisma();
    prisma.__stored.push({ id: 'la-1', companyId: COMPANY, period: '2026-10', totalDeliveries: 7 });

    const out: any = await build(prisma).getAnalytics(COMPANY, '2026-10');

    expect(out.totalDeliveries).toEqual(7);
    expect(prisma.logisticsAnalytics.upsert).not.toHaveBeenCalled();
  });
});
