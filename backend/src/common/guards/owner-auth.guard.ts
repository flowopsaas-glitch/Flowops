import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { OWNER_ONLY_KEY } from '../decorators/owner-only.decorator';

/**
 * Platform-owner authentication guard.
 *
 * Contract, enforced in `canActivate` before any credential is looked at:
 *   1. the handler/class MUST carry `@OwnerOnly()` (fail closed otherwise);
 *   2. it MUST NOT carry `@Public()` — "public" and "owner only" are mutually
 *      exclusive, and allowing both is how an owner route becomes anonymous
 *      when someone shuffles decorators or route order;
 *   3. only then does the `jwt-owner` Passport strategy run. That strategy
 *      verifies the signature, requires `payload.type === 'owner'`, and loads
 *      the OwnerUser row — a tenant JWT (even an ADMIN one) cannot satisfy it.
 */
@Injectable()
export class OwnerAuthGuard extends AuthGuard('jwt-owner') {
  private readonly logger = new Logger(OwnerAuthGuard.name);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Owner authentication required');
    }

    // Defence in depth: the strategy already proved this is an OwnerUser row,
    // but a future strategy change must not be able to hand a tenant user to an
    // owner handler. OwnerUser has no `companyId`; User always has one.
    const looksLikeOwner =
      user.type === 'owner' ||
      (user.companyId == null && (user.isActive === undefined || user.isActive !== false));
    if (!looksLikeOwner) {
      this.logger.error(
        `[OwnerAuthGuard] rejected principal ${user?.id ?? 'unknown'} — owner claims not present`,
      );
      throw new ForbiddenException('Owner credentials required');
    }

    if (user.isActive === false) {
      throw new ForbiddenException('Owner account is disabled');
    }

    return user;
  }

  canActivate(context: ExecutionContext) {
    const handlers = [context.getHandler(), context.getClass()];

    const ownerOnly = this.reflector.getAllAndOverride<boolean>(OWNER_ONLY_KEY, handlers);
    if (!ownerOnly) {
      // Fail closed: an owner route without explicit metadata is a
      // misconfiguration, not an anonymous route.
      throw new ForbiddenException(
        'Owner routes must be marked with @OwnerOnly() (and must not rely on @Public()).',
      );
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, handlers);
    if (isPublic) {
      throw new ForbiddenException(
        'Owner routes must NOT use @Public(). Remove @Public() and keep @OwnerOnly() with OwnerAuthGuard.',
      );
    }

    return super.canActivate(context);
  }
}
