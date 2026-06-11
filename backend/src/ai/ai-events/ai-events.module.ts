import { Module } from '@nestjs/common';
import { AiEventsService } from './ai-events.service';
import { AiEventsController } from './ai-events.controller';
import { DriversModule } from '../../drivers/drivers.module'; 

@Module({
  imports: [DriversModule],
  controllers: [AiEventsController],
  providers: [AiEventsService],
  exports: [AiEventsService], // 🚀 CRITICAL for cross-service action
})
export class AIEventsModule {}
