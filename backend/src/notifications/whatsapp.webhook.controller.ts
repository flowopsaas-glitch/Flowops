// src/notifications/whatsapp.webhook.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { AckService } from '../acks/ack.service';

@Controller('whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly ackService: AckService) {}

  @Post('webhook')
  async webhook(@Body() body: any) {
    // Expecting: { userId: number, collectionId: number }
    const userId = Number(body?.userId);
    const collectionId = Number(body?.collectionId);

    if (!userId || !collectionId) {
      return { ok: false, message: 'userId and collectionId required' };
    }

    const ack = await this.ackService.acknowledge(userId, collectionId);
    return { ok: true, ack };
  }
}
