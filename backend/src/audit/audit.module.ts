import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditTrailService } from './audit-trail.service';
import { AuditService } from './audit.service';

/**
 * Two things live under `audit/`:
 *
 *  - `AuditService` — the pre-existing WRITER for platform-level privileged
 *    actions (tenant approve/suspend, impersonation). Write-only until now.
 *  - `AuditTrailService` + `AuditController` — the tenant-facing READER over the
 *    append-only event tables, which is what the UI was calling but never found.
 *
 * `@Global()` must stay: a dozen services across ai, alerting, dispatch,
 * driver-portal, epod and driver-safety inject `AuditService` without importing
 * this module. Removing it compiles cleanly and fails at runtime with a DI
 * error — the worst possible place to find out. PrismaModule is already global.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditTrailService, AuditService],
  exports: [AuditService, AuditTrailService],
})
export class AuditModule {}
