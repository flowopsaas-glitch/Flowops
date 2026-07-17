import { Module } from '@nestjs/common';
import { LogisticsOpsService } from './logistics-ops.service';
import { LogisticsOpsController } from './logistics-ops.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [LogisticsOpsController],
  providers: [LogisticsOpsService],
  exports: [LogisticsOpsService],
})
export class LogisticsOpsModule {}
