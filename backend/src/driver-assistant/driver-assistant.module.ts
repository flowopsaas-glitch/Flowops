import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverAssistantController } from './driver-assistant.controller';
import { DriverAssistantService } from './driver-assistant.service';

@Module({
  imports: [PrismaModule],
  controllers: [DriverAssistantController],
  providers: [DriverAssistantService],
})
export class DriverAssistantModule {}