import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DriverComplianceService } from '../common/compliance/driver-compliance.service';
import { guardTransition, isLegalTransition } from '../waybills/waybill-status.machine';
import { WaybillStatus, FailedDeliveryReason } from '@prisma/client';
import { withCompanyId } from '../common/security/tenant.util';

/** Valid failed-delivery reason codes, mirrored from the Prisma enum for
 *  runtime validation of client-supplied codes. */
export const FAILED_DELIVERY_REASONS: readonly string[] = [
  'CUSTOMER_NOT_HOME', 'CUSTOMER_REFUSED', 'INCORRECT_ADDRESS', 'ADDRESS_NOT_FOUND',
  'ACCESS_RESTRICTED', 'BUSINESS_CLOSED', 'NO_SAFE_DROP_LOCATION', 'COD_PAYMENT_UNAVAILABLE',
  'DAMAGED_IN_TRANSIT', 'WEATHER_OR_HAZARD', 'VEHICLE_BREAKDOWN', 'OUTSIDE_DELIVERY_WINDOW', 'OTHER',
];

const EXCEPTION_ACTIONS = ['REVIEWED', 'ESCALATION_STARTED', 'REATTEMPT_CONFIRMED', 'RETURN_CONFIRMED'] as const;
type ExceptionAction = typeof EXCEPTION_ACTIONS[number];

/** Hub intake/arrival are the only transitions this service may perform. */
const HUB_TARGET_STATUSES: readonly WaybillStatus[] = ['AT_ORIGIN_HUB', 'AT_DESTINATION_HUB'];

/** A failed attempt may only be recorded while the parcel is still deliverable. */
const ATTEMPTABLE_STATUSES: readonly string[] = [
  'OUT_FOR_DELIVERY', 'IN_TRANSIT', 'AT_DESTINATION_HUB', 'AT_ORIGIN_HUB',
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
 *
 * State-transition rules for hub flows (hardened):
 *  - only AT_ORIGIN_HUB / AT_DESTINATION_HUB may be requested here;
 *  - the transition must be legal for the current status (strict — an illegal
 *    transition is rejected AND audited, never applied);
 *  - the write is a compare-and-set on the current status, so two concurrent
 *    scans cannot both win and the timeline can never run backwards;
 *  - every tenant-scoped read/write carries companyId.
 */
@Injectable()
export class LogisticsOpsService {
  private readonly logger = new Logger('LogisticsOps');

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private compliance: DriverComplianceService,
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

    if (!['PENDING', 'COLLECTED'].includes(wb.status)) {
      throw new BadRequestException(
        `Proof of collection can only be captured while the parcel is PENDING/COLLECTED (current: ${wb.status}).`,
      );
    }

    const data: any = { pocCollectedAt: wb.pocCollectedAt ?? new Date() };
    if (dto.senderName) data.pocSenderName = dto.senderName;
    if (dto.senderSignatureBase64) data.pocSenderSignatureUrl = dto.senderSignatureBase64;
    if (dto.driverSignatureBase64) data.pocDriverSignatureUrl = dto.driverSignatureBase64;
    if (dto.collectionPhotoBase64) data.pocCollectionPhotoUrl = dto.collectionPhotoBase64;

    // Advance status to COLLECTED if still PENDING (through the state machine).
    const advancing = wb.status === 'PENDING';
    if (advancing) {
      this.assertLegalTransition(wb.status, 'COLLECTED', wb, 'proof-of-collection');
      data.status = 'COLLECTED';
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set on the status we validated, so a concurrent transition
      // cannot be silently overwritten (the POC fields still get written).
      const claimed = await tx.waybill.updateMany({
        where: { id: waybillId, companyId, status: wb.status },
        data,
      });
      if (claimed.count === 0) {
        throw new ConflictException('Waybill status changed while capturing proof of collection — refresh');
      }
      const fresh = await tx.waybill.findFirstOrThrow({ where: { id: waybillId, companyId } });
      await tx.trackingEvent.create({
        data: {
          waybillId,
          companyId,
          event: advancing ? 'COLLECTED' : 'POC_CAPTURED',
          status: fresh.status,
          description: `Parcel collected from ${dto.senderName ?? wb.senderName ?? 'sender'}. Sender signed. Driver acknowledged.`,
          actorType: 'DRIVER',
        },
      });
      return fresh;
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

    if (!ATTEMPTABLE_STATUSES.includes(wb.status)) {
      throw new BadRequestException(
        `A failed attempt cannot be recorded for a waybill in status ${wb.status}.`,
      );
    }
    if (!dto?.reason || !String(dto.reason).trim()) {
      throw new BadRequestException('A reason is required for a failed delivery attempt');
    }

    // Structured reason code (for analytics), validated against the enum.
    const reasonCode = this.normaliseFailReason(dto.reasonCode);

    const attemptCount = wb.attemptCount ?? 0;
    const newAttemptCount = attemptCount + 1;
    const maxAttempts = wb.maxAttempts ?? 3;
    const exhausted = newAttemptCount >= maxAttempts;

    const rescheduleHours = Number(dto.rescheduleHours ?? 24);
    if (!Number.isFinite(rescheduleHours) || rescheduleHours < 0) {
      throw new BadRequestException('rescheduleHours must be a non-negative number');
    }
    const nextAttemptAt = exhausted ? null : new Date(Date.now() + rescheduleHours * 3_600_000);

    const newStatus: WaybillStatus = exhausted ? 'RETURNED' : 'FAILED_DELIVERY';
    this.assertLegalTransition(wb.status, newStatus, wb, 'failed-attempt');

    const data: any = {
      attemptCount: newAttemptCount,
      lastAttemptNote: dto.reason,
      lastAttemptReasonCode: reasonCode,
      status: newStatus,
      returnToSender: exhausted,
      nextAttemptAt,
    };

    const desc = exhausted
      ? `Delivery attempt ${newAttemptCount}/${maxAttempts} failed: ${dto.reason}. Max attempts reached — returning to sender.`
      : `Delivery attempt ${newAttemptCount}/${maxAttempts} failed: ${dto.reason}. Next attempt scheduled.`;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Optimistic concurrency on attemptCount: two drivers tapping "failed"
      // at once must not both increment from the same base. The loser retries
      // against fresh state instead of double-counting an attempt.
      const claimed = await tx.waybill.updateMany({
        where: {
          id: waybillId,
          companyId,
          attemptCount: wb.attemptCount,
          status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] },
        },
        data,
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          'Another delivery attempt was recorded concurrently — refresh and try again',
        );
      }

      await tx.trackingEvent.create({
        data: {
          waybillId,
          companyId,
          event: exhausted ? 'RETURNED' : 'FAILED',
          status: newStatus,
          description: desc,
          actorType: 'DRIVER',
          metadata: { attemptNumber: newAttemptCount, reason: dto.reason, reasonCode, nextAttemptAt },
        },
      });

      if (exhausted) {
        await tx.notification.create({
          data: {
            companyId,
            title: '📦 Parcel returning to sender',
            body: `${wb.trackingNumber} — ${maxAttempts} delivery attempts failed (${dto.reason}). Returning to sender.`,
            type: 'STATUS_UPDATE',
          },
        });
      }

      return tx.waybill.findFirstOrThrow({ where: { id: waybillId, companyId } });
    });

    // Customer notification is a side effect of a committed write.
    void this.notifications.notifyWaybillStatus(updated);

    this.logger.log(
      `Failed attempt ${newAttemptCount}/${maxAttempts} for ${wb.trackingNumber}: [${reasonCode}] ${dto.reason}`,
    );
    return { ...updated, exhausted, nextAttemptAt, reasonCode };
  }

  async acknowledgeException(
    waybillId: string,
    companyId: string,
    action: string,
    note?: string,
    nextAttemptAt?: string,
    actor?: { id?: string; role?: string },
  ) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, companyId, status: { in: ['FAILED_DELIVERY', 'RETURNED'] } },
      select: { id: true, trackingNumber: true, status: true, attemptCount: true, maxAttempts: true },
    });
    if (!waybill) throw new NotFoundException('Open delivery exception not found');

    const normalised = String(action ?? '').toUpperCase().trim();
    if (!(EXCEPTION_ACTIONS as readonly string[]).includes(normalised)) {
      throw new BadRequestException(`Unsupported exception action. Use: ${EXCEPTION_ACTIONS.join(', ')}`);
    }
    const role = String(actor?.role ?? '').toUpperCase();
    const privilegedActions = ['ESCALATION_STARTED', 'REATTEMPT_CONFIRMED', 'RETURN_CONFIRMED'];
    if (privilegedActions.includes(normalised) && !['ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'DISPATCH'].includes(role)) {
      throw new ForbiddenException('Only operations staff may confirm this exception action');
    }

    const parsedNextAttempt = nextAttemptAt ? new Date(nextAttemptAt) : new Date();
    if (normalised === 'REATTEMPT_CONFIRMED' && Number.isNaN(parsedNextAttempt.getTime())) {
      throw new BadRequestException('nextAttemptAt must be a valid date');
    }
    if (normalised === 'REATTEMPT_CONFIRMED' && waybill.status !== 'FAILED_DELIVERY') {
      throw new BadRequestException('Only failed deliveries can be confirmed for reattempt');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let status = waybill.status;
      if (normalised === 'REATTEMPT_CONFIRMED') {
        guardTransition(waybill.status, 'OUT_FOR_DELIVERY', {
          waybillId,
          trackingNumber: waybill.trackingNumber,
          actor: actor?.id ?? 'operations',
        }, (message) => { throw new BadRequestException(message); });
        status = 'OUT_FOR_DELIVERY';
        await tx.waybill.update({
          where: { id: waybillId },
          data: {
            status,
            returnToSender: false,
            nextAttemptAt: parsedNextAttempt,
          },
        });
      } else if (normalised === 'RETURN_CONFIRMED') {
        await tx.waybill.update({
          where: { id: waybillId },
          data: { returnToSender: true, nextAttemptAt: null },
        });
      }

      return tx.trackingEvent.create({
        data: {
          waybillId,
          companyId,
          event: `EXCEPTION_${normalised}`,
          status,
          description: note?.trim() || `Exception ${normalised.toLowerCase().replaceAll('_', ' ')} by operations`,
          actorType: actor?.role ?? 'OPERATIONS',
          actorId: actor?.id,
          metadata: {
            action: normalised as ExceptionAction,
            nextAttemptAt: normalised === 'REATTEMPT_CONFIRMED' ? parsedNextAttempt : null,
            attemptCount: waybill.attemptCount,
            maxAttempts: waybill.maxAttempts,
          },
        },
      });
    });

    if (normalised === 'ESCALATION_STARTED' || normalised === 'RETURN_CONFIRMED') {
      await this.prisma.notification.create({
        data: {
          companyId,
          title: normalised === 'ESCALATION_STARTED' ? 'Delivery exception escalated' : 'Return to sender confirmed',
          body: `${waybill.trackingNumber}: ${note?.trim() || normalised.toLowerCase().replaceAll('_', ' ')}`,
          type: 'DISPATCH',
        },
      });
    }

    return result;
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
  // 3. ADDRESS BOOK (tenant-scoped on every operation)
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
    // withCompanyId strips client-supplied companyId/id/timestamps and pins the
    // tenant from the session, so a body cannot create a row in another tenant.
    return this.prisma.addressBookEntry.create({
      data: withCompanyId(companyId, dto) as any,
    });
  }

  async updateAddress(id: string, companyId: string, dto: any) {
    // Tenant scope is part of the WHERE, not a check after the fact: an id from
    // another tenant now matches 0 rows and surfaces as NotFound.
    const patch = withCompanyId(companyId, dto) as any;
    delete patch.companyId; // never allow a tenant to be rewritten
    const result = await this.prisma.addressBookEntry.updateMany({
      where: { id, companyId },
      data: patch,
    });
    if (result.count === 0) throw new NotFoundException('Address not found');
    return this.prisma.addressBookEntry.findFirstOrThrow({ where: { id, companyId } });
  }

  async deleteAddress(id: string, companyId: string) {
    const result = await this.prisma.addressBookEntry.updateMany({
      where: { id, companyId },
      data: { isActive: false },
    });
    if (result.count === 0) throw new NotFoundException('Address not found');
    return { deleted: true };
  }

  /** Increment usage count when an address is used (call from waybill/collection creation) */
  async markAddressUsed(id: string, companyId: string) {
    const result = await this.prisma.addressBookEntry.updateMany({
      where: { id, companyId },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Address not found');
    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. MULTI-LEG TRACKING TIMELINE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Public customer timeline.
   *
   * This endpoint has no authentication (customers follow a tracking number),
   * so it returns the JOURNEY only: statuses, timestamps and event labels with
   * personal data removed. Full names/addresses are available to authenticated
   * tenant users elsewhere; exposing them here let anyone enumerate tracking
   * numbers for recipient names and addresses.
   */
  async getTrackingTimeline(trackingNumber: string) {
    const wb = await this.prisma.waybill.findFirst({
      where: { trackingNumber },
      select: {
        id: true, trackingNumber: true, status: true,
        podDeliveredAt: true, pocCollectedAt: true,
        attemptCount: true, maxAttempts: true, returnToSender: true,
        createdAt: true, updatedAt: true,
      },
    });
    if (!wb) throw new NotFoundException('Waybill not found');

    const events = await this.prisma.trackingEvent.findMany({
      where: { waybillId: wb.id },
      orderBy: { createdAt: 'asc' },
      select: { event: true, status: true, createdAt: true, location: true },
    });

    return {
      trackingNumber: wb.trackingNumber,
      currentStatus: wb.status,
      createdAt: wb.createdAt,
      deliveredAt: wb.podDeliveredAt,
      collectedAt: wb.pocCollectedAt,
      attemptCount: wb.attemptCount,
      maxAttempts: wb.maxAttempts,
      returnToSender: wb.returnToSender,
      timeline: events.map((e) => ({
        event: e.event,
        status: e.status,
        description: PUBLIC_EVENT_LABELS[e.event] ?? 'Shipment update',
        // Granular positions are shown only to authorised users; the public
        // feed keeps an approximate city/hub label only.
        location: null,
        timestamp: e.createdAt,
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

  /**
   * Move a waybill to a hub state (receiving at origin, arriving at destination).
   * Strict: illegal transitions are rejected and audited; the write is a CAS.
   */
  async transitionToHub(
    waybillId: string,
    companyId: string,
    status: string,
    location?: string,
    user?: any,
  ) {
    if (!(HUB_TARGET_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(
        `Hub transitions may only target ${HUB_TARGET_STATUSES.join(' or ')} (got "${String(status).slice(0, 40)}").`,
      );
    }

    const wb = await this.prisma.waybill.findFirst({ where: { id: waybillId, companyId } });
    if (!wb) throw new NotFoundException('Waybill not found');

    const target = status as WaybillStatus;
    if (!isLegalTransition(wb.status, target)) {
      // Reject cleanly AND leave an audit trail: "we refused to move this
      // parcel from X to Y" is exactly the event an investigation needs.
      const message = `Illegal waybill transition ${wb.status} → ${target} (waybill ${wb.trackingNumber}).`;
      await this.createEvent(waybillId, companyId, {
        event: 'TRANSITION_REJECTED',
        status: wb.status,
        description: `${message} Rejected before any state change.`,
        location,
        actorType: user ? 'WAREHOUSE' : 'SYSTEM',
        actorId: user?.id,
        actorName: user?.name,
        metadata: { from: wb.status, attempted: target, reason: 'illegal_transition' },
      });
      throw new BadRequestException(message);
    }

    const desc = target === 'AT_ORIGIN_HUB'
      ? `Parcel scanned into ${location ?? 'origin hub'}. Awaiting sorting and dispatch.`
      : `Parcel arrived at ${location ?? 'destination hub'}. Ready for last-mile assignment.`;

    const result = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set: if another scan/branch receive moved this waybill
      // first, we must not overwrite it (that is how timelines run backwards).
      const claimed = await tx.waybill.updateMany({
        where: { id: waybillId, companyId, status: wb.status },
        data: { status: target },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          'Waybill status changed while receiving — the parcel was moved by another scan',
        );
      }

      const event = await tx.trackingEvent.create({
        data: {
          waybillId,
          companyId,
          event: target === 'AT_ORIGIN_HUB' ? 'SCANNED_IN' : 'ARRIVED',
          status: target,
          description: desc,
          location,
          actorType: user ? 'WAREHOUSE' : 'SYSTEM',
          actorId: user?.id,
          actorName: user?.name,
          metadata: { from: wb.status, to: target },
        },
      });

      return { success: true as const, status: target, waybillId, eventId: event.id };
    });

    // AUTO-REASSIGN runs after the receive commits; a failure here surfaces as
    // an explicit "no compliant driver" outcome instead of a silent skip.
    if (target === 'AT_DESTINATION_HUB') {
      await this.autoReassignAtDestination(waybillId, companyId, location);
    }

    return result;
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
   * depot. Accepts tracking numbers OR waybill ids. Each parcel goes through
   * the strict, concurrency-safe transition above and gets a per-parcel result
   * so the clerk sees exactly what was received, what was already in, and what
   * was refused (and why).
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
   * Auto-reassign: when a waybill arrives at the destination hub, find the
   * nearest AVAILABLE, COMPLIANT driver at that branch and hand them custody.
   *
   * Rules:
   *  - only compliant drivers are considered (the same policy as every other
   *    assignment path — a hub scan must not resurrect a suspended driver);
   *  - the shipment hand-over happens in one transaction with the custody
   *    event, so the board and the timeline cannot disagree;
   *  - if no compliant driver exists, nothing is written and the outcome is
   *    reported (no silent catch that hides a stuck parcel).
   */
  private async autoReassignAtDestination(waybillId: string, companyId: string, location?: string) {
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true, status: 'AVAILABLE' },
      orderBy: { lastSeen: 'desc' },
      take: 10,
      select: {
        id: true, name: true, companyId: true, isActive: true, status: true,
        licenseExpiry: true, insuranceExpiry: true, backgroundCheckExpiry: true,
        nextServiceDate: true, currentKm: true, nextServiceKm: true,
        complianceHold: true, complianceHoldReason: true,
      },
    });

    const eligible = this.compliance
      .filterDispatchable(drivers.map((d) => ({ ...d, driverId: d.id, name: d.name })))
      .map(({ snapshot }) => ({ id: snapshot.driverId, name: snapshot.name ?? 'Unnamed driver' }));

    if (eligible.length === 0) {
      await this.createEvent(waybillId, companyId, {
        event: 'AUTO_ASSIGN_SKIPPED',
        status: 'AT_DESTINATION_HUB',
        description: `No compliant driver available at ${location ?? 'the destination hub'} — awaiting manual dispatch.`,
        location,
        actorType: 'SYSTEM',
        actorName: 'FlowOps AI',
        metadata: { reason: 'no_compliant_driver', candidatesConsidered: drivers.length },
      });
      this.logger.warn(`Auto-reassign skipped for ${waybillId}: no compliant driver`);
      return null;
    }

    const driver = eligible[0];

    return this.prisma.$transaction(async (tx) => {
      // The waybill must still be at the destination hub, otherwise another
      // process (a manual dispatcher, a second scan) already moved it.
      const stillHere = await tx.waybill.findFirst({
        where: { id: waybillId, companyId, status: 'AT_DESTINATION_HUB' },
        select: { id: true },
      });
      if (!stillHere) return null;

      const existing = await tx.shipment.findFirst({
        where: { waybillId, companyId },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        // Never overwrite a shipment that is already on the road.
        if (existing.status === 'IN_TRANSIT' && existing.driverId && existing.driverId !== driver.id) {
          this.logger.warn(
            `Auto-reassign skipped for ${waybillId}: already IN_TRANSIT with another driver`,
          );
          return null;
        }
        await tx.shipment.update({
          where: { id: existing.id },
          data: { driverId: driver.id, status: 'PENDING' },
        });
      } else {
        await tx.shipment.create({
          data: { waybillId, companyId, driverId: driver.id, status: 'PENDING' },
        });
      }

      await tx.trackingEvent.create({
        data: {
          waybillId,
          companyId,
          event: 'AUTO_ASSIGNED',
          status: 'AT_DESTINATION_HUB',
          description: `Auto-assigned to driver ${driver.name} for last-mile delivery.`,
          location,
          actorType: 'SYSTEM',
          actorName: 'FlowOps AI',
          metadata: { driverId: driver.id },
        },
      });

      return driver;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /** Throw (with context) when a transition is not legal for the current state. */
  private assertLegalTransition(
    from: WaybillStatus,
    to: WaybillStatus,
    wb: { id: string; trackingNumber?: string | null },
    actor: string,
  ): void {
    if (isLegalTransition(from, to)) return;
    throw new BadRequestException(
      `Illegal waybill transition ${from} → ${to} (waybill ${wb.trackingNumber ?? wb.id}, by ${actor}).`,
    );
  }

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
    // Audit rows for transitions are NOT best-effort: a state change without a
    // timeline entry is unauditable, so this propagates failures to the caller.
    return this.prisma.trackingEvent.create({
      data: { waybillId, ...withCompanyId(companyId, data) },
    });
  }
}

/** Customer-safe labels for public tracking events (no PII, no driver names). */
const PUBLIC_EVENT_LABELS: Record<string, string> = {
  PENDING: 'Order received',
  COLLECTED: 'Parcel collected',
  POC_CAPTURED: 'Collection confirmed',
  SCANNED_IN: 'Checked in at origin hub',
  SORTED: 'Sorted for the next leg',
  LOADED: 'Loaded for transport',
  IN_TRANSIT: 'In transit',
  ARRIVED: 'Arrived at destination hub',
  AT_ORIGIN_HUB: 'At origin hub',
  AT_DESTINATION_HUB: 'At destination hub',
  AUTO_ASSIGNED: 'Allocated to a driver',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILED: 'Delivery attempt failed',
  RETURNED: 'Returning to sender',
  CANCELLED: 'Cancelled',
  TRANSITION_REJECTED: 'Update rejected',
};
