import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LogisticsAnalyticsService } from './logistics-analytics.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
const LOGISTICS_ANALYTICS_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.VIEWER,
];


@ApiTags('Logistics Analytics')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('logisticsAnalytics')
@Roles(...LOGISTICS_ANALYTICS_READ_ROLES)
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
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post('refresh')
  refresh(@CurrentUser() u: any) {
    return this.svc.refreshAnalytics(u.companyId);
  }
}
