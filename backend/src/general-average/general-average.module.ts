import { Module } from '@nestjs/common';
import { GeneralAverageService } from './general-average.service';
import { GeneralAverageController } from './general-average.controller';

@Module({
  controllers: [GeneralAverageController],
  providers: [GeneralAverageService],
  exports: [GeneralAverageService],
})
export class GeneralAverageModule {}
