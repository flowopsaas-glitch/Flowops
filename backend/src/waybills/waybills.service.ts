import {
  Injectable, NotFoundException, BadRequestException, ConflictException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EcommerceService } from '../ecommerce/ecommerce.service';
import { WaybillStatus } from '@prisma/client';
import { guardTransition } from './waybill-status.machine';
import { v4 as uuid } from 'uuid';
import { BillingService } from '../billing/billing.service';
import { EventsGateway } from '../gateway/events.gateway';
import { assertFleetDispatchAllowed } from '../fleet-maintenance/fleet-compliance';
import { DriverComplianceService } from '../common/compliance/driver-compliance.service';
import { AuditService } from '../audit/audit.service';
import { FileUploadValidator } from '../common/guards/file-upload.guard';
import { withoutRatingToken } from '../common/security/waybill-redaction.util';
import { claimTransition } from '../common/state-transition';

/**
 * Fields a tenant may change through PATCH /waybills/:id.
 *
 * Everything else on Waybill is server-owned: identifiers and tenancy
 * (id, companyId, createdAt), lifecycle bookkeeping (codCollected,
 * codCollectedAt, codDiscrepancy — written by the COD reconciliation flow),
 * the customer's own rating (customerRating, customerRatingNote), and the
 * single-use rating token. Accepting any of those from a request body lets a
 * caller forge a cash collection, forge a customer rating, or move the row
 * into another tenant.
 */
const WAYBILL_PATCHABLE_FIELDS = [
  'status',
  'senderName', 'senderPhone', 'senderEmail', 'senderAddress',
  'senderLat', 'senderLng',
  'recipientName', 'recipientPhone', 'recipientEmail', 'recipientAddress',
  'recipientLat', 'recipientLng',
  'weight', 'dimensions', 'description',
  'totalAmount', 'codAmount',
  'riskLevel', 'riskScore', 'riskNotes',
  'podSignatureUrl', 'podImageUrl', 'podRecipient', 'podDeliveredAt',
] as const;

@Injectable()
export class WaybillsService {
  private readonly logger = new Logger(WaybillsService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private ecommerce: EcommerceService,
    private billing: BillingService,
    private gateway: EventsGateway,
    private compliance: DriverComplianceService,
    private audit: AuditService,
  ) {}

  /** Realtime emits are best-effort — they must never break a write. */
  private safeEmit(fn: () => void): void {
    try { fn(); } catch (err: any) { this.logger.warn(`Waybill realtime emit failed: ${err?.message ?? err}`); }
  }

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
      const rows = await this.prisma.waybill.findMany({
        where: { id: { in: waybillIds }, status: { in: ACTIVE_STATUSES } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });
      return rows.map(withoutRatingToken);
    }

    // Fallback (no driver link yet): return company's active waybills
    const rows = await this.prisma.waybill.findMany({
      where: { companyId, status: { in: ACTIVE_STATUSES } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    return rows.map(withoutRatingToken);
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
        include: { shipments: { select: { status: true, driverId: true }, take: 5 } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.waybill.count({ where }),
    ]);
    return { data: items.map(withoutRatingToken), total, page, limit };
  }

  async findRecent(companyId: string) {
    const rows = await this.prisma.waybill.findMany({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    // Served to API-key holders as GET /public/v1/waybills, i.e. to code
    // outside this repository - the last place a rating token should land.
    return rows.map(withoutRatingToken);
  }

  /**
   * Delivery quality — the post-delivery scorecard the platform collected but
   * never surfaced: customer CSAT (delivery ratings), delivery success rate,
   * and COD cash still uncollected. Tenant-scoped, read-only.
   */
  async deliveryQuality(companyId: string) {
    const [byStatus, ratingAgg, byRating, requestedCount, codAgg] = await Promise.all([
      this.prisma.waybill.groupBy({
        by: ['status'],
        where: { companyId },
        _count: { _all: true },
      }),
      this.prisma.waybill.aggregate({
        where: { companyId, customerRating: { not: null } },
        _avg: { customerRating: true },
        _count: { _all: true },
      }),
      this.prisma.waybill.groupBy({
        by: ['customerRating'],
        where: { companyId, customerRating: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.waybill.count({ where: { companyId, ratingRequestedAt: { not: null } } }),
      this.prisma.waybill.aggregate({
        where: { companyId, codAmount: { gt: 0 }, codCollected: false },
        _sum: { codAmount: true },
        _count: { _all: true },
      }),
    ]);

    const sc: Record<string, number> = {};
    for (const r of byStatus) sc[r.status] = r._count._all;
    const delivered = sc.DELIVERED ?? 0;
    const failed = (sc.FAILED_DELIVERY ?? 0) + (sc.RETURNED ?? 0);
    const decided = delivered + failed;

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
    for (const r of byRating) {
      const star = r.customerRating as number | null;
      if (star && star >= 1 && star <= 5) distribution[star] = r._count._all;
    }

    const ratedCount = ratingAgg._count._all;
    const avgRating = ratingAgg._avg.customerRating ?? null;

    return {
      statusCounts: sc,
      delivered,
      deliverySuccessRatePct: decided ? Math.round((delivered / decided) * 1000) / 10 : 0,
      csat: avgRating != null ? Math.round(avgRating * 100) / 100 : null,
      ratedCount,
      ratingRequested: requestedCount,
      ratingResponseRatePct: requestedCount ? Math.round((ratedCount / requestedCount) * 1000) / 10 : null,
      distribution,
      codOutstanding: Math.round(codAgg._sum.codAmount ?? 0),
      codOutstandingCount: codAgg._count._all,
      note:
        'CSAT is the average of customer delivery ratings (1\u20135). Response rate is ratings received vs requested. COD outstanding is cash on delivered parcels the driver has not yet settled.',
    };
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
    return withoutRatingToken(w);
  }

  async create(companyId: string, dto: any) {
    await this.billing.assertCanCreate(companyId, 'waybill');
    const trackingNumber = await this.generateTrackingNumber(companyId);
    const waybill = await this.prisma.waybill.create({
      data: { ...dto, trackingNumber, companyId },
    });

    // ── BOOKING CONFIRMATION — notify recipient their parcel is on the way ──
    void this.notifications.notifyWaybillStatus(waybill);

    return withoutRatingToken(waybill);
  }

  async update(id: string, companyId: string, dto: any) {
    const existing = await this.findOne(id, companyId);
    // Guard the lifecycle transition. Strict by default: an illegal jump is
    // refused BEFORE any write and the refusal is audited, so a scrambled
    // lifecycle is a recorded event rather than a surprise for the customer.
    if (dto.status && dto.status !== existing.status) {
      guardTransition(existing.status, dto.status, {
        waybillId: id, trackingNumber: existing.trackingNumber, actor: 'waybills.update',
      }, (msg) => {
        void this.audit.record({
          action: 'waybill.transition_rejected',
          actorType: 'tenant',
          targetType: 'waybill',
          targetId: id,
          targetName: existing.trackingNumber,
          metadata: { from: existing.status, attempted: dto.status, reason: 'illegal_transition', source: 'waybills.update' },
        });
        throw new BadRequestException(msg);
      });
    }
    // Build the write from an explicit allowlist.
    //
    // The controller accepts `@Body() body: any`, which means the global
    // ValidationPipe has no DTO class to whitelist against and passes the raw
    // JSON through untouched — `whitelist: true` cannot help here. The body
    // was then spread straight into the Prisma update, so a tenant could set
    // fields they do not own: `companyId` (moving the waybill into another
    // tenant), `id`, `createdAt`, `codCollected`, `customerRating`,
    // `ratingToken`. Reading through findOne() scoped the lookup but not the
    // write, so the row was reachable and then arbitrarily writable.
    //
    // Anything not named here is silently ignored rather than written.
    const data: any = {};
    for (const k of WAYBILL_PATCHABLE_FIELDS) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }

    // Compare-and-set on status transitions. guardTransition above proved the
    // jump is legal FROM THE STATUS WE READ; it says nothing about whether
    // that status is still current. Two operators updating the same parcel at
    // once (a warehouse scan and a driver app delivery landing together) would
    // both pass, and the later write would silently win — leaving a waybill in
    // a state nobody chose, a second customer notification already sent, and
    // the Shipment below synced to the wrong status.
    //
    // Pinning the expected current status in the WHERE clause makes the loser
    // fail instead. This is the same pattern assignDriver already uses.
    const isTransition = !!dto.status && dto.status !== existing.status;
    let updated: any;
    if (isTransition) {
      const claimed = await this.prisma.withTenant(companyId, (tx) =>
        tx.waybill.updateMany({
          where: { id, companyId, status: existing.status },
          data,
        }),
      );
      if (claimed.count === 0) {
        throw new ConflictException(
          'This waybill was updated by someone else first — refresh and try again.',
        );
      }
      // Raw row, not findOne(): the notification and Shopify fan-out below
      // need the real columns (findOne redacts ratingToken), and only the
      // value we RETURN is redacted.
      updated = await this.prisma.waybill.findFirst({ where: { id, companyId } });
    } else {
      // Non-status edits still must not escape the tenant.
      const claimed = await this.prisma.withTenant(companyId, (tx) =>
        tx.waybill.updateMany({
          where: { id, companyId },
          data,
        }),
      );
      if (claimed.count === 0) throw new NotFoundException('Waybill not found');
      updated = await this.prisma.waybill.findFirst({ where: { id, companyId } });
    }

    if (isTransition) {
      void this.notifications.notifyWaybillStatus(updated);
      // Fire-and-forget: never let a Shopify push rejection become an
      // unhandledRejection that could crash the process.
      void this.ecommerce.pushStatusToShopify(updated).catch((e) =>
        this.logger.warn(`Shopify status push failed: ${e?.message}`),
      );

      // ── Keep Shipment in sync with Waybill status ─────────────────────
      // The Shipment model has its own status field. When the waybill
      // transitions to DELIVERED, the linked shipment must also advance.
      if (dto.status === 'DELIVERED') {
        await this.prisma.shipment.updateMany({
          where: { waybillId: id, companyId },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
      } else if (dto.status === 'IN_TRANSIT') {
        await this.prisma.shipment.updateMany({
          where: { waybillId: id, companyId },
          data: { status: 'IN_TRANSIT' },
        });
      } else if (dto.status === 'FAILED_DELIVERY') {
        await this.prisma.shipment.updateMany({
          where: { waybillId: id, companyId },
          data: { status: 'FAILED' },
        });
      }
    }
    return withoutRatingToken(updated);
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

    // Get driver details for the dispatch notification
    // Tenant-scoped: the driver being assigned MUST belong to the same company
    // as the waybill (was findUnique by id only → could attach another tenant's
    // driver and leak their name/phone via the dispatch notification).
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, companyId },
      select: {
        id: true, companyId: true, name: true, phone: true, vehicleType: true, vehicleReg: true,
        currentKm: true, nextServiceKm: true, nextServiceDate: true,
      },
    });
    if (!driver) throw new NotFoundException('Driver not found in your company');
    assertFleetDispatchAllowed(driver);

    // ── Compliance gate ──────────────────────────────────────────────────────
    // Manual assignment is a dispatch decision, so it must obey the SAME policy
    // as auto-dispatch. Without this, a non-compliant driver could always be
    // assigned by hand — the single most likely way to bypass the rule.
    await this.compliance.assertDispatchable(driverId, companyId);

    // Terminal/closed waybills cannot receive a driver.
    if (['DELIVERED', 'CANCELLED', 'RETURNED'].includes(waybill.status)) {
      throw new BadRequestException(
        `Waybill ${waybill.trackingNumber} is ${waybill.status} and cannot be assigned`,
      );
    }

    const newStatus: WaybillStatus = waybill.status === 'PENDING' ? 'IN_TRANSIT' : waybill.status;

    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set: only advance the waybill if nobody changed its status
      // between the read above and this write. Concurrent assignment jobs then
      // cannot both "succeed" — the loser gets a clear 409 from the count check.
      const claimed = await tx.waybill.updateMany({
        where: { id: waybillId, companyId, status: waybill.status },
        data: { status: newStatus },
      });
      if (claimed.count === 0) {
        throw new BadRequestException(
          'Waybill status changed while assigning — refresh and try again',
        );
      }

      // Upsert the linked shipment (tenant-scoped on every branch).
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

      // ── DISPATCH NOTIFICATION — notify recipient a driver is on the way ──
      // Fired after the commit (fire-and-forget) so a notification outage can
      // never roll back a valid assignment.
      void this.notifications.notifyDriverDispatched(waybill, driver);

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
    // 'conflict' = the parcel moved between our read and our write, so this
    // scan lost the race and changed nothing. Reported distinctly so a
    // warehouse operator can re-scan rather than assume it applied.
    const results: Array<{
      trackingNumber: string;
      result: 'updated' | 'notFound' | 'unchanged' | 'conflict';
      id?: string;
    }> = [];

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
      // Enforce the lifecycle even on bulk warehouse scans, so a scan cannot
      // jump a parcel to an illegal state (e.g. PENDING → DELIVERED). Refusals
      // are audited per parcel and reported in this batch's result list.
      guardTransition(waybill.status, targetStatus as WaybillStatus, {
        waybillId: waybill.id, trackingNumber: waybill.trackingNumber, actor: 'waybills.batchScan',
      }, (msg) => {
        void this.audit.record({
          action: 'waybill.transition_rejected',
          actorType: 'tenant',
          targetType: 'waybill',
          targetId: waybill.id,
          targetName: waybill.trackingNumber,
          metadata: { from: waybill.status, attempted: targetStatus, reason: 'illegal_transition', source: 'waybills.batchScan' },
        });
        throw new BadRequestException(msg);
      });
      // Compare-and-set, for the same reason as update(): guardTransition
      // validated the jump against a status we read, which a concurrent scan
      // or driver-app delivery may already have moved past. Warehouse
      // handhelds genuinely do scan the same parcel twice.
      const claimed = await this.prisma.withTenant(companyId, (tx) =>
        tx.waybill.updateMany({
          where: { id: waybill.id, companyId, status: waybill.status },
          data: { status: targetStatus as any },
        }),
      );
      if (claimed.count === 0) {
        results.push({ trackingNumber: tn, result: 'conflict', id: waybill.id });
        continue;
      }
      const updated = await this.prisma.waybill.findFirst({
        where: { id: waybill.id, companyId },
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
    // Claim the request rather than just checking the status. Two clicks (or a
    // retry after a slow response) would otherwise each mint a token and each
    // send the customer a rating SMS; the first token would silently stop
    // working. The claim means one token, one message.
    const data = { ratingToken: token, ratingRequestedAt: new Date() };
    const claimed = await this.prisma.withTenant(companyId, (tx) =>
      tx.waybill.updateMany({
        where: { id, companyId, status: 'DELIVERED', ratingToken: null },
        data,
      }),
    );
    if (claimed.count === 0) {
      // Either it moved out of DELIVERED, or a rating was already requested.
      // Read the raw row: findOne() strips ratingToken by design (it is the
      // bearer token for the public rating link), so it cannot answer this
      // question.
      const current = await this.prisma.waybill.findFirst({
        where: { id, companyId },
        select: { status: true, ratingToken: true },
      });
      if (current?.ratingToken) {
        return { success: true, token: current.ratingToken, alreadyRequested: true } as any;
      }
      throw new ConflictException(
        'This waybill changed — refresh and try again.',
      );
    }
    // Raw row: sendRatingRequest builds the customer's rating link from
    // ratingToken, so it must not receive the redacted shape.
    const updated = await this.prisma.waybill.findFirst({ where: { id, companyId } });
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
    dto: { recipient: string; signatureBase64?: string; scannedCodes?: string | string[] },
    file?: Express.Multer.File,
  ) {
    await this.findOne(id, companyId); // existence/tenancy check (throws 404)
    if (!dto || typeof dto.recipient !== 'string' || !dto.recipient.trim() || dto.recipient.length > 200) {
      throw new BadRequestException('A recipient name of 1–200 characters is required');
    }
    if (file) FileUploadValidator.validate(file, { category: 'image', maxSize: 10 * 1024 * 1024 });

    // scannedCodes arrives as a JSON string from multipart form-data.
    let scannedCodes: string[] = [];
    if (dto.scannedCodes !== undefined && dto.scannedCodes !== null && dto.scannedCodes !== '') {
      if (Array.isArray(dto.scannedCodes)) {
        scannedCodes = dto.scannedCodes;
      } else if (typeof dto.scannedCodes === 'string' && dto.scannedCodes.length <= 64 * 1024) {
        try {
          const parsed = JSON.parse(dto.scannedCodes);
          if (!Array.isArray(parsed)) throw new Error('expected an array');
          scannedCodes = parsed;
        } catch {
          throw new BadRequestException('scannedCodes must be a JSON array of strings');
        }
      } else {
        throw new BadRequestException('scannedCodes exceeds the 64 KiB field limit');
      }
      if (scannedCodes.length > 1000 || scannedCodes.some((code) => typeof code !== 'string' || code.length > 256)) {
        throw new BadRequestException('scannedCodes may contain up to 1,000 strings of 256 characters');
      }
    }

    let podSignatureUrl: string | undefined;
    let podImageUrl: string | undefined;

    if (dto.signatureBase64 !== undefined && dto.signatureBase64 !== null && typeof dto.signatureBase64 !== 'string') {
      throw new BadRequestException('Signature must be a PNG base64 string');
    }
    if (dto.signatureBase64) {
      const signature = dto.signatureBase64;
      if (signature.length > 1_400_000 || (signature.startsWith('data:') && !signature.startsWith('data:image/png;base64,'))) {
        throw new BadRequestException('Signature must be a PNG image under 1 MiB');
      }
      const encoded = signature.replace(/^data:image\/png;base64,/, '');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw new BadRequestException('Signature data is invalid');
      }
      const buf = Buffer.from(encoded, 'base64');
      if (buf.length > 1024 * 1024) throw new BadRequestException('Signature must be under 1 MiB');
      FileUploadValidator.validateBuffer(buf, 'image/png', 'image');
      const key = `pod/signatures/${companyId}/${id}.png`;
      await this.storage.upload(key, buf, 'image/png');
      podSignatureUrl = this.storage.publicFileUrl(key);
    }

    if (file) {
      const extensionByMime: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };
      const safeMime = file.mimetype.toLowerCase().split(';', 1)[0].trim();
      const key = `pod/photos/${companyId}/${id}-${uuid()}.${extensionByMime[safeMime]}`;
      await this.storage.upload(key, file.buffer, safeMime);
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
        ...(scannedCodes.length && { podScannedCodes: scannedCodes }),
      },
    });
    // Notify the customer their parcel was delivered + request rating.
    void this.notifications.notifyWaybillStatus(delivered);
    // Fire-and-forget: never let a Shopify push rejection become an
    // unhandledRejection that could crash the process.
    void this.ecommerce.pushStatusToShopify(delivered).catch((e) =>
      this.logger.warn(`Shopify status push failed: ${e?.message}`),
    );
    // Auto-request rating after a short delay would happen via a cron job
    // For now, the dispatcher can trigger it manually via /rate-request
    // The notification fan-out above gets the raw row (it needs the token to
    // build the rating link); only the response is redacted.
    return withoutRatingToken(delivered);
  }

  /**
   * Public POD view — unauthenticated.
   *
   * It used to return recipient name/address, sender name and POD signature and
   * image URLs for ANY waybill id: a customer PII leak. Without the share token
   * it now returns tracking status only; full detail requires the token.
   */
  async getPublicView(id: string, token?: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id },
      select: {
        id: true, trackingNumber: true, status: true,
        ratingToken: true,
        recipientName: true, recipientAddress: true,
        senderName: true, podDeliveredAt: true,
        podSignatureUrl: true, podImageUrl: true, podRecipient: true,
        company: { select: { name: true, logoUrl: true, primaryColor: true } },
      },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');

    const { ratingToken, ...rest } = waybill;
    if (token && ratingToken && token === ratingToken) return rest;

    return {
      id: rest.id,
      trackingNumber: rest.trackingNumber,
      status: rest.status,
      podDeliveredAt: rest.podDeliveredAt,
      company: rest.company,
      restricted: true,
      message: 'Proof of delivery detail requires the share token from your delivery link.',
    };
  }

  async getReceipt(id: string, companyId: string) {
    const waybill = await this.findOne(id, companyId);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, brandName: true, phone: true, email: true, address: true, city: true, country: true },
    });

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const M = 48; const W = 595;
    const brand = (company as any)?.brandName || company?.name || 'FlowOps';

    // Header
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#0b1530').text('WAYBILL RECEIPT', M, M);
    doc.font('Helvetica').fontSize(10).fillColor('#555')
      .text(brand, M, M + 26)
      .text([company?.address, company?.city, company?.country].filter(Boolean).join(', ') || '', M, M + 40)
      .text([company?.phone, company?.email].filter(Boolean).join(' · ') || '', M, M + 54);
    doc.moveTo(M, M + 72).lineTo(W - M, M + 72).strokeColor('#ddd').stroke();
    doc.y = M + 84;

    // Tracking
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0b1530')
      .text(`Tracking #: ${waybill.trackingNumber}`, M, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#333')
      .text(`Status: ${waybill.status.replace(/_/g, ' ')}    Created: ${new Date(waybill.createdAt).toLocaleDateString('en-ZA')}`);
    doc.moveDown(0.8);

    // Sender
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0b1530').text('FROM (Sender)');
    doc.font('Helvetica').fontSize(9).fillColor('#333')
      .text(waybill.senderName).text(`${waybill.senderPhone}${waybill.senderEmail ? ' · ' + waybill.senderEmail : ''}`).text(waybill.senderAddress);
    doc.moveDown(0.6);

    // Receiver
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0b1530').text('TO (Recipient)');
    doc.font('Helvetica').fontSize(9).fillColor('#333')
      .text(waybill.recipientName).text(`${waybill.recipientPhone}${waybill.recipientEmail ? ' · ' + waybill.recipientEmail : ''}`).text(waybill.recipientAddress);
    doc.moveDown(0.8);

    // Parcel
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0b1530').text('PARCEL DETAILS');
    doc.font('Helvetica').fontSize(9).fillColor('#333');
    if (waybill.description) doc.text(`Description: ${waybill.description}`);
    if (waybill.weight) doc.text(`Weight: ${waybill.weight} kg`);
    if (waybill.dimensions) doc.text(`Dimensions: ${waybill.dimensions}`);
    if (waybill.totalAmount) doc.text(`Declared value: ZAR ${waybill.totalAmount.toFixed(2)}`);
    if (waybill.codAmount) doc.text(`COD amount: ZAR ${waybill.codAmount.toFixed(2)}`);
    doc.moveDown(0.8);

    // POD
    if (waybill.podDeliveredAt || waybill.podRecipient) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0b1530').text('PROOF OF DELIVERY');
      doc.font('Helvetica').fontSize(9).fillColor('#333');
      if (waybill.podRecipient) doc.text(`Received by: ${waybill.podRecipient}`);
      if (waybill.podDeliveredAt) doc.text(`Delivered: ${new Date(waybill.podDeliveredAt).toLocaleString('en-ZA')}`);
      doc.moveDown(0.8);
    }

    // Footer
    doc.font('Helvetica').fontSize(8).fillColor('#999')
      .text(`Generated by ${brand} · ${new Date().toLocaleDateString('en-ZA')}`, M, 750)
      .text('System-generated receipt. For queries contact the operator above.', M, 762);

    doc.end();
    const buffer = await done;
    return { buffer, filename: `receipt-${waybill.trackingNumber}.pdf`, contentType: 'application/pdf' };
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
    FileUploadValidator.validate(file, { category: 'document', maxSize: 10 * 1024 * 1024 });
    const safeMime = file.mimetype.toLowerCase().split(';', 1)[0].trim();
    const extensionByMime: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/tiff': 'tiff',
    };
    const key = `waybills/inbox/${companyId}/${uuid()}.${extensionByMime[safeMime]}`;

    await this.storage.upload(key, file.buffer, safeMime);
    const fileUrl = this.storage.publicFileUrl(key);

    // Create inbox item in EXTRACTING state
    const item = await this.prisma.waybillInboxItem.create({
      data: { companyId, fileUrl, fileKey: key, mimeType: file.mimetype, status: 'EXTRACTING' },
    });

    // AI extraction — uses Groq Vision (llama-3.2-90b-vision) to extract waybill fields
    await this.aiExtract(item.id, fileUrl);

    // The item was created in this method for this company, but re-read it WITH the
    // companyId: the row has been through aiExtract since, and a by-id re-read is
    // exactly the shape that lets one tenant's id resolve another tenant's row.
    const ready = await this.prisma.waybillInboxItem.findFirst({
      where: { id: item.id, companyId },
    });

    // Live-refresh the Waybill Inbox UI (frontend listens for these).
    this.safeEmit(() => this.gateway.emitWaybillInboxChanged(companyId, ready));
    this.safeEmit(() => this.gateway.emitInboxItemStatus(companyId, item.id, ready?.status ?? 'READY'));

    return ready;
  }

  private async aiExtract(itemId: string, fileUrl?: string) {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey || !fileUrl) {
      // Fallback: mark as READY with empty fields so operator can fill manually
      await this.prisma.waybillInboxItem.update({
        where: { id: itemId },
        data: { status: 'READY', aiConfidence: 0, extractedData: { _note: 'AI extraction unavailable — fill fields manually', senderName: '', senderPhone: '', senderAddress: '', recipientName: '', recipientPhone: '', recipientAddress: '' } },
      });
      return;
    }

    try {
      const prompt = `You are an AI that extracts waybill/shipping document data from images. Extract these fields from the document image:
- senderName, senderPhone, senderAddress, senderEmail
- recipientName, recipientPhone, recipientAddress, recipientEmail
- weight (kg), dimensions, description, totalAmount, codAmount
- trackingNumber/reference (if visible)

Return ONLY valid JSON: { senderName, senderPhone, senderAddress, senderEmail, recipientName, recipientPhone, recipientAddress, recipientEmail, weight, dimensions, description, totalAmount, codAmount, reference, confidence }
Set confidence 0.0-1.0 based on how clearly you could read the document. Use null for fields you cannot determine.`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'llama-3.2-90b-vision-preview',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: fileUrl } },
            ],
          }],
          temperature: 0.1,
          max_tokens: 800,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        this.logger.warn(`Groq Vision API error ${res.status} — falling back to manual entry`);
        await this.prisma.waybillInboxItem.update({
          where: { id: itemId },
          data: { status: 'READY', aiConfidence: 0, aiError: `API error: ${res.status}`, extractedData: { _note: 'AI extraction failed — fill fields manually', senderName: '', senderPhone: '', senderAddress: '', recipientName: '', recipientPhone: '', recipientAddress: '' } },
        });
        return;
      }

      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      const extracted = content ? JSON.parse(content) : null;

      if (!extracted) {
        await this.prisma.waybillInboxItem.update({
          where: { id: itemId },
          data: { status: 'READY', aiConfidence: 0, extractedData: { _note: 'AI returned no data', senderName: '', senderPhone: '', senderAddress: '', recipientName: '', recipientPhone: '', recipientAddress: '' } },
        });
        return;
      }

      const confidence = typeof extracted.confidence === 'number' ? extracted.confidence : 0.75;

      await this.prisma.waybillInboxItem.update({
        where: { id: itemId },
        data: {
          status: 'READY',
          aiConfidence: confidence,
          extractedData: { ...extracted, confidence },
        },
      });

      this.logger.log(`AI extracted waybill fields (confidence: ${confidence}) for item ${itemId}`);
    } catch (err: any) {
      this.logger.warn(`AI extraction failed: ${err?.message} — falling back to manual`);
      await this.prisma.waybillInboxItem.update({
        where: { id: itemId },
        data: { status: 'READY', aiConfidence: 0, aiError: err?.message, extractedData: { _note: 'AI extraction error — fill fields manually', senderName: '', senderPhone: '', senderAddress: '', recipientName: '', recipientPhone: '', recipientAddress: '' } },
      });
    }
  }

  /** @deprecated — replaced by aiExtract */
  private async stubExtract(itemId: string) {
    await this.aiExtract(itemId);
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

    // Claim the item BEFORE creating the waybill, not after.
    //
    // The old order read READY, created the waybill, then wrote COMMITTED.
    // Two people committing the same scanned document would both pass the
    // read and both create — one invoiceable waybill each, from one piece of
    // paper. The pre-check cannot see that; the WHERE clause can.
    //
    // Claiming first means a failure in create() would leave the item stuck
    // COMMITTED with nothing behind it, so that is rolled back rather than
    // left as a hole in the queue.
    await claimTransition(
      () =>
        this.prisma.withTenant(companyId, (tx) =>
          tx.waybillInboxItem.updateMany({
            where: { id: itemId, companyId, status: 'READY' },
            data: { status: 'COMMITTED' },
          }),
        ),
      'This inbox item was already committed by someone else.',
    );

    let waybill: any;
    try {
      waybill = await this.create(companyId, waybillData);
    } catch (e) {
      // Put the item back so the queue is not silently missing it. The caller
      // sees the original error, not this rollback.
      await this.prisma.waybillInboxItem
        .updateMany({ where: { id: itemId, companyId, status: 'COMMITTED' }, data: { status: 'READY' } })
        .catch(() => undefined);
      throw e;
    }

    await this.prisma.waybillInboxItem.update({
      where: { id: itemId },
      data: { waybillId: waybill.id },
    });

    // Live-refresh the inbox: item leaves the queue, new waybill appears.
    this.safeEmit(() => this.gateway.emitInboxItemStatus(companyId, itemId, 'COMMITTED'));
    this.safeEmit(() => this.gateway.emitWaybillInboxChanged(companyId, { id: itemId, status: 'COMMITTED', waybillId: waybill.id }));

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

  /**
   * Bulk import waybills from a CSV file.
   * Expected columns: senderName, senderPhone, senderAddress, recipientName,
   * recipientPhone, recipientAddress, recipientEmail, weight, description,
   * codAmount, totalAmount
   */
  async bulkImportCsv(companyId: string, file: Express.Multer.File) {
    FileUploadValidator.validate(file, { category: 'csv', maxSize: 5 * 1024 * 1024 });

    const content = file.buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length > 20_001) {
      throw new BadRequestException('CSV exceeds the 20,000-row import limit');
    }
    if (lines.some((line) => line.length > 64 * 1024)) {
      throw new BadRequestException('CSV contains a row that exceeds the 64 KiB limit');
    }
    if (lines.length < 2) {
      throw new BadRequestException('CSV must have a header row and at least one data row');
    }

    const headers = this.parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
    const results: Array<{
      row: number;
      status: 'created' | 'failed' | 'duplicate';
      trackingNumber?: string;
      error?: string;
      recipientName?: string;
    }> = [];

    // Map common header variations
    const colMap = this.buildColumnMap(headers);

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      if (values.every((v) => !v.trim())) continue; // skip empty rows

      try {
        const dto = this.mapRowToWaybill(values, colMap);

        // Validate required fields
        if (!dto.senderName || !dto.senderPhone || !dto.senderAddress) {
          results.push({ row: i + 1, status: 'failed', error: 'Missing sender details (name, phone, address)', recipientName: dto.recipientName });
          continue;
        }
        if (!dto.recipientName || !dto.recipientPhone || !dto.recipientAddress) {
          results.push({ row: i + 1, status: 'failed', error: 'Missing recipient details (name, phone, address)', recipientName: dto.recipientName });
          continue;
        }

        // Check plan limits
        await this.billing.assertCanCreate(companyId, 'waybill');

        const trackingNumber = await this.generateTrackingNumber(companyId);
        await this.prisma.waybill.create({
          data: { ...dto, trackingNumber, companyId },
        });

        results.push({ row: i + 1, status: 'created', trackingNumber, recipientName: dto.recipientName });
      } catch (err: any) {
        const msg = err?.message || 'Unknown error';
        if (msg.includes('Unique constraint') || msg.includes('already exists')) {
          results.push({ row: i + 1, status: 'duplicate', error: 'Duplicate entry', recipientName: values[colMap.recipientname ?? 0] });
        } else {
          results.push({ row: i + 1, status: 'failed', error: msg, recipientName: values[colMap.recipientname ?? 0] });
        }
      }
    }

    return {
      totalRows: lines.length - 1,
      created: results.filter((r) => r.status === 'created').length,
      failed: results.filter((r) => r.status === 'failed').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      results,
    };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += char;
    }
    result.push(current.trim());
    return result;
  }

  private buildColumnMap(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    const aliases: Record<string, string[]> = {
      sendername: ['sendername', 'sender', 'from', 'fromname', 'sender_name'],
      senderphone: ['senderphone', 'sendertel', 'sender_phone', 'fromphone'],
      senderaddress: ['senderaddress', 'sender_address', 'fromaddress', 'pickup', 'pickupaddress'],
      recipientname: ['recipientname', 'recipient', 'to', 'toname', 'receiver', 'recipient_name'],
      recipientphone: ['recipientphone', 'recipienttel', 'recipient_phone', 'tophone', 'receiverphone'],
      recipientaddress: ['recipientaddress', 'recipient_address', 'toaddress', 'delivery', 'deliveryaddress', 'dropoff'],
      recipientemail: ['recipientemail', 'recipient_email', 'toemail', 'email'],
      weight: ['weight', 'kg', 'weightkg', 'mass'],
      description: ['description', 'desc', 'contents', 'items', 'parcel'],
      codamount: ['codamount', 'cod', 'cashondelivery', 'cod_amount', 'codvalue'],
      totalamount: ['totalamount', 'total', 'amount', 'value', 'total_amount'],
      dimensions: ['dimensions', 'dims', 'size'],
    };

    for (const [field, names] of Object.entries(aliases)) {
      const idx = headers.findIndex((h) => names.includes(h));
      if (idx !== -1) map[field] = idx;
    }
    return map;
  }

  private mapRowToWaybill(values: string[], colMap: Record<string, number>): any {
    const get = (key: string) => {
      const idx = colMap[key];
      return idx !== undefined && idx < values.length ? values[idx] || undefined : undefined;
    };
    const num = (key: string) => {
      const v = get(key);
      return v ? parseFloat(v) || undefined : undefined;
    };

    return {
      senderName: get('sendername') || '',
      senderPhone: get('senderphone') || '',
      senderAddress: get('senderaddress') || '',
      recipientName: get('recipientname') || '',
      recipientPhone: get('recipientphone') || '',
      recipientAddress: get('recipientaddress') || '',
      recipientEmail: get('recipientemail'),
      weight: num('weight'),
      description: get('description'),
      codAmount: num('codamount'),
      totalAmount: num('totalamount'),
      dimensions: get('dimensions'),
    };
  }
}
