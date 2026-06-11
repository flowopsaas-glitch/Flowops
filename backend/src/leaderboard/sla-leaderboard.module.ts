import { Module } from '@nestjs/common';
import { SlaLeaderboardService } from './sla-leaderboard.service';
import { SlaLeaderboardController } from './sla-leaderboard.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [SlaLeaderboardController],
  providers: [SlaLeaderboardService, PrismaService],
})
export class SlaLeaderboardModule {}