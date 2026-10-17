import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { FleetMaintenanceService } from '../fleet-maintenance/fleet-maintenance.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { LogServiceDto } from '../fleet-maintenance/dto/log-service.dto';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

describe('legacy driver service-log route', () => {
  const tenantId = 'tenant-1';
  const routeDriverId = 'driver-from-route';
  const idempotencyKey = '00000000-0000-4000-8000-000000000021';

  it('restricts the legacy cost-record route to fleet managers and administrators', () => {
    expect(Reflect.getMetadata(ROLES_KEY, DriversController.prototype.logService)).toEqual([
      UserRole.ADMIN,
      UserRole.COMPANY_ADMIN,
      UserRole.MANAGER,
    ]);
  });

  it('forwards the route driver and stable idempotency key to the shared atomic service', async () => {
    const persisted = { id: 'service-1', driverId: routeDriverId, idempotencyKey };
    const prisma = {
      driver: {
        findFirst: jest.fn().mockResolvedValue({ id: routeDriverId, companyId: tenantId }),
      },
    } as unknown as PrismaService;
    const logService = jest.fn().mockResolvedValue(persisted);
    const fleet = { logService } as unknown as FleetMaintenanceService;
    const service = new DriversService(prisma, {} as BillingService, fleet);
    const controller = new DriversController(service, {} as any);
    const body = {
      idempotencyKey,
      // The legacy route binds the driver in the URL; a body value must never
      // redirect a maintenance write to a different driver.
      driverId: 'attacker-selected-driver',
      serviceType: 'Oil Change',
      kmAtService: 1200,
      cost: 500,
    } as LogServiceDto;

    await expect(controller.logService(routeDriverId, { companyId: tenantId }, body)).resolves.toBe(persisted);
    expect(prisma.driver.findFirst).toHaveBeenCalledWith({
      where: { id: routeDriverId, companyId: tenantId },
    });
    expect(logService).toHaveBeenCalledWith(tenantId, {
      ...body,
      driverId: routeDriverId,
    });
    expect(logService.mock.calls[0][0]).toBe(tenantId);
    expect(logService.mock.calls[0][1].idempotencyKey).toBe(idempotencyKey);
  });

  it('does not delegate a route for another tenant or nonexistent driver', async () => {
    const prisma = {
      driver: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const fleet = { logService: jest.fn() } as unknown as FleetMaintenanceService;
    const service = new DriversService(prisma, {} as BillingService, fleet);

    await expect(service.logService(routeDriverId, tenantId, {
      idempotencyKey,
      driverId: routeDriverId,
      serviceType: 'Oil Change',
    } as LogServiceDto)).rejects.toThrow(NotFoundException);
    expect(fleet.logService).not.toHaveBeenCalled();
  });
});
