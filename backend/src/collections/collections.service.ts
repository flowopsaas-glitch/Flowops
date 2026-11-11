import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CollectionStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { DriverComplianceService } from '../common/compliance/driver-compliance.service';

const CONFIRMABLE_COLLECTION_STATUSES: CollectionStatus[] = [
  CollectionStatus.PENDING,
  CollectionStatus.ASSIGNED,
  CollectionStatus.IN_PROGRESS,
];
const ASSIGNABLE_COLLECTION_STATUSES: CollectionStatus[] = [
  CollectionStatus.PENDING,
  CollectionStatus.ASSIGNED,
];

const COLLECTION_TRANSITIONS: Record<CollectionStatus, CollectionStatus[]> = {
  PENDING: [CollectionStatus.ASSIGNED, CollectionStatus.CANCELLED, CollectionStatus.FAILED],
  ASSIGNED: [CollectionStatus.PENDING, CollectionStatus.IN_PROGRESS, CollectionStatus.CANCELLED, CollectionStatus.FAILED],
  IN_PROGRESS: [CollectionStatus.CANCELLED, CollectionStatus.FAILED],
  COLLECTED: [],
  FAILED: [],
  CANCELLED: [],
};

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private prisma: PrismaService,
    private geo: GeocodingService,
    private notifications: NotificationsService,
    private push: PushService,
    private compliance: DriverComplianceService,
  ) {}

  async findAll(companyId: string, query?: any) {
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.driverId) where.driverId = query.driverId;
    return this.prisma.collection.findMany({
      where, include: { driver: true, agent: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' }, take: 200,
    });
  }

  async findByCompany(companyId: string) {
    return this.findAll(companyId);
  }

  /**
   * Collections scheduling efficiency — the dispatch-desk view: backlog &
   * unassigned aging, time-to-collect, on-time pickup adherence and completion
   * rate. Tenant-scoped, read-only.
   */
  async insights(companyId: string) {
    const now = Date.now();
    const d30 = new Date(now - 30 * 86_400_000);

    const [byStatus, unassigned, collectedRecent] = await Promise.all([
      this.prisma.collection.groupBy({
        by: ['status'],
        where: { companyId },
        _count: { _all: true },
      }),
      this.prisma.collection.findMany({
        where: { companyId, status: 'PENDING', driverId: null },
        select: { id: true, clientName: true, pickupAddress: true, createdAt: true, scheduledAt: true },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
      this.prisma.collection.findMany({
        where: { companyId, status: 'COLLECTED', pickedUpAt: { gte: d30 } },
        select: { createdAt: true, scheduledAt: true, pickedUpAt: true },
      }),
    ]);

    const sc: Record<string, number> = { PENDING: 0, ASSIGNED: 0, IN_PROGRESS: 0, COLLECTED: 0, FAILED: 0, CANCELLED: 0 };
    for (const r of byStatus) sc[r.status] = r._count._all;

    const HOUR = 3_600_000;
    const unassignedAging = { lt2h: 0, h2_8: 0, gt8: 0 };
    let oldestUnassignedHours = 0;
    const watch = unassigned.slice(0, 10).map((c) => {
      const ageHours = (now - new Date(c.createdAt).getTime()) / HOUR;
      if (ageHours < 2) unassignedAging.lt2h += 1;
      else if (ageHours < 8) unassignedAging.h2_8 += 1;
      else unassignedAging.gt8 += 1;
      oldestUnassignedHours = Math.max(oldestUnassignedHours, ageHours);
      return {
        id: c.id,
        clientName: c.clientName,
        pickupAddress: c.pickupAddress,
        ageHours: Math.round(ageHours * 10) / 10,
      };
    });
    // Aging buckets should reflect ALL unassigned, not just the watch slice.
    unassignedAging.lt2h = 0; unassignedAging.h2_8 = 0; unassignedAging.gt8 = 0;
    for (const c of unassigned) {
      const ageHours = (now - new Date(c.createdAt).getTime()) / HOUR;
      if (ageHours < 2) unassignedAging.lt2h += 1;
      else if (ageHours < 8) unassignedAging.h2_8 += 1;
      else unassignedAging.gt8 += 1;
      oldestUnassignedHours = Math.max(oldestUnassignedHours, ageHours);
    }

    let collectSum = 0, collectCount = 0;
    let onTime = 0, scheduledCount = 0;
    for (const c of collectedRecent) {
      if (c.pickedUpAt) {
        collectSum += (new Date(c.pickedUpAt).getTime() - new Date(c.createdAt).getTime()) / HOUR;
        collectCount += 1;
        if (c.scheduledAt) {
          scheduledCount += 1;
          if (new Date(c.pickedUpAt).getTime() <= new Date(c.scheduledAt).getTime()) onTime += 1;
        }
      }
    }

    const decided = sc.COLLECTED + sc.FAILED;
    const round1 = (n: number) => Math.round(n * 10) / 10;

    return {
      statusCounts: sc,
      backlog: sc.PENDING + sc.ASSIGNED + sc.IN_PROGRESS,
      unassignedCount: unassigned.length,
      unassignedAging,
      oldestUnassignedHours: round1(oldestUnassignedHours),
      avgTimeToCollectHours: collectCount ? round1(collectSum / collectCount) : null,
      onTimePickupRatePct: scheduledCount ? Math.round((onTime / scheduledCount) * 1000) / 10 : null,
      completionRatePct: decided ? Math.round((sc.COLLECTED / decided) * 1000) / 10 : 0,
      collectedLast30: collectedRecent.length,
      watch,
      note:
        'Unassigned = PENDING collections with no driver, aged from creation. Time-to-collect and on-time pickup are measured over collections picked up in the last 30 days.',
    };
  }

  /**
   * `tx` lets a caller pass the transaction client from `withTenant`, so the read runs
   * inside the same tenant context (and the same snapshot) as the writes that follow it.
   */
  async findOne(id: string, companyId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const c = await db.collection.findFirst({
      where: { id, companyId },
      include: { driver: true, agent: { select: { id: true, name: true } } },
    });
    if (!c) throw new NotFoundException('Collection not found');
    return c;
  }

  async create(companyId: string, dto: any) {
    const scheduledValue = dto?.scheduledAt ?? dto?.scheduledDate;
    const scheduledAt = scheduledValue ? new Date(scheduledValue) : null;
    if (scheduledValue && Number.isNaN(scheduledAt!.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid date');
    }
    const data: any = {
      companyId,
      clientName: String(dto?.clientName ?? '').trim(),
      clientPhone: String(dto?.clientPhone ?? '').trim(),
      clientEmail: dto?.clientEmail ? String(dto.clientEmail).trim().toLowerCase() : null,
      pickupAddress: String(dto?.pickupAddress ?? '').trim(),
      notes: dto?.notes ? String(dto.notes) : null,
      scheduledAt,
      status: CollectionStatus.PENDING,
      driverId: null,
    };
    if (!data.clientName || !data.pickupAddress) {
      throw new BadRequestException('Client name and pickup address are required');
    }

    // ── Smart Address Resolution ────────────────────────────────────────────
    // Uses the world-class smartResolve engine: AddressBook fuzzy matching first,
    // then geocode fallback. Upgrades the raw address to its canonical form so
    // all downstream systems (routing, tracking, reports) use consistent data.
    if (data.pickupAddress && (data.pickupLat == null || data.pickupLng == null)) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { country: true },
      });
      const country = company?.country ?? undefined;

      // Try smart resolution first (AddressBook + fuzzy + geocode)
      const smart = await this.geo.smartResolve(data.pickupAddress, companyId, country);

      if (smart.point) {
        data.pickupLat = smart.point.lat;
        data.pickupLng = smart.point.lng;
        // Upgrade to canonical address if resolved with high confidence
        if (smart.confidence >= 75 && smart.canonical && smart.canonical !== data.pickupAddress) {
          data.pickupAddress = smart.canonical;
        }
      } else {
        // Fallback: plain geocode (in case smartResolve had an issue)
        const point = await this.geo.geocode(data.pickupAddress, country);
        if (point) {
          data.pickupLat = point.lat;
          data.pickupLng = point.lng;
        }
      }
    }
    const collection = await this.prisma.collection.create({ data });

    // ── COLLECTION SCHEDULED — notify client via WhatsApp + email ──
    void this.notifications.notifyCollectionScheduled(companyId, {
      clientName: collection.clientName,
      clientPhone: collection.clientPhone,
      clientEmail: collection.clientEmail,
      pickupAddress: collection.pickupAddress,
      scheduledAt: collection.scheduledAt,
      driverName: null, // driver not assigned yet at creation
    });

    return collection;
  }

  async update(id: string, companyId: string, dto: any) {
    const current = await this.findOne(id, companyId);
    if (dto?.driverId !== undefined) {
      throw new BadRequestException('Use the assign-driver or release-driver action to change collection custody');
    }

    const data: any = {};
    if (dto?.notes !== undefined) data.notes = dto.notes == null ? null : String(dto.notes);
    if (dto?.pickupAddress !== undefined) {
      data.pickupAddress = String(dto.pickupAddress).trim();
      if (!data.pickupAddress) throw new BadRequestException('Pickup address cannot be empty');
    }
    const scheduledValue = dto?.scheduledAt !== undefined ? dto.scheduledAt : dto?.scheduledDate;
    if (scheduledValue !== undefined) {
      data.scheduledAt = scheduledValue ? new Date(scheduledValue) : null;
      if (scheduledValue && Number.isNaN(data.scheduledAt.getTime())) {
        throw new BadRequestException('scheduledAt must be a valid date');
      }
    }
    if (dto?.status !== undefined) {
      const next = dto.status as CollectionStatus;
      if (!Object.values(CollectionStatus).includes(next)) {
        throw new BadRequestException('Invalid collection status');
      }
      if (next !== current.status && !COLLECTION_TRANSITIONS[current.status].includes(next)) {
        throw new BadRequestException(`Collection cannot transition from ${current.status} to ${next}`);
      }
      if (next === CollectionStatus.ASSIGNED && !current.driverId) {
        throw new BadRequestException('Assign a driver before changing the collection to ASSIGNED');
      }
      if (next === CollectionStatus.IN_PROGRESS && !current.driverId) {
        throw new BadRequestException('Assign a driver before starting the collection');
      }
      data.status = next;
      if (next === CollectionStatus.CANCELLED || next === CollectionStatus.FAILED || next === CollectionStatus.PENDING) {
        data.driverId = null;
      }
    }
    if (Object.keys(data).length === 0) return current;

    // Re-geocode when the pickup address changes (and caller didn't pass coords).
    if (data.pickupAddress && data.pickupLat == null && data.pickupLng == null) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { country: true },
      });
      const point = await this.geo.geocode(data.pickupAddress, company?.country ?? undefined);
      if (point) {
        data.pickupLat = point.lat;
        data.pickupLng = point.lng;
      }
    }

    const updateWhere: any = { id, companyId, status: current.status };
    if (
      current.status === CollectionStatus.ASSIGNED &&
      data.driverId === null
    ) {
      // A stale cancel/release must not clear a driver assigned by a concurrent edit.
      updateWhere.driverId = current.driverId;
    }
    // Tenant context + one atomic snapshot: the guard read and the write now agree on
    // what the row looked like, instead of racing another request between the two.
    return this.prisma.withTenant(companyId, async (tx) => {
      const updated = await tx.collection.updateMany({ where: updateWhere, data });
      if (updated.count !== 1) throw new ConflictException('Collection changed; refresh and try again');
      return this.findOne(id, companyId, tx);
    });
  }

  async cancel(id: string, companyId: string) {
    return this.update(id, companyId, { status: CollectionStatus.CANCELLED });
  }

  /**
   * assignDriver — attach a driver to a collection and move it to ASSIGNED.
   * Tenant-scoped: findOne() guards the collection ownership, and the driver
   * must belong to the same company.
   */
  async assignDriver(id: string, companyId: string, driverId: string) {
    // Custody is a read-modify-write: the collection and the driver are both read, then
    // the collection is written. Inside withTenant the whole thing is one atomic
    // snapshot AND runs with app.company_id set, so RLS applies as a second line of
    // defence behind the explicit companyId filters.
    const assigned = await this.prisma.withTenant(companyId, async (tx) => {
      const collection = await this.findOne(id, companyId, tx);
      if (!ASSIGNABLE_COLLECTION_STATUSES.includes(collection.status)) {
        throw new BadRequestException(`A ${collection.status.toLowerCase()} collection cannot be assigned`);
      }
      const driver = await tx.driver.findFirst({ where: { id: driverId, companyId } });
      if (!driver) throw new NotFoundException('Driver not found');
      const updated = await tx.collection.updateMany({
        where: {
          id,
          companyId,
          driverId: collection.driverId,
          status: { in: ASSIGNABLE_COLLECTION_STATUSES },
        },
        data: { driverId, status: CollectionStatus.ASSIGNED },
      });
      if (updated.count !== 1) throw new ConflictException('Collection changed; refresh and try again');
      return this.findOne(id, companyId, tx);
    });
    // Wake the driver's phone: "new job". Best-effort, never blocks the assign, and
    // deliberately OUTSIDE the transaction — a push call must not hold a tx open.
    void this.push.notifyDriver(driverId);
    return assigned;
  }

  /**
   * releaseDriver — detach the driver from a collection. Only reset an ASSIGNED
   * collection back to PENDING; leave IN_PROGRESS/COLLECTED/etc untouched so we
   * don't clobber downstream state.
   */
  async releaseDriver(id: string, companyId: string) {
    return this.prisma.withTenant(companyId, async (tx) => {
      const collection = await this.findOne(id, companyId, tx);
      if (collection.status !== CollectionStatus.ASSIGNED) {
        throw new BadRequestException('Only assigned collections can be released');
      }
      const updated = await tx.collection.updateMany({
        where: { id, companyId, driverId: collection.driverId, status: CollectionStatus.ASSIGNED },
        data: { driverId: null, status: CollectionStatus.PENDING },
      });
      if (updated.count !== 1) throw new ConflictException('Collection changed; refresh and try again');
      return this.findOne(id, companyId, tx);
    });
  }

  /**
   * getWorkflow — minimal, consistent read model for the Collections command
   * center drawer. Only references the Collection.driver relation (no dispatch/
   * pod/invoice relations exist on Collection). The frontend tolerates missing
   * sub-objects, so a defensive minimal shape is sufficient.
   */
  async getWorkflow(id: string, companyId: string) {
    const collection = await this.findOne(id, companyId);
    return {
      collection: {
        id: collection.id,
        reference: collection.id,
        customerName: collection.clientName,
        destination: collection.pickupAddress,
        syncHealth: collection.status,
        aiPriority: null,
        driverName: collection.driver?.name ?? null,
        driverId: collection.driverId ?? null,
      },
      driver: collection.driver
        ? { id: collection.driver.id, name: collection.driver.name, vehicleType: collection.driver.vehicleType }
        : null,
      dispatch: null,
      shipment: null,
      pod: null,
      invoice: null,
      nextActions: [],
    };
  }

  /**
   * Driver suggestions for a collection. Suggestions are a dispatch decision,
   * so they obey the shared compliance policy: an expired licence, a hold or an
   * overdue service removes a driver from the list here, exactly as it does in
   * auto-dispatch.
   */
  async autoSuggest(id: string, companyId: string) {
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, status: 'AVAILABLE', isActive: true },
      take: 20,
      select: {
        id: true, name: true, phone: true, vehicleType: true, vehicleReg: true,
        companyId: true, isActive: true, status: true,
        licenseExpiry: true, insuranceExpiry: true, backgroundCheckExpiry: true,
        nextServiceDate: true, currentKm: true, nextServiceKm: true,
        complianceHold: true, complianceHoldReason: true,
      },
    });
    const eligible = this.compliance
      .filterDispatchable(
        drivers.map((d) => ({ ...d, driverId: d.id })),
        { availableStatuses: ['AVAILABLE'] },
      )
      .map(({ snapshot }) => snapshot);
    return { drivers: eligible.slice(0, 5), suggestedDriver: eligible[0] ?? null };
  }

  /**
   * confirmCollected — dispatch confirms a collection is picked up.
   *
   * Flow (chain of custody — no longer auto-dispatches):
   * 1. Collection → COLLECTED
   * 2. Waybill created at status COLLECTED (captures delivery address if known)
   * 3. Shipment created as PENDING against the collecting driver for custody
   *    tracking. The parcel must be RECEIVED at the depot (AT_ORIGIN_HUB) before
   *    being loaded onto a linehaul or dispatched for local delivery.
   */
  async confirmCollected(
    id: string,
    companyId: string,
    body: { parcelCount?: number; deliveryAddress?: string; recipientName?: string; recipientPhone?: string; notes?: string },
  ) {
    const collection = await this.findOne(id, companyId);
    if (collection.status === CollectionStatus.COLLECTED) {
      // Replayed/duplicate confirmation: return the waybill linked to this collection.
      const existing = await this.prisma.waybill.findFirst({
        where: { companyId, sourceCollectionId: id },
        select: { id: true, trackingNumber: true, status: true },
      });
      if (!existing) {
        throw new ConflictException('Collection is marked collected but has no linked waybill; contact support');
      }
      return {
        success: false,
        alreadyCollected: true,
        collection: { id, status: CollectionStatus.COLLECTED },
        waybill: existing,
        message: 'Already collected',
      };
    }
    if (!CONFIRMABLE_COLLECTION_STATUSES.includes(collection.status)) {
      throw new BadRequestException(`A ${collection.status.toLowerCase()} collection cannot be confirmed as collected`);
    }

    const trackingNumber = `FO${randomBytes(6).toString('hex').toUpperCase()}`;

    // ONE transaction: claim the collection (compare-and-set), create the
    // waybill (with its provenance link) and record custody. Either all of it
    // happened or none of it did — a COLLECTED collection can no longer exist
    // without its waybill.
    const created = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.collection.updateMany({
        where: {
          id,
          companyId,
          driverId: collection.driverId,
          status: { in: CONFIRMABLE_COLLECTION_STATUSES },
        },
        data: { status: CollectionStatus.COLLECTED, pickedUpAt: new Date() },
      });
      if (claim.count === 0) {
        const [latest, existing] = await Promise.all([
          tx.collection.findFirst({ where: { id, companyId }, select: { status: true } }),
          tx.waybill.findFirst({
            where: { companyId, sourceCollectionId: id },
            select: { id: true, trackingNumber: true, status: true },
          }),
        ]);
        if (latest?.status !== CollectionStatus.COLLECTED || !existing) {
          throw new ConflictException('Collection changed; refresh and try again');
        }
        return { alreadyCollected: true as const, waybill: existing };
      }

      const waybill = await tx.waybill.create({
        data: {
          trackingNumber,
          companyId,
          status: 'COLLECTED',
          sourceCollectionId: id,
          senderName: collection.clientName,
          senderPhone: collection.clientPhone,
          senderEmail: collection.clientEmail ?? undefined,
          senderAddress: collection.pickupAddress,
          recipientName: body.recipientName ?? collection.clientName,
          recipientPhone: body.recipientPhone ?? collection.clientPhone,
          recipientAddress: body.deliveryAddress ?? collection.pickupAddress,
          weight: 0,
          totalAmount: 0,
          description: `Collection pickup — ${body.parcelCount ?? 1} parcel(s). ${body.notes ?? ''}`.trim(),
        },
      });

      const custodyDriverId = collection.driverId ?? null;
      if (custodyDriverId) {
        // The driver physically has the parcel, so custody is recorded even if
        // they are not dispatchable — but the situation is logged for operations
        // rather than hidden.
        if (this.compliance) {
          const check = await this.compliance.evaluate(custodyDriverId, companyId);
          if (!check.compliant) {
            this.logger.warn(
              `Custody recorded for non-dispatchable driver ${custodyDriverId} on collection ${id}: ${check.blockers
                .map((b) => b.code)
                .join(', ')}`,
            );
          }
        }
        await tx.shipment.create({
          data: { waybillId: waybill.id, companyId, driverId: custodyDriverId, status: 'PENDING' },
        });
      }

      await tx.trackingEvent.create({
        data: {
          waybillId: waybill.id,
          companyId,
          event: 'COLLECTED',
          status: 'COLLECTED',
          description: `Parcel collected from ${collection.clientName} at ${collection.pickupAddress}. Awaiting depot receive.`,
          actorType: 'DISPATCH',
          metadata: { collectionId: id },
        },
      });

      return { alreadyCollected: false as const, waybill };
    });

    if (created.alreadyCollected) {
      return {
        success: false,
        alreadyCollected: true,
        collection: { id, status: 'COLLECTED' },
        waybill: created.waybill ?? null,
        message: 'Already collected',
      };
    }

    return {
      success: true,
      collection: { id, status: 'COLLECTED' },
      waybill: { id: created.waybill!.id, trackingNumber, status: 'COLLECTED' },
      awaitingDepotReceive: true,
      message: `Collected! Waybill ${trackingNumber} created. Receive it at the depot before loading or delivery.`,
    };
  }
}
