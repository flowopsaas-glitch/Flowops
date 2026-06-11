import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { CommunicationService } from './communication.service';

@Controller('webhooks/communications')
export class CommunicationController {
  constructor(private readonly commService: CommunicationService) {}

  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  async handleWhatsappWebhook(@Body() payload: any) {
    // Twilio sends "From" (sender) and "Body" (message)
    const sender = payload.From; 
    const message = payload.Body;

    // 1. Determine which tenant is being contacted
    const companyId = await this.commService.identifyTenant(sender);

    // 2. Log and Bill
    await this.commService.logMessage({
      companyId,
      content: message,
      source: 'WHATSAPP',
      direction: 'INBOUND',
      status: 'received',
    });

    // Return a simple XML response for Twilio if needed, or just 200 OK
    return { status: 'success', tenantRouted: companyId };
  }
}
