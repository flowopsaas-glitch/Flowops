#!/bin/bash
# FLOWOPS: COMMERCIAL HARDENING (UPLOAD & SWEEP FIXES)

# 1. FIX THE UPLOAD LOGIC (Object vs String)
SERVICE_INBOX="src/waybill-inbox/inbox/waybills-inbox.service.ts"
echo "🛠️  Fixing Upload logic in $SERVICE_INBOX..."

# We modify the upload method to extract the filename if an object is passed
sed -i 's/fileUrl: string/fileUrl: any/g' "$SERVICE_INBOX"
cat << 'UPLOAD_EOF' > upload_fix.ts
  async upload(companyId: number, userId: number, source: string, file: any) {
    // If Multer passes an object, we extract the path. If it's already a string, we use it.
    const path = typeof file === 'string' ? file : `/uploads/${file.filename}`;
    
    return this.prisma.waybillInboxItem.create({
      data: {
        companyId,
        fileUrl: path,
        status: 'SCANNING',
        extractedData: { source, userId }
      },
    });
  }
UPLOAD_EOF
# Replace lines 21-31 (the upload function) with the fix
sed -i '21,31d' "$SERVICE_INBOX"
sed -i '20r upload_fix.ts' "$SERVICE_INBOX"
rm upload_fix.ts

# 2. FIX THE SWEEP LOGIC (String vs Enum)
SERVICE_BILLING="src/billing-batches/billing-batches.service.ts"
echo "🛠️  Fixing Sweep Enum logic in $SERVICE_BILLING..."

# Add the Enum import at the top
sed -i "1i import { WaybillStatus } from '@prisma/client';" "$SERVICE_BILLING"

# Replace raw strings with Enum references in the findMany query
sed -i 's/"REGISTERED"/WaybillStatus.REGISTERED/g' "$SERVICE_BILLING"
sed -i 's/"DISPATCHED"/WaybillStatus.IN_TRANSIT/g' "$SERVICE_BILLING"
sed -i 's/"DELIVERED"/WaybillStatus.DELIVERED/g' "$SERVICE_BILLING"

echo "✅ Hardening complete."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
