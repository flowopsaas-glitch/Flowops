import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { companyId },
      select: { id: true, url: true, events: true, active: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(companyId: string, dto: { url: string; events?: string[] }) {
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        companyId,
        url: dto.url,
        events: dto.events?.length ? dto.events : ['waybill.status_changed'],
        secret,
      },
    });
    // Secret returned once so the integrator can verify signatures.
    return { id: endpoint.id, url: endpoint.url, events: endpoint.events, secret };
  }

  async remove(id: string, companyId: string) {
    const ep = await this.prisma.webhookEndpoint.findFirst({ where: { id, companyId } });
    if (!ep) throw new NotFoundException('Webhook endpoint not found');
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Deliver an event to every active endpoint subscribed to it. Each delivery
   * is HMAC-SHA256 signed (X-FlowOps-Signature) so receivers can verify
   * authenticity. Fire-and-forget — failures are logged, never thrown.
   */
  async dispatch(companyId: string, event: string, payload: Record<string, any>) {
    let endpoints: Array<{ id: string; url: string; secret: string }> = [];
    try {
      endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { companyId, active: true, events: { has: event } },
        select: { id: true, url: true, secret: true },
      });
    } catch (err: any) {
      this.logger.warn(`Webhook lookup failed: ${err?.message ?? err}`);
      return;
    }

    const body = JSON.stringify({ event, data: payload, sentAt: new Date().toISOString() });

    await Promise.all(
      endpoints.map(async (ep) => {
        const signature = crypto.createHmac('sha256', ep.secret).update(body).digest('hex');
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          await fetch(ep.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-FlowOps-Event': event,
              'X-FlowOps-Signature': `sha256=${signature}`,
            },
            body,
            signal: controller.signal,
          });
          clearTimeout(timer);
        } catch (err: any) {
          this.logger.warn(`Webhook delivery to ${ep.url} failed: ${err?.message ?? err}`);
        }
      }),
    );
  }
}
