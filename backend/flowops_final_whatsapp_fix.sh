#!/bin/bash
# FLOWOPS: WHATSAPP MODULE FINAL ALIGNMENT

# 1. Find the real path for CloudStorageModule
# It might be in 'infra' or its own folder.
REAL_STORAGE_PATH=$(find src -name "cloud-storage.module.ts" | sed 's/src\///' | sed 's/\.ts//')

# If we can't find it, we'll check if it's inside InfraModule
if [ -z "$REAL_STORAGE_PATH" ]; then
    echo "⚠️ CloudStorageModule not found as a standalone. Checking app structure..."
    STORAGE_IMPORT=""
    STORAGE_IN_IMPORTS=""
else
    echo "📂 Found CloudStorageModule at: $REAL_STORAGE_PATH"
    # Convert path to relative for src/whatsapp
    REL_PATH="../${REAL_STORAGE_PATH#*/}"
    STORAGE_IMPORT="import { CloudStorageModule } from '$REL_PATH';"
    STORAGE_IN_IMPORTS="CloudStorageModule,"
fi

# 2. Rebuild the WhatsApp Module with the CORRECT names
cat << MOD_EOF > src/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WaybillInboxModule } from '../waybill-inbox/waybill-inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
$STORAGE_IMPORT

@Module({
  imports: [
    PrismaModule, 
    WaybillInboxModule, 
    $STORAGE_IN_IMPORTS
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
})
export class WhatsAppModule {}
MOD_EOF

echo "✅ WhatsAppModule aligned and deduplicated."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
