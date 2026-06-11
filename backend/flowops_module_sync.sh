#!/bin/bash
# FLOWOPS: MODULE REGISTRATION FIX

APP_MODULE="src/app.module.ts"

echo "jointing Billing Modules into $APP_MODULE..."

# 1. Add the missing imports at the top
# We assume the standard structure based on your previous greps
sed -i "1i import { BillingModule } from './billing/billing.module';" "$APP_MODULE"
sed -i "1i import { BillingBatchesModule } from './billing-batches/billing-batches.module';" "$APP_MODULE"

# 2. Inject the modules into the 'imports' array
# We look for 'imports: [' and add them right after
sed -i "/imports: \[/a \    BillingModule,\n    BillingBatchesModule," "$APP_MODULE"

echo "✅ Modules registered."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
