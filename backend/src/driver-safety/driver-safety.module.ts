import { Module } from '@nestjs/common';
import { DriverSafetyService } from './driver-safety.service';
import { DriverSafetyController } from './driver-safety.controller';
import { BorderDwellService } from './border-dwell.service';
import { BorderDwellController } from './border-dwell.controller';
import { TripLegService } from './trip-leg.service';
import { TripLegController } from './trip-leg.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [GatewayModule, EmailModule],
  controllers: [DriverSafetyController, BorderDwellController, TripLegController],
  providers: [DriverSafetyService, BorderDwellService, TripLegService],
  exports: [DriverSafetyService, BorderDwellService, TripLegService],
})
export class DriverSafetyModule {}
