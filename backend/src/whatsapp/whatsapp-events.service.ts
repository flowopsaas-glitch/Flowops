// src/whatsapp/whatsapp-events.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppAutomationService } from './whatsapp-automation.service';

@Injectable()
export class WhatsAppEventsService {
  private readonly logger = new Logger(WhatsAppEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: WhatsAppAutomationService,
  ) {}

  async onWaybillStatusUpdate(waybillId: number, oldStatus: string, newStatus: string): Promise<void> {
    this.logger.log(`📊 Triggering WhatsApp automation for waybill ${waybillId}: ${oldStatus} → ${newStatus}`);
    
    try {
      await this.automation.handleWaybillStatusChange(waybillId, oldStatus, newStatus);
    } catch (error: any) {
      this.logger.error(`❌ WhatsApp automation failed: ${error.message}`);
    }
  }

  async onInvoiceCreated(invoiceId: string): Promise<void> {
    this.logger.log(`💰 Triggering invoice notification for invoice ${invoiceId}`);
    
    try {
      await this.automation.sendInvoiceNotification(invoiceId);
    } catch (error: any) {
      this.logger.error(`❌ Invoice notification failed: ${error.message}`);
    }
  }
}
