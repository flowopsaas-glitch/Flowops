import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ANY_AUTHENTICATED_KEY } from '../decorators/any-authenticated.decorator';
import { OWNER_ONLY_KEY } from '../decorators/owner-only.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handlers = [context.getHandler(), context.getClass()];

    // @OwnerOnly routes belong to the platform-owner identity and are
    // enforced by OwnerAuthGuard; tenant role metadata does not apply.
    // (Strict === true: SetMetadata stores the literal `true`.)
    if (this.reflector.getAllAndOverride<boolean>(OWNER_ONLY_KEY, handlers) === true) {
      return true;
    }

    // @Public routes have no tenant user at all (JwtAuthGuard skipped them):
    // a class-level @Roles must not lock them out. Without this, putting
    // @Roles on a mixed controller silently 403s its public routes — the
    // OAuth callback and the token-based truck-appointment shared view were
    // both one class decorator away from exactly that.
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, handlers) === true) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, handlers);

    if (!requiredRoles || requiredRoles.length === 0) {
      // @AnyAuthenticated is a deliberate decision: any signed-in tenant role
      // may use the route (self-service surfaces). It satisfies strict mode.
      if (this.reflector.getAllAndOverride<boolean>(ANY_AUTHENTICATED_KEY, handlers) === true) {
        return true;
      }

      // A route with NO access decision at all is reachable by any
      // authenticated role. That is only tolerated while RBAC_STRICT is off;
      // the ratchet end-state (docs/SECURITY-REVIEW-RBAC-TENANT-2026-10-01.md)
      // is that `npm run rbac:inventory -- --check` reports zero such routes,
      // at which point RBAC_STRICT=true rejects any future undecided route
      // instead of silently publishing it.
      //
      // This branch MUST stay above the user check: @Public routes pass
      // through this guard with no authenticated user and must not be
      // rejected here.
      if (process.env.RBAC_STRICT === 'true') {
        throw new ForbiddenException(
          'This route has no @Roles metadata and RBAC_STRICT is enabled',
        );
      }
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Access denied');

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `This action requires one of these roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
