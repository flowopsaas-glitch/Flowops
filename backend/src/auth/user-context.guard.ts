import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class UserContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest(); // use the global Request type

    if (!request.prismaUserContext) {
      throw new ForbiddenException('Forbidden resource');
    }

    const { id, role, companyId } = request.prismaUserContext;
    request.user = { id, role, companyId };

    return true;
  }
}
