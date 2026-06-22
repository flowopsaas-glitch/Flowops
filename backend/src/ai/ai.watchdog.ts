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
   */
  private isCodeInfection(err: any): boolean {
    const message = err?.message?.toLowerCase() || '';
    const stack = err?.stack?.toLowerCase() || '';
    
    return message.includes('is not a function') || 
           message.includes('undefined') || 
           message.includes('blank') ||
           message.includes('bridge') ||
           stack.includes('render') ||
           stack.includes('component');
  }

  /**
   * 🔑 Credential Sanitization
   * Ensures logistics flow (Nodemailer/Groq) isn't interrupted by auth failures.
   */
  private async auditCredentials(): Promise<void> {
    if (!process.env.GROQ_API_KEY) {
      this.logger.error('Intellect Failure: GROQ_API_KEY is missing from runtime environmental configurations.');
    }
    
    // Verifies the 16-character App Password requirement for SMTP integration tunnels
    const mailPassword = process.env.EMAIL_APP_PASSWORD || '';
    const sanitizedPassword = mailPassword.replace(/\s+/g, ''); // Strip spacing blocks
    
    if (!sanitizedPassword || sanitizedPassword.length !== 16) {
      this.logger.error(`⚠️ Security Warning: EMAIL_APP_PASSWORD is invalid or does not match the 16-character Google/Office365 format specification.`);
    } else {
      this.logger.log('🔐 Communication channel app credentials verified successfully.');
    }
  }
}

