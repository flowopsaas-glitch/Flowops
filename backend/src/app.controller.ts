import { Body, Controller, Get, Post } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './common/decorators/public.decorator';
import { AuthService } from './auth/auth.service';

@Controller()
export class AppController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /** GET /health — no JWT required */
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
   * POST /api/v1/driver-portal/login
   * The compiled driver portal JS calls this exact path.
   * After patching the bundle base URL to localhost:3000 this route is hit.
   */
  @Public()
  @Post('driver-portal/login')
  driverPortalLogin(@Body() body: { phone: string; pin: string }) {
    return this.authService.driverLogin(body.phone, body.pin);
  }
}
