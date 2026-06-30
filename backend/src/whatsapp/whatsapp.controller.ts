import {
  Controller, Get, Post, Body, Param, Query, Req, Res, RawBodyRequest, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('WhatsApp')
@ApiBearerAuth()
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly svc: WhatsAppService) {}

  @Get('threads')
  getThreads(@CurrentUser() u: any) {
    return this.svc.getThreads(u.companyId);
  }

  @Get('settings')
  getSettings(@CurrentUser() u: any) {
    return this.svc.getSettings(u.companyId);
  }

  @Post('compose')
  @HttpCode(200)
  compose(@CurrentUser() u: any, @Body() body: { to: string; message: string }) {
    return this.svc.compose(u.companyId, body.to, body.message);
  }

  @Get('messages/:phone')
  getMessages(@Param('phone') phone: string, @CurrentUser() u: any) {
    return this.svc.getMessages(phone, u.companyId);
  }

  @Post('send')
  @HttpCode(200)
  sendMessage(@CurrentUser() u: any, @Body() body: { to: string; message: string }) {
    return this.svc.sendMessage(u.companyId, body.to, body.message);
  }

  @Get('templates')
  templates() {
    return this.svc.listTemplates();
  }

  @Post('send-template')
  @HttpCode(200)
  sendTemplate(
    @CurrentUser() u: any,
    @Body() body: { to: string; name: string; language?: string; variables?: string[] },
  ) {
    return this.svc.sendTemplate(
      u.companyId,
      body.to,
      body.name,
      body.language ?? 'en_US',
      body.variables ?? [],
    );
  }

  @Post('register-client-number')
  registerNumber(@CurrentUser() u: any, @Body() body: { phoneNumber: string }) {
    return this.svc.registerNumber(u.companyId, body.phoneNumber);
  }

  // ── Meta Webhook ─────────────────────────────────────────────────────

  /**
   * GET /api/v1/whatsapp/webhook
   * Meta sends a verification GET with hub.challenge when you register
   * your webhook URL in the Meta developer portal.
   */
  @Public()
  @SkipThrottle() // Meta verification challenge
  @Get('webhook')
  @ApiOperation({ summary: 'Meta webhook verification challenge' })
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const challengeResponse = await this.svc.verifyWebhook(mode, token, challenge);
    // Must return plain text integer for Meta to accept
    res.set('Content-Type', 'text/plain').send(challengeResponse);
  }

  /**
   * POST /api/v1/whatsapp/webhook
   * Meta delivers incoming messages and delivery status updates here.
   * The route is excluded from the global prefix transform interceptor
   * so we can return 200 OK quickly as Meta requires.
   */
  @Public()
  @SkipThrottle() // external provider callback (signature verified)
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Meta webhook event receiver' })
  async handleWebhook(@Req() req: RawBodyRequest<Request>, @Body() body: any) {
    const signature = req.headers['x-hub-signature-256'] as string ?? '';
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
    await this.svc.handleWebhookEvent(body, rawBody, signature);
    return { status: 'ok' };
  }
}
