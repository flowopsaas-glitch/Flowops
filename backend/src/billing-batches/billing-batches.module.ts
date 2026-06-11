import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingModule } from '../pricing/pricing.module';
import { BillingBatchesService } from './billing-batches.service';
import { BillingBatchesController } from './billing-batches.controller';
import { BillingNotificationsService } from './billing-notifications.service';
import { InvoiceGeneratorService } from './invoice-generator.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PricingModule),
  ],
  providers: [
    BillingBatchesService,
    BillingNotificationsService,
    InvoiceGeneratorService,
  ],
  controllers: [BillingBatchesController],
  exports: [BillingBatchesService, BillingNotificationsService],
})
export class BillingBatchesModule {}
