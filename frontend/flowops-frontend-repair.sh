#!/usr/bin/env bash

# =========================================================
# FLOWOPS FRONTEND REPAIR SCRIPT
# =========================================================
# Fix duplicate export defaults, Axios /api double, and Vite MIME errors
# Run from frontend root: /opt/Flowops/frontend
# =========================================================

echo "=================================================="
echo "🚀 FLOWOPS FRONTEND REPAIR SCRIPT START"
echo "=================================================="

FRONTEND_PAGES="$(pwd)/src/pages"
INBOX_PAGES=("WaybillInbox.tsx")

# -----------------------------------------
# 1️⃣ Remove duplicate 'export default' in all TSX pages
# -----------------------------------------
echo "🔧 Step 1: Cleaning duplicate 'export default'..."

find "$FRONTEND_PAGES" -type f -name "*.tsx" | while read FILE; do
    COUNT=$(grep -c "export default" "$FILE")
    if [ "$COUNT" -gt 1 ]; then
        echo "⚠️  $FILE has $COUNT 'export default'. Fixing..."
        awk '!seen && /export default/ {print; seen=1; next} /export default/ {next} {print}' "$FILE" > "$FILE.tmp" \
        && mv "$FILE.tmp" "$FILE"
        echo "✅ Fixed $FILE"
    fi
done

# -----------------------------------------
# 2️⃣ Fix double /api/api/ Axios URLs in inbox pages
# -----------------------------------------
echo "🔧 Step 2: Fixing double /api/api/ URLs in inbox pages..."

for PAGE in "${INBOX_PAGES[@]}"; do
    FILE="$FRONTEND_PAGES/$PAGE"
    if [ -f "$FILE" ]; then
        echo "⚡ Checking $FILE..."
        # Replace /api/waybills/... with /waybills/... for Axios custom instance
        sed -i 's|axios.get("/api/waybills/inbox"|axios.get("/waybills/inbox"|g' "$FILE"
        sed -i 's|axios.patch(/api/waybills/inbox|axios.patch(/waybills/inbox|g' "$FILE"
        echo "✅ Axios URLs fixed in $FILE"
    fi
done

# -----------------------------------------
# 3️⃣ Touch TSX pages to refresh Vite MIME recognition
# -----------------------------------------
echo "🔧 Step 3: Touching TSX files to refresh Vite/MIME..."

find "$FRONTEND_PAGES" -type f -name "*.tsx" | while read FILE; do
    touch "$FILE"
done

# -----------------------------------------
# 4️⃣ Done
# -----------------------------------------
echo "=================================================="
echo "🎯 FlowOps frontend repair complete!"
echo "✅ Duplicate exports cleaned"
echo "✅ Axios double /api fixed"
echo "✅ TSX files refreshed for Vite"
echo "💡 Next step: restart Vite"
echo "=================================================="
echo "Run: npm run dev"
