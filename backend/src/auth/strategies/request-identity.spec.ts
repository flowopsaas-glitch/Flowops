import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { JwtOwnerStrategy } from './jwt-owner.strategy';
import { DriverAuthGuard } from '../../common/guards/driver-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * What a validated request identity may carry.
 *
 * `req.user` / `req.driver` are readable by every guard, interceptor, handler
 * and error reporter downstream, and any of them can serialise the object into
 * a response or a log line. The rows these strategies load hold credentials:
 * `User.passwordHash`, `User.resetToken` (a working password-reset credential),
 * `User.verifyToken`, `OwnerUser.passwordHash` and `Driver.driverPin` (a bcrypt
 * hash of a 4-6 digit portal PIN). They are now stripped at the source, so no
 * handler can leak what is not there.
 */
const config = () => ({ get: jest.fn().mockReturnValue('unit-test-secret') }) as unknown as ConfigService;

const tenantRow = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  companyId: 'co1',
  email: 'dispatch@co.com',
  name: 'Dispatch One',
  role: 'DISPATCH',
  isActive: true,
  passwordHash: '$2b$12$storedpasswordhashstoredpasswordha',
  resetToken: 'live-reset-token',
  verifyToken: 'live-verify-token',
  activeSessionId: 'session-abc',
  lastActiveAt: new Date(),
  company: { id: 'co1', name: 'Co One', isActive: true },
  ...over,
});

const ownerRow = (over: Record<string, unknown> = {}) => ({
  id: 'own1',
  email: 'owner@flowops.co.za',
  name: 'Platform Owner',
  role: 'OWNER',
  passwordHash: '$2b$12$ownerpasswordhashownerpasswordhas',
  ...over,
});

const driverRow = (over: Record<string, unknown> = {}) => ({
  id: 'drv1',
  companyId: 'co1',
  name: 'Sipho Dlamini',
  phone: '+27821234567',
  isActive: true,
  driverPin: '$2b$12$storedpinhashstoredpinhashstoredp',
  ratingToken: 'rating-bearer-token',
  activeSessionId: 'session-abc',
  ...over,
});

const CREDENTIALS = ['passwordHash', 'resetToken', 'verifyToken'];

describe('request identity carries no credentials', () => {
  describe('JwtStrategy (tenant routes)', () => {
    const makePrisma = (row: unknown) =>
      ({
        user: {
          findFirst: jest.fn().mockResolvedValue(row),
          update: jest.fn().mockResolvedValue(row),
        },
      }) as unknown as PrismaService & { user: { findFirst: jest.Mock; update: jest.Mock } };

    it('returns the profile with every credential stripped', async () => {
      const prisma = makePrisma(tenantRow());
      const strategy = new JwtStrategy(config(), prisma);

      const user = (await strategy.validate({
        type: 'tenant',
        sub: 'u1',
        companyId: 'co1',
      } as any)) as Record<string, unknown>;

      for (const field of CREDENTIALS) expect(user).not.toHaveProperty(field);
      expect(user).not.toHaveProperty('activeSessionId');
      // Everything a handler legitimately needs is still there.
      expect(user.id).toBe('u1');
      expect(user.companyId).toBe('co1');
      expect(user.role).toBe('DISPATCH');
      expect(user.company).toEqual({ id: 'co1', name: 'Co One', isActive: true });
      // A fresh heartbeat must not trigger a write on every request.
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('still rejects a non-tenant payload, an unknown user and a suspended company', async () => {
      const strategy = new JwtStrategy(config(), makePrisma(tenantRow()));
      await expect(strategy.validate({ type: 'driver', sub: 'u1' } as any)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(
        new JwtStrategy(config(), makePrisma(null)).validate({ type: 'tenant', sub: 'u1' } as any),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        new JwtStrategy(
          config(),
          makePrisma(tenantRow({ company: { id: 'co1', name: 'Co One', isActive: false } })),
        ).validate({ type: 'tenant', sub: 'u1', companyId: 'co1' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('still enforces the single-active-session rule (it reads activeSessionId before stripping)', async () => {
      const strategy = new JwtStrategy(config(), makePrisma(tenantRow()));
      await expect(
        strategy.validate({ type: 'tenant', sub: 'u1', companyId: 'co1', sid: 'older-session' } as any),
      ).rejects.toThrow(UnauthorizedException);

      const ok = (await strategy.validate({
        type: 'tenant',
        sub: 'u1',
        companyId: 'co1',
        sid: 'session-abc',
      } as any)) as Record<string, unknown>;
      expect(ok.id).toBe('u1');
      expect(ok).not.toHaveProperty('activeSessionId');
    });
  });

  describe('JwtOwnerStrategy (owner console)', () => {
    const makePrisma = (row: unknown) =>
      ({
        ownerUser: { findUnique: jest.fn().mockResolvedValue(row) },
      }) as unknown as PrismaService;

    it('returns the owner without the password hash', async () => {
      const strategy = new JwtOwnerStrategy(config(), makePrisma(ownerRow()));
      const owner = (await strategy.validate({ type: 'owner', sub: 'own1' } as any)) as Record<
        string,
        unknown
      >;

      expect(owner).not.toHaveProperty('passwordHash');
      expect(owner.id).toBe('own1');
      expect(owner.email).toBe('owner@flowops.co.za');
    });

    it('still rejects a non-owner payload and an unknown owner', async () => {
      await expect(
        new JwtOwnerStrategy(config(), makePrisma(ownerRow())).validate({
          type: 'tenant',
          sub: 'own1',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        new JwtOwnerStrategy(config(), makePrisma(null)).validate({ type: 'owner', sub: 'own1' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('DriverAuthGuard (driver portal)', () => {
    const runGuard = async (row: unknown, sid = 'session-abc') => {
      const prisma = { driver: { findFirst: jest.fn().mockResolvedValue(row) } };
      const jwt = { verify: jest.fn().mockReturnValue({ type: 'driver', sub: 'drv1', sid }) };
      const guard = new DriverAuthGuard(
        jwt as unknown as JwtService,
        config(),
        prisma as unknown as PrismaService,
      );
      const req: Record<string, any> = { headers: { authorization: 'Bearer driver-token' } };
      const context = {
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;
      await guard.canActivate(context);
      return req;
    };

    it('attaches the driver without the PIN hash or the rating token', async () => {
      const req = await runGuard(driverRow());

      expect(req.driver).not.toHaveProperty('driverPin');
      expect(req.driver).not.toHaveProperty('ratingToken');
      // The portal handlers read exactly these three off req.driver.
      expect(req.driver.id).toBe('drv1');
      expect(req.driver.companyId).toBe('co1');
      expect(req.driver.name).toBe('Sipho Dlamini');
    });

    it('still enforces the single-active-session rule', async () => {
      await expect(runGuard(driverRow(), 'an-older-session')).rejects.toThrow(UnauthorizedException);
    });

    it('still refuses a driver that no longer exists or was deactivated', async () => {
      await expect(runGuard(null)).rejects.toThrow(UnauthorizedException);
    });
  });
});
