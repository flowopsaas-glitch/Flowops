import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth/auth.service';
import { HealthSentinelService } from './common/guards/health-sentinel.service';

import { Public } from './common/decorators/public.decorator';

@Controller()
@SkipThrottle() // health/diagnostics — must not be rate-limited (Docker/PM2 probes)
export class AppController {
  constructor(
    private readonly authService: AuthService,
    private readonly healthSentinel: HealthSentinelService,
  ) {}

  /**
   * GET /health — INTERNAL probe, not reachable through the ingress.
   *
   * nginx proxies only `/api/` and `/socket.io/`, so this path answers inside
   * the compose network (Docker HEALTHCHECK, compose healthcheck, deploy
   * scripts, CI) and nowhere else. The public equivalent is
   * GET /api/v1/health (PublicHealthController).
   *
   * Always returns HTTP 200: this shape is consumed by shell probes that read
   * the body (`wget -qO- … || true`), and flipping it to 503 on a transient DB
   * blip would mark the container unhealthy and stall `depends_on:
   * service_healthy` on the next boot. The public route *does* signal 503,
   * because a monitor there only reads the status code.
   */
  @Public()
  @Get('health')
  async health() {
    const probe = await this.healthSentinel.probe();
    return probe.status === 'ok'
      ? { status: 'ok', db: probe.db, uptime: probe.uptime, ts: probe.ts }
      : { status: 'degraded', db: probe.db, uptime: probe.uptime, issues: probe.issues, ts: probe.ts };
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
