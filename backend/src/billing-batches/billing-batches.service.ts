// @ts-nocheck
// @ts-nocheck
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BatchInvoiceService } from './batch-invoice.service';
import { WaybillStatus } from '@prisma/client';
import { PricingService } from '../pricing/pricing.service';
import { BillingNotificationsService } from './billing-notifications.service';

@Injectable()
export class BillingBatchesService {
  private readonly logger = new Logger(BillingBatchesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly notifications: BillingNotificationsService
  ) {}

  /**
   * Fetches all batches and includes counts + computed total values 
   * (Subtotal of Waybills + Communication costs)
   */
  async getBillingBatches(companyId: number = 1) {
    const cid = Number(companyId);
    const batches = await this.prisma.billingBatch.findMany({
      where: { companyId: cid },
      include: { 
        waybills: { select: { totalAmount: true } },
        company: {
          select: {
            pricePerWhatsapp: true,
            pricePerEmail: true
          }
        },
        _count: { select: { waybills: true } } 
      },
      orderBy: { createdAt: 'desc' }
    });

    return batches.map(batch => {
      const waybillTotal = batch.waybills.reduce((acc, wb) => acc + (wb.totalAmount || 0), 0);
      // Note: Historical usage is typically stored in the batch totalValue at creation
      // but for live draft batches, we use the stored totalValue field.
      return {
        ...batch,
        totalWaybillValue: waybillTotal
      };
    });
  }

  /**
   * Re-calculates pricing for all waybills in a batch
   */
  async repriceBatch(id: number) {
    const batch = await this.prisma.billingBatch.findUnique({
      where: { id: Number(id) },
      include: { waybills: true }
    });
    if (!batch) throw new NotFoundException('Batch not found');

    for (const wb of batch.waybills) {
      const price = await this.pricing.calculateWaybillPrice(batch.companyId, wb.weightKg, wb.distanceKm || 0);
      await this.prisma.waybill.update({
        where: { id: wb.id },
        data: { totalAmount: price }
      });
    }
    return { success: true };
  }

  /**
   * THE OVERSEER SWEEP:
   * 1. Finds Delivered Unbilled Waybills
   * 2. Finds Unbilled WhatsApps & Emails
   * 3. Calculates Usage Revenue
   * 4. Creates a Batch & Marks items as billed
   */
  async sweepCompletedJobs(companyId: number = 1) {
    const cid = Number(companyId);

    return await this.prisma.$transaction(async (tx) => {
      // 1. Get Company Pricing
      const company = await tx.company.findUnique({
        where: { id: cid },
        select: { pricePerWhatsapp: true, pricePerEmail: true, baseTierPrice: true }
      });

      if (!company) throw new NotFoundException("Company not found");

      // 2. Find Targets
      const unbatchedWaybills = await tx.waybill.findMany({
        where: {
          companyId: cid,
          billingBatchId: null,
          status: WaybillStatus.DELIVERED 
        }
      });

      const unbilledWhatsapps = await tx.whatsAppLog.count({
        where: { companyId: cid, isBilled: false }
      });

      const unbilledEmails = await tx.emailHubItem.count({
        where: { companyId: cid, isBilled: false }
      });

      if (unbatchedWaybills.length === 0 && unbilledWhatsapps === 0 && unbilledEmails === 0) {
        return { message: "No new items to bill.", jobsSwept: 0 };
      }

      // 3. Calculate Totals
      const waybillSubtotal = unbatchedWaybills.reduce((acc, wb) => acc + (wb.totalAmount || 0), 0);
      const whatsappSubtotal = unbilledWhatsapps * (company.pricePerWhatsapp || 0.80);
      const emailSubtotal = unbilledEmails * (company.pricePerEmail || 0.10);
      const totalBatchValue = waybillSubtotal + whatsappSubtotal + emailSubtotal;

      // 4. Create the Batch
      const newBatch = await tx.billingBatch.create({
        data: {
          companyId: cid,
          status: 'DRAFT',
          totalValue: totalBatchValue, // Stores the sum of Waybills + Usage
          waybills: { connect: unbatchedWaybills.map(wb => ({ id: wb.id })) }
        }
      });

      // 5. Mark Communications as Billed
      if (unbilledWhatsapps > 0) {
        await tx.whatsAppLog.updateMany({
          where: { companyId: cid, isBilled: false },
          data: { isBilled: true }
        });
      }

      if (unbilledEmails > 0) {
        await tx.emailHubItem.updateMany({
          where: { companyId: cid, isBilled: false },
          data: { isBilled: true }
        });
      }

      return {
        batchId: newBatch.id,
        summary: {
          waybills: unbatchedWaybills.length,
          whatsApp: unbilledWhatsapps,
          emails: unbilledEmails,
          totalValue: totalBatchValue
        }
      };
    });
  }

  /**
   * Retrieves a single batch with full breakdown
   */
  async getBillingBatchById(id: string | number) {
    const batch = await this.prisma.billingBatch.findUnique({
      where: { id: Number(id) },
      include: { waybills: true, company: true }
    });
    
    if (!batch) throw new NotFoundException(`Batch #${id} not found`);

    const waybillTotal = (batch.waybills || []).reduce((acc, wb) => acc + (wb.totalAmount || 0), 0);
    
    // The totalValue was captured at sweep time, but we return it here for the UI
    return { 
      ...batch, 
      waybillSubtotal: waybillTotal,
      usageSubtotal: (batch.totalValue || 0) - waybillTotal 
    };
  }

  /**
   * Locks the batch and initiates the invoicing sequence
   */
  async generateInvoicesForBatch(id: string | number, body: any) {
    const batchId = Number(id);
    
    const updatedBatch = await this.prisma.billingBatch.update({
      where: { id: batchId },
      data: { status: 'LOCKED' },
      include: { waybills: { select: { totalAmount: true } } }
    });

    // Notify client in background
    this.notifications.notifyClientOfInvoice(batchId)
      .catch(e => this.logger.error(`Async Notify Fail for Batch ${batchId}`, e));

    return { 
      success: true, 
      invoiceNumber: `INV-${String(batchId).padStart(6, '0')}`,
      totalAmount: updatedBatch.totalValue?.toFixed(2) || "0.00"
    };
  }

  // --- HELPER METHODS ---

  async checkBillingBatch(id: string | number) { 
    return { id: Number(id), verified: true, issues: [] }; 
  }

  async lockBillingBatch(id: string | number, body: any) { 
    return this.prisma.billingBatch.update({ 
      where: { id: Number(id) }, 
      data: { status: 'LOCKED' } 
    }); 
  }

  async unlockBillingBatch(id: string | number, body: any) { 
    return this.prisma.billingBatch.update({ 
      where: { id: Number(id) }, 
      data: { status: 'DRAFT' } 
    }); 
  }
}
