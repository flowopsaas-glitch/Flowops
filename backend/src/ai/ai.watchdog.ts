import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiDevOpsService } from './ai-devops.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiWatchdog {
  private readonly logger = new Logger('FlowOps-Guardian');

  constructor(
    private readonly aiDevOps: AiDevOpsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Autonomous Health Check — runs every hour.
   * Uses a single aggregate query instead of N+1 per-company probes.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleAutomaticHealing(): Promise<void> {
    this.logger.log('Guardian: system integrity check starting...');

    try {
      // 1. Audit environmental credentials (non-blocking warnings)
      await this.auditCredentials();

      // 2. Single aggregate health probe — count active companies with recent waybills.
      //    This replaces the N+1 pattern (one query per company) with ONE query total.
      const healthCheck = await this.prisma.company.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          _count: { select: { waybills: true } },
        },
        take: 100, // Cap to prevent unbounded memory on very large platforms
      });

      // 3. Only probe companies that have waybills (skip empty/inactive tenants)
      const activeWithData = healthCheck.filter((c) => c._count.waybills > 0);

      // 4. Run a single aggregate query to verify database connectivity
      //    instead of one findFirst per company.
      const dbProbe = await this.prisma.waybill.count({
        where: {
          companyId: { in: activeWithData.slice(0, 10).map((c) => c.id) },
        },
      });

      if (dbProbe === 0 && activeWithData.length > 0) {
        this.logger.warn('Guardian: database probe returned 0 waybills for active companies — possible data issue');
      }

      this.logger.log(`Guardian: health check complete (${activeWithData.length} active tenants, db probe: ${dbProbe} records).`);
    } catch (err: any) {
      this.logger.error(`Guardian: system check failed: ${err?.message}`);

      if (this.isCodeInfection(err)) {
        this.logger.warn('Guardian: script-level anomaly detected, initiating repair...');
        await this.aiDevOps.repairScript('ClawService.ts', err.stack || 'NO_STACK_TRACE');
        await this.aiDevOps.repairScript('AiClawChat.tsx', 'UI_BLANK_PAGE_DETECTED');
      }
    }
  }

  /**
   * Anomaly detection — only flags catastrophic runtime failures.
   */
  private isCodeInfection(err: any): boolean {
    const message = err?.message?.toLowerCase() || '';
    return message.includes('is not a function') ||
           message.includes('cannot read properties of null') ||
           message.includes('maximum call stack');
  }

  /**
   * Credential audit — surfaces missing API keys as warnings.
   */
  private async auditCredentials(): Promise<void> {
    if (!process.env.GROQ_API_KEY) {
      this.logger.warn('GROQ_API_KEY not set — AI copilot uses deterministic fallbacks.');
    }

    const resendKey = process.env.RESEND_API_KEY || '';
    const sendgridKey = process.env.SENDGRID_API_KEY || '';
    if (!resendKey && (!sendgridKey || sendgridKey === 'SG.CHANGE_ME')) {
      this.logger.warn('No email provider configured (RESEND_API_KEY or SENDGRID_API_KEY) — outbound email disabled.');
    }
  }
}
