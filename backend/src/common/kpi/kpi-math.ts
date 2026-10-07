/**
 * KPI maths — the pure half of the KPI layer.
 *
 * These are free functions so any service (dashboard, rail, forwarding, driver
 * scoring) can apply the same rules without a DI dependency, and so the rules
 * are unit-testable in isolation. `KpiConsistencyService` delegates to them.
 *
 * The rules:
 *   - a rate with no valid denominator is `null` (render "—"), never 0 or 100;
 *   - a numerator larger than its denominator is a data error, not 130% — it is
 *     clamped and the caller still gets the real denominator;
 *   - averages drop values outside hard domain bounds (impossible durations,
 *     clock skew) and report how many were dropped;
 *   - once there are enough samples, the extreme 5% of each tail is trimmed so a
 *     single stuck record cannot set an operational number.
 */

export interface KpiRate {
  /** null when there is no valid denominator — render "—", never 0. */
  percentage: number | null;
  numerator: number;
  denominator: number;
  /** true when at least one record supported the number. */
  hasData: boolean;
}

export interface KpiAverage {
  value: number | null;
  count: number;
  /** Records dropped as impossible/outliers (kept for auditability). */
  excluded: number;
  unit: string;
}

export interface KpiWindow {
  start: Date;
  end: Date;
}

export const DAY_MS = 86_400_000;

/** Plain-language note attached to every KPI payload so "—" is explainable. */
export const KPI_NO_DATA_NOTE = 'Shown as — until there are valid records for the window.';

/**
 * Safe rate. Returns null when the denominator is 0, negative, or non-finite,
 * so a dashboard can never show "0%" (or "100%") for "no data".
 */
export function safeRate(numerator: number, denominator: number, decimals = 1): KpiRate {
  const n = Number.isFinite(numerator) ? numerator : 0;
  const d = Number.isFinite(denominator) ? denominator : 0;
  if (d <= 0) {
    return { percentage: null, numerator: n, denominator: 0, hasData: false };
  }
  // A numerator > denominator is a data error, not 130%.
  const clamped = Math.min(Math.max(n, 0), d);
  const factor = 10 ** decimals;
  return {
    percentage: Math.round((clamped / d) * 100 * factor) / factor,
    numerator: clamped,
    denominator: d,
    hasData: true,
  };
}

/**
 * Average over numeric samples with hard bounds and (from `trimFrom` samples)
 * 5% trimmed from each tail. Impossible values are counted, not averaged in.
 */
export function boundedAverage(
  samples: Array<number | null | undefined>,
  opts: { min?: number; max?: number; unit?: string; trimFrom?: number } = {},
): KpiAverage {
  const { min = -Infinity, max = Infinity, unit = '', trimFrom = 20 } = opts;
  const valid: number[] = [];
  let excluded = 0;
  for (const sample of samples) {
    if (sample == null || !Number.isFinite(sample) || sample < min || sample > max) {
      if (sample != null) excluded++;
      continue;
    }
    valid.push(sample);
  }
  if (valid.length === 0) return { value: null, count: 0, excluded, unit };

  let working = valid;
  if (valid.length >= trimFrom) {
    const sorted = [...valid].sort((a, b) => a - b);
    const cut = Math.floor(sorted.length * 0.05);
    working = sorted.slice(cut, sorted.length - cut);
    if (working.length === 0) working = sorted;
  }
  const total = working.reduce((sum, v) => sum + v, 0);
  return {
    value: Math.round((total / working.length) * 10) / 10,
    count: valid.length,
    excluded,
    unit,
  };
}

/** Inclusive-lower, exclusive-upper window of the last `days` days. */
export function rollingWindow(days: number, now: Date = new Date()): KpiWindow {
  const end = now;
  const start = new Date(now.getTime() - days * DAY_MS);
  return { start, end };
}
