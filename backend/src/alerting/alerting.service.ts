import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';

type DraftAlert = {
  type: 'churn' | 'sla_spike' | 'payment_failure';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  tenantId?: string | null;
  tenantName?: string | null;
  dedupeKey: string;
  metadata?: Record<string, any>;
};

/**
 * Owner alerting engine. A cron evaluates platform health rules (churn,
 * SLA-exception spikes, payment failures) and persists alerts idempotently
 * (deduped), emailing the platform owner once per new condition.
 */
@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduledEvaluate() {
    try {
      await this.evaluate();
    } catch (err) {
      this.logger.warn(`Alert evaluation failed: ${err}`);
    }
  }

  /** Run every rule, persist new alerts (deduped), email the owner. */
  async evaluate() {
    const drafts: DraftAlert[] = [
      ...(await this.churnRule()),
      ...(await this.slaSpikeRule()),
      ...(await this.paymentFailureRule()),
    ];

    let created = 0;
    const ownerEmail = this.config.get<string>('OWNER_SEED_EMAIL');

    for (const d of drafts) {
      const existing = await this.prisma.platformAlert.findUnique({
        where: { dedupeKey: d.dedupeKey },
      });
      if (existing) continue;

      await this.prisma.platformAlert.create({
        data: {
          type: d.type,
          severity: d.severity,
          title: d.title,
          message: d.message,
          tenantId: d.tenantId ?? null,
          tenantName: d.tenantName ?? null,
          metadata: d.metadata ?? undefined,
          dedupeKey: d.dedupeKey,
        },
      });
      created += 1;

      if (ownerEmail) {
        await this.email.sendOwnerAlert(ownerEmail, {
          title: d.title,
          message: d.message,
          severity: d.severity,
          tenantName: d.tenantName,
        });
      }
      await this.audit.record({
        action: `alert.${d.type}`,
        actorType: 'system',
        targetType: 'company',
        targetId: d.tenantId ?? null,
        targetName: d.tenantName ?? null,
        metadata: d.metadata,
      });
    }

    return { evaluated: drafts.length, created, generatedAt: new Date().toISOString() };
  }

  async list(includeResolved = false) {
    return this.prisma.platformAlert.findMany({
      where: includeResolved ? {} : { resolved: false },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async resolve(id: string) {
    return this.prisma.platformAlert.update({
      where: { id },
      data: { resolved: true, resolvedAt: new Date() },
    });
  }

  // ── Rules ──────────────────────────────────────────────────────────────

  /** Tenants suspended/deactivated in the last 7 days. */
  private async churnRule(): Promise<DraftAlert[]> {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const churned = await this.prisma.company.findMany({
      where: { isActive: false, updatedAt: { gt: since } },
      select: { id: true, name: true, plan: true, updatedAt: true },
    });
    return churned.map((c) => ({
      type: 'churn',
      severity: 'critical',
      title: `Tenant churned: ${c.name}`,
      message: `${c.name} (${c.plan ?? 'starter'} plan) was deactivated. Review for win-back or offboarding.`,
      tenantId: c.id,
      tenantName: c.name,
      dedupeKey: `churn:${c.id}:${c.updatedAt.toISOString().slice(0, 10)}`,
      metadata: { plan: c.plan },
    }));
  }

  /** Active tenants whose 24h delivery exception rate spikes above 25% (>=5 outcomes). */
  private async slaSpikeRule(): Promise<DraftAlert[]> {
    const since = new Date();
    since.setHours(since.getHours() - 24);
    const day = new Date().toISOString().slice(0, 10);

    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const out: DraftAlert[] = [];
    for (const c of companies) {
      const [delivered, failed, returned] = await Promise.all([
        this.prisma.waybill.count({ where: { companyId: c.id, status: 'DELIVERED', createdAt: { gt: since } } }),
        this.prisma.waybill.count({ where: { companyId: c.id, status: 'FAILED_DELIVERY', createdAt: { gt: since } } }),
        this.prisma.waybill.count({ where: { companyId: c.id, status: 'RETURNED', createdAt: { gt: since } } }),
      ]);
      const outcomes = delivered + failed + returned;
      if (outcomes < 5) continue;
      const exceptionRate = ((failed + returned) / outcomes) * 100;
      if (exceptionRate <= 25) continue;
      out.push({
        type: 'sla_spike',
        severity: 'warning',
        title: `Exception spike: ${c.name}`,
        message: `${c.name} had a ${exceptionRate.toFixed(0)}% delivery exception rate in the last 24h (${failed + returned} of ${outcomes}). Investigate routing/driver issues.`,
        tenantId: c.id,
        tenantName: c.name,
        dedupeKey: `sla_spike:${c.id}:${day}`,
        metadata: { exceptionRate: Math.round(exceptionRate), outcomes, failed, returned },
      });
    }
    return out;
  }

  /** Failed payments in the last 24h. */
  private async paymentFailureRule(): Promise<DraftAlert[]> {
    const since = new Date();
    since.setHours(since.getHours() - 24);
    const failures = await this.prisma.payment.findMany({
      where: { status: 'FAILED', createdAt: { gt: since } },
      select: {
        id: true, amount: true, currency: true, reference: true,
        company: { select: { id: true, name: true } },
      },
      take: 200,
    });
    return failures.map((p) => ({
      type: 'payment_failure',
      severity: 'warning',
      title: `Payment failed${p.company?.name ? `: ${p.company.name}` : ''}`,
      message: `A ${p.currency} ${p.amount.toLocaleString()} payment failed (ref ${p.reference}). The tenant's billing may be at risk.`,
      tenantId: p.company?.id ?? null,
      tenantName: p.company?.name ?? null,
      dedupeKey: `payment_failure:${p.id}`,
      metadata: { amount: p.amount, currency: p.currency, reference: p.reference },
    }));
  }
}
