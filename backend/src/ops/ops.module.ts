import { Module } from '@nestjs/common';
import { OpsNotificationService } from './ops-notification.service';

@Module({
  providers: [OpsNotificationService],
  exports: [OpsNotificationService],
})
export class OpsModule {}
