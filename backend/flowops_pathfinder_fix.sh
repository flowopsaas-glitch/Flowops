#!/bin/bash
# FLOWOPS AI MODULE PATHFINDER
# VERSION: 20.0-STABLE-ANCHOR

echo "🔍 LOCATING AI MODULE DEFINITION..."

# 1. Find the Module that contains our AI Service
# We search for any module file that mentions the Intelligence/Ai Service
AI_MOD_FILE=$(grep -lRE "AiService|IntelligenceService" src | grep "module.ts" | head -n 1)

if [ -z "$AI_MOD_FILE" ]; then
    echo "❌ ERROR: AI Module definition not found."
    exit 1
fi

AI_MOD_CLASS=$(grep -oP "export class \K\w+Module" "$AI_MOD_FILE" | head -n 1)
echo "✅ FOUND: $AI_MOD_CLASS in $AI_MOD_FILE"

# 2. Calculate the relative path from WaybillInboxModule to the AI Module
# Target: src/waybill-inbox/waybill-inbox.module.ts
DEST_MOD="src/waybill-inbox/waybill-inbox.module.ts"
REL_PATH=$(python3 -c "import os.path; print(os.path.relpath('$AI_MOD_FILE', 'src/waybill-inbox').replace('.ts', ''))")

echo "🔗 CALCULATED PATH: $REL_PATH"

# 3. REWRITE THE MODULE WITH DYNAMIC PATHS
cat << MOD_EOF > "$DEST_MOD"
import { Module } from '@nestjs/common';
import { WaybillsInboxService } from './inbox/waybills-inbox.service';
import { WaybillsInboxController } from './inbox/waybills-inbox.controller';
import { ExtractionService } from './extraction/extraction.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { RateCardsModule } from '../rate-cards/rate-cards.module';
import { $AI_MOD_CLASS } from './$REL_PATH';

@Module({
  imports: [
    PrismaModule,
    BroadcastModule,
    RateCardsModule,
    $AI_MOD_CLASS
  ],
  controllers: [WaybillsInboxController],
  providers: [WaybillsInboxService, ExtractionService],
  exports: [WaybillsInboxService, ExtractionService],
})
export class WaybillInboxModule {}
MOD_EOF

echo "🚀 REBOOTING ENGINE..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
