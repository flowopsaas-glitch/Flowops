import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebhookController } from './whatsapp.webhook.controller';

@Module({
  providers: [WhatsappService],
  controllers: [WhatsappWebhookController],
  exports: [WhatsappService],
})
export class WhatsappModule {}