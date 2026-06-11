import { Module } from '@nestjs/common';
import { DriverAnalyticsController } from './driver-analytics.controller';
import { DriverAnalyticsService } from './driver-analytics.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DriverAnalyticsController],
  providers: [DriverAnalyticsService],
})
export class DriverAnalyticsModule {}
