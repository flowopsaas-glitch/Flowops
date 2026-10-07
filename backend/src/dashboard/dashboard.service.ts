import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KpiConsistencyService, KPI_NO_DATA_NOTE } from '../common/kpi/kpi-consistency.service';
import { GeocodingService } from '../geocoding/geocoding.service';

/** Average road speed used for ETA estimates (km/h).
 *  40 km/h is conservative for urban SA deliveries on a busy day. */
const AVG_SPEED_KMH = 40;

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    /**
     * All KPI maths goes through the shared service so a rate with no data is
     * reported as "—" (null) and never as a bogus 0/100%, averages exclude
     * impossible samples, and the sample size travels with each number.
     */
    private kpiMath: KpiConsistencyService,
  ) {}

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

    /**
     * A KPI point. `value`/`previous` are null when there is no valid data for
     * the window — the UI shows "—" and reads `hasData`/`sampleSize`, instead of
     * comparing 0% against 0% and reporting a fake trend. A delta is only
     * computed when BOTH windows have data and the previous value is positive.
     */
    const kpi = (
      rate: { percentage: number | null; hasData: boolean },
      prev: { percentage: number | null; hasData: boolean },
      unit: 'percent' | 'hours' | 'currency',
      goodDirection: 'up' | 'down',
      sampleSize?: number,
    ) => {
      const value = rate.percentage;
      const previous = prev.percentage;
      return {
        value: value == null ? null : round(value),
        previous: previous == null ? null : round(previous),
        delta:
          value != null && previous != null && previous > 0
            ? round(((value - previous) / previous) * 100)
            : null,
        unit,
        goodDirection,
        hasData: rate.hasData,
        ...(sampleSize != null ? { sampleSize } : {}),
      };
    };

    return {
      period: '30d',
      noDataNote: KPI_NO_DATA_NOTE,
      onTimeDeliveryRate: kpi(current.onTime, previous.onTime, 'percent', 'up', current.onTime.denominator),
      deliverySuccessRate: kpi(
        current.deliverySuccess, previous.deliverySuccess, 'percent', 'up', current.deliverySuccess.denominator,
      ),
      avgDeliveryHours: {
        value: current.avgDeliveryHours.value == null ? null : round(current.avgDeliveryHours.value),
        previous: previous.avgDeliveryHours.value == null ? null : round(previous.avgDeliveryHours.value),
        delta:
          current.avgDeliveryHours.value != null && previous.avgDeliveryHours.value != null && previous.avgDeliveryHours.value > 0
            ? round(((current.avgDeliveryHours.value - previous.avgDeliveryHours.value) / previous.avgDeliveryHours.value) * 100)
            : null,
        unit: 'hours' as const,
        goodDirection: 'down' as const,
        hasData: current.avgDeliveryHours.value != null,
        // Sample size + how many records were dropped as impossible (clock skew).
        sampleSize: current.avgDeliveryHours.count,
        excludedSamples: current.avgDeliveryHours.excluded,
      },
      revenuePerWaybill: kpi(
        current.revenuePerWaybill, previous.revenuePerWaybill, 'currency', 'up', current.revenuePerWaybill.denominator,
      ),
      exceptionRate: kpi(current.exception, previous.exception, 'percent', 'down', current.exception.denominator),
      outstandingRevenue: {
        value: round(overdue._sum.total || 0),
        previous: null,
        delta: null,
        unit: 'currency' as const,
        goodDirection: 'down' as const,
        hasData: true,
      },
    };
  }

  /**
   * Daily performance trend series for the exec dashboard. Returns one point
   * per day over the requested window (7–90 days) with shipment volume created,
   * deliveries completed, exceptions (failed/returned) and invoiced revenue —
   * the time-series view the point-in-time KPI cards can't show. All derived
   * from live tenant data; `delivered`/`exceptions` are bucketed by the day the
   * waybill reached that status (updatedAt), consistent with the KPI window.
   */
  async getTrends(companyId: string, days = 30) {
    const n = Math.min(90, Math.max(7, Math.floor(days) || 30));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(today);
    start.setDate(today.getDate() - (n - 1));

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);

    // Seed an ordered bucket map so every day appears even with zero activity.
    const buckets = new Map<string, { date: string; created: number; delivered: number; exceptions: number; revenue: number }>();
    for (let i = 0; i < n; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      buckets.set(dayKey(d), { date: dayKey(d), created: 0, delivered: 0, exceptions: 0, revenue: 0 });
    }

    const [created, statusChanged, invoices] = await Promise.all([
      this.prisma.waybill.findMany({
        where: { companyId, createdAt: { gte: start } },
        select: { createdAt: true },
      }),
      this.prisma.waybill.findMany({
        where: {
          companyId,
          updatedAt: { gte: start },
          status: { in: ['DELIVERED', 'FAILED_DELIVERY', 'RETURNED'] },
        },
        select: { status: true, updatedAt: true },
      }),
      this.prisma.invoice.findMany({
        where: { companyId, createdAt: { gte: start } },
        select: { total: true, createdAt: true },
      }),
    ]);

    for (const w of created) {
      const b = buckets.get(dayKey(w.createdAt));
      if (b) b.created += 1;
    }
    for (const w of statusChanged) {
      const b = buckets.get(dayKey(w.updatedAt));
      if (!b) continue;
      if (w.status === 'DELIVERED') b.delivered += 1;
      else b.exceptions += 1;
    }
    for (const inv of invoices) {
      const b = buckets.get(dayKey(inv.createdAt));
      if (b) b.revenue += inv.total || 0;
    }

    const series = [...buckets.values()].map((b) => ({ ...b, revenue: Math.round(b.revenue) }));
    const totals = series.reduce(
      (acc, b) => {
        acc.created += b.created;
        acc.delivered += b.delivered;
        acc.exceptions += b.exceptions;
        acc.revenue += b.revenue;
        return acc;
      },
      { created: 0, delivered: 0, exceptions: 0, revenue: 0 },
    );

    // Momentum: compare the most recent half of the window to the prior half.
    const half = Math.floor(n / 2);
    const recent = series.slice(n - half);
    const prior = series.slice(n - 2 * half, n - half);
    const sum = (arr: typeof series, k: 'created' | 'delivered' | 'exceptions' | 'revenue') =>
      arr.reduce((s, b) => s + (b[k] as number), 0);
    const pctDelta = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);

    return {
      days: n,
      series,
      totals,
      momentum: {
        created: pctDelta(sum(recent, 'created'), sum(prior, 'created')),
        delivered: pctDelta(sum(recent, 'delivered'), sum(prior, 'delivered')),
        revenue: pctDelta(sum(recent, 'revenue'), sum(prior, 'revenue')),
      },
      note:
        'Live tenant data. Deliveries and exceptions are bucketed by the day the waybill reached that status; revenue is invoiced value by invoice date.',
    };
  }

  /**
   * Computes the KPI inputs for a single [start, end) window.
   *
   * Validity rules applied here (all through KpiConsistencyService):
   *  - on-time is judged ONLY on shipments that were delivered inside the window
   *    AND carried an estimate; shipments without one are not "late";
   *  - a delivery whose timestamps are impossible (arrived before it was picked
   *    up, i.e. clock skew or bad data) is excluded from the duration average
   *    rather than dragging it negative; the same bounds reject implausible
   *    multi-month values;
   *  - rates with no denominator are null so the API can say "no data".
   */
  private async windowMetrics(companyId: string, start: Date, end: Date) {
    const [shipments, delivered, failed, returned, invoiceAgg, waybillCount] =
      await Promise.all([
        this.prisma.shipment.findMany({
          // Only completed deliveries inside the window: a shipment whose
          // deliveredAt is set but which was never actually completed (status
          // not DELIVERED) is partial data and must not count as an outcome.
          where: {
            companyId,
            status: 'DELIVERED',
            deliveredAt: { gte: start, lt: end },
          },
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
    const durations: Array<number | null> = [];
    for (const s of shipments) {
      if (!s.deliveredAt) continue; // defensive: the query filters these out
      if (s.estimatedDelivery) {
        onTimeDen++;
        if (s.deliveredAt <= s.estimatedDelivery) onTimeNum++;
      }
      const hours = (s.deliveredAt.getTime() - s.createdAt.getTime()) / 3_600_000;
      // Negative (arrived before pickup) or absurd (>30 days) durations are data
      // errors, not logistics; `average()` drops them and reports how many.
      durations.push(hours);
    }

    const outcomeTotal = delivered + failed + returned;
    const revenue = invoiceAgg._sum.total || 0;

    return {
      onTime: this.kpiMath.rate(onTimeNum, onTimeDen),
      deliverySuccess: this.kpiMath.rate(delivered, outcomeTotal),
      exception: this.kpiMath.rate(failed + returned, outcomeTotal),
      avgDeliveryHours: this.kpiMath.average(durations, { min: 0, max: 30 * 24, unit: 'hours' }),
      revenuePerWaybill: this.kpiMath.rate(revenue, waybillCount),
    };
  }

  /**
   * Freight-forwarding control-tower metrics (import/export). Powers the
   * Forwarding View on the dashboard — shipment files by mode/direction,
   * arrivals window, customs pipeline, demurrage risk, ETA exceptions and
   * gross profit. All derived from live forwarding data, tenant-scoped.
   */
  async getForwardingMetrics(companyId: string) {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86_400_000);
    const in14 = new Date(now.getTime() + 14 * 86_400_000);
    const OPEN: any = { notIn: ['DELIVERED', 'CANCELLED'] };

    const [
      totalFiles, openFiles, byMode, byDirection,
      arriving7, arriving14, etaExceptions,
      customsByStatus, charges, openContainers, recentFiles,
    ] = await Promise.all([
      this.prisma.shipmentFile.count({ where: { companyId } }),
      this.prisma.shipmentFile.count({ where: { companyId, status: OPEN } }),
      this.prisma.shipmentFile.groupBy({ by: ['mode'], where: { companyId }, _count: { _all: true } }),
      this.prisma.shipmentFile.groupBy({ by: ['direction'], where: { companyId }, _count: { _all: true } }),
      this.prisma.shipmentFile.count({ where: { companyId, status: OPEN, eta: { gte: now, lte: in7 } } }),
      this.prisma.shipmentFile.count({ where: { companyId, status: OPEN, eta: { gte: now, lte: in14 } } }),
      this.prisma.shipmentFile.count({
        where: { companyId, eta: { lt: now }, status: { notIn: ['CUSTOMS_CLEARED', 'DELIVERED', 'CANCELLED'] } as any },
      }),
      this.prisma.customsDeclaration.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
      this.prisma.shipmentCharge.findMany({ where: { file: { companyId } }, select: { cost: true, sell: true } }),
      this.prisma.shipmentContainer.findMany({
        where: { file: { companyId }, availableFrom: { not: null }, returnedAt: null },
        select: { freeDays: true, availableFrom: true },
      }),
      this.prisma.shipmentFile.findMany({
        where: { companyId },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: {
          id: true, fileNumber: true, mode: true, direction: true, status: true,
          pol: true, pod: true, eta: true, aiRiskScore: true, consigneeName: true,
        },
      }),
    ]);

    let revenue = 0, cost = 0;
    for (const c of charges) { revenue += c.sell || 0; cost += c.cost || 0; }

    let demurrageAtRisk = 0;
    for (const ct of openContainers) {
      if (ct.availableFrom == null) continue;
      const daysOut = (now.getTime() - new Date(ct.availableFrom).getTime()) / 86_400_000;
      if (daysOut >= (ct.freeDays ?? 0) - 2) demurrageAtRisk++;
    }

    const m: any = {}; for (const x of byMode) m[x.mode] = x._count._all;
    const d: any = {}; for (const x of byDirection) d[x.direction] = x._count._all;
    const c: any = {}; for (const x of customsByStatus) c[x.status] = x._count._all;

    return {
      totalFiles,
      openFiles,
      mode: { OCEAN: m.OCEAN || 0, AIR: m.AIR || 0, ROAD: m.ROAD || 0 },
      direction: { IMPORT: d.IMPORT || 0, EXPORT: d.EXPORT || 0 },
      arriving7,
      arriving14,
      etaExceptions,
      customs: {
        draft: c.DRAFT || 0, submitted: c.SUBMITTED || 0, query: c.QUERY || 0,
        released: c.RELEASED || 0, rejected: c.REJECTED || 0,
      },
      demurrageAtRisk,
      revenue: Math.round(revenue),
      cost: Math.round(cost),
      grossProfit: Math.round(revenue - cost),
      recentFiles,
    };
  }

  /**
   * Operations Command Centre summary — today's stats, driver leaderboard,
   * unassigned collections, and a 7-day delivery trend for the manager view.
   */
  async getOperationsSummary(companyId: string) {
    const now    = new Date();
    const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d7     = new Date(today); d7.setDate(today.getDate() - 7);
    const d24    = new Date(now.getTime() - 86_400_000);

    const [
      todayCollections, unassignedCols, driverCounts, recentDeliveries,
      recentFailed, exceptionWaybills, driverLeaderboard, trend7, allShipments,
    ] = await Promise.all([
      // Today's collection counts grouped by status
      this.prisma.collection.groupBy({
        by: ['status'],
        where: { companyId, createdAt: { gte: today } },
        _count: { _all: true },
      }),
      // Unassigned pending collections (no driver, no shipment yet)
      this.prisma.collection.findMany({
        where: { companyId, status: 'PENDING', driverId: null },
        select: { id: true, clientName: true, pickupAddress: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
      // Driver availability counts
      this.prisma.driver.groupBy({
        by: ['status'],
        where: { companyId, isActive: true },
        _count: { _all: true },
      }),
      // Deliveries completed today
      this.prisma.waybill.count({
        where: { companyId, status: 'DELIVERED', updatedAt: { gte: today } },
      }),
      // Failed/returned today
      this.prisma.waybill.count({
        where: { companyId, status: { in: ['FAILED_DELIVERY', 'RETURNED'] }, updatedAt: { gte: today } },
      }),
      // Exception feed — failed/returned in last 24h with waybill info
      this.prisma.waybill.findMany({
        where: {
          companyId,
          status: { in: ['FAILED_DELIVERY', 'RETURNED'] },
          updatedAt: { gte: d24 },
        },
        select: {
          id: true, trackingNumber: true, status: true, updatedAt: true,
          recipientName: true, recipientAddress: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      // Driver leaderboard — collections completed (IN_PROGRESS or COLLECTED) today per driver
      this.prisma.collection.groupBy({
        by: ['driverId'],
        where: {
          companyId,
          driverId: { not: null },
          status: { in: ['IN_PROGRESS', 'COLLECTED'] },
          updatedAt: { gte: today },
        },
        _count: { _all: true },
        orderBy: { _count: { driverId: 'desc' } },
        take: 5,
      }),
      // 7-day delivery trend
      this.prisma.waybill.findMany({
        where: { companyId, status: 'DELIVERED', updatedAt: { gte: d7 } },
        select: { updatedAt: true },
      }),
      // Active shipments count
      this.prisma.shipment.count({
        where: { companyId, status: { in: ['PENDING', 'IN_TRANSIT'] } },
      }),
    ]);

    // Resolve driver names for leaderboard
    const driverIds = driverLeaderboard.map(d => d.driverId as string).filter(Boolean);
    const driverNames = driverIds.length
      ? await this.prisma.driver.findMany({
          where: { id: { in: driverIds } },
          select: { id: true, name: true, vehicleType: true, status: true },
        })
      : [];
    const driverMap = new Map(driverNames.map(d => [d.id, d]));

    // Build 7-day trend array (last 7 days, each with a count)
    const trendMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      trendMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const wb of trend7) {
      const key = wb.updatedAt.toISOString().slice(0, 10);
      if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
    }
    const trend = Array.from(trendMap.entries()).map(([date, count]) => ({ date, count }));

    // Collection status map
    const colByStatus: Record<string, number> = {};
    for (const g of todayCollections) colByStatus[g.status] = g._count._all;

    // Driver availability map
    const driverByStatus: Record<string, number> = {};
    for (const g of driverCounts) driverByStatus[g.status] = g._count._all;

    return {
      today: {
        collected:     colByStatus['COLLECTED']   ?? 0,
        inProgress:    colByStatus['IN_PROGRESS'] ?? 0,
        pending:       colByStatus['PENDING']     ?? 0,
        failed:        colByStatus['FAILED']      ?? 0,
        deliveredWaybills: recentDeliveries,
        failedWaybills:    recentFailed,
        activeShipments:   allShipments,
      },
      drivers: {
        available: driverByStatus['AVAILABLE'] ?? 0,
        onRoute:   driverByStatus['ON_ROUTE']  ?? 0,
        offline:   driverByStatus['OFFLINE']   ?? 0,
      },
      unassigned: unassignedCols,
      exceptions: exceptionWaybills,
      leaderboard: driverLeaderboard.map(d => ({
        driverId:     d.driverId,
        jobsToday:    d._count._all,
        ...driverMap.get(d.driverId as string),
      })),
      trend,
    };
  }

  /**
   * Exception SLA tracker — open delivery exceptions (FAILED_DELIVERY /
   * RETURNED waybills still in that state) aged by how long they've sat
   * unactioned, against a 24h actioning SLA. Surfaces breach count, an aging
   * spread and an oldest-first watch list so the ops desk works the worst
   * first. Tenant-scoped, read-only.
   */
  async getExceptionSla(companyId: string) {
    const SLA_HOURS = 24;
    const now = Date.now();
    const open = await this.prisma.waybill.findMany({
      where: { companyId, status: { in: ['FAILED_DELIVERY', 'RETURNED'] } },
      select: {
        id: true, trackingNumber: true, status: true, updatedAt: true,
        recipientName: true, recipientAddress: true, riskLevel: true,
        attemptCount: true, maxAttempts: true, nextAttemptAt: true,
        lastAttemptReasonCode: true, lastAttemptNote: true, returnToSender: true,
        codAmount: true, codCollected: true, codDiscrepancy: true,
        shipments: {
          select: { driver: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'asc' }, // oldest first
      take: 500,
    });

    const buckets = { lt4: 0, h4_12: 0, h12_24: 0, gt24: 0 };
    const byReason: Record<string, number> = {};
    let breached = 0;
    let oldestHours = 0;

    const aged = open.map((w) => {
      const ageHours = Math.max(0, (now - new Date(w.updatedAt).getTime()) / 3_600_000);
      if (ageHours < 4) buckets.lt4 += 1;
      else if (ageHours < 12) buckets.h4_12 += 1;
      else if (ageHours < 24) buckets.h12_24 += 1;
      else buckets.gt24 += 1;
      if (ageHours >= SLA_HOURS) breached += 1;
      oldestHours = Math.max(oldestHours, ageHours);
      const reason = w.lastAttemptReasonCode ?? 'UNSPECIFIED';
      byReason[reason] = (byReason[reason] ?? 0) + 1;
      const driver = w.shipments[0]?.driver ?? null;
      return {
        id: w.id,
        trackingNumber: w.trackingNumber,
        status: w.status,
        recipientName: w.recipientName,
        recipientAddress: w.recipientAddress,
        riskLevel: w.riskLevel,
        attemptCount: w.attemptCount,
        maxAttempts: w.maxAttempts,
        nextAttemptAt: w.nextAttemptAt,
        lastAttemptReasonCode: w.lastAttemptReasonCode,
        lastAttemptNote: w.lastAttemptNote,
        returnToSender: w.returnToSender,
        cod: w.codAmount && w.codAmount > 0
          ? {
              amount: w.codAmount,
              collected: w.codCollected,
              discrepancy: w.codDiscrepancy,
            }
          : null,
        driver,
        ageHours: Math.round(ageHours * 10) / 10,
        breached: ageHours >= SLA_HOURS,
        action:
          w.returnToSender ? 'RETURN_TO_SENDER'
            : ageHours >= SLA_HOURS ? 'ESCALATE_NOW'
              : w.nextAttemptAt && new Date(w.nextAttemptAt).getTime() <= now
                ? 'REATTEMPT_DUE'
                : 'REVIEW',
      };
    });

    return {
      slaHours: SLA_HOURS,
      openCount: open.length,
      breached,
      withinSla: open.length - breached,
      breachRatePct: open.length ? Math.round((breached / open.length) * 1000) / 10 : 0,
      oldestHours: Math.round(oldestHours * 10) / 10,
      buckets,
      byReason,
      watch: aged.slice(0, 10), // oldest first
      note:
        'Open exceptions are waybills still in FAILED_DELIVERY / RETURNED. Age is measured from the last status change; a 24h actioning SLA flags breaches.',
    };
  }

  /**
   * Live ETA for every shipment currently IN_TRANSIT.
   * Uses haversine straight-line distance ÷ AVG_SPEED_KMH as a first-pass
   * estimate.  Values refresh every 30 s in the Dashboard so the map popup
   * always shows a fresh countdown without page reloads.
   */
  async getLiveEtas(companyId: string) {
    const shipments = await this.prisma.shipment.findMany({
      where: { companyId, status: 'IN_TRANSIT' },
      include: {
        driver: { select: { id: true, name: true, lastLat: true, lastLng: true } },
        waybill: {
          select: {
            trackingNumber: true,
            recipientName: true,
            recipientLat: true,
            recipientLng: true,
          },
        },
      },
    });

    return shipments
      .filter(
        (s) =>
          s.driver?.lastLat != null &&
          s.driver?.lastLng != null &&
          s.waybill?.recipientLat != null &&
          s.waybill?.recipientLng != null,
      )
      .map((s) => {
        const distKm = GeocodingService.haversineKm(
          s.driver!.lastLat as number,
          s.driver!.lastLng as number,
          s.waybill!.recipientLat as number,
          s.waybill!.recipientLng as number,
        );
        const etaMinutes = Math.max(1, Math.round((distKm / AVG_SPEED_KMH) * 60));
        return {
          driverId:       s.driverId,
          shipmentId:     s.id,
          trackingNumber: s.waybill!.trackingNumber,
          recipientName:  s.waybill!.recipientName,
          etaMinutes,
          distanceKm:     Math.round(distKm * 10) / 10,
          urgency:
            etaMinutes <= 15 ? 'imminent'
            : etaMinutes <= 60 ? 'near'
            : 'en-route',
        };
      });
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
  async bulkSync(_companyId: string) {
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
      select: { id: true, pickupLat: true, pickupLng: true },
    });
    if (!collection) return { suggestion: null, candidates: [] };

    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true, status: { in: ['AVAILABLE', 'ON_ROUTE'] } },
      select: { id: true, name: true, vehicleType: true, status: true, lastSeen: true, lastLat: true, lastLng: true },
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
    const hasPickup = collection.pickupLat != null && collection.pickupLng != null;
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

        // Proximity: distance from driver's last GPS to the pickup (within 50km).
        let distanceKm: number | null = null;
        let proximity = 0;
        const hasDriverPos = d.lastLat != null && d.lastLng != null;
        if (hasPickup && hasDriverPos) {
          distanceKm = GeocodingService.haversineKm(
            collection.pickupLat as number,
            collection.pickupLng as number,
            d.lastLat as number,
            d.lastLng as number,
          );
          proximity = Math.max(0, 1 - distanceKm / 50);
        }

        const round = (n: number) => Math.round(n * 100) / 100;
        // When we can measure proximity, give it real weight; otherwise fall
        // back to the availability/load/recency blend.
        const useProx = hasPickup && hasDriverPos;
        const score = useProx
          ? round(0.4 * availability + 0.25 * loadScore + 0.15 * recency + 0.2 * proximity)
          : round(0.5 * availability + 0.3 * loadScore + 0.2 * recency);

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
            distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
            proximity: useProx ? round(proximity) : null,
          },
        };
      })
      .sort((a, b) => b.score - a.score);

    return { suggestion: scored[0], candidates: scored.slice(0, 5) };
  }
}
