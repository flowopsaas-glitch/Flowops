import { Module } from '@nestjs/common';
import { SlaLeaderboardService } from './sla-leaderboard.service';
import { SlaLeaderboardController } from './sla-leaderboard.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SlaLeaderboardController],
  providers: [SlaLeaderboardService],
})
export class LeaderboardModule {}
