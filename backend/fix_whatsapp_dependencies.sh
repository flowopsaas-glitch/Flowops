#!/bin/bash
# FLOWOPS COMMERCIAL BOOT: MODULE REPAIR
# VERSION: 7.0-FINAL

# 1. Update WhatsApp Module with the missing Storage & Inbox links
cat << 'INNER_EOF' > src/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';
import { WaybillInboxModule } from '../waybill-inbox/waybill-inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscoveryModule } from '../discovery/discovery.module'; // Adjust path if different

@Module({
  imports: [
    WaybillInboxModule, 
    PrismaModule,
    DiscoveryModule // 👈 Provides the CloudStorageService
  ],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
INNER_EOF

# 2. Ensure WaybillInboxModule is exporting BOTH required services
cat << 'INNER_EOF' > src/waybill-inbox/waybill-inbox.module.ts
import { Module } from '@nestjs/common';
import { WaybillsInboxController } from './inbox/waybills-inbox.controller';
import { WaybillsInboxService } from './inbox/waybills-inbox.service';
import { ExtractionService } from './extraction/extraction.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { RateCardsModule } from '../rate-cards/rate-cards.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';

@Module({
  imports: [PrismaModule, BroadcastModule, RateCardsModule, IntelligenceModule],
  controllers: [WaybillsInboxController],
  providers: [WaybillsInboxService, ExtractionService],
  exports: [WaybillsInboxService, ExtractionService],
})
export class WaybillInboxModule {}
INNER_EOF

echo "✅ MODULE WIRING REPAIRED"
echo "🚀 RESETTING PORTS AND REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
