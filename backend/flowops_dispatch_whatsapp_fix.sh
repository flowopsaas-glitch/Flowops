#!/bin/bash
# FLOWOPS: DISPATCH-WHATSAPP DEPENDENCY LINK

# 1. Re-calculate paths to ensure accuracy
ROUTE_PATH=$(find src -name "route-optimizer.service.ts" | head -n 1)
WHATS_PATH=$(find src -name "whatsapp.module.ts" | head -n 1)
DISPATCH_MOD="src/drivers-dispatch/drivers-dispatch.module.ts"

REL_ROUTE=$(python3 -c "import os; print(os.path.relpath('$ROUTE_PATH', 'src/drivers-dispatch'))" | sed 's/\.ts//')
REL_WHATS=$(python3 -c "import os; print(os.path.relpath('$WHATS_PATH', 'src/drivers-dispatch'))" | sed 's/\.ts//')

echo "🔗 Linking WhatsApp and Route Optimizer..."

# 2. Overwrite with the clean, triple-verified module
cat << MOD_EOF > "$DISPATCH_MOD"
import { Module } from '@nestjs/common';
import { DriversDispatchService } from './drivers-dispatch.service';
import { DriversDispatchController } from './drivers-dispatch.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '$REL_WHATS';
import { RouteOptimizerService } from '$REL_ROUTE';

@Module({
  imports: [
    PrismaModule, 
    WhatsAppModule // 🚀 The missing link for WhatsAppService
  ],
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

echo "✅ Dispatch-WhatsApp bridge established."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
