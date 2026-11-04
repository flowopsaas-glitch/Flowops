/**
 * Turning odometer readings into believable distance.
 *
 * ── The bug this replaces ──────────────────────────────────────────────────
 * The truck pack computed a driver's distance as `max(readings) - min(readings)`.
 * Readings are attached to a **driver**, not a vehicle, and nothing enforces
 * that a driver uses one vehicle — nor that a reading is a typo-free fact. Two
 * consequences, both silent:
 *
 *   - A driver who swaps between a 120 000 km truck and a 45 000 km bakkie
 *     produces a "span" of 75 000 km that never happened, and every km metric
 *     derived from it — empty running, cost per km, the loaded/empty split —
 *     is wrong in the flattering direction for the fleet and the accusing
 *     direction for the driver.
 *   - One fat-fingered reading (1 200 000 instead of 120 000) inflates the span
 *     by ~1 million km and survives every later, correct reading, because
 *     min/max never forget.
 *
 * ── What this does instead ────────────────────────────────────────────────
 * Distance is the sum of **increases between consecutive readings**, and only
 * those increases that are physically believable:
 *
 *   - a decrease is a rollback — an odometer reset, a different vehicle, or a
 *     typo — and contributes nothing;
 *   - an increase larger than `maxDeltaKm` between two logged readings is not a
 *     distance anyone drove between two fuel stops, so it contributes nothing
 *     either.
 *
 * Dropped readings are *counted*, never hidden: the report says how many were
 * left out so an operator can see that the number rests on fewer readings than
 * it looks like. A wrong figure that announces itself is recoverable; one that
 * does not is not.
 *
 * This is a guard-rail, not a measurement. It cannot know which vehicle a
 * reading came from; it can refuse to pretend it does.
 */

export interface OdometerReading {
  /** When the reading was taken. Readings without a usable time keep input order. */
  at?: Date | null;
  /** Kilometres on the clock. */
  km: number | null | undefined;
  /** Where it came from — `cost` (fuel/expense entry) or `service`. Diagnostics only. */
  source?: string;
}

export interface OdometerSpan {
  /**
   * Believable distance, or `null` when there is not enough evidence to say —
   * fewer than two usable readings. Never `0` as a stand-in for "unknown".
   */
  km: number | null;
  /** Readings that carried a usable number. */
  readings: number;
  /** Readings left out of the chain because they could not be believed. */
  excluded: number;
  /** Plain-language account of what was and was not counted. */
  note: string;
}

export interface OdometerOptions {
  /**
   * Largest believable increase between two consecutive readings.
   *
   * 5 000 km is generous on purpose: a long-haul truck covers roughly 800 km a
   * day, so anything beyond this is not one interval between two logs — it is a
   * different vehicle or a mistyped number. Raising it does not add accuracy,
   * it re-admits exactly the errors this function exists to drop.
   */
  maxDeltaKm?: number;
}

const DEFAULT_MAX_DELTA_KM = 5000;

export function odometerSpan(readings: readonly OdometerReading[], options: OdometerOptions = {}): OdometerSpan {
  const maxDeltaKm = options.maxDeltaKm ?? DEFAULT_MAX_DELTA_KM;

  const usable = readings.filter(
    (reading): reading is OdometerReading & { km: number } =>
      typeof reading.km === 'number' && Number.isFinite(reading.km) && reading.km >= 0,
  );

  if (usable.length < 2) {
    return {
      km: null,
      readings: usable.length,
      excluded: 0,
      note:
        usable.length === 1
          ? 'One odometer reading — a single reading measures nothing. Log the odometer with each fuel entry.'
          : 'No odometer readings in this period.',
    };
  }

  // Order by time where times are known. Where none are, the caller's order is
  // the only order available and is used as given.
  const timed = usable.filter(
    (reading) => reading.at instanceof Date && !Number.isNaN(reading.at.getTime()),
  ) as Array<OdometerReading & { km: number; at: Date }>;
  const ordered = timed.length >= 2 ? [...timed].sort((a, b) => a.at.getTime() - b.at.getTime()) : [...usable];

  let km = 0;
  let excluded = 0;
  let increases = 0;

  for (let index = 1; index < ordered.length; index += 1) {
    const delta = ordered[index].km - ordered[index - 1].km;
    if (delta === 0) continue;
    if (delta < 0) {
      excluded += 1;
      continue;
    }
    if (delta > maxDeltaKm) {
      excluded += 1;
      continue;
    }
    km += delta;
    increases += 1;
  }

  const note =
    excluded === 0
      ? `Sum of ${increases} increase${increases === 1 ? '' : 's'} between ${ordered.length} odometer readings.`
      : `${excluded} of ${ordered.length} readings could not be chained (the odometer went backwards or jumped more than ${maxDeltaKm} km between logs — a reset, a different vehicle, or a mistyped number) and were left out.`;

  return {
    km: Math.round(km * 100) / 100,
    readings: usable.length,
    excluded,
    note,
  };
}
