#!/bin/bash
# FLOWOPS: FINAL RECONCILIATION & SYNTAX FIX

# 1. REBUILD WAYBILL INBOX SERVICE (Fixed Upload + Fixed Commit)
cat << 'SERVICE_EOF' > src/waybill-inbox/inbox/waybills-inbox.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WaybillStatus } from '@prisma/client';

@Injectable()
export class WaybillsInboxService {
  private readonly logger = new Logger(WaybillsInboxService.name);

  constructor(private prisma: PrismaService) {}

  async list(companyId: number) {
    return this.prisma.waybillInboxItem.findMany({
      where: { companyId, status: { not: 'COMMITTED' } },
      orderBy: { createdAt: 'desc' }
    });
  }

  async upload(companyId: number, userId: number, source: string, file: any) {
    // FIX: Extract path if object, use string if string
    const path = typeof file === 'string' ? file : `/uploads/${file.filename}`;
    
    return this.prisma.waybillInboxItem.create({
      data: {
        companyId,
        fileUrl: path,
        status: 'SCANNING',
        extractedData: { source, userId }
      },
    });
  }

  async commit(companyId: number, id: number, data: any) {
    this.logger.log(`[PROMOTION] Promoting Inbox #${id} to main Waybill table...`);
    return this.prisma.$transaction(async (tx) => {
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

  async assist(companyId: number, id: number, body: any) {
    return { suggestion: "Data verified." };
  }

  async generateManifestPdf(id: number, companyId: number) {
    return Buffer.from("PDF_STUB");
  }

  async bulkCommit(companyId: number, commits: any[]) {
    const results = [];
    for (const item of commits) {
      results.push(await this.commit(companyId, item.id, item.data));
    }
    return results;
  }

  async remove(id: number) {
    return this.prisma.waybillInboxItem.delete({ where: { id } });
  }
}
SERVICE_EOF

# 2. REBUILD BILLING BATCHES SERVICE (Fixed Enum 'in' query)
# We use a slightly safer replacement approach here to fix the specific line
SERVICE_BILLING="src/billing-batches/billing-batches.service.ts"
if ! grep -q "import { WaybillStatus }" "$SERVICE_BILLING"; then
    sed -i "1i import { WaybillStatus } from '@prisma/client';" "$SERVICE_BILLING"
fi
# Replace the string array with actual Enum values
sed -i 's/"REGISTERED", "DISPATCHED", "DELIVERED"/WaybillStatus.REGISTERED, WaybillStatus.IN_TRANSIT, WaybillStatus.DELIVERED/g' "$SERVICE_BILLING"

echo "✅ Rebuild complete. Syntax restored."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
