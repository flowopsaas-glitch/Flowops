import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getMetrics(companyId: string) {
    const [
      collections, activeDrivers, transit, stock, delivered, risks, waybillsToday,
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
    ]);

    return { collections, activeDrivers, transit, stock, delivered, risks, waybillsToday };
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
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, status: 'AVAILABLE', isActive: true },
      take: 1,
    });
    if (!drivers.length) return { suggestion: null };
    const d = drivers[0];
    return {
      suggestion: {
        id: d.id,
        name: d.name,
        vehicleType: d.vehicleType,
        score: 0.85,
      },
    };
  }
}
