#!/bin/bash
# FLOWOPS: FINAL PRISMA SCHEMA ALIGNMENT

SERVICE_FILE="src/waybill-inbox/inbox/waybills-inbox.service.ts"

echo "⚖️ Aligning weight field in $SERVICE_FILE..."

# Replace 'weight:' with 'weightKg:' specifically in the Waybill creation block
sed -i "s/weight: parseFloat/weightKg: parseFloat/g" "$SERVICE_FILE"

echo "✅ Field mapping fixed."
echo "🚀 REBOOTING FOR THE LAST TIME..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
