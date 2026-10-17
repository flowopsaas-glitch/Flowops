import { BadRequestException, ConflictException } from '@nestjs/common';
import { CollectionStatus } from '@prisma/client';
import { CollectionsService } from './collections.service';

function makeHarness(status: CollectionStatus = CollectionStatus.PENDING) {
  const collection: any = {
    id: 'collection-1',
    companyId: 'company-1',
    status,
    clientName: 'Test Client',
    clientPhone: '+27123456789',
    clientEmail: null,
    pickupAddress: 'Johannesburg',
    notes: null,
    driverId: status === CollectionStatus.ASSIGNED ? 'driver-1' : null,
    driver: null,
  };
  const tx = {
    collection: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findFirst: jest.fn(async (): Promise<any> => ({ status: CollectionStatus.COLLECTED })),
    },
    waybill: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'waybill-1', trackingNumber: 'FO-TEST', status: 'COLLECTED' }),
    },
    shipment: { create: jest.fn().mockResolvedValue({ id: 'shipment-1' }) },
    trackingEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
  };
  const prisma = {
    collection: {
      findFirst: jest.fn(async () => collection),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    driver: {
      findFirst: jest.fn().mockResolvedValue({ id: 'driver-1', companyId: 'company-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    company: { findUnique: jest.fn().mockResolvedValue({ country: 'ZA' }) },
    waybill: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)),
  };
  const geo = { smartResolve: jest.fn(), geocode: jest.fn() };
  const notifications = { notifyCollectionScheduled: jest.fn() };
  const push = { notifyDriver: jest.fn() };
  const compliance = { evaluate: jest.fn().mockResolvedValue({ compliant: true, blockers: [] }), filterDispatchable: jest.fn() };
  const service = new CollectionsService(prisma as any, geo as any, notifications as any, push as any, compliance as any);
  return { service, prisma, tx, collection, geo, notifications, push, compliance };
}

describe('CollectionsService state integrity', () => {
  it('does not reopen a cancelled collection', async () => {
    const { service, prisma } = makeHarness(CollectionStatus.CANCELLED);
    await expect(service.update('collection-1', 'company-1', { status: CollectionStatus.PENDING }))
      .rejects.toThrow(BadRequestException);
    expect(prisma.collection.updateMany).not.toHaveBeenCalled();
  });

  it('does not allow the generic update route to mark a collection collected', async () => {
    const { service, prisma } = makeHarness(CollectionStatus.PENDING);
    await expect(service.update('collection-1', 'company-1', { status: CollectionStatus.COLLECTED }))
      .rejects.toThrow(BadRequestException);
    expect(prisma.collection.updateMany).not.toHaveBeenCalled();
  });

  it('does not reopen a failed collection; create a new collection for a new attempt', async () => {
    const { service, prisma } = makeHarness(CollectionStatus.FAILED);
    await expect(service.update('collection-1', 'company-1', { status: CollectionStatus.PENDING }))
      .rejects.toThrow(BadRequestException);
    expect(prisma.collection.updateMany).not.toHaveBeenCalled();
  });

  it('cancels with a status compare-and-set and releases assigned custody', async () => {
    const { service, prisma } = makeHarness(CollectionStatus.ASSIGNED);
    await service.cancel('collection-1', 'company-1');
    expect(prisma.collection.updateMany).toHaveBeenCalledWith({
      where: { id: 'collection-1', companyId: 'company-1', status: CollectionStatus.ASSIGNED, driverId: 'driver-1' },
      data: { status: CollectionStatus.CANCELLED, driverId: null },
    });
  });

  it('assigns only a driver from the collection tenant with an eligible-state CAS', async () => {
    const { service, prisma, tx, push } = makeHarness(CollectionStatus.PENDING);
    await service.assignDriver('collection-1', 'company-1', 'driver-1');
    expect(prisma.driver.findFirst).toHaveBeenCalledWith({ where: { id: 'driver-1', companyId: 'company-1' } });
    expect(prisma.collection.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'collection-1',
        companyId: 'company-1',
        driverId: null,
        status: { in: [CollectionStatus.PENDING, CollectionStatus.ASSIGNED] },
      },
      data: { driverId: 'driver-1', status: CollectionStatus.ASSIGNED },
    });
    expect(push.notifyDriver).toHaveBeenCalledWith('driver-1');
    expect(tx.collection.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to confirm a cancelled collection before entering a transaction', async () => {
    const { service, prisma } = makeHarness(CollectionStatus.CANCELLED);
    await expect(service.confirmCollected('collection-1', 'company-1', {})).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('claims only eligible source states and creates the waybill in the same transaction', async () => {
    const { service, prisma, tx } = makeHarness(CollectionStatus.PENDING);
    const result = await service.confirmCollected('collection-1', 'company-1', {});
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.collection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'collection-1',
        companyId: 'company-1',
        driverId: null,
        status: { in: [CollectionStatus.PENDING, CollectionStatus.ASSIGNED, CollectionStatus.IN_PROGRESS] },
      },
    }));
    expect(tx.waybill.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sourceCollectionId: 'collection-1', companyId: 'company-1' }),
    }));
    expect(result).toMatchObject({ success: true, awaitingDepotReceive: true });
  });

  it('returns a conflict if a compare-and-set loses to cancellation rather than claiming a replay', async () => {
    const { service, tx } = makeHarness(CollectionStatus.PENDING);
    tx.collection.updateMany.mockResolvedValue({ count: 0 });
    tx.collection.findFirst.mockResolvedValue({ status: CollectionStatus.CANCELLED });
    tx.waybill.findFirst.mockResolvedValue(null);

    await expect(service.confirmCollected('collection-1', 'company-1', {})).rejects.toThrow(ConflictException);
  });
});
