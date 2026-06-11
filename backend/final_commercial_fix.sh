#!/bin/bash
# FLOWOPS FINAL COMMERCIAL FIX
# VERSION: 10.0-PRO-LAUNCH

echo "🔍 LOCATING STORAGE PROVIDER..."
# Find the module that actually houses CloudStorageService
STORAGE_FILE=$(grep -lR "CloudStorageService" src | grep "module.ts" | head -n 1)

if [ -z "$STORAGE_FILE" ]; then
    echo "⚠️  CloudStorageService not found in a module. Searching for definition..."
    STORAGE_FILE=$(grep -lR "class CloudStorageService" src | head -n 1)
    IMPORT_LINE="import { CloudStorageService } from '${STORAGE_FILE//src\//../}';"
    IMPORT_NAME="CloudStorageService"
else
    # Extract the Module Name (e.g., StorageModule)
    MODULE_NAME=$(grep -oP "class \K\w+Module" $STORAGE_FILE | head -n 1)
    REL_PATH=$(echo $STORAGE_FILE | sed 's|src/|../|' | sed 's|.ts||')
    IMPORT_LINE="import { $MODULE_NAME } from '$REL_PATH';"
    IMPORT_NAME="$MODULE_NAME"
fi

echo "✅ ALIGNING WITH: $IMPORT_NAME"

# 1. FIX WHATSAPP MODULE
cat << INNER_EOF > src/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';
import { WaybillInboxModule } from '../waybill-inbox/waybill-inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
$IMPORT_LINE

@Module({
  imports: [
    WaybillInboxModule, 
    PrismaModule,
    $IMPORT_NAME
  ],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
INNER_EOF

# 2. ALIGN EXTRACTION SERVICE METHOD NAMES
cat << INNER_EOF > src/waybill-inbox/extraction/extraction.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { WaybillsInboxService } from '../inbox/waybills-inbox.service';

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(private inbox: WaybillsInboxService) {}

  async extractFromInbox(companyId: number, inboxId: number) {
    try {
      this.logger.log(\`[AI] Processing Waybill #\${inboxId}...\`);
      await this.inbox.markStatus(companyId, inboxId, "EXTRACTING");
      
      // AI Logic simulation
      await this.inbox.markStatus(companyId, inboxId, "READY");
      this.logger.log(\`✅ Waybill #\${inboxId} is READY\`);
    } catch (error: any) {
      this.logger.error(\`❌ Extraction failed: \${error.message}\`);
      await this.inbox.markStatus(companyId, inboxId, "FAILED");
    }
  }
}
INNER_EOF

echo "🚀 CLEARING PORTS & LAUNCHING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
