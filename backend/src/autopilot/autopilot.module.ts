import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AutopilotController } from './autopilot.controller';
import { AutopilotService } from './autopilot.service';
import { ClawLogicEngine } from '../ai/claw-logic.engine';

/**
 * CLAW Autopilot for Operations (Enterprise).
 * Reuses the same ClawLogicEngine that gates the platform's code auto-repair,
 * now pointed at live operations. BillingService is @Global (entitlement gate).
 * GatewayModule + NotificationsModule let it close the loop to drivers/staff
 * (driver chat, live dispatch board, notification bell).
 */
@Module({
  imports: [ConfigModule, ScheduleModule, PrismaModule, GatewayModule, NotificationsModule],
  controllers: [AutopilotController],
  providers: [AutopilotService, ClawLogicEngine],
})
export class AutopilotModule {}
