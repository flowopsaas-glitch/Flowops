import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiDevOpsService } from './ai-devops.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiWatchdog {
  private readonly logger = new Logger('FlowOps-Guardian');

  constructor(
    private readonly aiDevOps: AiDevOpsService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * 🛡️ Autonomous Healing Loop
   * Scans for "Radioactive" code and UI bridge failures every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleAutomaticHealing(): Promise<void> {
    this.logger.log('--- THE CLAW: SCANNING SYSTEM INTEGRITY ---');
    
    try {
      // 1. Audit Environmental Integrity
      await this.auditCredentials();

      // Explicitly type and pull companies to prevent runtime memory bloat
      const companies = await this.prisma.company.findMany({ 
        select: { id: true } 
      });

      for (const company of companies) {
        try {
          this.logger.debug(`Verifying operational bridge for Company ID ${company.id}...`);
          
          // Execute live simulation probe query across company waybills to catch database drops
          await this.prisma.waybill.findFirst({
            where: { companyId: company.id }
          });

        } catch (err: any) {
          this.logger.error(`Discrepancy located in Company ID ${company.id}: ${err?.message}`);

          // 🧬 CLAW AUTO-REPAIR: Targeting the "Blank Page" issue
          if (this.isCodeInfection(err)) {
             this.logger.warn(`Watchdog identified a script-level anomaly. Initiating Self-Healing protocols...`);
             
             // Repair the backend script state mapping records securely
             await this.aiDevOps.repairScript('ClawService.ts', err.stack || 'NO_STACK_TRACE_AVAILABLE');
             
             // Inject code correction updates back into the shared workspace models
             await this.aiDevOps.repairScript('AiClawChat.tsx', 'UI_BLANK_PAGE_DETECTED');
          }
        }
      }
    } catch (criticalErr: any) {
      this.logger.error(`CRITICAL SYSTEM FAILURE WITHIN GUARDIAN WATCHDOG LOOP: ${criticalErr?.message}`);
    }
    
    this.logger.log('--- SCAN COMPLETE: SYSTEMS STABILIZED ---');
  }

  /**
   * 🔍 Anomaly Detection Logic
   * Narrowed to only trigger on genuine code-level crashes — not normal
   * Prisma validation errors or missing-data scenarios which are expected.
   */
  private isCodeInfection(err: any): boolean {
    const message = err?.message?.toLowerCase() || '';
    // Only flag catastrophic runtime failures, not everyday query errors
    return message.includes('is not a function') ||
           message.includes('cannot read properties of null') ||
           message.includes('maximum call stack');
  }

  /**
   * 🔑 Credential Sanitization
   * Surfaces missing AI/email credentials as low-noise warnings (not hard errors)
   * so they don't masquerade as failures in the logs.
   */
  private async auditCredentials(): Promise<void> {
    if (!process.env.GROQ_API_KEY) {
      this.logger.warn('GROQ_API_KEY is not set — AI copilot/Plan-build features will use deterministic fallbacks.');
    }

    // Email is delivered via SendGrid (EmailService), NOT SMTP app passwords.
    // Only warn when SendGrid isn't configured; never error on the legacy
    // EMAIL_APP_PASSWORD, which this platform does not use.
    const sendgridKey = process.env.SENDGRID_API_KEY || '';
    if (!sendgridKey || sendgridKey === 'SG.CHANGE_ME') {
      this.logger.warn('SENDGRID_API_KEY is not set — outbound email (verification, password reset, invoice reminders) is disabled until configured.');
    } else {
      this.logger.log('🔐 Email (SendGrid) credentials present.');
    }
  }
}

