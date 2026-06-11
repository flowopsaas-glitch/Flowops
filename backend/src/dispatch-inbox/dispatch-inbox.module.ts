import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { BillingBatchesModule } from '../billing-batches/billing-batches.module';
import { DispatchInboxService } from './dispatch-inbox.service';
import { DispatchInboxController } from './dispatch-inbox.controller';

@Module({
  imports: [AiModule, 
    PrismaModule, 
    WhatsAppModule,
    forwardRef(() => BillingBatchesModule),
  ],
  providers: [DispatchInboxService],
  controllers: [DispatchInboxController],
  exports: [DispatchInboxService],
})
export class DispatchInboxModule {}
