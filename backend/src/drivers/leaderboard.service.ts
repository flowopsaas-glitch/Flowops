import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DriverPerformance {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  vehicleReg: string | null;
  rank: number;
  score: number; // composite score 0-100
  deliveries: number;
  onTimeCount: number;
  onTimePct: number;
  failedCount: number;
  customerRatingAvg: number | null;
  codCollected: number;
  collectionsCompleted: number;
  status: string;
}

@Injectable()
export class LeaderboardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Computes a ranked leaderboard of driver performance for the current period.
   * Metrics: deliveries completed, on-time %, customer ratings, COD collected.
   */
  async getLeaderboard(companyId: string, period?: string): Promise<DriverPerformance[]> {
    const { start, end } = this.periodRange(period);

    // Get all active drivers for this company
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true, name: true, phone: true, vehicleType: true,
        vehicleReg: true, status: true,
      },
    });

    if (drivers.length === 0) return [];

    const driverIds = drivers.map(d => d.id);

    // Parallel data fetching for all metrics
    const [
      shipmentsByDriver,
      deliveredByDriver,
      failedByDriver,
      ratingsByDriver,
      codByDriver,
      collectionsByDriver,
    ] = await Promise.all([
      // Total shipments assigned per driver this period
      this.prisma.shipment.groupBy({
        by: ['driverId'],
        where: { companyId, driverId: { in: driverIds }, createdAt: { gte: start, lt: end } },
        _count: { _all: true },
      }),
      // Delivered shipments per driver
      this.prisma.shipment.groupBy({
        by: ['driverId'],
        where: { companyId, driverId: { in: driverIds }, status: 'DELIVERED', deliveredAt: { gte: start, lt: end } },
        _count: { _all: true },
      }),
      // Failed deliveries per driver (waybills assigned via shipments)
      this.prisma.shipment.groupBy({
        by: ['driverId'],
        where: { companyId, driverId: { in: driverIds }, status: 'FAILED', createdAt: { gte: start, lt: end } },
        _count: { _all: true },
      }),
      // Customer ratings on waybills delivered by driver (via shipments)
      this.prisma.shipment.findMany({
        where: {
          companyId, driverId: { in: driverIds }, status: 'DELIVERED',
          deliveredAt: { gte: start, lt: end },
          waybill: { customerRating: { not: null } },
        },
        select: { driverId: true, waybill: { select: { customerRating: true } } },
      }),
      // COD collected per driver
      this.prisma.codTransaction.groupBy({
        by: ['walletId'],
        where: { companyId, type: 'COLLECTION', createdAt: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      // Collections completed per driver
      this.prisma.collection.groupBy({
        by: ['driverId'],
        where: { companyId, driverId: { in: driverIds }, status: 'COLLECTED', updatedAt: { gte: start, lt: end } },
        _count: { _all: true },
      }),
    ]);

    // Get wallets to map walletId -> driverId
    const wallets = await this.prisma.driverWallet.findMany({
      where: { driverId: { in: driverIds } },
      select: { id: true, driverId: true },
    });
    const walletToDriver = new Map(wallets.map(w => [w.id, w.driverId]));

    // Build lookup maps
    const deliveredMap = new Map(deliveredByDriver.map(d => [d.driverId, d._count._all]));
    const failedMap = new Map(failedByDriver.map(d => [d.driverId, d._count._all]));
    const collectionsMap = new Map(collectionsByDriver.map(c => [c.driverId, c._count._all]));

    // Ratings per driver
    const ratingsMap = new Map<string, number[]>();
    for (const s of ratingsByDriver) {
      if (!s.driverId || !s.waybill.customerRating) continue;
      if (!ratingsMap.has(s.driverId)) ratingsMap.set(s.driverId, []);
      ratingsMap.get(s.driverId)!.push(s.waybill.customerRating);
    }

    // COD per driver
    const codMap = new Map<string, number>();
    for (const c of codByDriver) {
      const driverId = walletToDriver.get(c.walletId);
      if (driverId) codMap.set(driverId, (codMap.get(driverId) || 0) + (c._sum.amount || 0));
    }

    // Compute performance for each driver
    const performances: DriverPerformance[] = drivers.map(d => {
      const deliveries = deliveredMap.get(d.id) || 0;
      const failed = failedMap.get(d.id) || 0;
      const total = deliveries + failed;
      const onTimePct = total > 0 ? Math.round((deliveries / total) * 100) : 0;
      const ratings = ratingsMap.get(d.id) || [];
      const ratingAvg = ratings.length > 0
        ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
        : null;
      const cod = codMap.get(d.id) || 0;
      const collections = collectionsMap.get(d.id) || 0;

      // Composite score (weighted):
      // 40% deliveries (normalized), 25% on-time, 20% rating, 15% collections
      const maxDeliveries = Math.max(...drivers.map(dd => deliveredMap.get(dd.id) || 0), 1);
      const deliveryScore = (deliveries / maxDeliveries) * 40;
      const onTimeScore = (onTimePct / 100) * 25;
      const ratingScore = ratingAvg ? (ratingAvg / 5) * 20 : 10; // default 50% if no ratings
      const collectionScore = collections > 0 ? Math.min((collections / 10), 1) * 15 : 0;
      const score = Math.round(deliveryScore + onTimeScore + ratingScore + collectionScore);

      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        vehicleType: d.vehicleType,
        vehicleReg: d.vehicleReg,
        rank: 0, // set after sorting
        score,
        deliveries,
        onTimeCount: deliveries,
        onTimePct,
        failedCount: failed,
        customerRatingAvg: ratingAvg,
        codCollected: Math.round(cod),
        collectionsCompleted: collections,
        status: d.status,
      };
    });

    // Sort by score descending and assign ranks
    performances.sort((a, b) => b.score - a.score);
    performances.forEach((p, i) => { p.rank = i + 1; });

    return performances;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private periodRange(period?: string): { start: Date; end: Date } {
    if (period) {
      const [year, month] = period.split('-').map(Number);
      return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
    }
    // Default: current month
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
}
