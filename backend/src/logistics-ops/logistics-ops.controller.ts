import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LogisticsOpsService } from './logistics-ops.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Logistics Operations')
@ApiBearerAuth()
@Controller()
export class LogisticsOpsController {
  constructor(private readonly svc: LogisticsOpsService) {}

  // ── Proof of Collection (3-Signature Chain) ─────────────────────────────

  /** POST /waybills/:id/poc — capture sender + driver signatures at collection */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('waybills/:id/poc')
  captureProofOfCollection(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: {
      senderSignatureBase64?: string;
      senderName?: string;
      driverSignatureBase64?: string;
      collectionPhotoBase64?: string;
    },
  ) {
    return this.svc.captureProofOfCollection(id, u.companyId, body);
  }

  // ── Delivery Attempts ───────────────────────────────────────────────────

  /** POST /waybills/:id/failed-attempt — record a failed delivery attempt */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('waybills/:id/failed-attempt')
  recordFailedAttempt(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: { reason: string; reasonCode?: string; rescheduleHours?: number },
  ) {
    return this.svc.recordFailedAttempt(id, u.companyId, body);
  }

  /** POST /waybills/:id/exception-action — acknowledge the next ops action. */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('waybills/:id/exception-action')
  acknowledgeException(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: { action: string; note?: string; nextAttemptAt?: string },
  ) {
    return this.svc.acknowledgeException(id, u.companyId, body?.action, body?.note, body?.nextAttemptAt, {
      id: u.id ?? u.sub,
      role: u.role,
    });
  }

  // ── Address Book ────────────────────────────────────────────────────────

  /** GET /address-book — list saved addresses */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.AGENT,
    UserRole.USER,
  )
  @Get('address-book')
  getAddressBook(@CurrentUser() u: any, @Query('type') type?: string) {
    return this.svc.getAddressBook(u.companyId, type);
  }

  /** POST /address-book — save a new address */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('address-book')
  createAddress(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.createAddress(u.companyId, body);
  }

  /** PATCH /address-book/:id — update an address */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Patch('address-book/:id')
  updateAddress(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.updateAddress(id, u.companyId, body);
  }

  /** DELETE /address-book/:id — remove an address */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Delete('address-book/:id')
  deleteAddress(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deleteAddress(id, u.companyId);
  }

  // ── Multi-Leg Tracking Timeline ─────────────────────────────────────────

  /** GET /tracking/:trackingNumber/timeline — full journey timeline for customer */
  @Public()
  @Get('tracking/:trackingNumber/timeline')
  getTrackingTimeline(@Param('trackingNumber') tn: string) {
    return this.svc.getTrackingTimeline(tn);
  }

  /** POST /waybills/:id/scan — record a scan event at any touchpoint */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('waybills/:id/scan')
  recordScanEvent(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: { event: string; location?: string; description?: string; lat?: number; lng?: number },
  ) {
    return this.svc.recordTrackingEvent(id, u.companyId, body, u);
  }

  // ── Hub Status Transitions ──────────────────────────────────────────────

  /** POST /waybills/:id/hub-intake — mark waybill as received at hub (AT_ORIGIN_HUB) */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('waybills/:id/hub-intake')
  hubIntake(@Param('id') id: string, @CurrentUser() u: any, @Body() body?: { location?: string }) {
    return this.svc.transitionToHub(id, u.companyId, 'AT_ORIGIN_HUB', body?.location, u);
  }

  /** GET /hub/pending-receive — clerk worklist: COLLECTED parcels awaiting depot check-in. */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Get('hub/pending-receive')
  pendingHubReceive(@CurrentUser() u: any) {
    return this.svc.pendingHubReceive(u.companyId);
  }

  /** POST /hub/receive — clerk batch check-in (by tracking number or id → AT_ORIGIN_HUB). */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('hub/receive')
  receiveAtHub(@CurrentUser() u: any, @Body() body: { refs?: string[]; trackingNumbers?: string[]; location?: string }) {
    const refs = body?.refs ?? body?.trackingNumbers ?? [];
    return this.svc.receiveAtHub(u.companyId, refs, body?.location, u);
  }

  /** POST /waybills/:id/hub-arrived — mark waybill as arrived at destination hub (AT_DESTINATION_HUB) */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('waybills/:id/hub-arrived')
  hubArrived(@Param('id') id: string, @CurrentUser() u: any, @Body() body?: { location?: string }) {
    return this.svc.transitionToHub(id, u.companyId, 'AT_DESTINATION_HUB', body?.location, u);
  }
}
