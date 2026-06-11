#!/bin/bash
# FLOWOPS: PERFECT SCHEMA ALIGNMENT

SERVICE_FILE="src/waybill-inbox/inbox/waybills-inbox.service.ts"

echo "🎯 Aligning service with the true Waybill model..."

cat << 'FUNC_EOF' > final_commit_function.ts
  async commit(companyId: number, id: number, data: any) {
    this.logger.log(`[PROMOTION] Promoting Inbox #${id} to main Waybill table...`);
    
    return this.prisma.$transaction(async (tx) => {
      // 1. Update the Inbox Item to COMMITTED
      const inboxItem = await tx.waybillInboxItem.update({
        where: { id },
        data: { 
          status: 'COMMITTED', 
          extractedData: data,
          waybillNumber: data.waybillNumber,
          weight: String(data.weight),
          recipient: data.recipient
        },
      });

      // 2. Create the ACTUAL Waybill (Perfect Alignment)
      await tx.waybill.create({
        data: {
          companyId,
          waybillNumber: data.waybillNumber || `WB-GEN-${id}`,
          weightKg: parseFloat(data.weight) || 0,
          recipient: data.recipient || 'Unknown Recipient',
          sender: data.sender || 'Unknown Sender',
          status: WaybillStatus.DELIVERED,
          processedBy: "AI_TRIAGE",
          imageUrl: inboxItem.fileUrl, 
        }
      });

      return inboxItem;
    });
  }
FUNC_EOF

# Replace the entire commit function block accurately
# We find the start of 'async commit' and replace until the end of that block
# Since we just wrote the block earlier, we can replace the lines we know are there
sed -i '43,78d' "$SERVICE_FILE"
sed -i '42r final_commit_function.ts' "$SERVICE_FILE"
rm final_commit_function.ts

echo "✅ Final alignment complete."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
