import { EsgService } from './esg.service';

/**
 * ESG — carbon reporting.
 *
 * Two defects in the same five lines, both about a value that is legitimately
 * zero being treated as absent:
 *
 *   1. EMISSION_FACTORS.truck (0.29) was declared and never read. Trucks were
 *      bucketed as diesel — correctly — but then charged the van's factor
 *      (0.21), so every figure a truck fleet produced was ~28% light.
 *      Under-reporting is the direction that matters in an emissions report.
 *
 *   2. `weightedFactor || 0.18` could not tell an absent fleet from an
 *      all-electric one. Both compute to 0; only the first should fall back.
 *      EMISSION_FACTORS.electric is declared as zero tailpipe, so an EV fleet
 *      reporting 0.18 kg/km contradicted the table it was computed from.
 *
 * Everything here was already tenant-scoped correctly, including the cron's
 * walk over active companies.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';

function makeHarness() {
  const drivers: any[] = [];
  const waybills: any[] = [];
  const reports: any[] = [];

  const prisma: any = {
    company: { findMany: jest.fn(async () => [{ id: COMPANY }, { id: VICTIM }]) },

    waybill: {
      count: jest.fn(async ({ where }: any) =>
        waybills.filter(
          (w) =>
            w.companyId === where.companyId &&
            w.status === where.status &&
            w.updatedAt >= where.updatedAt.gte &&
            w.updatedAt < where.updatedAt.lt,
        ).length,
      ),
    },

    driver: {
      groupBy: jest.fn(async ({ by, where }: any) => {
        const rows = drivers.filter((d) => d.companyId === where.companyId && d.isActive);
        const groups = new Map<string, number>();
        for (const d of rows) {
          const k = String(d[by[0]] ?? '');
          groups.set(k, (groups.get(k) ?? 0) + 1);
        }
        return [...groups.entries()].map(([k, n]) => ({ [by[0]]: k, _count: { _all: n } }));
      }),
    },

    carbonReport: {
      findUnique: jest.fn(async ({ where }: any) => {
        const w = where.companyId_period;
        return reports.find((r) => r.companyId === w.companyId && r.period === w.period) ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        reports.filter((r) => r.companyId === where.companyId && where.period.in.includes(r.period)),
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const w = where.companyId_period;
        const i = reports.findIndex((r) => r.companyId === w.companyId && r.period === w.period);
        if (i >= 0) {
          reports[i] = { ...reports[i], ...update };
          return { ...reports[i] };
        }
        const row = { id: `cr-${reports.length + 1}`, ...create };
        reports.push(row);
        return { ...row };
      }),
    },

    __drivers: drivers,
    __waybills: waybills,
    __reports: reports,
  };

  return { prisma, svc: new EsgService(prisma) };
}

const seedDriver = (h: any, vehicleType: string, over: any = {}) =>
  h.prisma.__drivers.push({ id: `d-${h.prisma.__drivers.length + 1}`, companyId: COMPANY, vehicleType, isActive: true, ...over });

const seedDelivered = (h: any, n: number, companyId = COMPANY) => {
  for (let i = 0; i < n; i++) {
    h.prisma.__waybills.push({ companyId, status: 'DELIVERED', updatedAt: new Date() });
  }
};

describe('EsgService — the emission factor actually used', () => {
  it('charges a truck fleet the truck factor, not the van factor', async () => {
    // FAILED BEFORE: EMISSION_FACTORS.truck (0.29) was dead code. Trucks landed
    // in `fleet.diesel` and were then multiplied by EMISSION_FACTORS.van
    // (0.21) — understating a truck fleet's emissions by roughly 28%.
    const h = makeHarness();
    seedDriver(h, 'Truck');
    seedDelivered(h, 10);

    const out: any = await h.svc.computeForCompany(COMPANY, '2026-11');

    expect(out.co2PerKm).toBeCloseTo(0.29, 10);
    expect(out.totalCo2Kg).toBeCloseTo(10 * 15 * 0.29, 6);
  });

  it('still charges a van fleet the van factor', async () => {
    const h = makeHarness();
    seedDriver(h, 'Van');
    seedDelivered(h, 10);

    const out: any = await h.svc.computeForCompany(COMPANY, '2026-11');

    expect(out.co2PerKm).toBeCloseTo(0.21, 10);
  });

  it('weights a mixed fleet across both factors', async () => {
    const h = makeHarness();
    seedDriver(h, 'Truck');
    seedDriver(h, 'Van');
    seedDelivered(h, 10);

    const out: any = await h.svc.computeForCompany(COMPANY, '2026-11');

    expect(out.co2PerKm).toBeCloseTo((0.29 + 0.21) / 2, 10);
  });

  it('reports trucks under dieselVehicles, as before', async () => {
    // The split is internal: trucks are diesel, so the report's fleet
    // breakdown must not change shape.
    const h = makeHarness();
    seedDriver(h, 'Truck');
    seedDelivered(h, 1);

    const out: any = await h.svc.computeForCompany(COMPANY, '2026-11');

    expect(out.dieselVehicles).toEqual(1);
  });
});

describe('EsgService — the zero fallback', () => {
  it('does not override a genuine zero from an all-electric fleet', async () => {
    // FAILED BEFORE: weightedFactor is 0 for an EV fleet, and `0 || 0.18`
    // fell through to the no-fleet fallback — reporting tailpipe emissions
    // for vehicles that have none.
    const h = makeHarness();
    seedDriver(h, 'Electric');
    seedDelivered(h, 10);

    const out: any = await h.svc.computeForCompany(COMPANY, '2026-11');

    expect(out.co2PerKm).toEqual(0);
    expect(out.totalCo2Kg).toEqual(0);
  });

  it('still falls back when there is no fleet at all', async () => {
    const h = makeHarness();
    seedDelivered(h, 10);

    const out: any = await h.svc.computeForCompany(COMPANY, '2026-11');

    expect(out.co2PerKm).toEqual(0.18);
  });
});

describe('EsgService — tenant scoping', () => {
  it('counts only the caller’s deliveries', async () => {
    const h = makeHarness();
    seedDelivered(h, 3, COMPANY);
    seedDelivered(h, 50, VICTIM);

    const out: any = await h.svc.computeForCompany(COMPANY, '2026-11');

    expect(out.totalDeliveries).toEqual(3);
  });

  it('uses only the caller’s fleet for the factor', async () => {
    const h = makeHarness();
    seedDriver(h, 'Van');
    seedDriver(h, 'Truck', { companyId: VICTIM });
    seedDelivered(h, 10);

    const out: any = await h.svc.computeForCompany(COMPANY, '2026-11');

    expect(out.co2PerKm).toBeCloseTo(0.21, 10);
  });

  it('reads the previous period within the same company', async () => {
    const h = makeHarness();
    h.prisma.__reports.push({ companyId: COMPANY, period: '2026-10', totalCo2Kg: 100 });
    h.prisma.__reports.push({ companyId: VICTIM, period: '2026-10', totalCo2Kg: 1 });

    const out: any = await h.svc.computeForCompany(COMPANY, '2026-11');

    expect(out.prevPeriodCo2Kg).toEqual(100);
  });

  it('computes on demand when a report is missing', async () => {
    const h = makeHarness();
    seedDriver(h, 'Van');
    seedDelivered(h, 2);

    const out: any = await h.svc.getReport(COMPANY, '2026-11');

    expect(out).toBeTruthy();
    expect(out.period).toEqual('2026-11');
  });
});

describe('EsgService — period arithmetic', () => {
  it('steps back across a year boundary', async () => {
    // January's previous period is the December before it. `new Date(y, -1, 1)`
    // rolls back correctly, but it is the kind of thing worth pinning.
    const h = makeHarness();
    h.prisma.__reports.push({ companyId: COMPANY, period: '2025-12', totalCo2Kg: 200 });

    const out: any = await h.svc.computeForCompany(COMPANY, '2026-01');

    expect(out.prevPeriodCo2Kg).toEqual(200);
  });

  it('returns six periods regardless of stored data', async () => {
    const h = makeHarness();
    const out: any = await h.svc.getTrends(COMPANY);
    expect(out).toHaveLength(6);
    expect(out.every((p: any) => typeof p.period === 'string')).toBe(true);
  });
});
