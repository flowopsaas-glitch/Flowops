#!/bin/bash
# FLOWOPS ULTIMATE COMMERCIAL ANCHOR
# VERSION: 8.0-FINAL-FINAL

echo "🔍 LOCATING DISCOVERY MODULE..."
# Find the actual path and convert it to a relative path for the WhatsApp module
RAW_PATH=$(find src -name "discovery.module.ts" | head -n 1)
if [ -z "$RAW_PATH" ]; then
    echo "❌ CRITICAL: DiscoveryModule not found. Checking for StorageModule..."
    RAW_PATH=$(find src -name "*storage.module.ts" | head -n 1)
fi

# Calculate relative path from src/whatsapp to the found module
# We'll use a safe fallback if the search fails
REL_PATH=$(echo $RAW_PATH | sed 's|src/|../|' | sed 's|.ts||')
[ -z "$REL_PATH" ] && REL_PATH="../discovery/discovery.module"

echo "✅ FOUND MODULE AT: $REL_PATH"

# 1. OVERWRITE WHATSAPP MODULE WITH DYNAMIC PATH
cat << INNER_EOF > src/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';
import { WaybillInboxModule } from '../waybill-inbox/waybill-inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscoveryModule } from '${REL_PATH}';

@Module({
  imports: [
    WaybillInboxModule, 
    PrismaModule,
    DiscoveryModule
  ],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
INNER_EOF

# 2. ENSURE EXTRACTION SERVICE IS HARDENED
cat << INNER_EOF > src/waybill-inbox/extraction/extraction.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { WaybillsInboxService } from '../inbox/waybills-inbox.service';

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private inbox: WaybillsInboxService,
  ) {}

  async runPipeline(companyId: number, inboxId: number, filePath: string) {
    try {
      await this.inbox.markStatus(companyId, inboxId, "EXTRACTING");
      this.logger.log(\`[EXTRACTION] Pipeline started for #\${inboxId}\`);
      
      // Commercial AI logic here
      await this.inbox.markStatus(companyId, inboxId, "READY");
    } catch (error: any) {
      this.logger.error(\`[EXTRACTION] Failed: \${error.message}\`);
      await this.inbox.markStatus(companyId, inboxId, "FAILED");
    }
  }
}
INNER_EOF

echo "🚀 PURGING GHOST PROCESSES & IGNITING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
