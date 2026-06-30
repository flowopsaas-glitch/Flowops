import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { FeatureGuard } from './feature.guard';

/**
 * Global so any service (waybills, drivers, users…) can inject BillingService
 * to enforce plan limits, and any controller can @UseGuards(FeatureGuard)
 * with @RequireFeature() — without importing this module everywhere.
 */
@Global()
@Module({
  controllers: [BillingController],
  providers: [BillingService, FeatureGuard],
  exports: [BillingService, FeatureGuard],
})
export class BillingModule {}
