#!/bin/bash
# FLOWOPS MASTER LAUNCH
# VERSION: 12.0-ULTIMATE-RESET

echo "################################################################################"
echo "#                     FLOWOPS COMMAND CENTER: TOTAL RESET                      #"
echo "################################################################################"

echo "🧹 PURGING GHOST PROCESSES..."
# Kill API (3000) and Frontend (5174)
sudo fuser -k 3000/tcp 5174/tcp 2>/dev/null
pkill -f vite 2>/dev/null
pkill -f nest 2>/dev/null

echo "🔗 REWIRING WHATSAPP MODULE..."
cat << INNER_EOF > src/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';
import { WaybillInboxModule } from '../waybill-inbox/waybill-inbox.module';
import { WaybillsModule } from '../waybills/waybills.module'; 
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    WaybillInboxModule, 
    PrismaModule,
    WaybillsModule 
  ],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
INNER_EOF

echo "🏗️  CLEANING & BUILDING FLOWOPS..."
rm -rf dist
npm run build

echo "🚀 IGNITING COMMERCIAL ENGINE..."
echo "--------------------------------------------------------------------------------"
npm run start:dev
