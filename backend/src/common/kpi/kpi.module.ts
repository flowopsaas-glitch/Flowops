import { Global, Module } from '@nestjs/common';
import { KpiConsistencyService } from './kpi-consistency.service';

/**
 * Global so every dashboard/analytics surface shares one implementation of the
 * "no data is not 0%" rule instead of re-deriving percentages locally.
 */
@Global()
@Module({
  providers: [KpiConsistencyService],
  exports: [KpiConsistencyService],
})
export class KpiModule {}
