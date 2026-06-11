import { Injectable, Logger } from '@nestjs/common';

interface CollectionAckEvent {
  collectionId: string;
  driverName: string;
  driverPhone: string;
}

@Injectable()
export class OpsNotificationService {
  private readonly logger = new Logger('OpsNotification');

  async collectionAcknowledged(event: CollectionAckEvent) {
    /**
     * 🔮 Future hooks:
     * - WebSocket emit
     * - WhatsApp to ops
     * - Email // Slack
     * - Admin dashboard refresh
     */

    this.logger.log(
      `🔔 COLLECTION ACKED | id=${event.collectionId} | driver=${event.driverName} (${event.driverPhone})`,
    );
  }
}
