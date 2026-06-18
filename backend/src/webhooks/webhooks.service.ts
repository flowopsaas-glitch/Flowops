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
   * is HMAC-SHA256 signed and persisted as a WebhookDelivery record so the
   * tenant can see success/failure history in the Integrations page. 
   * Fire-and-forget — failures are logged and queued for retry, never thrown.
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
        // Create a delivery record before attempting
        let deliveryId: string | null = null;
        try {
          const delivery = await this.prisma.webhookDelivery.create({
            data: {
              endpointId: ep.id, event, payload: body,
              status: 'PENDING', attempts: 1,
            },
          });
          deliveryId = delivery.id;
        } catch { /* non-critical, continue with delivery */ }

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(ep.url, {
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

          if (deliveryId) {
            const responseBody = await res.text().catch(() => '');
            await this.prisma.webhookDelivery.update({
              where: { id: deliveryId },
              data: {
                status: res.ok ? 'DELIVERED' : 'FAILED',
                responseStatus: res.status,
                responseBody: responseBody.slice(0, 1000),
              },
            }).catch(() => {});
          }
        } catch (err: any) {
          this.logger.warn(`Webhook delivery to ${ep.url} failed: ${err?.message ?? err}`);
          if (deliveryId) {
            await this.prisma.webhookDelivery.update({
              where: { id: deliveryId },
              data: { status: 'FAILED', responseBody: err?.message ?? 'Network error' },
            }).catch(() => {});
          }
        }
      }),
    );
  }

  // ── Delivery log ───────────────────────────────────────────────────────────

  async listDeliveries(companyId: string, limit = 100) {
    return this.prisma.webhookDelivery.findMany({
      where: { endpoint: { companyId } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        endpoint: { select: { id: true, url: true } },
      },
    });
  }

}
