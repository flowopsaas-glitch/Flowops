import { Module } from '@nestjs/common';
import { RateCardsController } from './rate-cards.controller';
import { RateCardsService } from './rate-cards.service';

@Module({
  controllers: [RateCardsController],
  providers: [RateCardsService],
  exports: [RateCardsService],
})
export class RateCardsModule {}
