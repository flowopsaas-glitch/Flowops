import { Body, Controller, Get, Param, Patch, Post, Query, Res, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
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
   *
   * Authenticates a driver using phone number and 4-digit PIN.
   * Returns an access_token + driver profile on success.
   * This is the primary login endpoint for the standalone driver PWA.
   */
  @Public()
  @Post('login')
  async login(
    @Body() body: { phone: string; pin: string },
  ) {
    if (!body.phone || !body.pin) {
      throw new UnauthorizedException('Phone and PIN are required');
    }
    return this.auth.driverLogin(body.phone, String(body.pin));
  }

  /**
   * GET /driver-portal/deliveries/:driverId
   *
   * Returns a PLAIN ARRAY (bypasses the global TransformInterceptor) because
   * the driver portal's axios client reads `response.data` expecting a raw
   * array — not the `{ data, statusCode, message }` envelope that the
   * interceptor would add.
   */
  @Public()
  @Get('deliveries/:driverId')
  async getDeliveries(
    @Param('driverId') driverId: string,
    @Res() res: Response,
  ) {
    const jobs = await this.svc.getDriverJobs(driverId);
    // Send as plain JSON array, not the global transform envelope
    res.json(jobs);
  }

  /** POST /driver-portal/gps — update driver location */
  @Public()
  @Post('gps')
  async updateGps(
    @Body() body: { driverId: string; lat: number; lng: number; speed?: number },
  ) {
    await this.svc.updateGps(body.driverId, body.lat, body.lng);
    return { ok: true };
  }

  /** POST /driver-portal/pod — record proof of delivery */
  @Public()
  @Post('pod')
  async uploadPod(
    @Body() body: {
      waybillId: string;
      signatureUrl?: string;
      imageUrl?: string;
      recipientName?: string;
      notes?: string;
    },
  ) {
    return this.svc.recordPod(body);
  }

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
  sendMessage(@Body() body: Record<string, unknown>) {
    // Stub — messages persist via WhatsApp threads in production
    return { ok: true, id: Date.now().toString() };
  }

  /** PATCH /driver-portal/chat/read/:id */
  @Public()
  @Patch('chat/read/:id')
  markRead(@Param('id') _id: string) {
    return { ok: true };
  }

  /** POST /driver-portal/chat/typing/:driverId */
  @Public()
  @Post('chat/typing/:driverId')
  setTyping(@Param('driverId') _id: string, @Body() _body: Record<string, unknown>) {
    return { ok: true };
  }

  /** GET /driver-portal/chat/typing/:driverId */
  @Public()
  @Get('chat/typing/:driverId')
  getTyping(@Param('driverId') _id: string) {
    return { isTyping: false };
  }
}
