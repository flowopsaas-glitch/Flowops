import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DriverSafetyService } from './driver-safety.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Driver Safety')
@ApiBearerAuth()
@Controller('safety')
export class DriverSafetyController {
  constructor(private readonly svc: DriverSafetyService) {}

  // ── Zone Management (Tenant Admin) ──────────────────────────────────────

  /** GET /safety/zones — all safety zones for the tenant */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Get('zones')
  getZones(@CurrentUser() u: any) {
    return this.svc.getZones(u.companyId);
  }

  /** POST /safety/zones — create a new safety zone */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post('zones')
  createZone(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.createZone(u.companyId, body);
  }

  /** PATCH /safety/zones/:id — update a safety zone */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Patch('zones/:id')
  updateZone(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.updateZone(id, u.companyId, body);
  }

  /** DELETE /safety/zones/:id — remove a safety zone */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Delete('zones/:id')
  deleteZone(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deleteZone(id, u.companyId);
  }

  /** POST /safety/zones/seed — seed hotspots for this tenant's country (or specify ?country=ZW) */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post('zones/seed')
  seedZones(@CurrentUser() u: any, @Query('country') country?: string) {
    return this.svc.seedDefaultZones(u.companyId, country);
  }

  /**
   * POST /safety/zones/report — driver reports a new danger zone from mobile.
   *
   * WHO the report is about is decided by the session, not by the body: a
   * driver-role caller reports for the Driver record linked to their own user
   * account, and a dispatch/manager/admin caller may report on behalf of a
   * driver in their own tenant. A body `driverId` that does not belong to this
   * tenant — or, for a driver, that is not theirs — is refused, because the
   * zone that gets created carries that driver's real name and immediately
   * alerts everyone who drives into the circle. The acting user is recorded in
   * the audit log alongside the subject driver.
   */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.DRIVER,
  )
  @Post('zones/report')
  async reportDangerZone(
    @CurrentUser() u: any,
    @Body() body: { driverId?: string; lat: number; lng: number; name?: string; description?: string; riskLevel?: string },
  ) {
    const driver = await this.svc.resolveSubjectDriver(u.companyId, u, body?.driverId ?? null);
    return this.svc.reportDangerZone(u.companyId, driver.id, body, u);
  }

  // ── Alert History ───────────────────────────────────────────────────────

  /** GET /safety/alerts — recent safety alerts (audit trail) */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Get('alerts')
  getAlerts(@CurrentUser() u: any, @Query('limit') limit?: string) {
    return this.svc.getAlerts(u.companyId, Number(limit) || 50);
  }

  // ── Manual Check (for testing) ──────────────────────────────────────────

  /**
   * POST /safety/check — manually check a position against safety zones.
   *
   * This route writes a SafetyAlert and pushes it to the named driver's device,
   * so the driver is resolved from the session exactly as above. `driverName`
   * is no longer accepted: the name on the alert comes from the driver record
   * in this tenant, so a caller cannot make dispatch's screen say that somebody
   * else entered a high-risk zone.
   */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.DRIVER,
  )
  @Post('check')
  async checkPosition(@CurrentUser() u: any, @Body() body: { driverId?: string; lat: number; lng: number; speed?: number }) {
    const driver = await this.svc.resolveSubjectDriver(u.companyId, u, body?.driverId ?? null);
    return this.svc.checkPosition(driver.id, u.companyId, body.lat, body.lng, body.speed);
  }
}
