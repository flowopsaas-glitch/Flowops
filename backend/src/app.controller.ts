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

  @Public()
  @Post('driver-portal/login')
  driverPortalLogin(@Body() body: { phone: string; pin: string }) {
    return this.authService.driverLogin(body.phone, body.pin);
  }
}
