import { Module } from '@nestjs/common';
import { AiClawController } from './ai-claw.controller';
import { AiClawService } from './ai-claw.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [AiClawController],
  providers: [AiClawService],
  exports: [AiClawService],
})
export class AiClawModule {}
