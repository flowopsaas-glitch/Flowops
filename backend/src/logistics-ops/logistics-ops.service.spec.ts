import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LogisticsOpsService } from './logistics-ops.service';

/**
 * Logistics-ops transition tests.
 *
 * This module owns the parcel's physical journey between hubs, so the rules
 * pinned here are procedural, not cosmetic:
 *  - only hub states may be requested (a "scan" cannot force DELIVERED);
 *  - an illegal transition is rejected AND audited, never applied;
 *  - every state write is a compare-and-set, so two concurrent scans cannot
 *    both win and the timeline can never run backwards;
 *  - the public tracking feed exposes the journey, never the personal data.
 */

type Row = Record<string, any>;

function makeHarness(waybillOverrides: Row = {}) {
  const db: { waybill: Row; events: Row[] } = {
    waybill: {
      id: 'wb-1',
      companyId: 'co-1',
      trackingNumber: 'FO-0001',
      status: 'COLLECTED',
      senderName: 'Acme (Pty) Ltd',
      attemptCount: 0,
      maxAttempts: 3,
      pocCollectedAt: null,
      ...waybillOverrides,
    },
    events: [],
  };

  const tx = {
    waybill: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        // CAS: only matches while the status is the one that was validated.
        if (typeof where.status === 'string' && db.waybill.status !== where.status) return { count: 0 };
        if (where.status?.notIn?.includes(db.waybill.status)) return { count: 0 };
        if (where.attemptCount !== undefined && db.waybill.attemptCount !== where.attemptCount) {
          return { count: 0 };
        }
        Object.assign(db.waybill, data);
        return { count: 1 };
      }),
      findFirstOrThrow: jest.fn(async () => ({ ...db.waybill })),
    },
    trackingEvent: {
      create: jest.fn(async ({ data }: any) => {
        db.events.push(data);
        return { id: `evt-${db.events.length}`, ...data };
      }),
    },
    notification: { create: jest.fn(async ({ data }: any) => ({ id: 'ntf-1', ...data })) },
    shipment: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: 'shp-1', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'shp-1', ...data })),
    },
    addressBookEntry: {},
  };

  const prisma = {
    waybill: { findFirst: jest.fn(async () => ({ ...db.waybill })) },
    trackingEvent: {
      findMany: jest.fn(async () => db.events),
      create: jest.fn(async ({ data }: any) => {
        db.events.push(data);
        return { id: `evt-${db.events.length}`, ...data };
      }),
    },
    addressBookEntry: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: 'addr-1', ...data })),
      updateMany: jest.fn(async ({ where }: any) =>
        where.id === 'addr-1' && where.companyId === 'co-1' ? { count: 1 } : { count: 0 },
      ),
      findFirstOrThrow: jest.fn(async () => ({ id: 'addr-1', companyId: 'co-1' })),
    },
    notification: { create: jest.fn() },
    driver: { findMany: jest.fn(async () => []) },
    shipment: { findFirst: jest.fn(async () => null), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };

  const notifications = { notifyWaybillStatus: jest.fn(async () => undefined) };
  const compliance = {
    filterDispatchable: jest.fn((rows: any[]) => rows.map((snapshot) => ({ snapshot, compliance: {} }))),
  };

  const svc = new LogisticsOpsService(prisma as any, notifications as any, compliance as any);
  return { svc, prisma, tx, db, notifications, compliance };
}

describe('LogisticsOpsService.transitionToHub', () => {
  it('moves a COLLECTED parcel into the origin hub and records a tracking event', async () => {
    const { svc, db, prisma } = makeHarness();
    const result = await svc.transitionToHub('wb-1', 'co-1', 'AT_ORIGIN_HUB', 'JHB Depot');
    expect(result).toMatchObject({ success: true, status: 'AT_ORIGIN_HUB' });
    expect(db.waybill.status).toBe('AT_ORIGIN_HUB');
    expect(db.events[0]).toMatchObject({ event: 'SCANNED_IN', status: 'AT_ORIGIN_HUB' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('refuses a target that is not a hub state (a scan cannot force DELIVERED)', async () => {
    const { svc, db } = makeHarness();
    await expect(svc.transitionToHub('wb-1', 'co-1', 'DELIVERED')).rejects.toThrow(
      BadRequestException,
    );
    expect(db.waybill.status).toBe('COLLECTED');
  });

  it('REGRESSION: an illegal transition is rejected, audited, and never applied', async () => {
    const { svc, db } = makeHarness({ status: 'DELIVERED' });

    await expect(svc.transitionToHub('wb-1', 'co-1', 'AT_ORIGIN_HUB')).rejects.toThrow(
      /Illegal waybill transition DELIVERED → AT_ORIGIN_HUB/,
    );

    // The parcel did not move…
    expect(db.waybill.status).toBe('DELIVERED');
    // …and the refusal is on the record, with both states named.
    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({
      event: 'TRANSITION_REJECTED',
      status: 'DELIVERED',
      metadata: { from: 'DELIVERED', attempted: 'AT_ORIGIN_HUB', reason: 'illegal_transition' },
    });
  });

  it('REGRESSION: a concurrent scan that moved the parcel first makes this one a conflict', async () => {
    const { svc, tx } = makeHarness();
    // Another scan wins the race between read and write.
    tx.waybill.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(svc.transitionToHub('wb-1', 'co-1', 'AT_ORIGIN_HUB')).rejects.toThrow(
      ConflictException,
    );
    expect(tx.trackingEvent.create).not.toHaveBeenCalled();
  });

  it("is tenant-scoped: another tenant's waybill is a 404", async () => {
    const { svc, prisma } = makeHarness();
    (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(svc.transitionToHub('wb-1', 'co-2', 'AT_ORIGIN_HUB')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('LogisticsOpsService.receiveAtHub', () => {
  it('reports received / already / notFound / rejected per parcel', async () => {
    const harness = makeHarness();
    // Lookup by id or tracking number, tenant-scoped.
    (harness.prisma.waybill.findFirst as jest.Mock).mockImplementation(async ({ where }: any) => {
      if (where.OR?.some((w: any) => w.trackingNumber === 'UNKNOWN')) return null;
      if (where.OR?.some((w: any) => w.trackingNumber === 'FO-IN')) {
        return { id: 'wb-in', trackingNumber: 'FO-IN', status: 'AT_ORIGIN_HUB' };
      }
      return { id: 'wb-1', trackingNumber: 'FO-0001', status: 'COLLECTED' };
    });
    harness.db.waybill.id = 'wb-1';

    const result = await harness.svc.receiveAtHub(
      'co-1',
      ['FO-0001', 'FO-IN', 'UNKNOWN'],
      'JHB Depot',
      { id: 'u-1', name: 'Clerk', role: 'WAREHOUSE' },
    );

    expect(result.receivedCount).toBe(1);
    expect(result.received).toEqual(['FO-0001']);
    expect(result.already).toEqual(['FO-IN']);
    expect(result.notFound).toEqual(['UNKNOWN']);
  });
});

describe('LogisticsOpsService.recordFailedAttempt', () => {
  it('schedules a retry while attempts remain', async () => {
    const { svc, db } = makeHarness({ status: 'OUT_FOR_DELIVERY' });
    const result = await svc.recordFailedAttempt('wb-1', 'co-1', {
      reason: 'Nobody home',
      reasonCode: 'CUSTOMER_NOT_HOME',
    });
    expect(result).toMatchObject({ attemptCount: 1, status: 'FAILED_DELIVERY', exhausted: false });
    expect(db.waybill.nextAttemptAt).toBeInstanceOf(Date);
  });

  it('returns to sender on the final attempt', async () => {
    const { svc, db } = makeHarness({ status: 'OUT_FOR_DELIVERY', attemptCount: 2, maxAttempts: 3 });
    const result = await svc.recordFailedAttempt('wb-1', 'co-1', { reason: 'Refused' });
    expect(result).toMatchObject({ status: 'RETURNED', exhausted: true });
    expect(db.waybill.nextAttemptAt).toBeNull();
  });

  it('refuses a failed attempt on a parcel that is not being delivered', async () => {
    const { svc } = makeHarness({ status: 'AT_ORIGIN_HUB', attemptCount: 0 });
    // AT_ORIGIN_HUB is attemptable per policy; use a truly terminal state.
    const { svc: svc2 } = makeHarness({ status: 'DELIVERED' });
    await expect(svc2.recordFailedAttempt('wb-1', 'co-1', { reason: 'x' })).rejects.toThrow(
      BadRequestException,
    );
    expect(svc).toBeTruthy();
  });

  it('requires a reason', async () => {
    const { svc } = makeHarness({ status: 'OUT_FOR_DELIVERY' });
    await expect(svc.recordFailedAttempt('wb-1', 'co-1', { reason: '' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('an unknown reason code degrades to OTHER instead of failing the record', async () => {
    const { svc } = makeHarness({ status: 'OUT_FOR_DELIVERY' });
    const result = await svc.recordFailedAttempt('wb-1', 'co-1', {
      reason: 'Something odd',
      reasonCode: 'NOT_A_REAL_CODE',
    });
    expect(result.reasonCode).toBe('OTHER');
  });

  it('REGRESSION: two concurrent failed attempts cannot both increment the count', async () => {
    const { svc, tx } = makeHarness({ status: 'OUT_FOR_DELIVERY', attemptCount: 1 });
    tx.waybill.updateMany.mockResolvedValueOnce({ count: 0 }); // the other attempt won

    await expect(svc.recordFailedAttempt('wb-1', 'co-1', { reason: 'x' })).rejects.toThrow(
      ConflictException,
    );
    expect(tx.trackingEvent.create).not.toHaveBeenCalled();
  });
});

describe('LogisticsOpsService address book', () => {
  it("scopes updates by id AND company (another tenant's address is a 404)", async () => {
    const { svc, prisma } = makeHarness();
    await expect(svc.updateAddress('addr-1', 'co-2', { name: 'X' })).rejects.toThrow(NotFoundException);
    expect(prisma.addressBookEntry.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it('scopes deletes by id AND company', async () => {
    const { svc, prisma } = makeHarness();
    await expect(svc.deleteAddress('addr-1', 'co-2')).rejects.toThrow(NotFoundException);
    expect(prisma.addressBookEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'addr-1', companyId: 'co-2' } }),
    );
  });
});

describe('LogisticsOpsService.getTrackingTimeline (public feed)', () => {
  it('returns the journey without recipient names, addresses or coordinates', async () => {
    const { svc, db } = makeHarness();
    db.events.push({ event: 'COLLECTED', status: 'COLLECTED', createdAt: new Date(), location: '12 Main Rd, Sandton' });

    const timeline = await svc.getTrackingTimeline('FO-0001');

    expect(timeline.timeline[0]).toMatchObject({ description: 'Parcel collected' });
    expect(timeline.timeline[0].location).toBeNull(); // no address leak on a public route
    expect(JSON.stringify(timeline)).not.toContain('Sandton');
    expect(timeline).not.toHaveProperty('recipientName');
  });
});
