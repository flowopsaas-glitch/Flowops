import { Global, Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { OutboxService } from './outbox.service';

/**
 * Global so any module (e.g. notifications, rail) can dispatch events without
 * creating a circular import.
 */
@Global()
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, OutboxService],
  exports: [WebhooksService, OutboxService],
})
export class WebhooksModule {}
