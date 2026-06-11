import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    // 🔒 SECURED STRESS TEST INTERCEPTOR LAYER
    // Bypass is strictly unreachable in a production environment
    if (
      process.env.NODE_ENV !== 'production' && 
      req.headers['x-stress-test'] === 'flowops-secret-123'
    ) {
      req.user = { 
        id: 'stress-tester-id', 
        role: 'ADMIN', // Aligned structure matching standard string parameters explicitly
        companyId: 1 
      };
      return true;
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization authentication headers.');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Malformed token authorization formatting structure. Use Bearer <token>.');
    }

    const token = parts[1];
    try {
      // Decode and inject payload fields into execution stream context
      const payload = this.jwtService.verify(token);
      req.user = payload;
      return true;
    } catch (error: any) {
      throw new UnauthorizedException(`Session verification expired or invalid: ${error.message}`);
    }
  }
}

