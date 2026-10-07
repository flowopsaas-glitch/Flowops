import { Global, Module } from '@nestjs/common';
import { DriverComplianceService } from './driver-compliance.service';
import { DriverComplianceController } from './driver-compliance.controller';
import { AuditModule } from '../../audit/audit.module';

/**
 * Global so every feature module (dispatch, waybills, routing, logistics-ops,
 * driver-portal, collections, shipments) resolves the SAME policy instance
 * without each module having to re-import it — the previous "central" guard was
 * never wired anywhere, which is exactly how three code paths ended up with
 * three rule sets.
 *
 * The controller lives here too: the fleet compliance report and the evidence
 * endpoint are the policy's read/write surface, and keeping them beside the
 * policy means a rule can never exist without a way to see and fix its data.
 */
@Global()
@Module({
  imports: [AuditModule],
  controllers: [DriverComplianceController],
  providers: [DriverComplianceService],
  exports: [DriverComplianceService],
})
export class ComplianceModule {}
