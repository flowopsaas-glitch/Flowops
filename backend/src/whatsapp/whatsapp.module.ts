import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppDriverService } from './whatsapp-driver.service';
import { WhatsAppAutomationService } from './whatsapp-automation.service';
import { WhatsAppEventsService } from './whatsapp-events.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService, 
    WhatsAppDriverService, 
    WhatsAppAutomationService,
    WhatsAppEventsService,
  ],
  exports: [
    WhatsAppService, 
    WhatsAppDriverService, 
    WhatsAppAutomationService,
    WhatsAppEventsService,
  ],
})
export class WhatsAppModule {}
