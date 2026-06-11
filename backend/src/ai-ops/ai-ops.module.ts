import { Module } from '@nestjs/common';
import { AiOpsService } from './ai-ops.service';
import { AiOpsController } from './ai-ops.controller';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AiModule, PrismaModule],
  providers: [AiOpsService],
  controllers: [AiOpsController],
  exports: [AiOpsService],
})
export class AiOpsModule {}
