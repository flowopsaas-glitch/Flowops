import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AiEventsService } from '../ai-events.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Process companies in batches with concurrency control. */
async function batchProcess<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(fn));
  }
}

@Injectable()
export class ClawWorkerService {
  private readonly logger = new Logger(ClawWorkerService.name);

  /** Max companies to process in parallel per batch. */
  private static readonly BATCH_CONCURRENCY = 5;

  constructor(
    private readonly aiEventsService: AiEventsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Multi-tenant logistics sweep — runs every 30 minutes.
   * Uses batched concurrent processing instead of sequential loop.
   */
  @Cron('*/30 * * * *')
  async handleScheduledExtraction() {
    this.logger.log('AI Claw: Initiating multi-tenant logistics sweep...');

    try {
      const companies = await this.prisma.company.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      if (!companies.length) {
        this.logger.warn('Multi-tenant sweep: no active companies found.');
        return;
      }

      this.logger.log(`Processing ${companies.length} companies (batch size: ${ClawWorkerService.BATCH_CONCURRENCY})...`);

      let successCount = 0;
      let failCount = 0;

      await batchProcess(companies, ClawWorkerService.BATCH_CONCURRENCY, async (company) => {
        try {
          await this.aiEventsService.syncExistingToAIEvents(company.id as any);
          successCount++;
        } catch (error: unknown) {
          failCount++;
          const msg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(`Claw sync failed for company ${company.id}: ${msg}`);
        }
      });

      this.logger.log(`AI Claw sweep complete: ${successCount} ok, ${failCount} failed (${companies.length} total).`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`CRITICAL: Claw worker failed to start: ${msg}`);
    }
  }
}
