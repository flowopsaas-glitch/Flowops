import { Controller, Post, Body } from '@nestjs/common';
import { AckService } from './ack.service';

@Controller('whatsapp')
export class WhatsappWebhookController {
  constructor(private readonly ackService: AckService) {}

  @Post('acknowledge')
  async acknowledge(@Body('collectionId') collectionId: number): Promise<{ success: boolean; collectionId: number }> {
    return this.ackService.acknowledgeCollectionByWhatsapp(collectionId);
  }
}
