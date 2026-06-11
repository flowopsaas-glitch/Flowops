import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BillingBatchesService } from '../billing-batches/billing-batches.service';

@Injectable()
export class AutoSweepService {
  private readonly logger = new Logger(AutoSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingBatches: BillingBatchesService,
  ) {}

  /**
   * Run billing sweep every day at midnight
   * Finds all DELIVERED waybills and adds them to billing batches
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyBillingSweep() {
    this.logger.log('🌙 Running daily billing sweep...');
    
    try {
      const companies = await this.prisma.company.findMany({
        select: { id: true, name: true },
      });

      for (const company of companies) {
        try {
          const result = await this.billingBatches.sweepCompletedJobs(company.id);
          this.logger.log(`✅ Billing sweep for ${company.name}: ${result.jobsSwept || 0} items processed`);
        } catch (error: any) {
          this.logger.error(`❌ Billing sweep failed for ${company.name}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`❌ Daily billing sweep failed: ${error.message}`);
    }
  }

  /**
   * Manual trigger for testing
   */
  async triggerSweep(companyId: number) {
    this.logger.log(`🔧 Manual billing sweep triggered for company ${companyId}`);
    return this.billingBatches.sweepCompletedJobs(companyId);
  }
}
