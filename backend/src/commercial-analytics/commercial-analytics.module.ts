import { Module } from '@nestjs/common';
import { CommercialAnalyticsController } from './commercial-analytics.controller';
import { CommercialAnalyticsService } from './commercial-analytics.service';

@Module({
  controllers: [CommercialAnalyticsController],
  providers: [CommercialAnalyticsService],
  exports: [CommercialAnalyticsService],
})
export class CommercialAnalyticsModule {}
