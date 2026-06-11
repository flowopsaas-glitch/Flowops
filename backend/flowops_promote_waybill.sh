#!/bin/bash
# FLOWOPS: PROMOTION BRIDGE (INBOX -> BILLING)

echo "🏗️  UPGRADING COMMIT LOGIC IN WAYBILLS-INBOX SERVICE..."

# Use sed to replace the old one-liner with a full transactional function
# We are targeting the 'async commit' line specifically
cat << 'FUNC_EOF' > new_commit_function.ts
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

      // 2. Create the ACTUAL Waybill for the Billing Engine
      // We map your AI fields to the main operational table
      await tx.waybill.create({
        data: {
          companyId,
          waybillNumber: data.waybillNumber || `WB-GEN-${id}`,
          weight: parseFloat(data.weight) || 0,
          consignee: data.recipient || 'Unknown Recipient',
          consignor: data.sender || 'Unknown Sender',
          status: 'COMPLETED', // Set to COMPLETED so the Sweep engine picks it up
          totalAmount: 0,      // Ready for the Rate Card engine to price it
          // Store the original scan URL as the proof of delivery
          proofOfDelivery: inboxItem.fileUrl, 
        }
      });

      return inboxItem;
    });
  }
FUNC_EOF

# Replace the specific line (Line 42) with our new multi-line function
sed -i '42r new_commit_function.ts' src/waybill-inbox/inbox/waybills-inbox.service.ts
sed -i '42d' src/waybill-inbox/inbox/waybills-inbox.service.ts
rm new_commit_function.ts

echo "✅ Promotion bridge installed."
echo "🚀 REBOOTING ENGINE..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
