import { Controller, Get, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CommercialAnalyticsService } from './commercial-analytics.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('Commercial Analytics')
@ApiBearerAuth()
@Controller('commercial-analytics')
export class CommercialAnalyticsController {
  constructor(private readonly svc: CommercialAnalyticsService) {}

  /** GET /commercial-analytics/config — cost model configuration */
  @Get('config')
  getConfig(@CurrentUser() u: any) {
    return this.svc.getConfig(u.companyId);
  }

  /** PATCH /commercial-analytics/config — update cost model */
  @Patch('config')
  updateConfig(@CurrentUser() u: any, @Body() dto: any) {
    return this.svc.updateConfig(u.companyId, dto);
  }

  /** GET /commercial-analytics/profitability — main dashboard */
  @Get('profitability')
  getProfitability(@CurrentUser() u: any, @Query('period') period?: string) {
    return this.svc.getProfitabilityDashboard(u.companyId, period);
  }

  /** GET /commercial-analytics/clients — client profitability matrix */
  @Get('clients')
  getClientMatrix(@CurrentUser() u: any, @Query('period') period?: string) {
    return this.svc.getClientMatrix(u.companyId, period);
  }

  /** GET /commercial-analytics/lanes — lane/route profitability */
  @Get('lanes')
  getLanes(@CurrentUser() u: any, @Query('period') period?: string) {
    return this.svc.getLaneProfitability(u.companyId, period);
  }

  /** GET /commercial-analytics/quotes — quote conversion funnel */
  @Get('quotes')
  getQuoteFunnel(@CurrentUser() u: any, @Query('period') period?: string) {
    return this.svc.getQuoteFunnel(u.companyId, period);
  }

  /** GET /commercial-analytics/rate-cards — rate card performance */
  @Get('rate-cards')
  getRateCards(@CurrentUser() u: any) {
    return this.svc.getRateCardPerformance(u.companyId);
  }

  /** GET /commercial-analytics/forecast — revenue forecasting */
  @Get('forecast')
  getForecast(@CurrentUser() u: any) {
    return this.svc.getRevenueForecast(u.companyId);
  }

  /** GET /commercial-analytics/intelligence — client CLV & churn */
  @Get('intelligence')
  getIntelligence(@CurrentUser() u: any) {
    return this.svc.getClientIntelligence(u.companyId);
  }

  /** GET /commercial-analytics/ai-insights — AI copilot analysis */
  @Get('ai-insights')
  getAiInsights(@CurrentUser() u: any) {
    return this.svc.getAiInsights(u.companyId);
  }

  /** GET /commercial-analytics/report — full commercial report */
  @Get('report')
  getFullReport(@CurrentUser() u: any, @Query('period') period?: string) {
    return this.svc.getFullReport(u.companyId, period);
  }
}
