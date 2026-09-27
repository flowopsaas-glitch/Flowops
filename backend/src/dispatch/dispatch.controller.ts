import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AutoDispatchService, DispatchMode } from './auto-dispatch.service';
import { LiveTrackingLinkService } from './live-tracking-link.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Smart Dispatch & Live Tracking')
@ApiBearerAuth()
@Controller('dispatch')
export class DispatchController {
  constructor(
    private readonly autoDispatch: AutoDispatchService,
    private readonly liveTracking: LiveTrackingLinkService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // AUTO-DISPATCH
  // ══════════════════════════════════════════════════════════════════════════

  @Post('auto-assign/:waybillId')
  @ApiOperation({ summary: 'Auto-assign the best driver for a waybill (proximity + load + intelligence)' })
  autoAssign(
    @CurrentUser() u: AuthenticatedUser,
    @Param('waybillId') waybillId: string,
    @Body() body: { mode?: DispatchMode },
  ) {
    return this.autoDispatch.dispatch(u.companyId, waybillId, { mode: body.mode });
  }

  @Post('batch-assign')
  @ApiOperation({ summary: 'Auto-assign drivers to multiple waybills at once' })
  batchAssign(
    @CurrentUser() u: AuthenticatedUser,
    @Body() body: { waybillIds: string[]; mode?: DispatchMode },
  ) {
    return this.autoDispatch.batchDispatch(u.companyId, body.waybillIds, body.mode);
  }

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
