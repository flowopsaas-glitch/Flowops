import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TripCostType } from '@prisma/client';
import { TripCostsService } from './trip-costs.service';

const makePrisma = () => ({
  driver: {
    findFirst: jest.fn().mockResolvedValue({ id: 'driver-1', currentKm: 100_000 }),
    update: jest.fn().mockResolvedValue({}),
  },
  waybill: { findFirst: jest.fn().mockResolvedValue({ id: 'wb-1' }) },
  manifest: { findFirst: jest.fn().mockResolvedValue({ id: 'mf-1' }) },
  tripCostEntry: {
    create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'entry-1', ...data })),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue({ id: 'entry-1' }),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({}),
  },
});

const baseDto = { type: TripCostType.FUEL, amount: 850, driverId: 'driver-1' };

describe('TripCostsService', () => {
  it('creates an entry scoped to the caller company and stamps the actor', async () => {
    const prisma = makePrisma();
    const svc = new TripCostsService(prisma as any);
    const entry = await svc.create('company-a', baseDto as any, undefined, { id: 'user-1' });
    expect(entry.companyId).toBe('company-a');
    expect(entry.createdBy).toBe('user-1');
    expect(entry.source).toBe('OFFICE');
    expect(prisma.driver.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'driver-1', companyId: 'company-a' } }),
    );
  });

  it('rejects a driver from another tenant', async () => {
    const prisma = makePrisma();
    prisma.driver.findFirst.mockResolvedValue(null);
    const svc = new TripCostsService(prisma as any);
    await expect(svc.create('company-a', baseDto as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tripCostEntry.create).not.toHaveBeenCalled();
  });

  it('rejects waybill and manifest links from another tenant', async () => {
    const prisma = makePrisma();
    prisma.waybill.findFirst.mockResolvedValue(null);
    const svc = new TripCostsService(prisma as any);
    await expect(
      svc.create('company-a', { ...baseDto, waybillId: 'wb-other' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    const prisma2 = makePrisma();
    prisma2.manifest.findFirst.mockResolvedValue(null);
    const svc2 = new TripCostsService(prisma2 as any);
    await expect(
      svc2.create('company-a', { ...baseDto, manifestId: 'mf-other' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores litres only for fuel and never rewinds the odometer', async () => {
    const prisma = makePrisma();
    const svc = new TripCostsService(prisma as any);

    const toll = await svc.create('company-a', {
      type: TripCostType.TOLL, amount: 120, driverId: 'driver-1', litres: 40, odometerKm: 90_000,
    } as any);
    expect(toll.litres).toBeNull();
    expect(prisma.driver.update).not.toHaveBeenCalled();

    const fuel = await svc.create('company-a', { ...baseDto, litres: 38.5, odometerKm: 101_250 } as any);
    expect(fuel.litres).toBe(38.5);
    expect(prisma.driver.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { currentKm: 101_250 },
    });
  });

  it('rejects future-dated costs beyond clock-skew tolerance', async () => {
    const prisma = makePrisma();
    const svc = new TripCostsService(prisma as any);
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await expect(
      svc.create('company-a', { ...baseDto, occurredAt: future } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists with filter totals and reports summary counts honestly', async () => {
    const prisma = makePrisma();
    prisma.tripCostEntry.count.mockResolvedValue(3);
    prisma.tripCostEntry.groupBy
      .mockResolvedValueOnce([
        { type: 'FUEL', _sum: { amount: 1700 }, _count: { _all: 2 } },
        { type: 'TOLL', _sum: { amount: 120 }, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { driverId: 'driver-1', _sum: { amount: 1820 }, _count: { _all: 3 } },
      ]);
    prisma.driver.findMany = jest.fn().mockResolvedValue([
      { id: 'driver-1', name: 'Sam Driver', vehicleReg: 'CA 123' },
    ]);
    const svc = new TripCostsService(prisma as any);

    const list = await svc.list('company-a', {});
    expect(list.totals).toEqual({
      byType: { FUEL: { total: 1700, count: 2 }, TOLL: { total: 120, count: 1 } },
      total: 1820,
      count: 3,
    });

    const summary = await svc.summary('company-a');
    expect(summary.entryCount).toBe(3);
    expect(summary.byDriver[0]).toMatchObject({ driverName: 'Sam Driver', total: 1820, count: 3 });
  });

  it('remove is tenant-scoped: another tenant entry is not found, not deleted', async () => {
    const prisma = makePrisma();
    prisma.tripCostEntry.findFirst.mockResolvedValue(null);
    const svc = new TripCostsService(prisma as any);
    await expect(svc.remove('company-a', 'entry-other')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tripCostEntry.delete).not.toHaveBeenCalled();
  });
});
