import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class CompanyAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const companyIdFromRoute = Number(request.params.companyId);

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.role !== 'COMPANY_ADMIN') {
      throw new ForbiddenException('Company admin access required');
    }

    if (user.companyId !== companyIdFromRoute) {
      throw new ForbiddenException('Cross-company access denied');
    }

    return true;
  }
}
