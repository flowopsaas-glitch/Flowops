import { Module } from '@nestjs/common';
import { DriverSafetyService } from './driver-safety.service';
import { DriverSafetyController } from './driver-safety.controller';
import { BorderDwellService } from './border-dwell.service';
import { BorderDwellController } from './border-dwell.controller';
import { TripLegService } from './trip-leg.service';
import { TripLegController } from './trip-leg.controller';
import { TripDocumentPackService } from './trip-document-pack.service';
import { TripDocumentPackController } from './trip-document-pack.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [GatewayModule, EmailModule],
  controllers: [
    DriverSafetyController,
    BorderDwellController,
    TripLegController,
    TripDocumentPackController,
  ],
  providers: [
    DriverSafetyService,
    BorderDwellService,
    TripLegService,
    TripDocumentPackService,
  ],
  exports: [
    DriverSafetyService,
    BorderDwellService,
    TripLegService,
    TripDocumentPackService,
  ],
})
export class DriverSafetyModule {}
