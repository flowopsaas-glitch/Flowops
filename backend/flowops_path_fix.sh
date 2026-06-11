#!/bin/bash
# FLOWOPS: DYNAMIC PATH RESOLUTION

# 1. Find the real file path
FULL_PATH=$(find src -name "cloud-storage.module.ts" | head -n 1)

if [ -z "$FULL_PATH" ]; then
    echo "❌ ERROR: Could not find cloud-storage.module.ts anywhere in src/"
    exit 1
fi

echo "📂 Found module at: $FULL_PATH"

# 2. Calculate the relative path from src/whatsapp/ to the module
# This turns 'src/infra/cloud-storage/cloud-storage.module.ts' 
# into '../infra/cloud-storage/cloud-storage.module'
REL_PATH=$(python3 -c "import os; print(os.path.relpath('$FULL_PATH', 'src/whatsapp'))" | sed 's/\.ts//')

echo "🔗 Calculated relative path: $REL_PATH"

# 3. Rewrite the WhatsApp Module with the correct path
cat << MOD_EOF > src/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WaybillInboxModule } from '../waybill-inbox/waybill-inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudStorageModule } from '$REL_PATH';

@Module({
  imports: [
    PrismaModule, 
    WaybillInboxModule, 
    CloudStorageModule
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService]
})
export class WhatsAppModule {}
MOD_EOF

echo "✅ WhatsAppModule updated with the correct path."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
