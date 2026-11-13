import { LaneProfitabilityService } from './lane-profitability.service';

/**
 * Lane profitability from recorded cost.
 *
 * The bug this replaces was not a missing feature, it was a wrong number: the
 * dashboard charged every delivery the same modelled rate, so a 5 km drop and a
 * 900 km haul cost the same and no fuel ever actually bought entered the
 * figure. These tests pin the three things that must now hold:
 *
 *   1. recorded cost is used where it exists;
 *   2. it is never averaged together with a modelled rate;
 *   3. when only part of a lane was recorded, the response says how much.
 */

const COMPANY = 'cmp-a';
const PERIOD = '2026-11';

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

/** What the old flat-rate model would charge for one delivery. */
const FLAT = 2.5 * 12 + 45 * (25 / 60) + 1.8 * 12 + 15; // 85.35

const IN_PERIOD = new Date(Date.UTC(2026, 10, 10));

function makePrisma(waybills: any[] = [], allocations: any[] = []) {
  const api = {
    _state: { waybills, allocations },
    waybill: {
      findMany: jest.fn(async ({ where }: any) =>
        waybills.filter(
          (w) =>
            w.companyId === where.companyId &&
            w.status === where.status &&
            w.createdAt >= where.createdAt.gte &&
            w.createdAt < where.createdAt.lt,
        ),
      ),
    },
    deliveryCostAllocation: {
      findMany: jest.fn(async ({ where }: any) =>
        allocations.filter(
          (a) => a.companyId === where.companyId && a.period === where.period,
        ),
      ),
    },
  };

  (api as any).withTenant = jest.fn(async (companyId: string, fn: any) => {
    if (typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error(`withTenant requires a non-empty companyId, received ${JSON.stringify(companyId)}`);
    }
    return fn(api);
  });

  return api as any;
}

const waybill = (over: Record<string, unknown> = {}) => ({
  id: 'wb-1',
  companyId: COMPANY,
  status: 'DELIVERED',
  createdAt: IN_PERIOD,
  totalAmount: 1000,
  senderAddress: '12 Warehouse Road, Johannesburg, 2000',
  recipientAddress: '9 Bay Street, Gaborone, 0000',
  ...over,
});

const allocation = (over: Record<string, unknown> = {}) => ({
  waybillId: 'wb-1',
  companyId: COMPANY,
  period: PERIOD,
  revenue: 1000,
  totalCost: 500,
  provenance: 'MEASURED',
  fromZone: '12 Warehouse Road, Johannesburg, 2000',
  toZone: '9 Bay Street, Gaborone, 0000',
  ...over,
});

const svc = (prisma: any) => new LaneProfitabilityService(prisma);

describe('LaneProfitabilityService — recorded cost', () => {
  it('uses the recorded cost rather than the flat rate', async () => {
    // The flat model would charge 85.35 for this delivery. It actually cost 500.
    const prisma = makePrisma([waybill()], [allocation()]);
    const [lane] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).lanes;

    expect(lane.measuredCost).toBe(500);
    expect(lane.measuredCost).not.toBeCloseTo(FLAT, 1);
    expect(lane.grossProfit).toBe(500);
    expect(lane.marginPct).toBe(50);
    expect(lane.basis).toBe('MEASURED');
  });

  it('reports how much of a lane was actually recorded', async () => {
    const prisma = makePrisma(
      [waybill({ id: 'wb-1' }), waybill({ id: 'wb-2' }), waybill({ id: 'wb-3' })],
      [allocation({ waybillId: 'wb-1' })],
    );
    const [lane] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).lanes;

    expect(lane.deliveries).toBe(3);
    expect(lane.measuredDeliveries).toBe(1);
    expect(lane.coveragePct).toBeCloseTo(33.3, 1);
  });

  it('never lets an unrecorded delivery inflate the margin', async () => {
    // Two deliveries, one recorded at 500 and one with no allocation row at
    // all. Blending would add the flat rate (85.35) for the missing one and
    // quietly present a partly-invented margin as measured.
    const prisma = makePrisma(
      [waybill({ id: 'wb-1' }), waybill({ id: 'wb-2' })],
      [allocation({ waybillId: 'wb-1' })],
    );
    const [lane] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).lanes;

    // Measured subset only: revenue 1000, cost 500, margin 50%.
    expect(lane.measuredRevenue).toBe(1000);
    expect(lane.measuredCost).toBe(500);
    expect(lane.marginPct).toBe(50);
    // Total revenue still counts every delivery, but cost does not.
    expect(lane.revenue).toBe(2000);
  });

  it('treats a row with no provenance as unrecorded, not as measured', async () => {
    // Rows written before the Trip Truth engine existed carry a null
    // provenance. The schema is explicit: unknown basis, never measured.
    const prisma = makePrisma([waybill()], [allocation({ provenance: null })]);
    const [lane] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).lanes;

    expect(lane.measuredDeliveries).toBe(0);
    expect(lane.measuredCost).toBe(0);
    expect(lane.basis).toBe('ESTIMATED');
  });

  it('does not blend an ESTIMATED allocation into measured truth', async () => {
    const prisma = makePrisma(
      [waybill({ id: 'wb-1' }), waybill({ id: 'wb-2' })],
      [
        allocation({ waybillId: 'wb-1', provenance: 'MEASURED', totalCost: 500 }),
        allocation({ waybillId: 'wb-2', provenance: 'ESTIMATED', totalCost: 400 }),
      ],
    );
    const [lane] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).lanes;

    // Only the measured row counts. Were they blended, cost would be 900.
    expect(lane.measuredDeliveries).toBe(1);
    expect(lane.measuredCost).toBe(500);
    expect(lane.measuredCost).not.toBe(900);
  });

  it('marks a lane ALLOCATED when shared cost was split by a rule', async () => {
    const prisma = makePrisma([waybill()], [allocation({ provenance: 'ALLOCATED' })]);
    const [lane] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).lanes;

    expect(lane.basis).toBe('ALLOCATED');
    expect(lane.measuredCost).toBe(500);
  });
});

describe('LaneProfitabilityService — fallback and basis', () => {
  it('falls back to the config rate when nothing was recorded, and says so', async () => {
    // A company that has never run the engine still gets a usable page — but
    // the page must not claim the number was measured.
    const prisma = makePrisma([waybill()], []);
    const result = await svc(prisma).aggregate(COMPANY, PERIOD, CFG);
    const [lane] = result.lanes;

    expect(lane.basis).toBe('ESTIMATED');
    expect(result.basis).toBe('ESTIMATED');
    expect(result.totals.measuredDeliveries).toBe(0);
    expect(lane.measuredCost).toBe(0);
  });

  it('takes the weakest lane as the page basis, not the average', async () => {
    // One fully measured lane and one with nothing recorded. Averaging would
    // call the page MEASURED; the honest answer is that it contains an estimate.
    const prisma = makePrisma(
      [
        waybill({ id: 'wb-1', senderAddress: '1 A Street, Johannesburg, 2000' }),
        waybill({ id: 'wb-2', senderAddress: '2 B Street, Cape Town, 8000' }),
      ],
      [allocation({ waybillId: 'wb-1' })],
    );
    const result = await svc(prisma).aggregate(COMPANY, PERIOD, CFG);

    expect(result.lanes).toHaveLength(2);
    expect(result.basis).not.toBe('MEASURED');
    expect(result.totals.coveragePct).toBeCloseTo(50, 1);
  });

  it('reports NONE when there were no deliveries at all', async () => {
    const prisma = makePrisma([], []);
    const result = await svc(prisma).aggregate(COMPANY, PERIOD, CFG);

    expect(result.basis).toBe('NONE');
    expect(result.lanes).toHaveLength(0);
    expect(result.totals.coveragePct).toBe(0);
  });

  it('still counts recorded cost for a waybill outside the delivered set', async () => {
    // The engine covers a period, not a status. Cost recorded against a
    // waybill the waybill query did not return must not disappear.
    const prisma = makePrisma([], [allocation({ waybillId: 'wb-9' })]);
    const [lane] = (await svc(prisma).aggregate(COMPANY, PERIOD, CFG)).lanes;

    expect(lane.measuredDeliveries).toBe(1);
    expect(lane.measuredCost).toBe(500);
  });
});

describe('LaneProfitabilityService — zones and tenant context', () => {
  it('derives the lane from a full address the way the old page did', () => {
    // The allocation column is named fromZone but holds the whole address.
    expect(LaneProfitabilityService.extractZone('12 Warehouse Road, Johannesburg, 2000')).toBe(
      'Johannesburg',
    );
    expect(LaneProfitabilityService.extractZone('9 Bay Street, Gaborone')).toBe('Gaborone');
    expect(LaneProfitabilityService.extractZone('')).toBe('Unknown');
  });

  it('runs inside withTenant so row-level security backs the query', async () => {
    const prisma = makePrisma([waybill()], [allocation()]);
    await svc(prisma).aggregate(COMPANY, PERIOD, CFG);

    expect(prisma.withTenant).toHaveBeenCalledWith(COMPANY, expect.any(Function));
  });

  it('refuses an empty tenant rather than reading with isolation off', async () => {
    const prisma = makePrisma([waybill()], [allocation()]);
    await expect(svc(prisma).aggregate('', PERIOD, CFG)).rejects.toThrow(/non-empty companyId/);
  });

  it('rejects a period that is not YYYY-MM', async () => {
    const prisma = makePrisma([], []);
    await expect(svc(prisma).aggregate(COMPANY, 'not-a-period', CFG)).rejects.toThrow(
      /Invalid period/,
    );
  });
});
