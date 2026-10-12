import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EpodService } from './epod.service';

/**
 * ePOD regression tests.
 *
 * The properties pinned here:
 *  - one proof of delivery per waybill: a duplicate submission (double tap,
 *    retry after a timeout, or a genuinely concurrent second request) must be
 *    refused and must NOT re-run the delivery side effects;
 *  - the capture is attributed to the driver the parcel was dispatched to —
 *    another driver cannot sign for someone else's load;
 *  - a parcel can only be delivered from a state that allows it;
 *  - the POD evidence, the waybill status, the shipment and the tracking event
 *    are written in ONE transaction.
 */

type Row = Record<string, any>;

function makeHarness(overrides: Row = {}) {
  const db: { podDelivered: boolean; pods: Row[]; shipmentStatus: string; podResolved?: boolean } = {
    podDelivered: false,
    pods: [],
    shipmentStatus: 'IN_TRANSIT',
    podResolved: false,
  };

  const waybill: Row = {
    id: 'wb-1',
    companyId: 'co-1',
    trackingNumber: 'FO-0001',
    status: 'OUT_FOR_DELIVERY',
    podDeliveredAt: null,
    shipments: [{ id: 'shp-1', driverId: 'drv-1', status: 'IN_TRANSIT' }],
    ...overrides,
  };

  const tx = {
    waybill: {
      // The claim: two concurrent captures cannot both match podDeliveredAt: null.
      updateMany: jest.fn(async () => {
        if (db.podDelivered) return { count: 0 };
        db.podDelivered = true;
        return { count: 1 };
      }),
      update: jest.fn(async ({ data }: any) => ({ ...waybill, ...data, status: 'DELIVERED' })),
    },
    electronicPod: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `epod-${db.pods.length + 1}`, status: 'CAPTURED', ...data };
        db.pods.push(row);
        return row;
      }),
      updateMany: jest.fn(async ({ data }: any) => {
        if (db.podResolved || (data && data.disputeResolution && db.pods[0]?.status !== 'DISPUTED')) return { count: 0 };
        if (data && data.disputeResolution) db.podResolved = true;
        if (db.pods[0]) db.pods[0] = { ...db.pods[0], ...data };
        return { count: 1 };
      }),
    },
    shipment: {
      updateMany: jest.fn(async ({ data }: any) => {
        db.shipmentStatus = data.status;
        return { count: 1 };
      }),
    },
    trackingEvent: { create: jest.fn(async ({ data }: any) => ({ id: 'evt-1', ...data })) },
  };

  const prisma = {
    waybill: { findFirst: jest.fn(async () => (db.podDelivered ? { ...waybill, podDeliveredAt: new Date(), status: 'DELIVERED' } : waybill)) },
    electronicPod: {
      findFirst: jest.fn(async () => db.pods[0] ?? null),
      findMany: jest.fn(async () => db.pods),
      count: jest.fn(async () => db.pods.length),
    },
    driver: {
      // Default: the token's driver IS the assigned driver, in this tenant.
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === 'drv-1' || where.userId === 'user-drv-1' ? { id: 'drv-1' } : null,
      ),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };

  const audit = { record: jest.fn(async () => 'audit-1') };
  const outbox = { enqueue: jest.fn(async () => 'outbox-1') };
  const svc = new EpodService(prisma as any, audit as any, outbox as any);
  return { svc, prisma, tx, db, waybill, audit, outbox };
}

const DTO = { waybillId: 'wb-1', signatureUrl: 'https://cdn/sig.png', recipientName: 'T. Mokoena' };

describe('EpodService.capture — custody and state', () => {
  it('refuses a waybill from another tenant (not found, not a leak)', async () => {
    const { svc, prisma } = makeHarness();
    (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(svc.capture('co-1', DTO, { driverId: 'drv-1' })).rejects.toThrow(NotFoundException);
  });

  it('refuses a driver who is not the driver the parcel is assigned to', async () => {
    const { svc, prisma } = makeHarness();
    // The caller's driver record resolves to drv-2, but the parcel is drv-1's.
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({ id: 'drv-2' });
    await expect(svc.capture('co-1', DTO, { driverId: 'drv-2' })).rejects.toThrow(ForbiddenException);
  });

  it('refuses when the caller has no driver identity at all', async () => {
    const { svc } = makeHarness();
    await expect(svc.capture('co-1', DTO, { userId: 'someone' })).rejects.toThrow(ForbiddenException);
  });

  it('refuses to deliver a parcel that is not out for delivery', async () => {
    const { svc } = makeHarness({ status: 'PENDING' });
    await expect(svc.capture('co-1', DTO, { driverId: 'drv-1' })).rejects.toThrow(BadRequestException);
  });

  it('refuses — and AUDITS — a capture of a parcel that never went out for delivery', async () => {
    // AT_DESTINATION_HUB is capturable per CAPTURABLE_WAYBILL_STATUSES, but the
    // state machine does not allow AT_DESTINATION_HUB → DELIVERED. Without the
    // audit row this refusal would leave no trace at all.
    const { svc, audit, tx } = makeHarness({ status: 'AT_DESTINATION_HUB' });

    await expect(svc.capture('co-1', DTO, { driverId: 'drv-1' })).rejects.toThrow(BadRequestException);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'waybill.transition_rejected',
        targetType: 'waybill',
        targetId: 'wb-1',
        metadata: expect.objectContaining({
          from: 'AT_DESTINATION_HUB',
          attempted: 'DELIVERED',
          reason: 'illegal_transition',
          source: 'epod.capture',
        }),
      }),
    );
    // A refused state must not have moved the parcel or the POD.
    expect(tx.waybill.updateMany).not.toHaveBeenCalled();
    expect(tx.electronicPod.create).not.toHaveBeenCalled();
  });

  it('a parcel that failed its first attempt can be delivered on the retry visit', async () => {
    const { svc, audit, tx } = makeHarness({ status: 'FAILED_DELIVERY' });

    const pod = await svc.capture('co-1', DTO, { driverId: 'drv-1' });

    expect(pod.status).toBe('CAPTURED');
    expect(tx.waybill.updateMany).toHaveBeenCalled();
    // A legal transition is not a rejection — nothing on the audit rail.
    expect(audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'waybill.transition_rejected' }),
    );
  });

  it('lets an operations role capture on behalf of the assigned driver', async () => {
    const { svc, tx } = makeHarness();
    const pod = await svc.capture('co-1', DTO, { userId: 'u-dispatch', role: 'DISPATCH' });
    expect(pod.status).toBe('CAPTURED');
    expect(tx.electronicPod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ driverId: 'drv-1' }) }),
    );
  });

  it('refuses an ops capture naming a driver from another company', async () => {
    const { svc, prisma } = makeHarness();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      svc.capture('co-1', { ...DTO, driverId: 'drv-other' }, { userId: 'u-disp', role: 'DISPATCH' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('EpodService.capture — atomicity and duplicates', () => {
  it('writes evidence, waybill, shipment and tracking event in ONE transaction', async () => {
    const { svc, prisma, tx } = makeHarness();

    const pod = await svc.capture('co-1', DTO, { driverId: 'drv-1' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.waybill.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'wb-1', companyId: 'co-1', podDeliveredAt: null }),
        data: expect.objectContaining({ status: 'DELIVERED' }),
      }),
    );
    expect(tx.electronicPod.create).toHaveBeenCalled();
    expect(tx.shipment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { waybillId: 'wb-1', companyId: 'co-1' } }),
    );
    expect(tx.trackingEvent.create).toHaveBeenCalled();
    expect(pod).toMatchObject({ waybillId: 'wb-1', driverId: 'drv-1', status: 'CAPTURED' });
  });

  it('REGRESSION: a second ePOD for the same waybill is refused', async () => {
    const { svc } = makeHarness();
    await svc.capture('co-1', DTO, { driverId: 'drv-1' });

    await expect(svc.capture('co-1', DTO, { driverId: 'drv-1' })).rejects.toThrow(ConflictException);
  });

  it('REGRESSION: two concurrent captures — exactly one wins, the other gets a 409', async () => {
    const { svc, db, tx } = makeHarness();

    const results = await Promise.allSettled([
      svc.capture('co-1', DTO, { driverId: 'drv-1' }),
      svc.capture('co-1', DTO, { driverId: 'drv-1' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    // Only one POD row exists: the loser never created evidence.
    expect(db.pods).toHaveLength(1);
    expect(tx.electronicPod.create).toHaveBeenCalledTimes(1);
  });

  it('refuses an existing ePOD row even if the waybill status was rolled back', async () => {
    const { svc, prisma, db } = makeHarness();
    db.pods.push({ id: 'epod-9', waybillId: 'wb-1', companyId: 'co-1', status: 'CAPTURED' });
    expect((prisma.electronicPod.findFirst as jest.Mock).getMockImplementation()).toBeTruthy();
    await expect(svc.capture('co-1', DTO, { driverId: 'drv-1' })).rejects.toThrow(
      /already exists for this waybill/,
    );
  });
});

describe('EpodService.verify / dispute', () => {
  it('only verifies a CAPTURED pod, via a compare-and-set', async () => {
    const { svc, prisma, tx, db } = makeHarness();
    db.pods.push({ id: 'epod-1', waybillId: 'wb-1', companyId: 'co-1', status: 'CAPTURED' });
    const updateMany = jest.fn(async () => ({ count: 1 }));
    (tx as any).electronicPod.updateMany = updateMany; // CAS now runs inside the tx
    (prisma as any).electronicPod.findFirst = jest.fn(async () => db.pods[0]);

    const result = await svc.verify('epod-1', 'co-1', { verifiedBy: 'ops@co.za' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'epod-1', companyId: 'co-1', status: 'CAPTURED' } }),
    );
    expect(result).toBeTruthy();
  });

  it('refuses to verify a pod that is not captured', async () => {
    const { svc, prisma, tx, db } = makeHarness();
    db.pods.push({ id: 'epod-1', waybillId: 'wb-1', companyId: 'co-1', status: 'DISPUTED' });
    (tx as any).electronicPod.updateMany = jest.fn(async () => ({ count: 0 }));
    (prisma as any).electronicPod.findFirst = jest.fn(async () => db.pods[0]);
    await expect(svc.verify('epod-1', 'co-1', {})).rejects.toThrow(ConflictException);
  });

  it('a dispute needs a reason', async () => {
    const { svc, prisma, db } = makeHarness();
    db.pods.push({ id: 'epod-1', waybillId: 'wb-1', companyId: 'co-1', status: 'CAPTURED' });
    (prisma as any).electronicPod.findFirst = jest.fn(async () => db.pods[0]);
    await expect(svc.dispute('epod-1', 'co-1', { reason: '   ' })).rejects.toThrow(BadRequestException);
  });
});

describe('EpodService.getStats', () => {
  it('reports verificationRate as null (not 0%) when nothing has been captured', async () => {
    const { svc } = makeHarness();
    const stats = await svc.getStats('co-1');
    expect(stats).toMatchObject({ total: 0, verificationRate: null });
  });
});

describe('EpodService.resolveDispute — the money gate', () => {
  it('CLEARED restores the POD to VERIFIED and billing may flow', async () => {
    const { svc, db, outbox } = makeHarness();
    db.pods = [{ id: 'epod-1', status: 'DISPUTED', waybillId: 'wb-1' }];
    const res = await svc.resolveDispute('epod-1', 'co-1', {
      resolution: 'CLEARED', resolvedBy: 'ops@client.co.za', note: 'wrong POD attached',
    });
    expect(res.status).toBe('VERIFIED');
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.anything(), 'co-1', 'epod.dispute_resolved', expect.objectContaining({ resolution: 'CLEARED' }));
  });

  it('UPHELD keeps the POD DISPUTED — the hold stands', async () => {
    const { svc, db } = makeHarness();
    db.pods = [{ id: 'epod-1', status: 'DISPUTED', waybillId: 'wb-1' }];
    const res = await svc.resolveDispute('epod-1', 'co-1', {
      resolution: 'UPHELD', resolvedBy: 'ops@client.co.za', note: 'goods damaged',
    });
    expect(res.status).toBe('DISPUTED');
    expect(res.disputeResolution).toBe('UPHELD');
  });

  it('refuses to resolve something that is not disputed', async () => {
    const { svc, db } = makeHarness();
    db.pods = [{ id: 'epod-1', status: 'VERIFIED', waybillId: 'wb-1' }];
    await expect(
      svc.resolveDispute('epod-1', 'co-1', { resolution: 'CLEARED', resolvedBy: 'ops@client.co.za' }),
    ).rejects.toThrow('Only a disputed ePOD can be resolved');
  });

  it('refuses a second resolution of the same dispute (CAS)', async () => {
    const { svc, db } = makeHarness();
    db.pods = [{ id: 'epod-1', status: 'DISPUTED', waybillId: 'wb-1' }];
    // UPHELD keeps status DISPUTED — a second attempt passes the status guard
    // and must die on the CAS (`disputeResolvedAt: null`).
    await svc.resolveDispute('epod-1', 'co-1', { resolution: 'UPHELD', resolvedBy: 'a' });
    await expect(
      svc.resolveDispute('epod-1', 'co-1', { resolution: 'CLEARED', resolvedBy: 'b' }),
    ).rejects.toThrow('already resolved');
  });
});
