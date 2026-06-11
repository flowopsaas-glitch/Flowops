import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DriverAnalyticsService } from './driver-analytics.service';

@Controller('driver-analytics')
@UseGuards(JwtAuthGuard)
export class DriverAnalyticsController {
  constructor(private readonly analyticsService: DriverAnalyticsService) {}

  @Get('overview')
  async getOverview(@Request() req: any, @Query('companyId') companyId?: string) {
    const user = req.user;
    const targetCompanyId = companyId ? parseInt(companyId) : user.companyId;
    return this.analyticsService.getOverview(targetCompanyId);
  }

  @Get('performance')
  async getDriverPerformance(
    @Request() req: any,
    @Query('companyId') companyId?: string,
    @Query('days') days?: string,
  ) {
    const user = req.user;
    const targetCompanyId = companyId ? parseInt(companyId) : user.companyId;
    const daysBack = days ? parseInt(days) : 30;
    return this.analyticsService.getDriverPerformance(targetCompanyId, daysBack);
  }

  @Get('metrics')
  async getMetrics(@Request() req: any, @Query('companyId') companyId?: string) {
    const user = req.user;
    const targetCompanyId = companyId ? parseInt(companyId) : user.companyId;
    return this.analyticsService.getMetrics(targetCompanyId);
  }
}
