import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

/**
 * Asset maintenance & warranty. PrismaModule is global, so the service needs no
 * imports; the service is exported so other modules (fleet duty, claims) can
 * read a unit's history without going through HTTP.
 */
@Module({
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
