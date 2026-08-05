import { Module } from '@nestjs/common';
import { MarketTrendsController } from './market-trends.controller';
import { MarketTrendsService } from './market-trends.service';

@Module({
  controllers: [MarketTrendsController],
  providers: [MarketTrendsService],
  exports: [MarketTrendsService],
})
export class MarketTrendsModule {}
