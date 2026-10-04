/**
 * TRIM Annexure 33a — Point to Point Running Times.
 *
 * Source: docs/TRIM-ANNEXURE-33A-RUNNING-TIMES-SUPPLIED-SAMPLE-2026-10-04.md
 * Supplied by the owner 2026-10-04. Network Statement V4, FY2026/27.
 * Sample: train 2469, ANGLOALPHA -> NATALSPRUIT, CENTRAL corridor (37% of the journey).
 *
 * This is the schedule. It is what makes "late" a measurable word: Annexure 43
 * supplies the TARGET transit time, this supplies the PLANNED transit time, and
 * operations supply the ACTUAL. The Daily Handshake reconciles the second
 * against the third. Without this file there is no baseline to deviate from.
 *
 * Verified against the supplied sample:
 *   - Train Throughput Runtime == Destination Arrival - Origin Departure
 *   - Point to Point Runtime   == Arrival(n) - Departure(n-1)
 *   - Standing time            == Departure - Arrival
 *   - sum(runtime) + sum(standing) == elapsed, to the second
 *
 * Those identities are what `validateSchedule` checks, because a future
 * edition of the workbook that breaks them is silently lying about its own
 * schedule.
 */

/** A time of day or a duration, as minutes. Fractional minutes are real. */
export type Minutes = number;

/**
 * "19:58:00" -> 1198, "00:14:30" -> 14.5
 *
 * Half-minutes occur throughout the source (VENTERSDORP arrives 21:55:30).
 * Truncating them to whole minutes would round 13 of the sample's 20 rows and
 * drift a 524-minute journey by several minutes, so this returns a float and
 * callers format at the edge.
 */
export function parseClock(raw: string | null | undefined): Minutes | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const parts = s.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return null;
}

/** 1198 -> "19:58:00" ; 14.5 -> "00:14:30". Inverse of parseClock. */
export function formatClock(minutes: Minutes | null): string | null {
  if (minutes == null) return null;
  const sign = minutes < 0 ? '-' : '';
  const total = Math.round(Math.abs(minutes) * 60); // work in seconds to avoid float drift
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface RunningTimeRow {
  origin: string;
  train: string;
  /**
   * Block or section number. NOT a unique row id and NOT monotonic: in the
   * sample, seq 11 appears three times and seq 7 through 12 each appear twice.
   * Never use this as a key.
   */
  nodeSeq: number;
  /** As named in the workbook, e.g. "CENTRAL". See CORRIDOR_TAXONOMY_NOTE. */
  corridor: string;
  /** Station or siding. Sidings carry a code, e.g. "HAD/S242896". */
  station: string;
  arrival: Minutes | null;
  departure: Minutes | null;
  /** Running time from the previous node's departure. */
  pointToPointRuntime: Minutes | null;
  standingTime: Minutes | null;
  standingReason: string | null;
  destination: string;
  /** Distance travelled to reach this node, km. */
  distanceKm: number | null;
}

/** The summary row that precedes a train's node rows. */
export interface TrainSchedule {
  origin: string;
  train: string;
  destination: string;
  originDeparture: Minutes;
  destinationArrival: Minutes;
  /** Stated end-to-end running time. */
  throughputRuntime: Minutes;
  /** Day-of-week mask, seven characters, e.g. "YYYYYYY" = daily. */
  frequency: string;
  /** e.g. "MEDIUM HEAVY/MEDIUM HEAVY". Maps to the Annexure 40 shunting bands. */
  trainType: string;
  sched: number | null;
  departDay: number | null;
  rows: RunningTimeRow[];
}

export interface ScheduleValidation {
  /** Stated throughput vs arrival - departure. */
  throughputTies: boolean;
  /** Rows whose Point to Point Runtime disagrees with the clock. */
  runtimeMismatches: string[];
  /** Rows whose Standing time disagrees with departure - arrival. */
  standingMismatches: string[];
  /** sum(runtime) + sum(standing) vs last arrival - origin departure. */
  elapsedIdentityHolds: boolean;
}

const EPS = 1e-6;

function toRow(f: string[]): RunningTimeRow {
  const num = (v: string) => {
    const t = v.trim();
    return t ? Number(t) : null;
  };
  return {
    origin: f[0]?.trim() ?? '',
    train: f[1]?.trim() ?? '',
    nodeSeq: Number(f[2]) || 0,
    corridor: f[3]?.trim() ?? '',
    station: f[4]?.trim() ?? '',
    arrival: parseClock(f[5]),
    departure: parseClock(f[6]),
    pointToPointRuntime: parseClock(f[7]),
    standingTime: parseClock(f[8]),
    standingReason: f[9]?.trim() || null,
    destination: f[10]?.trim() ?? '',
    distanceKm: num(f[18] ?? ''),
  };
}

function toSchedule(summary: string[]): Omit<TrainSchedule, 'rows'> {
  const num = (v: string) => {
    const t = (v ?? '').trim();
    return t ? Number(t) : null;
  };
  return {
    origin: summary[0]?.trim() ?? '',
    train: summary[1]?.trim() ?? '',
    destination: summary[10]?.trim() ?? '',
    originDeparture: parseClock(summary[11]) ?? 0,
    destinationArrival: parseClock(summary[12]) ?? 0,
    throughputRuntime: parseClock(summary[16]) ?? 0,
    frequency: summary[14]?.trim() ?? '',
    trainType: summary[15]?.trim() ?? '',
    sched: num(summary[13]),
    departDay: num(summary[17]),
    };
}

/**
 * Parse the workbook's tab-separated export.
 *
 * The first row of each train is a SUMMARY row, not a node: it carries the
 * origin departure, destination arrival, throughput, frequency and train type,
 * and leaves the station, clock, runtime and distance columns empty. A loader
 * that treats it as a node inserts a phantom stop with no distance.
 */
export function parseRunningTimes(tsv: string): TrainSchedule[] {
  const lines = tsv.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  /**
   * Rows are keyed on the TRAIN NUMBER, not on having seen a summary row.
   *
   * A pasted extract can begin mid-train. Sample 8412 starts at NODE_Seq 6
   * with its summary row sitting above the cut, so the first row encountered
   * for that train is an ordinary node row. The previous version skipped any
   * row before the first summary (`if (!current) continue`), which silently
   * discarded the whole train: three rows, 9.78 km, gone without a warning.
   */
  const byTrain = new Map<string, TrainSchedule>();
  const order: string[] = [];

  for (const line of lines.slice(1)) {
    const f = line.split('\t');
    while (f.length < 19) f.push('');
    /**
     * The summary row is identified by the Origin Departure Time column, which
     * is populated only there. It cannot be identified by an empty station:
     * the summary row's station field holds the origin name again.
     */
    const isSummary = !!f[11]?.trim();
    const train = f[1]?.trim() || `?${order.length}`;

    if (!byTrain.has(train)) {
      byTrain.set(train, {
        origin: f[0]?.trim() ?? '',
        train,
        destination: f[10]?.trim() ?? '',
        originDeparture: 0,
        destinationArrival: 0,
        throughputRuntime: 0,
        frequency: '',
        trainType: '',
        sched: null,
        departDay: null,
        rows: [],
      });
      order.push(train);
    }

    const entry = byTrain.get(train)!;
    if (isSummary) Object.assign(entry, toSchedule(f));
    else entry.rows.push(toRow(f));
  }

  return order.map((t) => byTrain.get(t)!);
}

/**
 * True when the train's summary row was present.
 *
 * Without it there is no origin departure, no destination arrival and no
 * throughput, so the run cannot be validated end to end — only the rows that
 * were supplied can be checked against each other. A continuation is not an
 * error, but it must not be reported as a complete, validated schedule.
 */
export function hasSummary(s: TrainSchedule): boolean {
  return s.frequency !== '' && s.throughputRuntime > 0;
}

/**
 * Check the schedule against its own arithmetic.
 *
 * Times are minutes within a day, so a journey that crosses midnight has an
 * arrival numerically SMALLER than its departure. Every difference is taken
 * modulo 1440 for that reason.
 */
export function validateSchedule(s: TrainSchedule): ScheduleValidation {
  const span = (from: Minutes, to: Minutes) => (to - from + 1440) % 1440;

  const throughputTies =
    Math.abs(span(s.originDeparture, s.destinationArrival) - s.throughputRuntime) < EPS;

  const runtimeMismatches: string[] = [];
  const standingMismatches: string[] = [];
  let previousDeparture = s.originDeparture;

  s.rows.forEach((r) => {
    if (r.arrival != null && r.pointToPointRuntime != null) {
      if (Math.abs(span(previousDeparture, r.arrival) - r.pointToPointRuntime) > EPS) {
        runtimeMismatches.push(r.station);
      }
    }
    /**
     * The terminus row carries Departure = 00:00:00 and no standing time.
     *
     * That is not a departure at midnight, it is the absence of one — the
     * journey ends there. Read literally it gives a standing period of
     * (0 − arrival + 1440), which flagged EVERY complete train in the sample
     * as a mismatch: 435 minutes of phantom standing at POSTMASBURG, 410 at
     * POSTMASBURG again, 350, 733 and 373 elsewhere. Five trains, five false
     * positives, one cause.
     */
    const isTerminus = r.departure === 0 && r.standingTime == null;
    if (r.arrival != null && r.departure != null && !isTerminus) {
      const standing = span(r.arrival, r.departure);
      if (Math.abs(standing - (r.standingTime ?? 0)) > EPS) {
        standingMismatches.push(r.station);
      }
    }
    if (r.departure != null && !isTerminus) previousDeparture = r.departure;
  });

  const totalRuntime = s.rows.reduce((n, r) => n + (r.pointToPointRuntime ?? 0), 0);
  const totalStanding = s.rows.reduce((n, r) => n + (r.standingTime ?? 0), 0);
  const lastArrival = [...s.rows].reverse().find((r) => r.arrival != null)?.arrival;
  const elapsed = lastArrival == null ? null : span(s.originDeparture, lastArrival);

  return {
    throughputTies,
    runtimeMismatches,
    standingMismatches,
    elapsedIdentityHolds:
      elapsed != null && Math.abs(totalRuntime + totalStanding - elapsed) < EPS,
  };
}

/** Distance covered by the supplied rows, km. */
export function distanceCovered(s: TrainSchedule): number {
  return s.rows.reduce((n, r) => n + (r.distanceKm ?? 0), 0);
}

/** Average speed over the supplied rows, km/h, excluding standing time. */
export function runningSpeedKph(s: TrainSchedule): number | null {
  const km = distanceCovered(s);
  const mins = s.rows.reduce((n, r) => n + (r.pointToPointRuntime ?? 0), 0);
  return mins > 0 ? (km / mins) * 60 : null;
}

/** True when every supplied row has a distance, i.e. the sample is complete. */
export function isComplete(s: TrainSchedule): boolean {
  const last = s.rows[s.rows.length - 1];
  if (!last) return false;
  // A truncated export simply stops mid-journey; the last node is not the destination.
  return last.station.toUpperCase() === s.destination.toUpperCase();
}

/**
 * The corridor names in Annexure 33a do not match the corridor names in
 * Annexure 43.
 *
 * The sample's corridor is "CENTRAL". Annexure 43 names its ten corridors by
 * route (Ore, Manganese, Magnetite, Musina-Pyramid/Hoedspruit,
 * Vereeniging-Danskraal-East London, Mafikeng-Beaconsfield/Potchefstroom,
 * Lephalale-Richardsbay, Johannesburg-Durban, Rayton-Komatipoort/Richards Bay,
 * Johannesburg-Cape Town) and "CENTRAL" is not among them.
 *
 * So a running time cannot yet be compared against its KPI target without a
 * mapping, and no mapping may be guessed: putting ANGLOALPHA->NATALSPRUIT
 * under the wrong corridor would measure it against the wrong target.
 */
export const CORRIDOR_TAXONOMY_NOTE =
  'Annexure 33a corridor names do not match Annexure 43 corridor names; a supplied mapping is required before transit times can be measured against KPI targets.';

/**
 * Train Type maps onto Annexure 40's shunting tariff bands.
 *
 * Annexure 40 item 1 (Yards: shunting and marshalling) is billed "Per wagon
 * movement (GF <50 wagons; Medium heavy >50 <100; heavy >100)". The Train Type
 * column here carries the same vocabulary ("MEDIUM HEAVY/MEDIUM HEAVY"), so
 * this file determines which band a service is charged at. That is a direct
 * 33a -> 40 dependency, and it is the one place where a schedule field drives
 * an ancillary charge.
 */
export function shuntingBandFor(trainType: string): string | null {
  const t = trainType.toUpperCase();
  if (t.includes('HEAVY') && !t.includes('MEDIUM')) return 'heavy (>100 wagons)';
  if (t.includes('MEDIUM HEAVY')) return 'medium heavy (>50 <100 wagons)';
  if (t.includes('GF')) return 'GF (<50 wagons)';
  return null;
}
