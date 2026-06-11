import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class CompanyScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // 👑 Super-Admin bypass
    if (user.isSuperAdmin === true) {
      return true;
    }

    const companyParam =
      request.params.companyId ||
      request.body.companyId ||
      request.query.companyId;

    if (!companyParam) {
      return true;
    }

    if (companyParam !== user.companyId) {
      throw new ForbiddenException('Cross-company access denied');
    }

    return true;
  }
}
