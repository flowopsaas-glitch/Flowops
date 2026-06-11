#!/bin/bash
# FLOWOPS: PRICING ENGINE PATH & MODULE FIX

# 1. Create the directory
mkdir -p src/pricing

# 2. Create the Pricing Service
cat << 'SVC_EOF' > src/pricing/pricing.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  constructor(private prisma: PrismaService) {}

  async calculateWaybillPrice(companyId: number, weight: number, distance: number) {
    this.logger.log(`🧮 Calculating price for ${weight}kg over ${distance}km...`);

    const rateCard = await this.prisma.rateCard.findFirst({
      where: { companyId: Number(companyId), isActive: true },
    });

    if (!rateCard) {
      this.logger.warn(`⚠️ No active Rate Card for Company #${companyId}. Defaulting to 0.`);
      return 0;
    }

    const base = Number(rateCard.baseRate || 0);
    const perKm = Number(rateCard.perKm || 0) * distance;
    const fuelSurcharge = 1 + (Number(rateCard.fuelSurcharge || 0) / 100);

    return parseFloat(((base + perKm) * fuelSurcharge).toFixed(2));
  }
}
SVC_EOF

# 3. Create the Pricing Module
cat << 'MOD_EOF' > src/pricing/pricing.module.ts
import { Module, Global } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global() // 🚀 Making it Global so you don't have to import it everywhere
@Module({
  imports: [PrismaModule],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
MOD_EOF

# 4. Fix the WaybillInboxService Import Path
# Find the actual path of the service file
TARGET_SERVICE=$(find src -name "waybills-inbox.service.ts" | head -n 1)
PRICING_SERVICE="src/pricing/pricing.service.ts"

# Calculate relative path
REL_PATH=$(python3 -c "import os; print(os.path.relpath('$PRICING_SERVICE', os.path.dirname('$TARGET_SERVICE')))" | sed 's/\.ts//')

echo "🔗 Linking PricingService to $TARGET_SERVICE using path: $REL_PATH"

# Remove any existing broken imports and add the new one
sed -i '/import { PricingService }/d' "$TARGET_SERVICE"
sed -i "1i import { PricingService } from '$REL_PATH';" "$TARGET_SERVICE"

# 5. Add PricingModule to AppModule to activate the Global status
APP_MOD="src/app.module.ts"
if ! grep -q "PricingModule" "$APP_MOD"; then
    echo "🏗️  Adding PricingModule to AppModule..."
    sed -i "1i import { PricingModule } from './pricing/pricing.module';" "$APP_MOD"
    sed -i "/imports: \[/a \    PricingModule," "$APP_MOD"
fi

echo "✅ Pricing Engine built, pathed, and globally registered."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
