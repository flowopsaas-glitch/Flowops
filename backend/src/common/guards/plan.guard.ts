import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class PlanGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // Subscription plans not enforced yet
    return true;
  }
}
