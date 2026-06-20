import { Body, Controller, Get, Post } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { AuthService } from './auth/auth.service';

import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /**
   * GET /health
   * @Public — no JWT required so Docker/ALB health checks work without auth.
   *
   * Used by Docker HEALTHCHECK, ALB target-group health checks, and
   * the frontend's status page. Returns HTTP 200 when the server + DB
   * are ready; 503 if the DB is unreachable.
   */
  @Public()
  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected', ts: new Date().toISOString() };
    } catch {
      return { status: 'degraded', db: 'unreachable', ts: new Date().toISOString() };
    }
  }

  /**
   * POST /driver-portal/login  (root-level alias, no /auth/ prefix)
   * The standalone driver portal PWA calls this exact path.
   * Also available as POST /auth/driver-portal/login in AuthController.
   */
  @Public()
  @Post('driver-portal/login')
  driverPortalLogin(@Body() body: { phone: string; pin: string }) {
    return this.authService.driverLogin(body.phone, body.pin);
  }
}
