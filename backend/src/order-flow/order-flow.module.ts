import { Module } from '@nestjs/common';
import { OrderFlowController } from './order-flow.controller';
import { OrderFlowService } from './order-flow.service';
// OrderFlowService now delegates auto-dispatch to the real dispatcher instead
// of running a vestigial copy that logged assignments it never made.
// DispatchModule does not import OrderFlowModule, so this is not circular.
import { DispatchModule } from '../dispatch/dispatch.module';

@Module({
  imports: [DispatchModule],
  controllers: [OrderFlowController],
  providers: [OrderFlowService],
  exports: [OrderFlowService],
})
export class OrderFlowModule {}
