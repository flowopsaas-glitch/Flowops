import { Module } from '@nestjs/common';
import { ForecastingController } from './forecasting.controller';
import { ForecastingService } from './forecasting.service';

@Module({
  controllers: [ForecastingController],
  providers: [ForecastingService],
})
export class ForecastingModule {}
