import { Module } from '@nestjs/common';
import { TripCostsController } from './trip-costs.controller';
import { TripCostsService } from './trip-costs.service';

@Module({
  controllers: [TripCostsController],
  providers: [TripCostsService],
  exports: [TripCostsService],
})
export class TripCostsModule {}
