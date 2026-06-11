#!/bin/bash
# FLOWOPS: FULL CIRCUIT ELECTRIFICATION

# 1. FIX THE MODULE (The Wiring)
MODULE_FILE="src/waybill-inbox/waybill-inbox.module.ts"
echo "🔌 Wiring ExtractionService into $MODULE_FILE..."

cat << 'MOD_EOF' > $MODULE_FILE
import { Module } from '@nestjs/common';
import { WaybillsInboxService } from './inbox/waybills-inbox.service';
import { WaybillsInboxController } from './inbox/waybills-inbox.controller';
import { ExtractionService } from './extraction/extraction.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BroadcastModule } from '../broadcast/broadcast.module';

@Module({
  imports: [PrismaModule, BroadcastModule],
  controllers: [WaybillsInboxController],
  providers: [WaybillsInboxService, ExtractionService],
  exports: [WaybillsInboxService]
})
export class WaybillInboxModule {}
MOD_EOF

# 2. FIX THE CONTROLLER (The Trigger)
CONTROLLER_FILE="src/waybill-inbox/inbox/waybills-inbox.controller.ts"
echo "🚀 Installing Trigger in $CONTROLLER_FILE..."

cat << 'CTRL_EOF' > $CONTROLLER_FILE
import { 
  Controller, Get, Post, Body, Param, Delete, 
  UseInterceptors, UploadedFile, Req, UseGuards, Res 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WaybillsInboxService } from './waybills-inbox.service';
import { ExtractionService } from '../extraction/extraction.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('waybills/inbox')
@UseGuards(JwtAuthGuard)
export class WaybillsInboxController {
  constructor(
    private readonly inbox: WaybillsInboxService,
    private readonly extraction: ExtractionService 
  ) {}

  @Get()
  async list(@Req() req: any) {
    return this.inbox.list(req.user.companyId);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `scan-${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
  }))
  async upload(@UploadedFile() file: any, @Req() req: any) {
    const companyId = req.user.companyId;
    const userId = req.user.id;

    // 1. Create the database record
    const result = await this.inbox.upload(companyId, userId, 'UPLOAD', file);

    // 🚀 2. FIRE THE AI PIPELINE
    console.log(`[TRIGGER] Poking AI for record #${result.id}...`);
    this.extraction.extractFromInbox(companyId, result.id).catch(err => {
      console.error("[AI-ERROR]", err.message);
    });

    return result;
  }

  @Post(':id/commit')
  async commit(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.inbox.commit(req.user.companyId, +id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.inbox.remove(+id);
  }

  @Post(':id/assist')
  async assist(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.inbox.assist(req.user.companyId, +id, body);
  }

  @Get(':id/manifest-pdf')
  async getPdf(@Param('id') id: string, @Req() req: any, @Res() res: any) {
    const buffer = await this.inbox.generateManifestPdf(+id, req.user.companyId);
    res.set({ 'Content-Type': 'application/pdf' });
    return res.send(buffer);
  }
}
CTRL_EOF

echo "✅ Circuit Electrified."
echo "🚀 REBOOTING..."
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
