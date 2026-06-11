import { Module } from '@nestjs/common';
import { GpsTrackingController } from './gps-tracking.controller';
import { GpsTrackingService } from './gps-tracking.service';
import { LocationGateway } from '../location.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GpsTrackingController],
  providers: [GpsTrackingService, LocationGateway],
  exports: [GpsTrackingService],
})
export class GpsTrackingModule {}
