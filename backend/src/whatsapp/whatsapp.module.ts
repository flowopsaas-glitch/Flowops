import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppInboxAiService } from './whatsapp-inbox-ai.service';

@Module({
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppInboxAiService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
