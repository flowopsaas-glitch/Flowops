import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappWebhookController } from './whatsapp.webhook.controller';
import { WhatsappService } from './whatsapp.service';
import { AckService } from './ack.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [WhatsappService, AckService],
})
export class WhatsappModule {}
