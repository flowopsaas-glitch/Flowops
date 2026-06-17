import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Global so any module (owner actions, alerting, future tenant-side events)
 * can inject AuditService without re-importing. PrismaModule is already global.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
