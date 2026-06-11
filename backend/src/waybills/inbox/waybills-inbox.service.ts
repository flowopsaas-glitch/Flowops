// @ts-nocheck
import { Injectable, Logger, NotFoundException, Inject, forwardRef } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service"; 
import { ExtractionService } from "../extraction/extraction.service";
import { MailService } from "../../mail/mail.service"; 
import { CommitWaybillDto } from "./dto/commit-waybill.dto";
import { PaymentType } from "@prisma/client"; 
import * as fs from 'fs';

@Injectable()
export class WaybillsInboxService {
  private readonly logger = new Logger("WaybillsInboxService");

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ExtractionService))
    private readonly extractionService: ExtractionService,
    private readonly mailService: MailService, 
  ) {}

  async list(companyId: number) {
    return this.prisma.waybillInboxItem.findMany({
      where: { companyId: Number(companyId) },
      include: { waybillDrafts: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async processCollectionAI(companyId: number, userId: number, reference: string, file: any) {
    const inboxItem = await this.prisma.waybillInboxItem.create({
      data: {
        fileUrl: `/uploads/${file.filename}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        storagePath: file.path,
        sizeBytes: file.size,
        status: "EXTRACTING",
        source: "DRIVER_COLLECTION",
        companyId: Number(companyId),
        createdById: Number(userId),
        waybillNumber: reference, 
      },
    });

    try {
      const extracted = await this.extractionService.extractFromInbox(companyId, parseInt(inboxItem.id));
      const aiFoundRef = String(extracted.waybillNumber || '').toUpperCase();
      const expectedRef = String(reference).toUpperCase();
      const isMatch = aiFoundRef.includes(expectedRef) || expectedRef.includes(aiFoundRef);

      return { success: true, isMatch, extractedData: extracted, inboxId: inboxItem.id };
    } catch (error: any) {
      this.logger.error(`AI Collection Error: ${error.message}`);
      return { success: false, message: "AI processing failed" };
    }
  }

  async upload(companyId: number, userId: number, source: string, file: any) {
    const newItem = await this.prisma.waybillInboxItem.create({
      data: {
        fileUrl: `/uploads/${file.filename}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        storagePath: file.path,
        sizeBytes: file.size,
        status: "EXTRACTING",
        source: source || "UPLOAD",
        companyId: Number(companyId),
        createdById: Number(userId),
      },
    });

    this.extractionService.extractFromInbox(companyId, parseInt(newItem.id)).catch(e => 
      this.logger.error(`AI Extraction Error: ${e.message}`)
    );
    
    return newItem;
  }

  async assist(companyId: number, id: number) {
    const item = await this.prisma.waybillInboxItem.findUnique({
      where: { id: String(id) }
    });

    if (!item) {
      throw new NotFoundException(`Waybill Inbox Item with ID ${id} not found in database.`);
    }

    await this.prisma.waybillInboxItem.update({
      where: { id: String(id) },
      data: { status: "EXTRACTING" },
    });

    this.extractionService.extractFromInbox(companyId, id).catch(e => 
      this.logger.error(`Manual AI Extraction Error: ${e.message}`)
    );

    return { status: "verified", message: "AI mapping initiated" };
  }

  /**
   * COMMERCIAL GRADE COMMIT LOGIC
   * Moves data from Inbox to Main Waybill Registry.
   * Side-effects (Email/Files) are handled outside the DB transaction.
   */
  async commit(companyId: number, userId: number, id: number, dto: CommitWaybillDto) {
    const inboxItem = await this.prisma.waybillInboxItem.findUnique({
      where: { id: String(id) }
    });

    if (!inboxItem) throw new NotFoundException("Inbox item not found");

    // 1. DATABASE TRANSACTION (Must be fast)
    const newWaybill = await this.prisma.$transaction(async (tx) => {
      // Create the permanent Waybill record
      const waybill = await tx.waybill.create({
        data: {
          waybillNumber: dto.waybillNumber || `WB-${Date.now()}`,
          status: 'DELIVERED', 
          companyId: Number(companyId),
          // currency removed
          totalAmount: dto.totalAmount, 
          paymentType: dto.paymentType || PaymentType.INVOICE, 
          payer: "SENDER", 
          weightKg: dto.weightKg || 0, 
          podUrl: inboxItem.fileUrl,
          sender: dto.senderName || "Standard Client",
          recipient: dto.recipientName || "Unknown",
          deliveryAddress: dto.recipientAddress || "Not Specified",
          collectedAt: new Date(),
          completedAt: new Date(),
        }
      });

      // Cleanup the inbox item within the transaction
      await tx.waybillInboxItem.delete({ where: { id: String(id) } });

      return waybill;
    }, {
      timeout: 10000 // 10 second safety buffer
    });

    // 2. FILE CLEANUP (Outside transaction to prevent DB locks)
    this.deletePhysicalFile(inboxItem.storagePath);

    // 3. ASYNC SIDE EFFECTS (Email)
    // We do NOT 'await' this so the API responds instantly.
    this.mailService.sendWaybillConfirmation({ 
      to: 'flowopsaas@gmail.com', 
      waybillNumber: newWaybill.waybillNumber,
      customerName: dto.senderName || "Valued Client"
    }).then(() => {
      this.logger.log(`📧 Confirmation email sent for Waybill: ${newWaybill.waybillNumber}`);
    }).catch((error) => {
      this.logger.error(`❌ Background Mail Delivery Failed for ${newWaybill.waybillNumber}: ${error.message}`);
    });

    return { success: true, waybillId: newWaybill.id };
  }

  async remove(id: number) {
    const item = await this.prisma.waybillInboxItem.findUnique({ where: { id: String(id) } });
    if (!item) return { success: false, message: "Item already removed" };
    
    this.deletePhysicalFile(item.storagePath);
    return this.prisma.waybillInboxItem.delete({ where: { id: String(id) } });
  }

  private deletePhysicalFile(path?: string | null) {
    if (path && fs.existsSync(path)) {
      try {
        fs.unlinkSync(path);
        this.logger.log(`🗑️ Physical file deleted: ${path}`);
      } catch (err: any) {
        this.logger.error(`❌ File cleanup failed: ${err.message}`);
      }
    }
  }
}
