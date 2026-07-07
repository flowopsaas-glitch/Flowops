import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { LeaderboardService } from './leaderboard.service';

@Module({
  controllers: [DriversController],
  providers: [DriversService, LeaderboardService],
  exports: [DriversService, LeaderboardService],
})
export class DriversModule {}
