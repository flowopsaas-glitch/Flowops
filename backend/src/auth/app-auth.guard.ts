import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { DevAuthGuard } from './dev-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly devAuthGuard: DevAuthGuard,
    private readonly jwtAuthGuard: JwtAuthGuard,
  ) {}

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();

    // 🚀 THE FLOWOPS SURGE BYPASS
    // This allows the stress test to bypass BOTH dev and production guards.
    if (req.headers['x-stress-test'] === 'flowops-secret-123') {
      req.user = { 
        id: 'stress-tester', 
        roles: ['ADMIN'], 
        companyId: 'test-env' 
      };
      return true;
    }

    // Check if the route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Standard Auth Logic
    if (process.env.NODE_ENV === 'production') {
      return this.jwtAuthGuard.canActivate(context);
    }

    return this.devAuthGuard.canActivate(context);
  }
}
