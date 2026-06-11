// src/billing-batches/billing-notifications.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class BillingNotificationsService {
  private readonly logger = new Logger(BillingNotificationsService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private whatsapp?: WhatsAppService,
  ) {}

  /**
   * ✅ Minimal: Notify client of invoice - uses only guaranteed fields
   */
  async notifyClientOfInvoice(batchId: number): Promise<{ success: boolean; message?: string }> {
    try {
      // Fetch batch - use only fields that definitely exist
      const batch: any = await this.prisma.billingBatch.findUnique({
        where: { id: batchId },
        // ✅ Don't include relations that might not exist - fetch separately if needed
      });

      if (!batch) {
        this.logger.warn(`🚫 Notification Skipped: Batch #${batchId} not found`);
        return { success: false, message: 'Batch not found' };
      }

      // ✅ Fetch company separately to avoid relation issues
      const company: any = batch.companyId 
        ? await this.prisma.company.findUnique({ where: { id: batch.companyId } })
        : null;

      // ✅ Use safe field access - adjust based on your actual schema
      const phone = company?.phone || company?.contactPhone || company?.mobile || null;
      
      if (!phone) {
        this.logger.warn(`🚫 Notification Skipped: No phone for Batch #${batchId}`);
        return { success: false, message: 'No contact phone found' };
      }

      // ✅ Calculate total from batch fields (adjust based on your schema)
      const total = batch.total || batch.totalAmount || batch.value || 0;
      const clientName = company?.name || 'Valued Client';
      const sanitizedPhone = this._sanitizePhoneNumber(phone);
      const invoiceUrl = `${process.env.FRONTEND_URL || 'https://flowops.co.za'}/portal/invoices/${batchId}`;

      // Build message
      const message = `*FlowOps Billing Update* 🚛\n\n` +
        `Hi ${clientName},\n\n` +
        `Your invoice for Batch *#${String(batchId).padStart(4, '0')}* is ready.\n` +
        `💰 Total Due: *R ${Number(total).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}*\n\n` +
        `View your statement here: ${invoiceUrl}\n\n` +
        `_Automated by FlowOps Engine_`;

      // Send via WhatsApp if available
      if (this.whatsapp && company?.id) {
        try {
          await this.whatsapp.sendMessage(sanitizedPhone, message, company.id);
          this.logger.log(`📲 WhatsApp sent to ${clientName} (${sanitizedPhone})`);
          return { success: true, message: 'Notification sent' };
        } catch (err: any) {
          this.logger.error(`❌ WhatsApp failed: ${err?.message}`);
          return { success: false, message: `WhatsApp error: ${err?.message}` };
        }
      }

      this.logger.warn('⚠️ WhatsAppService not available - skipping');
      return { success: true, message: 'Notification queued (WhatsApp unavailable)' };

    } catch (error: any) {
      this.logger.error(`❌ Failed to notify for Batch #${batchId}: ${error?.message}`);
      return { success: false, message: error?.message || 'Unknown error' };
    }
  }

  /**
   * ✅ Minimal: Sanitize phone number
   */
  private _sanitizePhoneNumber(phone: string): string {
    if (!phone) return '';
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('0') && !cleaned.startsWith('+')) {
      cleaned = '+27' + cleaned.slice(1);
    }
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }
}
