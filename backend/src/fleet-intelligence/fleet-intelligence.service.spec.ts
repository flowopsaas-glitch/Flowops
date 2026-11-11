import { FleetIntelligenceService } from './fleet-intelligence.service';

/**
 * FLEET INTELLIGENCE — analytics that drive operational decisions.
 *
 * Tenant scoping is already correct throughout (every query filters on
 * companyId). The defects are all one shape: an EMPTY DENOMINATOR answered
 * with a confident number instead of "no data".
 *
 * That matters more here than in a read-only report, because the output is not
 * just displayed — it is phrased as advice. `hotZones` becomes "… is surging —
 * consider pre-positioning drivers there", which is a recommendation to spend
 * money. A fabricated 100% should not be the thing that triggers it.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';

const DAY = 86_400_000;

function makeHarness() {
  const waybills: any[] = [];
  const drivers: any[] = [];
  const shipments: any[] = [];

  const inRange = (createdAt: Date, w: any) =>
    (!w.gte || createdAt >= w.gte) && (!w.lt || createdAt < w.lt) && (!w.gt || createdAt > w.gt);

  const prisma: any = {
    waybill: {
      findMany: jest.fn(async ({ where }: any) =>
        waybills.filter((wb) => wb.companyId === where.companyId && inRange(wb.createdAt, where.createdAt ?? {}))
          .map((wb) => ({
            recipientAddress: wb.recipientAddress,
            senderAddress: wb.senderAddress,
            createdAt: wb.createdAt,
            status: wb.status,
          })),
      ),
      count: jest.fn(async ({ where }: any) =>
        waybills.filter((wb) => wb.companyId === where.companyId && inRange(wb.createdAt, where.createdAt ?? {})).length,
      ),
    },
    driver: {
      findMany: jest.fn(async ({ where }: any) =>
        drivers.filter((d) => d.companyId === where.companyId && (where.isActive === undefined || d.isActive === where.isActive))
          .map((d) => ({ id: d.id, name: d.name, phone: d.phone, vehicleType: d.vehicleType, status: d.status })),
      ),
      count: jest.fn(async ({ where }: any) =>
        drivers.filter((d) => d.companyId === where.companyId && (where.isActive === undefined || d.isActive === where.isActive)).length,
      ),
    },
    shipment: {
      findMany: jest.fn(async ({ where }: any) =>
        shipments.filter((s) => s.companyId === where.companyId && inRange(s.createdAt, where.createdAt ?? {}))
          .map((s) => ({ driverId: s.driverId, status: s.status, createdAt: s.createdAt, deliveredAt: s.deliveredAt })),
      ),
    },
    __waybills: waybills,
    __drivers: drivers,
    __shipments: shipments,
  };

  return { prisma, svc: new FleetIntelligenceService(prisma) };
}

/** A waybill addressed so that extractZone() yields `zone`. */
const seedWaybill = (h: any, zone: string, daysAgo: number, companyId = COMPANY) =>
  h.prisma.__waybills.push({
    companyId,
    recipientAddress: `1 Some Street, ${zone}`,
    senderAddress: `2 Other Road, ${zone}`,
    createdAt: new Date(Date.now() - daysAgo * DAY),
    status: 'DELIVERED',
  });

const seedDriver = (h: any, over: any = {}) => {
  const d = { id: `d${h.prisma.__drivers.length + 1}`, companyId: COMPANY, name: 'Driver', phone: '0', vehicleType: 'Van', status: 'AVAILABLE', isActive: true, ...over };
  h.prisma.__drivers.push(d);
  return d;
};

const seedShipment = (h: any, driverId: string, status: string, daysAgo: number, companyId = COMPANY) =>
  h.prisma.__shipments.push({ companyId, driverId, status, createdAt: new Date(Date.now() - daysAgo * DAY), deliveredAt: status === 'DELIVERED' ? new Date() : null });

// ── Driver utilisation: the success-rate denominator ──────────────────────────

describe('FleetIntelligence — driver success rate', () => {
  it('reports no data for a driver with no shipments, not 100%', async () => {
    // FAILED BEFORE: `month.length > 0 ? … : 100` gave an idle driver a PERFECT
    // success rate, while the same record reported utilization 0 and rating
    // 'LOW'. Self-contradictory, and it put the idle driver above one who ran
    // 100 deliveries with 10 failures (90%).
    const h = makeHarness();
    seedDriver(h);

    const out: any = await h.svc.analyzeDriverUtilization(COMPANY);
    const driver = out.drivers[0];

    expect(driver.successRate).toBeNull();
    expect(driver.utilization).toEqual(0);
    expect(driver.rating).toEqual('LOW');
  });

  it('still ranks a proven driver above an unproven one', async () => {
    // The practical consequence: an idle driver must not outrank a working one.
    const h = makeHarness();
    const busy = seedDriver(h, { id: 'busy', name: 'Busy' });
    seedDriver(h, { id: 'idle', name: 'Idle' });
    for (let i = 0; i < 90; i++) seedShipment(h, busy.id, 'DELIVERED', 5);
    for (let i = 0; i < 10; i++) seedShipment(h, busy.id, 'FAILED', 5);

    const out: any = await h.svc.analyzeDriverUtilization(COMPANY);
    const byId = new Map<string, any>(out.drivers.map((d: any) => [d.id, d]));

    expect(byId.get('busy')!.successRate).toEqual(90);
    expect(byId.get('idle')!.successRate).toBeNull();
  });

  it('computes a real success rate when there is data', async () => {
    const h = makeHarness();
    const d = seedDriver(h);
    for (let i = 0; i < 8; i++) seedShipment(h, d.id, 'DELIVERED', 5);
    for (let i = 0; i < 2; i++) seedShipment(h, d.id, 'FAILED', 5);

    const out: any = await h.svc.analyzeDriverUtilization(COMPANY);
    expect(out.drivers[0].successRate).toEqual(80);
  });

  it('ignores other tenants’ shipments when scoring a driver', async () => {
    const h = makeHarness();
    const mine = seedDriver(h, { id: 'mine' });
    for (let i = 0; i < 4; i++) seedShipment(h, mine.id, 'DELIVERED', 5, COMPANY);
    for (let i = 0; i < 4; i++) seedShipment(h, mine.id, 'FAILED', 5, VICTIM);

    const out: any = await h.svc.analyzeDriverUtilization(COMPANY);
    expect(out.drivers[0].successRate).toEqual(100); // only the 4 in-tenant successes
  });
});

// ── Zone demand: growth with no baseline ─────────────────────────────────────

describe('FleetIntelligence — zone growth needs a baseline', () => {
  it('does not call a brand-new zone SURGING', async () => {
    // FAILED BEFORE: `data.total > 0 ? 100 : 0` gave a zone with no prior
    // history +100% growth and trend SURGING. One delivery in a new suburb was
    // enough to land in `hotZones`, whose insight reads "… is surging —
    // consider pre-positioning drivers there" — advice to reallocate a fleet,
    // derived from no comparison at all.
    const h = makeHarness();
    seedWaybill(h, 'Soweto', 5); // recent only; nothing in the prior 30 days

    const out: any = await h.svc.analyzeZoneDemand(COMPANY);
    const soweto = out.zones.find((z: any) => z.zone === 'Soweto');

    expect(soweto.growthPct).toBeNull();
    expect(soweto.trend).toEqual('NEW');
    expect(out.hotZones).toHaveLength(0);
  });

  it('still reports real growth against a real baseline', async () => {
    const h = makeHarness();
    for (let i = 0; i < 10; i++) seedWaybill(h, 'Sandton', 5);  // this window
    for (let i = 0; i < 5; i++) seedWaybill(h, 'Sandton', 40);  // prior window

    const out: any = await h.svc.analyzeZoneDemand(COMPANY);
    const sandton = out.zones.find((z: any) => z.zone === 'Sandton');

    expect(sandton.growthPct).toEqual(100); // 5 -> 10, a genuine doubling
    expect(sandton.trend).toEqual('SURGING');
    expect(out.hotZones.map((z: any) => z.zone)).toEqual(['Sandton']);
  });

  it('reports NO growth for flat volume — the two windows must share units', async () => {
    // FAILED BEFORE, and the most expensive variant of this bug. The current
    // window counted a waybill twice when both endpoints sat in one zone
    // (pickups++ then deliveries++); the prior window counted it once. So flat
    // volume came out as (2N - N) / N = +100% and trend SURGING, which fed
    // `hotZones` — i.e. "pre-position drivers there" — for a zone that had not
    // moved at all.
    const h = makeHarness();
    for (let i = 0; i < 10; i++) seedWaybill(h, 'Midrand', 5);  // this window
    for (let i = 0; i < 10; i++) seedWaybill(h, 'Midrand', 40); // prior window

    const out: any = await h.svc.analyzeZoneDemand(COMPANY);
    const midrand = out.zones.find((z: any) => z.zone === 'Midrand');

    expect(midrand.growthPct).toEqual(0);
    expect(midrand.trend).toEqual('STABLE');
    expect(out.hotZones).toHaveLength(0);
  });

  it('reports decline against a baseline', async () => {
    const h = makeHarness();
    for (let i = 0; i < 2; i++) seedWaybill(h, 'Pretoria', 5);
    for (let i = 0; i < 10; i++) seedWaybill(h, 'Pretoria', 40);

    const out: any = await h.svc.analyzeZoneDemand(COMPANY);
    const pta = out.zones.find((z: any) => z.zone === 'Pretoria');

    expect(pta.growthPct).toEqual(-80);
    expect(pta.trend).toEqual('DECLINING');
  });

  it('scores zones from the caller’s waybills only', async () => {
    const h = makeHarness();
    seedWaybill(h, 'Soweto', 5, COMPANY);
    for (let i = 0; i < 50; i++) seedWaybill(h, 'Soweto', 40, VICTIM); // prior, other tenant

    const out: any = await h.svc.analyzeZoneDemand(COMPANY);
    const soweto = out.zones.find((z: any) => z.zone === 'Soweto');

    // The victim's 50 prior waybills must not become this tenant's baseline.
    expect(soweto.growthPct).toBeNull();
    expect(out.zones).toHaveLength(1);
  });
});

// ── Capacity forecast: projections below zero ────────────────────────────────

describe('FleetIntelligence — capacity forecast', () => {
  it('never projects a negative shipment count', async () => {
    // A declining fleet regresses below zero. You cannot deliver -80 shipments.
    const h = makeHarness();
    seedDriver(h);
    const declining = [500, 400, 300, 200, 100, 50];
    declining.forEach((n, i) => {
      for (let k = 0; k < n; k++) seedWaybill(h, 'Joburg', 30 * (6 - i) - 5);
    });

    const out: any = await h.svc.forecastCapacity(COMPANY);

    for (const f of out.forecast) {
      expect(f.projected).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(f.projected)).toBe(true);
    }
  });

  it('reports no months-to-capacity when the fleet is shrinking', async () => {
    const h = makeHarness();
    seedDriver(h);
    [500, 400, 300, 200, 100, 50].forEach((n, i) => {
      for (let k = 0; k < n; k++) seedWaybill(h, 'Joburg', 30 * (6 - i) - 5);
    });

    const out: any = await h.svc.forecastCapacity(COMPANY);
    expect(out.monthsUntilCapacity).toBeNull();
  });

  it('counts only the caller’s drivers toward capacity', async () => {
    const h = makeHarness();
    seedDriver(h, { companyId: COMPANY });
    seedDriver(h, { companyId: VICTIM });
    seedDriver(h, { companyId: VICTIM });

    const out: any = await h.svc.forecastCapacity(COMPANY);
    expect(out.activeDrivers).toEqual(1);
    expect(out.currentCapacity).toEqual(160); // 1 driver x 160/month
  });
});
