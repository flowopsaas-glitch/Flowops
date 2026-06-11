#!/bin/bash
# FLOWOPS: WHATSAPP DEPENDENCY BRIDGE

WHATSAPP_MOD="src/whatsapp/whatsapp.module.ts"

echo "🔗 Linking WaybillInboxModule into $WHATSAPP_MOD..."

# 1. Add the Import statement at the top
sed -i "1i import { WaybillInboxModule } from '../waybill-inbox/waybill-inbox.module';" "$WHATSAPP_MOD"

# 2. Inject WaybillInboxModule into the 'imports' array
# We find the 'imports: [' line and add it there
sed -i "/imports: \[/a \    WaybillInboxModule," "$WHATSAPP_MOD"

echo "✅ Module link established."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
