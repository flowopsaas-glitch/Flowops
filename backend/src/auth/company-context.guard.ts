// src/auth/company-context.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { RequestWithUser } from './request-with-user.interface';

@Injectable()
export class CompanyContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user;

    if (user) {
      req.companyId = user.companyId;
    }
    return true;
  }
}