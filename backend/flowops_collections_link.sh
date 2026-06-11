#!/bin/bash
# FLOWOPS: COLLECTIONS DEPENDENCY BRIDGE

# 1. Update WhatsAppModule to EXPORT the service
WHATSAPP_MOD="src/whatsapp/whatsapp.module.ts"
echo "📡 Making WhatsAppService public in $WHATSAPP_MOD..."

# We replace the @Module block to include exports
cat << MOD_EOF > $WHATSAPP_MOD
import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WaybillInboxModule } from '../waybill-inbox/waybill-inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudStorageModule } from '../cloud-storage/cloud-storage.module';

@Module({
  imports: [
    PrismaModule, 
    WaybillInboxModule, 
    CloudStorageModule
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService] // 🚀 Allow others to use this service
})
export class WhatsAppModule {}
MOD_EOF

# 2. Update CollectionsModule to IMPORT WhatsAppModule
# We find the file first to be safe
COLLECTIONS_MOD=$(find src -name "collections.module.ts" | head -n 1)

if [ -n "$COLLECTIONS_MOD" ]; then
    echo "🔗 Linking WhatsAppModule into $COLLECTIONS_MOD..."
    
    # Add the import at the top
    sed -i "1i import { WhatsAppModule } from '../whatsapp/whatsapp.module';" "$COLLECTIONS_MOD"
    
    # Add WhatsAppModule to the imports array
    sed -i "/imports: \[/a \    WhatsAppModule," "$COLLECTIONS_MOD"
else
    echo "⚠️ Could not find collections.module.ts automatically."
fi

echo "✅ Chain link complete."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
