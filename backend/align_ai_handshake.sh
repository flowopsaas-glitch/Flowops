#!/bin/bash
# FLOWOPS AI HANDSHAKE ALIGNMENT

echo "🔍 AUDITING AI SERVICE INTERFACE..."
# 1. Find the file defining the AiService
AI_FILE=$(grep -lR "export class AiService" src | head -n 1)
if [ -z "$AI_FILE" ]; then
    echo "❌ ERROR: AI Service file not found."
    exit 1
fi

# 2. Find the primary method name (usually the first async method that isn't the constructor)
# We look for something like 'async process(...)' or 'async analyze(...)'
ACTUAL_METHOD=$(grep -oP "async \K\w+(?=\()" "$AI_FILE" | grep -v "constructor" | head -n 1)

if [ -z "$ACTUAL_METHOD" ]; then
    echo "⚠️  No async methods found. Checking for standard methods..."
    ACTUAL_METHOD=$(grep -oP "\s\K\w+(?=\()" "$AI_FILE" | grep -v "constructor" | head -n 1)
fi

echo "🎯 FOUND ACTUAL METHOD: $ACTUAL_METHOD"

# 3. Update the WaybillsInboxService to use the REAL method name
SERVICE_FILE="src/waybill-inbox/inbox/waybills-inbox.service.ts"
sed -i "s/extractWaybill(/$ACTUAL_METHOD(/g" "$SERVICE_FILE"

echo "🚀 REBOOTING ENGINE..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
