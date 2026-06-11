import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdvancedAnalyticsService } from './advanced-analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AdvancedAnalyticsController {
  constructor(private readonly analyticsService: AdvancedAnalyticsService) {}

  /**
   * 👑 ADMIN DASHBOARD - Strategic & Financial Metrics
   * Accessible by ADMIN and MANAGER roles
   */
  @Get('admin')
  async getAdminDashboard(
    @Request() req: any,
    @Query('period') period: '7d' | '30d' | '90d' = '30d',
  ) {
    const companyId = req.user?.companyId || 1;
    return this.analyticsService.getAdminDashboard(companyId, period);
  }

  /**
   * 🎧 DISPATCHER DASHBOARD - Operational Metrics
   * Accessible by DISPATCHER, ADMIN, and MANAGER roles
   */
  @Get('dispatcher')
  async getDispatcherDashboard(@Request() req: any) {
    const companyId = req.user?.companyId || 1;
    return this.analyticsService.getDispatcherDashboard(companyId);
  }

  /**
   * 📊 COMBINED DASHBOARD - Smart routing based on user role
   */
  @Get('smart')
  async getSmartDashboard(
    @Request() req: any,
    @Query('period') period: '7d' | '30d' | '90d' = '30d',
  ) {
    const companyId = req.user?.companyId || 1;
    const userRole = req.user?.role || 'DISPATCHER';

    // Admins get strategic view, dispatchers get operational view
    if (userRole === 'ADMIN' || userRole === 'MANAGER') {
      return this.analyticsService.getAdminDashboard(companyId, period);
    } else {
      return this.analyticsService.getDispatcherDashboard(companyId);
    }
  }
}
