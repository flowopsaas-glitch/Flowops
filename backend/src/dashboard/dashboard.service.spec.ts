import { DashboardService } from './dashboard.service';

/**
 * DASHBOARD — the windowed trend series.
 *
 * Scoping and the KPI maths were already sound: every query filters on
 * companyId, and the KPI helper refuses to compute a delta unless BOTH windows
 * have data and the previous value is positive — the file even documents why
 * (comparing 0% against 0% reports a trend that does not exist). That is the
 * standard the rest of this module should be held to.
 *
 * The defect was in how the requested window size was interpreted.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';
const DAY = 86_400_000;

function makeHarness() {
  const waybills: any[] = [];
  const invoices: any[] = [];

  const prisma: any = {
    waybill: {
      // Two call shapes in getTrends: one filters on createdAt (new waybills),
      // one on updatedAt + status (status changes). Tell them apart by key.
      findMany: jest.fn(async ({ where }: any) => {
        if (where.createdAt) {
          return waybills
            .filter((w) => w.companyId === where.companyId && w.createdAt >= where.createdAt.gte)
            .map((w) => ({ createdAt: w.createdAt }));
        }
        return waybills
          .filter(
            (w) =>
              w.companyId === where.companyId &&
              w.updatedAt >= where.updatedAt.gte &&
              where.status.in.includes(w.status),
          )
          .map((w) => ({ status: w.status, updatedAt: w.updatedAt }));
      }),
    },
    invoice: {
      findMany: jest.fn(async ({ where }: any) =>
        invoices
          .filter((i) => i.companyId === where.companyId && i.createdAt >= where.createdAt.gte)
          .map((i) => ({ total: i.total, createdAt: i.createdAt })),
      ),
    },
    __waybills: waybills,
    __invoices: invoices,
  };

  // getTrends reads only prisma; kpiMath backs getMetrics (covered by the KPI
  // consistency suite) and is never touched on this path, so a bare stub is
  // honest here rather than a silent dependency.
  return { prisma, svc: new DashboardService(prisma as any, {} as any) };
}

const seedWaybill = (h: any, daysAgo: number, status = 'DELIVERED', companyId = COMPANY) => {
  const at = new Date(Date.now() - daysAgo * DAY);
  h.prisma.__waybills.push({ companyId, createdAt: at, updatedAt: at, status });
};

/** Number of day-buckets the service emitted. */
const seriesLength = async (h: any, days?: any) => {
  const out: any = await h.svc.getTrends(COMPANY, days);
  return out.series.length;
};

describe('DashboardService — the requested window is honoured', () => {
  it('clamps an explicit 0 to the minimum, not to the default', async () => {
    // FAILED BEFORE: `Math.floor(days) || 30` could not distinguish "0" from
    // "not supplied". Asking for 0 days silently returned a 30-day series.
    const h = makeHarness();
    expect(await seriesLength(h, 0)).toEqual(7); // the documented minimum
  });

  it('defaults to 30 when no window is given', async () => {
    const h = makeHarness();
    expect(await seriesLength(h)).toEqual(30);
  });

  it('falls back to 30 for a non-numeric window', async () => {
    const h = makeHarness();
    expect(await seriesLength(h, Number.NaN)).toEqual(30);
  });

  it('clamps below the minimum up to 7', async () => {
    const h = makeHarness();
    expect(await seriesLength(h, 3)).toEqual(7);
    expect(await seriesLength(h, -20)).toEqual(7);
  });

  it('clamps above the maximum down to 90', async () => {
    const h = makeHarness();
    expect(await seriesLength(h, 500)).toEqual(90);
  });

  it('honours an in-range window exactly', async () => {
    const h = makeHarness();
    expect(await seriesLength(h, 14)).toEqual(14);
  });

  it('accepts a numeric string, as the controller sends', async () => {
    // The controller does `days ? parseInt(days) : 30`, so a string can arrive
    // here. parseInt already yields a number, but pin the behaviour anyway.
    const h = makeHarness();
    expect(await seriesLength(h, '14' as any)).toEqual(14);
  });
});

describe('DashboardService — tenant scoping', () => {
  it('counts only the caller’s waybills', async () => {
    const h = makeHarness();
    for (let i = 0; i < 3; i++) seedWaybill(h, 1, 'DELIVERED', COMPANY);
    for (let i = 0; i < 40; i++) seedWaybill(h, 1, 'DELIVERED', VICTIM);

    const out: any = await h.svc.getTrends(COMPANY, 7);

    expect(out.series.reduce((s: number, b: any) => s + b.created, 0)).toEqual(3);
  });

  it('credits only the caller’s invoices as revenue', async () => {
    const h = makeHarness();
    h.prisma.__invoices.push({ companyId: COMPANY, total: 100, createdAt: new Date(Date.now() - DAY) });
    h.prisma.__invoices.push({ companyId: VICTIM, total: 9999, createdAt: new Date(Date.now() - DAY) });

    const out: any = await h.svc.getTrends(COMPANY, 7);

    expect(out.series.reduce((s: number, b: any) => s + b.revenue, 0)).toEqual(100);
  });

  it('splits delivered from exceptions', async () => {
    const h = makeHarness();
    seedWaybill(h, 1, 'DELIVERED');
    seedWaybill(h, 1, 'DELIVERED');
    seedWaybill(h, 1, 'FAILED_DELIVERY');

    const out: any = await h.svc.getTrends(COMPANY, 7);
    const totals = out.series.reduce(
      (acc: any, b: any) => ({ delivered: acc.delivered + b.delivered, exceptions: acc.exceptions + b.exceptions }),
      { delivered: 0, exceptions: 0 },
    );

    expect(totals).toEqual({ delivered: 2, exceptions: 1 });
  });
});
