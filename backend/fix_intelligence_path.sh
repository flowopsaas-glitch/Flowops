#!/bin/bash
# FLOWOPS INTELLIGENCE PATHFINDER

echo "🔍 LOCATING AI SERVICE DEFINITION..."
# Find the file that defines the AiService or IntelligenceService class
REAL_FILE=$(grep -lR "export class \(AiService\|IntelligenceService\)" src | head -n 1)

if [ -z "$REAL_FILE" ]; then
    echo "❌ ERROR: Could not find any AI Service class. Checking folder list..."
    ls -R src | grep -iE "ai|intel"
    exit 1
fi

# Calculate relative path from src/waybill-inbox/inbox to the found file
# File is usually in src/intelligence or src/ai
REL_PATH=$(echo $REAL_FILE | sed 's|src/|../../|' | sed 's|.ts||')
CLASS_NAME=$(grep -oP "export class \K\w+Service" $REAL_FILE | head -n 1)

echo "✅ FOUND $CLASS_NAME AT: $REL_PATH"

# Apply the fix to the WaybillsInboxService
SERVICE_FILE="src/waybill-inbox/inbox/waybills-inbox.service.ts"
sed -i "s|import { .* } from '../../intelligence/intelligence.service';|import { $CLASS_NAME as AiService } from '$REL_PATH';|g" "$SERVICE_FILE"

echo "🚀 REBOOTING HARDENED ENGINE..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
