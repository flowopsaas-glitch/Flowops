import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LiveTrackingService } from './live-tracking.service';
import { StartTrackingDto, UpdateLocationDto, StopCompletedDto } from './dto/live-tracking.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
const LIVE_TRACKING_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH,
];


@ApiTags('Live Tracking')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('liveTracking')
@Roles(...LIVE_TRACKING_ROLES)
@Controller('live-tracking')
export class LiveTrackingController {
  constructor(private readonly svc: LiveTrackingService) {}

  @Post('sessions')
  startSession(@CurrentUser() u: any, @Body() dto: StartTrackingDto) {
    return this.svc.startSession(u.companyId, dto);
  }

  @Get('sessions/active')
  getActiveSessions(@CurrentUser() u: any) {
    return this.svc.getActiveSessions(u.companyId);
  }

  @Get('sessions/history')
  getHistory(@CurrentUser() u: any, @Query() query: any) {
    return this.svc.getSessionHistory(u.companyId, query);
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getSession(id, u.companyId);
  }

  @Get('driver/:driverId')
  getDriverSession(@Param('driverId') driverId: string, @CurrentUser() u: any) {
    return this.svc.getDriverSession(driverId, u.companyId);
  }

  @Post('sessions/:id/location')
  updateLocation(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: UpdateLocationDto) {
    return this.svc.updateLocation(id, u.companyId, dto);
  }

  @Post('sessions/:id/stop-completed')
  stopCompleted(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: StopCompletedDto) {
    return this.svc.stopCompleted(id, u.companyId, dto);
  }

  @Post('sessions/:id/end')
  endSession(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.endSession(id, u.companyId);
  }
}
