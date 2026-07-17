import { Module } from '@nestjs/common';
import { DriverSafetyService } from './driver-safety.service';
import { DriverSafetyController } from './driver-safety.controller';

@Module({
  controllers: [DriverSafetyController],
  providers: [DriverSafetyService],
  exports: [DriverSafetyService],
})
export class DriverSafetyModule {}
