import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AIEventsModule } from '../ai/ai-events/ai-events.module';
import { EmailHubController } from './email-hub.controller';
import { EmailHubService } from './email-hub.service';

@Module({
  imports: [PrismaModule, AIEventsModule],
  controllers: [EmailHubController],
  providers: [EmailHubService],
  exports: [EmailHubService],
})
export class EmailHubModule {}
