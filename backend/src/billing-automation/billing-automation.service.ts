import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentType, WaybillStatus } from '@prisma/client';

@Injectable()
export class BillingAutomationService {
  private readonly logger = new Logger(BillingAutomationService.name);

  constructor(private prisma: PrismaService) {}

  async processNewWaybills() {
    this.logger.log('🔍 Scanning for unbilled waybills...');
    
    const unbilledWaybills = await this.prisma.waybill.findMany({
      where: {
        billingBatchId: null,
        status: WaybillStatus.DELIVERED
      },
      take: 50
    });

    if (unbilledWaybills.length === 0) {
      this.logger.log('✅ No unbilled waybills found');
      return { processed: 0 };
    }

    this.logger.log(`📦 Found ${unbilledWaybills.length} unbilled waybills`);

    // Group by company
    const groupedByCompany = this.groupByCompany(unbilledWaybills);

    let totalProcessed = 0;
    for (const [companyId, waybills] of Object.entries(groupedByCompany)) {
      await this.createBillingBatch(Number(companyId), waybills as any[]);
      totalProcessed += waybills.length;
    }

    this.logger.log(`✅ Processed ${totalProcessed} waybills into billing batches`);
    return { processed: totalProcessed };
  }

  private groupByCompany(waybills: any[]) {
    const grouped: Record<number, any[]> = {};

    for (const waybill of waybills) {
      const companyId = waybill.companyId || 1;
      if (!grouped[companyId]) {
        grouped[companyId] = [];
      }
      grouped[companyId].push(waybill);
    }

    return grouped;
  }

  private async createBillingBatch(companyId: number, waybills: any[]) {
    try {
      // Calculate totals
      const subtotal = waybills.reduce((sum, w) => sum + (w.amount || w.totalAmount || 0), 0);
      const vatAmount = subtotal * 0.15; // 15% VAT
      const total = subtotal + vatAmount;

      // Generate batch number
      const batchNumber = `BB-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Create billing batch
      const batch = await this.prisma.billingBatch.create({
        data: {
          batchNumber,
          companyId,
          waybillCount: waybills.length,
          subtotal,
          vatAmount,
          total,
          status: 'OPEN'
        }
      });

      // Update waybills to link to this batch
      await this.prisma.waybill.updateMany({
        where: { id: { in: waybills.map(w => w.id) } },
        data: { billingBatchId: batch.id }
      });

      this.logger.log(`💰 Created billing batch #${batch.id} (${batchNumber}): R${total} (${waybills.length} waybills)`);
      return batch;
    } catch (error: any) {
      this.logger.error(`❌ Failed to create billing batch: ${error.message}`);
      return null;
    }
  }

  async getWaybillInbox(companyId: number = 1) {
    return this.prisma.waybill.findMany({
      where: {
        companyId,
        status: WaybillStatus.PENDING,
        billingBatchId: null
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  }

  async approveWaybill(waybillId: number) {
    const waybill = await this.prisma.waybill.update({
      where: { id: waybillId },
      data: { status: WaybillStatus.DELIVERED }
    });

    await this.processNewWaybills();
    return waybill;
  }
}
