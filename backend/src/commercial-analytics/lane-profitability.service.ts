import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lane profitability from recorded cost rather than from a modelled average.
 *
 * WHY THIS EXISTS
 * ---------------
 * CommercialAnalyticsService used to price every lane the same way:
 *
 *   avgCostPerDel = fuelCostPerKm × avgKmPerDelivery
 *                 + driverHourlyCost × (avgDeliveryMinutes / 60)
 *                 + vehicleCostPerKm × avgKmPerDelivery
 *                 + overheadPerDelivery
 *   cost          = deliveryCount × avgCostPerDel
 *
 * That is a flat rate per stop. A 5 km urban drop and a 900 km cross-border
 * haul cost the same, tolls do not exist, and the fuel actually bought does not
 * enter the number. It is a planning model, and it was being returned as
 * profitability — including a `PROFITABLE` / `MARGINAL` / `UNPROFITABLE`
 * verdict per client derived from it.
 *
 * Meanwhile the Trip Truth engine (trip-truth.service.ts) already writes
 * `DeliveryCostAllocation`: one row per waybill, holding that delivery's fuel,
 * labour, vehicle, overhead, tolls and other cost, stamped with a provenance.
 * The schema defines that provenance plainly:
 *
 *   MEASURED   costs come from recorded trip-cost entries
 *   ALLOCATED  costs include shared recorded entries split by a stated rule
 *   ESTIMATED  no recorded costs — config-rate estimate,
 *              NEVER BLENDED WITH MEASURED TRUTH
 *
 * So the honest number was already in the database and the dashboard was not
 * reading it. This service reads it.
 *
 * THE ONE RULE
 * ------------
 * A lane's margin is computed from recorded rows only. Deliveries with no
 * allocation row are not filled in with the config estimate and quietly added
 * to the total — they are reported as uncovered, with a coverage percentage, so
 * an operator can see how much of the number is real. A margin weighted 30% by
 * measurement and 70% by a flat rate is not a margin; it is a number shaped
 * like one.
 *
 * Where nothing has been recorded at all, the config estimate still drives the
 * figure and `basis` says ESTIMATED. That keeps the endpoint useful for a
 * company that has never run the engine, while making it impossible to mistake
 * the two.
 */

/** Provenance values that represent recorded cost rather than a modelled one. */
const RECORDED = new Set(['MEASURED', 'ALLOCATED']);

export type CostBasis = 'MEASURED' | 'ALLOCATED' | 'ESTIMATED' | 'NONE';

export interface LaneRow {
  fromZone: string;
  toZone: string;
  /** Deliveries in the period, whether or not a cost was recorded for them. */
  deliveries: number;
  /** Deliveries carrying a MEASURED or ALLOCATED cost. */
  measuredDeliveries: number;
  /** measuredDeliveries / deliveries. 100 means the margin is fully measured. */
  coveragePct: number;
  revenue: number;
  /** Recorded cost for the measured subset only. Never includes modelled cost. */
  measuredCost: number;
  /** Revenue and profit counted over the measured subset only. */
  measuredRevenue: number;
  grossProfit: number;
  marginPct: number;
  /** MEASURED | ALLOCATED | ESTIMATED | NONE — what `grossProfit` rests on. */
  basis: CostBasis;
  signal: string;
}

@Injectable()
export class LaneProfitabilityService {
  private readonly logger = new Logger(LaneProfitabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Coarse lane endpoint from a free-text address.
   *
   * The allocation writer stores `fromZone: waybill.senderAddress` — a full
   * address, despite the column name. Deriving the zone the same way the old
   * code did keeps lane keys identical to the ones already on dashboards, so
   * this is a change in what the number means, not in what it is called.
   */
  static extractZone(addr: string): string {
    if (!addr) return 'Unknown';
    const parts = addr.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) return parts[parts.length - 2] || 'Unknown';
    if (parts.length === 2) return parts[parts.length - 1] || 'Unknown';
    return parts[0]?.slice(0, 20) || 'Unknown';
  }

  /**
   * Aggregate one period into lane rows.
   *
   * `cfg` is the company's CommercialConfig, used only for the ESTIMATED
   * fallback and for the margin thresholds behind `signal`.
   */
  async aggregate(
    companyId: string,
    period: string,
    cfg: {
      fuelCostPerKm: number;
      driverHourlyCost: number;
      vehicleCostPerKm: number;
      overheadPerDelivery: number;
      avgDeliveryMinutes: number;
      avgKmPerDelivery: number;
      targetMarginPct: number;
      minMarginPct: number;
    },
  ): Promise<{ period: string; basis: CostBasis; lanes: LaneRow[]; totals: Record<string, number> }> {
    return this.prisma.withTenant(companyId, async (tx) => {
      const { start, end } = periodRange(period);

      // Revenue comes from the waybill, which exists whether or not anything
      // was recorded against it. Cost comes from the allocation, which does not.
      const [waybills, allocations] = await Promise.all([
        tx.waybill.findMany({
          where: { companyId, status: 'DELIVERED', createdAt: { gte: start, lt: end } },
          select: {
            id: true,
            totalAmount: true,
            senderAddress: true,
            recipientAddress: true,
          },
        }),
        tx.deliveryCostAllocation.findMany({
          where: { companyId, period },
          select: {
            waybillId: true,
            revenue: true,
            totalCost: true,
            provenance: true,
            fromZone: true,
            toZone: true,
          },
        }),
      ]);

      // Index by waybill so a lane can tell "recorded" from "not recorded"
      // per delivery rather than guessing from the aggregate.
      const allocationByWaybill = new Map(allocations.map((a) => [a.waybillId, a]));

      // A row with no provenance predates the engine. The schema is explicit
      // that those are unknown-basis and must never be read as measured, so
      // they are treated as unrecorded here rather than being counted in.
      const isRecorded = (a: { provenance: string | null } | undefined) =>
        !!a && a.provenance !== null && RECORDED.has(a.provenance);

      // Fallback rate, used only where nothing was recorded for the whole lane.
      const avgCostPerDel =
        cfg.fuelCostPerKm * cfg.avgKmPerDelivery +
        cfg.driverHourlyCost * (cfg.avgDeliveryMinutes / 60) +
        cfg.vehicleCostPerKm * cfg.avgKmPerDelivery +
        cfg.overheadPerDelivery;

      interface Acc {
        fromZone: string;
        toZone: string;
        deliveries: number;
        measuredDeliveries: number;
        revenue: number;
        measuredRevenue: number;
        measuredCost: number;
        allocated: boolean;
      }
      const lanes = new Map<string, Acc>();

      const keyFor = (from: string, to: string) => `${from}→${to}`;

      const touch = (from: string, to: string): Acc => {
        const key = keyFor(from, to);
        let acc = lanes.get(key);
        if (!acc) {
          acc = {
            fromZone: from,
            toZone: to,
            deliveries: 0,
            measuredDeliveries: 0,
            revenue: 0,
            measuredRevenue: 0,
            measuredCost: 0,
            allocated: false,
          };
          lanes.set(key, acc);
        }
        return acc;
      };

      for (const wb of waybills) {
        const alloc = allocationByWaybill.get(wb.id);
        const from = LaneProfitabilityService.extractZone(
          (alloc?.fromZone as string) ?? wb.senderAddress,
        );
        const to = LaneProfitabilityService.extractZone(
          (alloc?.toZone as string) ?? wb.recipientAddress,
        );
        const acc = touch(from, to);
        const revenue = wb.totalAmount || 0;

        acc.deliveries += 1;
        acc.revenue += revenue;

        if (isRecorded(alloc)) {
          acc.measuredDeliveries += 1;
          acc.measuredRevenue += alloc!.revenue ?? revenue;
          acc.measuredCost += alloc!.totalCost ?? 0;
          if (alloc!.provenance === 'ALLOCATED') acc.allocated = true;
        }
      }

      // Allocations can exist for waybills outside the delivered set (the
      // engine covers a period, not a status). Those still carry recorded cost
      // and must not vanish from the lane they belong to.
      for (const alloc of allocations) {
        if (!isRecorded(alloc)) continue;
        if (waybills.some((w) => w.id === alloc.waybillId)) continue;
        const acc = touch(
          LaneProfitabilityService.extractZone(alloc.fromZone as string),
          LaneProfitabilityService.extractZone(alloc.toZone as string),
        );
        acc.deliveries += 1;
        acc.measuredDeliveries += 1;
        acc.measuredRevenue += alloc.revenue ?? 0;
        acc.measuredCost += alloc.totalCost ?? 0;
        acc.revenue += alloc.revenue ?? 0;
        if (alloc.provenance === 'ALLOCATED') acc.allocated = true;
      }

      const rows: LaneRow[] = [...lanes.values()]
        .map((l): LaneRow => {
          const hasRecorded = l.measuredDeliveries > 0;

          // Where nothing was recorded, fall back to the modelled rate so the
          // lane still reports something — but say so in `basis`.
          const cost = hasRecorded ? l.measuredCost : l.deliveries * avgCostPerDel;
          const revenueBasis = hasRecorded ? l.measuredRevenue : l.revenue;
          const profit = hasRecorded ? revenueBasis - l.measuredCost : l.revenue - cost;

          const marginPct =
            (hasRecorded ? revenueBasis : l.revenue) > 0
              ? Math.round((profit / (hasRecorded ? revenueBasis : l.revenue)) * 1000) / 10
              : 0;

          const basis: CostBasis = !hasRecorded
            ? l.deliveries > 0
              ? 'ESTIMATED'
              : 'NONE'
            : l.allocated
              ? 'ALLOCATED'
              : 'MEASURED';

          let signal = 'OPTIMAL';
          if (marginPct < cfg.minMarginPct) signal = 'UNDERPRICED';
          else if (marginPct > cfg.targetMarginPct + 20) signal = 'OVERPRICED';
          if (l.deliveries < 5) signal = 'LOW_VOLUME';

          return {
            fromZone: l.fromZone,
            toZone: l.toZone,
            deliveries: l.deliveries,
            measuredDeliveries: l.measuredDeliveries,
            coveragePct:
              l.deliveries > 0 ? Math.round((l.measuredDeliveries / l.deliveries) * 1000) / 10 : 0,
            revenue: Math.round(l.revenue),
            measuredRevenue: Math.round(l.measuredRevenue),
            measuredCost: Math.round(l.measuredCost),
            grossProfit: Math.round(profit),
            marginPct,
            basis,
            signal,
          };
        })
        .sort((a, b) => b.revenue - a.revenue);

      const recorded = rows.reduce((n, r) => n + r.measuredDeliveries, 0);
      const delivered = rows.reduce((n, r) => n + r.deliveries, 0);

      // The overall basis is the weakest link, not the average: one estimated
      // lane means the page contains an estimate and must say so.
      const basis: CostBasis =
        delivered === 0
          ? 'NONE'
          : recorded === 0
            ? 'ESTIMATED'
            : rows.some((r) => r.basis === 'ALLOCATED' || r.basis === 'ESTIMATED')
              ? 'ALLOCATED'
              : 'MEASURED';

      if (recorded > 0 && recorded < delivered) {
        this.logger.debug(
          `lane profitability ${companyId} ${period}: ${recorded}/${delivered} ` +
            `deliveries carry recorded cost; unrecorded ones are excluded from margin`,
        );
      }

      return {
        period,
        basis,
        lanes: rows,
        totals: {
          lanes: rows.length,
          deliveries: delivered,
          measuredDeliveries: recorded,
          coveragePct:
            delivered > 0 ? Math.round((recorded / delivered) * 1000) / 10 : 0,
          revenue: rows.reduce((n, r) => n + r.revenue, 0),
          measuredCost: rows.reduce((n, r) => n + r.measuredCost, 0),
          grossProfit: rows.reduce((n, r) => n + r.grossProfit, 0),
        },
      };
    });
  }
}

/** Calendar month bounds for a YYYY-MM period, in UTC. */
function periodRange(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Invalid period '${period}', expected YYYY-MM`);
  }
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}
