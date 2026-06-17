import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

// ── Exponential back-off schedule (seconds) ───────────────────────────────
// Attempt 1 = immediate
// Retry 1   = 60 s (1 min)
// Retry 2   = 300 s (5 min)
// Retry 3   = 1 800 s (30 min)
// Retry 4   = 7 200 s (2 h)
// → after 5 total attempts: status → EXHAUSTED, no more retries
const RETRY_DELAYS_SECONDS = [0, 60, 300, 1800, 7200];
const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length; // 5

function nextRetryAt(attempt: number): Date | null {
  if (attempt >= MAX_ATTEMPTS) return null;
  const delaySec = RETRY_DELAYS_SECONDS[attempt] ?? 0;
  return new Date(Date.now() + delaySec * 1000);
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  // ── Endpoint management ────────────────────────────────────────────────

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
    return { id: endpoint.id, url: endpoint.url, events: endpoint.events, secret };
  }

  async remove(id: string, companyId: string) {
    const ep = await this.prisma.webhookEndpoint.findFirst({ where: { id, companyId } });
    if (!ep) throw new NotFoundException('Webhook endpoint not found');
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Delivery log ──────────────────────────────────────────────────────

  async listDeliveries(companyId: string, limit = 100) {
    return this.prisma.webhookDelivery.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
      include: {
        endpoint: { select: { url: true } },
      },
    });
  }

  /** Manually trigger an immediate retry for a specific delivery. */
  async retryDelivery(deliveryId: string, companyId: string) {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, companyId },
      include: { endpoint: { select: { url: true, secret: true, active: true } } },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');

    // Reset to RETRYING so the cron picks it up immediately
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'RETRYING', nextRetryAt: new Date(), updatedAt: new Date() },
    });

    // Execute right now rather than waiting for the next cron tick
    await this.attemptDelivery(delivery as any);

    return { retried: true };
  }

  // ── Core dispatch (called by waybills, notifications, etc.) ──────────

  /**
   * Deliver an event to every active endpoint subscribed to it.
   *
   * For each endpoint:
   *   1. Create a WebhookDelivery record (PENDING).
   *   2. Attempt the HTTP POST.
   *   3. On success → DELIVERED.
   *   4. On failure  → RETRYING with nextRetryAt per the back-off schedule.
   *
   * Fire-and-forget from the caller's perspective — failures are logged and
   * scheduled for retry, never thrown.
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
        // Create delivery record first so we can always see it in the log
        let delivery: { id: string } | null = null;
        try {
          delivery = await this.prisma.webhookDelivery.create({
            data: {
              endpointId: ep.id,
              companyId,
              event,
              payload: payload as any,
              status: 'PENDING',
              nextRetryAt: new Date(), // immediate
            },
          });
        } catch (err: any) {
          this.logger.warn(`Failed to create delivery record: ${err?.message ?? err}`);
        }

        await this.attemptDelivery({ id: delivery?.id, ep, body, companyId });
      }),
    );
  }

  // ── Internal: execute one HTTP attempt ───────────────────────────────

  private async attemptDelivery(opts: {
    id?: string;
    ep?: { id?: string; url: string; secret: string };
    body?: string;
    companyId?: string;
    // When called from cron/retry, we receive the full delivery record
    delivery?: any;
  }) {
    // Resolve endpoint + body either from fresh dispatch or from cron path
    let ep: { url: string; secret: string };
    let body: string;
    let deliveryId: string | undefined;
    let companyId: string;

    if (opts.delivery) {
      const d = opts.delivery;
      deliveryId = d.id;
      companyId = d.companyId;
      ep = d.endpoint;
      body = JSON.stringify({
        event: d.event,
        data: d.payload,
        sentAt: d.createdAt?.toISOString() ?? new Date().toISOString(),
      });
    } else {
      ep = opts.ep!;
      body = opts.body!;
      deliveryId = opts.id;
      companyId = opts.companyId!;
    }

    const signature = crypto.createHmac('sha256', ep.secret).update(body).digest('hex');

    let responseStatus: number | undefined;
    let responseBody: string | undefined;
    let errorMessage: string | undefined;
    let success = false;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FlowOps-Event': body ? JSON.parse(body).event : '',
          'X-FlowOps-Signature': `sha256=${signature}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      responseStatus = res.status;
      responseBody = (await res.text()).slice(0, 2000);
      success = res.ok;
    } catch (err: any) {
      errorMessage = err?.message ?? String(err);
      this.logger.warn(`Webhook delivery to ${ep.url} failed: ${errorMessage}`);
    }

    if (!deliveryId) return;

    try {
      const current = await this.prisma.webhookDelivery.findUnique({
        where: { id: deliveryId },
        select: { attempts: true },
      });
      const attempts = (current?.attempts ?? 0) + 1;
      const nextAttempt = nextRetryAt(attempts);

      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          attempts,
          lastAttemptAt: new Date(),
          responseStatus: responseStatus ?? null,
          responseBody: responseBody ?? null,
          errorMessage: errorMessage ?? null,
          status: success
            ? 'DELIVERED'
            : nextAttempt
              ? 'RETRYING'
              : 'EXHAUSTED',
          nextRetryAt: success ? null : nextAttempt,
          updatedAt: new Date(),
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to update delivery record ${deliveryId}: ${err?.message ?? err}`);
    }
  }

  // ── Retry cron — runs every minute, processes all due retries ──────────

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingRetries() {
    let due: any[] = [];
    try {
      due = await this.prisma.webhookDelivery.findMany({
        where: {
          status: { in: ['RETRYING'] },
          nextRetryAt: { lte: new Date() },
        },
        include: {
          endpoint: { select: { url: true, secret: true, active: true } },
        },
        take: 50, // process at most 50 per tick to avoid overload
      });
    } catch {
      return;
    }

    if (!due.length) return;
    this.logger.log(`Webhook retry cron: processing ${due.length} delivery(ies)`);

    for (const delivery of due) {
      if (!delivery.endpoint?.active) {
        // Endpoint was deactivated — abandon
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'EXHAUSTED', nextRetryAt: null, updatedAt: new Date() },
        });
        continue;
      }
      await this.attemptDelivery({ delivery });
    }
  }
}
