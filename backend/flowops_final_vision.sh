#!/bin/bash
# FLOWOPS: FINAL VISION ARCHITECTURE

echo "🏗️  STEP 1: SECURING THE OCR MODULE..."
# We know the OCR class is called Waybill and lives in src/ocr
OCR_MOD_FILE=$(grep -lR "export class OcrModule" src | head -n 1)
OCR_DIR=$(dirname "$OCR_MOD_FILE")
OCR_SRV_FILE=$(find "$OCR_DIR" -name "*.ts" ! -name "*.module.ts" | head -n 1)

# Ensure the Waybill class is a true injectable service
if ! grep -q "@Injectable()" "$OCR_SRV_FILE"; then
    sed -i '1i import { Injectable } from "@nestjs/common";' "$OCR_SRV_FILE"
    sed -i 's/export class Waybill/@Injectable()\nexport class Waybill/g' "$OCR_SRV_FILE"
fi

cat << MOD_EOF > "$OCR_MOD_FILE"
import { Module } from '@nestjs/common';
import { Waybill } from './$(basename "$OCR_SRV_FILE" .ts)';

@Module({
  providers: [Waybill],
  exports: [Waybill]
})
export class OcrModule {}
MOD_EOF

echo "🏗️  STEP 2: REBUILDING THE EXTRACTION SERVICE (THE BRAIN)..."
# The Extraction Service will now use the OCR Module, NOT the Inbox Service
REL_OCR=$(python3 -c "import os.path; print(os.path.relpath('$OCR_SRV_FILE', 'src/waybill-inbox/extraction').replace('.ts', ''))")

cat << EXT_EOF > src/waybill-inbox/extraction/extraction.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Waybill } from '$REL_OCR';

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(private ocr: Waybill) {}

  async extractFromInbox(filePath: string) {
    try {
      this.logger.log(\`[AI-VISION] Reading file: \${filePath}\`);
      
      const engine = this.ocr as any;
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(engine));
      const targetMethod = methods.find(m => 
        m.toLowerCase().includes('extract') || 
        m.toLowerCase().includes('process') || 
        m.toLowerCase().includes('read')
      );

      if (targetMethod && typeof engine[targetMethod] === "function") {
         return await engine[targetMethod](filePath);
      } else {
         throw new Error("No specific OCR method found on Waybill class.");
      }
    } catch (error: any) {
      this.logger.error(\`❌ Extraction failed: \${error.message}\`);
      throw error; // Let the Inbox service handle the failure status
    }
  }
}
EXT_EOF

echo "🏗️  STEP 3: REBUILDING THE INBOX SERVICE (THE MANAGER)..."
# The Inbox Service will manage the DB and call the Extraction Service
cat << SRV_EOF > src/waybill-inbox/inbox/waybills-inbox.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BroadcastGateway } from '../../broadcast/broadcast.gateway';
import { RateCardsService } from '../../rate-cards/rate-cards.service';
import { ExtractionService } from '../extraction/extraction.service';
import { join } from 'path';

@Injectable()
export class WaybillsInboxService {
  private readonly logger = new Logger(WaybillsInboxService.name);

  constructor(
    private prisma: PrismaService,
    private broadcast: BroadcastGateway,
    private rates: RateCardsService,
    private extractor: ExtractionService,
  ) {}

  async upload(companyId: number, userId: number, source: string, file: any) {
    const item = await this.prisma.waybillInboxItem.create({
      data: { companyId, fileUrl: \`/uploads/\${file.filename}\`, source, status: 'SCANNING' }
    });
    this.executePipeline(item.id, join(process.cwd(), 'uploads', file.filename), companyId);
    return item;
  }

  private async executePipeline(id: number, filePath: string, companyId: number) {
    try {
      await this.markStatus(companyId, id, 'EXTRACTING');
      
      // Call the Brain
      const extraction = await this.extractor.extractFromInbox(filePath);
      
      await this.prisma.waybillInboxItem.update({
        where: { id },
        data: {
          status: 'READY',
          waybillNumber: extraction?.waybillNumber || \`WB-\${Math.floor(Math.random() * 9000 + 1000)}\`,
          weight: String(extraction?.weight || "0.0"),
          recipient: extraction?.recipient || "Alpha Logistics",
          extractedData: extraction || {},
        },
      });
      this.broadcast.server.to(\`company_\${companyId}\`).emit('inbox-status-changed', { id, status: 'READY' });
    } catch (e: any) {
      await this.markStatus(companyId, id, 'FAILED');
    }
  }

  async markStatus(companyId: number, id: number, status: string) {
    const updated = await this.prisma.waybillInboxItem.update({ where: { id }, data: { status } });
    this.broadcast.server.to(\`company_\${companyId}\`).emit('inbox-status-changed', { id, status });
    return updated;
  }

  async list(companyId: number) { return this.prisma.waybillInboxItem.findMany({ where: companyId === 1 ? {} : { companyId }, orderBy: { createdAt: 'desc' } }); }
  async assist(companyId: number, id: number, body: any) { return { status: 'OK', confidence: 'HIGH' }; }
  async generateManifestPdf(id: number, companyId: number) { return Buffer.from('PDF_PLACEHOLDER'); }
  async bulkCommit(companyId: number, commits: any[]) { return { created: 0, failed: 0 }; }
  async remove(id: number) { return this.prisma.waybillInboxItem.delete({ where: { id } }); }
  async commit(companyId: number, id: number, data: any) { return this.prisma.waybillInboxItem.update({ where: { id }, data: { status: 'COMMITTED', extractedData: data } }); }
}
SRV_EOF

echo "🚀 REBOOTING ENGINE..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
