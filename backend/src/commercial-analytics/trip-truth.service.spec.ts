import { TripTruthService } from './trip-truth.service';

const CFG = {
  fuelCostPerKm: 2.5,
  vehicleCostPerKm: 1.8,
  driverHourlyCost: 45,
  avgDeliveryMinutes: 25,
  overheadPerDelivery: 15,
  avgKmPerDelivery: 12,
};

const waybill = (over: Record<string, unknown>) => ({
  id: 'w1',
  trackingNumber: 'WB-1',
  totalAmount: 1000,
  senderName: 'Client A',
  senderAddress: 'Origin St',
  recipientAddress: 'Dest Ave',
  senderLat: null,
  senderLng: null,
  recipientLat: null,
  recipientLng: null,
  weight: null,
  podDeliveredAt: new Date('2026-10-05T10:00:00Z'),
  updatedAt: new Date('2026-10-05T10:00:00Z'),
  manifestWaybills: [{ manifest: { driverId: 'd1' } }],
  ...over,
});

const makeService = (opts: {
  delivered: any[];
  entries: any[];
  manifestLinks?: any[];
}) => {
  const upserts = new Map<string, any>();
  const exceptionUpdates: { waybillId: string; data: any }[] = [];
  const prisma: any = {
    waybill: {
      findMany: jest.fn().mockResolvedValue(opts.delivered),
      findFirst: jest.fn(),
    },
    tripCostEntry: { findMany: jest.fn().mockResolvedValue(opts.entries) },
    manifestWaybill: { findMany: jest.fn().mockResolvedValue(opts.manifestLinks ?? []) },
    deliveryCostAllocation: {
      upsert: jest.fn(({ where, create }: any) => {
        upserts.set(where.waybillId, create);
        return Promise.resolve(create);
      }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
      update: jest.fn(({ where, data }: any) => {
        exceptionUpdates.push({ waybillId: where.waybillId, data });
        return Promise.resolve({ waybillId: where.waybillId, ...data });
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        exceptionUpdates.push({ waybillId: where.waybillId, data });
        return Promise.resolve({ count: 1 });
      }),
    },
  };
  const commercial: any = { getConfig: jest.fn().mockResolvedValue(CFG) };
  const notifications: any = { broadcast: jest.fn().mockResolvedValue({}) };
  return { svc: new TripTruthService(prisma, commercial, notifications), prisma, upserts, notifications, exceptionUpdates };
};

describe('TripTruthService.recompute', () => {
  it('combines direct entries with a weight-split driver-day pool and reports unallocated costs', async () => {
    const { svc, upserts } = makeService({
      delivered: [
        waybill({ id: 'w1', weight: 10 }),
        waybill({ id: 'w2', trackingNumber: 'WB-2', totalAmount: 500, weight: 30 }),
      ],
      entries: [
        { id: 'e1', driverId: 'd1', waybillId: 'w1', manifestId: null, type: 'FUEL', amount: 200, occurredAt: new Date('2026-10-05T08:00:00Z') },
        // Unlinked fuel by the same driver on the delivery day: split 10:30 by weight.
        { id: 'e2', driverId: 'd1', waybillId: null, manifestId: null, type: 'FUEL', amount: 300, occurredAt: new Date('2026-10-05T07:00:00Z') },
        // A toll from a driver who delivered nothing that day: unallocated, never smeared.
        { id: 'e3', driverId: 'd9', waybillId: null, manifestId: null, type: 'TOLL', amount: 999, occurredAt: new Date('2026-10-06T07:00:00Z') },
      ],
    });

    const summary = await svc.recompute('company-a', '2026-10');

    expect(summary).toMatchObject({
      trips: 2, measured: 0, allocated: 2, estimated: 0,
      recordedCost: 500, unallocatedCost: 999, unallocatedEntries: 1,
    });
    const w1 = upserts.get('w1');
    expect(w1).toMatchObject({ provenance: 'ALLOCATED', fuelCost: 275, totalCost: 275, grossMargin: 725, sourceEntryCount: 2 });
    expect(w1.allocationNote).toContain('direct entry');
    expect(w1.allocationNote).toContain('driver-day share');
    const w2 = upserts.get('w2');
    expect(w2).toMatchObject({ provenance: 'ALLOCATED', fuelCost: 225, grossMargin: 275, sourceEntryCount: 1 });
  });

  it('marks purely direct evidence as MEASURED', async () => {
    const { svc, upserts } = makeService({
      delivered: [waybill({ id: 'w1' })],
      entries: [
        { id: 'e1', driverId: 'd1', waybillId: 'w1', manifestId: null, type: 'TOLL', amount: 120, occurredAt: new Date('2026-10-05T08:00:00Z') },
      ],
    });
    const summary = await svc.recompute('company-a', '2026-10');
    expect(summary.measured).toBe(1);
    expect(upserts.get('w1')).toMatchObject({ provenance: 'MEASURED', tollsCost: 120, totalCost: 120, grossMargin: 880 });
  });

  it('splits manifest pools across the run’s delivered waybills', async () => {
    const { svc, upserts } = makeService({
      delivered: [
        waybill({ id: 'w1', weight: 10 }),
        waybill({ id: 'w2', trackingNumber: 'WB-2', weight: 10 }),
      ],
      entries: [
        { id: 'e9', driverId: 'd1', waybillId: null, manifestId: 'm1', type: 'FUEL', amount: 100, occurredAt: new Date('2026-10-05T06:00:00Z') },
      ],
      manifestLinks: [
        { manifestId: 'm1', waybillId: 'w1' },
        { manifestId: 'm1', waybillId: 'w2' },
      ],
    });
    await svc.recompute('company-a', '2026-10');
    expect(upserts.get('w1')).toMatchObject({ provenance: 'ALLOCATED', fuelCost: 50 });
    expect(upserts.get('w2')).toMatchObject({ provenance: 'ALLOCATED', fuelCost: 50 });
    expect(upserts.get('w1').allocationNote).toContain('manifest share');
  });

  it('falls back to a flagged config-rate ESTIMATE when nothing was recorded', async () => {
    const { svc, upserts } = makeService({ delivered: [waybill({ id: 'w1' })], entries: [] });
    const summary = await svc.recompute('company-a', '2026-10');
    expect(summary.estimated).toBe(1);
    // 12 km fallback: fuel 30 + vehicle 21.6 + labour 18.75 + overhead 15 = 85.35
    expect(upserts.get('w1')).toMatchObject({
      provenance: 'ESTIMATED', fuelCost: 30, vehicleCost: 21.6, labourCost: 18.75,
      overheadCost: 15, totalCost: 85.35, sourceEntryCount: 0,
    });
    expect(upserts.get('w1').allocationNote).toContain('config-rate estimate');
  });
});

describe('TripTruthService.listTrips', () => {
  it('keeps estimated trips out of the measured headline summary', async () => {
    const { svc, prisma } = makeService({ delivered: [], entries: [] });
    const rows = [
      { waybillId: 'w1', provenance: 'MEASURED', revenue: 1000, totalCost: 275, grossMargin: 725, updatedAt: new Date() },
      { waybillId: 'w2', provenance: 'ESTIMATED', revenue: 400, totalCost: 85, grossMargin: 315, updatedAt: new Date() },
    ];
    prisma.deliveryCostAllocation.findMany
      .mockResolvedValueOnce(rows) // visible page
      .mockResolvedValueOnce(rows); // period summary rows (same fixture)
    prisma.deliveryCostAllocation.count.mockResolvedValue(2);
    prisma.waybill.findMany
      .mockResolvedValueOnce([{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }]) // delivered ids
      .mockResolvedValueOnce([{ id: 'w1', trackingNumber: 'WB-1' }, { id: 'w2', trackingNumber: 'WB-2' }]);

    const out = await svc.listTrips('company-a', { period: '2026-10' });
    expect(out.summary.measured).toEqual({ trips: 1, revenue: 1000, cost: 275, margin: 725 });
    expect(out.summary.estimated).toEqual({ trips: 1, revenue: 400, cost: 85, margin: 315 });
    expect(out.summary.deliveredNotComputed).toBe(1);
    expect(out.trips[0].trackingNumber).toBe('WB-1');
    expect(out.total).toBe(2);
  });
});

describe('TripTruthService below-cost exceptions (Slice 3)', () => {
  const BLEEDING = {
    delivered: [waybill({ id: 'w1', totalAmount: 1000 })],
    entries: [
      { id: 'e1', driverId: 'd1', waybillId: 'w1', manifestId: null, type: 'FUEL', amount: 1400, occurredAt: new Date('2026-10-05T08:00:00Z') },
    ],
  };

  it('opens an exception and notifies once when a measured trip lands below cost', async () => {
    const { svc, notifications, exceptionUpdates } = makeService(BLEEDING);
    const summary = await svc.recompute('company-a', '2026-10');
    expect(summary.exceptionsOpened).toBe(1);
    expect(exceptionUpdates).toEqual([
      { waybillId: 'w1', data: expect.objectContaining({ exceptionStatus: 'OPEN' }) },
    ]);
    expect(notifications.broadcast).toHaveBeenCalledTimes(1);
    expect(notifications.broadcast).toHaveBeenCalledWith(
      'company-a',
      expect.stringContaining('below cost'),
      expect.stringContaining('WB-1'),
      'warning',
      '/commercial-analytics?tab=truth',
    );
  });

  it('does not re-notify or reset an already-open exception on recompute', async () => {
    const { svc, prisma, notifications, exceptionUpdates } = makeService(BLEEDING);
    prisma.deliveryCostAllocation.findMany.mockResolvedValue([
      { waybillId: 'w1', exceptionStatus: 'OPEN' },
    ]);
    const summary = await svc.recompute('company-a', '2026-10');
    expect(summary.exceptionsOpened).toBe(0);
    expect(exceptionUpdates).toHaveLength(0);
    expect(notifications.broadcast).not.toHaveBeenCalled();
  });

  it('auto-resolves an acknowledged exception when the trip recovers', async () => {
    const { svc, prisma, exceptionUpdates } = makeService({
      delivered: [waybill({ id: 'w1', totalAmount: 1000 })],
      entries: [
        { id: 'e1', driverId: 'd1', waybillId: 'w1', manifestId: null, type: 'FUEL', amount: 400, occurredAt: new Date('2026-10-05T08:00:00Z') },
      ],
    });
    prisma.deliveryCostAllocation.findMany.mockResolvedValue([
      { waybillId: 'w1', exceptionStatus: 'ACKNOWLEDGED' },
    ]);
    await svc.recompute('company-a', '2026-10');
    expect(exceptionUpdates).toEqual([
      { waybillId: 'w1', data: expect.objectContaining({ exceptionStatus: 'RESOLVED' }) },
    ]);
  });

  it('never raises an exception from an estimate, however negative', async () => {
    const { svc, notifications, exceptionUpdates } = makeService({
      delivered: [waybill({ id: 'w1', totalAmount: 10 })], // estimate 85.35 → margin −75.35
      entries: [],
    });
    const summary = await svc.recompute('company-a', '2026-10');
    expect(summary.estimated).toBe(1);
    expect(summary.exceptionsOpened).toBe(0);
    expect(exceptionUpdates).toHaveLength(0);
    expect(notifications.broadcast).not.toHaveBeenCalled();
  });

  it('updateException records the actor and note; 404 when no exception exists', async () => {
    const { svc, prisma } = makeService(BLEEDING);
    prisma.deliveryCostAllocation.findFirst.mockResolvedValue(null);
    await expect(
      svc.updateException('company-a', 'w1', { status: 'ACKNOWLEDGED' }, 'user-7'),
    ).rejects.toThrow('No below-cost exception');

    prisma.deliveryCostAllocation.findFirst
      .mockResolvedValueOnce({ id: 'a1', exceptionStatus: 'OPEN', exceptionNote: null })
      .mockResolvedValueOnce({
        id: 'a1', exceptionStatus: 'ACKNOWLEDGED',
        exceptionNote: 'Repricing with client', exceptionBy: 'user-7',
      });
    const out = await svc.updateException(
      'company-a', 'w1', { status: 'ACKNOWLEDGED', note: 'Repricing with client' }, 'user-7',
    );
    expect(out).toMatchObject({
      exceptionStatus: 'ACKNOWLEDGED',
      exceptionNote: 'Repricing with client',
      exceptionBy: 'user-7',
    });
  });
});
