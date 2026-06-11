import { Injectable, Logger, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WaybillsInboxService } from '../inbox/waybills-inbox.service';
import { UnifiedExtractionService } from '../../intelligence/unified-extraction.service'; 
import { normalize } from 'path';

// Exported explicit operational contracts to eliminate reliance on "any" typings
export interface ExtractedWaybillPayload {
  waybillNumber?: string;
  waybill_number?: string;
  [key: string]: any;
}

export interface PipelineErrorResponse {
  error: boolean;
  message: string;
  waybillNumber: null;
  waybill_number?: null; // Satisfies compiler checks during type narrowing
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  
  // Whitelist containing only clean unix/windows paths, alpha-numerics, dashes, and underscores
  private readonly PATH_TRAVERSAL_REGEX = /\.\.(微|\/|\\)/g;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WaybillsInboxService))
    private readonly inboxService: WaybillsInboxService,
    private readonly intelligence: UnifiedExtractionService, 
  ) {}

  /**
   * 🤖 Safe AI Extraction Pipeline
   * Protects underlying OS boundaries and isolates sub-process parsing crashes.
   */
  async extractFromInbox(companyId: number, itemId: number): Promise<ExtractedWaybillPayload | PipelineErrorResponse> {
    this.logger.log(`🛰️ Starting AI Extraction Pipeline for Item ID: ${itemId} | Company ID: ${companyId}`);
    
    const targetItemId = Number(itemId);
    if (isNaN(targetItemId) || targetItemId <= 0) {
      this.logger.error(`❌ Extraction aborted: Invalid structural target index identifier evaluated: ${itemId}`);
      return { 
        error: true, 
        message: 'Malformed unique execution identifier index parameter passed',
        waybillNumber: null,
        waybill_number: null
      };
    }

    // 1. Fetch record using clean Prisma client types
    let item: any = null;
    try {
      item = await (this.prisma as any).waybillInboxItem.findUnique({
        where: { id: targetItemId }
      });
    } catch (dbFetchError: any) {
      this.logger.error(`❌ Database extraction lookup fault: ${dbFetchError.message}`);
      return { error: true, message: 'Database entity resolution error', waybillNumber: null, waybill_number: null };
    }

    if (!item) {
      this.logger.error(`❌ Extraction aborted: Item ${targetItemId} non-existent in sector ledger.`);
      return { error: true, message: 'Record matrix position completely missing', waybillNumber: null, waybill_number: null };
    }

    if (!item.storagePath || typeof item.storagePath !== 'string') {
      this.logger.error(`❌ Extraction aborted: Target workspace entity item ${targetItemId} lacks a valid storage reference string.`);
      return { error: true, message: 'Storage reference locator string missing or corrupted', waybillNumber: null, waybill_number: null };
    }

    try {
      // 2. Security Layer: Sanitize storage path inputs before child process ingestion to prevent DEP0190 shell issues
      const sanitizedStoragePath = this.securelyValidatePath(item.storagePath);
      
      this.logger.debug(`Calling AI Intelligence for verified absolute storage reference path: ${sanitizedStoragePath}`);
      
      // 3. Execute AI Vision/OCR call downstream
      const result: ExtractedWaybillPayload = await this.intelligence.extractWaybillData(sanitizedStoragePath); 

      // 4. Validate output payload signatures
      if (!result || typeof result !== 'object') {
        throw new Error('AI Engine subsystem returned an empty payload stream or invalid structural data matrix.');
      }

      // 5. Resolve target waybill key matches cleanly
      const resolvedWaybillNumber = result.waybillNumber || result.waybill_number || null;

      // 6. Update Database safely with absolute target mutations
      const updated = await (this.prisma as any).waybillInboxItem.update({
        where: { id: targetItemId },
        data: { 
          status: 'READY',
          extractedData: result as any,
          waybillNumber: resolvedWaybillNumber,
        }
      });

      this.logger.log(`✅ AI processing lifecycle successful for item ${targetItemId}: Discovered Waybill ${updated.waybillNumber}`);
      return result;

    } catch (error: any) {
      this.logger.error(`❌ Extraction Pipeline Failed for item ${targetItemId}: ${error.message}`);
      
      // Fallback: Mutate target status trace to FAILED to avoid infinite queue block scenarios
      try {
        await (this.prisma as any).waybillInboxItem.update({
          where: { id: targetItemId },
          data: { status: 'FAILED' }
        });
      } catch (dbError: any) {
        this.logger.error(`Fatal state recovery loop failure. Failed to shift item status trace to FAILED: ${dbError.message}`);
      }

      // Clean object signature return block to insulate parent execution loops from HTTP 500 runtime drops
      return { 
        error: true, 
        message: error.message || 'Pipeline operational crash exception caught.',
        waybillNumber: null,
        waybill_number: null
      };
    }
  }

  /**
   * 🛡️ Deep Sanitisation Utility Guard
   * Strips out directory traversal targets and prevents command chain manipulation arguments
   */
  private securelyValidatePath(rawPathString: string): string {
    if (!rawPathString) {
      throw new BadRequestException('Empty resource tracking reference path context provided.');
    }

    // 1. Detect and strip illegal control structures or nested process commands
    let clearPath = rawPathString.replace(this.PATH_TRAVERSAL_REGEX, '');
    clearPath = normalize(clearPath).trim();

    // 2. Intercept command line argument injection strings (e.g. text containing prefix options like "--file=xxx")
    if (clearPath.startsWith('-') || clearPath.includes('; ') || clearPath.includes('&&') || clearPath.includes('||')) {
      this.logger.warn(`[SECURITY ALERT] Malicious execution command syntax intercepted on file parsing path parameter: ${clearPath}`);
      throw new BadRequestException('Security violation: Command argument injection attempts detected on runtime path contexts.');
    }

    return clearPath;
  }
}

