import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingBatchesModule } from '../billing-batches/billing-batches.module';
import { AutoSweepService } from './auto-sweep.service';
import { BillingAutomationService } from './billing-automation.service';
import { BillingAutomationController } from './billing-automation.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    BillingBatchesModule,
  ],
  providers: [AutoSweepService, BillingAutomationService],
  controllers: [BillingAutomationController],
  exports: [AutoSweepService, BillingAutomationService],
})
export class BillingAutomationModule {}
