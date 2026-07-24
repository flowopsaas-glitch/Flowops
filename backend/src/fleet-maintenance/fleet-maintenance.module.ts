import { Module } from '@nestjs/common';
import { FleetMaintenanceService } from './fleet-maintenance.service';
import { FleetMaintenanceController } from './fleet-maintenance.controller';

@Module({
  controllers: [FleetMaintenanceController],
  providers: [FleetMaintenanceService],
  exports: [FleetMaintenanceService],
})
export class FleetMaintenanceModule {}
