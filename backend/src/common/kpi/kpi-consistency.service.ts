import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  boundedAverage,
  KpiAverage,
  KpiRate,
  KpiWindow,
  rollingWindow,
  safeRate,
} from './kpi-math';

/**
 * KpiConsistencyService — the single place dashboard maths is allowed to live.
 *
 * The dashboard had three ways of producing a number that cannot be trusted:
 *   1. a rate computed over a mixed population (e.g. delivered/attempted where
 *      the numerator and denominator came from different queries),
 *   2. a percentage rendered as 0% when the denominator was 0 (indistinguish-
 *      able from "nothing went wrong"), and
 *   3. an unbounded window/outlier set (one 60-day-old stuck consignment
 *      dragging an average, or a 5-year-old row counted in "this month").
 *
 * The rules encoded here:
 *   - a rate with no valid denominator is `null` (the UI must render "—"),
 *     never 0 and never 100;
 *   - every average is computed over records that are complete for that metric
 *     and inside an explicit time window;
 *   - outlier-sensitive metrics drop values outside hard domain bounds and trim
 *     the extreme 5% once there are enough samples;
 *   - the sample size travels with the value so the UI can show its confidence.
 */

export type { KpiRate, KpiAverage, KpiWindow } from './kpi-math';
export { KPI_NO_DATA_NOTE } from './kpi-math';

@Injectable()
export class KpiConsistencyService {
  private readonly logger = new Logger(KpiConsistencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Generic helpers (pure maths lives in kpi-math.ts) ──────────────────────

  /** Safe rate: null — never 0/100% — when there is no valid denominator. */
  rate(numerator: number, denominator: number, decimals = 1): KpiRate {
    return safeRate(numerator, denominator, decimals);
  }

  /** Average with hard bounds; trims the extreme 5% once there are 20+ samples. */
  average(
    samples: Array<number | null | undefined>,
    opts: { min?: number; max?: number; unit?: string; trimFrom?: number } = {},
  ): KpiAverage {
    return boundedAverage(samples, opts);
  }

  /** Inclusive-lower, exclusive-upper window of the last `days` days. */
  window(days: number, now: Date = new Date()): KpiWindow {
    return rollingWindow(days, now);
  }

  // ── Rail KPIs (used by RailService.overview) ───────────────────────────────

  /**
   * On-time percentage for rail consignments that actually arrived inside the
   * window and carried a planned arrival. Records missing either timestamp are
   * excluded (they cannot be judged), and CANCELLED consignments never count.
   */
  async railOnTime(windowDays = 90, companyId?: string): Promise<KpiRate> {
    const { start, end } = this.window(windowDays);
    const rows = await this.prisma.railConsignment.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        status: { notIn: ['CANCELLED'] },
        actualArrival: { not: null, gte: start, lt: end },
        plannedArrival: { not: null },
      },
      select: { actualArrival: true, plannedArrival: true },
      take: 5000,
    });
    const onTime = rows.filter((c) => c.actualArrival!.getTime() <= c.plannedArrival!.getTime());
    return this.rate(onTime.length, rows.length);
  }

  /**
   * Average door-to-door transit hours for consignments that departed AND
   * arrived inside the window. Negative durations (arrival before departure —
   * bad data) and absurd durations (> 60 days) are excluded, and the extreme
   * 5% of the remainder is trimmed.
   */
  async railAvgTransitHours(windowDays = 90, companyId?: string): Promise<KpiAverage> {
    const { start, end } = this.window(windowDays);
    const rows = await this.prisma.railConsignment.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        actualDeparture: { not: null, gte: start, lt: end },
        actualArrival: { not: null, gte: start, lt: end },
      },
      select: { actualDeparture: true, actualArrival: true },
      take: 5000,
    });
    const samples = rows.map((c) => {
      const hours = (c.actualArrival!.getTime() - c.actualDeparture!.getTime()) / 3_600_000;
      // A negative duration is impossible: drop it rather than lower the average.
      return hours >= 0 ? hours : null;
    });
    return this.average(samples, { min: 0, max: 24 * 60, unit: 'hours' });
  }

  /**
   * Average interchange dwell. Only legs that finished (actualEnd present, so
   * the seconds are real), inside the window, capped at 5 days so one abandoned
   * wagon cannot define the metric.
   */
  async railAvgDwellHours(windowDays = 90, companyId?: string): Promise<KpiAverage> {
    const { start, end } = this.window(windowDays);
    const legs = await this.prisma.intermodalLeg.findMany({
      where: {
        ...(companyId ? { consignment: { companyId } } : {}),
        dwellHours: { not: null, lte: 120 },
        actualEnd: { not: null, gte: start, lt: end },
      },
      select: { dwellHours: true },
      take: 5000,
    });
    return this.average(
      legs.map((l) => l.dwellHours),
      { min: 0, max: 120, unit: 'hours' },
    );
  }
}
