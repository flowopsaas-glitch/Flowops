import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';

type DraftAlert = {
  type: 'churn' | 'sla_spike' | 'payment_failure' | 'integration_token_expiry';
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
      ...(await this.trialExpiryWarningRule()),
      ...(await this.integrationTokenExpiryRule()),
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

  /** Trials expiring in 7, 3, 1 days — feeds into main evaluate cycle. */
  private async trialExpiryWarningRule(): Promise<DraftAlert[]> {
    const now = new Date();
    const out: DraftAlert[] = [];
    const warnDays = [7, 3, 1];

    const trialCos = await (this.prisma.company as any).findMany({
      where: { plan: 'starter', isActive: true, trialEndsAt: { not: null } } as any,
      select: { id: true, name: true, email: true, trialEndsAt: true },
    });

    for (const co of trialCos as any[]) {
      const daysLeft = Math.ceil((new Date(co.trialEndsAt).getTime() - now.getTime()) / 86400000);
      if (!warnDays.includes(daysLeft)) continue;
      const key = `trial_warning:${co.id}:days${daysLeft}`;
      out.push({
        type: 'trial_warning' as any,
        severity: daysLeft === 1 ? 'critical' : daysLeft === 3 ? 'warning' : 'info',
        title: `Trial expiring: ${co.name} (${daysLeft}d left)`,
        message: `${co.name} has ${daysLeft} day${daysLeft > 1 ? 's' : ''} left on their free trial and has not upgraded.`,
        tenantId: co.id, tenantName: co.name,
        dedupeKey: key,
        metadata: { daysLeft, email: co.email },
      });
    }
    return out;
  }

  // ── Trial & Subscription Processor (daily cron 08:00) ─────────────────

  @Cron('0 8 * * *')
  async scheduledTrialCheck() {
    try { await this.processTrials(); }
    catch (err) { this.logger.warn(`Trial/subscription check failed: ${err}`); }
  }

  /**
   * Daily processor for ALL plans:
   * - Starter  : warns at 7/3/1 days, suspends on expiry
   * - Pro      : warns if no payment in 30 days, suspends at 37 days
   * - Enterprise: warns if no payment in 30 days, suspends at 37 days
   * Logs everything to audit trail and alerts the owner.
   */
  async processTrials() {
    const now = new Date();
    const ownerEmail = this.config.get<string>('OWNER_SEED_EMAIL');
    const ownerWa    = '27606592875';
    let warned = 0, expired = 0, subWarned = 0, subSuspended = 0;

    // ── 1. STARTER — free trial expiry ─────────────────────────────────
    const starters = await (this.prisma.company as any).findMany({
      where: { plan: 'starter', isActive: true, trialEndsAt: { not: null } } as any,
      select: { id: true, name: true, email: true, trialEndsAt: true },
    }) as any[];

    for (const co of starters) {
      const daysLeft = Math.ceil((new Date(co.trialEndsAt).getTime() - now.getTime()) / 86400000);
      const today = now.toISOString().slice(0, 10);

      if ([7, 3, 1].includes(daysLeft)) {
        await this._upsertAlert(`trial_warn:${co.id}:d${daysLeft}`, {
          type: 'trial_warning', severity: daysLeft === 1 ? 'critical' : daysLeft === 3 ? 'warning' : 'info',
          title: `⏳ Trial expiring: ${co.name} (${daysLeft} day${daysLeft > 1 ? 's' : ''} left)`,
          message: `${co.name} (Starter) has ${daysLeft} day${daysLeft > 1 ? 's' : ''} left on their 14-day free trial. No payment yet.`,
          tenantId: co.id, tenantName: co.name,
          metadata: { daysLeft, plan: 'starter', email: co.email },
        }, ownerEmail);

        // ── TENANT EMAIL: warn the tenant directly ──
        if (co.email) {
          const adminUser = await this.prisma.user.findFirst({
            where: { companyId: co.id, role: 'ADMIN' },
            select: { firstName: true, phone: true },
          });
          await this.email.sendTrialExpiryWarningEmail(co.email, {
            name: adminUser?.firstName || 'there',
            companyName: co.name,
            daysLeft,
            trialEndsAt: new Date(co.trialEndsAt),
          });

          // ── TENANT WHATSAPP: send warning via platform WhatsApp ──
          const adminPhone = adminUser?.phone;
          if (adminPhone) {
            const urgencyEmoji = daysLeft === 1 ? '🚨' : daysLeft === 3 ? '⚠️' : '⏳';
            const urgencyText = daysLeft === 1
              ? 'This is your *LAST DAY*! Your account will be locked tomorrow.'
              : `You have *${daysLeft} days* left before your account is locked.`;
            await this._sendPlatformWhatsApp(adminPhone,
              `${urgencyEmoji} Hi ${adminUser?.firstName || 'there'},\n\n` +
              `Your *${co.name}* FlowOps trial is ending soon!\n\n` +
              `${urgencyText}\n\n` +
              `Upgrade now to keep your access:\n` +
              `${this.config.get('APP_URL', 'https://app.flowop.work')}/settings/billing\n\n` +
              `• *Professional* — R19,999/month\n` +
              `• *Enterprise* — Custom pricing\n\n` +
              `All your data will be preserved when you upgrade. Reply here if you need help! 💪`,
            );
          }
        }
        warned++;
      }

      if (daysLeft <= 0) {
        await this._expireSubscription(co, 'starter_trial', today, ownerEmail, ownerWa);
        expired++;
      }
    }

    // ── 2. PROFESSIONAL & ENTERPRISE — subscription renewal check ────────
    const paidCos = await this.prisma.company.findMany({
      where: { plan: { in: ['professional', 'enterprise'] }, isActive: true },
      select: { id: true, name: true, email: true, plan: true, updatedAt: true },
    });

    for (const co of paidCos) {
      // Get last successful payment
      const lastPayment = await this.prisma.payment.findFirst({
        where: { companyId: co.id, status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, amount: true },
      });

      // Use last payment date OR company updatedAt as billing start
      const billingStart = lastPayment?.createdAt ?? co.updatedAt;
      const daysSincePayment = Math.floor((now.getTime() - billingStart.getTime()) / 86400000);
      const today = now.toISOString().slice(0, 10);
      const planLabel = co.plan === 'enterprise' ? 'Enterprise' : 'Professional';
      const price    = co.plan === 'enterprise' ? 'Custom' : 'R11,999/mo';

      // Warn at 30 days (renewal due), 33 days (overdue), 37 days (final warning)
      if (daysSincePayment === 30) {
        await this._upsertAlert(`sub_renewal:${co.id}:${today}`, {
          type: 'payment_due' as any, severity: 'warning',
          title: `💳 Subscription renewal due: ${co.name} (${planLabel})`,
          message: `${co.name}'s ${planLabel} subscription (${price}) is due for renewal. No payment received in 30 days.`,
          tenantId: co.id, tenantName: co.name,
          metadata: { plan: co.plan, daysSincePayment, price },
        }, ownerEmail);
        subWarned++;
      }

      if (daysSincePayment === 33) {
        await this._upsertAlert(`sub_overdue:${co.id}:${today}`, {
          type: 'payment_overdue' as any, severity: 'critical',
          title: `🚨 Payment OVERDUE: ${co.name} (${planLabel}) — ${daysSincePayment} days`,
          message: `${co.name}'s ${planLabel} subscription is 3 days overdue. Contact immediately or access will be suspended in 4 days.`,
          tenantId: co.id, tenantName: co.name,
          metadata: { plan: co.plan, daysSincePayment, price, adminEmail: co.email },
        }, ownerEmail);
        subWarned++;
      }

      // Suspend at 37 days without payment
      if (daysSincePayment >= 37) {
        await this._expireSubscription(co as any, co.plan + '_subscription', today, ownerEmail, ownerWa);
        subSuspended++;
      }
    }

    const result = { warned, expired, subWarned, subSuspended, processedAt: now.toISOString() };
    this.logger.log(`Subscription check complete: ${JSON.stringify(result)}`);
    return result;
  }

  /** Upsert a platform alert and notify owner (idempotent). */
  private async _upsertAlert(dedupeKey: string, data: any, ownerEmail?: string) {
    const exists = await this.prisma.platformAlert.findUnique({ where: { dedupeKey } });
    if (exists) return;
    await this.prisma.platformAlert.create({
      data: { type: data.type, severity: data.severity, title: data.title,
              message: data.message, tenantId: data.tenantId ?? null,
              tenantName: data.tenantName ?? null, dedupeKey,
              metadata: data.metadata ?? undefined },
    });
    if (ownerEmail) {
      await this.email.sendOwnerAlert(ownerEmail, {
        title: data.title, message: data.message,
        severity: data.severity, tenantName: data.tenantName,
      });
    }
    await this.audit.record({ action: `alert.${data.type}`, actorType: 'system',
      targetType: 'company', targetId: data.tenantId, targetName: data.tenantName,
      metadata: data.metadata });
  }

  /** Suspend a company whose trial/subscription lapsed. */
  private async _expireSubscription(co: any, reason: string, today: string, ownerEmail?: string, ownerWa?: string) {
    const expiredKey = `${reason}_expired:${co.id}:${today}`;
    const already = await this.prisma.platformAlert.findUnique({ where: { dedupeKey: expiredKey } });
    if (already) return;

    await this.prisma.company.update({ where: { id: co.id }, data: { isActive: false } });

    const title   = `🔴 Account SUSPENDED: ${co.name} — ${reason.replace('_', ' ')}`;
    const message = `${co.name} has been suspended due to ${reason.replace(/_/g, ' ')}. ` +
                    `They must upgrade or renew to regain access. Admin email: ${co.email ?? 'N/A'}`;

    await this._upsertAlert(expiredKey, { type: reason + '_expired', severity: 'critical',
      title, message, tenantId: co.id, tenantName: co.name,
      metadata: { reason, adminEmail: co.email, suspendedAt: new Date().toISOString() } }, ownerEmail);

    // ── TENANT EMAIL: notify tenant their trial ended & account is locked ──
    if (co.email) {
      const adminUser = await this.prisma.user.findFirst({
        where: { companyId: co.id, role: 'ADMIN' },
        select: { firstName: true, phone: true },
      });
      await this.email.sendTrialExpiredEmail(co.email, {
        name: adminUser?.firstName || 'there',
        companyName: co.name,
      });
      this.logger.log(`Trial expired email sent → ${co.email} (${co.name})`);

      // ── TENANT WHATSAPP: send expiry notification via platform WhatsApp ──
      const adminPhone = adminUser?.phone;
      if (adminPhone) {
        await this._sendPlatformWhatsApp(adminPhone,
          `Hi ${adminUser?.firstName || 'there'} 👋\n\n` +
          `Your *${co.name}* FlowOps trial has ended and your account is now *locked*.\n\n` +
          `Don't worry — all your data is safe! 🔒\n\n` +
          `To restore access, upgrade to:\n` +
          `• *Professional* — R19,999/month\n` +
          `• *Enterprise* — Custom pricing\n\n` +
          `Upgrade here: ${this.config.get('APP_URL', 'https://app.flowop.work')}/settings/billing\n\n` +
          `Questions? Reply to this message — we'll help you get back up and running! 🚀`,
        );
      }
    }

    if (ownerWa) {
      const waMsg = encodeURIComponent(`FlowOps: ${co.name} SUSPENDED (${reason}). Contact: ${co.email ?? 'N/A'}`);
      this.logger.warn(`[ACTION REQUIRED] WhatsApp owner: https://wa.me/${ownerWa}?text=${waMsg}`);
    }
    await this.audit.record({ action: 'subscription.suspended', actorType: 'system',
      targetType: 'company', targetId: co.id, targetName: co.name,
      metadata: { reason, suspendedAt: new Date().toISOString() } });
  }

  // ── Platform-level WhatsApp (sends from FlowOps number to any phone) ───

  /**
   * Send a WhatsApp message using the platform's own Business API credentials.
   * Used for trial lifecycle notifications to tenant admins.
   * Gracefully no-ops if WhatsApp is not configured.
   */
  private async _sendPlatformWhatsApp(to: string, message: string): Promise<boolean> {
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    const apiVersion = this.config.get<string>('WHATSAPP_API_VERSION', 'v21.0');

    if (!phoneNumberId || !accessToken) {
      this.logger.warn(`[WhatsApp not configured] Cannot send trial notification to ${to}`);
      return false;
    }

    // Normalize phone (remove + and spaces, keep digits only)
    const phone = to.replace(/^\+/, '').replace(/\s/g, '').replace(/[^0-9]/g, '');
    if (phone.length < 10) {
      this.logger.warn(`[WhatsApp] Invalid phone: ${to} — skipping`);
      return false;
    }

    try {
      await axios.post(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { preview_url: true, body: message },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      this.logger.log(`Platform WhatsApp sent → ${phone.slice(0, 4)}****${phone.slice(-3)}`);
      return true;
    } catch (err: any) {
      const detail = err?.response?.data?.error?.message ?? err.message;
      this.logger.warn(`Platform WhatsApp failed to ${phone}: ${detail}`);
      return false;
    }
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

  /**
   * Integration token health check.
   *
   * WhatsApp Business Cloud API tokens don't expire on a fixed schedule, but
   * they can be revoked (app secret rotation, Meta policy enforcement) or go
   * stale (company switches number, Business Manager changes). We detect a
   * stale integration by checking:
   *
   *   1. Credentials exist (connected) but `lastVerifiedAt` is null (never
   *      tested) OR hasn't been updated in > 7 days → warn with "test your
   *      integration" prompt.
   *
   *   2. Status is explicitly 'ERROR' (set by WhatsApp/Shopify service after
   *      a failed outbound call) → alert as critical.
   *
   * The WhatsApp service and ecommerce service should call
   * `IntegrationCredentialService.setStatus(companyId, provider, 'ERROR')`
   * when they receive an auth error from the provider. This rule then surfaces
   * that to the owner within 6 hours.
   */
  private async integrationTokenExpiryRule(): Promise<DraftAlert[]> {
    const alerts: DraftAlert[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

    // Find all integration credentials that are either in ERROR state or
    // haven't been verified in the last 7 days (or never verified).
    const stale = await (this.prisma as any).integrationCredential.findMany({
      where: {
        OR: [
          { status: 'ERROR' },
          { lastVerifiedAt: null },
          { lastVerifiedAt: { lt: sevenDaysAgo } },
        ],
      },
      include: {
        company: { select: { id: true, name: true, isActive: true } },
      },
    });

    for (const cred of stale) {
      if (!cred.company?.isActive) continue; // skip suspended tenants

      const isError = cred.status === 'ERROR';
      const neverVerified = !cred.lastVerifiedAt;
      const providerLabel = String(cred.provider).charAt(0).toUpperCase() + String(cred.provider).slice(1);
      const companyName = cred.company?.name ?? cred.companyId;

      if (isError) {
        alerts.push({
          type: 'integration_token_expiry',
          severity: 'critical',
          title: `🔴 ${providerLabel} integration broken: ${companyName}`,
          message:
            `The ${providerLabel} integration for "${companyName}" is in ERROR state. ` +
            `Outbound messages/webhooks are failing. The tenant should reconnect their ` +
            `${providerLabel} credentials under Settings → Integrations.`,
          tenantId: cred.companyId,
          tenantName: companyName,
          dedupeKey: `integration_error:${cred.companyId}:${cred.provider}:${today}`,
          metadata: {
            provider: cred.provider,
            status: cred.status,
            lastVerifiedAt: cred.lastVerifiedAt,
          },
        });
      } else {
        // Stale / never verified — advisory warning, not critical
        alerts.push({
          type: 'integration_token_expiry',
          severity: 'warning',
          title: `⚠️ ${providerLabel} integration unverified: ${companyName}`,
          message:
            `The ${providerLabel} integration for "${companyName}" has not been verified ` +
            `${neverVerified ? 'since it was connected' : `in ${Math.floor((Date.now() - new Date(cred.lastVerifiedAt).getTime()) / 86_400_000)} days`}. ` +
            `The tenant should test the connection under Settings → Integrations to confirm it's still active.`,
          tenantId: cred.companyId,
          tenantName: companyName,
          dedupeKey: `integration_stale:${cred.companyId}:${cred.provider}:${today}`,
          metadata: {
            provider: cred.provider,
            status: cred.status,
            lastVerifiedAt: cred.lastVerifiedAt ?? null,
          },
        });
      }
    }

    if (alerts.length > 0) {
      this.logger.warn(`Integration token check: ${alerts.length} stale/broken credential(s) found`);
    }

    return alerts;
  }
}
