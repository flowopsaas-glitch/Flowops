import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller()
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('dashboard/metrics')
  getMetrics(@CurrentUser() u: any) {
    return this.svc.getMetrics(u.companyId);
  }

  @Get('dashboard/kpis')
  getKpis(@CurrentUser() u: any) {
    return this.svc.getKpis(u.companyId);
  }

  @Get('dashboard/live-etas')
  getLiveEtas(@CurrentUser() u: any) {
    return this.svc.getLiveEtas(u.companyId);
  }

  @Get('dashboard/forwarding-metrics')
  getForwardingMetrics(@CurrentUser() u: any) {
    return this.svc.getForwardingMetrics(u.companyId);
  }

  @Get('dashboard/activities')
  getActivities(@CurrentUser() u: any, @Query('limit') limit?: string) {
    return this.svc.getActivities(u.companyId, limit ? parseInt(limit) : 20);
  }

  @Get('operations/summary')
  getOperationsSummary(@CurrentUser() u: any) {
    return this.svc.getOperationsSummary(u.companyId);
  }

  @Get('collections-state-sync/dashboard')
  syncDashboard(@CurrentUser() u: any) {
    return this.svc.getCollectionsSyncDashboard(u.companyId);
  }

  @Get('collections-state-sync/records')
  syncRecords(@CurrentUser() u: any) {
    return this.svc.getCollectionsSyncRecords(u.companyId);
  }

  @Post('collections-state-sync/bulk-sync')
  bulkSync(@CurrentUser() u: any) {
    return this.svc.bulkSync(u.companyId);
  }

  @Post('collections-state-sync/sync/:id')
  syncOne(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.bulkSync(u.companyId); // same logic for single
  }

  @Get('collections-state-sync/suggest-driver/:id')
  suggestDriver(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.suggestDriver(u.companyId, id);
  }
}
