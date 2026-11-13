import { Module } from '@nestjs/common';
import { CommercialAnalyticsController } from './commercial-analytics.controller';
import { CommercialAnalyticsService } from './commercial-analytics.service';
import { TripTruthService } from './trip-truth.service';
import { LaneProfitabilityService } from './lane-profitability.service';
import { ClientProfitabilityService } from './client-profitability.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CommercialAnalyticsController],
  providers: [
    CommercialAnalyticsService,
    TripTruthService,
    LaneProfitabilityService,
    ClientProfitabilityService,
  ],
  exports: [CommercialAnalyticsService, LaneProfitabilityService, ClientProfitabilityService],
})
export class CommercialAnalyticsModule {}
