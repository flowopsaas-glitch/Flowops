import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { DriverAuthGuard } from '../common/guards/driver-auth.guard';
import { PushService } from './push.service';

/**
 * Driver web-push endpoints. All driver-scoped: the driver identity comes from
 * the driver token (req.driver), never from the client body. Routes are
 * @Public() so the tenant JWT guard is skipped, then DriverAuthGuard validates
 * the driver session.
 */
@ApiTags('Driver Push')
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** GET /push/vapid-public-key — the key the browser needs to subscribe. */
  @Public()
  @Get('vapid-public-key')
  key() {
    return { publicKey: this.push.getPublicKey(), enabled: this.push.enabled };
  }

  /** POST /push/subscribe — store this device's push subscription. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('subscribe')
  subscribe(
    @Req() req: any,
    @Body() body: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    return this.push.saveSubscription(req.driver.id, req.driver.companyId, body, req.headers?.['user-agent']);
  }

  /** POST /push/unsubscribe — remove a subscription (notifications off / logout). */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post('unsubscribe')
  unsubscribe(@Body() body: { endpoint: string }) {
    return this.push.removeSubscription(body?.endpoint);
  }
}
