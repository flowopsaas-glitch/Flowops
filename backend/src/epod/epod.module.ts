import { Module } from '@nestjs/common';
import { EpodController } from './epod.controller';
import { EpodService } from './epod.service';

@Module({
  controllers: [EpodController],
  providers: [EpodService],
  exports: [EpodService],
})
export class EpodModule {}
