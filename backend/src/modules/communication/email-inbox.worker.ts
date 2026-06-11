import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface InboundEmailJobData {
  emailId: string;
  senderAddress: string;
  subjectLine: string;
  bodyContext: string;
  attachmentsArray: Array<{
    fileName: string;
    fileBufferBase64: string;
    mimeType: string;
  }>;
  companyId: number;
}

@Processor('email-processing-queue')
export class EmailInboxWorker extends WorkerHost {
  private readonly logger = new Logger(EmailInboxWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * BullMQ Core Process Consumer Interface Handler
   */
  async process(job: Job<InboundEmailJobData>): Promise<any> {
    if (job.name !== 'parse-inbound-packet') {
      this.logger.warn(`⚠️ Unknown job action context skipped: ${job.name}`);
      return { processed: false };
    }

    // 🚀 FIXED: Dropped 'targetedWaybillNumber' from destructuring as it's extracted dynamically below
    const { emailId, senderAddress, attachmentsArray } = job.data;
    this.logger.log(`📥 Processing Inbound Job Entry [${job.id}] | Email ID: ${emailId} from: ${senderAddress}`);

    try {
      if (!attachmentsArray || attachmentsArray.length === 0) {
        this.logger.warn(`⚠️ Email entry [${emailId}] contains 0 document layers. Skipping execution pass.`);
        return { processed: false, reason: 'No attachments located.' };
      }

      for (const attachment of attachmentsArray) {
        this.logger.log(`📄 Analyzing attached document footprint: "${attachment.fileName}" | Mime: ${attachment.mimeType}`);

        // Scrape attached waybill text contents using string matching criteria
        const decodedTextBuffer = Buffer.from(attachment.fileBufferBase64, 'base64').toString('utf-8');
        
        // Match standard regex patterns for tracking identifiers (e.g. WB-GTR-ZA-001)
        const waybillRegexPattern = /WB-[A-Z0-9-]+/gi;
        const structuralMatches = decodedTextBuffer.match(waybillRegexPattern);

        if (structuralMatches && structuralMatches.length > 0) {
          const matchedNumber = structuralMatches[0]; // Extract first clean regex array element match string
          this.logger.log(`🎯 Identified target waybill string code match: ${matchedNumber}`);

          // Update data states asynchronously directly inside PostgreSQL
          const matchingRecord = await this.prisma.waybill.findUnique({
            where: { waybillNumber: matchedNumber },
          });

          if (matchingRecord) {
            await this.prisma.waybill.update({
              where: { id: matchingRecord.id },
              data: {
                status: 'ARRIVED_AT_HUB', // Transition tracking state securely
              },
            });
            this.logger.log(`✅ Waybill record [${matchedNumber}] status safely advanced to ARRIVED_AT_HUB.`);
          } else {
            this.logger.warn(`❌ Waybill parameter references an active ID token not found inside database index mapping spaces.`);
          }
        }
      }

      return { success: true, emailProcessedId: emailId };
    } catch (error: any) {
      this.logger.error(`❌ Inbound email worker execution fault tracking loop: ${error.message}`);
      throw error;
    }
  }
}

