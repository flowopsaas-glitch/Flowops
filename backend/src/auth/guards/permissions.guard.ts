// src/auth/guards/permissions.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { RequestWithUser } from '../request-with-user.interface';
import { Permission, ROLE_PERMISSIONS } from '../role-hierarchy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions: Permission[] =
      this.reflector.get<Permission[]>(PERMISSIONS_KEY, context.getHandler()) || [];
    if (!requiredPermissions.length) return true;

    const request: RequestWithUser = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    const rolePermissions = ROLE_PERMISSIONS[user.role as keyof typeof ROLE_PERMISSIONS];
    return requiredPermissions.every((perm) => rolePermissions.includes(perm));
  }
}


