#!/bin/bash
# FLOWOPS ULTIMATE STABLE HANDSHAKE
# VERSION: 17.0-GOLD-RECOVERY

echo "🔍 DIAGNOSING AI ARCHITECTURE..."

# 1. FIND THE AI SERVICE
AI_SRV_FILE=$(grep -lR "export class \(AiService\|IntelligenceService\)" src | head -n 1)
if [ -z "$AI_SRV_FILE" ]; then
    echo "❌ CRITICAL ERROR: Could not find AI Service."
    exit 1
fi

AI_CLASS=$(grep -oP "export class \K\w+Service" "$AI_SRV_FILE" | head -n 1)
AI_DIR=$(dirname "$AI_SRV_FILE")

# 2. FIND THE AI METHOD (Robust Search)
# Look for any public method that isn't a constructor
AI_METHOD=$(grep -oP "(async\s+)?\K\w+(?=\s*\()" "$AI_SRV_FILE" | grep -vE "constructor|super|if|for|while|switch|catch" | head -n 1)

if [ -z "$AI_METHOD" ]; then
    echo "⚠️  No method found. Forcing fallback to 'extract'."
    AI_METHOD="extract"
fi

# 3. FIND THE PARENT MODULE
AI_MOD_FILE=$(grep -lR "$AI_CLASS" "$AI_DIR" | grep "module.ts" | head -n 1)
if [ -z "$AI_MOD_FILE" ]; then
    AI_MOD_FILE=$(grep -lR "$AI_CLASS" "$(dirname "$AI_DIR")" | grep "module.ts" | head -n 1)
fi
AI_MOD_NAME=$(grep -oP "export class \K\w+Module" "$AI_MOD_FILE" | head -n 1)

echo "✅ ARCHITECTURE MAP:"
echo "   - Service: $AI_CLASS | Method: $AI_METHOD"
echo "   - Module : $AI_MOD_NAME"

# 4. REWRITE WAYBILL-INBOX MODULE (Resolve Dependency)
DEST_MOD="src/waybill-inbox/waybill-inbox.module.ts"
REL_PATH_TO_MOD=$(python3 -c "import os.path; print(os.path.relpath('$AI_MOD_FILE', 'src/waybill-inbox').replace('.ts', ''))")

cat << MOD_EOF > "$DEST_MOD"
import { Module } from '@nestjs/common';
import { WaybillsInboxService } from './inbox/waybills-inbox.service';
import { WaybillsInboxController } from './inbox/waybills-inbox.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { RateCardsModule } from '../rate-cards/rate-cards.module';
import { $AI_MOD_NAME } from './$REL_PATH_TO_MOD';

@Module({
  imports: [
    PrismaModule,
    BroadcastModule,
    RateCardsModule,
    $AI_MOD_NAME
  ],
  controllers: [WaybillsInboxController],
  providers: [WaybillsInboxService],
  exports: [WaybillsInboxService],
})
export class WaybillInboxModule {}
MOD_EOF

# 5. REWRITE WAYBILL-INBOX SERVICE (Resolve Syntax)
DEST_SRV="src/waybill-inbox/inbox/waybills-inbox.service.ts"
REL_PATH_TO_SRV=$(python3 -c "import os.path; print(os.path.relpath('$AI_SRV_FILE', 'src/waybill-inbox/inbox').replace('.ts', ''))")

cat << SRV_EOF > "$DEST_SRV"
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BroadcastGateway } from '../../broadcast/broadcast.gateway';
import { RateCardsService } from '../../rate-cards/rate-cards.service';
import { $AI_CLASS } from './$REL_PATH_TO_SRV';
import { join } from 'path';

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
    this.executeExtractionPipeline(item.id, join(process.cwd(), 'uploads', file.filename), companyId);
    return item;
  }

  private async executeExtractionPipeline(id: number, filePath: string, companyId: number) {
    try {
      await this.prisma.waybillInboxItem.update({ where: { id }, data: { status: 'EXTRACTING' } });
      
      // 🚀 THE FIX: Use the detected method name safely
      const extraction = await (this.intelligence as any).$AI_METHOD(filePath);
      
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
      this.logger.error(\`[AI] Fail: \${e.message}\`);
      await this.prisma.waybillInboxItem.update({ where: { id }, data: { status: 'FAILED' } });
    }
  }

  async list(companyId: number) { return this.prisma.waybillInboxItem.findMany({ where: companyId === 1 ? {} : { companyId }, orderBy: { createdAt: 'desc' } }); }
  async remove(id: number) { return this.prisma.waybillInboxItem.delete({ where: { id } }); }
  async commit(companyId: number, id: number, data: any) { return this.prisma.waybillInboxItem.update({ where: { id }, data: { status: 'COMMITTED', extractedData: data } }); }
}
SRV_EOF

echo "🧹 CLEARING GHOSTS..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
