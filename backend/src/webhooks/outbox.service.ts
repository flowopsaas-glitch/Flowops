import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';
import { CronMutex } from '../common/utils/cron-mutex';
import type { FlowOpsEvent } from './event-catalog';

/**
 * Transactional Outbox — Phase 1 of the event-driven architecture.
 *
 * A domain change (slot allocated, deviation reviewed, possession created…) writes
 * an OutboxEvent row in the SAME database transaction as the change itself. A cron
 * worker then drains those rows into WebhooksService.dispatch(), which owns the
 * per-endpoint HMAC signing, delivery records and exponential back-off.
 *
 * Why: fire-and-forget dispatch after commit loses events on a crash between
 * "commit" and "dispatch". The outbox makes "the change happened" and "the event
 * exists" one atomic fact; delivery is then retried until it succeeds or is
 * declared EXHAUSTED.
 */

/** Re-exported for convenience — the canonical list lives in event-catalog.ts. */
export { EVENT_CATALOG, isKnownEvent, type FlowOpsEvent } from './event-catalog';

/** Any thin client that can write an outbox row — the app PrismaService or a transaction client. */
export type OutboxWriter = {
  outboxEvent: {
    create(args: {
      data: {
        companyId: string;
        event: string;
        payload: string;
        status?: OutboxStatus;
        nextAttemptAt?: Date;
      };
      select?: { id: true };
    }): Promise<{ id: string }>;
  };
};

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly drainMutex = new CronMutex('outbox-drain');

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
  ) {}

  /**
   * Record a domain event. Pass the surrounding transaction client (tx) when the
   * caller runs inside `prisma.$transaction` so the event commits atomically with
   * the domain change; the plain service also works for non-transactional callers.
   */
  async enqueue(
    db: OutboxWriter,
    companyId: string,
    event: FlowOpsEvent,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    try {
      const row = await db.outboxEvent.create({
        data: {
          companyId,
          event,
          payload: JSON.stringify(payload),
        },
        select: { id: true },
      });
      return row.id;
    } catch (err) {
      // An event that cannot be recorded is logged loudly: the domain change
      // itself has usually already been decided by the caller's transaction.
      this.logger.error(`Outbox enqueue failed for ${event}: ${(err as Error)?.message ?? err}`);
      return null;
    }
  }

  /** Back-off schedule by attempt count: 1 → 1 min, 2 → 5 min, 3 → 30 min, 4 → 2 h, 5 → exhausted. */
  private static retryDelayMs(attempts: number): number {
    const seconds = [0, 60, 300, 1800, 7200][attempts] ?? 28800;
    return seconds * 1000;
  }

  /**
   * Every minute: drain due PENDING/RETRYING events into webhook dispatch.
   * A dispatch failure is the outbox's problem to retry (the per-endpoint
   * delivery retry inside WebhooksService handles receiver-side flakiness).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async drain(): Promise<void> {
    if (!this.drainMutex.acquire()) return;
    try {
      let due: Array<{ id: string; companyId: string; event: string; payload: string; attempts: number }> = [];
      try {
        due = await (this.prisma as unknown as PrismaService).outboxEvent.findMany({
          where: {
            status: { in: ['PENDING', 'RETRYING'] },
            attempts: { lt: 5 },
            nextAttemptAt: { lte: new Date() },
          },
          select: { id: true, companyId: true, event: true, payload: true, attempts: true },
          take: 50,
          orderBy: { nextAttemptAt: 'asc' },
        });
      } catch (err) {
        this.logger.warn(`Outbox lookup failed: ${(err as Error)?.message ?? err}`);
        return;
      }

      for (let i = 0; i < due.length; i += 5) {
        const batch = due.slice(i, i + 5);
        await Promise.allSettled(batch.map((e) => this.process(e)));
      }
    } finally {
      this.drainMutex.release();
    }
  }

  private async process(event: {
    id: string; companyId: string; event: string; payload: string; attempts: number;
  }): Promise<void> {
    const attempts = event.attempts + 1;
    try {
      const data = JSON.parse(event.payload) as Record<string, unknown>;
      await this.webhooks.dispatch(event.companyId, event.event, data);
      await (this.prisma as unknown as PrismaService).outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', attempts, processedAt: new Date(), lastError: null, nextAttemptAt: new Date() },
      }).catch(() => {});
    } catch (err) {
      const message = (err as Error)?.message ?? 'Dispatch failed';
      const exhausted = attempts >= 5;
      this.logger.warn(`Outbox dispatch failed for ${event.event} (attempt ${attempts}): ${message}`);
      await (this.prisma as unknown as PrismaService).outboxEvent.update({
        where: { id: event.id },
        data: {
          status: exhausted ? 'EXHAUSTED' : 'RETRYING',
          attempts,
          lastError: message.slice(0, 1000),
          nextAttemptAt: exhausted ? new Date() : new Date(Date.now() + OutboxService.retryDelayMs(attempts)),
        },
      }).catch(() => {});
    }
  }
}
