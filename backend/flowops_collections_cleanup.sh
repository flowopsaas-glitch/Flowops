#!/bin/bash
# FLOWOPS: COLLECTIONS CLEANUP & DEPENDENCY FIX

echo "🗑️  Removing duplicate modules in src/modules/collections..."
rm -rf src/modules/collections

# Now let's fix the remaining one in src/collections/
MOD_FILE="src/collections/collections.module.ts"
echo "🛠️  Hardening $MOD_FILE..."

# 1. Add missing imports for the services the CollectionsService is begging for
# Based on your error: (PrismaService, WhatsAppService, RouteOptimizerService)
cat << MOD_EOF > $MOD_FILE
import { Module } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
// If you have a RouteOptimizerModule, import it here:
// import { RouteOptimizerModule } from '../route-optimizer/route-optimizer.module';

@Module({
  imports: [
    PrismaModule, 
    WhatsAppModule,
    // RouteOptimizerModule 
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService]
})
export class CollectionsModule {}
MOD_EOF

echo "✅ Cleanup complete. Only one CollectionsModule remains."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
