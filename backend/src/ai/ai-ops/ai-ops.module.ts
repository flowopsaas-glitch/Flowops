import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiOpsController } from './ai-ops.controller';
import { AiOpsService } from './ai-ops.service';

@Module({
  imports: [PrismaModule],
  controllers: [AiOpsController],
  providers: [AiOpsService],
  exports: [AiOpsService],
})
export class AiOpsModule {}