import { Controller, Post, Body } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('webhooks/whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post()
  async handleIncoming(@Body() body: any): Promise<{ received: boolean; payload: any }> {
    // Example logic
    return this.whatsappService.handleIncomingWebhook(body);
  }
}
