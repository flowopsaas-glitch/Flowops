#!/bin/bash
# FLOWOPS: BATCH REPRICING UTILITY

# This script pokes the PricingService to update existing waybills
# We'll use a temporary controller endpoint to trigger a batch re-price

SERVICE_FILE="src/billing-batches/billing-batches.service.ts"

# Adding the reprice logic to the service
sed -i '/async getBillingBatchById/i \  async repriceBatch(id: number) {\n    const batch = await this.getBillingBatchById(id);\n    for (const wb of batch.waybills) {\n      const newPrice = await this.pricing.calculateWaybillPrice(batch.companyId, wb.weightKg, wb.distanceKm);\n      await this.prisma.waybill.update({\n        where: { id: wb.id },\n        data: { totalAmount: newPrice }\n      });\n    }\n    return { success: true };\n  }\n' "$SERVICE_FILE"

# Adding the route to the controller
CONTROLLER_FILE="src/billing-batches/billing-batches.controller.ts"
sed -i '/@Get(":id")/i \  @Post(":id/reprice")\n  async reprice(@Param("id") id: string) {\n    return this.billingBatchesService.repriceBatch(Number(id));\n  }\n' "$CONTROLLER_FILE"

echo "✅ Repricing logic added to API."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
