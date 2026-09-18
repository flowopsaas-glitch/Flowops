import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { guardTransition } from '../waybills/waybill-status.machine';
import { WaybillStatus, FailedDeliveryReason } from '@prisma/client';

/** Valid failed-delivery reason codes, mirrored from the Prisma enum for
 *  runtime validation of client-supplied codes. */
export const FAILED_DELIVERY_REASONS: readonly string[] = [
  'CUSTOMER_NOT_HOME', 'CUSTOMER_REFUSED', 'INCORRECT_ADDRESS', 'ADDRESS_NOT_FOUND',
  'ACCESS_RESTRICTED', 'BUSINESS_CLOSED', 'NO_SAFE_DROP_LOCATION', 'COD_PAYMENT_UNAVAILABLE',
  'DAMAGED_IN_TRANSIT', 'WEATHER_OR_HAZARD', 'VEHICLE_BREAKDOWN', 'OUTSIDE_DELIVERY_WINDOW', 'OTHER',
];

/**
 * Logistics Operations Service — World-Class Features
 *
 * Handles:
 *  1. 3-Signature Chain of Custody (sender + driver + receiver)
 *  2. Delivery Attempts (3x retry with auto-schedule)
 *  3. Address Book (saved addresses for quick-fill)
 *  4. Multi-Leg Tracking Timeline (granular journey visibility)
 *  5. Hub status transitions (AT_ORIGIN_HUB / AT_DESTINATION_HUB)
 *  6. Auto-reassign on branch receive
 */
@Injectable()
export class LogisticsOpsService {
  private readonly logger = new Logger('LogisticsOps');

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // 1. PROOF OF COLLECTION (3-Signature Chain)
  // ══════════════════════════════════════════════════════════════════════════

  async captureProofOfCollection(waybillId: string, companyId: string, dto: {
    senderSignatureBase64?: string;
    senderName?: string;
    driverSignatureBase64?: string;
    collectionPhotoBase64?: string;
  }) {
    const wb = await this.prisma.waybill.findFirst({ where: { id: waybillId, companyId } });
    if (!wb) throw new NotFoundException('Waybill not found');

    const data: any = { pocCollectedAt: new Date() };

    if (dto.senderName) data.pocSenderName = dto.senderName;

    // Store signatures as data URLs (in production, upload to R2/S3)
    if (dto.senderSignatureBase64) data.pocSenderSignatureUrl = dto.senderSignatureBase64;
    if (dto.driverSignatureBase64) data.pocDriverSignatureUrl = dto.driverSignatureBase64;
    if (dto.collectionPhotoBase64) data.pocCollectionPhotoUrl = dto.collectionPhotoBase64;

    // Advance status to COLLECTED if still PENDING
    if (wb.status === 'PENDING') data.status = 'COLLECTED';

    const updated = await this.prisma.waybill.update({ where: { id: waybillId }, data });

    // Record tracking event
    await this.createEvent(waybillId, companyId, {
      event: 'COLLECTED',
      status: 'COLLECTED',
      description: `Parcel collected from ${dto.senderName ?? wb.senderName}. Sender signed. Driver acknowledged.`,
      actorType: 'DRIVER',
    });

    this.logger.log(`POC captured for ${wb.trackingNumber}: sender=${dto.senderName ?? 'n/a'}`);
    return updated;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. DELIVERY ATTEMPTS (3x retry)
  // ══════════════════════════════════════════════════════════════════════════

  async recordFailedAttempt(
    waybillId: string,
    companyId: string,
    dto: { reason: string; reasonCode?: string; rescheduleHours?: number },
  ) {
    const wb = await this.prisma.waybill.findFirst({ where: { id: waybillId, companyId } });
    if (!wb) throw new NotFoundException('Waybill not found');

    // Structured reason code (for analytics), validated against the enum.
    // Free-text `reason` remains for driver detail; if a code is supplied it
    // must be valid, otherwise we fall back to OTHER rather than reject.
    const reasonCode = this.normaliseFailReason(dto.reasonCode);

    const newAttemptCount = (wb.attemptCount ?? 0) + 1;
    const maxAttempts = wb.maxAttempts ?? 3;
    const exhausted = newAttemptCount >= maxAttempts;

    const rescheduleMs = (dto.rescheduleHours ?? 24) * 60 * 60 * 1000;
    const nextAttemptAt = exhausted ? null : new Date(Date.now() + rescheduleMs);

    const data: any = {
      attemptCount: newAttemptCount,
      lastAttemptNote: dto.reason,
      lastAttemptReasonCode: reasonCode,
      status: exhausted ? 'RETURNED' : 'FAILED_DELIVERY',
      returnToSender: exhausted,
      nextAttemptAt,
    };

    const updated = await this.prisma.waybill.update({ where: { id: waybillId }, data });

    // Record tracking event
    const desc = exhausted
      ? `Delivery attempt ${newAttemptCount}/${maxAttempts} failed: ${dto.reason}. Max attempts reached — returning to sender.`
      : `Delivery attempt ${newAttemptCount}/${maxAttempts} failed: ${dto.reason}. Next attempt scheduled.`;

    await this.createEvent(waybillId, companyId, {
      event: exhausted ? 'RETURNED' : 'FAILED',
      status: data.status,
      description: desc,
      actorType: 'DRIVER',
      metadata: { attemptNumber: newAttemptCount, reason: dto.reason, reasonCode, nextAttemptAt },
    });

    // Notify recipient about failed attempt
    void this.notifications.notifyWaybillStatus(updated);

    // If exhausted, notify sender that parcel is being returned
    if (exhausted) {
      await this.prisma.notification.create({
        data: {
          companyId,
          title: '📦 Parcel returning to sender',
          body: `${wb.trackingNumber} — ${maxAttempts} delivery attempts failed (${dto.reason}). Returning to sender.`,
          type: 'STATUS_UPDATE',
        },
      }).catch(() => {});
    }

    this.logger.log(`Failed attempt ${newAttemptCount}/${maxAttempts} for ${wb.trackingNumber}: [${reasonCode}] ${dto.reason}`);
    return { ...updated, exhausted, nextAttemptAt, reasonCode };
  }

  /** Coerce a client-supplied reason code to a valid FailedDeliveryReason.
   *  Unknown/blank → OTHER (never rejects the failed-attempt record). */
  private normaliseFailReason(code?: string): FailedDeliveryReason {
    if (!code) return 'OTHER' as FailedDeliveryReason;
    const upper = String(code).toUpperCase().trim();
    return (FAILED_DELIVERY_REASONS as readonly string[]).includes(upper)
      ? (upper as FailedDeliveryReason)
      : ('OTHER' as FailedDeliveryReason);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. ADDRESS BOOK
  // ══════════════════════════════════════════════════════════════════════════

  async getAddressBook(companyId: string, type?: string) {
    const where: any = { companyId, isActive: true };
    if (type && type !== 'ALL') where.type = type;
    return this.prisma.addressBookEntry.findMany({
      where,
      orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
      take: 200,
    });
  }

  async createAddress(companyId: string, dto: any) {
    return this.prisma.addressBookEntry.create({
      data: { ...dto, companyId },
    });
  }

  async updateAddress(id: string, companyId: string, dto: any) {
    return this.prisma.addressBookEntry.update({ where: { id }, data: dto });
  }

  async deleteAddress(id: string, companyId: string) {
    return this.prisma.addressBookEntry.update({ where: { id }, data: { isActive: false } });
  }

  /** Increment usage count when an address is used (call from waybill/collection creation) */
  async markAddressUsed(id: string) {
    return this.prisma.addressBookEntry.update({
      where: { id },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    }).catch(() => {}); // best-effort
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. MULTI-LEG TRACKING TIMELINE
  // ══════════════════════════════════════════════════════════════════════════

  async getTrackingTimeline(trackingNumber: string) {
    const wb = await this.prisma.waybill.findFirst({
      where: { trackingNumber },
      select: {
        id: true, trackingNumber: true, status: true,
        senderName: true, recipientName: true, recipientAddress: true,
        podRecipient: true, podDeliveredAt: true,
        pocSenderName: true, pocCollectedAt: true,
        attemptCount: true, maxAttempts: true, returnToSender: true,
        createdAt: true, updatedAt: true, companyId: true,
      },
    });
    if (!wb) throw new NotFoundException('Waybill not found');

    const events = await this.prisma.trackingEvent.findMany({
      where: { waybillId: wb.id },
      orderBy: { createdAt: 'asc' },
    });

    return {
      trackingNumber: wb.trackingNumber,
      currentStatus: wb.status,
      sender: wb.senderName,
      recipient: wb.recipientName,
      recipientAddress: wb.recipientAddress,
      createdAt: wb.createdAt,
      deliveredAt: wb.podDeliveredAt,
      collectedAt: wb.pocCollectedAt,
      attemptCount: wb.attemptCount,
      maxAttempts: wb.maxAttempts,
      returnToSender: wb.returnToSender,
      timeline: events.map(e => ({
        event: e.event,
        status: e.status,
        description: e.description,
        location: e.location,
        actor: e.actorName,
        timestamp: e.createdAt,
        metadata: e.metadata,
      })),
    };
  }

  async recordTrackingEvent(waybillId: string, companyId: string, dto: {
    event: string;
    location?: string;
    description?: string;
    lat?: number;
    lng?: number;
  }, user?: any) {
    const wb = await this.prisma.waybill.findFirst({ where: { id: waybillId, companyId } });
    if (!wb) throw new NotFoundException('Waybill not found');

    return this.createEvent(waybillId, companyId, {
      ...dto,
      description: dto.description ?? `${dto.event} at ${dto.location ?? 'unknown location'}`,
      actorType: 'DISPATCH',
      actorId: user?.id,
      actorName: user?.name,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. HUB STATUS TRANSITIONS + AUTO-REASSIGN
  // ══════════════════════════════════════════════════════════════════════════

  async transitionToHub(waybillId: string, companyId: string, status: string, location?: string, user?: any) {
    const wb = await this.prisma.waybill.findFirst({ where: { id: waybillId, companyId } });
    if (!wb) throw new NotFoundException('Waybill not found');

    // Chain of custody: a hub receive is a real lifecycle transition. Guard it
    // against the state machine (log-only until strict mode is enabled).
    guardTransition(wb.status, status as WaybillStatus, {
      waybillId, trackingNumber: wb.trackingNumber, actor: user?.name ?? 'warehouse',
    }, (msg) => { throw new BadRequestException(msg); });

    await this.prisma.waybill.update({ where: { id: waybillId }, data: { status: status as any } });

    const desc = status === 'AT_ORIGIN_HUB'
      ? `Parcel scanned into ${location ?? 'origin hub'}. Awaiting sorting and dispatch.`
      : `Parcel arrived at ${location ?? 'destination hub'}. Ready for last-mile assignment.`;

    await this.createEvent(waybillId, companyId, {
      event: status === 'AT_ORIGIN_HUB' ? 'SCANNED_IN' : 'ARRIVED',
      status,
      description: desc,
      location,
      actorType: user ? 'WAREHOUSE' : 'SYSTEM',
      actorId: user?.id,
      actorName: user?.name,
    });

    // AUTO-REASSIGN: If arriving at destination hub, find nearest available driver
    if (status === 'AT_DESTINATION_HUB') {
      await this.autoReassignAtDestination(waybillId, companyId, location);
    }

    return { success: true, status, waybillId };
  }

  /**
   * pendingHubReceive — the warehouse clerk's inbound worklist: parcels that
   * have been COLLECTED (a driver picked them up) but not yet received/checked
   * into the depot. These are the parcels waiting on AT_ORIGIN_HUB scan-in.
   */
  async pendingHubReceive(companyId: string) {
    const rows = await this.prisma.waybill.findMany({
      where: { companyId, status: 'COLLECTED' },
      orderBy: { updatedAt: 'asc' },
      take: 200,
      select: {
        id: true, trackingNumber: true, senderName: true, senderAddress: true,
        recipientName: true, recipientAddress: true, description: true, updatedAt: true,
      },
    });
    return { count: rows.length, waybills: rows };
  }

  /**
   * receiveAtHub — warehouse clerk checks a batch of parcels into the origin
   * depot. Accepts tracking numbers OR waybill ids. Each parcel is guarded and
   * transitioned COLLECTED → AT_ORIGIN_HUB with a WAREHOUSE audit event.
   * Returns a per-parcel result so the clerk sees exactly what was received,
   * what was already in, and what wasn't found.
   */
  async receiveAtHub(companyId: string, refs: string[], location?: string, user?: any) {
    const received: string[] = [];
    const already: string[] = [];
    const notFound: string[] = [];
    const rejected: { ref: string; reason: string }[] = [];

    for (const rawRef of refs ?? []) {
      const ref = String(rawRef ?? '').trim();
      if (!ref) continue;
      const wb = await this.prisma.waybill.findFirst({
        where: { companyId, OR: [{ id: ref }, { trackingNumber: ref }] },
        select: { id: true, trackingNumber: true, status: true },
      });
      if (!wb) { notFound.push(ref); continue; }
      if (wb.status === 'AT_ORIGIN_HUB') { already.push(wb.trackingNumber); continue; }
      try {
        await this.transitionToHub(wb.id, companyId, 'AT_ORIGIN_HUB', location, user);
        received.push(wb.trackingNumber);
      } catch (err: any) {
        rejected.push({ ref: wb.trackingNumber, reason: err?.message ?? 'transition rejected' });
      }
    }

    return {
      success: true,
      receivedCount: received.length,
      received, already, notFound, rejected,
      message: `Received ${received.length} parcel(s) into ${location ?? 'the depot'}.`,
    };
  }

  /**
   * Auto-reassign: When a waybill arrives at the destination hub,
   * find the nearest available driver at that branch and assign them.
   */
  private async autoReassignAtDestination(waybillId: string, companyId: string, location?: string) {
    try {
      // Find available drivers at this company (ideally filter by branch — using all for now)
      const drivers = await this.prisma.driver.findMany({
        where: { companyId, isActive: true, status: 'AVAILABLE' },
        orderBy: { lastSeen: 'desc' }, // Most recently active first
        take: 1,
      });

      if (drivers.length === 0) {
        this.logger.log(`No available drivers for auto-reassign on waybill ${waybillId}`);
        return;
      }

      const driver = drivers[0];

      // Create/update shipment with new driver
      const existing = await this.prisma.shipment.findFirst({ where: { waybillId, companyId } });
      if (existing) {
        await this.prisma.shipment.update({
          where: { id: existing.id },
          data: { driverId: driver.id, status: 'PENDING' },
        });
      } else {
        await this.prisma.shipment.create({
          data: { waybillId, companyId, driverId: driver.id, status: 'PENDING' },
        });
      }

      await this.createEvent(waybillId, companyId, {
        event: 'AUTO_ASSIGNED',
        status: 'AT_DESTINATION_HUB',
        description: `AI auto-assigned to driver ${driver.name} for last-mile delivery.`,
        location,
        actorType: 'SYSTEM',
        actorName: 'FlowOps AI',
      });

      this.logger.log(`Auto-reassigned waybill ${waybillId} to driver ${driver.name} at destination hub`);
    } catch (err: any) {
      this.logger.warn(`Auto-reassign failed (non-blocking): ${err?.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private async createEvent(waybillId: string, companyId: string, data: {
    event: string;
    status?: string;
    description: string;
    location?: string;
    lat?: number;
    lng?: number;
    actorType?: string;
    actorId?: string;
    actorName?: string;
    metadata?: any;
  }) {
    return this.prisma.trackingEvent.create({
      data: { waybillId, companyId, ...data },
    }).catch((err) => {
      this.logger.warn(`Failed to create tracking event: ${err?.message}`);
    });
  }
}
