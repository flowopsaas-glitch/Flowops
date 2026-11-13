import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Revenue forecasts that say how much they are worth.
 *
 * `RevenueForecast` was one of the models in this schema with no code behind
 * it. The schema itself says what the author expected: it carries
 * `actualRevenue` and `accuracy` alongside the prediction, which only makes
 * sense for a forecast that is meant to be scored after the fact rather than
 * asserted and forgotten.
 *
 * THE RULE THIS SERVICE FOLLOWS
 *
 * A forecast is a claim about the future, and the dangerous kind is the one
 * that looks as solid as a measurement. So every number here is either derived
 * from observed data or refused:
 *
 *   - Below MIN_PERIODS of history, no forecast is produced at all. The caller
 *     gets the shortfall and the requirement, not a guess.
 *   - The interval is derived from how far past observations fell from their
 *     own fit, widened by the correct prediction-interval term and scaled by a
 *     t-multiplier sized to the degrees of freedom actually available. Three
 *     months of history produces a visibly useless interval, because three
 *     months of history genuinely is nearly useless.
 *   - `confidence` is not asserted. It is the interval's half-width as a
 *     fraction of the prediction, so a forecast that brackets ±100% of itself
 *     scores 0 and one that brackets ±10% scores 90.
 *   - `seasonalFactor` stays null until two full annual cycles exist. One
 *     December is not seasonality, it is an anecdote.
 *   - Accepted-but-unbilled quotes are stored in `pipelineValue` and are never
 *     added to `predictedRevenue`. They are known, not predicted, and folding
 *     the known into the predicted would flatter the forecast's accuracy and
 *     hide which part of the number is fact.
 *
 * REVENUE DEFINITION
 *
 * Recognised revenue is invoices in SENT, PAID or OVERDUE. DRAFT is excluded
 * — nothing has been billed. CANCELLED is excluded — it is not revenue.
 *
 * Periods are calendar months of `Invoice.createdAt`. There is no issue date or
 * recognition date on the model, so creation month is the only bucketing
 * available and it is what "period" means throughout.
 */

/** Months of history required before any forecast is issued. */
const MIN_PERIODS = 3;
/** Months of history required before a trend is fitted rather than a mean. */
const TREND_MIN_PERIODS = 6;
/** Months of history required before seasonality is estimated (2 full cycles). */
const SEASONAL_MIN_PERIODS = 24;
/** How far back to look. Older history says little about next month. */
const MAX_LOOKBACK = 24;

const RECOGNISED_STATUSES = ['SENT', 'PAID', 'OVERDUE'] as const;

/**
 * Two-sided 80% t critical values (one-tail 0.10), indexed by degrees of
 * freedom. Sparse tail: above 120 the t distribution is within rounding of the
 * normal value used here.
 */
const T_80: Record<number, number> = {
  1: 3.078, 2: 1.886, 3: 1.638, 4: 1.533, 5: 1.476,
  6: 1.44, 7: 1.415, 8: 1.397, 9: 1.383, 10: 1.372,
  11: 1.363, 12: 1.356, 13: 1.35, 14: 1.345, 15: 1.341,
  16: 1.337, 17: 1.333, 18: 1.33, 19: 1.328, 20: 1.325,
  21: 1.323, 22: 1.321, 23: 1.319, 24: 1.318, 25: 1.316,
  26: 1.315, 27: 1.314, 28: 1.313, 29: 1.311, 30: 1.31,
  40: 1.303, 60: 1.296, 120: 1.289,
};
const T_80_INF = 1.282;

function tCritical(df: number): number {
  if (df < 1) return T_80[1];
  if (T_80[df] !== undefined) return T_80[df];
  const known = Object.keys(T_80).map(Number).sort((a, b) => a - b);
  for (const k of known) if (k > df) return T_80[k];
  return T_80_INF;
}

function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function monthsBack(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const total = y * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function periodStart(period: string): Date {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/**
 * Drop months before the first month that billed anything.
 *
 * The lookback window is fixed at 24 months, so a company that started
 * trading three months ago would otherwise present as 21 zeros followed by
 * three real months. Those leading zeros are not three months of trading at
 * zero — they are months when there was nothing to trade. Fitting across them
 * would pull the level toward zero and inflate the residual spread, producing
 * a forecast that is technically derived from data and practically nonsense.
 *
 * Interior and trailing zeros are kept: a month that billed nothing while the
 * business was operating is real information, and removing it would make the
 * trend look smoother than it is.
 */
function trimLeadingZeros(series: ObservedPeriod[]): ObservedPeriod[] {
  const first = series.findIndex((p) => p.revenue > 0);
  return first === -1 ? [] : series.slice(first);
}

/** Sample standard deviation (n-1 denominator); 0 when there is no spread to estimate. */
function sampleStdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const ss = xs.reduce((s, x) => s + (x - m) ** 2, 0);
  return Math.sqrt(ss / (xs.length - 1));
}

export interface ForecastRefusal {
  generated: false;
  forecastPeriod: string;
  reason: string;
  periodsAvailable: number;
  periodsRequired: number;
}

export interface ObservedPeriod {
  period: string;
  revenue: number;
  invoices: number;
}

@Injectable()
export class RevenueForecastService {
  private readonly logger = new Logger(RevenueForecastService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Observed monthly recognised revenue, oldest first, including months that
   * billed nothing. A gap in the series is data: a month with no invoices is
   * not a month to skip, and dropping it would make the trend look smoother
   * than the business is.
   */
  async observed(companyId: string, throughPeriod?: string): Promise<ObservedPeriod[]> {
    const through = throughPeriod ?? periodOf(new Date());
    const from = monthsBack(through, MAX_LOOKBACK - 1);

    const rows = await this.prisma.withTenant(companyId, (tx) =>
      (tx as any).invoice.findMany({
        where: {
          companyId,
          status: { in: [...RECOGNISED_STATUSES] },
          createdAt: { gte: periodStart(from) },
        },
        select: { createdAt: true, total: true },
      }),
    );

    const buckets = new Map<string, { revenue: number; invoices: number }>();
    let cursor = from;
    // Walk the calendar rather than the rows so empty months survive.
    for (let i = 0; i < MAX_LOOKBACK && cursor <= through; i++) {
      buckets.set(cursor, { revenue: 0, invoices: 0 });
      cursor = nextPeriod(cursor);
    }
    for (const r of rows as Array<{ createdAt: Date; total: number }>) {
      const p = periodOf(new Date(r.createdAt));
      const b = buckets.get(p);
      if (!b) continue; // outside the window
      b.revenue += Number(r.total) || 0;
      b.invoices += 1;
    }

    return [...buckets.entries()]
      .filter(([p]) => p <= through)
      .map(([period, v]) => ({ period, revenue: +v.revenue.toFixed(2), invoices: v.invoices }));
  }

  /**
   * Value of accepted, unexpired quotes. This is work already won but not yet
   * invoiced — known, not predicted. Reported alongside the forecast and never
   * inside it.
   */
  async pipeline(companyId: string): Promise<{ value: number; quotes: number }> {
    const rows = await this.prisma.withTenant(companyId, (tx) =>
      (tx as any).quote.findMany({
        where: {
          companyId,
          accepted: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { price: true },
      }),
    );
    const quotes = (rows as Array<{ price: number }>).length;
    const value = (rows as Array<{ price: number }>).reduce((s, r) => s + (Number(r.price) || 0), 0);
    return { value: +value.toFixed(2), quotes };
  }

  /**
   * Generate and persist the forecast for the month after `asOfPeriod`
   * (default: the current month).
   *
   * Returns a refusal rather than throwing when there is not enough history,
   * so a caller can show "3 months needed, 1 available" without catching.
   */
  async generate(companyId: string, asOfPeriod?: string): Promise<any | ForecastRefusal> {
    const through = asOfPeriod ?? periodOf(new Date());
    const target = nextPeriod(through);

    const window = await this.observed(companyId, through);
    // Months before the company first billed are not zero-revenue months, so
    // they are not part of the series being extrapolated.
    const series = trimLeadingZeros(window);
    const nonEmpty = series.filter((p) => p.revenue > 0);

    if (nonEmpty.length < MIN_PERIODS) {
      return {
        generated: false,
        forecastPeriod: target,
        reason:
          nonEmpty.length === 0
            ? 'No month in the lookback window has recognised revenue, so there is nothing to extrapolate from.'
            : `Only ${nonEmpty.length} month(s) in the lookback window billed anything. ` +
              `A forecast from fewer than ${MIN_PERIODS} revenue-bearing months would be a guess presented as a projection.`,
        periodsAvailable: nonEmpty.length,
        periodsRequired: MIN_PERIODS,
      };
    }

    const ys = series.map((p) => p.revenue);
    const n = ys.length;
    const useTrend = n >= TREND_MIN_PERIODS;

    const xbar = (n - 1) / 2;
    const ybar = mean(ys);

    let point: number;
    let sePred: number;
    let df: number;
    let slope: number | null = null;

    if (useTrend) {
      const Sxx = ys.reduce((s, _y, i) => s + (i - xbar) ** 2, 0);
      const Sxy = ys.reduce((s, y, i) => s + (i - xbar) * (y - ybar), 0);
      slope = Sxx === 0 ? 0 : Sxy / Sxx;
      const intercept = ybar - slope * xbar;
      const SSE = ys.reduce((s, y, i) => s + (y - (intercept + slope! * i)) ** 2, 0);
      df = n - 2;
      const s = df > 0 ? Math.sqrt(SSE / df) : 0;
      // Prediction interval for a single new observation, not for the mean:
      // the leading 1 is what makes this wider than a confidence interval.
      sePred = s * Math.sqrt(1 + 1 / n + (n - xbar) ** 2 / (Sxx || 1));
      point = intercept + slope * n;
    } else {
      // Too few points to fit a slope without fitting the noise. Report the
      // trailing level and let the interval carry the uncertainty instead.
      df = n - 1;
      sePred = sampleStdDev(ys) * Math.sqrt(1 + 1 / n);
      point = ybar;
    }

    const half = tCritical(df) * sePred;
    const predicted = Math.max(0, +point.toFixed(2));
    // Revenue cannot be negative. When the interval's lower arm reaches past
    // zero the bound is clamped, and the clamp is reported rather than hidden —
    // a clamped interval is no longer symmetric, and pretending otherwise
    // would overstate what the model knows.
    const rawLower = point - half;
    const lowerBound = Math.max(0, +rawLower.toFixed(2));
    const upperBound = +Math.max(point + half, 0).toFixed(2);
    const clamped = rawLower < 0;

    // Derived, never asserted: how tightly the interval brackets its own
    // prediction. ±100% of the prediction scores 0; ±10% scores 90.
    const confidence =
      predicted > 0 ? Math.max(0, Math.min(100, +((1 - half / predicted) * 100).toFixed(1))) : 0;

    const pipe = await this.pipeline(companyId);

    const data = {
      companyId,
      forecastPeriod: target,
      forecastType: 'MONTHLY',
      predictedRevenue: predicted,
      lowerBound,
      upperBound,
      confidence,
      historicalAvg: +ybar.toFixed(2),
      trend: slope === null ? null : +slope.toFixed(2),
      // Estimated only with two full annual cycles; null otherwise, because
      // one observation of a month cannot separate season from noise.
      seasonalFactor: n >= SEASONAL_MIN_PERIODS ? this.seasonalFactor(series, target) : null,
      pipelineValue: pipe.value,
    };

    const row = await this.prisma.withTenant(companyId, (tx) =>
      (tx as any).revenueForecast.upsert({
        where: { companyId_forecastPeriod_forecastType: { companyId, forecastPeriod: target, forecastType: 'MONTHLY' } },
        create: data,
        update: data,
      }),
    );

    return {
      ...(row as Record<string, unknown>),
      generated: true,
      method: useTrend ? 'OLS_TREND' : 'TRAILING_MEAN',
      periodsUsed: n,
      periodsWithRevenue: nonEmpty.length,
      periodsTrimmedBeforeFirstRevenue: window.length - series.length,
      windowMonths: window.length,
      degreesOfFreedom: df,
      residualSpread: +sePred.toFixed(2),
      lowerBoundClampedAtZero: clamped,
      pipeline: pipe,
      // Stated plainly so the number is never read as a measurement.
      basis: useTrend
        ? `Least-squares trend on ${n} monthly totals, interval from residual spread at ${df} degrees of freedom.`
        : `Trailing mean of ${n} monthly totals. Too few periods to fit a trend, so none is claimed.`,
    };
  }

  /**
   * Seasonal multiplier for the target month: the month's mean revenue across
   * complete years, divided by the overall monthly mean. Only meaningful with
   * two or more full cycles, and the caller enforces that.
   */
  private seasonalFactor(series: ObservedPeriod[], target: string): number | null {
    const month = target.split('-')[1];
    const sameMonth = series.filter((p) => p.period.endsWith(`-${month}`)).map((p) => p.revenue);
    if (sameMonth.length < 2) return null;
    const overall = mean(series.map((p) => p.revenue));
    if (overall <= 0) return null;
    return +(mean(sameMonth) / overall).toFixed(3);
  }

  /**
   * Fill in `actualRevenue` and `accuracy` on every forecast whose period has
   * since closed. A forecast that is never scored is an opinion; this is what
   * makes the number earn or lose trust over time.
   */
  async score(companyId: string): Promise<{ scored: number; updated: number }> {
    const current = periodOf(new Date());

    const pending = await this.prisma.withTenant(companyId, (tx) =>
      (tx as any).revenueForecast.findMany({
        where: { companyId, forecastPeriod: { lt: current }, actualRevenue: null },
        select: { id: true, forecastPeriod: true, predictedRevenue: true },
      }),
    );

    const observed = await this.observed(companyId);
    const byPeriod = new Map(observed.map((o) => [o.period, o.revenue]));

    let updated = 0;
    for (const f of pending as Array<{ id: string; forecastPeriod: string; predictedRevenue: number }>) {
      const actual = byPeriod.get(f.forecastPeriod);
      if (actual === undefined) continue; // period not in the lookback window
      // Undefined as a percentage of zero, so it is left null rather than
      // reported as a perfect or infinite miss.
      const accuracy = actual > 0 ? +((Math.abs(actual - f.predictedRevenue) / actual) * 100).toFixed(1) : null;
      await this.prisma.withTenant(companyId, (tx) =>
        (tx as any).revenueForecast.update({
          where: { id: f.id },
          data: { actualRevenue: +actual.toFixed(2), accuracy },
        }),
      );
      updated += 1;
    }

    return { scored: (pending as unknown[]).length, updated };
  }

  /** Persisted forecasts, newest period first, with their score once known. */
  async list(companyId: string, limit = 24) {
    const rows = await this.prisma.withTenant(companyId, (tx) =>
      (tx as any).revenueForecast.findMany({
        where: { companyId },
        orderBy: { forecastPeriod: 'desc' },
        take: limit,
      }),
    );

    return (rows as any[]).map((r) => ({
      ...r,
      // The real test of an interval is whether the outcome landed in it. Not
      // stored: it is derivable and would drift if the bounds were recomputed.
      withinInterval:
        r.actualRevenue === null || r.actualRevenue === undefined
          ? null
          : r.actualRevenue >= r.lowerBound && r.actualRevenue <= r.upperBound,
    }));
  }
}
