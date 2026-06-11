// backend/src/auth/guards/verified.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Assumes you have a working AuthGuard/Passport session

    if (!user || !user.isVerified) {
      throw new ForbiddenException('Only verified FlowOps customers can perform this action.');
    }

    return true;
  }
}
