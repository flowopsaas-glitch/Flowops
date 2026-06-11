#!/bin/bash
# FLOWOPS STABLE BOOT SCRIPT
# VERSION: 22.0-FINAL-STABLE

echo "🏗️  1. BUILDING GLOBAL INFRASTRUCTURE..."
mkdir -p src/infra
cat << 'INNER_EOF' > src/infra/infra.module.ts
import { Module, Global } from '@nestjs/common';
import { CloudStorageService } from '../services/cloud-storage.service';
import { PrismaService } from '../prisma/prisma.service';

@Global()
@Module({
  providers: [CloudStorageService, PrismaService],
  exports: [CloudStorageService, PrismaService],
})
export class InfraModule {}
INNER_EOF

echo "🏗️  2. HARDENING WHATSAPP MODULE..."
cat << 'INNER_EOF' > src/whatsapp/whatsapp.module.ts
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
INNER_EOF

echo "🏗️  3. REWIRING APP MODULE (THE ROOT)..."
# We are going to replace the App Module with a clean, global-ready version
cat << 'INNER_EOF' > src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

// Core Modules
import { InfraModule } from './infra/infra.module';
import { AuthModule } from './auth/auth.module';
import { WaybillInboxModule } from './waybill-inbox/waybill-inbox.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { CompaniesModule } from './companies/companies.module';
import { UsersModule } from './users/users.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    // 📂 Static Serving
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    
    // ⚙️ Config & Security
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),

    // 🏗️ Global Infra (Prisma + Storage)
    InfraModule,

    // 🚀 Feature Modules
    AuthModule,
    WaybillInboxModule,
    WhatsAppModule,
    CompaniesModule,
    UsersModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
INNER_EOF

echo "🚀 PURGING PORTS AND REBOOTING FLOWOPS..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
