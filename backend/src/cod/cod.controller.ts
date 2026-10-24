import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CodService } from './cod.service';
import { SettleDriverDto } from './dto/settle-driver.dto';
import { CodGuardianService } from './cod-guardian.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { AnyAuthenticated } from '../common/decorators/any-authenticated.decorator';

@ApiTags('COD Reconciliation')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@Controller('cod')
export class CodController {
  constructor(
    private readonly svc: CodService,
    private readonly guardian: CodGuardianService,
  ) {}

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.VIEWER,
  )
  @Get('summary')
  @RequireFeature('codReconciliation')
  getSummary(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.getSummary(u.companyId);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.VIEWER,
  )
  @Get('outstanding')
  @RequireFeature('codReconciliation')
  getOutstanding(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.getOutstandingWaybills(u.companyId);
  }

  /**
   * Recording collected cash is a money movement, so it is restricted to the
   * roles that own reconciliation. A DRIVER or VIEWER token must not be able to
   * credit a wallet through this office endpoint.
   */
  @Post('collect/:waybillId')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @RequireFeature('codReconciliation')
  recordCollection(
    @Param('waybillId') waybillId: string,
    @CurrentUser() u: AuthenticatedUser,
    @Body() body?: { collectedAmount?: number; note?: string },
  ) {
    return this.svc.recordCollection(waybillId, u.companyId, u.id, {
      collectedAmount: body?.collectedAmount,
      note: body?.note,
    });
  }

  /**
   * Settling cash back to the company. Restricted to the finance/ops roles —
   * this endpoint moves money out of a driver wallet.
   */
  @Post('settle/:driverId')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @RequireFeature('codReconciliation')
  settle(
    @Param('driverId') driverId: string,
    @Body() body: SettleDriverDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.svc.settleDriver(driverId, body.amount, u.companyId, body.idempotencyKey, body.note);
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
  @AnyAuthenticated()
  @Post('geofence')
  geofence(
    @Body() body: { driverId: string; lat: number; lng: number; radiusM?: number },
    @CurrentUser() u: AuthenticatedUser,
  ) {
    // The endpoint is open to any authenticated tenant user because the driver
    // app posts it, but a caller may only report a position for a driver in
    // their own company: the service resolves the driver tenant-scoped first.
    return this.svc.checkGeofence(body.driverId, u.companyId, body.lat, body.lng, body.radiusM ?? 500);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.VIEWER,
  )
  @Get('wallets')
  @RequireFeature('codReconciliation')
  listWallets(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.listWallets(u.companyId);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.VIEWER,
  )
  @Get('wallets/:driverId')
  @RequireFeature('codReconciliation')
  getWallet(@Param('driverId') driverId: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.getWallet(driverId, u.companyId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CASH FLOW GUARDIAN — AI-Powered COD Intelligence
  // ══════════════════════════════════════════════════════════════════════════

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.VIEWER,
  )
  @Get('guardian/report')
  @RequireFeature('codReconciliation')
  @ApiOperation({ summary: 'Cash Flow Guardian — full cash position report with driver risk scoring' })
  getGuardianReport(@CurrentUser() u: AuthenticatedUser) {
    return this.guardian.generateCashPosition(u.companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post('guardian/alert')
  @RequireFeature('codReconciliation')
  @ApiOperation({ summary: 'Manually trigger Cash Flow Guardian WhatsApp alert to owner' })
  triggerAlert(@CurrentUser() _u: AuthenticatedUser) {
    return this.guardian.dailyCashPositionAlert();
  }
}
