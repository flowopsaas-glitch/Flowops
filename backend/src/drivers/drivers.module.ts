import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { LeaderboardService } from './leaderboard.service';
import { FleetMaintenanceModule } from '../fleet-maintenance/fleet-maintenance.module';

@Module({
  imports: [FleetMaintenanceModule],
  controllers: [DriversController],
  providers: [DriversService, LeaderboardService],
  exports: [DriversService, LeaderboardService],
})
export class DriversModule {}
