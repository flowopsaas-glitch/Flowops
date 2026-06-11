import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Role } from '../roles.enum'; // ✅ local enum
import { RequestWithUser } from '../request-with-user.interface';

@Injectable()
export class CompanyAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userRole = request.user?.role;
    return userRole === Role.COMPANY_ADMIN || userRole === Role.SUPER_ADMIN;
  }
}

