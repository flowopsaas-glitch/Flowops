#!/usr/bin/env bash

# ==============================================
# FLOWOPS FRONTEND DUPLICATE EXPORT DEFAULT FIX
# ==============================================
# Usage: run from frontend root (e.g., /opt/Flowops/frontend)
# Removes duplicate 'export default' lines in all TSX files in src/pages
# ==============================================

FRONTEND_PAGES="$(pwd)/src/pages"

echo "=================================================="
echo "🔧 FLOWOPS: Removing duplicate 'export default'..."
echo "=================================================="

# Find all TSX files in src/pages
find "$FRONTEND_PAGES" -type f -name "*.tsx" | while read FILE; do
    # Count how many 'export default' lines exist
    COUNT=$(grep -c "export default" "$FILE")
    if [ "$COUNT" -gt 1 ]; then
        echo "⚠️  $FILE has $COUNT 'export default' lines. Fixing..."
        # Keep only the first 'export default', delete subsequent ones
        awk '!seen && /export default/ {print; seen=1; next} /export default/ {next} {print}' "$FILE" > "$FILE.tmp" \
        && mv "$FILE.tmp" "$FILE"
        echo "✅ Fixed $FILE"
    fi
done

echo "=================================================="
echo "🎯 Duplicate export default cleanup completed!"
echo "Restart Vite: npm run dev"
echo "=================================================="
