import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EcommerceService } from '../ecommerce/ecommerce.service';
import { WaybillStatus } from '@prisma/client';
import { v4 as uuid } from 'uuid';

@Injectable()
export class WaybillsService {
  private readonly logger = new Logger(WaybillsService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private ecommerce: EcommerceService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────

  /**
   * Return the active deliveries for the authenticated user's linked Driver.
   * Only returns waybills that are assigned (via a Shipment) to that specific
   * driver — so a DRIVER-role user sees only their own jobs.
   * Falls back to all in-transit waybills for the company if no driver link exists.
   */
  async findMyDeliveries(userId: string, companyId: string) {
    // Find the driver linked to this user
    const driver = await this.prisma.driver.findFirst({
      where: { userId, companyId, isActive: true },
    });

    const ACTIVE_STATUSES: WaybillStatus[] = [
      WaybillStatus.PENDING, WaybillStatus.COLLECTED,
      WaybillStatus.IN_TRANSIT, WaybillStatus.OUT_FOR_DELIVERY,
    ];

    if (driver) {
      // Scoped: only this driver's shipments
      const shipments = await this.prisma.shipment.findMany({
        where: { driverId: driver.id, companyId },
        select: { waybillId: true },
      });
      const waybillIds = shipments.map((s) => s.waybillId);
      if (waybillIds.length === 0) return [];
      return this.prisma.waybill.findMany({
        where: { id: { in: waybillIds }, status: { in: ACTIVE_STATUSES } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });
    }

    // Fallback (no driver link yet): return company's active waybills
    return this.prisma.waybill.findMany({
      where: { companyId, status: { in: ACTIVE_STATUSES } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

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
    const existing = await this.findOne(id, companyId);
    const updated = await this.prisma.waybill.update({ where: { id }, data: dto });
    if (dto.status && dto.status !== existing.status) {
      void this.notifications.notifyWaybillStatus(updated);
      void this.ecommerce.pushStatusToShopify(updated);
    }
    return updated;
  }

  /**
   * Assign a driver to a waybill.
   *
   * Waybill has no direct driverId column — the driver relationship lives on
   * the Shipment model.  This method upserts a Shipment for the waybill (or
   * updates an existing one) and advances the waybill status to COLLECTED so
   * it disappears from the "unassigned" queue and the driver can pick it up.
   */
  async assignDriver(waybillId: string, companyId: string, driverId: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, companyId },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');

    return this.prisma.$transaction(async (tx) => {
      // Upsert the linked shipment
      const existing = await tx.shipment.findFirst({
        where: { waybillId, companyId },
      });

      const shipment = existing
        ? await tx.shipment.update({
            where: { id: existing.id },
            data: { driverId, status: 'IN_TRANSIT' },
          })
        : await tx.shipment.create({
            data: { waybillId, companyId, driverId, status: 'IN_TRANSIT' },
          });

      // Advance the waybill so it leaves the pending/unassigned queue
      if (waybill.status === 'PENDING') {
        await tx.waybill.update({
          where: { id: waybillId },
          data: { status: 'COLLECTED' },
        });
      }

      return { success: true, shipmentId: shipment.id };
    });
  }

  /**
   * Bulk status update for warehouse batch scanning.
   * Returns per-waybill results so the scan UI can show colour-coded feedback.
   */
  async batchScan(
    companyId: string,
    trackingNumbers: string[],
    targetStatus: string,
  ) {
    const unique = [...new Set(trackingNumbers.map((t) => t.trim()).filter(Boolean))];
    const results: Array<{ trackingNumber: string; result: 'updated' | 'notFound' | 'unchanged'; id?: string }> = [];

    for (const tn of unique) {
      const waybill = await this.prisma.waybill.findFirst({
        where: { trackingNumber: tn, companyId },
      });
      if (!waybill) {
        results.push({ trackingNumber: tn, result: 'notFound' });
        continue;
      }
      if (waybill.status === targetStatus) {
        results.push({ trackingNumber: tn, result: 'unchanged', id: waybill.id });
        continue;
      }
      const updated = await this.prisma.waybill.update({
        where: { id: waybill.id },
        data: { status: targetStatus as any },
      });
      void this.notifications.notifyWaybillStatus(updated);
      results.push({ trackingNumber: tn, result: 'updated', id: waybill.id });
    }

    return {
      results,
      updated:   results.filter((r) => r.result === 'updated').length,
      notFound:  results.filter((r) => r.result === 'notFound').length,
      unchanged: results.filter((r) => r.result === 'unchanged').length,
    };
  }

  // ── Customer rating ────────────────────────────────────────────────

  /** Generates a unique token and sends the rating request to the customer. */
  async requestRating(id: string, companyId: string) {
    const waybill = await this.findOne(id, companyId);
    if (waybill.status !== 'DELIVERED') {
      throw new BadRequestException('Rating can only be requested after delivery');
    }
    const token = `${waybill.trackingNumber}-${uuid()}`;
    const updated = await this.prisma.waybill.update({
      where: { id },
      data: { ratingToken: token, ratingRequestedAt: new Date() },
    });
    await this.notifications.sendRatingRequest(updated);
    return { success: true, token };
  }

  /** Public — returns waybill info for the rating page (no auth needed). */
  async getPublicRating(token: string) {
    const waybill = await this.prisma.waybill.findUnique({
      where: { ratingToken: token },
      select: {
        id: true, trackingNumber: true, status: true,
        recipientName: true,
        company: { select: { name: true, logoUrl: true, primaryColor: true, brandName: true } },
      },
    });
    if (!waybill) throw new NotFoundException('Rating link not found or expired');
    return waybill;
  }

  /** Public — submits a delivery rating. */
  async submitRating(token: string, dto: { rating: number; note?: string }) {
    const waybill = await this.prisma.waybill.findUnique({ where: { ratingToken: token } });
    if (!waybill) throw new NotFoundException('Rating link not found or expired');
    if (waybill.customerRating) {
      throw new BadRequestException('Rating already submitted');
    }
    if (dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }
    await this.prisma.waybill.update({
      where: { id: waybill.id },
      data: { customerRating: dto.rating, customerRatingNote: dto.note ?? null },
    });
    return { success: true, message: 'Thank you for your feedback!' };
  }

  /** Dispatcher triggers a stops-ahead + ETA notification for a recipient. */
  async notifyCustomerEta(
    id: string,
    companyId: string,
    dto: { stopsAhead: number; etaMinutes?: number },
  ) {
    const waybill = await this.findOne(id, companyId);
    if (!waybill.recipientPhone && !waybill.recipientEmail) {
      throw new BadRequestException('Recipient has no contact details');
    }
    await this.notifications.sendEtaAlert(waybill, dto.stopsAhead, dto.etaMinutes);
    return { success: true };
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

    const delivered = await this.prisma.waybill.update({
      where: { id },
      data: {
        status: 'DELIVERED',
        podRecipient: dto.recipient,
        podDeliveredAt: new Date(),
        ...(podSignatureUrl && { podSignatureUrl }),
        ...(podImageUrl && { podImageUrl }),
      },
    });
    // Notify the customer their parcel was delivered + request rating.
    void this.notifications.notifyWaybillStatus(delivered);
    void this.ecommerce.pushStatusToShopify(delivered);
    // Auto-request rating after a short delay would happen via a cron job
    // For now, the dispatcher can trigger it manually via /rate-request
    return delivered;
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
