import { Module } from '@nestjs/common';
import { RateShoppingController } from './rate-shopping.controller';
import { RateShoppingService } from './rate-shopping.service';

@Module({
  controllers: [RateShoppingController],
  providers: [RateShoppingService],
  exports: [RateShoppingService],
})
export class RateShoppingModule {}
