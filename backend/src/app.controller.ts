import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.service';
import { AuthService } from './auth/auth.service';
import { HealthSentinelService } from './common/guards/health-sentinel.service';

import { Public } from './common/decorators/public.decorator';

@Controller()
@SkipThrottle() // health/diagnostics — must not be rate-limited (Docker/PM2 probes)
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly healthSentinel: HealthSentinelService,
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
      const sentinel = this.healthSentinel.getStatus();
      if (!sentinel.healthy) {
        return { status: 'degraded', issues: sentinel.issues, ts: new Date().toISOString() };
      }
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected', uptime: Math.round(process.uptime()), ts: new Date().toISOString() };
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
  // This controller is @SkipThrottle() for health probes, but a LOGIN route must
  // still be rate-limited — re-enable throttling on just this method, matching
  // the AuthController driver-login limit. Without this, this alias was a
  // completely unthrottled PIN-guessing endpoint.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('driver-portal/login')
  driverPortalLogin(@Body() body: { phone: string; pin: string }, @Req() req: any) {
    const cf = req?.headers?.['cf-connecting-ip'];
    const xff = req?.headers?.['x-forwarded-for'];
    const ip = (cf && String(Array.isArray(cf) ? cf[0] : cf).trim())
      || (xff && String(Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim())
      || req?.ip;
    return this.authService.driverLogin(body.phone, body.pin, {
      ip,
      userAgent: req?.headers?.['user-agent'],
    });
  }
}
