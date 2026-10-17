import { ConflictException } from '@nestjs/common';
import { FleetMaintenanceService } from './fleet-maintenance.service';

function makeHarness() {
  const rows: any[] = [];
  const driver = { id: 'driver-1', companyId: 'company-1', currentKm: 1000 };
  let nextId = 1;
  const tx = {
    vehicleService: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id) return rows.find((row) => row.id === where.id) ?? null;
        const key = where.driverId_idempotencyKey;
        return rows.find((row) => row.driverId === key.driverId && row.idempotencyKey === key.idempotencyKey) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `service-${nextId++}`, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        let result = rows.filter((row) => row.driverId === where.driverId);
        if (where.serviceType) result = result.filter((row) => row.serviceType === where.serviceType);
        if (where.aiPredictedNextDate?.not === null) result = result.filter((row) => row.aiPredictedNextDate != null);
        return result.sort((a, b) => b.servicedAt.getTime() - a.servicedAt.getTime());
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = rows.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    driver: {
      updateMany: jest.fn(async ({ data }: any) => {
        if (data.currentKm > (driver.currentKm ?? 0)) driver.currentKm = data.currentKm;
        return { count: 1 };
      }),
      update: jest.fn(async ({ data }: any) => Object.assign(driver, data)),
    },
  };
  const prisma = {
    driver: { findFirst: jest.fn().mockResolvedValue(driver) },
    vehicleService: {
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.driverId_idempotencyKey;
        return rows.find((row) => row.driverId === key.driverId && row.idempotencyKey === key.idempotencyKey) ?? null;
      }),
    },
    $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)),
  };
  const service = new FleetMaintenanceService(prisma as any, {} as any);
  return { service, prisma, tx, rows, driver };
}

const request = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: '00000000-0000-4000-8000-000000000005',
  driverId: 'driver-1',
  serviceType: 'Oil Change',
  kmAtService: 1200,
  cost: 500,
  notes: 'Routine service',
  ...overrides,
});

describe('FleetMaintenanceService.logService', () => {
  it('commits service, odometer, prediction and next-service state in one transaction', async () => {
    const { service, prisma, tx, driver } = makeHarness();

    const result = await service.logService('company-1', request() as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.vehicleService.create).toHaveBeenCalledTimes(1);
    expect(tx.driver.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'driver-1', companyId: 'company-1' }),
      data: { currentKm: 1200 },
    }));
    expect(tx.vehicleService.update).toHaveBeenCalledTimes(1);
    expect(tx.driver.update).toHaveBeenCalledTimes(1);
    expect(driver.currentKm).toBe(1200);
    expect(result).toMatchObject({ idempotencyKey: request().idempotencyKey, requestFingerprint: expect.any(String) });
  });

  it('returns the original record on retry and does not add a second cost/service row', async () => {
    const { service, tx, rows } = makeHarness();
    const body = request() as any;

    const first = await service.logService('company-1', body);
    const replay = await service.logService('company-1', body);

    expect(replay.id).toBe(first.id);
    expect(rows).toHaveLength(1);
    expect(tx.vehicleService.create).toHaveBeenCalledTimes(1);
  });

  it('rejects reusing a key for a different maintenance request', async () => {
    const { service, rows } = makeHarness();
    await service.logService('company-1', request() as any);

    await expect(service.logService('company-1', request({ cost: 700 }) as any)).rejects.toThrow(ConflictException);
    expect(rows).toHaveLength(1);
  });
});
