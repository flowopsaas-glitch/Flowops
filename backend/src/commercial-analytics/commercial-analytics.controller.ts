import { Controller, Get, Patch, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CommercialAnalyticsService } from './commercial-analytics.service';
import { TripTruthService } from './trip-truth.service';
import { ProfitabilitySnapshotService } from './profitability-snapshot.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { UpdateCommercialConfigDto } from './dto/commercial-config.dto';
const COMMERCIAL_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.VIEWER,
];


@ApiTags('Commercial Analytics')
@ApiBearerAuth()
@RequireFeature('commercialAnalytics')
@Roles(...COMMERCIAL_READ_ROLES)
@Controller('commercial-analytics')
export class CommercialAnalyticsController {
  constructor(
    private readonly svc: CommercialAnalyticsService,
    private readonly tripTruth: TripTruthService,
    private readonly snapshots: ProfitabilitySnapshotService,
  ) {}

  /** GET /commercial-analytics/config — cost model configuration */
  @Get('config')
  getConfig(@CurrentUser() u: any) {
    return this.svc.getConfig(u.companyId);
  }

  /** PATCH /commercial-analytics/config — update cost model */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Patch('config')
  updateConfig(@CurrentUser() u: any, @Body() dto: UpdateCommercialConfigDto) {
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

  /** POST /commercial-analytics/trip-truth/recompute — (re)build per-trip cost truth for a period */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post('trip-truth/recompute')
  recomputeTripTruth(@CurrentUser() u: any, @Body() body: { period?: string }) {
    return this.tripTruth.recompute(u.companyId, body?.period);
  }

  /** GET /commercial-analytics/trip-truth/truck-pack — per-truck month-end pack + km truth */
  @Get('trip-truth/truck-pack')
  getTruckPack(@CurrentUser() u: any, @Query('period') period?: string) {
    return this.tripTruth.getTruckPack(u.companyId, period);
  }

  /** GET /commercial-analytics/trip-truth — per-trip cost truth, worst margin first */
  @Get('trip-truth')
  listTripTruth(
    @CurrentUser() u: any,
    @Query('period') period?: string,
    @Query('belowCostOnly') belowCostOnly?: string,
    @Query('provenance') provenance?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.tripTruth.listTrips(u.companyId, {
      period,
      belowCostOnly: belowCostOnly === 'true',
      provenance,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /** GET /commercial-analytics/trip-truth/exceptions — below-cost exception queue */
  @Get('trip-truth/exceptions')
  listTripExceptions(
    @CurrentUser() u: any,
    @Query('period') period?: string,
    @Query('status') status?: string,
  ) {
    return this.tripTruth.listExceptions(u.companyId, { period, status });
  }

  /** PATCH /commercial-analytics/trip-truth/:waybillId/exception — acknowledge / resolve */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Patch('trip-truth/:waybillId/exception')
  updateTripException(
    @CurrentUser() u: any,
    @Param('waybillId') waybillId: string,
    @Body() body: { status?: string; note?: string },
  ) {
    return this.tripTruth.updateException(u.companyId, waybillId, body ?? {}, u?.id);
  }

  /** GET /commercial-analytics/trip-truth/:waybillId — one trip and the entries behind its cost */
  @Get('trip-truth/:waybillId')
  getTripTruth(@CurrentUser() u: any, @Param('waybillId') waybillId: string) {
    return this.tripTruth.getTrip(u.companyId, waybillId);
  }

  /** GET /commercial-analytics/report — full commercial report */
  @Get('report')
  getFullReport(@CurrentUser() u: any, @Query('period') period?: string) {
    return this.svc.getFullReport(u.companyId, period);
  }

  // ── Profitability snapshots ─────────────────────────────────────────────
  //
  // The live endpoints answer "what did this lane earn?". They cannot answer
  // "is it getting better?", because that needs the previous period and
  // nothing was ever stored. These materialise the period into
  // LaneProfitability / ClientProfitability so the deltas exist.

  /** POST /commercial-analytics/snapshots/:period — materialise one period */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post('snapshots/:period')
  materialiseSnapshots(@CurrentUser() u: any, @Param('period') period: string) {
    return this.snapshots.materialise(u.companyId, period);
  }

  /** POST /commercial-analytics/snapshots — materialise the current period */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post('snapshots')
  materialiseCurrentSnapshots(@CurrentUser() u: any) {
    return this.snapshots.materialise(u.companyId);
  }

  /** GET /commercial-analytics/snapshots/periods — which periods have history */
  @Get('snapshots/periods')
  listSnapshotPeriods(@CurrentUser() u: any) {
    return this.snapshots.availablePeriods(u.companyId);
  }

  /** GET /commercial-analytics/snapshots/lanes — persisted lanes, worst margin first */
  @Get('snapshots/lanes')
  listLaneSnapshots(
    @CurrentUser() u: any,
    @Query('period') period?: string,
    @Query('fromZone') fromZone?: string,
    @Query('toZone') toZone?: string,
  ) {
    return this.snapshots.laneSnapshots(u.companyId, period, fromZone, toZone);
  }

  /** GET /commercial-analytics/snapshots/clients — persisted clients by profit rank */
  @Get('snapshots/clients')
  listClientSnapshots(@CurrentUser() u: any, @Query('period') period?: string) {
    return this.snapshots.clientSnapshots(u.companyId, period);
  }
}
