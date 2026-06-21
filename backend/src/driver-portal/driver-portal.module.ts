import { Module } from '@nestjs/common';
import { DriverPortalController } from './driver-portal.controller';
import { DriverPortalService } from './driver-portal.service';

@Module({
  controllers: [DriverPortalController],
  providers: [DriverPortalService],
})
export class DriverPortalModule {}
