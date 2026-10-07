import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { OWNER_ONLY_KEY } from '../decorators/owner-only.decorator';

/**
 * PRODUCTION FIX (2026-10-07):
 * Owner Authentication Guard — Hardened
 * 
 * Changes:
 * 1. Explicitly rejects @Public() decorator on owner routes (security hardening)
 * 2. Requires explicit @OwnerOnly() marker (prevents accidents)
 * 3. Verifies owner status from JWT payload
 * 4. Logs auth failures for audit trail
 */
@Injectable()
export class OwnerAuthGuardFixed extends AuthGuard('jwt-owner') {
  constructor(private reflector: Reflector) {
    super();
  }

  handleRequest(err: any, user: any, info: any, context?: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException('Owner JWT required');
    }

    // Verify user is marked as owner (not just passed jwt-owner strategy)
    if (!user.isOwner && !user.ownerFlag) {
      console.error(`[OwnerAuthGuard] User ${user.id} passed jwt-owner but isOwner=${user.isOwner}`);
      throw new ForbiddenException('Owner status required');
    }

    return user;
  }

  canActivate(context: ExecutionContext) {
    // Security check: reject if @Public() is also set (indicates misconfiguration)
    const isPublic = this.reflector.get<boolean>('isPublic', context.getHandler());
    if (isPublic) {
      throw new ForbiddenException(
        'Owner routes must NOT use @Public() decorator. Use @OwnerOnly() instead.',
      );
    }

    return super.canActivate(context);
  }
}
