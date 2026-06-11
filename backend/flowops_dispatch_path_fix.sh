#!/bin/bash
# FLOWOPS: FINAL PATH ALIGNMENT

# 1. Find the real RouteOptimizerService file
FULL_PATH=$(find src -name "route-optimizer.service.ts" | head -n 1)

if [ -z "$FULL_PATH" ]; then
    echo "❌ ERROR: Could not find route-optimizer.service.ts anywhere in src/"
    exit 1
fi

echo "📂 Found service at: $FULL_PATH"

# 2. Calculate the relative path from drivers-dispatch to the service
# This turns the absolute path into something like '../api/route-optimizer.service'
REL_PATH=$(python3 -c "import os; print(os.path.relpath('$FULL_PATH', 'src/drivers-dispatch'))" | sed 's/\.ts//')

echo "🔗 Calculated relative import: $REL_PATH"

# 3. Rebuild the module with the CORRECT path
cat << MOD_EOF > src/drivers-dispatch/drivers-dispatch.module.ts
import { Module } from '@nestjs/common';
import { DriversDispatchService } from './drivers-dispatch.service';
import { DriversDispatchController } from './drivers-dispatch.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RouteOptimizerService } from '$REL_PATH';

@Module({
  imports: [PrismaModule],
  controllers: [DriversDispatchController],
  providers: [
    DriversDispatchService, 
    RouteOptimizerService
  ],
  exports: [
    DriversDispatchService, 
    RouteOptimizerService 
  ]
})
export class DriversDispatchModule {}
MOD_EOF

echo "✅ DriversDispatchModule aligned with correct pathing."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
