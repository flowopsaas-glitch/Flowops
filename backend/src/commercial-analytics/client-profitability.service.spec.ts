import { ClientProfitabilityService } from './client-profitability.service';

/**
 * Client profitability from recorded cost.
 *
 * The lane fix corrected a number. This one corrects a verdict: the old matrix
 * charged every customer the same flat rate per stop and then labelled them
 * PROFITABLE / MARGINAL / UNPROFITABLE. Two customers billed identically got
 * the same label even when one was across town and the other across a border.
 *
 * These tests pin four things:
 *   1. cost is the cost of the deliveries actually billed to that client;
 *   2. it is never averaged with a modelled rate;
 *   3. no verdict is issued from a modelled rate — health is UNKNOWN;
 *   4. where cost IS recorded, the verdict can differ from the flat-rate one.
 */

const COMPANY = 'cmp-a';
const PERIOD = '2026-11';
const IN_PERIOD = new Date(Date.UTC(2026, 10, 10));

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

/** What the old model charged every delivery, regardless of who or where. */
const FLAT = 2.5 * 12 + 45 * (25 / 60) + 1.8 * 12 + 15; // 85.35

function makePrisma(invoices: any[] = [], allocations: any[] = [], delivered: any[] = []) {
  const api = {
    _state: { invoices, allocations, delivered },
    invoice: {
      findMany: jest.fn(async ({ where }: any) => {
        let rows = invoices.filter((i) => i.companyId === where.companyId);
        if (where.createdAt?.gte) {
          rows = rows.filter(
            (i) => i.createdAt >= where.createdAt.gte && i.createdAt < where.createdAt.lt,
          );
        }
        return rows;
      }),
    },
    waybill: {
      findMany: jest.fn(async ({ where }: any) => {
        let rows = delivered.filter(
          (w) => w.companyId === where.companyId && w.status === where.status,
        );
        if (where.createdAt?.gte) {
          rows = rows.filter(
            (w) => w.createdAt >= where.createdAt.gte && w.createdAt < where.createdAt.lt,
          );
        }
        return rows;
      }),
    },
    deliveryCostAllocation: {
      findMany: jest.fn(async ({ where }: any) => {
        let rows = allocations.filter((a) => a.companyId === where.companyId);
        if (where.period) rows = rows.filter((a) => a.period === where.period);
        if (where.waybillId?.in) {
          rows = rows.filter((a) => where.waybillId.in.includes(a.waybillId));
        }
        return rows;
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

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  companyId: COMPANY,
  clientName: 'Acme Retail',
  total: 1000,
  status: 'PAID',
  createdAt: IN_PERIOD,
  paidAt: IN_PERIOD,
  sentAt: IN_PERIOD,
  dueDate: null,
  items: [{ waybillId: 'wb-1' }],
  ...over,
});

const allocation = (over: Record<string, unknown> = {}) => ({
  waybillId: 'wb-1',
  companyId: COMPANY,
  period: PERIOD,
  totalCost: 500,
  provenance: 'MEASURED',
  ...over,
});

const delivered = (over: Record<string, unknown> = {}) => ({
  id: 'wb-1',
  companyId: COMPANY,
  status: 'DELIVERED',
  createdAt: IN_PERIOD,
  ...over,
});

const svc = (prisma: any) => new ClientProfitabilityService(prisma);

describe('ClientProfitabilityService — recorded cost per client', () => {
  it('costs a client by the deliveries actually billed to them', async () => {
    const prisma = makePrisma([invoice()], [allocation()]);
    const [client] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).clients;

    expect(client.measuredCost).toBe(500);
    expect(client.measuredCost).not.toBeCloseTo(FLAT, 1);
    expect(client.grossProfit).toBe(500);
    expect(client.marginPct).toBe(50);
    expect(client.basis).toBe('MEASURED');
  });

  it('excludes a billed delivery with no recorded cost from the margin', async () => {
    // Two line items, one with recorded cost and one without. Blending would
    // add the flat rate for the missing one and call the total measured.
    const prisma = makePrisma(
      [invoice({ items: [{ waybillId: 'wb-1' }, { waybillId: 'wb-2' }] })],
      [allocation({ waybillId: 'wb-1' })],
    );
    const [client] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).clients;

    expect(client.deliveryCount).toBe(2);
    expect(client.measuredDeliveries).toBe(1);
    expect(client.coveragePct).toBe(50);
    // Measured cost only: 1000 revenue against 500 recorded, not 500 + 85.35.
    expect(client.measuredCost).toBe(500);
  });

  it('ignores a line item with no waybill when counting coverage', async () => {
    const prisma = makePrisma(
      [invoice({ items: [{ waybillId: 'wb-1' }, { waybillId: null }] })],
      [allocation()],
    );
    const [client] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).clients;

    // Only billable items count: 1 billed, 1 measured.
    expect(client.measuredDeliveries).toBe(1);
    expect(client.coveragePct).toBe(100);
  });

  it('treats ESTIMATED and null provenance as unrecorded, never as measured', async () => {
    for (const provenance of ['ESTIMATED', null]) {
      const prisma = makePrisma([invoice()], [allocation({ provenance })]);
      const [client] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).clients;

      expect(client.measuredDeliveries).toBe(0);
      expect(client.measuredCost).toBe(0);
      expect(client.basis).toBe('ESTIMATED');
    }
  });

  it('marks a client ALLOCATED when shared cost was split by a rule', async () => {
    const prisma = makePrisma([invoice()], [allocation({ provenance: 'ALLOCATED' })]);
    const [client] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).clients;

    expect(client.basis).toBe('ALLOCATED');
    expect(client.measuredCost).toBe(500);
  });
});

describe('ClientProfitabilityService — verdicts', () => {
  it('issues no verdict from a modelled rate', async () => {
    // Nothing was recorded. The flat rate would put this client at ~91% margin
    // and call them comfortably PROFITABLE. They are not known to be anything.
    const prisma = makePrisma([invoice()], []);
    const [client] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).clients;

    expect(client.basis).toBe('ESTIMATED');
    expect(client.health).toBe('UNKNOWN');
    expect(client.estimatedCost).toBe(Math.round(FLAT));
  });

  it('reaches a different verdict once cost is recorded', async () => {
    // Two clients billed identically at 1000. The flat rate would call both
    // PROFITABLE. One actually cost 900 to serve, the other 100.
    const prisma = makePrisma(
      [
        invoice({ id: 'inv-1', clientName: 'Cheap To Serve', items: [{ waybillId: 'wb-1' }] }),
        invoice({ id: 'inv-2', clientName: 'Expensive To Serve', items: [{ waybillId: 'wb-2' }] }),
      ],
      [
        allocation({ waybillId: 'wb-1', totalCost: 100 }),
        allocation({ waybillId: 'wb-2', totalCost: 900 }),
      ],
    );
    const { clients } = await svc(prisma).aggregate(COMPANY, PERIOD, CFG);
    const byName = Object.fromEntries(clients.map((c) => [c.clientName, c]));

    expect(byName['Cheap To Serve'].marginPct).toBe(90);
    expect(byName['Cheap To Serve'].health).toBe('PROFITABLE');

    expect(byName['Expensive To Serve'].marginPct).toBe(10);
    expect(byName['Expensive To Serve'].health).toBe('UNPROFITABLE');

    // Under the flat rate both would have been ~91% and both PROFITABLE.
    expect(byName['Cheap To Serve'].health).not.toBe(byName['Expensive To Serve'].health);
  });

  it('labels a client MARGINAL between the two thresholds', async () => {
    const prisma = makePrisma([invoice()], [allocation({ totalCost: 800 })]);
    const [client] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).clients;

    expect(client.marginPct).toBe(20);
    expect(client.health).toBe('MARGINAL');
  });

  it('ranks only clients whose profit is real', async () => {
    const prisma = makePrisma(
      [
        invoice({ id: 'inv-1', clientName: 'Measured', items: [{ waybillId: 'wb-1' }] }),
        invoice({ id: 'inv-2', clientName: 'Estimated', items: [{ waybillId: 'wb-2' }] }),
      ],
      [allocation({ waybillId: 'wb-1' })],
    );
    const { clients } = await svc(prisma).aggregate(COMPANY, PERIOD, CFG);
    const byName = Object.fromEntries(clients.map((c) => [c.clientName, c]));

    expect(byName['Measured'].profitRank).toBe(1);
    // Ranking a measured client against a guess would order truth by a guess.
    expect(byName['Estimated'].profitRank).toBe(0);
  });

  it('takes the weakest client as the page basis', async () => {
    const prisma = makePrisma(
      [
        invoice({ id: 'inv-1', clientName: 'A', items: [{ waybillId: 'wb-1' }] }),
        invoice({ id: 'inv-2', clientName: 'B', items: [{ waybillId: 'wb-2' }] }),
      ],
      [allocation({ waybillId: 'wb-1' })],
    );
    const result = await svc(prisma).aggregate(COMPANY, PERIOD, CFG);

    expect(result.basis).not.toBe('MEASURED');
    expect(result.totals.coveragePct).toBe(50);
  });
});

describe('ClientProfitabilityService — period totals for the dashboard', () => {
  it('reports recorded cost, coverage and basis for the period', async () => {
    const prisma = makePrisma(
      [],
      [allocation({ waybillId: 'wb-1' })],
      [delivered({ id: 'wb-1' }), delivered({ id: 'wb-2' })],
    );
    const totals = await svc(prisma).periodTotals(COMPANY, PERIOD, CFG);

    expect(totals.deliveries).toBe(2);
    expect(totals.measuredDeliveries).toBe(1);
    expect(totals.coveragePct).toBe(50);
    expect(totals.measuredCost).toBe(500);
    expect(totals.basis).toBe('MEASURED');
  });

  it('falls back to the config rate only when nothing was recorded', async () => {
    const prisma = makePrisma([], [], [delivered()]);
    const totals = await svc(prisma).periodTotals(COMPANY, PERIOD, CFG);

    expect(totals.basis).toBe('ESTIMATED');
    expect(totals.measuredCost).toBe(0);
    expect(totals.estimatedCost).toBe(Math.round(FLAT));
  });

  it('reports NONE for a period with nothing in it', async () => {
    const prisma = makePrisma([], [], []);
    const totals = await svc(prisma).periodTotals(COMPANY, PERIOD, CFG);

    expect(totals.basis).toBe('NONE');
    expect(totals.coveragePct).toBe(0);
  });

  it('does not count an ESTIMATED allocation as recorded', async () => {
    const prisma = makePrisma([], [allocation({ provenance: 'ESTIMATED' })], [delivered()]);
    const totals = await svc(prisma).periodTotals(COMPANY, PERIOD, CFG);

    expect(totals.measuredDeliveries).toBe(0);
    expect(totals.basis).toBe('ESTIMATED');
  });
});

describe('ClientProfitabilityService — tenant context and inputs', () => {
  it('runs inside withTenant so row-level security backs the query', async () => {
    const prisma = makePrisma([invoice()], [allocation()]);
    await svc(prisma).aggregate(COMPANY, PERIOD, CFG);

    expect(prisma.withTenant).toHaveBeenCalledWith(COMPANY, expect.any(Function));
  });

  it('refuses an empty tenant rather than reading with isolation off', async () => {
    const prisma = makePrisma([invoice()], [allocation()]);
    await expect(svc(prisma).aggregate('', PERIOD, CFG)).rejects.toThrow(/non-empty companyId/);
  });

  it('rejects a period that is not YYYY-MM', async () => {
    const prisma = makePrisma([], [], []);
    await expect(svc(prisma).aggregate(COMPANY, '11-2026', CFG)).rejects.toThrow(
      /Invalid period/,
    );
  });

  it('exposes the flat rate it falls back to', () => {
    expect(ClientProfitabilityService.flatRate(CFG)).toBeCloseTo(FLAT, 5);
  });
});
