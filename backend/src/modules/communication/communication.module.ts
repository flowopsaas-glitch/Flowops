import { Module } from '@nestjs/common';
import { CommunicationService } from './communication.service';
import { CommunicationController } from './communication.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SmsDispatchService } from './sms-dispatch.service'; // 🚀 Added
import { SlackAlertService } from './slack-alert.service'; // 🚀 Added

@Module({
  imports: [PrismaModule],
  controllers: [CommunicationController],
  providers: [
    CommunicationService,
    SmsDispatchService, // 🚀 Registered for cellular SMS operations
    SlackAlertService,  // 🚀 Registered for DevOps channel notifications
  ],
  exports: [
    CommunicationService,
    SmsDispatchService, // 🚀 Exported for injection into WaybillsService
    SlackAlertService,  // 🚀 Exported for injection into WaybillsService
  ],
})
export class CommunicationModule {}

