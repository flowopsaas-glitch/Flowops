// src/whatsapp/whatsapp-automation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';

@Injectable()
export class WhatsAppAutomationService {
  private readonly logger = new Logger(WhatsAppAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async sendEnRouteNotification(waybillId: number): Promise<void> {
    try {
      const waybill = await this.prisma.waybill.findUnique({
        where: { id: waybillId },
      });

      if (!waybill || !waybill.receiverPhone) {
        this.logger.warn(`⚠️ Cannot send en-route notification: missing waybill or receiver phone`);
        return;
      }

      const message = `
🚚 *Your Delivery is On the Way!*

Hi ${waybill.receiverName || 'there'},

Your parcel *${waybill.waybillNumber}* is now on its way to you!

📍 *Destination:* ${waybill.destination || 'N/A'}

You can track your delivery at:
https://track.flowop.work/${waybill.waybillNumber}

Thank you for choosing FlowOps! 🇿🇦
      `.trim();

      await this.whatsapp.sendMessage(waybill.receiverPhone, message, waybill.companyId);
      this.logger.log(`✅ En-route notification sent to ${waybill.receiverPhone}`);
    } catch (error: any) {
      this.logger.error(`❌ Failed to send en-route notification: ${error.message}`);
    }
  }

  async sendDeliveredNotification(waybillId: number): Promise<void> {
    try {
      const waybill = await this.prisma.waybill.findUnique({
        where: { id: waybillId },
      });

      if (!waybill || !waybill.receiverPhone) {
        this.logger.warn(`⚠️ Cannot send delivered notification`);
        return;
      }

      const message = `
✅ *Delivery Complete!*

Hi ${waybill.receiverName || 'there'},

Your parcel *${waybill.waybillNumber}* has been successfully delivered!

📍 *Delivered to:* ${waybill.destination || 'N/A'}
⏰ *Time:* ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}

${waybill.podUrl ? `📸 *Proof of Delivery:* ${waybill.podUrl}` : ''}

Thank you for choosing FlowOps! 🇿🇦
      `.trim();

      await this.whatsapp.sendMessage(waybill.receiverPhone, message, waybill.companyId);
      this.logger.log(`✅ Delivered notification sent to ${waybill.receiverPhone}`);
    } catch (error: any) {
      this.logger.error(`❌ Failed to send delivered notification: ${error.message}`);
    }
  }

  async sendCollectedNotification(waybillId: number): Promise<void> {
    try {
      const waybill = await this.prisma.waybill.findUnique({
        where: { id: waybillId },
      });

      if (!waybill || !waybill.receiverPhone) {
        this.logger.warn(`⚠️ Cannot send collected notification`);
        return;
      }

      const message = `
📦 *Parcel Collected!*

Hi ${waybill.receiverName || 'there'},

Your parcel *${waybill.waybillNumber}* has been collected.

📍 *From:* ${waybill.origin || 'N/A'}
📍 *To:* ${waybill.destination || 'N/A'}

We'll notify you when your driver is on the way!

Thank you for choosing FlowOps! 🇿🇦
      `.trim();

      await this.whatsapp.sendMessage(waybill.receiverPhone, message, waybill.companyId);
      this.logger.log(`✅ Collected notification sent to ${waybill.receiverPhone}`);
    } catch (error: any) {
      this.logger.error(`❌ Failed to send collected notification: ${error.message}`);
    }
  }

  async sendInvoiceNotification(invoiceId: string): Promise<void> {
    try {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
      });

      if (!invoice) {
        this.logger.warn(`⚠️ Invoice ${invoiceId} not found`);
        return;
      }

      const company = await this.prisma.company.findUnique({
        where: { id: invoice.companyId },
      });

      if (!company?.billingEmail) {
        this.logger.warn('⚠️ Company billing email not found');
        return;
      }

      const invoiceNumber = invoice.invoiceNumber || `INV-${invoice.id}`;
      const amount = invoice.total || 0;
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-ZA') : 'N/A';
      
      const message = `
💰 *New Invoice from FlowOps*

Hi ${company.name || 'there'},

Your invoice *${invoiceNumber}* is now available.

💵 *Amount:* R${amount.toFixed(2)}
📅 *Due Date:* ${dueDate}

📄 *View Invoice:* https://app.flowop.work/invoices/${invoice.id}

Thank you for your business! 🇿🇦
      `.trim();

      // For now, log instead of send since we need phone number
      this.logger.log(`📧 Invoice notification for ${company.billingEmail}: ${invoiceNumber}`);
    } catch (error: any) {
      this.logger.error(`❌ Failed to send invoice notification: ${error.message}`);
    }
  }

  async handleWaybillStatusChange(waybillId: number, oldStatus: string, newStatus: string): Promise<void> {
    this.logger.log(`📊 Waybill ${waybillId} status changed: ${oldStatus} → ${newStatus}`);

    try {
      if (newStatus === 'DELIVERED') {
        await this.sendDeliveredNotification(waybillId);
      } else if (newStatus === 'IN_TRANSIT') {
        await this.sendEnRouteNotification(waybillId);
      } else if (newStatus === 'COLLECTED') {
        await this.sendCollectedNotification(waybillId);
      }
    } catch (error: any) {
      this.logger.error(`❌ Failed to handle status change: ${error.message}`);
    }
  }
}
