import { Module } from '@nestjs/common';
import { LogisticsAnalyticsController } from './logistics-analytics.controller';
import { LogisticsAnalyticsService } from './logistics-analytics.service';

@Module({
  controllers: [LogisticsAnalyticsController],
  providers: [LogisticsAnalyticsService],
  exports: [LogisticsAnalyticsService],
})
export class LogisticsAnalyticsModule {}
