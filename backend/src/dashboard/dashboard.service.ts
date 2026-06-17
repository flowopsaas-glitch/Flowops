import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getMetrics(companyId: string) {
    const [
      collections, activeDrivers, transit, stock, delivered, risks, waybillsToday, locatedDrivers,
    ] = await Promise.all([
      this.prisma.collection.count({ where: { companyId, status: { notIn: ['CANCELLED', 'COLLECTED'] } } }),
      this.prisma.driver.count({ where: { companyId, status: { in: ['AVAILABLE', 'ON_ROUTE'] } } }),
      this.prisma.shipment.count({ where: { companyId, status: 'IN_TRANSIT' } }),
      this.prisma.waybill.count({ where: { companyId, status: 'PENDING' } }),
      this.prisma.waybill.count({ where: { companyId, status: 'DELIVERED' } }),
      this.prisma.waybill.count({ where: { companyId, riskLevel: { in: ['HIGH', 'CRITICAL'] } } }),
      this.prisma.waybill.count({
        where: {
          companyId,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      // Drivers with a known last GPS position — feeds the live dashboard map
      // so it renders markers on first load (not only after a socket event).
      this.prisma.driver.findMany({
        where: {
          companyId,
          isActive: true,
          lastLat: { not: null },
          lastLng: { not: null },
        },
        select: { id: true, name: true, vehicleReg: true, lastLat: true, lastLng: true },
        take: 500,
      }),
    ]);

    const drivers = locatedDrivers.map((d) => ({
      id: d.id,
      name: d.name,
      vehicleReg: d.vehicleReg ?? '—',
      lat: d.lastLat,
      lng: d.lastLng,
    }));

    return { collections, activeDrivers, transit, stock, delivered, risks, waybillsToday, drivers };
  }

  /**
   * Real, computed business KPIs for the tenant dashboard — each compared
   * against the prior 30-day window so the UI can show an honest trend delta.
   * Every value is derived from live data (no hardcoded targets).
   */
  async getKpis(companyId: string) {
    const now = new Date();
    const d30 = new Date(now);
    d30.setDate(now.getDate() - 30);
    const d60 = new Date(now);
    d60.setDate(now.getDate() - 60);

    const [current, previous, overdue] = await Promise.all([
      this.windowMetrics(companyId, d30, now),
      this.windowMetrics(companyId, d60, d30),
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: { companyId, status: 'OVERDUE' },
      }),
    ]);

    const round = (n: number) => Math.round(n * 10) / 10;
    const delta = (value: number, prev: number) =>
      prev > 0 ? round(((value - prev) / prev) * 100) : null;

    const kpi = (
      value: number,
      prev: number,
      unit: 'percent' | 'hours' | 'currency',
      goodDirection: 'up' | 'down',
    ) => ({
      value: round(value),
      previous: round(prev),
      delta: delta(value, prev),
      unit,
      goodDirection,
    });

    return {
      period: '30d',
      onTimeDeliveryRate: kpi(current.onTimeRate, previous.onTimeRate, 'percent', 'up'),
      deliverySuccessRate: kpi(current.deliverySuccessRate, previous.deliverySuccessRate, 'percent', 'up'),
      avgDeliveryHours: kpi(current.avgDeliveryHours, previous.avgDeliveryHours, 'hours', 'down'),
      revenuePerWaybill: kpi(current.revenuePerWaybill, previous.revenuePerWaybill, 'currency', 'up'),
      exceptionRate: kpi(current.exceptionRate, previous.exceptionRate, 'percent', 'down'),
      outstandingRevenue: {
        value: round(overdue._sum.total || 0),
        previous: null,
        delta: null,
        unit: 'currency' as const,
        goodDirection: 'down' as const,
      },
    };
  }

  /** Computes the KPI inputs for a single [start, end) window. */
  private async windowMetrics(companyId: string, start: Date, end: Date) {
    const [shipments, delivered, failed, returned, invoiceAgg, waybillCount] =
      await Promise.all([
        this.prisma.shipment.findMany({
          where: { companyId, deliveredAt: { gte: start, lt: end } },
          select: { createdAt: true, deliveredAt: true, estimatedDelivery: true },
        }),
        this.prisma.waybill.count({
          where: { companyId, status: 'DELIVERED', updatedAt: { gte: start, lt: end } },
        }),
        this.prisma.waybill.count({
          where: { companyId, status: 'FAILED_DELIVERY', updatedAt: { gte: start, lt: end } },
        }),
        this.prisma.waybill.count({
          where: { companyId, status: 'RETURNED', updatedAt: { gte: start, lt: end } },
        }),
        this.prisma.invoice.aggregate({
          _sum: { total: true },
          where: { companyId, createdAt: { gte: start, lt: end } },
        }),
        this.prisma.waybill.count({
          where: { companyId, createdAt: { gte: start, lt: end } },
        }),
      ]);

    let onTimeNum = 0;
    let onTimeDen = 0;
    let totalHours = 0;
    let deliveredWithDates = 0;
    for (const s of shipments) {
      if (!s.deliveredAt) continue;
      if (s.estimatedDelivery) {
        onTimeDen++;
        if (s.deliveredAt <= s.estimatedDelivery) onTimeNum++;
      }
      totalHours += (s.deliveredAt.getTime() - s.createdAt.getTime()) / 3_600_000;
      deliveredWithDates++;
    }

    const outcomeTotal = delivered + failed + returned;
    const revenue = invoiceAgg._sum.total || 0;

    return {
      onTimeRate: onTimeDen ? (onTimeNum / onTimeDen) * 100 : 0,
      deliverySuccessRate: outcomeTotal ? (delivered / outcomeTotal) * 100 : 0,
      exceptionRate: outcomeTotal ? ((failed + returned) / outcomeTotal) * 100 : 0,
      avgDeliveryHours: deliveredWithDates ? totalHours / deliveredWithDates : 0,
      revenuePerWaybill: waybillCount ? revenue / waybillCount : 0,
    };
  }

  async getActivities(companyId: string, limit = 20) {
    // Recent waybill events + collections as activity feed
    const [waybills, collections, notifications] = await Promise.all([
      this.prisma.waybill.findMany({
        where: { companyId },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, trackingNumber: true, status: true, updatedAt: true, recipientName: true },
      }),
      this.prisma.collection.findMany({
        where: { companyId },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, clientName: true, status: true, updatedAt: true },
      }),
      this.prisma.notification.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, title: true, type: true, createdAt: true },
      }),
    ]);

    // Merge and sort by timestamp
    const feed = [
      ...waybills.map(w => ({ type: 'waybill', ...w, ts: w.updatedAt })),
      ...collections.map(c => ({ type: 'collection', ...c, ts: c.updatedAt })),
      ...notifications.map(n => ({ type: 'notification', ...n, ts: n.createdAt })),
    ]
      .sort((a, b) => b.ts.getTime() - a.ts.getTime())
      .slice(0, limit);

    return feed;
  }

  // GET /collections-state-sync/dashboard
  async getCollectionsSyncDashboard(companyId: string) {
    const counts = await this.prisma.collection.groupBy({
      by: ['status'],
      where: { companyId },
      _count: true,
    });
    const byStatus = Object.fromEntries(counts.map(c => [c.status, c._count]));
    return { byStatus, syncedAt: new Date().toISOString() };
  }

  // GET /collections-state-sync/records
  async getCollectionsSyncRecords(companyId: string) {
    return this.prisma.collection.findMany({
      where: { companyId, status: { notIn: ['CANCELLED'] } },
      include: { driver: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  // POST /collections-state-sync/bulk-sync
  async bulkSync(companyId: string) {
    // Trigger re-assignment logic (stub — plugs into real routing later)
    return { synced: true, ts: new Date().toISOString() };
  }

  // GET /collections-state-sync/suggest-driver/:collectionId
  async suggestDriver(companyId: string, collectionId: string) {
    // Confirm the collection belongs to this tenant. This also anchors future
    // geo-proximity scoring once pickup coordinates/geocoding are available
    // (Collection currently stores only a free-text pickupAddress).
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, companyId },
      select: { id: true },
    });
    if (!collection) return { suggestion: null, candidates: [] };

    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true, status: { in: ['AVAILABLE', 'ON_ROUTE'] } },
      select: { id: true, name: true, vehicleType: true, status: true, lastSeen: true },
    });
    if (!drivers.length) return { suggestion: null, candidates: [] };

    // Current open workload per driver — fewer open jobs ranks higher.
    const loads = await this.prisma.collection.groupBy({
      by: ['driverId'],
      where: {
        companyId,
        driverId: { in: drivers.map((d) => d.id) },
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      },
      _count: { _all: true },
    });
    const loadByDriver = new Map<string, number>(
      loads.map((l) => [l.driverId as string, l._count._all]),
    );

    const now = Date.now();
    const scored = drivers
      .map((d) => {
        // Availability: idle drivers preferred over those already mid-route.
        const availability = d.status === 'AVAILABLE' ? 1 : 0.4;
        // Load: open jobs, saturating at 5 (0 jobs = 1.0, 5+ jobs = 0).
        const load = loadByDriver.get(d.id) ?? 0;
        const loadScore = Math.max(0, 1 - load / 5);
        // Recency: a fresh GPS/heartbeat (<60 min) implies a truly active driver.
        const minsSinceSeen = d.lastSeen
          ? (now - d.lastSeen.getTime()) / 60_000
          : Number.POSITIVE_INFINITY;
        const recency = Number.isFinite(minsSinceSeen)
          ? Math.max(0, 1 - minsSinceSeen / 60)
          : 0.2;

        const round = (n: number) => Math.round(n * 100) / 100;
        const score = round(0.5 * availability + 0.3 * loadScore + 0.2 * recency);

        return {
          id: d.id,
          name: d.name,
          vehicleType: d.vehicleType,
          score,
          factors: {
            availability: round(availability),
            openJobs: load,
            loadScore: round(loadScore),
            recency: round(recency),
          },
        };
      })
      .sort((a, b) => b.score - a.score);

    return { suggestion: scored[0], candidates: scored.slice(0, 5) };
  }
}
