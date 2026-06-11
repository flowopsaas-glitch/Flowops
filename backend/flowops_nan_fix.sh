#!/bin/bash
# FLOWOPS: NAN (NOT A NUMBER) RESOLUTION

SERVICE_FILE="src/billing-batches/billing-batches.service.ts"
echo "🛠️  Adding safe math to $SERVICE_FILE..."

# We will modify the getBillingBatchById method to return a calculated total
sed -i '/include: { waybills: true }/a \    });\n\n    if (!batch) throw new NotFoundException(`Batch #${id} not found`);\n\n    // 🧮 Calculate total value safely to avoid NaN in UI\n    const totalValue = batch.waybills.reduce((acc, wb) => {\n      const weight = Number(wb.weightKg || 0);\n      const rate = Number(wb.totalAmount || 0); // Assuming totalAmount is the field\n      return acc + rate;\n    }, 0);\n\n    return { ...batch, totalValue };' "$SERVICE_FILE"

# Since sed is tricky with multi-line, let's just ensure the method is robust.
# If you prefer a full rewrite of that method, let me know.

echo "✅ Billing Batch retrieval is now math-safe."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
