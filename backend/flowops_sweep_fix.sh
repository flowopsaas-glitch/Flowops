#!/bin/bash
# FLOWOPS: BILLING SWEEP ENUM & TYPE FIX

SERVICE_FILE="src/billing-batches/billing-batches.service.ts"
echo "🛠️  Applying Enum types to $SERVICE_FILE..."

# We'll use a clean overwrite to ensure the imports and logic are 100% correct
cat << 'SVC_EOF' > $SERVICE_FILE
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WaybillStatus } from '@prisma/client';

@Injectable()
export class BillingBatchesService {
  private readonly logger = new Logger(BillingBatchesService.name);

  constructor(private prisma: PrismaService) {}

  async sweep(companyId: number) {
    this.logger.log(`Syncing Billing Ledger for Company #${companyId}...`);
    
    try {
      const cid = Number(companyId);
      
      // 1. Find all waybills that are ready to be billed
      const unbatchedWaybills = await this.prisma.waybill.findMany({
        where: {
          companyId: cid,
          billingBatchId: null,
          status: {
            in: [
              WaybillStatus.REGISTERED,
              WaybillStatus.DISPATCHED,
              WaybillStatus.DELIVERED
            ]
          }
        }
      });

      if (unbatchedWaybills.length === 0) {
        return { message: "No new waybills found to sweep.", count: 0 };
      }

      // 2. Create the batch
      const batch = await this.prisma.billingBatch.create({
        data: {
          companyId: cid,
          status: 'DRAFT',
          waybills: {
            connect: unbatchedWaybills.map(wb => ({ id: wb.id }))
          }
        }
      });

      this.logger.log(`✅ Sweep Complete: Created Batch #${batch.id} with ${unbatchedWaybills.length} waybills.`);
      return batch;

    } catch (error) {
      this.logger.error(`Sweep failed: ${error.message}`);
      throw error;
    }
  }

  async list(companyId: number) {
    return this.prisma.billingBatch.findMany({
      where: { companyId: Number(companyId) },
      include: { _count: { select: { waybills: true } } },
      orderBy: { createdAt: 'desc' }
    });
  }
}
SVC_EOF

echo "✅ Billing Service updated."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
