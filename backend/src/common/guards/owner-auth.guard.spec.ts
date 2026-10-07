import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OwnerAuthGuard } from './owner-auth.guard';
import { OWNER_ONLY_KEY } from '../decorators/owner-only.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Owner-auth regression tests.
 *
 * The failure mode being pinned down: an owner-only route (platform-admin
 * surface — approve tenants, see every company) becoming reachable without
 * owner credentials because of decorator conflicts or a missing guard. Every
 * test here answers the same question: "can a tenant user, or nobody at all,
 * reach an owner handler?" The answer must always be no.
 */

/** Build a fake ExecutionContext carrying the given metadata. */
function contextWith(metadata: {
  ownerOnly?: boolean;
  isPublic?: boolean;
}): { ctx: ExecutionContext; reflector: { getAllAndOverride: jest.Mock } } {
  const metadataMap = new Map<any, any>();
  if (metadata.ownerOnly !== undefined) metadataMap.set(OWNER_ONLY_KEY, metadata.ownerOnly);
  if (metadata.isPublic !== undefined) metadataMap.set(IS_PUBLIC_KEY, metadata.isPublic);

  const reflector = {
    getAllAndOverride: jest.fn((key: any) => metadataMap.get(key)),
  };

  const ctx = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
  } as unknown as ExecutionContext;

  return { ctx, reflector };
}

describe('OwnerAuthGuard', () => {
  function makeGuard(metadata: { ownerOnly?: boolean; isPublic?: boolean }) {
    const { ctx, reflector } = contextWith(metadata);
    const guard = new OwnerAuthGuard(reflector as unknown as Reflector);
    // The Passport base class would run the strategy; we only exercise the
    // metadata contract here, so stub the strategy call.
    const parent = jest
      .spyOn(Object.getPrototypeOf(OwnerAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true as any);
    return { guard, ctx, parent };
  }

  afterEach(() => jest.restoreAllMocks());

  describe('canActivate — metadata contract', () => {
    it('refuses an owner route that is missing @OwnerOnly() (fails closed)', () => {
      const { guard, ctx } = makeGuard({});
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow(/must be marked with @OwnerOnly/);
    });

    it('refuses a route that is both @Public() and @OwnerOnly()', () => {
      const { guard, ctx } = makeGuard({ ownerOnly: true, isPublic: true });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow(/must NOT use @Public\(\)/);
    });

    it('allows an @OwnerOnly() route to reach the JWT strategy', () => {
      const { guard, ctx, parent } = makeGuard({ ownerOnly: true, isPublic: false });
      expect(guard.canActivate(ctx)).toBe(true);
      expect(parent).toHaveBeenCalled();
    });
  });

  describe('handleRequest — principal checks', () => {
    const guard = new OwnerAuthGuard({ getAllAndOverride: () => true } as any);

    it('rejects an unauthenticated request', () => {
      expect(() => guard.handleRequest(null, null)).toThrow(UnauthorizedException);
    });

    it('accepts an owner principal', () => {
      const owner = { id: 'owner-1', type: 'owner', email: 'owner@flowops.io' };
      expect(guard.handleRequest(null, owner)).toBe(owner);
    });

    it('accepts an owner row that carries no tenant company (legacy shape)', () => {
      const owner = { id: 'owner-2', role: 'OWNER', companyId: null };
      expect(guard.handleRequest(null, owner)).toBe(owner);
    });

    it('rejects a tenant ADMIN principal presented as an owner', () => {
      const tenantAdmin = {
        id: 'user-1',
        role: 'ADMIN',
        companyId: 'company-1',
        company: { id: 'company-1' },
      };
      expect(() => guard.handleRequest(null, tenantAdmin)).toThrow(ForbiddenException);
    });

    it('rejects a disabled owner account', () => {
      const disabled = { id: 'owner-3', type: 'owner', isActive: false };
      expect(() => guard.handleRequest(null, disabled)).toThrow(ForbiddenException);
      expect(() => guard.handleRequest(null, disabled)).toThrow(/disabled/);
    });

    it('propagates a strategy error instead of falling through to a user', () => {
      const boom = new Error('token expired');
      expect(() => guard.handleRequest(boom, null)).toThrow(boom);
    });
  });
});
