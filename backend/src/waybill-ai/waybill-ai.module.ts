import { Module, forwardRef } from '@nestjs/common';
import { WaybillAiService } from './waybill-ai.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingAutomationModule } from '../billing-automation/billing-automation.module';

@Module({
  imports: [PrismaModule, forwardRef(() => BillingAutomationModule)],
  providers: [WaybillAiService],
  exports: [WaybillAiService]
})
export class WaybillAiModule {}
