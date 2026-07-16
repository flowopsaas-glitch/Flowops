import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FleetIntelligenceService } from './fleet-intelligence.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Fleet Intelligence')
@ApiBearerAuth()
@Controller('fleet-intelligence')
export class FleetIntelligenceController {
  constructor(private readonly svc: FleetIntelligenceService) {}

  /** Full fleet intelligence report — all analyses combined. */
  @Get('dashboard')
  getDashboard(@CurrentUser() u: any) {
    return this.svc.generateReport(u.companyId);
  }

  /** Zone demand heatmap — which areas generate the most volume. */
  @Get('zones')
  getZones(@CurrentUser() u: any) {
    return this.svc.analyzeZoneDemand(u.companyId);
  }

  /** Driver utilization scores + performance ratings. */
  @Get('drivers')
  getDrivers(@CurrentUser() u: any) {
    return this.svc.analyzeDriverUtilization(u.companyId);
  }

  /** Idle fleet detection — drivers with no recent deliveries. */
  @Get('idle')
  getIdle(@CurrentUser() u: any) {
    return this.svc.detectIdleFleet(u.companyId);
  }

  /** Capacity forecast — when you'll need more drivers. */
  @Get('forecast')
  getForecast(@CurrentUser() u: any) {
    return this.svc.forecastCapacity(u.companyId);
  }

  /** Branch workload balancing analysis. */
  @Get('branches')
  getBranches(@CurrentUser() u: any) {
    return this.svc.analyzeBranchBalance(u.companyId);
  }

  /** AI repositioning recommendations — move resources from low→high demand. */
  @Get('rebalance')
  getRebalance(@CurrentUser() u: any) {
    return this.svc.generateRepositioningRecommendations(u.companyId);
  }
}
