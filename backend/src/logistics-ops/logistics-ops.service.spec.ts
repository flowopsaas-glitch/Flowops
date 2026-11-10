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

/**
 * Two races on the operational path, both closed by claiming rather than
 * checking.
 *
 * A read takes no lock. Where the code decided on a value it had read and
 * then wrote unconditionally, two callers overlapping both passed the read
 * and both wrote — the loser silently taking the effect from the winner.
 */
describe('LogisticsOpsService — claims, not checks', () => {
  it('a reattempt is refused when the waybill left FAILED_DELIVERY underneath us', async () => {
    // guardTransition decides against a status read BEFORE the transaction
    // opens. Two operators confirming the same failed delivery both pass it.
    // Only the claim against the live row can tell them apart.
    const { svc, db, tx } = makeHarness({ status: 'FAILED_DELIVERY' });

    let claimed = false;
    const original = tx.waybill.updateMany.getMockImplementation()!;
    tx.waybill.updateMany.mockImplementation(async (args: any) => {
      // Someone else actioned the exception between our read and our write.
      if (!claimed && args.data?.status === 'OUT_FOR_DELIVERY') {
        claimed = true;
        db.waybill.status = 'OUT_FOR_DELIVERY';
      }
      return original(args);
    });

    await expect(
      svc.acknowledgeException('wb-1', 'co-1', 'REATTEMPT_CONFIRMED', 'booked again', undefined, {
        id: 'u-1',
        role: 'MANAGER',
      }),
    ).rejects.toThrow(/already actioned by someone else/i);

    // No tracking event: the reattempt did not happen, so the timeline does
    // not claim it did.
    expect(db.events.filter((e: any) => String(e.event).includes('REATTEMPT'))).toHaveLength(0);
  });

  it('a reattempt still works in the happy path (the claim is not refusing everything)', async () => {
    const { svc, db } = makeHarness({ status: 'FAILED_DELIVERY' });
    const out = await svc.acknowledgeException(
      'wb-1',
      'co-1',
      'REATTEMPT_CONFIRMED',
      'booked again',
      new Date().toISOString(),
      { id: 'u-1', role: 'MANAGER' },
    );
    expect(out).toBeTruthy();
    expect(db.events.some((e: any) => String(e.event).includes('REATTEMPT'))).toBe(true);
  });

  it('auto-reassign does not take custody from a driver who was assigned in the meantime', async () => {
    const { svc, tx, prisma } = makeHarness({ status: 'AT_ORIGIN_HUB' });

    // A compliant driver must exist or the flow returns early.
    prisma.driver.findMany.mockResolvedValue([{ id: 'drv-1', name: 'Dan', companyId: 'co-1' }] as any);

    const shipment = { id: 'shp-1', waybillId: 'wb-1', companyId: 'co-1', driverId: null, status: 'PENDING' };
    tx.shipment.findFirst.mockResolvedValue(shipment as any);
    (tx.shipment as any).updateMany = jest.fn(async ({ where, data }: any) => {
      // The shipment moved between our read and our write.
      if (where.driverId !== shipment.driverId || where.status !== shipment.status) return { count: 0 };
      Object.assign(shipment, data);
      return { count: 1 };
    });

    // Someone assigns it to another driver after we read it as unassigned.
    const original = (tx.shipment as any).updateMany.getMockImplementation();
    (tx.shipment as any).updateMany.mockImplementation(async (args: any) => {
      if (shipment.driverId === null) {
        shipment.driverId = 'drv-other';
        shipment.status = 'IN_TRANSIT';
      }
      return original(args);
    });

    await svc.transitionToHub('wb-1', 'co-1', 'AT_DESTINATION_HUB', ' CPT Hub ');

    // The other driver keeps custody; we did not overwrite them.
    expect(shipment.driverId).toBe('drv-other');
    expect(shipment.status).toBe('IN_TRANSIT');
  });

  it('auto-reassign does nothing when the waybill is no longer at the destination hub', async () => {
    // The hub check is a claim, not a read: a plain read would let two
    // concurrent reassignments both proceed.
    const { svc, tx, prisma, db } = makeHarness({ status: 'AT_ORIGIN_HUB' });
    prisma.driver.findMany.mockResolvedValue([{ id: 'drv-1', name: 'Dan', companyId: 'co-1' }] as any);
    (tx.shipment as any).create = jest.fn(async ({ data }: any) => ({ id: 'shp-new', ...data }));

    // Move the waybill out of the hub between the receive and the reassign.
    const original = prisma.$transaction.getMockImplementation()!;
    let first = true;
    prisma.$transaction.mockImplementation(async (fn: any) => {
      const out = await original(fn);
      if (first) { first = false; db.waybill.status = 'OUT_FOR_DELIVERY'; }
      return out;
    });

    await svc.transitionToHub('wb-1', 'co-1', 'AT_DESTINATION_HUB', 'CPT Hub');

    expect((tx.shipment as any).create).not.toHaveBeenCalled();
  });
});
