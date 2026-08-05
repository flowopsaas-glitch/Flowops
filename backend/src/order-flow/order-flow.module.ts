import { Module } from '@nestjs/common';
import { OrderFlowController } from './order-flow.controller';
import { OrderFlowService } from './order-flow.service';

@Module({
  controllers: [OrderFlowController],
  providers: [OrderFlowService],
  exports: [OrderFlowService],
})
export class OrderFlowModule {}
