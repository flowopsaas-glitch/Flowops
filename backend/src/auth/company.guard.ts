// src/auth/company.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from "@nestjs/common";

@Injectable()
export class CompanyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Allow SUPER_ADMIN to bypass company context check
    if (user && user.role === "SUPER_ADMIN") {
      return true;
    }

    if (!user || !user.companyId) {
      throw new ForbiddenException("Company context missing");
    }
    return true;
  }
}
