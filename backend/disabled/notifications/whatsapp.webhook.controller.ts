import { Controller, Post, Body } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post()
  handleWebhook(@Body() body: any) {
    // Handle incoming WhatsApp webhook payload
    // Example: process delivery status, incoming messages, etc.
    console.log('Received WhatsApp webhook:', body);
    return { status: 'received' };
  }
}