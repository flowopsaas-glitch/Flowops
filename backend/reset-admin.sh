#!/bin/bash

###############################################################################
#                   FLOWOPS AUTHENTICATION RESET                             #
#                      Safe Credential Recovery                             #
###############################################################################

echo "🔐 FlowOps Authentication Reset"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from /opt/Flowops/backend"
    exit 1
fi

echo "📦 Installing dependencies if needed..."
npm install 2>/dev/null

echo ""
echo "🔄 Resetting admin credentials..."
echo ""

# Run the reset script
npx ts-node reset-admin-credentials.ts

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Next Steps:"
echo "   1. Restart your backend server (npm run start:dev)"
echo "   2. Try logging in with the credentials above"
echo "   3. The @Public() decorator fix should now allow login to work"
echo ""
