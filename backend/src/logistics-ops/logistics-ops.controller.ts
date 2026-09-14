import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LogisticsOpsService } from './logistics-ops.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Logistics Operations')
@ApiBearerAuth()
@Controller()
export class LogisticsOpsController {
  constructor(private readonly svc: LogisticsOpsService) {}

  // ── Proof of Collection (3-Signature Chain) ─────────────────────────────

  /** POST /waybills/:id/poc — capture sender + driver signatures at collection */
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
  @Post('waybills/:id/failed-attempt')
  recordFailedAttempt(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: { reason: string; rescheduleHours?: number },
  ) {
    return this.svc.recordFailedAttempt(id, u.companyId, body);
  }

  // ── Address Book ────────────────────────────────────────────────────────

  /** GET /address-book — list saved addresses */
  @Get('address-book')
  getAddressBook(@CurrentUser() u: any, @Query('type') type?: string) {
    return this.svc.getAddressBook(u.companyId, type);
  }

  /** POST /address-book — save a new address */
  @Post('address-book')
  createAddress(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.createAddress(u.companyId, body);
  }

  /** PATCH /address-book/:id — update an address */
  @Patch('address-book/:id')
  updateAddress(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.updateAddress(id, u.companyId, body);
  }

  /** DELETE /address-book/:id — remove an address */
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
  @Post('waybills/:id/hub-intake')
  hubIntake(@Param('id') id: string, @CurrentUser() u: any, @Body() body?: { location?: string }) {
    return this.svc.transitionToHub(id, u.companyId, 'AT_ORIGIN_HUB', body?.location, u);
  }

  /** GET /hub/pending-receive — clerk worklist: COLLECTED parcels awaiting depot check-in. */
  @Get('hub/pending-receive')
  pendingHubReceive(@CurrentUser() u: any) {
    return this.svc.pendingHubReceive(u.companyId);
  }

  /** POST /hub/receive — clerk batch check-in (by tracking number or id → AT_ORIGIN_HUB). */
  @Post('hub/receive')
  receiveAtHub(@CurrentUser() u: any, @Body() body: { refs?: string[]; trackingNumbers?: string[]; location?: string }) {
    const refs = body?.refs ?? body?.trackingNumbers ?? [];
    return this.svc.receiveAtHub(u.companyId, refs, body?.location, u);
  }

  /** POST /waybills/:id/hub-arrived — mark waybill as arrived at destination hub (AT_DESTINATION_HUB) */
  @Post('waybills/:id/hub-arrived')
  hubArrived(@Param('id') id: string, @CurrentUser() u: any, @Body() body?: { location?: string }) {
    return this.svc.transitionToHub(id, u.companyId, 'AT_DESTINATION_HUB', body?.location, u);
  }
}
