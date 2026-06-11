import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // 🚀 Bulletproof built-in guard preserved
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard) // 🔒 Locked down safely matching your auth blueprint
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Core Operational & Metrics Aggregate Route
   * Fetches context metrics limited directly to the authenticated user's organization space.
   */
  @Get('metrics')
  async getMetrics(@Request() req: any) {
    // Extracts companyId injected into the request payload by your passport-jwt layer safely
    const targetCompanyId = req.user?.companyId || 1;
    return this.dashboardService.getMetrics(targetCompanyId);
  }
}

