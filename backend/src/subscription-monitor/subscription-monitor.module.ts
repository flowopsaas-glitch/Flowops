// src/subscription-monitor/subscription-monitor.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionMonitorService } from './subscription-monitor.service';
import { SubscriptionMonitorController } from './subscription-monitor.controller';

@Module({
  imports: [PrismaModule],
  providers: [SubscriptionMonitorService],
  controllers: [SubscriptionMonitorController],
  exports: [SubscriptionMonitorService],
})
export class SubscriptionMonitorModule {}
