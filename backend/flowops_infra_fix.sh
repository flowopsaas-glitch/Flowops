#!/bin/bash
# FLOWOPS INFRASTRUCTURE HARDENING
# VERSION: 21.0-STABLE-CORE

echo "🏗️  STEP 1: CREATING SHARED INFRASTRUCTURE MODULE..."
# This module will act as the global provider for Storage and Database
mkdir -p src/infra
cat << MOD_EOF > src/infra/infra.module.ts
import { Module, Global } from '@nestjs/common';
import { CloudStorageService } from '../services/cloud-storage.service';
import { PrismaService } from '../prisma/prisma.service';

@Global()
@Module({
  providers: [CloudStorageService, PrismaService],
  exports: [CloudStorageService, PrismaService],
})
export class InfraModule {}
MOD_EOF

echo "🏗️  STEP 2: UPDATING WHATSAPP MODULE..."
# Ensure WhatsAppModule is clean and relies on the global InfraModule
cat << WHATS_EOF > src/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';
import { WaybillInboxModule } from '../waybill-inbox/waybill-inbox.module';
import { DiscoveryModule } from '@nestjs/core';

@Module({
  imports: [
    WaybillInboxModule,
    DiscoveryModule
  ],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
MOD_EOF

echo "🏗️  STEP 3: CLEANING APP MODULE..."
# Register InfraModule at the root so CloudStorageService is available everywhere
# We use sed to inject InfraModule into imports and remove the raw provider
sed -i "s/import { PrismaModule }/import { InfraModule } from '.\/infra\/infra.module';\nimport { PrismaModule }/g" src/app.module.ts
sed -i "s/PrismaModule,/InfraModule, PrismaModule,/g" src/app.module.ts
sed -i "/CloudStorageService,/d" src/app.module.ts

echo "🚀 PURGING PORTS AND REBOOTING ENGINE..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
