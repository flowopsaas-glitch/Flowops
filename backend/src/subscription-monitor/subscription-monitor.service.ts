// src/subscription-monitor/subscription-monitor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

export interface SubscriptionAlert {
  id: string;
  companyId: number;
  companyName: string;
  plan: string;
  alertType: 'TRIAL_EXPIRING' | 'TRIAL_EXPIRED' | 'DEMO_EXPIRING' | 'DEMO_EXPIRED' | 'SUBSCRIPTION_LOCKED';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  expiresAt: Date | null;
  daysRemaining: number;
  createdAt: Date;
}

@Injectable()
export class SubscriptionMonitorService {
  private readonly logger = new Logger('SubscriptionMonitor');

  // In-memory alert store (persisted per uptime cycle; could be moved to DB later)
  private alerts: SubscriptionAlert[] = [];
  private lastSweepAt: Date | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // CRON: Runs every hour to check subscription/demo/trial expiry
  // ─────────────────────────────────────────────────────────────────────────────
  @Cron(CronExpression.EVERY_HOUR)
  async handleSubscriptionSweep() {
    this.logger.log('🔍 Subscription Monitor: Starting hourly expiry sweep...');
    this.lastSweepAt = new Date();

    const now = new Date();
    const newAlerts: SubscriptionAlert[] = [];

    try {
      // ── 1. Check TRIAL expiry (trialEndsAt field) ───────────────────────
      const trialCompanies = await this.prisma.company.findMany({
        where: {
          trialEndsAt: { not: null },
          status: { in: ['Active', 'Trialing'] },
        },
        select: { id: true, name: true, plan: true, status: true, trialEndsAt: true },
      });

      for (const company of trialCompanies) {
        if (!company.trialEndsAt) continue;
        const daysRemaining = this.getDaysUntil(now, company.trialEndsAt);

        if (daysRemaining <= 0) {
          // Trial EXPIRED
          newAlerts.push(this.createAlert(company, 'TRIAL_EXPIRED', 'CRITICAL', daysRemaining, company.trialEndsAt));

          // Auto-lock if not already locked
          if (company.status !== 'Locked') {
            await this.prisma.company.update({
              where: { id: company.id },
              data: { status: 'Locked' },
            });
            this.logger.warn(`🔒 Auto-locked company "${company.name}" (ID: ${company.id}) — trial expired`);
          }
        } else if (daysRemaining <= 1) {
          newAlerts.push(this.createAlert(company, 'TRIAL_EXPIRING', 'CRITICAL', daysRemaining, company.trialEndsAt));
        } else if (daysRemaining <= 3) {
          newAlerts.push(this.createAlert(company, 'TRIAL_EXPIRING', 'WARNING', daysRemaining, company.trialEndsAt));
        } else if (daysRemaining <= 7) {
          newAlerts.push(this.createAlert(company, 'TRIAL_EXPIRING', 'INFO', daysRemaining, company.trialEndsAt));
        }
      }

      // ── 2. Check DEMO expiry (demoExpiresAt field) ──────────────────────
      const demoCompanies = await this.prisma.company.findMany({
        where: {
          demoEnabled: true,
          demoExpiresAt: { not: null },
        },
        select: { id: true, name: true, plan: true, status: true, demoExpiresAt: true },
      });

      for (const company of demoCompanies) {
        if (!company.demoExpiresAt) continue;
        const daysRemaining = this.getDaysUntil(now, company.demoExpiresAt);

        if (daysRemaining <= 0) {
          // Demo EXPIRED
          newAlerts.push(this.createAlert(company, 'DEMO_EXPIRED', 'CRITICAL', daysRemaining, company.demoExpiresAt));

          // Disable demo flag
          await this.prisma.company.update({
            where: { id: company.id },
            data: { demoEnabled: false },
          });
          this.logger.warn(`⏹️ Disabled demo for company "${company.name}" (ID: ${company.id}) — demo expired`);
        } else if (daysRemaining <= 1) {
          newAlerts.push(this.createAlert(company, 'DEMO_EXPIRING', 'CRITICAL', daysRemaining, company.demoExpiresAt));
        } else if (daysRemaining <= 3) {
          newAlerts.push(this.createAlert(company, 'DEMO_EXPIRING', 'WARNING', daysRemaining, company.demoExpiresAt));
        } else if (daysRemaining <= 7) {
          newAlerts.push(this.createAlert(company, 'DEMO_EXPIRING', 'INFO', daysRemaining, company.demoExpiresAt));
        }
      }

      // ── 3. Check already-locked companies (for dashboard visibility) ────
      const lockedCompanies = await this.prisma.company.findMany({
        where: { status: 'Locked' },
        select: { id: true, name: true, plan: true, status: true, trialEndsAt: true, demoExpiresAt: true },
      });

      for (const company of lockedCompanies) {
        newAlerts.push({
          id: `locked-${company.id}-${now.getTime()}`,
          companyId: company.id,
          companyName: company.name,
          plan: company.plan || 'STARTER',
          alertType: 'SUBSCRIPTION_LOCKED',
          severity: 'CRITICAL',
          message: `"${company.name}" is locked — subscription expired. Contact tenant for renewal.`,
          expiresAt: company.trialEndsAt || company.demoExpiresAt || null,
          daysRemaining: 0,
          createdAt: now,
        });
      }

      // Replace old alerts with fresh sweep results
      this.alerts = newAlerts;

      // Summary log
      const critical = newAlerts.filter(a => a.severity === 'CRITICAL').length;
      const warnings = newAlerts.filter(a => a.severity === 'WARNING').length;
      const info = newAlerts.filter(a => a.severity === 'INFO').length;

      this.logger.log(
        `✅ Subscription Monitor sweep complete: ${newAlerts.length} alerts ` +
        `(${critical} critical, ${warnings} warnings, ${info} info)`
      );
    } catch (error: any) {
      this.logger.error(`❌ Subscription Monitor sweep failed: ${error?.message}`, error?.stack);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API: Get current alerts for the SuperAdmin dashboard
  // ─────────────────────────────────────────────────────────────────────────────
  getAlerts(severity?: string): SubscriptionAlert[] {
    if (severity) {
      return this.alerts.filter(a => a.severity === severity.toUpperCase());
    }
    return this.alerts;
  }

  getAlertsSummary() {
    return {
      total: this.alerts.length,
      critical: this.alerts.filter(a => a.severity === 'CRITICAL').length,
      warnings: this.alerts.filter(a => a.severity === 'WARNING').length,
      info: this.alerts.filter(a => a.severity === 'INFO').length,
      lastSweepAt: this.lastSweepAt?.toISOString() || null,
      expiringWithin7Days: this.alerts.filter(a => a.daysRemaining > 0 && a.daysRemaining <= 7).length,
      alreadyExpired: this.alerts.filter(a => a.daysRemaining <= 0).length,
    };
  }

  /**
   * Force a manual sweep (callable from controller for on-demand refresh)
   */
  async triggerManualSweep() {
    await this.handleSubscriptionSweep();
    return { message: 'Sweep completed', alerts: this.alerts.length, lastSweepAt: this.lastSweepAt };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────
  private getDaysUntil(now: Date, target: Date): number {
    const diffMs = target.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private createAlert(
    company: { id: number; name: string; plan: string | null; status: string | null },
    alertType: SubscriptionAlert['alertType'],
    severity: SubscriptionAlert['severity'],
    daysRemaining: number,
    expiresAt: Date | null,
  ): SubscriptionAlert {
    const typeLabel = alertType.includes('DEMO') ? 'Demo' : 'Trial';
    const statusLabel = daysRemaining <= 0
      ? `${typeLabel} has expired`
      : `${typeLabel} expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`;

    return {
      id: `${alertType.toLowerCase()}-${company.id}-${Date.now()}`,
      companyId: company.id,
      companyName: company.name,
      plan: company.plan || 'STARTER',
      alertType,
      severity,
      message: `"${company.name}" — ${statusLabel}.`,
      expiresAt,
      daysRemaining,
      createdAt: new Date(),
    };
  }
}
