// backend/src/notifications/notifications.module.ts
import { Module } from '@nestjs/common';
import { WhatsappWebhookController } from './whatsapp.webhook.controller';
import { AckService } from '../acks/ack.service';

@Module({
  controllers: [WhatsappWebhookController],
  providers: [AckService],
})
export class NotificationsModule {}
