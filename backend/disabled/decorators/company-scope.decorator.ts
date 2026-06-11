import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { COMPANY_SCOPE_KEY } from '../decorators/company-scope.decorator';

@Injectable()
export class CompanyScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const field = this.reflector.getAllAndOverride<string>(
      COMPANY_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No company scope required
    if (!field) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.companyId) {
      throw new ForbiddenException('Company context missing');
    }

    // Look for companyId in params OR body
    const targetCompanyId =
      request.params?.[field] ??
      request.body?.[field];

    if (!targetCompanyId) {
      throw new ForbiddenException(
        `Missing required company identifier (${field})`,
      );
    }

    if (targetCompanyId !== user.companyId) {
      throw new ForbiddenException(
        'Access denied: cross-company request blocked',
      );
    }

    return true;
  }
}
