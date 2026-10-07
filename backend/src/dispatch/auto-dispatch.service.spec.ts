import { AutoDispatchService } from './auto-dispatch.service';
import { DriverComplianceResult } from '../common/compliance/driver-compliance.policy';

/**
 * Dispatch integrity regression tests.
 *
 * The properties:
 *  - `suggest()` / `rankCandidates()` are READ-ONLY: previewing must never
 *    assign, mutate a status or write an audit row;
 *  - a waybill can be assigned to exactly one driver: the assignment claims the
 *    waybill with a compare-and-set, so two concurrent dispatches cannot both
 *    succeed (and a second dispatch on an already-claimed waybill is refused);
 *  - a non-compliant driver is never a candidate, on any mode;
 *  - assignment + waybill/shipment status changes happen in ONE transaction.
 */

type Row = Record<string, any>;

const compliant = (driverId: string): DriverComplianceResult => ({
  driverId,
  companyId: 'co-1',
  compliant: true,
  dispatchable: true,
  blockers: [],
  warnings: [],
  issues: [],
  unverifiedDocuments: [],
  checkedAt: new Date('2026-10-07T08:00:00Z'),
});

function makeHarness(opts: { compliantIds?: string[] } = {}) {
  const compliantIds = opts.compliantIds ?? ['drv-1', 'drv-2'];
  const db: { assignedDriverId: string | null; waybillStatus: string; events: Row[] } = {
    assignedDriverId: null,
    waybillStatus: 'PENDING',
    events: [],
  };

  const waybill: Row = {
    id: 'wb-1',
    companyId: 'co-1',
    trackingNumber: 'FO-0001',
    status: 'PENDING',
    senderLat: -26.2,
    senderLng: 28.04,
    recipientLat: -26.21,
    recipientLng: 28.05,
  };

  const drivers: Row[] = [
    { id: 'drv-1', companyId: 'co-1', name: 'Sipho', status: 'AVAILABLE', isActive: true, lastLat: -26.2, lastLng: 28.05 },
    { id: 'drv-2', companyId: 'co-1', name: 'Thabo', status: 'AVAILABLE', isActive: true, lastLat: -26.22, lastLng: 28.06 },
  ];

  const tx = {
    // The claim. `count: 0` means somebody else already moved the waybill.
    waybill: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const statusOk = !where.status?.in || where.status.in.includes(db.waybillStatus);
        if (!statusOk) return { count: 0 };
        db.waybillStatus = data.status ?? db.waybillStatus;
        return { count: 1 };
      }),
      findFirst: jest.fn(async () => ({ ...waybill, status: db.waybillStatus })),
    },
    shipment: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => {
        db.assignedDriverId = data.driverId;
        return { id: 'shp-1', ...data };
      }),
      update: jest.fn(async ({ data }: any) => {
        db.assignedDriverId = data.driverId ?? db.assignedDriverId;
        return { id: 'shp-1', ...data };
      }),
    },
    trackingEvent: {
      create: jest.fn(async ({ data }: any) => {
        db.events.push(data);
        return { id: `evt-${db.events.length}`, ...data };
      }),
    },
  };

  const prisma = {
    waybill: { findFirst: jest.fn(async () => ({ ...waybill, status: db.waybillStatus })) },
    driver: { findMany: jest.fn(async () => drivers.map((d) => ({ ...d, driverId: d.id }))) },
    shipment: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      // Current-load query: no active shipments for anyone.
      groupBy: jest.fn(async () => []),
    },
    waybillCounts: {},
    trackingEvent: { count: jest.fn(async () => 0) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };

  const compliance = {
    // Faithful to the real service: only the policy-compliant rows survive.
    filterDispatchable: jest.fn((rows: any[]) =>
      rows
        .filter((r) => compliantIds.includes(r.driverId ?? r.id))
        .map((snapshot) => ({ snapshot, compliance: compliant(snapshot.driverId ?? snapshot.id) })),
    ),
    evaluateSnapshot: jest.fn((snapshot: any) =>
      compliantIds.includes(snapshot.driverId ?? snapshot.id)
        ? compliant(snapshot.driverId ?? snapshot.id)
        : {
            ...compliant(snapshot.driverId ?? snapshot.id),
            compliant: false,
            dispatchable: false,
            blockers: [{ code: 'LICENSEEXPIRY_EXPIRED', severity: 'BLOCK', message: 'Licence expired' }],
            issues: [{ code: 'LICENSEEXPIRY_EXPIRED', severity: 'BLOCK', message: 'Licence expired' }],
          },
    ),
    assertDispatchable: jest.fn(async () => undefined),
  };

  const svc = new AutoDispatchService(prisma as any, compliance as any);
  return { svc, prisma, tx, db, compliance, waybill };
}

describe('AutoDispatchService — read-only preview', () => {
  it('suggest() returns candidates without writing anything', async () => {
    const { svc, prisma, tx, db } = makeHarness();

    const candidates = await svc.suggest('co-1', 'wb-1');

    expect(candidates.length).toBeGreaterThan(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.waybill.updateMany).not.toHaveBeenCalled();
    expect(tx.shipment.create).not.toHaveBeenCalled();
    expect(tx.trackingEvent.create).not.toHaveBeenCalled();
    expect(db.waybillStatus).toBe('PENDING');
    expect(db.assignedDriverId).toBeNull();
  });

  it('suggest() is idempotent — repeated previews return the same ranking', async () => {
    const { svc } = makeHarness();
    const first = await svc.suggest('co-1', 'wb-1');
    const second = await svc.suggest('co-1', 'wb-1');
    expect(second.map((c) => c.driverId)).toEqual(first.map((c) => c.driverId));
  });

  it('never offers a non-compliant driver', async () => {
    const { svc } = makeHarness({ compliantIds: ['drv-2'] });
    const candidates = await svc.suggest('co-1', 'wb-1');
    expect(candidates.map((c) => c.driverId)).toEqual(['drv-2']);
  });
});

describe('AutoDispatchService — atomic assignment', () => {
  it('assigns in one transaction: claim + shipment + audit event', async () => {
    const { svc, prisma, tx, db } = makeHarness();

    const result = await svc.dispatch('co-1', 'wb-1', { mode: 'INTELLIGENT' });

    expect(result.assigned).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.waybill.updateMany).toHaveBeenCalled();
    expect(tx.trackingEvent.create).toHaveBeenCalled();
    expect(db.assignedDriverId).toBeTruthy();
  });

  it('REGRESSION: a second dispatch on an already-claimed waybill is refused, not re-assigned', async () => {
    const { svc, tx } = makeHarness();

    const first = await svc.dispatch('co-1', 'wb-1');
    expect(first.assigned).toBe(true);

    // The waybill left PENDING → the CAS can no longer match.
    const second = await svc.dispatch('co-1', 'wb-1');
    expect(second.assigned).toBe(false);
    expect(tx.shipment.create).toHaveBeenCalledTimes(1);
  });

  it('REGRESSION: two concurrent dispatches cannot both win', async () => {
    const { svc, db } = makeHarness();

    const results = await Promise.all([svc.dispatch('co-1', 'wb-1'), svc.dispatch('co-1', 'wb-1')]);

    const assigned = results.filter((r) => r.assigned);
    expect(assigned).toHaveLength(1);
    // Exactly one audit event, one custody row: the loser wrote nothing.
    expect(db.events).toHaveLength(1);
  });

  it('a lost race inside the transaction reports the conflict and writes nothing', async () => {
    const { svc, tx, db } = makeHarness();
    // Simulate the waybill being moved by another process between ranking and
    // the claim: the CAS returns 0 rows.
    tx.waybill.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await svc.dispatch('co-1', 'wb-1');

    // The conflict is a modelled outcome (assigned: false + explicit reason) so
    // a batch job can keep going, and absolutely nothing was written.
    expect(result.assigned).toBe(false);
    expect(result.reason).toMatch(/no longer assignable/);
    expect(tx.shipment.create).not.toHaveBeenCalled();
    expect(tx.trackingEvent.create).not.toHaveBeenCalled();
    expect(db.assignedDriverId).toBeNull();
  });

  it('a waybill already being delivered by another driver is not silently re-pointed', async () => {
    const { svc, tx } = makeHarness();
    tx.shipment.findFirst.mockResolvedValueOnce({
      id: 'shp-9', driverId: 'drv-OTHER', status: 'IN_TRANSIT',
    });

    const result = await svc.dispatch('co-1', 'wb-1');

    expect(result.assigned).toBe(false);
    expect(result.reason).toMatch(/already being delivered by another driver/);
    expect(tx.shipment.update).not.toHaveBeenCalled();
  });

  it('does not assign when no compliant driver exists', async () => {
    const { svc, tx } = makeHarness({ compliantIds: [] });
    const result = await svc.dispatch('co-1', 'wb-1');
    expect(result.assigned).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(tx.waybill.updateMany).not.toHaveBeenCalled();
  });
});

describe('AutoDispatchService.batchDispatch', () => {
  it('reports successRate as null (not 100%) for an empty batch', async () => {
    const { svc } = makeHarness();
    const result = await svc.batchDispatch('co-1', []);
    expect(result.summary).toMatchObject({ total: 0, assigned: 0, failed: 0, successRate: null });
  });

  it('assigns each waybill at most once across a batch', async () => {
    const { svc, db } = makeHarness();
    const result = await svc.batchDispatch('co-1', ['wb-1', 'wb-1']);
    expect(result.summary.assigned).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(db.events).toHaveLength(1);
  });
});
