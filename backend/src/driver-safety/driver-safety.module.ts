import { Module } from '@nestjs/common';
import { DriverSafetyService } from './driver-safety.service';
import { DriverSafetyController } from './driver-safety.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [GatewayModule, EmailModule],
  controllers: [DriverSafetyController],
  providers: [DriverSafetyService],
  exports: [DriverSafetyService],
})
export class DriverSafetyModule {}
