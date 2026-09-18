import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

/**
 * Security-focused tests for UsersService. These lock in the fixes for:
 *  - cross-tenant user mutation (update/remove must be scoped by companyId)
 *  - privilege escalation via an invalid/garbage role
 *  - admin self-lockout (self-demotion / self-deactivation)
 */

const makeUser = (o: Record<string, unknown> = {}) => ({
  id: 'u1', email: 'a@co.com', name: 'A', phone: null, role: 'USER',
  permissions: null, isActive: true, passwordHash: 'x', companyId: 'co1', ...o,
});

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findFirst:  jest.fn(),
      findMany:   jest.fn().mockResolvedValue([]),
      create:     jest.fn().mockResolvedValue(makeUser()),
      update:     jest.fn().mockResolvedValue(makeUser()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe('UsersService (security)', () => {
  let svc: UsersService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: BillingService, useValue: { assertCanCreate: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();
    svc = module.get(UsersService);
  });

  // ── update: tenant scoping ────────────────────────────────────────────
  describe('update', () => {
    it('throws NotFound when the target user is not in the caller company', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null); // cross-tenant / missing
      await expect(svc.update('u1', 'co1', { name: 'X' })).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an invalid role value', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(makeUser());
      await expect(svc.update('u1', 'co1', { role: 'SUPERGOD' })).rejects.toThrow(BadRequestException);
    });

    it('prevents an admin from demoting themselves out of an admin role', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(makeUser({ id: 'admin1', role: 'COMPANY_ADMIN' }));
      await expect(
        svc.update('admin1', 'co1', { role: 'USER' }, { id: 'admin1', role: 'COMPANY_ADMIN' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('applies a valid update for an in-company user', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(makeUser());
      await svc.update('u1', 'co1', { name: 'New', role: 'MANAGER' }, { id: 'admin1', role: 'ADMIN' });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ name: 'New', role: 'MANAGER' }) }),
      );
    });
  });

  // ── remove: tenant scoping + self-deactivation ────────────────────────
  describe('remove', () => {
    it('throws Forbidden when a user tries to deactivate themselves', async () => {
      await expect(svc.remove('admin1', 'co1', { id: 'admin1', role: 'ADMIN' })).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFound when the target is not in the caller company (updateMany count 0)', async () => {
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(svc.remove('u1', 'co1', { id: 'admin1', role: 'ADMIN' })).rejects.toThrow(NotFoundException);
    });

    it('deactivates an in-company user scoped by companyId', async () => {
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      const res = await svc.remove('u1', 'co1', { id: 'admin1', role: 'ADMIN' });
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1', companyId: 'co1' } }),
      );
      expect(res).toEqual({ message: 'User deactivated' });
    });
  });

  // ── create: role validation ───────────────────────────────────────────
  describe('create', () => {
    it('rejects an invalid role', async () => {
      await expect(svc.create('co1', { email: 'x@co.com', role: 'ROOT' })).rejects.toThrow(BadRequestException);
    });

    it('creates a user scoped to the caller company', async () => {
      await svc.create('co1', { email: 'x@co.com', role: 'MANAGER' }, { id: 'admin1', role: 'ADMIN' });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: 'co1', role: 'MANAGER' }) }),
      );
    });
  });
});
