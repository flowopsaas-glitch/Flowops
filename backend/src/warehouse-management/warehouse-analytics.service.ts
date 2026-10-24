import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WarehouseAnalyticsService {
  private readonly logger = new Logger(WarehouseAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Comprehensive warehouse KPI dashboard — throughput, accuracy,
   * utilisation, dwell time, and operational performance metrics.
   */
  async getKpis(companyId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [movements, receipts, picks, counts, inventory, bins] =
      await Promise.all([
        this.prisma.stockMovement.findMany({
          where: { companyId, performedAt: { gte: since } },
          select: { type: true, quantity: true, performedAt: true },
        }),
        this.prisma.goodsReceipt.findMany({
          where: { companyId, createdAt: { gte: since } },
          select: { status: true, expectedQty: true, receivedQty: true,
            damagedQty: true, arrivedAt: true, completedAt: true },
        }),
        this.prisma.pickOrder.findMany({
          where: { companyId, createdAt: { gte: since } },
          select: { status: true, totalQty: true, pickedQty: true,
            assignedAt: true, completedAt: true, totalLines: true, pickedLines: true },
        }),
        this.prisma.cycleCount.findMany({
          where: { companyId, createdAt: { gte: since } },
          select: { accuracyRate: true, totalVariances: true, varianceValue: true },
        }),
        this.prisma.inventoryItem.aggregate({
          where: { companyId },
          _count: { _all: true },
          _sum: { quantityOnHand: true, quantityAllocated: true },
        }),
        this.prisma.binLocation.findMany({
          where: { zone: { warehouse: { companyId } } },
          select: { isEmpty: true, isBlocked: true },
        }),
      ]);


    // ── Throughput ────────────────────────────────────────────────────────
    const totalMovements = movements.length;
    const receiptsCompleted = receipts.filter(r => r.status === 'COMPLETED').length;
    const picksCompleted = picks.filter(p => ['PICKED', 'PACKED', 'DISPATCHED'].includes(p.status)).length;
    const unitsReceived = receipts.reduce((s, r) => s + r.receivedQty, 0);
    const unitsPicked = picks.reduce((s, p) => s + p.pickedQty, 0);
    const movementsToday = movements.filter(m => new Date(m.performedAt) >= today).length;

    // ── Accuracy ─────────────────────────────────────────────────────────
    // Honest denominators: a rate is only reported when at least one
    // observation exists in the period. With zero observations the rate is
    // null (unavailable) — never 100%, which would claim perfect performance
    // for a warehouse that has not been measured yet. Counts are returned
    // alongside each rate so the UI can disclose numerator/denominator.
    const ratedCounts = counts.filter(c => c.accuracyRate != null);
    const avgCountAccuracy = ratedCounts.length > 0
      ? Math.round(ratedCounts.reduce((s, c) => s + (c.accuracyRate as number), 0) / ratedCounts.length * 10) / 10
      : null;
    const picksFullyPicked = picks.filter(p => p.pickedQty >= p.totalQty).length;
    const pickAccuracy = picks.length > 0
      ? Math.round((picksFullyPicked / picks.length) * 1000) / 10
      : null;
    const completedReceiptsForAccuracy = receipts.filter(r => r.status === 'COMPLETED');
    const undamagedReceipts = completedReceiptsForAccuracy.filter(r => r.damagedQty === 0).length;
    const receiveAccuracy = completedReceiptsForAccuracy.length > 0
      ? Math.round((undamagedReceipts / completedReceiptsForAccuracy.length) * 1000) / 10
      : null;

    // ── Utilisation ──────────────────────────────────────────────────────
    const totalBins = bins.length;
    const occupiedBins = bins.filter(b => !b.isEmpty).length;
    const blockedBins = bins.filter(b => b.isBlocked).length;
    const binUtilisation = totalBins > 0
      ? Math.round((occupiedBins / totalBins) * 1000) / 10 : 0;

    // ── Dwell Time (avg time from receipt to dispatch) ────────────────────
    const completedPicks = picks.filter(p => p.assignedAt && p.completedAt);
    const avgPickTimeHours = completedPicks.length > 0
      ? Math.round(completedPicks.reduce((s, p) => {
          return s + (new Date(p.completedAt!).getTime() - new Date(p.assignedAt!).getTime()) / 3600000;
        }, 0) / completedPicks.length * 10) / 10
      : null;

    const completedReceipts = receipts.filter(r => r.arrivedAt && r.completedAt);
    const avgReceiveTimeHours = completedReceipts.length > 0
      ? Math.round(completedReceipts.reduce((s, r) => {
          return s + (new Date(r.completedAt!).getTime() - new Date(r.arrivedAt!).getTime()) / 3600000;
        }, 0) / completedReceipts.length * 10) / 10
      : null;

    return {
      period: `${days}d`,
      generatedAt: new Date().toISOString(),
      throughput: {
        totalMovements,
        movementsToday,
        receiptsCompleted,
        picksCompleted,
        unitsReceived,
        unitsPicked,
        avgMovementsPerDay: Math.round(totalMovements / days),
      },
      accuracy: {
        inventoryAccuracy: avgCountAccuracy,
        pickAccuracy,
        receiveAccuracy,
        // Observation counts / numerators so consumers can show denominators
        // instead of a bare percentage. Null rate + 0 observations = unavailable.
        inventoryObservations: ratedCounts.length,
        pickOrdersObserved: picks.length,
        picksFullyPicked,
        completedReceiptsObserved: completedReceiptsForAccuracy.length,
        undamagedReceipts,
        totalVariances: counts.reduce((s, c) => s + c.totalVariances, 0),
        varianceValue: Math.round(counts.reduce((s, c) => s + c.varianceValue, 0)),
      },
      utilisation: {
        totalBins,
        occupiedBins,
        blockedBins,
        emptyBins: totalBins - occupiedBins,
        binUtilisation,
        totalUnitsOnHand: inventory._sum.quantityOnHand || 0,
        totalUnitsAllocated: inventory._sum.quantityAllocated || 0,
        totalSKUs: inventory._count._all,
      },
      efficiency: {
        avgPickTimeHours,
        avgReceiveTimeHours,
        pickOrdersBacklog: picks.filter(p => ['PENDING', 'ASSIGNED'].includes(p.status)).length,
        receiptsBacklog: receipts.filter(r => ['EXPECTED', 'ARRIVED'].includes(r.status)).length,
      },
    };
  }
}
