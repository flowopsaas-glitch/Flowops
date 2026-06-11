#!/bin/bash
# FLOWOPS: RESTORING EVICTED MODULES

echo "🔧 RECONNECTING WAYBILLS MODULE..."
APP_FILE="src/app.module.ts"

# 1. Inject the import statement at the top if it's missing
if ! grep -q "import { WaybillsModule }" "$APP_FILE"; then
    sed -i "1i import { WaybillsModule } from './waybills/waybills.module';" "$APP_FILE"
fi

# 2. Inject it into the imports array right after WaybillInboxModule
if ! grep -q "WaybillsModule," "$APP_FILE"; then
    sed -i "s/WaybillInboxModule,/WaybillInboxModule,\n    WaybillsModule,/g" "$APP_FILE"
fi

echo "🚀 RESTARTING ENGINE..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
