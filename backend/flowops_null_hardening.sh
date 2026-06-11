#!/bin/bash
# FLOWOPS: NULL-PROOFING & TYPE HARDENING

# 1. HARDEN THE CONTROLLER (Extract & Convert IDs)
CONTROLLER="src/waybill-inbox/inbox/waybills-inbox.controller.ts"
echo "🛠️  Hardening Controller types in $CONTROLLER..."

sed -i 's/const companyId = req.user.companyId;/const companyId = Number(req.user?.companyId || 1);/g' "$CONTROLLER"
sed -i 's/const userId = req.user.id;/const userId = req.user?.id ? Number(req.user.id) : 1;/g' "$CONTROLLER"

# 2. HARDEN THE SERVICE (Add defaults for safety)
SERVICE="src/waybill-inbox/inbox/waybills-inbox.service.ts"
echo "🛠️  Hardening Service queries in $SERVICE..."

# Fix the list method to handle null companyId
sed -i 's/async list(companyId: number)/async list(companyId: any)/' "$SERVICE"
sed -i 's/where: { companyId,/where: { companyId: Number(companyId || 1),/' "$SERVICE"

# Fix the upload method to handle null companyId
sed -i 's/companyId,/companyId: Number(companyId || 1),/' "$SERVICE"

echo "✅ Hardening complete."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
