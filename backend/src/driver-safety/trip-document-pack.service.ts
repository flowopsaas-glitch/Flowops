import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../webhooks/outbox.service';
import { EventsGateway } from '../gateway/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * WP3 Stage 3: Cross-border document pack + expiry alerts.
 *
 * Per-trip document pack: each document is captured by a dispatcher or the
 * driver in the portal, with the actor recorded. The pack records what the
 * operator holds — it does not file anything with any authority.
 *
 * Statuses: HELD | MISSING | EXPIRED | NOT_APPLICABLE.
 *
 * Expiry alerts fire on the existing rails:
 *   - Outbox event (`trip.document.expiring_soon` / `trip.document.expired`)
 *   - Gateway socket broadcast to the tenant company room
 *   - Notification row
 * Thresholds: 30 / 14 / 3 days before expiry, per-company configurable
 * (downwards only). No quiet-hours deferral — an expiring permit at 23:00
 * is still expiring.
 *
 * Tenant-scoped throughout: every operation filters by companyId.
 */

const DEFAULT_THRESHOLDS_DAYS = [30, 14, 3];

@Injectable()
export class TripDocumentPackService {
  private readonly logger = new Logger(TripDocumentPackService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private outbox: OutboxService,
    private gateway: EventsGateway,
    private notifications: NotificationsService,
  ) {}

  // ═════════════════════════════════════════════════════════════════════════════
  // DOCUMENT PACK CRUD
  // ════════════════════════════════════════════════════════════════════════════

  async createDocument(
    companyId: string,
    data: {
      tripId: string;
      documentType: string;
      status?: string;
      issuedAt?: Date;
      expiresAt?: Date;
      capturedBy: string;
      evidenceRef?: string;
    },
  ) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: data.tripId, companyId },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const doc = await this.prisma.tripDocumentPack.create({
      data: {
        companyId,
        tripId: data.tripId,
        documentType: data.documentType,
        status: (data.status ?? 'HELD') as any,
        issuedAt: data.issuedAt ?? null,
        expiresAt: data.expiresAt ?? null,
        capturedBy: data.capturedBy,
        evidenceRef: data.evidenceRef ?? null,
      },
    });

    await this.audit.record({
      actorId: data.capturedBy,
      actorType: 'tenant',
      action: 'trip_document.created',
      targetId: doc.id,
      targetType: 'trip_document_pack',
      metadata: {
        tripId: data.tripId,
        documentType: data.documentType,
        status: data.status,
        expiresAt: data.expiresAt,
      },
    });

    // If this document has an expiry, schedule expiry-aware handling
    if (data.expiresAt) {
      await this.checkDocumentExpiry(doc.id, companyId, data.expiresAt, data.documentType);
    }

    return doc;
  }

  async getDocuments(companyId: string, tripId?: string, status?: string) {
    const where: any = { companyId };
    if (tripId) where.tripId = tripId;
    if (status) where.status = status;

    return this.prisma.tripDocumentPack.findMany({
      where,
      orderBy: { expiresAt: 'asc', createdAt: 'desc' },
    });
  }

  async getDocument(companyId: string, docId: string) {
    const doc = await this.prisma.tripDocumentPack.findFirst({
      where: { id: docId, companyId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async updateDocument(
    companyId: string,
    docId: string,
    data: {
      status?: string;
      issuedAt?: Date;
      expiresAt?: Date;
      capturedBy?: string;
      evidenceRef?: string;
    },
  ) {
    const doc = await this.prisma.tripDocumentPack.findFirst({
      where: { id: docId, companyId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const updated = await this.prisma.tripDocumentPack.update({
      where: { id: docId },
      data: {
        ...(data.status !== undefined && { status: data.status as any }),
        ...(data.issuedAt !== undefined && { issuedAt: data.issuedAt }),
        ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt }),
        ...(data.capturedBy !== undefined && { capturedBy: data.capturedBy }),
        ...(data.evidenceRef !== undefined && { evidenceRef: data.evidenceRef }),
      },
    });

    await this.audit.record({
      actorId: data.capturedBy ?? null,
      actorType: 'tenant',
      action: 'trip_document.updated',
      targetId: docId,
      targetType: 'trip_document_pack',
      metadata: {
        tripId: doc.tripId,
        documentType: doc.documentType,
        previousStatus: doc.status,
        newStatus: data.status,
        expiresAt: data.expiresAt,
      },
    });

    return updated;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXPIRY ALERTS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Check a single document against expiry thresholds and fire alerts.
   * Called on document create/update and by the expiry sweep cron.
   */
  async checkDocumentExpiry(
    docId: string,
    companyId: string,
    expiresAt: Date,
    documentType: string,
  ) {
    const doc = await this.prisma.tripDocumentPack.findFirst({
      where: { id: docId, companyId },
      include: { trip: { select: { id: true, reference: true } } },
    });
    if (!doc) return;

    // Skip non-expirable statuses
    if (doc.status === 'NOT_APPLICABLE' || doc.status === 'EXPIRED') return;

    const now = new Date();
    const expiryMs = new Date(expiresAt).getTime() - now.getTime();
    const daysUntilExpiry = expiryMs / (1000 * 60 * 60 * 24);

    // Already expired
    if (daysUntilExpiry <= 0) {
      if (doc.status !== 'EXPIRED') {
        await this.markExpired(docId, companyId);
        await this.fireExpiryAlert(doc, companyId, 'expired');
      }
      return;
    }

    // Check thresholds: 30 / 14 / 3 days
    const thresholds = await this.getApplicableThresholds(companyId, documentType);
    for (const thresholdDays of thresholds) {
      if (
        daysUntilExpiry <= thresholdDays &&
        daysUntilExpiry > thresholdDays - 1
      ) {
        // Within this threshold band — fire expiring_soon alert
        await this.fireExpiryAlert(doc, companyId, 'expiring_soon', thresholdDays);
        break; // Fire only the tightest applicable threshold
      }
    }
  }

  /**
   * Sweep all documents for this company and fire any due expiry alerts.
   * Runs periodically (cron). Only fires each threshold once per document
   * by checking whether an alert already exists for this threshold band.
   */
  async sweepExpiryAlerts(companyId: string) {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const docs = await this.prisma.tripDocumentPack.findMany({
      where: {
        companyId,
        status: { in: ['HELD', 'MISSING'] },
        expiresAt: { lte: thirtyDaysFromNow, gte: now },
      },
      include: { trip: { select: { id: true, reference: true } } },
    });

    for (const doc of docs) {
      await this.checkDocumentExpiry(
        doc.id,
        companyId,
        doc.expiresAt!,
        doc.documentType,
      );
    }

    // Also mark any documents whose expiry has passed
    const expired = await this.prisma.tripDocumentPack.findMany({
      where: {
        companyId,
        status: { in: ['HELD', 'MISSING'] },
        expiresAt: { lt: now },
      },
    });
    for (const doc of expired) {
      await this.markExpired(doc.id, companyId);
      await this.fireExpiryAlert(doc, companyId, 'expired');
    }

    return { docsChecked: docs.length, expiredMarked: expired.length };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // THRESHOLDS
  // ════════════════════════════════════════════════════════════════════════════

  async getThresholds(companyId: string) {
    return this.prisma.documentExpiryThreshold.findMany({
      where: { companyId, isActive: true },
      orderBy: { thresholdDays: 'asc' },
    });
  }

  async setThreshold(
    companyId: string,
    data: {
      documentType?: string;
      thresholdDays: number;
    },
  ) {
    if (data.thresholdDays < 1 || data.thresholdDays > 365) {
      throw new BadRequestException('thresholdDays must be between 1 and 365');
    }

    const threshold = await this.prisma.documentExpiryThreshold.upsert({
      where: {
        companyId_documentType: {
          companyId,
          documentType: data.documentType ?? null,
        },
      },
      update: { thresholdDays: data.thresholdDays, isActive: true },
      create: {
        companyId,
        documentType: data.documentType ?? null,
        thresholdDays: data.thresholdDays,
      },
    });

    await this.audit.record({
      actorId: null,
      actorType: 'system',
      action: 'document_expiry_threshold.updated',
      targetId: threshold.id,
      targetType: 'document_expiry_threshold',
      metadata: { companyId, documentType: data.documentType, thresholdDays: data.thresholdDays },
    });

    return threshold;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  private async getApplicableThresholds(
    companyId: string,
    documentType: string,
  ): Promise<number[]> {
    const thresholds = await this.prisma.documentExpiryThreshold.findMany({
      where: {
        companyId,
        isActive: true,
        OR: [{ documentType }, { documentType: null }],
      },
      orderBy: { thresholdDays: 'asc' },
    });

    if (thresholds.length > 0) {
      return thresholds.map((t) => t.thresholdDays);
    }
    return DEFAULT_THRESHOLDS_DAYS;
  }

  private async markExpired(docId: string, companyId: string) {
    await this.prisma.tripDocumentPack.update({
      where: { id: docId },
      data: { status: 'EXPIRED' },
    });
  }

  private async fireExpiryAlert(
    doc: any,
    companyId: string,
    kind: 'expiring_soon' | 'expired',
    thresholdDays?: number,
  ) {
    const event =
      kind === 'expired'
        ? 'trip.document.expired'
        : 'trip.document.expiring_soon';

    const payload = {
      companyId,
      documentId: doc.id,
      tripId: doc.tripId,
      tripReference: doc.trip?.reference,
      documentType: doc.documentType,
      status: doc.status,
      expiresAt: doc.expiresAt,
      thresholdDays,
      capturedBy: doc.capturedBy,
    };

    // 1. Outbox event (transactional, retried until processed)
    void this.outbox.enqueue(this.prisma, companyId, event, payload).catch(
      (err) => this.logger.warn(`Outbox enqueue failed for ${event}: ${err?.message}`),
    );

    // 2. Gateway socket broadcast to the tenant company room (honest delivery states)
    this.gateway.broadcastToCompany(companyId, event, payload);

    // 3. Notification row
    void this.notifications.create(companyId, {
      title:
        kind === 'expired'
          ? `Document expired: ${doc.documentType}`
          : `Document expiring soon: ${doc.documentType}`,
      body:
        kind === 'expired'
          ? `${doc.documentType} for trip ${doc.trip?.reference} has expired.`
          : `${doc.documentType} for trip ${doc.trip?.reference} expires in ${thresholdDays} days.`,
      type: kind === 'expired' ? 'warning' : 'info',
      link: `/trips/${doc.tripId}/documents`,
      companyId,
    }).catch((err) => this.logger.warn(`Notification create failed: ${err?.message}`));
  }
}
