import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService, EmailAttachmentInput } from '../email/email.service';
import { StorageService } from '../storage/storage.service';
import {
  EMAIL_ATTACHMENT_MAX_BYTES,
  EMAIL_ATTACHMENT_MAX_FILES,
  validateEmailAttachment,
} from './attachment-policy';
import {
  AttachmentScannerService,
  ScanResult,
  ThreatLevel,
} from './attachment-scanner.service';

const LEVEL_RANK: Record<ThreatLevel, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/** Multer in-memory file shape (avoids a hard dependency on Express types). */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface SendEmailHubDto {
  to: string;
  subject: string;
  body?: string;
  type?: string;
  priority?: string;
}

@Injectable()
export class EmailHubService {
  private readonly logger = new Logger(EmailHubService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scanner: AttachmentScannerService,
    private readonly email: EmailService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  // ── Reads ─────────────────────────────────────────────────────────────

  async findAll(
    companyId: string,
    filters: {
      search?: string;
      type?: string;
      status?: string;
      priority?: string;
    } = {},
  ) {
    const { search, type, status, priority } = filters;
    const rows = await this.prisma.emailHubItem.findMany({
      where: {
        companyId,
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(search
          ? {
              OR: [
                { subject: { contains: search, mode: 'insensitive' as const } },
                { body: { contains: search, mode: 'insensitive' as const } },
                { from: { contains: search, mode: 'insensitive' as const } },
                { senderEmail: { contains: search, mode: 'insensitive' as const } },
                { senderName: { contains: search, mode: 'insensitive' as const } },
                { waybillNumber: { contains: search, mode: 'insensitive' as const } },
                { podNumber: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { receivedAt: 'desc' },
      include: { attachments: true },
      take: 200,
    });
    return rows.map((r) => this.toApi(r));
  }

  async stats(companyId: string) {
    const [total, unread, needsOpsAction, critical, byTypeRaw] = await Promise.all([
      this.prisma.emailHubItem.count({ where: { companyId } }),
      this.prisma.emailHubItem.count({ where: { companyId, isRead: false } }),
      this.prisma.emailHubItem.count({
        where: { companyId, needsOpsAction: true, resolved: false },
      }),
      this.prisma.emailHubItem.count({
        where: { companyId, priority: 'CRITICAL', resolved: false },
      }),
      this.prisma.emailHubItem.groupBy({
        by: ['type'],
        where: { companyId },
        _count: { _all: true },
      }),
    ]);

    return {
      total,
      unread,
      needsOpsAction,
      critical,
      byType: byTypeRaw.map((g: any) => ({
        type: g.type,
        _count: { _all: g._count?._all ?? 0 },
      })),
    };
  }

  async getOne(companyId: string, id: string) {
    const item = await this.prisma.emailHubItem.findFirst({
      where: { id, companyId },
      include: { attachments: true },
    });
    if (!item) throw new NotFoundException('Email item not found');
    return this.toApi(item);
  }

  // ── Writes ────────────────────────────────────────────────────────────

  async create(
    companyId: string,
    dto: {
      subject: string;
      from?: string;
      to?: string;
      senderName?: string;
      senderEmail?: string;
      body?: string;
      type?: string;
      status?: string;
      priority?: string;
      category?: string;
      waybillNumber?: string;
      podNumber?: string;
    },
  ) {
    const created = await this.prisma.emailHubItem.create({
      data: {
        companyId,
        subject: dto.subject,
        from: dto.senderEmail ?? dto.from ?? 'unknown@unknown',
        to: dto.to ?? '',
        senderEmail: dto.senderEmail ?? dto.from,
        senderName: dto.senderName,
        body: dto.body,
        type: dto.type ?? 'GENERAL',
        status: dto.status ?? 'NEW',
        priority: dto.priority ?? 'MEDIUM',
        category: dto.category,
        waybillNumber: dto.waybillNumber,
        podNumber: dto.podNumber,
        direction: 'INBOUND',
      },
      include: { attachments: true },
    });
    return this.toApi(created);
  }

  async update(
    companyId: string,
    id: string,
    dto: Partial<{
      status: string;
      priority: string;
      type: string;
      opsNote: string;
      isRead: boolean;
      needsOpsAction: boolean;
      aiCategory: string;
      aiSuggestedAction: string;
    }>,
  ) {
    await this.ensureOwned(companyId, id);
    const updated = await this.prisma.emailHubItem.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.opsNote !== undefined ? { opsNote: dto.opsNote } : {}),
        ...(dto.isRead !== undefined ? { isRead: dto.isRead, read: dto.isRead } : {}),
        ...(dto.needsOpsAction !== undefined ? { needsOpsAction: dto.needsOpsAction } : {}),
        ...(dto.aiCategory !== undefined ? { aiCategory: dto.aiCategory } : {}),
        ...(dto.aiSuggestedAction !== undefined
          ? { aiSuggestedAction: dto.aiSuggestedAction }
          : {}),
      },
      include: { attachments: true },
    });
    return this.toApi(updated);
  }

  async markRead(id: string, companyId: string) {
    await this.ensureOwned(companyId, id);
    const updated = await this.prisma.emailHubItem.update({
      where: { id },
      data: { read: true, isRead: true },
      include: { attachments: true },
    });
    return this.toApi(updated);
  }

  async resolve(id: string, companyId: string) {
    await this.ensureOwned(companyId, id);
    const updated = await this.prisma.emailHubItem.update({
      where: { id },
      data: { resolved: true, status: 'RESOLVED', needsOpsAction: false },
      include: { attachments: true },
    });
    return this.toApi(updated);
  }

  private validateFileBounds(files: UploadedFile[], outbound: boolean): void {
    if (!Array.isArray(files) || files.length > EMAIL_ATTACHMENT_MAX_FILES) {
      throw new BadRequestException(`A maximum of ${EMAIL_ATTACHMENT_MAX_FILES} attachments is allowed`);
    }
    for (const file of files) {
      if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.buffer.length !== file.size ||
          file.size > EMAIL_ATTACHMENT_MAX_BYTES) {
        throw new BadRequestException('Each attachment must be valid and 5 MiB or smaller');
      }
      if (outbound) validateEmailAttachment(file);
    }
  }

  // ── Send an email WITH attachments ─────────────────────────────────────

  /**
   * Compose-and-send. Every attachment is threat-scanned first; files rated
   * HIGH/CRITICAL are recorded and flagged but NOT transmitted. A record of
   * the outbound email is stored in the hub.
   */
  async send(companyId: string, dto: SendEmailHubDto, files: UploadedFile[] = []) {
    this.validateFileBounds(files, true);
    const fromEmail = this.config.get<string>('SENDGRID_FROM_EMAIL', 'noreply@flowops.local');

    const item = await this.prisma.emailHubItem.create({
      data: {
        companyId,
        subject: dto.subject,
        from: fromEmail,
        to: dto.to,
        senderEmail: fromEmail,
        recipientEmail: dto.to,
        body: dto.body ?? '',
        type: dto.type ?? 'GENERAL',
        status: 'IN_PROGRESS',
        priority: dto.priority ?? 'MEDIUM',
        direction: 'OUTBOUND',
        isRead: true,
        read: true,
      },
    });

    const { attachments, worst, sendable } = await this.processFiles(companyId, item.id, files);

    // Transmit only the clean attachments.
    const mailAttachments: EmailAttachmentInput[] = sendable.map((s) => ({
      content: s.buffer.toString('base64'),
      filename: s.filename,
      type: s.mimeType || 'application/octet-stream',
      disposition: 'attachment',
    }));

    const html = (dto.body ?? '').trim()
      ? `<div style="white-space:pre-wrap">${this.escapeHtml(dto.body as string)}</div>`
      : '<p>(no message body)</p>';

    const sent = await this.email.send({
      to: dto.to,
      subject: dto.subject,
      html,
      text: dto.body,
      attachments: mailAttachments,
    });

    const blocked = attachments.length - sendable.length;
    await this.applyThreatOutcome(companyId, item.id, worst, {
      direction: 'OUTBOUND',
      blocked,
      sent,
    });

    return this.getOne(companyId, item.id);
  }

  // ── Ingest an INCOMING email/document (scan everything) ────────────────

  /**
   * Entry point for inbound mail (e.g. a SendGrid Inbound Parse webhook).
   * Stores the item, scans every attachment, and flags threats.
   */
  async ingest(
    companyId: string,
    dto: {
      subject: string;
      senderEmail: string;
      senderName?: string;
      body?: string;
      type?: string;
      waybillNumber?: string;
      podNumber?: string;
    },
    files: UploadedFile[] = [],
  ) {
    this.validateFileBounds(files, false);
    const item = await this.prisma.emailHubItem.create({
      data: {
        companyId,
        subject: dto.subject,
        from: dto.senderEmail,
        to: '',
        senderEmail: dto.senderEmail,
        senderName: dto.senderName,
        body: dto.body ?? '',
        type: dto.type ?? 'GENERAL',
        status: 'NEW',
        priority: 'MEDIUM',
        direction: 'INBOUND',
        waybillNumber: dto.waybillNumber,
        podNumber: dto.podNumber,
      },
    });

    const { worst } = await this.processFiles(companyId, item.id, files);
    await this.applyThreatOutcome(companyId, item.id, worst, { direction: 'INBOUND' });

    return this.getOne(companyId, item.id);
  }

  // ── Demo seeding ───────────────────────────────────────────────────────

  async seedDemo(companyId: string) {
    const now = Date.now();
    const demos = [
      {
        subject: 'Collection request — 12 parcels from Sandton warehouse',
        senderName: 'Acme Retail',
        senderEmail: 'logistics@acmeretail.co.za',
        body: 'Hi team, please arrange collection of 12 parcels from our Sandton DC tomorrow before 14:00. Waybill WB-22841.',
        type: 'COLLECTION_REQUEST',
        priority: 'HIGH',
        needsOpsAction: true,
        waybillNumber: 'WB-22841',
        aiSummary: 'Customer requests same-day collection of 12 parcels; deadline 14:00.',
        aiCategory: 'Collection scheduling',
        aiSuggestedAction: 'Assign a driver to the Sandton DC pickup before 14:00.',
        aiConfidence: 0.94,
      },
      {
        subject: 'POD confirmation — WB-22790 delivered',
        senderName: 'Driver Bongani',
        senderEmail: 'driver.bongani@flowops.local',
        body: 'Proof of delivery attached for WB-22790, signed by recipient at 11:42.',
        type: 'POD',
        priority: 'LOW',
        podNumber: 'POD-22790',
        isRead: true,
        aiSummary: 'POD received and matches waybill WB-22790.',
        aiCategory: 'Proof of delivery',
        aiSuggestedAction: 'Auto-close delivery; no action required.',
        aiConfidence: 0.99,
      },
      {
        subject: 'Quote request — monthly pallet distribution',
        senderName: 'Mbeki Wholesale',
        senderEmail: 'procurement@mbekiwholesale.co.za',
        body: 'Please quote for ~80 pallets/month between Durban and Joburg.',
        type: 'QUOTE',
        priority: 'MEDIUM',
        needsOpsAction: true,
        aiSummary: 'Recurring lane quote opportunity: 80 pallets/month DBN→JHB.',
        aiCategory: 'Sales / quoting',
        aiSuggestedAction: 'Route to quoting engine and respond within SLA.',
        aiConfidence: 0.88,
      },
      {
        subject: 'Delivery feedback — late arrival',
        senderName: 'Thandi M.',
        senderEmail: 'thandi@example.com',
        body: 'My parcel arrived 2 hours after the promised window. Please advise.',
        type: 'FEEDBACK',
        priority: 'MEDIUM',
        needsOpsAction: true,
        aiSummary: 'Negative feedback: SLA breach on delivery window.',
        aiCategory: 'Customer service',
        aiSuggestedAction: 'Acknowledge, investigate route delay, offer goodwill.',
        aiConfidence: 0.91,
      },
      {
        subject: '[SECURITY] Suspicious attachment quarantined',
        senderName: 'unknown sender',
        senderEmail: 'billing@invoices-dhl-secure.com',
        body: 'Please find your invoice attached.',
        type: 'AI_MONITOR',
        priority: 'CRITICAL',
        needsOpsAction: true,
        aiSummary: 'Incoming email carried an executable disguised as a PDF. Quarantined.',
        aiCategory: 'Threat / phishing',
        aiSuggestedAction: 'Do NOT open. Verify sender out-of-band; report phishing.',
        aiConfidence: 0.97,
        threatAttachment: {
          filename: 'invoice.pdf.exe',
          mimeType: 'application/x-msdownload',
          size: 184320,
          scanStatus: 'THREAT',
          threatLevel: 'CRITICAL',
          threatReason:
            'Double-extension disguise detected (".pdf.exe"); executable file type not permitted',
          scanEngine: 'heuristic',
        },
      },
    ] as const;

    let created = 0;
    for (const d of demos) {
      const { threatAttachment, ...fields } = d as any;
      const item = await this.prisma.emailHubItem.create({
        data: {
          companyId,
          from: fields.senderEmail,
          to: '',
          receivedAt: new Date(now - created * 3600_000),
          ...fields,
        },
      });
      created += 1;

      if (threatAttachment) {
        await this.prisma.emailAttachment.create({
          data: { emailHubItemId: item.id, scannedAt: new Date(), ...threatAttachment },
        });
        await this.raiseThreatEvent(companyId, item.id, threatAttachment.filename, {
          threatLevel: threatAttachment.threatLevel,
          threatReason: threatAttachment.threatReason,
          scanEngine: threatAttachment.scanEngine,
        });
      }
    }

    return { created };
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private async processFiles(companyId: string, itemId: string, files: UploadedFile[]) {
    const attachments: Array<{ filename: string; scan: ScanResult }> = [];
    const sendable: Array<{ filename: string; mimeType: string; buffer: Buffer }> = [];
    let worst: ThreatLevel = 'NONE';

    for (const file of files) {
      const scan = await this.scanner.scan({
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      });

      let fileKey: string | null = null;
      let fileUrl: string | null = null;
      try {
        const key = `email-attachments/${companyId}/${itemId}/${Date.now()}-${this.safeName(
          file.originalname,
        )}`;
        await this.storage.upload(key, file.buffer, file.mimetype || 'application/octet-stream');
        fileKey = key;
        fileUrl = this.storage.publicFileUrl(key);
      } catch (err: any) {
        this.logger.warn(`Attachment upload failed (${file.originalname}): ${err?.message}`);
      }

      await this.prisma.emailAttachment.create({
        data: {
          emailHubItemId: itemId,
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          fileKey,
          fileUrl,
          scanStatus: scan.scanStatus,
          threatLevel: scan.threatLevel,
          threatReason: scan.threatReason,
          scanEngine: scan.scanEngine,
          scannedAt: new Date(),
        },
      });

      attachments.push({ filename: file.originalname, scan });
      if (LEVEL_RANK[scan.threatLevel] > LEVEL_RANK[worst]) worst = scan.threatLevel;

      // Only clean (< HIGH) files are eligible to be transmitted.
      if (LEVEL_RANK[scan.threatLevel] < LEVEL_RANK.HIGH) {
        sendable.push({
          filename: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
        });
      } else {
        await this.raiseThreatEvent(companyId, itemId, file.originalname, {
          threatLevel: scan.threatLevel,
          threatReason: scan.threatReason,
          scanEngine: scan.scanEngine,
        });
      }
    }

    return { attachments, sendable, worst };
  }

  /** Escalate the hub item's priority/AI fields based on the worst attachment verdict. */
  private async applyThreatOutcome(
    companyId: string,
    itemId: string,
    worst: ThreatLevel,
    ctx: { direction: 'INBOUND' | 'OUTBOUND'; blocked?: number; sent?: boolean },
  ) {
    const rank = LEVEL_RANK[worst];
    const data: any = {};

    if (rank >= LEVEL_RANK.HIGH) {
      data.priority = 'CRITICAL';
      data.needsOpsAction = true;
      data.type = 'AI_MONITOR';
      data.aiCategory = 'Threat / malware';
      data.aiSummary =
        ctx.direction === 'INBOUND'
          ? 'Incoming attachment flagged as a security threat and quarantined.'
          : `Outbound attachment blocked: ${ctx.blocked ?? 0} file(s) failed the threat scan.`;
      data.aiSuggestedAction = 'Do not open. Verify the sender and report as phishing/malware.';
      data.aiConfidence = 0.97;
    } else if (rank >= LEVEL_RANK.MEDIUM) {
      data.priority = 'HIGH';
      data.needsOpsAction = true;
      data.aiCategory = 'Attachment review';
      data.aiSummary = 'Attachment requires manual review before processing.';
      data.aiSuggestedAction = 'Review the flagged attachment before opening.';
      data.aiConfidence = 0.8;
    }

    if (Object.keys(data).length) {
      // Inside withTenant so the item is confirmed to belong to this company rather
      // than taken on trust from the caller's itemId.
      await this.prisma.withTenant(companyId, async (tx) => {
        await tx.emailHubItem.update({ where: { id: itemId }, data });
      });
    }
  }

  private async raiseThreatEvent(
    companyId: string,
    itemId: string,
    filename: string,
    info: { threatLevel: ThreatLevel; threatReason: string | null; scanEngine: string },
  ) {
    const severity =
      info.threatLevel === 'CRITICAL'
        ? 'critical'
        : info.threatLevel === 'HIGH'
          ? 'high'
          : 'warning';
    try {
      await (this.prisma as any).aiEvent.create({
        data: {
          companyId,
          type: 'ATTACHMENT_THREAT',
          title: `Threat detected in attachment: ${filename}`,
          body: info.threatReason ?? 'A suspicious attachment was detected and quarantined.',
          severity,
          sourceType: 'EMAIL_HUB_ITEM',
          sourceId: itemId,
          metadata: {
            filename,
            threatLevel: info.threatLevel,
            scanEngine: info.scanEngine,
          },
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to raise AI threat event: ${err?.message}`);
    }
  }

  private async ensureOwned(companyId: string, id: string) {
    const exists = await this.prisma.emailHubItem.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Email item not found');
  }

  /** Map a DB row to the exact shape the frontend expects. */
  private toApi(r: any) {
    return {
      id: r.id,
      type: r.type ?? 'GENERAL',
      status: r.status ?? 'NEW',
      priority: r.priority ?? 'MEDIUM',
      direction: r.direction ?? 'INBOUND',
      subject: r.subject,
      senderName: r.senderName ?? null,
      senderEmail: r.senderEmail ?? r.from ?? '',
      recipientEmail: r.recipientEmail ?? r.to ?? null,
      body: r.body ?? '',
      companyId: r.companyId,
      waybillNumber: r.waybillNumber ?? null,
      podNumber: r.podNumber ?? null,
      aiSummary: r.aiSummary ?? null,
      aiConfidence: r.aiConfidence ?? null,
      aiCategory: r.aiCategory ?? null,
      aiSuggestedAction: r.aiSuggestedAction ?? null,
      opsNote: r.opsNote ?? null,
      isRead: r.isRead ?? r.read ?? false,
      needsOpsAction: r.needsOpsAction ?? false,
      receivedAt: (r.receivedAt ?? r.createdAt)?.toISOString?.() ?? r.createdAt,
      updatedAt: r.updatedAt?.toISOString?.() ?? r.updatedAt,
      attachments: (r.attachments ?? []).map((a: any) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType ?? null,
        size: a.size ?? 0,
        fileUrl: a.fileUrl ?? null,
        scanStatus: a.scanStatus ?? 'PENDING',
        threatLevel: a.threatLevel ?? 'NONE',
        threatReason: a.threatReason ?? null,
        scanEngine: a.scanEngine ?? null,
      })),
    };
  }

  private safeName(name: string) {
    return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  }

  private escapeHtml(s: string) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
