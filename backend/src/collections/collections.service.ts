import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CollectionsService {
  constructor(
    private prisma: PrismaService,
    private geo: GeocodingService,
    private notifications: NotificationsService,
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

  async findOne(id: string, companyId: string) {
    const c = await this.prisma.collection.findFirst({
      where: { id, companyId },
      include: { driver: true, agent: { select: { id: true, name: true } } },
    });
    if (!c) throw new NotFoundException('Collection not found');
    return c;
  }

  async create(companyId: string, dto: any) {
    const data: any = { ...dto, companyId };

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
    await this.findOne(id, companyId);
    const data: any = { ...dto };
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
    return this.prisma.collection.update({ where: { id }, data });
  }

  async cancel(id: string, companyId: string) {
    return this.update(id, companyId, { status: 'CANCELLED' });
  }

  /**
   * assignDriver — attach a driver to a collection and move it to ASSIGNED.
   * Tenant-scoped: findOne() guards the collection ownership, and the driver
   * must belong to the same company.
   */
  async assignDriver(id: string, companyId: string, driverId: string) {
    await this.findOne(id, companyId);
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, companyId } });
    if (!driver) throw new NotFoundException('Driver not found');
    return this.prisma.collection.update({
      where: { id },
      data: { driverId, status: 'ASSIGNED' },
      include: { driver: true },
    });
  }

  /**
   * releaseDriver — detach the driver from a collection. Only reset an ASSIGNED
   * collection back to PENDING; leave IN_PROGRESS/COLLECTED/etc untouched so we
   * don't clobber downstream state.
   */
  async releaseDriver(id: string, companyId: string) {
    const collection = await this.findOne(id, companyId);
    const data: any = { driverId: null };
    if (collection.status === 'ASSIGNED') data.status = 'PENDING';
    return this.prisma.collection.update({
      where: { id },
      data,
      include: { driver: true },
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

  async autoSuggest(id: string, companyId: string) {
    // Return available drivers as suggestions
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, status: 'AVAILABLE', isActive: true },
      take: 5,
    });
    return { drivers, suggestedDriver: drivers[0] ?? null };
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
    if (collection.status === 'COLLECTED') {
      return { success: false, message: 'Already collected' };
    }

    // 1. Mark as COLLECTED
    await this.prisma.collection.update({
      where: { id },
      data: { status: 'COLLECTED', pickedUpAt: new Date() },
    });

    // 2. Generate tracking number and create Waybill.
    //    Chain of custody: the parcel is COLLECTED, not yet IN_TRANSIT. It must
    //    be received at the depot (warehouse clerk → AT_ORIGIN_HUB) before it's
    //    loaded onto a linehaul or dispatched for local delivery. We capture the
    //    real delivery address here if the dispatcher provided one, but we do
    //    NOT auto-dispatch a final-mile driver — the depot receive + dispatch
    //    decide the onward leg.
    const trackingNumber = `FO${Date.now().toString().slice(-8)}`;
    const waybill = await this.prisma.waybill.create({
      data: {
        trackingNumber,
        companyId,
        status: 'COLLECTED',
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

    // 3. Create the Shipment linking waybill ↔ collecting driver as PENDING
    //    (custody tracking), NOT auto-dispatched. If no driver collected it yet,
    //    leave it unassigned for the depot to route.
    const custodyDriverId = collection.driverId ?? null;
    if (custodyDriverId) {
      await this.prisma.shipment.create({
        data: {
          waybillId: waybill.id,
          companyId,
          driverId: custodyDriverId,
          status: 'PENDING',
        },
      });
    }

    return {
      success: true,
      collection: { id, status: 'COLLECTED' },
      waybill: { id: waybill.id, trackingNumber, status: 'COLLECTED' },
      awaitingDepotReceive: true,
      message: `Collected! Waybill ${trackingNumber} created. Receive it at the depot before loading or delivery.`,
    };
  }
}
