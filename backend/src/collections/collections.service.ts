import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';

@Injectable()
export class CollectionsService {
  constructor(
    private prisma: PrismaService,
    private geo: GeocodingService,
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
    // Geocode the pickup address so the collection lands on the map and can be
    // routed/assigned by proximity. Best-effort: never blocks creation.
    if (data.pickupAddress && (data.pickupLat == null || data.pickupLng == null)) {
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
    return this.prisma.collection.create({ data });
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

  async autoSuggest(id: string, companyId: string) {
    // Return available drivers as suggestions
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, status: 'AVAILABLE', isActive: true },
      take: 5,
    });
    return { drivers, suggestedDriver: drivers[0] ?? null };
  }
}
