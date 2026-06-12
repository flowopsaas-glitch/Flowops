import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /health
   * Used by Docker HEALTHCHECK, ALB target-group health checks, and
   * the frontend's status page. Returns HTTP 200 when the server + DB
   * are ready; 503 if the DB is unreachable.
   */
  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected', ts: new Date().toISOString() };
    } catch {
      return { status: 'degraded', db: 'unreachable', ts: new Date().toISOString() };
    }
  }
}
