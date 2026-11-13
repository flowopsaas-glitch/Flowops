import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LaneProfitabilityService } from './lane-profitability.service';
import { ClientProfitabilityService } from './client-profitability.service';

/**
 * Period snapshots for lane and client profitability.
 *
 * The two live endpoints answer "what did this lane earn?" — recomputed on
 * every request from the underlying rows. They cannot answer "is it getting
 * better?", because that needs the period before, and the period before is
 * gone: nothing was ever stored.
 *
 * `LaneProfitability` and `ClientProfitability` exist for exactly that, and had
 * never been written to. This service fills them.
 *
 * WHAT IS AND IS NOT FILLED
 *
 * Everything here is derived from recorded cost plus the prior period's
 * snapshot — no guessing:
 *
 *   lanes    volume, revenue, cost, profit, margin, and the three deltas
 *            (revenue, volume, margin) against the previous period, plus the
 *            pricing signal.
 *   clients  the same, plus cost-to-serve, payment behaviour, profit rank and
 *            a volume trend classification.
 *
 * Deliberately left null: `clv`, `clvTier`, `churnRisk`, `churnSignals`,
 * `aiInsights`, `lastDeliveryAt`. Each of those needs its own model or its own
 * data source, and writing a placeholder would make a gap look like a
 * measurement — the same mistake this whole series of changes exists to undo.
 * They are nullable in the schema and stay null until something earns them.
 *
 * TRANSACTIONS
 *
 * Each phase opens its own withTenant() rather than nesting them. Prisma
 * interactive transactions do not compose safely, and the compute phases
 * already take one each, so materialise() sequences four short transactions
 * instead of wrapping them in one long one. A crash between phases leaves a
 * partially-written period, which the next run corrects: every write is an
 * upsert on (companyId, period, …), so the operation is idempotent.
 */

/** Movement beyond ±10% in volume is a trend; anything tighter is noise. */
const TREND_THRESHOLD_PCT = 10;

export interface MaterialiseResult {
  period: string;
  basis: string;
  lanes: { written: number; withHistory: number };
  clients: { written: number; withHistory: number };
}

@Injectable()
export class ProfitabilitySnapshotService {
  private readonly logger = new Logger(ProfitabilitySnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lanes: LaneProfitabilityService,
    private readonly clients: ClientProfitabilityService,
  ) {}

  // ── Write ────────────────────────────────────────────────────────────────

  /**
   * Materialise both snapshot tables for one period.
   *
   * Idempotent: re-running rewrites the same rows from the same source and
   * recomputes the deltas against the previous period.
   */
  async materialise(companyId: string, period?: string): Promise<MaterialiseResult> {
    const target = period || this.currentPeriod();
    const prior = this.prevPeriod(target);
    const cfg = await this.getConfig(companyId);

    const [laneAgg, clientAgg] = await Promise.all([
      this.lanes.aggregate(companyId, target, cfg),
      this.clients.aggregate(companyId, target, cfg),
    ]);

    const [prevLanes, prevClients, monthsByClient] = await Promise.all([
      this.prisma.withTenant(companyId, (tx) =>
        tx.laneProfitability.findMany({
          where: { companyId, period: prior },
          select: {
            fromZone: true, toZone: true, totalRevenue: true,
            totalDeliveries: true, marginPercent: true,
          },
        }),
      ),
      this.prisma.withTenant(companyId, (tx) =>
        tx.clientProfitability.findMany({
          where: { companyId, period: prior },
          select: { clientName: true, revenue: true, deliveryCount: true, marginPercent: true },
        }),
      ),
      this.prisma.withTenant(companyId, (tx) =>
        tx.clientProfitability.groupBy({
          by: ['clientName'],
          where: { companyId },
          _count: { clientName: true },
        }),
      ),
    ]);

    const prevLaneByKey = new Map(
      prevLanes.map((l) => [`${l.fromZone}→${l.toZone}`, l]),
    );
    const prevClientByName = new Map(prevClients.map((c) => [c.clientName, c]));
    const monthsByClientName = new Map(
      monthsByClient.map((r: any) => [r.clientName as string, Number(r._count?.clientName ?? 0)]),
    );

    // Rank clients by profit among those whose cost was actually recorded —
    // the same rule as the live endpoint, so a stored rank means the same
    // thing as a live one.
    const rankable = clientAgg.clients
      .filter((c) => c.basis === 'MEASURED' || c.basis === 'ALLOCATED')
      .sort((a, b) => b.grossProfit - a.grossProfit);
    const rankByName = new Map(rankable.map((c, i) => [c.clientName, i + 1]));

    const laneRows = laneAgg.lanes.map((l) => {
      const prev = prevLaneByKey.get(`${l.fromZone}→${l.toZone}`);
      return {
        companyId,
        period: target,
        fromZone: l.fromZone,
        toZone: l.toZone,
        totalDeliveries: l.deliveries,
        totalRevenue: l.revenue,
        avgRevenuePerDel: l.deliveries > 0 ? l.revenue / l.deliveries : 0,
        totalCost: l.measuredCost,
        avgCostPerDel: l.measuredDeliveries > 0 ? l.measuredCost / l.measuredDeliveries : 0,
        grossProfit: l.grossProfit,
        marginPercent: l.marginPct,
        revenueDelta: pctChange(l.revenue, prev?.totalRevenue),
        volumeDelta: pctChange(l.deliveries, prev?.totalDeliveries),
        marginDelta: prev ? round1(l.marginPct - prev.marginPercent) : null,
        pricingSignal: l.signal,
      };
    });

    const clientRows = clientAgg.clients.map((c) => {
      const prev = prevClientByName.get(c.clientName);
      const volumeDelta = pctChange(c.deliveryCount, prev?.deliveryCount);
      const priorMonths = monthsByClientName.get(c.clientName) ?? 0;
      return {
        companyId,
        period: target,
        clientName: c.clientName,
        revenue: c.revenue,
        revenueGrowthPct: pctChange(c.revenue, prev?.revenue),
        deliveryCount: c.deliveryCount,
        avgRevenuePerDel: c.deliveryCount > 0 ? c.revenue / c.deliveryCount : 0,
        totalCost: c.measuredCost,
        costToServePct: c.revenue > 0 ? round1((c.measuredCost / c.revenue) * 100) : 0,
        grossProfit: c.grossProfit,
        marginPercent: c.marginPct,
        profitRank: rankByName.get(c.clientName) ?? null,
        avgDaysToPay: c.avgDaysToPay,
        collectionRate: c.collectionRate,
        overdueAmount: c.overdueAmount,
        monthsActive: priorMonths + 1,
        volumeTrend: volumeTrend(c.deliveryCount, volumeDelta, priorMonths),
      };
    });

    await this.prisma.withTenant(companyId, async (tx) => {
      for (const row of laneRows) {
        await tx.laneProfitability.upsert({
          where: {
            companyId_period_fromZone_toZone: {
              companyId,
              period: target,
              fromZone: row.fromZone,
              toZone: row.toZone,
            },
          },
          create: row,
          update: row,
        });
      }
      for (const row of clientRows) {
        await tx.clientProfitability.upsert({
          where: {
            companyId_period_clientName: {
              companyId,
              period: target,
              clientName: row.clientName,
            },
          },
          create: row,
          update: row,
        });
      }
    });

    this.logger.log(
      `snapshots ${companyId} ${target}: ${laneRows.length} lanes, ` +
        `${clientRows.length} clients, basis ${laneAgg.basis}/${clientAgg.basis}`,
    );

    return {
      period: target,
      basis: laneAgg.basis === clientAgg.basis ? laneAgg.basis : `${laneAgg.basis}/${clientAgg.basis}`,
      lanes: {
        written: laneRows.length,
        withHistory: laneRows.filter((r) => r.revenueDelta !== null).length,
      },
      clients: {
        written: clientRows.length,
        withHistory: clientRows.filter((r) => r.revenueGrowthPct !== null).length,
      },
    };
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  /** Persisted lane snapshots for a period, worst margin first. */
  async laneSnapshots(companyId: string, period?: string, fromZone?: string, toZone?: string) {
    const target = period || this.currentPeriod();
    return this.prisma.withTenant(companyId, (tx) =>
      tx.laneProfitability.findMany({
        where: {
          companyId,
          period: target,
          ...(fromZone ? { fromZone } : {}),
          ...(toZone ? { toZone } : {}),
        },
        orderBy: { marginPercent: 'asc' },
      }),
    );
  }

  /** Persisted client snapshots for a period, by profit rank then revenue. */
  async clientSnapshots(companyId: string, period?: string) {
    const target = period || this.currentPeriod();
    return this.prisma.withTenant(companyId, (tx) =>
      tx.clientProfitability.findMany({
        where: { companyId, period: target },
        orderBy: [{ profitRank: 'asc' }, { revenue: 'desc' }],
      }),
    );
  }

  /** Every period already materialised — what history actually exists. */
  async availablePeriods(companyId: string) {
    const [lanes, clients] = await Promise.all([
      this.prisma.withTenant(companyId, (tx) =>
        tx.laneProfitability.findMany({
          where: { companyId },
          distinct: ['period'],
          select: { period: true },
          orderBy: { period: 'desc' },
        }),
      ),
      this.prisma.withTenant(companyId, (tx) =>
        tx.clientProfitability.findMany({
          where: { companyId },
          distinct: ['period'],
          select: { period: true },
          orderBy: { period: 'desc' },
        }),
      ),
    ]);
    return [...new Set([...lanes, ...clients].map((r) => r.period))].sort().reverse();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * CommercialConfig carries the margin thresholds and the fallback rates.
   *
   * Read in its own tenant context rather than reusing
   * CommercialAnalyticsService.getConfig: injecting that service here would
   * form a cycle once the controller depends on both.
   */
  private async getConfig(companyId: string) {
    return this.prisma.withTenant(companyId, async (tx) => {
      let cfg = await tx.commercialConfig.findUnique({ where: { companyId } });
      if (!cfg) {
        cfg = await tx.commercialConfig.create({ data: { companyId } });
      }
      return cfg as unknown as {
        fuelCostPerKm: number;
        driverHourlyCost: number;
        vehicleCostPerKm: number;
        overheadPerDelivery: number;
        avgDeliveryMinutes: number;
        avgKmPerDelivery: number;
        targetMarginPct: number;
        minMarginPct: number;
      };
    });
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private prevPeriod(period: string): string {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}

/** Percentage change against a previous figure, or null when there is none. */
function pctChange(current: number, previous?: number | null): number | null {
  if (previous === undefined || previous === null || previous === 0) return null;
  return round1(((current - previous) / Math.abs(previous)) * 100);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Trend label for a client.
 *
 * DORMANT beats every other classification: a client that bought nothing this
 * period is not "stable" because last period was also quiet.
 */
function volumeTrend(
  deliveries: number,
  volumeDelta: number | null,
  priorPeriods: number,
): string {
  if (deliveries === 0) return 'DORMANT';
  if (priorPeriods === 0) return 'NEW';
  if (volumeDelta === null) return 'STABLE';
  if (volumeDelta > TREND_THRESHOLD_PCT) return 'GROWING';
  if (volumeDelta < -TREND_THRESHOLD_PCT) return 'DECLINING';
  return 'STABLE';
}
