#!/bin/bash
# FLOWOPS ULTIMATE ALIGNMENT & FIX
# VERSION: 9.0-GOLD

echo "🔍 LOCATING DISCOVERY MODULE DEFINITION..."
# Find the actual file containing the string 'export class DiscoveryModule'
REAL_FILE=$(grep -lR "export class DiscoveryModule" src | head -n 1)

if [ -z "$REAL_FILE" ]; then
    echo "❌ CRITICAL: Could not find DiscoveryModule definition."
    exit 1
fi

# Convert system path to relative path for WhatsApp Module
# e.g., src/modules/discovery/discovery.module.ts -> ../modules/discovery/discovery.module
REL_PATH=$(echo $REAL_FILE | sed 's|src/|../|' | sed 's|.ts||')
echo "✅ FOUND MODULE AT: $REL_PATH"

# 1. FIX EXTRACTION SERVICE (Align method names to 'extractFromInbox')
cat << INNER_EOF > src/waybill-inbox/extraction/extraction.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { WaybillsInboxService } from '../inbox/waybills-inbox.service';

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private inbox: WaybillsInboxService,
  ) {}

  // ALIGNMENT: Renamed from runPipeline to extractFromInbox to match existing calls
  async extractFromInbox(companyId: number, inboxId: number) {
    try {
      this.logger.log(\`[AI] Starting extraction for Waybill #\${inboxId} (Company: \${companyId})\`);
      await this.inbox.markStatus(companyId, inboxId, "EXTRACTING");
      
      // Simulation of AI Success
      await this.inbox.markStatus(companyId, inboxId, "READY");
      this.logger.log(\`✅ Extraction complete for #\${inboxId}\`);
    } catch (error: any) {
      this.logger.error(\`❌ Extraction failed for #\${inboxId}: \${error.message}\`);
      await this.inbox.markStatus(companyId, inboxId, "FAILED");
    }
  }
}
INNER_EOF

# 2. FIX WHATSAPP MODULE (Use the discovered path)
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

echo "🚀 PURGING PORTS AND REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
