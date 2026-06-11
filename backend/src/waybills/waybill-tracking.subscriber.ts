import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PublicTrackingService } from '../public-tracking/public-tracking.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

export interface WaybillCreatedEvent {
  waybillId: number;
  waybillNumber: string;
  customerPhone?: string;
  customerName?: string;
  origin?: string;
  destination?: string;
  companyId: number;
}

@Injectable()
export class WaybillTrackingSubscriber {
  private readonly logger = new Logger(WaybillTrackingSubscriber.name);

  constructor(
    private readonly trackingService: PublicTrackingService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  @OnEvent('waybill.created')
  async handleWaybillCreated(event: WaybillCreatedEvent) {
    this.logger.log(`📦 Processing waybill created event: ${event.waybillNumber}`);

    try {
      // Generate tracking token
      const { token, url } = await this.trackingService.generateToken(event.waybillId);
      this.logger.log(`✅ Generated tracking token: ${token}`);
      this.logger.log(`🔗 Tracking URL: ${url}`);

      // Send WhatsApp message if customer phone exists
      if (event.customerPhone) {
        await this.sendTrackingWhatsApp(event, url);
      } else {
        this.logger.warn(`⚠️  No customer phone for waybill ${event.waybillNumber}`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to process waybill ${event.waybillNumber}:`, error.message);
    }
  }

  private async sendTrackingWhatsApp(event: WaybillCreatedEvent, trackingUrl: string) {
    const customerName = event.customerName || 'Valued Customer';
    
    const message = `🚚 *FlowOps Tracking*

Hi ${customerName}! 👋

Your shipment *${event.waybillNumber}* has been created.

📍 *Route:* ${event.origin || 'Origin'} → ${event.destination || 'Destination'}

🔗 *Track your parcel live:*
${trackingUrl}

You'll receive updates as your parcel moves through our network.

Thank you for choosing our service! 🙏`;

    try {
      await this.whatsappService.sendMessage(event.customerPhone, message, event.companyId);
      this.logger.log(`✅ Sent tracking WhatsApp to ${event.customerPhone}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send WhatsApp to ${event.customerPhone}:`, error.message);
      // Don't throw - we don't want to break the waybill creation flow
    }
  }
}
