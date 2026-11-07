import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { NotFoundException } from '@nestjs/common';
import { DriversService, withoutDriverSecrets } from './drivers.service';
import { BillingService } from '../billing/billing.service';
import { FleetMaintenanceService } from '../fleet-maintenance/fleet-maintenance.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('$2b$12$freshlyhashedpin') }));

/**
 * Credential material that must never leave a DriversService read.
 *
 * `driverPin` is a bcrypt hash of the 4-6 digit PIN a driver signs in with. A
 * PIN has at most 10^6 combinations, so an attacker who gets the hash can crack
 * it offline in seconds - serving it is much closer to serving the PIN than to
 * serving a password hash. `ratingToken` is a bearer capability.
 *
 * Before this fix `findAll`/`findOne` returned the whole row, so GET /drivers
 * and GET /drivers/:id served both to every role that can read drivers (ADMIN,
 * COMPANY_ADMIN, MANAGER, DISPATCH and VIEWER), and `create`/`update`/`remove`
 * returned the row they had just written.
 */
const STORED_PIN = '$2b$12$storedpinhashstoredpinhashstoredp';
const STORED_RATING = 'rating-bearer-token';

const storedDriver = (over: Record<string, unknown> = {}) => ({
  id: 'drv-1',
  companyId: 'co-1',
  name: 'Sipho Dlamini',
  phone: '+27821234567',
  vehicleReg: 'BBZ 123-456',
  status: 'ACTIVE',
  isActive: true,
  driverPin: STORED_PIN,
  ratingToken: STORED_RATING,
  failedPinAttempts: 0,
  pinLockedUntil: null,
  ...over,
});

type MockPrisma = { driver: Record<string, jest.Mock> };

const makePrisma = (): MockPrisma => ({
  driver: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
});

const makeService = (prisma: MockPrisma) =>
  new DriversService(
    prisma as unknown as PrismaService,
    { assertCanCreate: jest.fn().mockResolvedValue(undefined) } as unknown as BillingService,
    {} as FleetMaintenanceService,
  );

/** Assert a response carries the driver's real data but none of its secrets. */
const expectRedacted = (row: Record<string, unknown>) => {
  expect(row).not.toHaveProperty('driverPin');
  expect(row).not.toHaveProperty('ratingToken');
  expect(row.id).toBe('drv-1');
  expect(row.name).toBe('Sipho Dlamini');
  expect(row.phone).toBe('+27821234567');
  // Lockout state is operational, not secret: dispatch needs to see it.
  expect(row.failedPinAttempts).toBe(0);
  // The drivers screen's "PIN SET" badge was driven by !!driverPin, so the
  // redacted row answers the only question that was actually being asked.
  expect(row.hasPinSet).toBe(true);
};

describe('DriversService credential redaction', () => {
  describe('withoutDriverSecrets', () => {
    it('removes the PIN hash and the rating token and keeps everything else', () => {
      const out = withoutDriverSecrets(storedDriver()) as unknown as Record<string, unknown>;
      expectRedacted(out);
      expect(Object.keys(out).sort()).toEqual(
        [...Object.keys(storedDriver()).filter((k) => k !== 'driverPin' && k !== 'ratingToken'), 'hasPinSet'].sort(),
      );
    });

    it('reports hasPinSet false for a driver who has never been given a PIN', () => {
      const out = withoutDriverSecrets(storedDriver({ driverPin: null })) as unknown as Record<string, unknown>;
      expect(out.hasPinSet).toBe(false);
      expect(out).not.toHaveProperty('driverPin');
    });

    it('does not mutate the stored row (the database object keeps its hash)', () => {
      const row = storedDriver();
      withoutDriverSecrets(row);
      expect(row.driverPin).toBe(STORED_PIN);
      expect(row.ratingToken).toBe(STORED_RATING);
    });

    it('passes null, undefined and non-objects straight through', () => {
      expect(withoutDriverSecrets(null)).toBeNull();
      expect(withoutDriverSecrets(undefined)).toBeUndefined();
    });
  });

  describe('read paths', () => {
    it('GET /drivers: findAll strips the credential from every row and keeps the include', async () => {
      const prisma = makePrisma();
      prisma.driver.findMany.mockResolvedValue([
        { ...storedDriver(), branch: { id: 'br-1', name: 'Gate 4' } },
        { ...storedDriver({ id: 'drv-2', name: 'Thandi Nkosi' }), branch: null },
      ]);

      const rows = (await makeService(prisma).findAll('co-1', { status: 'ACTIVE' })) as unknown as Record<string, unknown>[];

      expect(rows).toHaveLength(2);
      expectRedacted(rows[0]);
      expect(rows[0].hasPinSet).toBe(true);
      expect(rows[0].branch).toEqual({ id: 'br-1', name: 'Gate 4' });
      expect(rows[1]).not.toHaveProperty('driverPin');
      expect(rows[1].id).toBe('drv-2');
    });

    it('GET /drivers/:id: findOne strips the credential but still 404s across tenants', async () => {
      const prisma = makePrisma();
      prisma.driver.findFirst.mockResolvedValue(storedDriver());
      expectRedacted((await makeService(prisma).findOne('drv-1', 'co-1')) as unknown as Record<string, unknown>);

      prisma.driver.findFirst.mockResolvedValue(null);
      await expect(makeService(prisma).findOne('drv-1', 'other-co')).rejects.toThrow(NotFoundException);
    });

    it('findMine strips the credential and still returns null when no driver is linked', async () => {
      const prisma = makePrisma();
      prisma.driver.findFirst.mockResolvedValue(storedDriver());
      expectRedacted((await makeService(prisma).findMine('usr-1', 'co-1')) as unknown as Record<string, unknown>);

      prisma.driver.findFirst.mockResolvedValue(null);
      expect(await makeService(prisma).findMine('usr-1', 'co-1')).toBeNull();
    });
  });

  describe('write paths that echo the row back', () => {
    it('create does not return the hash of the PIN it just set', async () => {
      const prisma = makePrisma();
      prisma.driver.create.mockResolvedValue(storedDriver());

      const created = (await makeService(prisma).create('co-1', {
        name: 'Sipho Dlamini',
        phone: '+27821234567',
        pin: '4321',
      })) as unknown as Record<string, unknown>;

      expectRedacted(created);
      // The hash was still WRITTEN - only the response is redacted.
      expect(prisma.driver.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ driverPin: '$2b$12$freshlyhashedpin' }),
        }),
      );
    });

    it('update does not return the stored hash', async () => {
      const prisma = makePrisma();
      prisma.driver.findFirst.mockResolvedValue(storedDriver());
      prisma.driver.update.mockResolvedValue(storedDriver());

      const updated = (await makeService(prisma).update('drv-1', 'co-1', {
        name: 'Sipho D.',
      })) as unknown as Record<string, unknown>;
      expectRedacted(updated);
    });

    it('remove (deactivate) does not return the stored hash', async () => {
      const prisma = makePrisma();
      prisma.driver.findFirst.mockResolvedValue(storedDriver());
      prisma.driver.update.mockResolvedValue(storedDriver({ isActive: false }));

      const removed = (await makeService(prisma).remove('drv-1', 'co-1')) as unknown as Record<string, unknown>;
      expectRedacted(removed);
      expect(removed.isActive).toBe(false);
    });

    it('setPin and resetPin still answer with an explicit id/name/phone select', async () => {
      const prisma = makePrisma();
      prisma.driver.findFirst.mockResolvedValue(storedDriver());
      prisma.driver.update.mockResolvedValue({ id: 'drv-1', name: 'Sipho Dlamini', phone: '+27821234567' });

      await makeService(prisma).setPin('drv-1', 'co-1', '4321');
      await makeService(prisma).resetPin('drv-1', 'co-1');

      for (const call of prisma.driver.update.mock.calls) {
        expect(call[0].select).toEqual({ id: true, name: true, phone: true });
      }
      expect(prisma.driver.update.mock.calls[0][0].data.driverPin).toBe('$2b$12$freshlyhashedpin');
      expect(prisma.driver.update.mock.calls[1][0].data.driverPin).toBeNull();
    });
  });

  describe('PIN login is independent of these reads', () => {
    /**
     * Redaction is only safe because driver-portal PIN authentication never goes
     * through DriversService: AuthService verifies the PIN against a row it
     * reads from Prisma itself. These assertions pin that independence, so a
     * future refactor that routes PIN login through findOne() fails here rather
     * than silently locking every driver out of the portal.
     */
    const authSource = fs.readFileSync(
      path.join(__dirname, '..', 'auth', 'auth.service.ts'),
      'utf8',
    );

    it('AuthService does not depend on DriversService at all', () => {
      expect(authSource).not.toMatch(/DriversService/);
    });

    it('driver PIN verification reads the driver row straight from Prisma', () => {
      expect(authSource).toMatch(/const candidates = await this\.prisma\.driver\.findMany\(/);
      expect(authSource).toMatch(/if \(!\(driver as any\)\.driverPin\)/);
    });
  });
});
