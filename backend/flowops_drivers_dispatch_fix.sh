#!/bin/bash
# FLOWOPS: DRIVERS DISPATCH MODULE RESTORATION

# 1. Find the real RouteOptimizerService file
SERVICE_PATH=$(find src -name "route-optimizer.service.ts" | head -n 1)

if [ -z "$SERVICE_PATH" ]; then
    echo "❌ ERROR: Could not find route-optimizer.service.ts"
    exit 1
fi

echo "📂 Found Service at: $SERVICE_PATH"

# 2. Rebuild the module from scratch (Clean Slate)
cat << MOD_EOF > src/drivers-dispatch/drivers-dispatch.module.ts
import { Module } from '@nestjs/common';
import { DriversDispatchService } from './drivers-dispatch.service';
import { DriversDispatchController } from './drivers-dispatch.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RouteOptimizerService } from './route-optimizer.service';

@Module({
  imports: [PrismaModule],
  controllers: [DriversDispatchController],
  providers: [
    DriversDispatchService, 
    RouteOptimizerService
  ],
  exports: [
    DriversDispatchService, 
    RouteOptimizerService // 🚀 Exported for the CollectionsModule
  ]
})
export class DriversDispatchModule {}
MOD_EOF

echo "✅ DriversDispatchModule restored and type-safe."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
