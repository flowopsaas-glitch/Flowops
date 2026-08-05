import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DriversService } from './drivers.service';
import { LeaderboardService } from './leaderboard.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(
    private readonly svc: DriversService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  @Get()
  findAll(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.findAll(u.companyId, q);
  }

  @Post()
  create(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.create(u.companyId, body);
  }

  // ── Static named routes must come BEFORE /:id to avoid being shadowed ──────

  @Get('field-ops')
  getFieldOps(@CurrentUser() u: any) {
    return this.svc.getFieldOps(u.companyId);
  }

  @Get('fleet/dashboard')
  fleetDashboard(@CurrentUser() u: any) {
    return this.svc.fleetDashboard(u.companyId);
  }

  @Get('leaderboard')
  getLeaderboard(@CurrentUser() u: any, @Query('period') period?: string) {
    return this.leaderboard.getLeaderboard(u.companyId, period);
  }

  // ── Param routes ─────────────────────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.update(id, u.companyId, body);
  }

  @Patch(':id/location')
  updateLocation(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.updateLocation(id, u.companyId, body.lat, body.lng);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId);
  }

  // ── Fleet maintenance ─────────────────────────────────────────────────────

  @Get(':id/service-history')
  getServiceHistory(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getServiceHistory(id, u.companyId);
  }

  @Post(':id/service-log')
  logService(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: { serviceType: string; notes?: string; kmAtService?: number; cost?: number; servicedAt?: string },
  ) {
    return this.svc.logService(id, u.companyId, body);
  }

  @Patch(':id/odometer')
  updateOdometer(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: { currentKm: number; nextServiceKm?: number; nextServiceDate?: string },
  ) {
    return this.svc.updateOdometer(id, u.companyId, body);
  }

  // ── Driver PIN management ─────────────────────────────────────────────────

  @Patch(':id/pin')
  setPin(@Param('id') id: string, @CurrentUser() u: any, @Body() body: { pin: string }) {
    return this.svc.setPin(id, u.companyId, body.pin);
  }

  @Patch(':id/reset-pin')
  resetPin(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.resetPin(id, u.companyId);
  }
}
