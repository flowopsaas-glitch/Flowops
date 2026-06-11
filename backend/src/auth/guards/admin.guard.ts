import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    if (!user) {
      throw new ForbiddenException('No user context')
    }

    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access only')
    }

    if (!user.organisationId) {
      throw new ForbiddenException('User not linked to an organisation')
    }

    return true
  }
}
