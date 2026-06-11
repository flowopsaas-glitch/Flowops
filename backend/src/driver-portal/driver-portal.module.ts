import { Module } from '@nestjs/common';
import { DriverPortalController } from './driver-portal.controller';
import { DriverChatController } from './driver-chat.controller';
import { DriverPortalService } from './driver-portal.service';
import { DriverChatService } from './driver-chat.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DriverPortalController, DriverChatController],
  providers: [DriverPortalService, DriverChatService],
  exports: [DriverPortalService],
})
export class DriverPortalModule {}
