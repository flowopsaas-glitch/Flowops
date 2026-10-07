import { Global, Module } from '@nestjs/common';
import { DriverComplianceService } from './driver-compliance.service';

/**
 * Global so every feature module (dispatch, waybills, routing, logistics-ops,
 * driver-portal) resolves the SAME policy instance without each module having
 * to re-import it — the previous "central" guard was never wired anywhere,
 * which is exactly how three code paths ended up with three rule sets.
 */
@Global()
@Module({
  providers: [DriverComplianceService],
  exports: [DriverComplianceService],
})
export class ComplianceModule {}
