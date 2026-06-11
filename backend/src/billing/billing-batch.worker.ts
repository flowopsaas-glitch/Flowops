import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

interface BillingSweepJobData {
  batchId: number;
  companyId: number;
}

@Processor("billing-automation-queue")
export class BillingBatchWorker extends WorkerHost {
  private readonly logger = new Logger(BillingBatchWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<BillingSweepJobData>): Promise<any> {
    if (job.name !== "execute-billing-sweep") {
      this.logger.warn("Unknown job action context skipped");
      return { processed: false };
    }

    const { batchId, companyId } = job.data;
    this.logger.log("Executing automated billing sweep batch pass");

    try {
      const unbilledWaybills = await this.prisma.waybill.findMany({
        where: {
          companyId: Number(companyId),
          status: "DELIVERED",
          billingBatchId: null,
        },
      });

      if (unbilledWaybills.length === 0) {
        this.logger.log("Zero unbilled waybills located");
        return { success: true, aggregatedItems: 0 };
      }

      const totalBatchAmount = unbilledWaybills.reduce((sum, current) => sum + current.totalAmount, 0);

      await this.prisma.$transaction([
        this.prisma.waybill.updateMany({
          where: { id: { in: unbilledWaybills.map(w => w.id) } },
          data: { billingBatchId: Number(batchId) },
        }),
        (this.prisma as any).billingBatch.update({
          where: { id: Number(batchId) },
          data: {
            status: "COMPLETED",
            totalValue: totalBatchAmount,
          },
        }),
      ]);

      this.logger.log("Billing batch aggregation transaction committed safely");
      return { success: true, aggregatedItems: unbilledWaybills.length, volumeZAR: totalBatchAmount };

    } catch (error: any) {
      this.logger.error("Critical transactional billing runtime exception caught");
      throw error;
    }
  }
}