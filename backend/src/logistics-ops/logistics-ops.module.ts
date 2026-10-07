import { Module } from '@nestjs/common';
import { LogisticsOpsService } from './logistics-ops.service';
import { LogisticsOpsController } from './logistics-ops.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { ComplianceModule } from '../common/compliance/compliance.module';

@Module({
  imports: [ComplianceModule,NotificationsModule],
  controllers: [LogisticsOpsController],
  providers: [LogisticsOpsService],
  exports: [LogisticsOpsService],
})
export class LogisticsOpsModule {}
