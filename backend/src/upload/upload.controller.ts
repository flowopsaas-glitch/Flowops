import { Controller, Post, UploadedFile, UseInterceptors, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WaybillAiService } from '../waybill-ai/waybill-ai.service';

@Controller('upload')
export class UploadController {
  constructor(
    @InjectQueue('waybill-queue') private waybillQueue: Queue,
    private waybillAiService: WaybillAiService,
  ) {}

  @Post('file')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + extname(file.originalname));
      }
    }),
    fileFilter: (req, file, cb) => {
      // Accept images and PDFs (waybill documents)
      if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(null, true); // Still accept other files, just don't process them
      }
    }
  }))
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Body() body: any) {
    const fileUrl = `/uploads/${file.filename}`;
    const filePath = `./uploads/${file.filename}`;
    const isWaybill = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';

    // If it's a potential waybill, queue for AI processing
    if (isWaybill && body.autoProcess !== 'false') {
      try {
        console.log(`🤖 Queueing waybill for AI processing: ${file.filename}`);
        
        // Add to BullMQ queue for async processing
        await this.waybillQueue.add('process-waybill', {
          filePath,
          companyId: body.companyId || 1,
          fileName: file.originalname,
        });

        return {
          url: fileUrl,
          type: file.mimetype.startsWith('image/') ? 'image' : 'document',
          name: file.originalname,
          processing: true,
          message: 'Waybill queued for AI OCR processing'
        };
      } catch (error) {
        console.error('❌ Failed to queue waybill:', error);
      }
    }

    return {
      url: fileUrl,
      type: file.mimetype.startsWith('image/') ? 'image' : 'document',
      name: file.originalname,
      processing: false
    };
  }
}
