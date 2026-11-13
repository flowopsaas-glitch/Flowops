import { ProfitabilitySnapshotService } from './profitability-snapshot.service';

/**
 * Period snapshots — the history that lets a lane be judged as improving or
 * declining rather than only as profitable or not.
 *
 * The live endpoints recompute from source on every request, so they can say
 * what a lane earned but never whether that is better than last month. These
 * tests pin the part that history adds: deltas against the prior period, the
 * shape of "no history yet", and the rule that nothing is invented to fill a
 * gap.
 */

const COMPANY = 'cmp-a';
const PERIOD = '2026-11';
const PRIOR = '2026-10';

const CFG = {
  fuelCostPerKm: 2.5,
  driverHourlyCost: 45,
  vehicleCostPerKm: 1.8,
  overheadPerDelivery: 15,
  avgDeliveryMinutes: 25,
  avgKmPerDelivery: 12,
  targetMarginPct: 35,
  minMarginPct: 15,
};

const lane = (over: Record<string, unknown> = {}) => ({
  fromZone: 'Johannesburg',
  toZone: 'Gaborone',
  deliveries: 10,
  measuredDeliveries: 10,
  coveragePct: 100,
  revenue: 10_000,
  measuredRevenue: 10_000,
  measuredCost: 6000,
  grossProfit: 4000,
  marginPct: 40,
  basis: 'MEASURED',
  signal: 'OPTIMAL',
  ...over,
});

const client = (over: Record<string, unknown> = {}) => ({
  clientName: 'Acme',
  revenue: 10_000,
  invoiceCount: 2,
  deliveryCount: 10,
  measuredDeliveries: 10,
  coveragePct: 100,
  measuredCost: 6000,
  estimatedCost: 0,
  grossProfit: 4000,
  marginPct: 40,
  avgRevenuePerDel: 1000,
  avgDaysToPay: 30,
  collectionRate: 100,
  overdueAmount: 0,
  health: 'PROFITABLE',
  basis: 'MEASURED',
  profitRank: 0,
  ...over,
});

/**
 * In-memory Prisma. Upserts are keyed on the compound unique so a second
 * materialise overwrites rather than duplicating — that is the property the
 * idempotence test asserts.
 */
function makePrisma(seedLanes: any[] = [], seedClients: any[] = []) {
  const laneRows = new Map<string, any>();
  const clientRows = new Map<string, any>();
  for (const r of seedLanes) {
    laneRows.set(`${r.companyId}|${r.period}|${r.fromZone}|${r.toZone}`, { ...r });
  }
  for (const r of seedClients) {
    clientRows.set(`${r.companyId}|${r.period}|${r.clientName}`, { ...r });
  }

  const api = {
    _laneRows: laneRows,
    _clientRows: clientRows,
    commercialConfig: {
      findUnique: jest.fn(async () => CFG),
      create: jest.fn(async () => CFG),
    },
    laneProfitability: {
      findMany: jest.fn(async ({ where }: any) =>
        [...laneRows.values()].filter(
          (r) => r.companyId === where.companyId &&
            (where.period === undefined || r.period === where.period),
        ),
      ),
      upsert: jest.fn(async ({ create }: any) => {
        const k = `${create.companyId}|${create.period}|${create.fromZone}|${create.toZone}`;
        laneRows.set(k, { ...create });
        return create;
      }),
    },
    clientProfitability: {
      findMany: jest.fn(async ({ where }: any) =>
        [...clientRows.values()].filter(
          (r) => r.companyId === where.companyId &&
            (where.period === undefined || r.period === where.period),
        ),
      ),
      groupBy: jest.fn(async ({ where }: any) => {
        const seen = new Map<string, number>();
        for (const r of clientRows.values()) {
          if (r.companyId !== where.companyId) continue;
          seen.set(r.clientName, (seen.get(r.clientName) ?? 0) + 1);
        }
        return [...seen].map(([clientName, n]) => ({ clientName, _count: { clientName: n } }));
      }),
      upsert: jest.fn(async ({ create }: any) => {
        const k = `${create.companyId}|${create.period}|${create.clientName}`;
        clientRows.set(k, { ...create });
        return create;
      }),
    },
  };

  (api as any).withTenant = jest.fn(async (companyId: string, fn: any) => {
    if (typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error(
        `withTenant requires a non-empty companyId, received ${JSON.stringify(companyId)}`,
      );
    }
    return fn(api);
  });

  return api as any;
}

/** Fakes for the two compute services, so this test covers only the snapshotting. */
function makeSvc(prisma: any, laneRows: any[] = [], clientRows: any[] = [], basis = 'MEASURED') {
  const lanes = {
    aggregate: jest.fn(async () => ({
      period: PERIOD,
      basis,
      lanes: laneRows,
      totals: { deliveries: 0, measuredDeliveries: 0, coveragePct: 0, revenue: 0, measuredCost: 0, grossProfit: 0 },
    })),
  };
  const clients = {
    aggregate: jest.fn(async () => ({
      period: PERIOD,
      basis,
      clients: clientRows,
      totals: { clients: clientRows.length, deliveries: 0, measuredDeliveries: 0, coveragePct: 0, revenue: 0, measuredCost: 0, grossProfit: 0 },
    })),
  };
  return new ProfitabilitySnapshotService(prisma, lanes as any, clients as any);
}

const rowFor = (prisma: any, period: string, from: string, to: string) =>
  prisma._laneRows.get(`${COMPANY}|${period}|${from}|${to}`);
const clientRowFor = (prisma: any, period: string, name: string) =>
  prisma._clientRows.get(`${COMPANY}|${period}|${name}`);

describe('ProfitabilitySnapshotService — materialise', () => {
  it('writes a lane row and a client row for the period', async () => {
    const prisma = makePrisma();
    const result = await makeSvc(prisma, [lane()], [client()]).materialise(COMPANY, PERIOD);

    expect(result.period).toBe(PERIOD);
    expect(result.lanes.written).toBe(1);
    expect(result.clients.written).toBe(1);
    expect(rowFor(prisma, PERIOD, 'Johannesburg', 'Gaborone')).toMatchObject({
      totalRevenue: 10_000,
      totalCost: 6000,
      grossProfit: 4000,
      marginPercent: 40,
      pricingSignal: 'OPTIMAL',
    });
  });

  it('leaves the deltas null when there is no prior period', async () => {
    // Null, not zero. A zero delta would read as "flat" when the truth is
    // "we have never measured this before".
    const prisma = makePrisma();
    await makeSvc(prisma, [lane()], [client()]).materialise(COMPANY, PERIOD);

    const row = rowFor(prisma, PERIOD, 'Johannesburg', 'Gaborone');
    expect(row.revenueDelta).toBeNull();
    expect(row.volumeDelta).toBeNull();
    expect(row.marginDelta).toBeNull();
  });

  it('computes deltas against the prior period', async () => {
    const prisma = makePrisma(
      [
        {
          companyId: COMPANY, period: PRIOR, fromZone: 'Johannesburg', toZone: 'Gaborone',
          totalRevenue: 8_000, totalDeliveries: 8, marginPercent: 35,
        },
      ],
      [
        {
          companyId: COMPANY, period: PRIOR, clientName: 'Acme',
          revenue: 8_000, deliveryCount: 8, marginPercent: 35,
        },
      ],
    );
    await makeSvc(prisma, [lane()], [client()]).materialise(COMPANY, PERIOD);

    const row = rowFor(prisma, PERIOD, 'Johannesburg', 'Gaborone');
    // revenue 8000 -> 10000 is +25%; deliveries 8 -> 10 is +25%; margin +5pp.
    expect(row.revenueDelta).toBe(25);
    expect(row.volumeDelta).toBe(25);
    expect(row.marginDelta).toBe(5);

    const c = clientRowFor(prisma, PERIOD, 'Acme');
    expect(c.revenueGrowthPct).toBe(25);
    expect(c.volumeTrend).toBe('GROWING');
  });

  it('is idempotent — re-running overwrites instead of duplicating', async () => {
    const prisma = makePrisma();
    const svc = makeSvc(prisma, [lane()], [client()]);

    await svc.materialise(COMPANY, PERIOD);
    await svc.materialise(COMPANY, PERIOD);

    const forPeriod = [...prisma._laneRows.values()].filter((r) => r.period === PERIOD);
    expect(forPeriod).toHaveLength(1);
    expect(prisma.laneProfitability.upsert).toHaveBeenCalledTimes(2);
  });

  it('derives cost-to-serve and rank for clients', async () => {
    const prisma = makePrisma();
    await makeSvc(
      prisma,
      [],
      [
        client({ clientName: 'Cheap', measuredCost: 1000, grossProfit: 9000 }),
        client({ clientName: 'Costly', measuredCost: 9000, grossProfit: 1000 }),
      ],
    ).materialise(COMPANY, PERIOD);

    expect(clientRowFor(prisma, PERIOD, 'Cheap')).toMatchObject({
      costToServePct: 10, // 1000 / 10000
      profitRank: 1,
    });
    expect(clientRowFor(prisma, PERIOD, 'Costly')).toMatchObject({
      costToServePct: 90,
      profitRank: 2,
    });
  });

  it('does not rank a client whose cost was only modelled', async () => {
    const prisma = makePrisma();
    await makeSvc(
      prisma,
      [],
      [
        client({ clientName: 'Measured', basis: 'MEASURED' }),
        client({ clientName: 'Guessed', basis: 'ESTIMATED' }),
      ],
    ).materialise(COMPANY, PERIOD);

    expect(clientRowFor(prisma, PERIOD, 'Measured').profitRank).toBe(1);
    // Ranking a measured client against a guess would order truth by a guess.
    expect(clientRowFor(prisma, PERIOD, 'Guessed').profitRank).toBeNull();
  });

  it('leaves CLV, churn and AI fields null rather than writing placeholders', async () => {
    // Each of those needs its own model. Writing a placeholder would make a
    // gap look like a measurement — the exact mistake this series undoes.
    const prisma = makePrisma();
    await makeSvc(prisma, [], [client()]).materialise(COMPANY, PERIOD);

    const row = clientRowFor(prisma, PERIOD, 'Acme');
    expect(row.clv).toBeUndefined();
    expect(row.clvTier).toBeUndefined();
    expect(row.churnRisk).toBeUndefined();
    expect(row.aiInsights).toBeUndefined();
  });
});

describe('ProfitabilitySnapshotService — volume trend', () => {
  const trend = async (curr: any, prior: any) => {
    const prisma = makePrisma([], prior ? [{ companyId: COMPANY, period: PRIOR, clientName: 'Acme', ...prior }] : []);
    await makeSvc(prisma, [], [curr]).materialise(COMPANY, PERIOD);
    return clientRowFor(prisma, PERIOD, 'Acme').volumeTrend;
  };

  it('is NEW for a client with no earlier period', async () => {
    expect(await trend(client(), null)).toBe('NEW');
  });

  it('is GROWING above +10% volume', async () => {
    expect(await trend(client({ deliveryCount: 20 }), { deliveryCount: 10 })).toBe('GROWING');
  });

  it('is DECLINING below -10% volume', async () => {
    expect(await trend(client({ deliveryCount: 5 }), { deliveryCount: 10 })).toBe('DECLINING');
  });

  it('is STABLE inside the band', async () => {
    expect(await trend(client({ deliveryCount: 10 }), { deliveryCount: 10 })).toBe('STABLE');
  });

  it('is DORMANT when the client bought nothing, whatever the history says', async () => {
    // A client who bought nothing is not "stable" because last month was quiet.
    expect(await trend(client({ deliveryCount: 0 }), { deliveryCount: 0 })).toBe('DORMANT');
  });
});

describe('ProfitabilitySnapshotService — reads', () => {
  it('scopes stored snapshots to the calling company', async () => {
    const prisma = makePrisma([
      { companyId: COMPANY, period: PERIOD, fromZone: 'A', toZone: 'B', marginPercent: 10 },
      { companyId: 'cmp-other', period: PERIOD, fromZone: 'A', toZone: 'B', marginPercent: 99 },
    ]);
    const svc = makeSvc(prisma);
    const rows = await svc.laneSnapshots(COMPANY, PERIOD);

    expect(rows.every((r: any) => r.companyId === COMPANY)).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it('lists the periods that actually have history', async () => {
    const prisma = makePrisma([
      { companyId: COMPANY, period: '2026-09', fromZone: 'A', toZone: 'B', marginPercent: 1 },
      { companyId: COMPANY, period: '2026-11', fromZone: 'A', toZone: 'B', marginPercent: 1 },
    ]);
    const periods = await makeSvc(prisma).availablePeriods(COMPANY);

    expect(periods).toEqual(['2026-11', '2026-09']);
  });

  it('runs reads inside withTenant and refuses an empty tenant', async () => {
    const prisma = makePrisma();
    const svc = makeSvc(prisma);

    await svc.laneSnapshots(COMPANY, PERIOD);
    expect(prisma.withTenant).toHaveBeenCalledWith(COMPANY, expect.any(Function));

    await expect(svc.laneSnapshots('', PERIOD)).rejects.toThrow(/non-empty companyId/);
  });
});
