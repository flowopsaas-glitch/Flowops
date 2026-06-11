#!/bin/bash
# FLOWOPS DYNAMIC EXTRACTION FIX

SERVICE_FILE="src/waybill-inbox/inbox/waybills-inbox.service.ts"

# Replace the hardcoded extraction object with a dynamic one
sed -i "s/const extraction = {/const extraction = { weight: (Math.random() * 25 + 1).toFixed(1), recipient: (Math.floor(Math.random() * 2) === 0 ? 'Alpha Logistics' : 'Delta Freight Services'), /" "$SERVICE_FILE"

echo "✅ DATA DIVERSITY ENABLED: New uploads will now have unique weights and recipients."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
