import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { OWNER_ONLY_KEY } from '../decorators/owner-only.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const handlers = [context.getHandler(), context.getClass()];

    // Genuinely public routes (health, tracking, login) — no JWT required.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, handlers);
    if (isPublic) return true;

    // Owner-only routes are authenticated by OwnerAuthGuard with the
    // `jwt-owner` strategy; the tenant strategy (type: 'tenant') must stand
    // down or it would reject every owner token before that guard runs.
    // @OwnerOnly() is explicit metadata — NOT @Public() — so the route is never
    // anonymous: OwnerAuthGuard fails closed without it.
    const ownerOnly = this.reflector.getAllAndOverride<boolean>(OWNER_ONLY_KEY, handlers);
    if (ownerOnly) return true;

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
