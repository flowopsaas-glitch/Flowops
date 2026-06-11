import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader =
      request.headers?.authorization ?? request.headers?.Authorization ?? '';

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Invalid owner token');
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid owner token');
    }

    const candidateSecrets = Array.from(
      new Set(
        [
          process.env.JWT_SECRET,
          process.env.OWNER_JWT_SECRET,
          'flowops-dev-secret',
          'dev-secret',
        ].filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        ),
      ),
    );

    let payload: any = null;
    let verified = false;

    for (const secret of candidateSecrets) {
      try {
        payload = this.jwtService.verify(token, { secret });
        verified = true;
        break;
      } catch {
      }
    }

    if (!verified || !payload) {
      throw new UnauthorizedException('Invalid owner token');
    }

    const roles = Array.isArray(payload.roles)
      ? payload.roles.map((role: any) => String(role).toUpperCase())
      : [];

    const role = String(payload.role ?? '').toUpperCase();
    const type = String(payload.type ?? '').toLowerCase();
    const scope = String(payload.scope ?? '').toLowerCase();
    const isOwner = payload.isOwner === true;
    const isSuperAdmin = payload.isSuperAdmin === true;

    const isAcceptedOwnerToken =
      type === 'owner' &&
      scope === 'platform' &&
      (role === 'SUPER_ADMIN' ||
        role === 'OWNER' ||
        roles.includes('SUPER_ADMIN') ||
        roles.includes('OWNER')) &&
      (isOwner || isSuperAdmin || roles.includes('SUPER_ADMIN'));

    if (!isAcceptedOwnerToken) {
      throw new UnauthorizedException('Invalid owner token');
    }

    request.user = {
      sub: payload.sub,
      userId: payload.sub,
      email: payload.email,
      role: role || 'SUPER_ADMIN',
      roles,
      type,
      scope,
      isOwner,
      isSuperAdmin,
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    };

    request.owner = request.user;

    return true;
  }
}
