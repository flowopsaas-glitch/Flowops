import { Body, Controller, Get, Headers, HttpCode, Ip, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ObservabilityService } from './observability.service';
import { Public } from '../common/decorators/public.decorator';

interface ClientErrorDto {
  message?: string;
  stack?: string;
  path?: string;
  level?: 'error' | 'warning';
}

interface IntegrityBeaconDto {
  host?: string;
  origin?: string;
  ref?: string;
  buildId?: string;
  path?: string;
}

@ApiTags('Observability')
@Controller('observability')
export class ObservabilityController {
  // Lightweight in-memory rate limit so the public ingest can't be flooded.
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly LIMIT = 60; // per window
  private readonly WINDOW_MS = 60_000;

  constructor(private readonly observability: ObservabilityService) {}

  private allowed(ip: string): boolean {
    const now = Date.now();
    const rec = this.hits.get(ip);
    if (!rec || now > rec.resetAt) {
      this.hits.set(ip, { count: 1, resetAt: now + this.WINDOW_MS });
      return true;
    }
    rec.count += 1;
    return rec.count <= this.LIMIT;
  }

  /**
   * POST /api/v1/observability/client-error
   * Public ingest for frontend JS errors (ErrorBoundary + window handlers).
   * Always 204 so the reporter never surfaces noise to the user.
   */
  @Public()
  @Post('client-error')
  @HttpCode(204)
  @ApiOperation({ summary: 'Ingest a frontend runtime error into the CLAW Observatory' })
  async clientError(
    @Body() body: ClientErrorDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    if (!body?.message || !this.allowed(ip || 'unknown')) return;
    await this.observability
      .capture({
        source: 'frontend',
        level: body.level === 'warning' ? 'warning' : 'error',
        message: body.message,
        stack: body.stack,
        path: body.path,
        context: { userAgent },
      })
      .catch(() => undefined);
  }

  /**
   * GET /api/v1/observability/integrity-beacon
   * Clone tripwire. The frontend calls this (cross-origin, as a simple GET so it
   * dodges CORS preflight) only when the bundle is served from a host that is
   * NOT on the canonical allow-list — i.e. someone has deployed a verbatim copy
   * of the FlowOps build elsewhere. Recorded into the CLAW Observatory
   * (source: 'integrity') so the owner is alerted. Always 204.
   *
   * This does not — and cannot — stop a clone; a public web UI is inherently
   * copyable. It gives the owner fast visibility of impersonation/clones.
   */
  @Public()
  @Get('integrity-beacon')
  @HttpCode(204)
  @ApiOperation({ summary: 'Report a FlowOps bundle served from an unrecognised host' })
  async integrityBeacon(
    @Query() q: IntegrityBeaconDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    if (!this.allowed(ip || 'unknown')) return;
    const host = String(q?.host || q?.origin || 'unknown').slice(0, 200);
    await this.observability
      .capture({
        source: 'integrity',
        level: 'warning',
        message: `Possible clone: FlowOps bundle served from unrecognised host "${host}"`,
        path: q?.path,
        context: {
          host,
          origin: q?.origin,
          referrer: q?.ref,
          buildId: q?.buildId,
          userAgent,
          reportedIp: ip,
        },
      })
      .catch(() => undefined);
  }
}
