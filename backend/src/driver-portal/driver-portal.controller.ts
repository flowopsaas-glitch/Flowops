import { Body, Controller, Get, Param, Patch, Post, Query, Res, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { DriverPortalService } from './driver-portal.service';
import { AuthService } from '../auth/auth.service';

@Controller('driver-portal')
export class DriverPortalController {
  constructor(
    private readonly svc: DriverPortalService,
    private readonly auth: AuthService,
  ) {}

  /**
   * POST /driver-portal/login
   * Authenticates a driver using phone number and 4-digit PIN.
   */
  @Public()
  @Post('login')
  async login(@Body() body: { phone: string; pin: string }) {
    if (!body.phone || !body.pin) throw new UnauthorizedException('Phone and PIN are required');
    return this.auth.driverLogin(body.phone, String(body.pin));
  }

  /**
   * GET /driver-portal/deliveries/:driverId
   * Returns a PLAIN ARRAY (bypasses TransformInterceptor) for the driver PWA.
   */
  @Public()
  @Get('deliveries/:driverId')
  async getDeliveries(@Param('driverId') driverId: string, @Res() res: Response) {
    const jobs = await this.svc.getDriverJobs(driverId);
    res.json(jobs);
  }

  /** POST /driver-portal/gps */
  @Public()
  @Post('gps')
  async updateGps(@Body() body: { driverId: string; lat: number; lng: number; speed?: number }) {
    await this.svc.updateGps(body.driverId, body.lat, body.lng);
    return { ok: true };
  }

  /** POST /driver-portal/pod */
  @Public()
  @Post('pod')
  async uploadPod(@Body() body: { waybillId: string; signatureUrl?: string; imageUrl?: string; recipientName?: string; notes?: string }) {
    return this.svc.recordPod(body);
  }

  // ── Chat: driver-facing (public — driver uses PIN auth token, not JWT) ────────

  /** GET /driver-portal/chat/messages/:driverId */
  @Public()
  @Get('chat/messages/:driverId')
  async getMessages(
    @Param('driverId') driverId: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.getMessages(driverId, Number(limit) || 50, Number(skip) || 0);
  }

  /** POST /driver-portal/chat/send */
  @Public()
  @Post('chat/send')
  async sendMessage(@Body() body: { driverId: string; message: string; senderType?: string; attachmentUrl?: string; attachmentType?: string }) {
    // We need companyId — look it up from driverId
    const driver = await this.svc['prisma'].driver.findFirst({ where: { id: body.driverId }, select: { companyId: true } });
    if (!driver) return { ok: false };
    return this.svc.sendMessage(body.driverId, driver.companyId, body.message, body.senderType || 'driver', body.attachmentUrl, body.attachmentType);
  }

  /** PATCH /driver-portal/chat/read/:id */
  @Public()
  @Patch('chat/read/:id')
  markRead(@Param('id') id: string) {
    return this.svc.markRead(id);
  }

  /** POST /driver-portal/chat/typing/:driverId */
  @Public()
  @Post('chat/typing/:driverId')
  setTyping(@Param('driverId') driverId: string, @Body() body: { isTyping: boolean }) {
    return this.svc.setTyping(driverId, body.isTyping ?? false);
  }

  /** GET /driver-portal/chat/typing/:driverId */
  @Public()
  @Get('chat/typing/:driverId')
  getTyping(@Param('driverId') driverId: string) {
    return this.svc.getTypingStatus(driverId);
  }

  // ── Dispatch-facing (JWT required) ───────────────────────────────────────────

  /** GET /driver-portal/dispatch/conversations — list drivers with unread counts */
  @Get('dispatch/conversations')
  getConversations(@CurrentUser() u: any) {
    return this.svc.getDriverConversations(u.companyId);
  }

  /** GET /driver-portal/dispatch/messages/:driverId — thread with a specific driver */
  @Get('dispatch/messages/:driverId')
  getDriverThread(
    @Param('driverId') driverId: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.getMessages(driverId, Number(limit) || 50, Number(skip) || 0);
  }

  /** POST /driver-portal/dispatch/messages/:driverId — dispatch sends to driver */
  @Post('dispatch/messages/:driverId')
  dispatchSend(
    @Param('driverId') driverId: string,
    @CurrentUser() u: any,
    @Body() body: { message: string },
  ) {
    return this.svc.dispatchSend(driverId, u.companyId, body.message);
  }
}
