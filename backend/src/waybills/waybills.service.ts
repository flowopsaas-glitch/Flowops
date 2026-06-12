import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { v4 as uuid } from 'uuid';

@Injectable()
export class WaybillsService {
  private readonly logger = new Logger(WaybillsService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────

  async findAll(companyId: string, query?: any) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 50;
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.search) {
      where.OR = [
        { trackingNumber: { contains: query.search, mode: 'insensitive' } },
        { recipientName: { contains: query.search, mode: 'insensitive' } },
        { senderName: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.waybill.findMany({
        where, skip: (page - 1) * limit, take: limit,
        include: { shipments: { select: { status: true, driverId: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.waybill.count({ where }),
    ]);
    return { data: items, total, page, limit };
  }

  async findRecent(companyId: string) {
    return this.prisma.waybill.findMany({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

  async findOne(id: string, companyId: string) {
    const w = await this.prisma.waybill.findFirst({
      where: { id, companyId },
      include: {
        shipments: { include: { driver: true } },
        inboxItem: true,
      },
    });
    if (!w) throw new NotFoundException('Waybill not found');
    return w;
  }

  async create(companyId: string, dto: any) {
    const trackingNumber = await this.generateTrackingNumber(companyId);
    return this.prisma.waybill.create({
      data: { ...dto, trackingNumber, companyId },
    });
  }

  async update(id: string, companyId: string, dto: any) {
    await this.findOne(id, companyId);
    return this.prisma.waybill.update({ where: { id }, data: dto });
  }

  // ── POD delivery recording ─────────────────────────────────────────

  async recordDelivery(
    id: string,
    companyId: string,
    dto: { recipient: string; signatureBase64?: string },
    file?: Express.Multer.File,
  ) {
    const waybill = await this.findOne(id, companyId);

    let podSignatureUrl: string | undefined;
    let podImageUrl: string | undefined;

    if (dto.signatureBase64) {
      const key = `pod/signatures/${companyId}/${id}.png`;
      const buf = Buffer.from(dto.signatureBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      await this.storage.upload(key, buf, 'image/png');
      podSignatureUrl = this.storage.publicFileUrl(key);
    }

    if (file) {
      const key = `pod/photos/${companyId}/${id}-${uuid()}.${file.originalname.split('.').pop()}`;
      await this.storage.upload(key, file.buffer, file.mimetype);
      podImageUrl = this.storage.publicFileUrl(key);
    }

    return this.prisma.waybill.update({
      where: { id },
      data: {
        status: 'DELIVERED',
        podRecipient: dto.recipient,
        podDeliveredAt: new Date(),
        ...(podSignatureUrl && { podSignatureUrl }),
        ...(podImageUrl && { podImageUrl }),
      },
    });
  }

  async getPublicView(id: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id },
      select: {
        id: true, trackingNumber: true, status: true,
        recipientName: true, recipientAddress: true,
        senderName: true, podDeliveredAt: true,
        podSignatureUrl: true, podImageUrl: true, podRecipient: true,
        company: { select: { name: true, logoUrl: true, primaryColor: true } },
      },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');
    return waybill;
  }

  async getReceipt(id: string, companyId: string) {
    const waybill = await this.findOne(id, companyId);
    // TODO: generate PDF with PDFKit/Puppeteer — for now return waybill data
    // In production: generate PDF, upload to R2, return signed URL
    return { waybill, receiptUrl: null, message: 'PDF generation coming soon' };
  }

  // ── AI POD quality review ─────────────────────────────────────────

  async getAssist(id: string, companyId: string) {
    const waybill = await this.findOne(id, companyId);
    const issues: string[] = [];
    const warnings: string[] = [];

    if (!waybill.podSignatureUrl) issues.push('Missing POD signature');
    if (!waybill.podRecipient) issues.push('Missing recipient name on POD');
    if (!waybill.podImageUrl) warnings.push('No parcel photo attached');
    if (!waybill.podDeliveredAt) issues.push('Delivery timestamp not recorded');

    const completenessScore = 1 - issues.length * 0.25 - warnings.length * 0.1;

    return {
      waybillId: id,
      completenessScore: Math.max(0, completenessScore),
      podReady: issues.length === 0,
      blockingIssues: issues,
      warnings,
      suggestions: warnings.length > 0
        ? ['Add parcel photo for better POD completeness']
        : ['POD is complete'],
    };
  }

  // ── Inbox (AI extraction) ─────────────────────────────────────────

  async getInbox(companyId: string, query?: any) {
    return this.prisma.waybillInboxItem.findMany({
      where: { companyId, status: { not: 'COMMITTED' } },
      orderBy: { createdAt: 'desc' },
      take: Number(query?.limit) || 50,
    });
  }

  async getInboxStats(companyId: string) {
    const [pending, ready, failed, total] = await Promise.all([
      this.prisma.waybillInboxItem.count({ where: { companyId, status: 'PENDING' } }),
      this.prisma.waybillInboxItem.count({ where: { companyId, status: 'READY' } }),
      this.prisma.waybillInboxItem.count({ where: { companyId, status: 'FAILED' } }),
      this.prisma.waybillInboxItem.count({ where: { companyId } }),
    ]);
    return { pending, ready, failed, total };
  }

  async uploadInbox(companyId: string, file: Express.Multer.File) {
    const ext = file.originalname.split('.').pop() ?? 'pdf';
    const key = `waybills/inbox/${companyId}/${uuid()}.${ext}`;

    await this.storage.upload(key, file.buffer, file.mimetype);
    const fileUrl = this.storage.publicFileUrl(key);

    // Create inbox item in EXTRACTING state
    const item = await this.prisma.waybillInboxItem.create({
      data: { companyId, fileUrl, fileKey: key, mimeType: file.mimetype, status: 'EXTRACTING' },
    });

    // Stub AI extraction — real implementation queues a Bull job that:
    // 1. Downloads the file from R2
    // 2. Calls a vision AI model (OpenAI GPT-4o or Google Vision)
    // 3. Extracts waybill fields with confidence scores
    // 4. Updates status to READY
    await this.stubExtract(item.id);

    return this.prisma.waybillInboxItem.findUnique({ where: { id: item.id } });
  }

  private async stubExtract(itemId: string) {
    // In production, replace with: await this.queueService.addExtractionJob(itemId)
    await this.prisma.waybillInboxItem.update({
      where: { id: itemId },
      data: {
        status: 'READY',
        aiConfidence: 0.87,
        extractedData: {
          senderName: 'Extracted Sender',
          senderPhone: '+27821234567',
          senderAddress: 'Extracted Address',
          recipientName: 'Extracted Recipient',
          recipientPhone: '+27829876543',
          recipientAddress: 'Extracted Delivery Address',
          weight: 2.5,
          totalAmount: 150.00,
          confidence: 0.87,
          _note: 'Replace this stub with real OCR + AI extraction',
        },
      },
    });
  }

  async commitInboxItem(itemId: string, companyId: string, overrides?: any) {
    const item = await this.prisma.waybillInboxItem.findFirst({
      where: { id: itemId, companyId },
    });
    if (!item) throw new NotFoundException('Inbox item not found');
    if (item.status !== 'READY') {
      throw new BadRequestException(`Cannot commit item with status: ${item.status}`);
    }

    const extracted: any = item.extractedData || {};
    const waybillData = { ...extracted, ...overrides };

    const waybill = await this.create(companyId, waybillData);

    await this.prisma.waybillInboxItem.update({
      where: { id: itemId },
      data: { status: 'COMMITTED', waybillId: waybill.id },
    });

    return waybill;
  }

  async deleteInboxItem(itemId: string, companyId: string) {
    const item = await this.prisma.waybillInboxItem.findFirst({
      where: { id: itemId, companyId },
    });
    if (!item) throw new NotFoundException('Inbox item not found');
    if (item.fileKey) await this.storage.delete(item.fileKey);
    return this.prisma.waybillInboxItem.delete({ where: { id: itemId } });
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private async generateTrackingNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const count = await this.prisma.waybill.count({ where: { companyId } });
    const seq = String(count + 1).padStart(6, '0');
    return `FO${year}${seq}`;
  }
}
