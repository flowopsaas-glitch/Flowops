import { Module } from '@nestjs/common';
import { CommercialAnalyticsController } from './commercial-analytics.controller';
import { CommercialAnalyticsService } from './commercial-analytics.service';
import { TripTruthService } from './trip-truth.service';

@Module({
  controllers: [CommercialAnalyticsController],
  providers: [CommercialAnalyticsService, TripTruthService],
  exports: [CommercialAnalyticsService],
})
export class CommercialAnalyticsModule {}
