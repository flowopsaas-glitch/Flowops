import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class CompanyHardLockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // Placeholder: allow all requests
    // Replace with real logic if needed
    return true;
  }
}
