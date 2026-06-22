import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AiEventsService } from '../ai-events.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClawWorkerService {
  private readonly logger = new Logger(ClawWorkerService.name);

  constructor(
    private readonly aiEventsService: AiEventsService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Orchestrates the multi-tenant logistics sweep.
   * Runs every 5 minutes based on project specifications.
   */
  @Cron('*/5 * * * *') 
  async handleScheduledExtraction() {
    this.logger.log('🤖 AI Claw: Initiating multi-tenant logistics sweep...');

    try {
      // 1. Fetch all active companies to ensure strict data isolation boundaries
      const companies = await this.prisma.company.findMany({
        select: { id: true }
      });

      if (!companies || companies.length === 0) {
        this.logger.warn('⚠️ Multi-tenant sweep complete: No active company entities registered in the database cluster.');
        return;
      }

      this.logger.debug(`📡 Sector Scan: Found ${companies.length} corporate nodes to audit.`);

      // 2. Process tasks sequentially to keep a low database load across multi-tenant schemas
      for (const company of companies) {
        try {
          this.logger.debug(`🔄 Syncing data pipeline matrix for Company ID: ${company.id}...`);
          
          // Trigger the operational sync via your core event layer service
          await this.aiEventsService.syncExistingToAIEvents(company.id as any);
          
          this.logger.log(`✅ System Sync successful for Company ID: ${company.id}`);
        } catch (error: unknown) {
          // Explicitly type-guarding variables handles TS18046 code parsing rules perfectly
          const errorMessage = error instanceof Error ? error.message : 'Unknown cognitive sync loop exception';
          this.logger.error(`❌ Claw processing failure for Company Node ${company.id}: ${errorMessage}`);
        }
      }
      
      this.logger.log('🏁 AI Claw: Multi-tenant logistics sweep operation complete.');
    } catch (globalError: unknown) {
      const globalMsg = globalError instanceof Error ? globalError.message : 'Critical system database platform failure';
      this.logger.error(`🚨 CRITICAL CLAW WORKER STRUCTURAL FAILURE: ${globalMsg}`);
    }
  }
}

