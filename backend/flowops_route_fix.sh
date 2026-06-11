#!/bin/bash
# FLOWOPS: ROUTE OPTIMIZER DEPENDENCY FIX

# 1. Find the RouteOptimizerModule
ROUTE_MOD_PATH=$(find src -name "route-optimizer.module.ts" | head -n 1)

if [ -z "$ROUTE_MOD_PATH" ]; then
    echo "⚠️  RouteOptimizerModule not found. Checking for 'routing' or 'dispatch' modules..."
    ROUTE_MOD_PATH=$(find src -name "*routing*.module.ts" -o -name "*dispatch*.module.ts" | head -n 1)
fi

if [ -z "$ROUTE_MOD_PATH" ]; then
    echo "❌ ERROR: Could not find the module providing RouteOptimizerService."
    exit 1
fi

echo "📂 Found Route Module at: $ROUTE_MOD_PATH"

# 2. Ensure the Route Module EXPORTS the service
# We add RouteOptimizerService to the 'exports' array if it's missing
if ! grep -q "exports:.*RouteOptimizerService" "$ROUTE_MOD_PATH"; then
    echo "📡 Exporting RouteOptimizerService..."
    sed -i "/providers: \[/a \    RouteOptimizerService," "$ROUTE_MOD_PATH"
    sed -i "/exports: \[/a \    RouteOptimizerService," "$ROUTE_MOD_PATH"
fi

# 3. Update CollectionsModule to IMPORT the Route Module
COLLECTIONS_MOD="src/collections/collections.module.ts"
ROUTE_MOD_NAME=$(basename "$ROUTE_MOD_PATH" .ts | sed 's/\.module//' | sed -r 's/(^|-)([a-z])/\U\2/g')Module
# Get relative path
REL_PATH=$(python3 -c "import os; print(os.path.relpath('$ROUTE_MOD_PATH', 'src/collections'))" | sed 's/\.ts//')

echo "🔗 Linking $ROUTE_MOD_NAME into CollectionsModule..."

# Add the import and add to 'imports' array
sed -i "1i import { $ROUTE_MOD_NAME } from '$REL_PATH';" "$COLLECTIONS_MOD"
sed -i "/imports: \[/a \    $ROUTE_MOD_NAME," "$COLLECTIONS_MOD"

echo "✅ Final bridge established."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
