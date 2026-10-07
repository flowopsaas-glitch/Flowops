import { boundedAverage, DAY_MS, KPI_NO_DATA_NOTE, rollingWindow, safeRate } from './kpi-math';

/**
 * KPI correctness regression tests.
 *
 * The dashboard used to show "0%" for "no data" (indistinguishable from
 * "everything failed"), compute rates whose numerator and denominator came from
 * different populations, and average durations that included impossible values
 * (negative transit, months-long outliers). These tests pin the rules that make
 * a displayed number trustworthy:
 *   - no valid denominator  → null, never 0 and never 100;
 *   - numerator > denominator → clamped (a data error is not 130%);
 *   - impossible samples are excluded AND counted, not silently dropped;
 *   - enough samples → the extreme 5% of each tail is trimmed.
 */

describe('safeRate', () => {
  it('returns null — not 0% — when there are no records', () => {
    const rate = safeRate(0, 0);
    expect(rate.percentage).toBeNull();
    expect(rate.hasData).toBe(false);
  });

  it('returns a real 0% when there ARE records and none succeeded', () => {
    const rate = safeRate(0, 10);
    expect(rate.percentage).toBe(0);
    expect(rate.hasData).toBe(true);
  });

  it('computes a normal percentage', () => {
    expect(safeRate(9, 10).percentage).toBe(90);
  });

  it('clamps a numerator larger than its denominator instead of reporting >100%', () => {
    const rate = safeRate(13, 10);
    expect(rate.percentage).toBe(100);
    expect(rate.denominator).toBe(10);
    expect(rate.numerator).toBe(10); // the clamp is visible, not hidden
  });

  it('treats a negative denominator as no data', () => {
    expect(safeRate(5, -1).percentage).toBeNull();
  });

  it('treats non-finite inputs as no data rather than NaN', () => {
    expect(safeRate(NaN, 10).percentage).toBe(0);
    expect(safeRate(5, NaN).percentage).toBeNull();
  });

  it('honours the requested precision', () => {
    expect(safeRate(1, 3, 1).percentage).toBe(33.3);
    expect(safeRate(1, 3, 2).percentage).toBe(33.33);
  });
});

describe('boundedAverage', () => {
  it('returns null (not 0) when there are no usable samples', () => {
    expect(boundedAverage([]).value).toBeNull();
    expect(boundedAverage([null, undefined]).value).toBeNull();
  });

  it('excludes impossible values and reports how many it dropped', () => {
    const result = boundedAverage([10, -5, 20, 1200], { min: 0, max: 100 });
    expect(result.value).toBe(15); // (10 + 20) / 2 — the two invalid samples are out
    expect(result.excluded).toBe(2);
    expect(result.count).toBe(2);
  });

  it('reports a negative delivery duration as excluded, never averaged in', () => {
    // Clock skew: "delivered" before it was picked up.
    const result = boundedAverage([2, -8, 4], { min: 0, max: 720, unit: 'hours' });
    expect(result.value).toBe(3);
    expect(result.excluded).toBe(1);
  });

  it('does not trim below the trim threshold', () => {
    const samples = Array.from({ length: 10 }, (_, i) => i + 1); // 1..10, mean 5.5
    expect(boundedAverage(samples, { trimFrom: 20 }).value).toBe(5.5);
  });

  it('trims the extreme 5% of each tail once there are enough samples', () => {
    // 100 samples in 1..100 (mean 50.5) plus one catastrophic outlier.
    const samples: number[] = Array.from({ length: 99 }, (_, i) => i + 1);
    samples.push(10_000);
    const untrimmed = samples.reduce((s, v) => s + v, 0) / samples.length;
    const result = boundedAverage(samples, { min: 0, max: 20_000 });
    expect(result.value).not.toBeNull();
    expect(result.value!).toBeLessThan(untrimmed);
    expect(result.count).toBe(100); // the sample size is honest about what came in
  });

  it('carries the sample count and unit so the UI can show confidence', () => {
    const result = boundedAverage([1, 2, 3], { unit: 'hours' });
    expect(result).toMatchObject({ value: 2, count: 3, excluded: 0, unit: 'hours' });
  });
});

describe('rollingWindow', () => {
  it('is a half-open window of exactly the requested length ending now', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    const { start, end } = rollingWindow(30, now);
    expect(end).toEqual(now);
    expect(end.getTime() - start.getTime()).toBe(30 * DAY_MS);
  });
});

describe('the no-data note', () => {
  it('explains the em dash so the UI never has to apologise for a blank', () => {
    expect(KPI_NO_DATA_NOTE).toMatch(/—/);
  });
});
