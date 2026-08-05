import { Module } from '@nestjs/common';
import { SmartRoutingController } from './smart-routing.controller';
import { SmartRoutingService } from './smart-routing.service';

@Module({
  controllers: [SmartRoutingController],
  providers: [SmartRoutingService],
  exports: [SmartRoutingService],
})
export class SmartRoutingModule {}
