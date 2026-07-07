import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LogisticsAnalyticsService } from './logistics-analytics.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('Logistics Analytics')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('logisticsAnalytics')
@Controller('logistics-analytics')
export class LogisticsAnalyticsController {
  constructor(private readonly svc: LogisticsAnalyticsService) {}

  /**
   * GET /logistics-analytics
   * Returns the latest analytics snapshot for the current company.
   * Optional query: ?period=2026-07 (defaults to current month).
   */
  @Get()
  getAnalytics(@CurrentUser() u: any, @Query('period') period?: string) {
    return this.svc.getAnalytics(u.companyId, period);
  }

  /**
   * GET /logistics-analytics/trends
   * Returns multi-period trend data (last 6 months).
   */
  @Get('trends')
  getTrends(@CurrentUser() u: any) {
    return this.svc.getTrends(u.companyId);
  }

  /**
   * POST /logistics-analytics/refresh
   * Force-recalculates the current period's analytics and regenerates AI insights.
   */
  @Post('refresh')
  refresh(@CurrentUser() u: any) {
    return this.svc.refreshAnalytics(u.companyId);
  }
}
