import { Module } from '@nestjs/common';
import { ComplianceModule } from '../common/compliance/compliance.module';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [ComplianceModule, GatewayModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
})
export class ShipmentsModule {}
