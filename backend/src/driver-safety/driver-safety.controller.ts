import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DriverSafetyService } from './driver-safety.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Driver Safety')
@ApiBearerAuth()
@Controller('safety')
export class DriverSafetyController {
  constructor(private readonly svc: DriverSafetyService) {}

  // ── Zone Management (Tenant Admin) ──────────────────────────────────────

  /** GET /safety/zones — all safety zones for the tenant */
  @Get('zones')
  getZones(@CurrentUser() u: any) {
    return this.svc.getZones(u.companyId);
  }

  /** POST /safety/zones — create a new safety zone */
  @Post('zones')
  createZone(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.createZone(u.companyId, body);
  }

  /** PATCH /safety/zones/:id — update a safety zone */
  @Patch('zones/:id')
  updateZone(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.updateZone(id, u.companyId, body);
  }

  /** DELETE /safety/zones/:id — remove a safety zone */
  @Delete('zones/:id')
  deleteZone(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deleteZone(id, u.companyId);
  }

  /** POST /safety/zones/seed — seed hotspots for this tenant's country (or specify ?country=ZW) */
  @Post('zones/seed')
  seedZones(@CurrentUser() u: any, @Query('country') country?: string) {
    return this.svc.seedDefaultZones(u.companyId, country);
  }

  /** POST /safety/zones/report — driver reports a new danger zone from mobile */
  @Post('zones/report')
  reportDangerZone(
    @CurrentUser() u: any,
    @Body() body: { driverId: string; lat: number; lng: number; name?: string; description?: string; riskLevel?: string },
  ) {
    return this.svc.reportDangerZone(u.companyId, body.driverId, body);
  }

  // ── Alert History ───────────────────────────────────────────────────────

  /** GET /safety/alerts — recent safety alerts (audit trail) */
  @Get('alerts')
  getAlerts(@CurrentUser() u: any, @Query('limit') limit?: string) {
    return this.svc.getAlerts(u.companyId, Number(limit) || 50);
  }

  // ── Manual Check (for testing) ──────────────────────────────────────────

  /** POST /safety/check — manually check a position against safety zones */
  @Post('check')
  checkPosition(@CurrentUser() u: any, @Body() body: { driverId: string; lat: number; lng: number; speed?: number; driverName?: string }) {
    return this.svc.checkPosition(body.driverId, u.companyId, body.lat, body.lng, body.speed, body.driverName);
  }
}
