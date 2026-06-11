import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface BillingSweepJobData {
  batchId: number;
  companyId: number;
}

@Processor('billing-automation-queue')
export class BillingBatchWorker extends WorkerHost {
  private readonly logger = new Logger(BillingBatchWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Primary Consumer Entry Point
   * Sweeps delivered waybills and aggregates them into corporate invoices
   */
  async process(job: Job<BillingSweepJobData>): Promise<any> {
    if (job.name !== 'execute-billing-sweep') {
      this.logger.warn(`⚠️ Unknown job action skipped: ${job.name}`);
      return { processed: false };
    }

    const { batchId, companyId } = job.data;
    this.logger.log(`⚙️ Executing Automated Billing Sweep for Batch #${batchId} (Company: ${companyId})`);

    try {
      // 1. Locate all unbilled waybills matching company workspace boundaries
      const unbilledWaybills = await this.prisma.waybill.findMany({
        where: {
          companyId: Number(companyId),
          status: 'DELIVERED',
          billingBatchId: null,
        },
      });

      if (unbilledWaybills.length === 0) {
        this.logger.log(`💡 Zero unbilled waybills located for company room space: ${companyId}. Finalizing batch.`);
        return { success: true, aggregatedItems: 0 };
      }

      // 2. Aggregate financial variables using currency configurations (ZAR)
      const totalBatchAmount = unbilledWaybills.reduce((sum, current) => sum + current.totalAmount, 0);

      // 3. Update database data states transactionally
      await this.prisma.$transaction([
        // Bind waybills to the active billing batch identifier reference
        this.prisma.waybill.updateMany({
          where: { id: { in: unbilledWaybills.map(w => w.id) } },
          data: { billingBatchId: Number(batchId) },
        }),
        // Update total values inside your billing batch schema fields
        (this.prisma as any).billingBatch.update({
          where: { id: Number(batchId) },
          data: {
            status: 'COMPLETED',
            totalValue: totalBatchAmount, // 🚀 FIXED: Changed from totalAmount to totalValue to match schema requirements
            updatedAt: new Date(),
          },
        }),
      ]);

      this.logger.log(`✅ Billing aggregation complete. Consolidated ${unbilledWaybills.length} waybills totaling R${totalBatchAmount.toFixed(2)}`);
      return { success: true, aggregatedItems: unbilledWaybills.length, volumeZAR: totalBatchAmount };

    } catch (error: any) {
      this.logger.error(`❌ Critical billing runtime error: ${error.message}`);
      throw error;
    }
  }
}

