#!/bin/bash
# FLOWOPS AI METHOD ALIGNMENT

echo "🔍 AUDITING AI SERVICE METHODS..."
# 1. Find the file again (just in case)
AI_FILE=$(grep -lR "export class AiService" src | head -n 1)
[ -z "$AI_FILE" ] && AI_FILE=$(grep -lR "export class IntelligenceService" src | head -n 1)

echo "✅ Target File: $AI_FILE"

# 2. Extract the actual method names available in that service
# We look for public async methods
ACTUAL_METHOD=$(grep -oP "async \K\w+(?=\()" "$AI_FILE" | grep -v "constructor" | head -n 1)

if [ -z "$ACTUAL_METHOD" ]; then
    echo "⚠️  No async methods found in $AI_FILE. Checking for standard methods..."
    ACTUAL_METHOD=$(grep -oP "\s\K\w+(?=\()" "$AI_FILE" | grep -v "constructor" | head -n 1)
fi

echo "🎯 Found actual AI method: $ACTUAL_METHOD"

# 3. Update the WaybillsInboxService to use the REAL method name
SERVICE_FILE="src/waybill-inbox/inbox/waybills-inbox.service.ts"

# Replace 'extractWaybill' with the method we actually found
sed -i "s/extractWaybill(/$ACTUAL_METHOD(/g" "$SERVICE_FILE"

echo "🚀 REBOOTING ENGINE..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
