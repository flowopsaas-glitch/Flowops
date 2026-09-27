import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // A route with no @Roles metadata is reachable by ANY authenticated role
    // (576 of 668 routes today). Enforcing globally would lock out real users
    // until every route has deliberate role metadata, so strict mode is opt-in:
    // set RBAC_STRICT=true once `npm run rbac:inventory` shows none missing.
    //
    // This branch MUST stay above the user check: @Public routes pass through
    // this guard with no authenticated user and must not be rejected here.
    if (!requiredRoles || requiredRoles.length === 0) {
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
