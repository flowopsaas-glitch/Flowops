import { Module } from '@nestjs/common';
import { SlaAlertsService } from './sla-alerts.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [NotificationsModule, WhatsAppModule],
  providers: [SlaAlertsService],
  exports: [SlaAlertsService],
})
export class SlaModule {}
