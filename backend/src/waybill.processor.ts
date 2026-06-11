import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WaybillAiService } from './waybill-ai/waybill-ai.service';

@Processor('waybill-queue')
export class WaybillProcessor extends WorkerHost {
  constructor(private waybillAiService: WaybillAiService) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { filePath, companyId, fileName } = job.data;

    try {
      console.log(`🤖 Processing waybill: ${fileName}`);
      
      // Use AI service to OCR and create waybill
      const waybill = await this.waybillAiService.processAndSave(filePath, companyId);

      if (waybill) {
        console.log(`✅ Waybill created: ${waybill.waybillNumber}`);
        return { 
          success: true, 
          waybillId: waybill.id,
          waybillNumber: waybill.waybillNumber 
        };
      } else {
        throw new Error('AI processing returned null');
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ [Worker Error]: ${errorMessage}`);
      throw error;
    }
  }
}
