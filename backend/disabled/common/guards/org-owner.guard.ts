import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class OrgOwnerGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // Organisation ownership not enforced yet
    return true;
  }
}
