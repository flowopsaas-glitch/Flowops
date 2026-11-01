import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../gateway/events.gateway';
import { DriverSafetyService } from '../driver-safety/driver-safety.service';
import { EpodService } from '../epod/epod.service';
import { DriverComplianceService } from '../common/compliance/driver-compliance.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../webhooks/outbox.service';
import { legalPredecessorStatuses } from '../waybills/waybill-status.machine';
import {
  DRIVE_MODE_CONFIG, DRIVER_MODES, canEndDuty, checkStartDuty, dutyMinutes, jobKindsForMode, JobKind,
} from './driver-mode.rules';
import { CollectionStatus, TripCostType, type DriverMode } from '@prisma/client';
import { randomBytes } from 'crypto';
import { chatMessageKey, verifyChatRetry } from './chat-idempotency';

const CONFIRMABLE_COLLECTION_STATUSES: CollectionStatus[] = [
  CollectionStatus.PENDING,
  CollectionStatus.ASSIGNED,
  CollectionStatus.IN_PROGRESS,
];

@Injectable()
export class DriverPortalService {
  private readonly logger = new Logger(DriverPortalService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private gateway: EventsGateway,
    private safety: DriverSafetyService,
    private epod: EpodService,
    private compliance: DriverComplianceService,
    private audit: AuditService,
    private outbox: OutboxService,
  ) {}

  /**
   * Returns all active jobs for a driver as a flat array.
   * The driver portal dashboard filters this array:
   *   - status === 'PENDING'    → rendered as "Collections"
   *   - status !== 'PENDING'    → rendered as "Deliveries"
   */
  async getDriverJobs(driverId: string) {
    const [collections, shipments] = await Promise.all([
      this.prisma.collection.findMany({
        where: { driverId, status: { in: ['ASSIGNED', 'PENDING', 'IN_PROGRESS'] } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.shipment.findMany({
        where: { driverId, status: { in: ['PENDING', 'IN_TRANSIT'] } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Fetch waybill details separately (avoids Prisma include type issues)
    const wbIds = shipments.map(s => s.waybillId);
    const waybills = wbIds.length
      ? await this.prisma.waybill.findMany({
          where: { id: { in: wbIds } },
          select: {
            id: true, trackingNumber: true, status: true,
            recipientName: true, recipientPhone: true, recipientAddress: true,
            recipientLat: true, recipientLng: true,
            senderName: true, senderAddress: true,
            weight: true, totalAmount: true, codAmount: true, codCollected: true,
          },
        })
      : [];
    const wbMap = Object.fromEntries(waybills.map(w => [w.id, w]));

    const collectionJobs = collections.map(c => ({
      id: c.id,
      type: 'collection',
      status: 'PENDING',
      trackingNumber: `COL-${c.id.slice(-6).toUpperCase()}`,
      recipientName: c.clientName ?? 'Client',
      recipientPhone: c.clientPhone,
      recipientAddress: c.pickupAddress,
      recipientLat: c.pickupLat,
      recipientLng: c.pickupLng,
      notes: c.notes,
      scheduledAt: c.scheduledAt,
      createdAt: c.createdAt,
      // ── Backward-compatible aliases ──────────────────────────────────────
      waybillNumber: `COL-${c.id.slice(-6).toUpperCase()}`,
      receiverName:  c.clientName ?? 'Client',
      receiverPhone: c.clientPhone,
      destination:   c.pickupAddress,
    }));

    const deliveryJobs = shipments.map(s => {
      const wb = wbMap[s.waybillId] ?? {};
      const tnum = (wb as any).trackingNumber ?? s.id;
      const rname = (wb as any).recipientName ?? 'Recipient';
      const rphone = (wb as any).recipientPhone ?? null;
      const raddress = (wb as any).recipientAddress ?? null;
      return {
        id: s.id,
        type: 'delivery',
        status: s.status,
        // Canonical fields
        trackingNumber: tnum,
        recipientName:  rname,
        recipientPhone: rphone,
        recipientAddress: raddress,
        recipientLat: (wb as any).recipientLat ?? s.currentLat,
        recipientLng: (wb as any).recipientLng ?? s.currentLng,
        senderName:    (wb as any).senderName,
        senderAddress: (wb as any).senderAddress,
        weight:      (wb as any).weight,
        totalAmount: (wb as any).totalAmount,
        codAmount:   (wb as any).codAmount,
        codCollected:(wb as any).codCollected,
        waybillId:   s.waybillId,
        createdAt:   s.createdAt,
        // ── Backward-compatible aliases used by the standalone driver portal ──
        waybillNumber: tnum,          // Dashboard reads w.waybillNumber
        receiverName:  rname,         // Dashboard reads w.receiverName
        receiverPhone: rphone,        // Dashboard reads w.receiverPhone
        destination:   raddress,      // Dashboard reads w.destination
      };
    });

    // ── Linehaul manifests assigned to this driver ──────────────────────────
    const manifests = await this.prisma.manifest.findMany({
      where: { driverId, dispatched: false },
      include: {
        branch: { select: { name: true, address: true } },
        _count: { select: { waybills: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const linehaulJobs = manifests.map(m => ({
      id: m.id,
      type: 'linehaul',
      status: 'IN_TRANSIT',
      trackingNumber: m.code,
      recipientName: m.branch?.name ?? 'Destination Hub',
      recipientPhone: null,
      recipientAddress: m.branch?.address ?? 'Inter-branch transfer',
      recipientLat: null,
      recipientLng: null,
      senderName: 'FlowOps Hub',
      senderAddress: null,
      weight: null,
      totalAmount: null,
      codAmount: null,
      codCollected: false,
      waybillId: null,
      manifestId: m.id,
      manifestCode: m.code,
      parcelCount: m._count.waybills,
      destinationBranch: m.branch?.name ?? 'Unknown Branch',
      createdAt: m.createdAt,
      // Backward-compatible aliases
      waybillNumber: m.code,
      receiverName: m.branch?.name ?? 'Destination Hub',
      receiverPhone: null,
      destination: m.branch?.address ?? 'Inter-branch transfer',
    }));

    return [...collectionJobs, ...deliveryJobs, ...linehaulJobs];
  }

  /**
   * POST /driver-portal/manifest/:id/deliver — driver confirms linehaul arrival
   * at the destination branch. Marks manifest as dispatched and updates all
   * waybills to COLLECTED (received at destination hub, ready for last-mile).
   */
  /**
   * confirmLinehaulDelivery — driver confirms the trunk haul arrived at the
   * destination branch.
   *
   * Hardened:
   *  - the manifest is claimed with a compare-and-set on `dispatched: false`, so
   *    a double-tap (or a retried request) cannot deliver the same manifest
   *    twice and re-run the reassignment side effects;
   *  - the claim, the manifest stamp, every waybill move to AT_DESTINATION_HUB
   *    and the last-mile hand-over to a compliant driver happen in ONE
   *    transaction — there is no window where the branch has the cargo but the
   *    system still shows it on the road (or vice versa);
   *  - only COMPLIANT drivers are chosen for the onward leg (the same policy as
   *    auto-dispatch), and a waybill that is already IN_TRANSIT with another
   *    driver is never silently re-pointed;
   *  - the status whitelist is DERIVED from the waybill state machine
   *    (`legalPredecessorStatuses`), not hand-written: the old hard-coded list
   *    also accepted COLLECTED and OUT_FOR_DELIVERY → AT_DESTINATION_HUB, which
   *    the machine refuses. Anything the machine refuses is left untouched,
   *    reported to the driver and audited — never silently skipped.
   */
  async confirmLinehaulDelivery(manifestId: string, driverId: string, companyId: string) {
    const manifest = await this.prisma.manifest.findFirst({
      where: { id: manifestId, driverId, companyId, dispatched: false },
      include: { waybills: true, branch: { select: { name: true } } },
    });

    if (!manifest) {
      throw new NotFoundException(
        'Manifest not found, already delivered, or not assigned to you',
      );
    }

    const waybillIds = (manifest.waybills ?? []).map((mw: any) => mw.waybillId).filter(Boolean);

    // Candidates for the last-mile leg are resolved BEFORE the transaction so a
    // slow compliance check does not hold row locks; the same list is applied
    // inside. Only driver ids are carried in.
    const candidates = await this.prisma.driver.findMany({
      where: { companyId, isActive: true, status: 'AVAILABLE', id: { not: driverId } },
      orderBy: { lastSeen: 'desc' },
      take: 10,
      select: {
        id: true, companyId: true, isActive: true, status: true,
        licenseExpiry: true, insuranceExpiry: true, backgroundCheckExpiry: true,
        nextServiceDate: true, currentKm: true, nextServiceKm: true,
        complianceHold: true, complianceHoldReason: true,
      },
    });
    const eligibleDriverId =
      this.compliance
        .filterDispatchable(candidates.map((d) => ({ ...d, driverId: d.id })))
        .map(({ snapshot }) => snapshot.driverId)[0] ?? null;

    // Only states the state machine actually allows to arrive at a hub. A
    // parcel that never reached AT_ORIGIN_HUB / IN_TRANSIT has a chain-of-
    // custody gap; asserting the jump away would hide it.
    const arrivalsFrom = legalPredecessorStatuses('AT_DESTINATION_HUB');

    const result = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set: exactly one caller can flip `dispatched`.
      const claim = await tx.manifest.updateMany({
        where: { id: manifestId, driverId, dispatched: false },
        data: { dispatched: true, dispatchedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new ConflictException('This manifest was already confirmed delivered');
      }

      let moved = 0;
      const skipped: Array<{ waybillId: string; trackingNumber: string | null; status: string | null }> = [];
      for (const waybillId of waybillIds) {
        // Tenant-scoped CAS per waybill: only parcels the machine allows to
        // arrive move to the destination hub. A parcel that was cancelled in
        // the meantime — or that was never scanned through the origin hub — is
        // left alone and reported below.
        const moved1 = await tx.waybill.updateMany({
          where: { id: waybillId, companyId, status: { in: arrivalsFrom } },
          data: { status: 'AT_DESTINATION_HUB' },
        });
        if (moved1.count === 0) {
          const current = await tx.waybill.findFirst({
            where: { id: waybillId, companyId },
            select: { status: true, trackingNumber: true },
          });
          skipped.push({
            waybillId,
            trackingNumber: current?.trackingNumber ?? null,
            status: current?.status ?? null, // null = not in this tenant at all
          });
          continue;
        }
        moved++;

        await tx.trackingEvent.create({
          data: {
            waybillId,
            companyId,
            event: 'ARRIVED',
            status: 'AT_DESTINATION_HUB',
            description: `Linehaul ${manifest.code} arrived at ${manifest.branch?.name ?? 'destination branch'}.`,
            actorType: 'DRIVER',
            actorId: driverId,
            metadata: { manifestId, manifestCode: manifest.code },
          },
        });

        // Last-mile hand-over, if a compliant driver is available.
        if (eligibleDriverId) {
          const existing = await tx.shipment.findFirst({ where: { waybillId, companyId } });
          if (existing) {
            if (existing.driverId === eligibleDriverId && existing.status === 'PENDING') {
              // already staged for this driver — idempotent, nothing to do.
            } else if (existing.status === 'IN_TRANSIT' && existing.driverId !== eligibleDriverId) {
              // Someone is already carrying it: leave custody alone.
            } else {
              await tx.shipment.update({
                where: { id: existing.id },
                data: { driverId: eligibleDriverId, status: 'PENDING' },
              });
            }
          } else {
            await tx.shipment.create({
              data: { waybillId, companyId, driverId: eligibleDriverId, status: 'PENDING' },
            });
          }
        }
      }

      return { moved, eligibleDriverId, skipped };
    });

    this.logger.log(
      `Linehaul ${manifest.code} delivered by driver ${driverId} to branch ${manifest.branch?.name ?? manifestId}. ` +
      `${result.moved} waybills marked AT_DESTINATION_HUB (ready for last-mile).`,
    );

    // Every parcel that did NOT move is a chain-of-custody gap: audit it with
    // the exact pair that was refused, so the origin hub can be told to scan
    // what it is holding instead of the record quietly diverging from the truck.
    for (const skip of result.skipped) {
      await this.audit.record({
        action: 'waybill.transition_rejected',
        actorType: 'tenant',
        actorId: driverId,
        targetType: 'waybill',
        targetId: skip.waybillId,
        targetName: skip.trackingNumber,
        metadata: {
          companyId,
          manifestId,
          manifestCode: manifest.code,
          from: skip.status,
          attempted: 'AT_DESTINATION_HUB',
          reason: skip.status === null ? 'not_in_tenant' : 'illegal_transition',
          source: 'driver-portal.linehaul',
        },
      });
    }

    return {
      success: true,
      manifestCode: manifest.code,
      destinationBranch: manifest.branch?.name ?? 'Unknown',
      waybillsDelivered: result.moved,
      // Explicit about what happens next: a branch with no compliant driver
      // keeps the parcels at the hub awaiting manual dispatch.
      reassignedTo: result.eligibleDriverId,
      awaitingManualDispatch: waybillIds.length > 0 && !result.eligibleDriverId,
      // Parcels the manifest listed that could not legally arrive: dispatch has
      // to fix the origin scan (or investigate) — this list is the work queue.
      waybillsSkipped: result.skipped.length,
      skippedWaybills: result.skipped,
    };
  }

  async updateGps(driverId: string, lat: number, lng: number, speed?: number) {
    const driver = await this.prisma.driver.update({
      where: { id: driverId },
      data: { lastLat: lat, lastLng: lng, lastSeen: new Date() },
    });

    // ── AI SAFETY SUPERVISOR: Check crime hotspots on every GPS update ────
    // Non-blocking — safety alerts fire asynchronously without slowing GPS response.
    // Identity here already comes from the portal token (`driverId` is the
    // authenticated driver, `driver.companyId` their own tenant), and
    // checkPosition resolves the name it writes from that same record.
    void this.safety.checkPosition(
      driverId, driver.companyId, lat, lng, speed,
    ).catch((err) => {
      this.logger.warn(`Safety check failed (non-blocking): ${err?.message}`);
    });

    return driver;
  }

  /**
   * confirmCollection — driver marks a collection as picked up.
   *
   * Lifecycle (chain of custody — no longer auto-dispatches for delivery):
   * 1. Marks Collection status → COLLECTED + pickedUpAt = now
   * 2. Creates a Waybill at status COLLECTED (NOT IN_TRANSIT)
   * 3. Creates a Shipment (PENDING) against the collecting driver for custody
   * 4. Parcel now awaits depot receive (AT_ORIGIN_HUB) before any onward leg
   */
  async confirmCollection(
    collectionId: string,
    driverId: string,
    companyId: string,
    body: { parcelCount?: number; notes?: string },
  ) {
    if (!collectionId || !driverId || !companyId) {
      throw new BadRequestException('Collection, driver and tenant context are required');
    }

    // 1. Find and validate the collection — tenant + assigned-driver scoped, so
    //    a driver can never confirm someone else's (or another tenant's) pickup.
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, driverId, companyId },
    });
    if (!collection) {
      throw new NotFoundException('Collection not found or not assigned to this driver');
    }

    // 2. Idempotency: a replayed offline confirmation must not create a second
    //    waybill. The provenance link (sourceCollectionId) makes the answer
    //    exact — no guessing a waybill by client name.
    if (collection.status === CollectionStatus.COLLECTED) {
      const existing = await this.prisma.waybill.findFirst({
        where: { companyId, sourceCollectionId: collectionId },
        select: { id: true, trackingNumber: true, status: true },
      });
      if (!existing) {
        throw new ConflictException('Collection is marked collected but has no linked waybill; contact support');
      }
      return {
        success: true,
        alreadyConfirmed: true,
        collection: { id: collectionId, status: CollectionStatus.COLLECTED },
        waybill: { id: existing.id, trackingNumber: existing.trackingNumber, status: existing.status },
        message: 'Collection was already confirmed.',
      };
    }
    if (!CONFIRMABLE_COLLECTION_STATUSES.includes(collection.status)) {
      throw new BadRequestException(`A ${collection.status.toLowerCase()} collection cannot be confirmed`);
    }

    const trackingNumber = `FO${randomBytes(6).toString('hex').toUpperCase()}`;
    const pickedUpAt = new Date();

    // 3. ONE transaction: claim the collection (compare-and-set on status), then
    //    create the waybill + its custody shipment. A failure anywhere rolls the
    //    whole thing back — a COLLECTED collection without a waybill (or a
    //    waybill with no custody record) can no longer exist.
    const created = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.collection.updateMany({
        where: { id: collectionId, driverId, companyId, status: { in: CONFIRMABLE_COLLECTION_STATUSES } },
        data: {
          status: CollectionStatus.COLLECTED,
          pickedUpAt,
          notes: body.notes ? `${collection.notes ?? ''}\nDriver: ${body.notes}`.trim() : collection.notes,
        },
      });
      if (claim.count === 0) {
        // Another tap (or concurrent office/driver confirmation) may have won.
        const [latest, existing] = await Promise.all([
          tx.collection.findFirst({ where: { id: collectionId, companyId }, select: { status: true } }),
          tx.waybill.findFirst({
            where: { companyId, sourceCollectionId: collectionId },
            select: { id: true, trackingNumber: true, status: true },
          }),
        ]);
        if (latest?.status !== CollectionStatus.COLLECTED || !existing) {
          throw new ConflictException('Collection changed; refresh and try again');
        }
        return { alreadyConfirmed: true as const, waybill: existing };
      }

      // 4. Waybill at COLLECTED (a freshly-collected parcel is NOT yet in
      //    transit; the depot receive step decides the onward leg).
      const waybill = await tx.waybill.create({
        data: {
          trackingNumber,
          companyId,
          status: 'COLLECTED',
          sourceCollectionId: collectionId,
          senderName: collection.clientName,
          senderPhone: collection.clientPhone,
          senderAddress: collection.pickupAddress,
          recipientName: collection.clientName,
          recipientPhone: collection.clientPhone,
          recipientAddress: collection.pickupAddress,
          weight: 0,
          totalAmount: 0,
          description: `Collection pickup — ${body.parcelCount ?? 1} parcel(s). ${body.notes ?? ''}`.trim(),
        },
      });

      // 5. Custody: the collecting driver holds the parcel en route to the depot.
      await tx.shipment.create({
        data: { waybillId: waybill.id, companyId, driverId, status: 'PENDING' },
      });

      await tx.trackingEvent.create({
        data: {
          waybillId: waybill.id,
          companyId,
          event: 'COLLECTED',
          status: 'COLLECTED',
          description: `Parcel collected from ${collection.clientName} at ${collection.pickupAddress}. Awaiting depot receive.`,
          actorType: 'DRIVER',
          actorId: driverId,
          metadata: { collectionId },
        },
      });

      return { alreadyConfirmed: false as const, waybill };
    });

    if (created.alreadyConfirmed) {
      return {
        success: true,
        alreadyConfirmed: true,
        collection: { id: collectionId, status: 'COLLECTED' },
        waybill: created.waybill ?? null,
        message: 'Collection was already confirmed.',
      };
    }

    const waybill = created.waybill!;
    this.logger.log(
      `Collection ${collectionId} confirmed → Waybill ${trackingNumber} created as COLLECTED (awaiting depot receive) by driver ${driverId}`,
    );

    // 6. Realtime fan-out is best-effort and happens after the commit.
    try {
      this.gateway.emitToCompany(companyId, 'collection-confirmed', {
        collectionId,
        waybillId: waybill.id,
        trackingNumber,
        driverId,
        status: 'COLLECTED',
        awaitingDepotReceive: true,
      });
    } catch { /* best-effort */ }

    return {
      success: true,
      collection: { id: collectionId, status: 'COLLECTED' },
      waybill: { id: waybill.id, trackingNumber, status: 'COLLECTED' },
      message: `Collected! Waybill ${trackingNumber} created. Take it to the depot to be received before it's loaded or delivered.`,
    };
  }

  /**
   * Driver-app POD capture.
   *
   * The write itself goes through EpodService.capture(): one transaction that
   * checks custody, validates the lifecycle, claims the delivery with a
   * compare-and-set and stores the POD evidence + delivery status together.
   * This method only adds the driver-app specifics: the driver identity comes
   * from the token (never the body), and the customer notification / realtime
   * fan-out happen after the commit.
   */
  async recordPod(body: {
    waybillId: string;
    driverId: string;
    companyId: string;
    signatureUrl?: string;
    imageUrl?: string;
    recipientName?: string;
    notes?: string;
    lat?: number;
    lng?: number;
  }) {
    // Fail closed: these come from the driver token via the controller. If a
    // future caller forgets one, we must not degrade to "any waybill by id".
    if (!body.companyId || !body.driverId) {
      throw new BadRequestException('Driver and tenant context are required to capture POD');
    }
    if (!body.waybillId) {
      throw new BadRequestException('waybillId is required');
    }

    const epod = await this.epod.capture(
      body.companyId,
      {
        waybillId: body.waybillId,
        driverId: body.driverId,
        signatureUrl: body.signatureUrl,
        photoUrls: body.imageUrl ? [body.imageUrl] : [],
        recipientName: body.recipientName,
        notes: body.notes,
        geoLat: body.lat,
        geoLng: body.lng,
      },
      { driverId: body.driverId, role: 'DRIVER' },
    );

    const updated = await this.prisma.waybill.findFirst({
      where: { id: body.waybillId, companyId: body.companyId },
    });

    // ── Close the loop (after the commit; failures here cannot un-deliver) ──
    if (updated) {
      void this.notifications.notifyWaybillStatus(updated as any);
      void this.notifications.sendRatingRequest(updated as any);
      try {
        this.gateway.emitShipmentUpdate(updated.companyId, {
          waybillId: updated.id,
          trackingNumber: updated.trackingNumber,
          status: 'DELIVERED',
          source: 'driver-pod',
        });
      } catch (err: any) {
        this.logger.warn(`POD realtime emit failed: ${err?.message ?? err}`);
      }
    }

    return { ...(updated as any), epodId: epod.id, podStatus: epod.status };
  }

  // ── Driver modes & duties (one shift, one mode, one vehicle) ──────────────

  // ── Measured trip costs (driver capture) ─────────────────────────────────
  // A driver records what a trip actually cost (fuel at the pump, tolls at
  // the gate) in under half a minute. Identity always comes from the driver
  // token — the client never supplies a driver id. Entries are raw material
  // for per-trip margins: until a driver logs fuel, that cost is UNKNOWN
  // for the trip, never assumed zero.

  async logDriverCost(driverId: string, companyId: string, body: any) {
    const type = String(body?.type ?? '').toUpperCase();
    if (!Object.values(TripCostType).includes(type as TripCostType)) {
      throw new BadRequestException('type must be FUEL, TOLL or OTHER');
    }
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    const litres = body?.litres != null ? Number(body.litres) : null;
    if (litres != null && (!Number.isFinite(litres) || litres < 0)) {
      throw new BadRequestException('litres must be a non-negative number');
    }
    const odometerKm = body?.odometerKm != null ? Number(body.odometerKm) : null;
    if (odometerKm != null && (!Number.isInteger(odometerKm) || odometerKm < 0)) {
      throw new BadRequestException('odometerKm must be a non-negative integer');
    }

    let waybillId: string | null = null;
    if (body?.waybillId) {
      // Tenant-checked only: the office reconciles which trip a cost belongs
      // to. The driver's identity and company always come from the token.
      const waybill = await this.prisma.waybill.findFirst({
        where: { id: String(body.waybillId), companyId },
        select: { id: true },
      });
      if (!waybill) throw new NotFoundException('Waybill not found');
      waybillId = waybill.id;
    }

    const entry = await this.prisma.tripCostEntry.create({
      data: {
        companyId,
        driverId,
        waybillId,
        type: type as TripCostType,
        amount,
        litres: type === TripCostType.FUEL ? litres : null,
        odometerKm,
        note: typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null,
        occurredAt: new Date(),
        source: 'DRIVER_APP',
        createdBy: driverId,
      },
    });

    if (odometerKm != null) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: driverId, companyId },
        select: { currentKm: true },
      });
      if (driver && odometerKm > (driver.currentKm ?? 0)) {
        await this.prisma.driver.update({
          where: { id: driverId },
          data: { currentKm: odometerKm },
        });
      }
    }

    return entry;
  }

  /** The driver's most recent cost entries (their own record, token-scoped). */
  async listDriverCosts(driverId: string, limit = 30) {
    return this.prisma.tripCostEntry.findMany({
      where: { driverId },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  /** GET /driver-portal/modes — the five crafts, what this driver may drive, and the active duty. */
  async getModes(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { allowedModes: true, defaultMode: true, vehicleReg: true, vehicleType: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    const activeDuty = await this.prisma.driverDuty.findFirst({
      where: { driverId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' },
    });
    const allowed = driver.allowedModes.length ? driver.allowedModes : [...DRIVER_MODES];
    return {
      activeDuty,
      defaultMode: driver.defaultMode,
      vehicleReg: driver.vehicleReg,
      modes: DRIVER_MODES.map((m) => ({
        mode: m,
        ...DRIVE_MODE_CONFIG[m],
        allowed: allowed.includes(m),
      })),
    };
  }

  /** GET /driver-portal/duty/active */
  getActiveDuty(driverId: string) {
    return this.prisma.driverDuty.findFirst({
      where: { driverId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * POST /driver-portal/duty/start — declare the craft for this shift.
   * Switching modes is the normal flow: the previous duty is auto-ended and
   * everything it implied (job scoping, checklist) changes with it.
   */
  async startDuty(driverId: string, companyId: string, dto: { mode: DriverMode; vehicleReg?: string; note?: string }) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId }, select: { allowedModes: true, vehicleReg: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const check = checkStartDuty({
      mode: dto.mode,
      vehicleReg: dto.vehicleReg?.trim() || driver.vehicleReg,
      allowedModes: driver.allowedModes,
    });
    if (!check.ok) throw new BadRequestException(check.blockers.join(' '));

    return this.prisma.withTenant(companyId, async (tx) => {
      const previous = await tx.driverDuty.findFirst({ where: { driverId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } });
      let previousEnded: { id: string; mode: DriverMode; endedAt: Date } | null = null;
      if (previous) {
        const endedAt = new Date();
        await tx.driverDuty.update({ where: { id: previous.id }, data: { status: 'COMPLETED', endedAt } });
        previousEnded = { id: previous.id, mode: previous.mode, endedAt };
        await this.outbox.enqueue(tx, companyId, 'driver.duty.completed', {
          dutyId: previous.id, driverId, mode: previous.mode, autoEnded: true,
          durationMinutes: dutyMinutes(previous, endedAt),
        });
      }
      const duty = await tx.driverDuty.create({
        data: {
          companyId, driverId, mode: dto.mode,
          vehicleReg: dto.vehicleReg?.trim() || driver.vehicleReg || null,
          note: dto.note ?? null,
        },
      });
      await tx.driver.update({ where: { id: driverId }, data: { status: 'AVAILABLE' } });
      await this.outbox.enqueue(tx, companyId, 'driver.duty.started', {
        dutyId: duty.id, driverId, mode: duty.mode, vehicleReg: duty.vehicleReg,
        previousDutyId: previousEnded?.id ?? null,
      });
      return { duty, previousEnded, config: DRIVE_MODE_CONFIG[duty.mode] };
    });
  }

  /** POST /driver-portal/duty/end — stand down from the shift. */
  async endDuty(driverId: string, companyId: string, note?: string) {
    const active = await this.prisma.driverDuty.findFirst({ where: { driverId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } });
    if (!canEndDuty(active)) throw new BadRequestException('No active duty to end.');
    return this.prisma.withTenant(companyId, async (tx) => {
      const endedAt = new Date();
      const duty = await tx.driverDuty.update({
        where: { id: active!.id }, data: { status: 'COMPLETED', endedAt, note: note ?? active!.note },
      });
      await tx.driver.update({ where: { id: driverId }, data: { status: 'OFFLINE' } });
      await this.outbox.enqueue(tx, companyId, 'driver.duty.completed', {
        dutyId: duty.id, driverId, mode: duty.mode, autoEnded: false,
        durationMinutes: dutyMinutes(duty, endedAt),
      });
      return { duty, durationMinutes: dutyMinutes(duty, endedAt) };
    });
  }

  /**
   * GET /driver-portal/work — the work queue SCOPED to the active duty's mode
   * (server-side: the UI cannot ask for another craft's work). With no active
   * duty the full queue is returned for backward compatibility, and `mode` is
   * null so the UI can prompt for a shift start.
   */
  async getWorkForDuty(driverId: string) {
    const [jobs, duty] = await Promise.all([
      this.getDriverJobs(driverId),
      this.prisma.driverDuty.findFirst({ where: { driverId, status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } }),
    ]);
    if (!duty) return { duty: null, mode: null, config: null, jobs };
    const kinds = jobKindsForMode(duty.mode);
    const kindOf = (t: string): JobKind => (t === 'collection' ? 'collection' : t === 'linehaul' ? 'linehaul' : 'parcel');
    return {
      duty,
      mode: duty.mode,
      config: DRIVE_MODE_CONFIG[duty.mode],
      jobs: jobs.filter((j: any) => kinds.includes(kindOf(j.type))),
    };
  }

  /**
   * GET /driver-portal/train-board — the TRAIN driver's duty board: what they
   * are hauling (train manifests) and what is happening to the track
   * (possession windows). Tenant-scoped through withTenant — a train driver
   * sees their operator's railway and no one else's.
   */
  async getTrainBoard(companyId: string) {
    return this.prisma.withTenant(companyId, async (tx) => {
      const now = new Date();
      const horizon = new Date(now.getTime() + 24 * 3_600_000);
      const [manifests, possessions] = await Promise.all([
        tx.railTrainManifest.findMany({
          where: {
            companyId,
            status: { in: ['DRAFT', 'ISSUED', 'DEPARTED'] },
            OR: [{ plannedDeparture: null }, { plannedDeparture: { lte: horizon } }],
          },
          orderBy: [{ plannedDeparture: 'asc' }, { createdAt: 'desc' }],
          take: 10,
          include: { wagons: { select: { id: true } } },
        }),
        tx.railPossessionWindow.findMany({
          where: { companyId, endsAt: { gte: now }, startsAt: { lte: horizon } },
          orderBy: { startsAt: 'asc' },
          take: 10,
        }),
      ]);
      return {
        manifests: manifests.map((m) => ({
          id: m.id, manifestNumber: m.manifestNumber, revision: m.revision, status: m.status,
          route: [m.originSiding, m.destinationSiding].filter(Boolean).join(' → '),
          corridor: m.corridor, railOperator: m.railOperator, locoReference: m.locoReference,
          plannedDeparture: m.plannedDeparture, plannedArrival: m.plannedArrival,
          wagons: m.wagons.length,
        })),
        possessions: possessions.map((p) => ({
          id: p.id, title: p.title, kind: p.kind, status: p.status,
          location: p.location, corridorCode: p.corridorCode,
          startsAt: p.startsAt, endsAt: p.endsAt,
        })),
      };
    });
  }

  async getMessages(driverId: string, limit = 50, skip = 0) {
    const msgs = await this.prisma.driverChatMessage.findMany({
      where: { driverId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(Number.isInteger(limit) ? limit : 50, 1), 100),
      skip: Math.max(Number.isInteger(skip) ? skip : 0, 0),
    });
    // Fetch the newest page, but render each page chronologically.
    return msgs.reverse();
  }

  /**
   * Tenant-scoped chat read for the DISPATCH side. Dispatch users may only read
   * the thread of a driver in THEIR company (the driverId is a route param, so
   * without this scope a tenant could read another tenant's driver chat).
   */
  async getMessagesForCompany(driverId: string, companyId: string, limit = 50, skip = 0) {
    const msgs = await this.prisma.driverChatMessage.findMany({
      where: { driverId, companyId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(Number.isInteger(limit) ? limit : 50, 1), 100),
      skip: Math.max(Number.isInteger(skip) ? skip : 0, 0),
    });
    return msgs.reverse();
  }

  async sendMessage(driverId: string, companyId: string, message: string, senderType = 'driver', attachmentUrl?: string, attachmentType?: string, clientMessageId?: unknown) {
    if (!message || !message.trim()) throw new BadRequestException('Message is required');
    if (message.length > 4000) throw new BadRequestException('Message is too long');
    if (senderType !== 'driver' && senderType !== 'dispatch') throw new BadRequestException('Invalid senderType');
    const key = chatMessageKey(clientMessageId);
    const payload = { message: message.trim(), senderType, attachmentUrl, attachmentType };
    try {
      return await this.prisma.driverChatMessage.create({
        data: { driverId, companyId, ...payload, ...(key ? { clientMessageId: key } : {}) },
      });
    } catch (error) {
      // The database unique index is the concurrency barrier, including across
      // app instances. A lost response can be retried with the same UUID.
      if (!key || (error as { code?: string })?.code !== 'P2002') throw error;
      const existing = await this.prisma.driverChatMessage.findFirst({
        where: { driverId, companyId, clientMessageId: key },
      });
      // Do not mask a different unique constraint failure.
      if (!existing) throw error;
      return verifyChatRetry(existing, payload);
    }
  }

  async markRead(id: string) {
    // The driver portal frontend passes the driverId (not a messageId) to this
    // endpoint. Detect which case we're in: if the id matches a driver record,
    // bulk-mark all unread dispatch messages for that driver as read.
    const driver = await this.prisma.driver.findUnique({ where: { id }, select: { id: true } });
    if (driver) {
      const result = await this.prisma.driverChatMessage.updateMany({
        where: { driverId: id, senderType: 'dispatch', readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true, marked: result.count };
    }
    // Fallback: treat as a single messageId (original behavior)
    return this.prisma.driverChatMessage.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /** Mark dispatch→driver messages as delivered (deliveredAt set). Tenant-scoped. */
  async markAsDelivered(driverId: string, companyId: string, messageIds: string[]) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return { ok: true, marked: 0 };
    const validIds = messageIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (validIds.length === 0) return { ok: true, marked: 0 };
    const result = await this.prisma.driverChatMessage.updateMany({
      where: {
        id: { in: validIds },
        driverId,
        companyId,
        senderType: 'dispatch',
        deliveredAt: null,
      },
      data: { deliveredAt: new Date() },
    });
    return { ok: true, marked: result.count };
  }

  /** Typing state kept in-memory (ephemeral — no DB write needed) */
  private typingMap = new Map<string, { isTyping: boolean; updatedAt: Date }>();

  setTyping(driverId: string, isTyping: boolean) {
    this.typingMap.set(driverId, { isTyping, updatedAt: new Date() });
    return { ok: true };
  }

  getTypingStatus(driverId: string) {
    const entry = this.typingMap.get(driverId);
    if (!entry) return { isTyping: false };
    // Expire typing status after 4 s
    const expired = (Date.now() - entry.updatedAt.getTime()) > 4000;
    return { isTyping: expired ? false : entry.isTyping };
  }

  /** Dispatch-side: list drivers with their most recent message + unread count */
  async getDriverConversations(companyId: string) {
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, vehicleReg: true, status: true, lastSeen: true },
    });

    const convos = await Promise.all(drivers.map(async d => {
      // Temporary diagnostic: no readAt filter
      const messages = await this.prisma.driverChatMessage.findMany({
        where: { driverId: d.id, senderType: 'driver' },
        select: { id: true },
      });
      const unread = messages.length;
      const last = await this.prisma.driverChatMessage.findFirst({
        where: { driverId: d.id },
        orderBy: { createdAt: 'desc' },
      });
      return { ...d, unreadCount: unread, lastMessage: last?.message, lastMessageAt: last?.createdAt };
    }));

    return convos.sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
      return 0;
    });
  }

  /** Dispatch sends a message to a specific driver, scoped to the tenant. Idempotent via clientMessageId. */
  async dispatchSend(driverId: string, companyId: string, message: string, clientMessageId?: unknown) {
    if (!message || !message.trim()) throw new BadRequestException('Message is required');
    if (message.length > 4000) throw new BadRequestException('Message is too long');

    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, companyId, isActive: true },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const key = chatMessageKey(clientMessageId);
    const payload = { message: message.trim(), senderType: 'dispatch' };
    try {
      return await this.prisma.driverChatMessage.create({
        data: { driverId: driver.id, companyId, ...payload, ...(key ? { clientMessageId: key } : {}) },
      });
    } catch (error) {
      // The database unique index is the concurrency barrier. A lost response can
      // be retried with the same UUID; an identical retry returns the original.
      if (!key || (error as { code?: string })?.code !== 'P2002') throw error;
      const existing = await this.prisma.driverChatMessage.findFirst({
        where: { driverId: driver.id, companyId, clientMessageId: key },
      });
      if (!existing) throw error;
      return verifyChatRetry(existing, payload);
    }
  }
}
