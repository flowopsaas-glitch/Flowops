import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CronMutex } from '../common/utils/cron-mutex';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly retryMutex = new CronMutex('webhook-retries');

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
                status: res.ok ? 'DELIVERED' : 'RETRYING',
                responseStatus: res.status,
                responseBody: responseBody.slice(0, 1000),
                // Schedule first retry in 1 minute on non-2xx
                nextRetryAt: !res.ok ? new Date(Date.now() + 60_000) : null,
              },
            }).catch(() => {});
          }
        } catch (err: any) {
          this.logger.warn(`Webhook delivery to ${ep.url} failed: ${err?.message ?? err}`);
          if (deliveryId) {
            await this.prisma.webhookDelivery.update({
              where: { id: deliveryId },
              data: {
                status: 'RETRYING',
                responseBody: err?.message ?? 'Network error',
                // Schedule first retry in 1 minute
                nextRetryAt: new Date(Date.now() + 60_000),
              },
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

  // ── Exponential back-off retry engine ─────────────────────────────────────

  /** Back-off schedule: attempt 2 → 1 min, 3 → 5 min, 4 → 30 min, 5 → 2 h */
  private static retryDelay(attempts: number): number {
    const seconds = [0, 60, 300, 1800, 7200][attempts] ?? 28800;
    return seconds * 1000;
  }

  /**
   * Every minute: find FAILED / RETRYING deliveries whose nextRetryAt is due,
   * re-attempt them, and mark EXHAUSTED after 5 total attempts.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processRetries() {
    if (!this.retryMutex.acquire()) return; // Skip if previous run still executing
    try {
      let due: Array<{ id: string; endpointId: string; payload: string; attempts: number }> = [];
      try {
        due = await this.prisma.webhookDelivery.findMany({
          where: {
            status: { in: ['FAILED', 'RETRYING'] },
            attempts: { lt: 5 },
            nextRetryAt: { lte: new Date() },
          },
          select: { id: true, endpointId: true, payload: true, attempts: true },
          take: 50,
        });
      } catch { return; }

      if (due.length === 0) return;

      // Batch process retries (5 concurrent) instead of sequential
      for (let i = 0; i < due.length; i += 5) {
        const batch = due.slice(i, i + 5);
        await Promise.allSettled(batch.map(d => this.retryDelivery(d)));
      }
    } finally {
      this.retryMutex.release();
    }
  }

  private async retryDelivery(delivery: {
    id: string; endpointId: string; payload: string; attempts: number;
  }) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({
      where: { id: delivery.endpointId },
      select: { url: true, secret: true, active: true },
    }).catch(() => null);

    if (!endpoint?.active) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'EXHAUSTED' },
      }).catch(() => {});
      return;
    }

    const newAttempts = delivery.attempts + 1;
    const signature = crypto.createHmac('sha256', endpoint.secret).update(delivery.payload).digest('hex');
    const body = JSON.parse(delivery.payload) as Record<string, unknown>;
    const event = String(body.event ?? 'unknown');

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FlowOps-Event': event,
          'X-FlowOps-Signature': `sha256=${signature}`,
          'X-FlowOps-Retry': String(newAttempts),
        },
        body: delivery.payload,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const responseBody = await res.text().catch(() => '');
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts:       newAttempts,
          status:         res.ok ? 'DELIVERED' : (newAttempts >= 5 ? 'EXHAUSTED' : 'RETRYING'),
          responseStatus: res.status,
          responseBody:   responseBody.slice(0, 1000),
          nextRetryAt:    !res.ok && newAttempts < 5
            ? new Date(Date.now() + WebhooksService.retryDelay(newAttempts))
            : null,
        },
      }).catch(() => {});
    } catch (err: any) {
      const status = newAttempts >= 5 ? 'EXHAUSTED' : 'RETRYING';
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts:    newAttempts,
          status,
          responseBody: err?.message ?? 'Network error',
          nextRetryAt: status === 'RETRYING'
            ? new Date(Date.now() + WebhooksService.retryDelay(newAttempts))
            : null,
        },
      }).catch(() => {});
    }
  }

}
