import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Client profitability from recorded cost — the customer axis of the same
 * defect fixed in lane-profitability.service.ts.
 *
 * The old matrix charged every customer the same rate per stop:
 *
 *   cost = deliveryCount × (fuelCostPerKm × avgKmPerDelivery
 *                          + driverHourlyCost × avgMinutes/60
 *                          + vehicleCostPerKm × avgKmPerDelivery
 *                          + overheadPerDelivery)
 *
 * and then labelled them:
 *
 *   health = margin >= target ? 'PROFITABLE'
 *          : margin >= min    ? 'MARGINAL' : 'UNPROFITABLE'
 *
 * That verdict is the problem, not just the number. A flat per-stop rate says
 * nothing about whether a given customer is cheap or expensive to serve — two
 * customers billed identically earn the same verdict even if one is across
 * town and the other is across a border. The engine had already recorded the
 * real cost per delivery; the verdict ignored it.
 *
 * So this service costs each customer by the deliveries actually billed to
 * them, joined invoice → invoice item → waybill → DeliveryCostAllocation.
 * InvoiceItem.waybillId is @unique ("a waybill may appear on at most one
 * invoice"), so the join is one-to-one and cannot double-count a delivery.
 *
 * THREE RULES, the same as the lane service:
 *
 *   1. Recorded cost is used where it exists.
 *   2. It is never averaged with a modelled rate. Deliveries with no recorded
 *      cost are reported as uncovered, not backfilled from config.
 *   3. The response says which — and critically, NO VERDICT IS ISSUED FROM A
 *      MODELLED RATE. If a client's cost is an estimate, `health` is UNKNOWN.
 *      Telling an operator their best customer is unprofitable is a commercial
 *      decision, and it must not be made from an average.
 */

/** Provenance values that represent recorded cost rather than a modelled one. */
const RECORDED = new Set(['MEASURED', 'ALLOCATED']);

export type CostBasis = 'MEASURED' | 'ALLOCATED' | 'ESTIMATED' | 'NONE';

export interface ClientRow {
  clientName: string;
  revenue: number;
  invoiceCount: number;
  /** Line items billed to this client — the existing meaning of deliveryCount. */
  deliveryCount: number;
  /** Billed line items carrying a waybill with recorded cost. */
  measuredDeliveries: number;
  coveragePct: number;
  measuredCost: number;
  /** Present only when nothing was recorded; the config-rate fallback. */
  estimatedCost: number;
  grossProfit: number;
  marginPct: number;
  avgRevenuePerDel: number;
  avgDaysToPay: number | null;
  collectionRate: number;
  overdueAmount: number;
  /** PROFITABLE | MARGINAL | UNPROFITABLE, or UNKNOWN when cost is modelled. */
  health: 'PROFITABLE' | 'MARGINAL' | 'UNPROFITABLE' | 'UNKNOWN';
  basis: CostBasis;
  profitRank: number;
}

export interface CostConfig {
  fuelCostPerKm: number;
  driverHourlyCost: number;
  vehicleCostPerKm: number;
  overheadPerDelivery: number;
  avgDeliveryMinutes: number;
  avgKmPerDelivery: number;
  targetMarginPct: number;
  minMarginPct: number;
}

@Injectable()
export class ClientProfitabilityService {
  private readonly logger = new Logger(ClientProfitabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The flat rate the old model charged every delivery. Fallback only. */
  static flatRate(cfg: CostConfig): number {
    return (
      cfg.fuelCostPerKm * cfg.avgKmPerDelivery +
      cfg.driverHourlyCost * (cfg.avgDeliveryMinutes / 60) +
      cfg.vehicleCostPerKm * cfg.avgKmPerDelivery +
      cfg.overheadPerDelivery
    );
  }

  /**
   * Cost, coverage and basis for a whole period — the top-line the dashboard
   * needs, from the same join as the per-client figures.
   */
  async periodTotals(companyId: string, period: string, cfg: CostConfig) {
    return this.prisma.withTenant(companyId, async (tx) => {
      const { start, end } = periodRange(period);

      const [delivered, allocations] = await Promise.all([
        tx.waybill.findMany({
          where: { companyId, status: 'DELIVERED', createdAt: { gte: start, lt: end } },
          select: { id: true },
        }),
        tx.deliveryCostAllocation.findMany({
          where: { companyId, period },
          select: { waybillId: true, totalCost: true, provenance: true },
        }),
      ]);

      const recorded = allocations.filter(
        (a) => a.provenance !== null && RECORDED.has(a.provenance as string),
      );
      const measuredCost = recorded.reduce((n, a) => n + (a.totalCost ?? 0), 0);
      const allocated = recorded.some((a) => a.provenance === 'ALLOCATED');
      const deliveries = delivered.length;

      const basis: CostBasis =
        deliveries === 0 && recorded.length === 0
          ? 'NONE'
          : recorded.length === 0
            ? 'ESTIMATED'
            : allocated
              ? 'ALLOCATED'
              : 'MEASURED';

      return {
        period,
        basis,
        deliveries,
        measuredDeliveries: recorded.length,
        coveragePct:
          deliveries > 0 ? Math.round((recorded.length / deliveries) * 1000) / 10 : 0,
        measuredCost: Math.round(measuredCost),
        /** Only meaningful when basis is ESTIMATED; otherwise 0. */
        estimatedCost: recorded.length === 0 ? Math.round(deliveries * ClientProfitabilityService.flatRate(cfg)) : 0,
      };
    });
  }

  /** Aggregate one period into per-client rows. */
  async aggregate(companyId: string, period: string, cfg: CostConfig) {
    return this.prisma.withTenant(companyId, async (tx) => {
      const { start, end } = periodRange(period);

      const invoices = await tx.invoice.findMany({
        where: { companyId, createdAt: { gte: start, lt: end } },
        select: {
          id: true,
          clientName: true,
          total: true,
          status: true,
          paidAt: true,
          sentAt: true,
          dueDate: true,
          items: { select: { waybillId: true } },
        },
      });

      // One query for every waybill billed in the period, rather than one per
      // client: this runs on the dashboard's hot path.
      const waybillIds = [
        ...new Set(
          invoices.flatMap((i) =>
            i.items.map((it) => it.waybillId).filter((id): id is string => !!id),
          ),
        ),
      ];

      const allocations = waybillIds.length
        ? await tx.deliveryCostAllocation.findMany({
            where: { companyId, waybillId: { in: waybillIds } },
            select: { waybillId: true, totalCost: true, provenance: true },
          })
        : [];

      const allocByWaybill = new Map(allocations.map((a) => [a.waybillId, a]));
      const isRecorded = (id: string | null) => {
        if (!id) return false;
        const a = allocByWaybill.get(id);
        return !!a && a.provenance !== null && RECORDED.has(a.provenance as string);
      };

      const flat = ClientProfitabilityService.flatRate(cfg);

      interface Acc {
        clientName: string;
        revenue: number;
        invoiceCount: number;
        deliveryCount: number;
        billed: number;
        measuredDeliveries: number;
        measuredCost: number;
        allocated: boolean;
        paidAmount: number;
        overdueAmount: number;
        totalDaysToPay: number;
        paidWithDays: number;
      }
      const clients = new Map<string, Acc>();

      const touch = (name: string): Acc => {
        let c = clients.get(name);
        if (!c) {
          c = {
            clientName: name,
            revenue: 0, invoiceCount: 0, deliveryCount: 0, billed: 0,
            measuredDeliveries: 0, measuredCost: 0, allocated: false,
            paidAmount: 0, overdueAmount: 0, totalDaysToPay: 0, paidWithDays: 0,
          };
          clients.set(name, c);
        }
        return c;
      };

      for (const inv of invoices) {
        const c = touch(inv.clientName);
        c.revenue += inv.total;
        c.invoiceCount += 1;
        c.deliveryCount += inv.items.length;

        for (const item of inv.items) {
          if (!item.waybillId) continue;
          c.billed += 1;
          if (isRecorded(item.waybillId)) {
            const a = allocByWaybill.get(item.waybillId)!;
            c.measuredDeliveries += 1;
            c.measuredCost += a.totalCost ?? 0;
            if (a.provenance === 'ALLOCATED') c.allocated = true;
          }
        }

        if (inv.status === 'PAID') {
          c.paidAmount += inv.total;
          if (inv.paidAt && inv.sentAt) {
            const days =
              (new Date(inv.paidAt).getTime() - new Date(inv.sentAt).getTime()) / 86_400_000;
            if (days >= 0) {
              c.totalDaysToPay += days;
              c.paidWithDays += 1;
            }
          }
        }
        if (
          (inv.status === 'SENT' || inv.status === 'OVERDUE') &&
          inv.dueDate &&
          new Date(inv.dueDate) < new Date()
        ) {
          c.overdueAmount += inv.total;
        }
      }

      const rows: ClientRow[] = [...clients.values()]
        .map((c): ClientRow => {
          const measured = c.measuredDeliveries > 0;
          const cost = measured ? c.measuredCost : c.deliveryCount * flat;
          const profit = c.revenue - cost;
          const marginPct =
            c.revenue > 0 ? Math.round((profit / c.revenue) * 1000) / 10 : 0;

          const basis: CostBasis = measured
            ? c.allocated
              ? 'ALLOCATED'
              : 'MEASURED'
            : c.deliveryCount > 0
              ? 'ESTIMATED'
              : 'NONE';

          // The rule: a verdict is never issued from a modelled rate. Two
          // customers billed identically are not equally cheap to serve, and
          // telling an operator otherwise is a commercial decision made from
          // an average.
          const health: ClientRow['health'] = measured
            ? marginPct >= cfg.targetMarginPct
              ? 'PROFITABLE'
              : marginPct >= cfg.minMarginPct
                ? 'MARGINAL'
                : 'UNPROFITABLE'
            : 'UNKNOWN';

          return {
            clientName: c.clientName,
            revenue: Math.round(c.revenue),
            invoiceCount: c.invoiceCount,
            deliveryCount: c.deliveryCount,
            measuredDeliveries: c.measuredDeliveries,
            coveragePct:
              c.billed > 0 ? Math.round((c.measuredDeliveries / c.billed) * 1000) / 10 : 0,
            measuredCost: Math.round(c.measuredCost),
            estimatedCost: measured ? 0 : Math.round(cost),
            grossProfit: Math.round(profit),
            marginPct,
            avgRevenuePerDel:
              c.deliveryCount > 0 ? Math.round((c.revenue / c.deliveryCount) * 100) / 100 : 0,
            avgDaysToPay:
              c.paidWithDays > 0 ? Math.round(c.totalDaysToPay / c.paidWithDays) : null,
            collectionRate: c.revenue > 0 ? Math.round((c.paidAmount / c.revenue) * 100) : 0,
            overdueAmount: Math.round(c.overdueAmount),
            health,
            basis,
            profitRank: 0,
          };
        })
        .sort((a, b) => b.revenue - a.revenue);

      // Rank by profit, but only among clients whose profit is real: ranking
      // a measured client below an estimated one would order the truth against
      // a guess.
      const ranked = rows
        .filter((r) => r.basis === 'MEASURED' || r.basis === 'ALLOCATED')
        .sort((a, b) => b.grossProfit - a.grossProfit);
      ranked.forEach((r, i) => (r.profitRank = i + 1));

      const delivered = rows.reduce((n, r) => n + r.deliveryCount, 0);
      const measured = rows.reduce((n, r) => n + r.measuredDeliveries, 0);

      const basis: CostBasis =
        delivered === 0
          ? 'NONE'
          : measured === 0
            ? 'ESTIMATED'
            : rows.some((r) => r.basis === 'ESTIMATED' || r.basis === 'ALLOCATED')
              ? 'ALLOCATED'
              : 'MEASURED';

      if (measured > 0 && measured < delivered) {
        this.logger.debug(
          `client profitability ${companyId} ${period}: ${measured}/${delivered} ` +
            `billed deliveries carry recorded cost; the rest are excluded from margin`,
        );
      }

      return {
        period,
        basis,
        clients: rows,
        totals: {
          clients: rows.length,
          deliveries: delivered,
          measuredDeliveries: measured,
          coveragePct: delivered > 0 ? Math.round((measured / delivered) * 1000) / 10 : 0,
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
