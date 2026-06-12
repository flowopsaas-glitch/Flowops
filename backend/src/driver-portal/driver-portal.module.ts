import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverPortalController } from './driver-portal.controller';
import { DriverPortalService } from './driver-portal.service';
import { DriverChatController } from './driver-chat.controller';
import { DriverChatService } from './driver-chat.service';

@Module({
  imports: [PrismaModule],  // ConfigModule is global so no need to import
  controllers: [DriverPortalController, DriverChatController],
  providers: [DriverPortalService, DriverChatService],
  exports: [DriverPortalService],
})
export class DriverPortalModule {}
