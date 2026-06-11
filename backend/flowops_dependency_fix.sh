#!/bin/bash
# FLOWOPS: DEPENDENCY RESOLUTION FIX

MODULE_FILE="src/waybill-inbox/waybill-inbox.module.ts"

echo "🛠️  Updating $MODULE_FILE to export ExtractionService..."

cat << 'MOD_EOF' > $MODULE_FILE
import { Module } from '@nestjs/common';
import { WaybillsInboxService } from './inbox/waybills-inbox.service';
import { WaybillsInboxController } from './inbox/waybills-inbox.controller';
import { ExtractionService } from './extraction/extraction.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BroadcastModule } from '../broadcast/broadcast.module';

@Module({
  imports: [PrismaModule, BroadcastModule],
  controllers: [WaybillsInboxController],
  providers: [WaybillsInboxService, ExtractionService],
  exports: [WaybillsInboxService, ExtractionService] // 🚀 SHARED WITH WHATSAPP MODULE
})
export class WaybillInboxModule {}
MOD_EOF

echo "✅ Dependencies exported."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
