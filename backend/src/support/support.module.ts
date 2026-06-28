import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CopilotModule } from '../copilot/copilot.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

/**
 * AI Support Agent (Enterprise). Reuses CopilotService for live operational
 * answers; BillingService is @Global for the aiSupportAgent entitlement gate.
 */
@Module({
  imports: [PrismaModule, CopilotModule],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
