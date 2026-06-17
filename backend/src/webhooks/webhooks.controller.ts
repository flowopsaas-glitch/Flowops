import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Webhooks')
@ApiBearerAuth()
@Controller('integrations/webhooks')
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  // ── Endpoint management ──────────────────────────────────────────────

  @Get()
  list(@CurrentUser() u: any) {
    return this.svc.list(u.companyId);
  }

  @Post()
  create(@CurrentUser() u: any, @Body() body: { url: string; events?: string[] }) {
    return this.svc.create(u.companyId, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId);
  }

  // ── Delivery log ─────────────────────────────────────────────────────

  /** Paginated delivery history: status, attempts, response, timestamps. */
  @Get('deliveries')
  deliveries(@Query('limit') limit: string, @CurrentUser() u: any) {
    return this.svc.listDeliveries(u.companyId, Number(limit) || 100);
  }

  /** Manually trigger an immediate retry for a failed/exhausted delivery. */
  @Post('deliveries/:id/retry')
  retry(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.retryDelivery(id, u.companyId);
  }
}
