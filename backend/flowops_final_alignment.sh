#!/bin/bash
# FLOWOPS: FINAL PRISMA ALIGNMENT

SERVICE_FILE="src/waybill-inbox/inbox/waybills-inbox.service.ts"

echo "🔗 Aligning Prisma Enums in $SERVICE_FILE..."

# 1. Add the import at the top (if not already there)
if ! grep -q "import { WaybillStatus }" "$SERVICE_FILE"; then
    sed -i "1i import { WaybillStatus } from '@prisma/client';" "$SERVICE_FILE"
fi

# 2. Replace the hardcoded string with the Enum reference
# We use the 'WaybillStatus.DELIVERED' which TypeScript recognizes
sed -i "s/status: 'COMPLETED'/status: WaybillStatus.DELIVERED/g" "$SERVICE_FILE"

echo "✅ Enum alignment complete."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
