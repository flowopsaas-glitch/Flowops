import { AiVisionService } from '../ai/ai-vision.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { WhatsAppEventsService } from '../whatsapp/whatsapp-events.service';
// src/waybills/waybills.service.ts
import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class WaybillsService {
  private readonly logger = new Logger("WaybillsService");

  constructor(
    private prisma: PrismaService,
    @InjectQueue('waybill-queue') private waybillQueue: Queue,
    private readonly r2Storage?: CloudflareR2Service,
    private readonly aiVision?: AiVisionService,
    private readonly whatsappEvents?: WhatsAppEventsService
  ) {}

  /**
   * ✅ Create WaybillInboxItem (not Waybill!) - matches your schema
   */
  async createInboxItem(companyId: number, fileData: { filename: string; path: string; originalName?: string }) {
    return this.prisma.waybillInboxItem.create({
      data: {
        companyId,
        fileUrl: `/uploads/${fileData.filename}`,
        storagePath: fileData.path,
        originalName: fileData.originalName || fileData.filename,
        status: 'NEW', // ✅ Valid WaybillInboxStatus enum value
      }
    });
  }

  /**
   * ✅ Get inbox items for a company
   */
  async getInbox(companyId?: number) {
    const where: any = { status: 'NEW' }; // ✅ Valid enum
    if (companyId) where.companyId = companyId;
    
    return this.prisma.waybillInboxItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { company: { select: { name: true } } }
    });
  }

  /**
   * ✅ Get all Waybills (not inbox items)
   */
  async findAll(companyId?: number) {
    const where: any = {};
    if (companyId) where.companyId = companyId;
    
    return this.prisma.waybill.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * ✅ Find one Waybill by NUMBER id
   */
  async findOne(id: number, companyId?: number) {
    const where: any = { id: Number(id) }; // ✅ Waybill.id is Int
    if (companyId) where.companyId = companyId;
    
    return this.prisma.waybill.findUnique({ 
      where,
      include: { 
        company: { select: { name: true } }
      }
    });
  }

  /**
   * ✅ Commit inbox item -> create Waybill
   */
  async commitInboxItem(inboxId: string, companyId: number, dto: any) {
    // 1. Get the inbox item
    const inboxItem = await this.prisma.waybillInboxItem.findUnique({ 
      where: { id: inboxId } // ✅ WaybillInboxItem.id is String
    });
    
    if (!inboxItem) throw new NotFoundException('Inbox item not found');
    if (inboxItem.companyId !== companyId) throw new BadRequestException('Access denied');

    // 2. Create the actual Waybill from the inbox item
    const waybill = await this.prisma.waybill.create({
      data: {
        companyId,
        waybillNumber: dto.waybillNumber || `WB-${Date.now()}`,
        status: 'PENDING', // ✅ Valid WaybillStatus enum
        senderName: dto.senderName || inboxItem.originalName,
        receiverName: dto.recipientName || null,
        origin: dto.origin || null,
        destination: dto.destination || null,
        weight: dto.weight ? parseFloat(dto.weight) : null,
        totalAmount: dto.totalAmount ? parseFloat(dto.totalAmount) : null,
        paymentType: dto.paymentType || null,
        podUrl: null,
      }
    });

    // 3. Update inbox item status
    await this.prisma.waybillInboxItem.update({
      where: { id: inboxId },
      data: { status: 'COMMITTED' } // ✅ Valid WaybillInboxStatus enum
    });

    return waybill;
  }

  /**
   * ✅ Delete/reject inbox item
   */
  async deleteInboxItem(id: string, companyId: number) {
    const existing = await this.prisma.waybillInboxItem.findUnique({ 
      where: { id, companyId } // ✅ String id
    });
    if (!existing) throw new NotFoundException('Inbox item not found');
    
    return this.prisma.waybillInboxItem.delete({ where: { id } });
  }

  /**
   * ✅ Find inbound waybills for a branch - uses valid enum values
   */
  async findInboundForBranch(branchId: number, companyId: number) {
    return this.prisma.waybill.findMany({
      where: {
        companyId,
        // ✅ Only use values from your WaybillStatus enum
        status: { in: ['IN_TRANSIT', 'ARRIVED_AT_HUB', 'PENDING_COLLECTION'] }
      },
      include: {
        company: { select: { name: true } }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  /**
   * ✅ Receive waybills at branch - uses NUMBER array
   */
  async receiveAtBranch(waybillIds: number[], branchId: number, companyId: number) {
    if (!waybillIds || waybillIds.length === 0) {
      throw new BadRequestException("No waybills selected.");
    }

    return this.prisma.waybill.updateMany({
      where: {
        id: { in: waybillIds.map(id => Number(id)) }, // ✅ Ensure numbers
        companyId
      },
      data: {
        status: 'ARRIVED_AT_HUB', // ✅ Valid enum
      }
    });
  }

  /**
   * ✅ Find waybills for manifest - uses valid enum values
   */
  async findForManifest(companyId: number) {
    return this.prisma.waybill.findMany({
      where: { 
        companyId,
        // ✅ Only valid WaybillStatus values
        status: { in: ['PENDING', 'PENDING_COLLECTION', 'ARRIVED_AT_HUB'] }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * ✅ Find unbilled waybills
   */
  async findUnbilled(companyId: number) {
    return this.prisma.waybill.findMany({
      where: {
        companyId,
        status: 'DELIVERED', // ✅ Valid enum
        // Note: billingBatchId field may not exist - adjust if needed
      }
    });
  }

  /**
   * ✅ Complete waybill with POD - uses NUMBER id, valid fields only
   */
  async completeWaybill(id: number, companyId: number, file: any) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Photo required.');
    }

    const waybill = await this.prisma.waybill.findUnique({ where: { id: Number(id) } });
    if (!waybill) throw new NotFoundException('Waybill not found');

    const filename = `pod-${id}-${Date.now()}.png`;
    let podUrl = '';

    // Upload to R2 or local
    if (this.r2Storage) {
      try {
        const uploadResult = await this.r2Storage.uploadFile(file.buffer, filename, companyId, 0, waybill.id, 'pod');
        podUrl = uploadResult.url;
        this.logger.log(`✅ POD uploaded to R2: ${podUrl}`);
      } catch (r2Error: any) {
        this.logger.error(`❌ R2 upload failed: ${r2Error.message}`);
        const uploadDir = path.join(process.cwd(), 'uploads', 'signatures');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
        podUrl = `/uploads/signatures/${filename}`;
      }
    } else {
      const uploadDir = path.join(process.cwd(), 'uploads', 'signatures');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
      podUrl = `/uploads/signatures/${filename}`;
    }

    // Create inbox item for dispatch review
    const inboxItem = await this.prisma.waybillInboxItem.create({
      data: {
        companyId,
        status: 'NEW',
        reviewStatus: 'PENDING_REVIEW',
        extractedData: {
          waybillId: waybill.id,
          waybillNumber: waybill.waybillNumber,
          driverId: waybill.driverId,
          podUrl: podUrl,
          submittedAt: new Date().toISOString(),
        },
      },
    });

    // Update waybill - keep status as IN_TRANSIT until dispatch approves
    const updatedWaybill = await this.prisma.waybill.update({
      where: { id: Number(id), companyId },
      data: { podUrl: podUrl },
    });

    this.logger.log(`✅ POD submitted to dispatch inbox: ${inboxItem.id}`);
    return { waybill: updatedWaybill, inboxItem };
  }

  

  

  

  async processWaybillAI(companyId: number, fileData: { filename: string; path: string }) {
    const inboxItem = await this.prisma.waybillInboxItem.create({
      data: {
        companyId,
        fileUrl: `/uploads/${fileData.filename}`,
        storagePath: fileData.path,
        originalName: fileData.filename,
        status: 'EXTRACTING', // ✅ Valid WaybillInboxStatus enum
      }
    });

    await this.waybillQueue.add('analyze-waybill', {
      inboxItemId: inboxItem.id,
      companyId,
      filename: fileData.filename,
      filePath: fileData.path
    });

    return {
      id: inboxItem.id,
      status: 'EXTRACTING',
      message: 'Queued for AI extraction'
    };
  }
}
