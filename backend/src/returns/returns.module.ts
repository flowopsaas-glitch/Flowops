import { Module } from '@nestjs/common';
import { ReturnsController } from './returns.controller';
import { ReturnsPortalController } from './returns-portal.controller';
import { ReturnsService } from './returns.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ReturnsController, ReturnsPortalController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
