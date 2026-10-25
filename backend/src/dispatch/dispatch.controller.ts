import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AutoDispatchService, DispatchMode } from './auto-dispatch.service';
import { LiveTrackingLinkService } from './live-tracking-link.service';
import { FleetDutyService } from './fleet-duty.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Smart Dispatch & Live Tracking')
@ApiBearerAuth()
@Controller('dispatch')
export class DispatchController {
  constructor(
    private readonly autoDispatch: AutoDispatchService,
    private readonly liveTracking: LiveTrackingLinkService,
    private readonly fleetDuty: FleetDutyService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // FLEET DUTY BOARD
  // ══════════════════════════════════════════════════════════════════════════

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Get('fleet-duty')
  @ApiOperation({ summary: 'Fleet Duty Board: who is on duty, in which craft, on which vehicle, how long, carrying what' })
  getFleetDuty(@CurrentUser() u: AuthenticatedUser) {
    return this.fleetDuty.getBoard(u.companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('fleet-duty/:dutyId/force-end')
  @ApiOperation({ summary: 'Force-end a stuck duty (phone died mid-shift) — attributed and audited' })
  forceEndDuty(
    @CurrentUser() u: AuthenticatedUser,
    @Param('dutyId') dutyId: string,
    @Body() body: { note?: string },
  ) {
    return this.fleetDuty.forceEndDuty(u.companyId, FleetDutyService.assertDutyId(dutyId), {
      userId: (u as any).id ?? (u as any).userId,
      name: (u as any).name ?? (u as any).email,
      role: (u as any).role,
    }, body?.note);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTO-DISPATCH
  // ══════════════════════════════════════════════════════════════════════════

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('auto-assign/:waybillId')
  @ApiOperation({ summary: 'Auto-assign the best driver for a waybill (proximity + load + intelligence)' })
  autoAssign(
    @CurrentUser() u: AuthenticatedUser,
    @Param('waybillId') waybillId: string,
    @Body() body: { mode?: DispatchMode },
  ) {
    return this.autoDispatch.dispatch(u.companyId, waybillId, { mode: body.mode });
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('batch-assign')
  @ApiOperation({ summary: 'Auto-assign drivers to multiple waybills at once' })
  batchAssign(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: { waybillIds: string[]; mode?: DispatchMode },
  ) {
    return this.autoDispatch.batchDispatch(u.companyId, body.waybillIds, body.mode);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Get('suggest/:waybillId')
  @ApiOperation({ summary: 'Get ranked driver suggestions without assigning (preview mode)' })
  suggest(
    @CurrentUser() u: AuthenticatedUser,
    @Param('waybillId') waybillId: string,
  ) {
    return this.autoDispatch.suggest(u.companyId, waybillId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CUSTOMER LIVE TRACKING (PUBLIC — no auth required)
  // ══════════════════════════════════════════════════════════════════════════

  @Public()
  @Get('live/:token')
  @ApiOperation({ summary: 'Customer live tracking page data — driver position, ETA, stops remaining (public, no auth)' })
  liveTrack(@Param('token') token: string) {
    return this.liveTracking.getTrackingData(token);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('live-link/:waybillId')
  @ApiOperation({ summary: 'Generate a live tracking link for a customer (sends via SMS/WhatsApp)' })
  generateLiveLink(
    @CurrentUser() u: AuthenticatedUser,
    @Param('waybillId') waybillId: string,
    @Body() body: { sendSms?: boolean; sendWhatsApp?: boolean },
  ) {
    return this.liveTracking.generateLink(u.companyId, waybillId, body);
  }
}
