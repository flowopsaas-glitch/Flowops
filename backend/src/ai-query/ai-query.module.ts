import { Module } from '@nestjs/common';
import { AiQueryService } from './ai-query.service';
import { AiQueryController } from './ai-query.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiQueryController],
  providers: [AiQueryService],
  exports: [AiQueryService],
})
export class AiQueryModule {}
