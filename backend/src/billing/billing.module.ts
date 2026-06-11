import { Module, forwardRef } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { InvoicesController } from './invoices.controller'; 
import { WaybillInboxModule } from '../waybills/inbox/waybill-inbox.module';
import { CollectionsModule } from '../collections/collections.module';
import { RateCardsModule } from '../rate-cards/rate-cards.module';
import { QuotesModule } from '../quotes/quotes.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BullModule } from '@nestjs/bullmq'; // 🚀 Added: Pulls the structural BullMQ provider context setup
import { BillingBatchWorker } from './billing-batch.worker'; // 🚀 Added: Connects the worker sitting in this directory

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => WaybillInboxModule),
    forwardRef(() => CollectionsModule),
    forwardRef(() => RateCardsModule),
    forwardRef(() => QuotesModule),
    MailModule,
    // 🚀 Register the active billing queue channel instance to enable event stream interception
    BullModule.registerQueue({
      name: 'billing-automation-queue',
    }),
  ],
  providers: [
    BillingService,
    BillingBatchWorker, // 🚀 Registered: Activates your background batch invoice processor!
  ],
  controllers: [
    BillingController, 
    InvoicesController 
  ],
  exports: [
    BillingService,
    BullModule, // Exported safely to keep dependencies happy across domains
  ],
})
export class BillingModule {}

