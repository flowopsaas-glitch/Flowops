import { Module } from '@nestjs/common';
import { CodService } from './cod.service';
import { CodController } from './cod.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [NotificationsModule, GatewayModule],
  controllers: [CodController],
  providers: [CodService],
  exports: [CodService],
})
export class CodModule {}
