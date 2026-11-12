import {
  Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { DriverAuthGuard } from '../common/guards/driver-auth.guard';
import { DriverPortalService } from './driver-portal.service';
import { AuthService } from '../auth/auth.service';
import type { DriverMode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole, TruckWindowAckSource } from '@prisma/client';
import { RailTruckWindowChangesService } from '../rail/rail-truck-window-changes.service';
import { LogDriverCostDto } from './dto/driver-portal.dto';
import { JourneyService } from '../journeys/journey.service';
import { SendJourneyUpdateDto } from '../journeys/dto/journey.dto';

/** Real client IP behind Cloudflare -> nginx -> Docker (see auth.controller). */
function clientIp(req: any): string | undefined {
  const cf = req?.headers?.['cf-connecting-ip'];
  if (cf) return String(Array.isArray(cf) ? cf[0] : cf).trim();
  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) return String(Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim();
  return req?.ip;
}

@Controller('driver-portal')
export class DriverPortalController {
  constructor(
    private readonly svc: DriverPortalService,
    private readonly auth: AuthService,
    private readonly windowChanges: RailTruckWindowChangesService,
    private readonly journeys: JourneyService,
  ) {}

  // ── Auth (public) ────────────────────────────────────────────────────────────

  /** POST /driver-portal/login — phone + 4-digit PIN. Returns { access_token, refresh_token, driver }. */
  @Public()
  @Post('login')
  async login(@Body() body: { phone: string; pin: string }, @Req() req: any) {
    if (!body.phone || !body.pin) throw new UnauthorizedException('Phone and PIN are required');
    return this.auth.driverLogin(body.phone, String(body.pin), {
      ip: clientIp(req),
      userAgent: req?.headers?.['user-agent'],
    });
  }

  /**
   * POST /driver-portal/refresh — silent token rotation.
   * Pass the refresh_token received at login to get a new access_token + refresh_token pair.
   * The old refresh token is consumed (rotation). Call this when the driver app
   * receives a 401 on any request — the driver stays logged in mid-shift without
   * re-entering their PIN.
   */
  @Public()
  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    if (!body.refreshToken) throw new UnauthorizedException('refreshToken is required');
    return this.auth.driverRefresh(body.refreshToken);
  }

  // ── Driver-facing (token-authenticated; single active session enforced) ───────
  // All routes are @Public() so the global tenant guard is skipped, then the
  // DriverAuthGuard validates the driver token + session and sets req.driver.
  // The driver identity ALWAYS comes from the token (req.driver.id) — never a
  // client-supplied id — closing the old spoofable-driverId hole.

  /** GET /driver-portal/me — validate the session (used on app load / focus). */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    const d = req.driver;
    return {
      id: d.id, driverId: d.id, name: d.name, phone: d.phone,
      vehicleType: d.vehicleType, vehicleReg: d.vehicleReg,
      status: d.status, companyId: d.companyId,
    };
  }

  // ── Modes & duties (one shift, one mode, one vehicle) ─────────────────────

  /** GET /driver-portal/modes — the five crafts + this driver's allowances + active duty. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('modes')
  getModes(@Req() req: any) {
    return this.svc.getModes(req.driver.id);
  }

  /** GET /driver-portal/duty/active */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('duty/active')
  getActiveDuty(@Req() req: any) {
    return this.svc.getActiveDuty(req.driver.id);
  }

  /** POST /driver-portal/duty/start — start (or switch to) a mode for this shift. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('duty/start')
  startDuty(@Req() req: any, @Body() body: { mode: DriverMode; vehicleReg?: string; note?: string }) {
    return this.svc.startDuty(req.driver.id, req.driver.companyId, body ?? ({} as any));
  }

  /** POST /driver-portal/duty/end — stand down. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('duty/end')
  endDuty(@Req() req: any, @Body() body: { note?: string }) {
    return this.svc.endDuty(req.driver.id, req.driver.companyId, body?.note);
  }

  /** GET /driver-portal/work — the work queue scoped to the active duty's mode. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('work')
  getWork(@Req() req: any) {
    return this.svc.getWorkForDuty(req.driver.id);
  }

  /** GET /driver-portal/train-board — consist + possession awareness for TRAIN duty. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('train-board')
  getTrainBoard(@Req() req: any) {
    return this.svc.getTrainBoard(req.driver.companyId);
  }

  /** GET /driver-portal/deliveries — this driver's jobs (collections + deliveries). */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('deliveries')
  getDeliveries(@Req() req: any) {
    return this.svc.getDriverJobs(req.driver.id);
  }

  /** POST /driver-portal/gps — live position ping. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('gps')
  async updateGps(@Req() req: any, @Body() body: { lat: number; lng: number; speed?: number }) {
    await this.svc.updateGps(req.driver.id, body.lat, body.lng);
    return { ok: true };
  }

  /** POST /driver-portal/pod — capture proof of delivery. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('pod')
  uploadPod(
    @Req() req: any,
    @Body() body: { waybillId: string; signatureUrl?: string; imageUrl?: string; recipientName?: string; notes?: string },
  ) {
    return this.svc.recordPod({ ...body, driverId: req.driver.id, companyId: req.driver.companyId } as any);
  }

  /**
   * POST /driver-portal/collect/:id — driver confirms pickup of a collection.
   * Marks the collection as COLLECTED, auto-creates a Waybill from the
   * collection data, and assigns it to the same driver for delivery.
   */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('collect/:id')
  confirmCollection(
    @Req() req: any,
    @Param('id') collectionId: string,
    @Body() body: { parcelCount?: number; notes?: string },
  ) {
    return this.svc.confirmCollection(collectionId, req.driver.id, req.driver.companyId, body);
  }

  /**
   * POST /driver-portal/manifest/:id/deliver — driver confirms linehaul
   * arrival at destination branch. All waybills in manifest → COLLECTED.
   */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('manifest/:id/deliver')
  confirmLinehaulDelivery(
    @Req() req: any,
    @Param('id') manifestId: string,
  ) {
    return this.svc.confirmLinehaulDelivery(manifestId, req.driver.id, req.driver.companyId);
  }

  // ── Chat: driver side ──────────────────────────────────────────────────────────

  /** GET /driver-portal/chat/messages — this driver's thread with dispatch. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('chat/messages')
  getMessages(@Req() req: any, @Query('limit') limit?: string, @Query('skip') skip?: string) {
    return this.svc.getMessages(req.driver.id, Number(limit) || 50, Number(skip) || 0);
  }

  /** POST /driver-portal/chat/send — driver sends to dispatch. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('chat/send')
  sendMessage(
    @Req() req: any,
    @Body() body: { message: string; attachmentUrl?: string; attachmentType?: string },
  ) {
    return this.svc.sendMessage(
      req.driver.id, req.driver.companyId, body.message, 'driver', body.attachmentUrl, body.attachmentType,
    );
  }

  /** POST /driver-portal/chat/read — bulk-mark dispatch messages read. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('chat/read')
  markRead(@Req() req: any) {
    return this.svc.markRead(req.driver.id);
  }

  /** POST /driver-portal/chat/typing — driver typing indicator. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('chat/typing')
  setTyping(@Req() req: any, @Body() body: { isTyping: boolean }) {
    return this.svc.setTyping(req.driver.id, body.isTyping ?? false);
  }

  /** GET /driver-portal/chat/typing — dispatch typing indicator for this driver. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('chat/typing')
  getTyping(@Req() req: any) {
    return this.svc.getTypingStatus(req.driver.id);
  }

  /** POST /driver-portal/costs — driver logs a measured trip cost (fuel/toll). */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('costs')
  logCost(@Req() req: any, @Body() body: LogDriverCostDto) {
    return this.svc.logDriverCost(req.driver.id, req.driver.companyId, body ?? {});
  }

  /** GET /driver-portal/costs/mine — the driver's recent cost entries. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('costs/mine')
  myCosts(@Req() req: any) {
    return this.svc.listDriverCosts(req.driver.id);
  }

  // ── Terminal gate windows (the driver side of the closed loop) ──────────────
  //
  // A terminal operator can change a published gate window; the haulier and the
  // driver must be told quickly. These two endpoints are the driver's half of
  // that loop. Both are READ + CONFIRM ONLY — a driver session can never move a
  // window, and the driver identity always comes from the token (req.driver.id),
  // never from the body, so a driver cannot confirm on another driver's behalf.

  /**
   * GET /driver-portal/gate-windows — this driver's gate windows with the
   * current change on each: the NEW window, the old one it supersedes, the
   * reason, and whether they have already confirmed. Polled by the PWA and
   * cached offline, so a driver in a notspot still sees the last known window
   * and can queue a confirmation.
   */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('gate-windows')
  gateWindows(@Req() req: any) {
    return this.windowChanges.driverGateWindows(req.driver.id, req.driver.companyId);
  }

  /**
   * POST /driver-portal/gate-windows/:changeId/ack — one-tap confirmation.
   *
   * Offline-safe by contract: the PWA queues this in its IndexedDB outbox and
   * replays it with `X-Idempotency-Key`, so a flush that happens twice produces
   * one acknowledgement and never moves the original `ackedAt`. A client-
   * reported `deviceAckedAt` is stored separately and labelled device-reported;
   * the measurement uses the server-observed time.
   *
   * A 409 here means the version was superseded while the driver was offline —
   * the outbox treats that as permanent and drops it, and the portal refetches
   * so the driver confirms the window that is actually current.
   */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('gate-windows/:changeId/ack')
  ackGateWindow(
    @Req() req: any,
    @Param('changeId') changeId: string,
    @Body() body: { deviceAckedAt?: string; idempotencyKey?: string },
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.windowChanges.acknowledge({
      companyId: req.driver.companyId,
      changeId,
      source: TruckWindowAckSource.DRIVER_PORTAL,
      driverId: req.driver.id,
      actorLabel: req.driver.name ?? null,
      deviceAckedAt: body?.deviceAckedAt ? new Date(body.deviceAckedAt) : null,
      idempotencyKey: body?.idempotencyKey ?? idempotencyKey ?? null,
    });
  }

  // ── Dispatch-facing (tenant JWT required — unchanged) ─────────────────────────

  /** GET /driver-portal/dispatch/conversations — drivers with unread counts. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Get('dispatch/conversations')
  getConversations(@CurrentUser() u: any) {
    return this.svc.getDriverConversations(u.companyId);
  }

  /** GET /driver-portal/dispatch/messages/:driverId — thread with a specific driver. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Get('dispatch/messages/:driverId')
  getDriverThread(
    @CurrentUser() u: any,
    @Param('driverId') driverId: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    // Tenant-scoped: dispatch may only read chats for drivers in their company.
    return this.svc.getMessagesForCompany(driverId, u.companyId, Number(limit) || 50, Number(skip) || 0);
  }

  /** POST /driver-portal/dispatch/messages/:driverId — dispatch sends to driver. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('dispatch/messages/:driverId')
  dispatchSend(
    @Param('driverId') driverId: string,
    @CurrentUser() u: any,
    @Body() body: { message: string },
  ) {
    return this.svc.dispatchSend(driverId, u.companyId, body.message);
  }

  // ── Journeys (WP2 slice) ─────────────────────────────────────────────────
  // The driver's side of the journey slice. Dispatch works the same journeys
  // through JourneysController; both call one JourneyService.

  /**
   * GET /driver-portal/journeys — this driver's assigned journeys.
   *
   * Scoped three ways over: by the token's companyId, by the driver id from
   * the token, and again inside the service. A driver can never enumerate a
   * colleague's journeys by changing a query parameter.
   */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('journeys')
  listMyJourneys(@Req() req: any) {
    return this.journeys.listDriverJourneys(req.driver.id, req.driver.companyId);
  }

  /**
   * POST /driver-portal/journeys/:id/updates — report against a stage.
   *
   * clientMessageId makes a retry safe: sending the same key twice returns the
   * first update instead of duplicating it, which is what lets the app retry
   * on a flaky connection without spamming dispatch.
   */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('journeys/:id/updates')
  sendJourneyUpdate(
    @Req() req: any,
    @Param('id') journeyId: string,
    @Body() body: SendJourneyUpdateDto,
  ) {
    return this.journeys.sendUpdate(req.driver.id, req.driver.companyId, journeyId, {
      type: body.type,
      message: body.message,
      clientMessageId: body.clientMessageId,
      deviceOccurredAt: body.deviceOccurredAt ? new Date(body.deviceOccurredAt) : null,
      stageId: body.stageId ?? null,
    });
  }
}
