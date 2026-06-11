#!/usr/bin/env bash

echo "=================================================="
echo "🚀 FLOWOPS FRONTEND CLEANUP & REPAIR"
echo "=================================================="

FRONTEND_DIR="$(pwd)/src"

# -----------------------------------------
# 1️⃣ Remove duplicate 'export default' in all TSX files
# -----------------------------------------
echo "🔧 Step 1: Removing duplicate 'export default'..."

find "$FRONTEND_DIR" -type f -name "*.tsx" | while read FILE; do
    COUNT=$(grep -c "export default" "$FILE")
    if [ "$COUNT" -gt 1 ]; then
        echo "⚠️  $FILE has $COUNT 'export default'. Fixing..."
        awk '!seen && /export default/ {print; seen=1; next} /export default/ {next} {print}' "$FILE" > "$FILE.tmp" \
        && mv "$FILE.tmp" "$FILE"
        echo "✅ Fixed $FILE"
    fi
done

# -----------------------------------------
# 2️⃣ Touch all TSX files to refresh Vite
# -----------------------------------------
echo "🔧 Step 2: Touching TSX files to refresh Vite cache..."

find "$FRONTEND_DIR" -type f -name "*.tsx" | while read FILE; do
    touch "$FILE"
done

# -----------------------------------------
# 3️⃣ Clear Vite cache (optional but helps)
# -----------------------------------------
echo "🔧 Step 3: Clearing Vite cache..."
rm -rf node_modules/.vite
echo "✅ Vite cache cleared"

# -----------------------------------------
# 4️⃣ Fix double /api/api/ Axios URLs in inbox pages
# -----------------------------------------
echo "🔧 Step 4: Fixing Axios double /api URLs..."
INBOX_PAGES=("pages/WaybillInbox.tsx")

for PAGE in "${INBOX_PAGES[@]}"; do
    FILE="$FRONTEND_DIR/$PAGE"
    if [ -f "$FILE" ]; then
        sed -i 's|axios.get("/api/waybills/inbox"|axios.get("/waybills/inbox"|g' "$FILE"
        sed -i 's|axios.patch(/api/waybills/inbox|axios.patch(/waybills/inbox|g' "$FILE"
        echo "✅ Axios URLs fixed in $FILE"
    fi
done

# -----------------------------------------
# 5️⃣ Done
# -----------------------------------------
echo "=================================================="
echo "🎯 Frontend repair complete!"
echo "✅ Duplicate exports removed"
echo "✅ TSX files refreshed for Vite"
echo "✅ Axios /api URLs fixed"
echo "💡 Next step: restart Vite with 'npm run dev'"
echo "=================================================="
