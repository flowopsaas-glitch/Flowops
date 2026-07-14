import {
  Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { DriverAuthGuard } from '../common/guards/driver-auth.guard';
import { DriverPortalService } from './driver-portal.service';
import { AuthService } from '../auth/auth.service';

@Controller('driver-portal')
export class DriverPortalController {
  constructor(
    private readonly svc: DriverPortalService,
    private readonly auth: AuthService,
  ) {}

  // ── Auth (public) ────────────────────────────────────────────────────────────

  /** POST /driver-portal/login — phone + 4-digit PIN. Returns { access_token, refresh_token, driver }. */
  @Public()
  @Post('login')
  async login(@Body() body: { phone: string; pin: string }, @Req() req: any) {
    if (!body.phone || !body.pin) throw new UnauthorizedException('Phone and PIN are required');
    return this.auth.driverLogin(body.phone, String(body.pin), {
      ip: req?.ip,
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

  // ── Dispatch-facing (tenant JWT required — unchanged) ─────────────────────────

  /** GET /driver-portal/dispatch/conversations — drivers with unread counts. */
  @Get('dispatch/conversations')
  getConversations(@CurrentUser() u: any) {
    return this.svc.getDriverConversations(u.companyId);
  }

  /** GET /driver-portal/dispatch/messages/:driverId — thread with a specific driver. */
  @Get('dispatch/messages/:driverId')
  getDriverThread(
    @Param('driverId') driverId: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.getMessages(driverId, Number(limit) || 50, Number(skip) || 0);
  }

  /** POST /driver-portal/dispatch/messages/:driverId — dispatch sends to driver. */
  @Post('dispatch/messages/:driverId')
  dispatchSend(
    @Param('driverId') driverId: string,
    @CurrentUser() u: any,
    @Body() body: { message: string },
  ) {
    return this.svc.dispatchSend(driverId, u.companyId, body.message);
  }
}
