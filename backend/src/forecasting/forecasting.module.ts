import { Module } from '@nestjs/common';
import { ForecastingService } from './forecasting.service';
import { ForecastingController } from './forecasting.controller';
import { CashModule } from '../cash/cash.module';

@Module({
  imports: [CashModule],
  controllers: [ForecastingController],
  providers: [ForecastingService],
  exports: [ForecastingService], // 👈 THIS IS THE KEY
})
export class ForecastingModule {}
