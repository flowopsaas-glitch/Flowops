import { Module } from '@nestjs/common';
import { ComplianceModule } from '../common/compliance/compliance.module';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [NotificationsModule, PushModule, ComplianceModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
