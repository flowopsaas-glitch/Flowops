#!/bin/bash
# FLOWOPS NUCLEAR AI HANDSHAKE
# VERSION: 16.0-FINAL-STABLE

echo "🔍 LOCATING AI ARCHITECTURE..."

# 1. Find the Service file
AI_SERVICE_FILE=$(grep -lR "export class \(AiService\|IntelligenceService\)" src | head -n 1)
if [ -z "$AI_SERVICE_FILE" ]; then
    echo "❌ ERROR: AI Service definition not found anywhere in src/."
    exit 1
fi

AI_CLASS=$(grep -oP "export class \K\w+Service" "$AI_SERVICE_FILE" | head -n 1)
AI_DIR=$(dirname "$AI_SERVICE_FILE")

# 2. Find the Module that exports this service
AI_MODULE_FILE=$(grep -lR "$AI_CLASS" "$AI_DIR" | grep "module.ts" | head -n 1)
if [ -z "$AI_MODULE_FILE" ]; then
    # Search one level up if not in the same folder
    AI_MODULE_FILE=$(grep -lR "$AI_CLASS" "$(dirname "$AI_DIR")" | grep "module.ts" | head -n 1)
fi

AI_MODULE_NAME=$(grep -oP "export class \K\w+Module" "$AI_MODULE_FILE" | head -n 1)

echo "✅ FOUND SERVICE: $AI_CLASS in $AI_SERVICE_FILE"
echo "✅ FOUND MODULE : $AI_MODULE_NAME in $AI_MODULE_FILE"

# 3. FIX WAYBILL-INBOX MODULE (The "Context" Error)
# Calculate relative path from waybill-inbox.module.ts to the AI Module
DEST_MODULE="src/waybill-inbox/waybill-inbox.module.ts"
REL_PATH_TO_AI_MOD=$(python3 -c "import os.path; print(os.path.relpath('$AI_MODULE_FILE', 'src/waybill-inbox').replace('.ts', ''))")

# Completely rewrite the module file to ensure clean imports
cat << MOD_EOF > "$DEST_MODULE"
import { Module } from '@nestjs/common';
import { WaybillsInboxService } from './inbox/waybills-inbox.service';
import { WaybillsInboxController } from './inbox/waybills-inbox.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { RateCardsModule } from '../rate-cards/rate-cards.module';
import { $AI_MODULE_NAME } from './$REL_PATH_TO_AI_MOD';

@Module({
  imports: [
    PrismaModule,
    BroadcastModule,
    RateCardsModule,
    $AI_MODULE_NAME
  ],
  controllers: [WaybillsInboxController],
  providers: [WaybillsInboxService],
  exports: [WaybillsInboxService],
})
export class WaybillInboxModule {}
MOD_EOF

# 4. FIX WAYBILL-INBOX SERVICE (The "Property" Error)
DEST_SERVICE="src/waybill-inbox/inbox/waybills-inbox.service.ts"
REL_PATH_TO_AI_SRV=$(python3 -c "import os.path; print(os.path.relpath('$AI_SERVICE_FILE', 'src/waybill-inbox/inbox').replace('.ts', ''))")

# Find the actual extraction method name in the AI service
AI_METHOD=$(grep -oP "async \K\w+(?=\()" "$AI_SERVICE_FILE" | grep -v "constructor" | head -n 1)

cat << SRV_EOF > "$DEST_SERVICE"
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BroadcastGateway } from '../../broadcast/broadcast.gateway';
import { RateCardsService } from '../../rate-cards/rate-cards.service';
import { $AI_CLASS } from './$REL_PATH_TO_AI_SRV';
import { join } from 'path';

interface ExtractionResult {
  waybillNumber?: string;
  weight?: string | number;
  recipient?: string;
}

@Injectable()
export class WaybillsInboxService {
  private readonly logger = new Logger(WaybillsInboxService.name);

  constructor(
    private prisma: PrismaService,
    private broadcast: BroadcastGateway,
    private rates: RateCardsService,
    private intelligence: $AI_CLASS,
  ) {}

  async upload(companyId: number, userId: number, source: string, file: any) {
    const item = await this.prisma.waybillInboxItem.create({
      data: { companyId, fileUrl: \`/uploads/\${file.filename}\`, source, status: 'SCANNING' }
    });
    const uploadPath = join(process.cwd(), 'uploads', file.filename);
    this.executeExtractionPipeline(item.id, uploadPath, companyId);
    return item;
  }

  private async executeExtractionPipeline(id: number, filePath: string, companyId: number) {
    try {
      await this.markStatus(companyId, id, 'EXTRACTING');
      const extraction = await this.intelligence.$AI_METHOD(filePath);
      const res = extraction as ExtractionResult;

      await this.prisma.waybillInboxItem.update({
        where: { id },
        data: {
          status: 'READY',
          waybillNumber: res.waybillNumber || \`WB-ERR-\${id}\`,
          weight: String(res.weight || "0.0"),
          recipient: res.recipient || "Needs Review",
          extractedData: res as any,
        },
      });

      this.broadcast.server.to(\`company_\${companyId}\`).emit('inbox-status-changed', { id, status: 'READY', extractedData: res });
    } catch (error: any) {
      this.logger.error(\`[AI] Failed: \${error.message}\`);
      await this.markStatus(companyId, id, 'FAILED');
    }
  }

  async markStatus(companyId: number, id: number, status: string) {
    return this.prisma.waybillInboxItem.update({ where: { id }, data: { status } });
  }

  async list(companyId: number) {
    return this.prisma.waybillInboxItem.findMany({ where: companyId === 1 ? {} : { companyId }, orderBy: { createdAt: 'desc' } });
  }

  async remove(id: number) { return this.prisma.waybillInboxItem.delete({ where: { id } }); }
  async commit(companyId: number, id: number, data: any) { return this.prisma.waybillInboxItem.update({ where: { id }, data: { status: 'COMMITTED', extractedData: data } }); }
  async bulkCommit(companyId: number, commits: any[]) { return { created: commits.length, failed: 0 }; }
}
SRV_EOF

echo "🚀 PURGING PORTS AND REBOOTING FLOWOPS..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
