import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { FleetIntelligenceService } from './fleet-intelligence.service';
import { FleetIntelligenceController } from './fleet-intelligence.controller';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  controllers: [FleetIntelligenceController],
  providers: [FleetIntelligenceService],
  exports: [FleetIntelligenceService],
})
export class FleetIntelligenceModule {}
