import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CodService } from './cod.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('COD Reconciliation')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@Controller('cod')
export class CodController {
  constructor(private readonly svc: CodService) {}

  @Get('summary')
  @RequireFeature('codReconciliation')
  getSummary(@CurrentUser() u: any) {
    return this.svc.getSummary(u.companyId);
  }

  @Get('outstanding')
  @RequireFeature('codReconciliation')
  getOutstanding(@CurrentUser() u: any) {
    return this.svc.getOutstandingWaybills(u.companyId);
  }

  @Post('collect/:waybillId')
  @RequireFeature('codReconciliation')
  recordCollection(@Param('waybillId') waybillId: string, @CurrentUser() u: any) {
    return this.svc.recordCollection(waybillId, u.companyId, u.id);
  }

  @Post('settle/:driverId')
  @RequireFeature('codReconciliation')
  settle(
    @Param('driverId') driverId: string,
    @Body() body: { amount: number; note?: string },
    @CurrentUser() u: any,
  ) {
    return this.svc.settleDriver(driverId, body.amount, u.companyId, body.note);
  }

  /**
   * POST /cod/geofence
   * Called by the driver app when GPS position updates. Any IN_TRANSIT waybill
   * whose recipient is within radiusM (default 500 m) is automatically
   * advanced to OUT_FOR_DELIVERY so the customer gets a real-time notification.
   *
   * NOT feature-gated: this is core delivery automation driven by driver GPS,
   * not COD reconciliation, so it must work on every plan.
   */
  @Post('geofence')
  geofence(
    @Body() body: { driverId: string; lat: number; lng: number; radiusM?: number },
    @CurrentUser() u: any,
  ) {
    return this.svc.checkGeofence(body.driverId, u.companyId, body.lat, body.lng, body.radiusM ?? 500);
  }

  @Get('wallets')
  @RequireFeature('codReconciliation')
  listWallets(@CurrentUser() u: any) {
    return this.svc.listWallets(u.companyId);
  }

  @Get('wallets/:driverId')
  @RequireFeature('codReconciliation')
  getWallet(@Param('driverId') driverId: string) {
    return this.svc.getWallet(driverId);
  }
}
