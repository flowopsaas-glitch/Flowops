import { Global, Module } from '@nestjs/common';
import { AlertingService } from './alerting.service';

// Global so OwnerController (and future consumers) can inject AlertingService.
// Prisma/Email/Audit are already global.
@Global()
@Module({
  providers: [AlertingService],
  exports: [AlertingService],
})
export class AlertingModule {}
