import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class OrgMemberGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // Organisation membership not enforced yet
    return true;
  }
}
