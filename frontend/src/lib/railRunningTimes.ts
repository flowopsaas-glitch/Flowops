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
  /**
   * Day offset from the train's departure day, PER ROW.
   *
   * This was modelled as a per-train field taken from the summary row, which
   * is wrong: it increments partway through a run. Train 7403 departs on day 0
   * and its rows carry 0 up to KOEKEMOER at 23:46, then 1 from NEWMACHAVIE at
   * 00:01 onward. Two rows can legitimately share a clock time on different
   * days, so time-of-day alone does not identify a node.
   */
  departDay: number | null;
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
  /**
   * Rows the clocks say the train travelled to, that carry no Point to Point
   * Runtime at all.
   *
   * A null runtime is not the same thing as a zero runtime. Yard moves are
   * recorded at five-second granularity — a shunt car arrives at 07:18:15 and
   * departs at 07:18:20 — and the export leaves the runtime column blank rather
   * than writing `00:00:05`. Read as zero, those rows are invisible; in fact
   * they are where the two numeric columns stop adding up to the elapsed time.
   *
   * Reported rather than inferred: the missing seconds are genuinely absent
   * from the source, and inventing them would put a number in the schedule
   * that no supplied line supports.
   */
  unrecordedTravel: string[];
  /** sum(runtime) + sum(standing) vs last arrival - origin departure. */
  elapsedIdentityHolds: boolean;
}

const EPS = 1e-6;

/**
 * Decode the XML/HTML entities the workbook export leaves in its text columns.
 *
 * The crossing and shunting reasons are free text, and any reason that names
 * two trains arrives HTML-escaped: `SHUNT &amp; X 1214`, `X 71008 &amp; 3474`,
 * `RM X 81002 &amp; 71010`. Stored literally, every one of them is a distinct
 * reason string from the unescaped form of itself, so a group-by on reason
 * splits a single cause in two — and the ampersand is the one character that
 * reliably appears, because it is what joins two train numbers.
 *
 * Only the five named entities the export is known to use are mapped, plus
 * numeric character references. Anything unrecognised is left exactly as it
 * was found: an unrecognised entity is a fact about the source, and silently
 * dropping it would be worse than keeping it.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function toRow(f: string[]): RunningTimeRow {
  const num = (v: string) => {
    const t = v.trim();
    return t ? Number(t) : null;
  };
  return {
    origin: decodeEntities(f[0]),
    train: f[1]?.trim() ?? '',
    nodeSeq: Number(f[2]) || 0,
    corridor: decodeEntities(f[3]),
    station: decodeEntities(f[4]),
    arrival: parseClock(f[5]),
    departure: parseClock(f[6]),
    pointToPointRuntime: parseClock(f[7]),
    standingTime: parseClock(f[8]),
    standingReason: decodeEntities(f[9]) || null,
    destination: decodeEntities(f[10]),
    distanceKm: num(f[18] ?? ''),
    departDay: num(f[17] ?? ''),
  };
}

function toSchedule(summary: string[]): Omit<TrainSchedule, 'rows'> {
  const num = (v: string) => {
    const t = (v ?? '').trim();
    return t ? Number(t) : null;
  };
  return {
    origin: decodeEntities(summary[0]),
    train: summary[1]?.trim() ?? '',
    destination: decodeEntities(summary[10]),
    originDeparture: parseClock(summary[11]) ?? 0,
    destinationArrival: parseClock(summary[12]) ?? 0,
    throughputRuntime: parseClock(summary[16]) ?? 0,
    frequency: summary[14]?.trim() ?? '',
    trainType: decodeEntities(summary[15]),
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
 * Elapsed minutes from the origin departure to the last row's arrival.
 *
 * Returns null unless the rows carry per-row day offsets, because without
 * them there is no way to tell a 3-hour run from a 27-hour one: both can
 * present an arrival numerically close to their departure on a 24-hour clock.
 *
 * Train 6455 runs 27h09m. A modular difference wraps it to 189 minutes and
 * reports a train that reconciles exactly as failing every check, so the
 * totals below are taken from the day offsets rather than from the clock.
 *
 * This measures the ROWS PRESENT, so on a partial extract it returns the
 * elapsed time to the last row supplied and not to the destination. That is
 * the honest answer, and it is why throughputTies does not use it directly.
 */
export function elapsedMinutes(s: TrainSchedule): Minutes | null {
  const first = s.rows.find((r) => r.departDay != null)?.departDay;
  const last = s.rows.filter((r) => r.arrival != null).at(-1);
  if (first == null || last?.arrival == null || last.departDay == null) return null;
  const elapsed = last.arrival + (last.departDay - first) * 1440 - s.originDeparture;
  return elapsed < 0 ? elapsed + 1440 : elapsed;
}

/**
 * Days between the origin departure and the destination arrival, or null when
 * the rows do not run as far as the destination.
 *
 * The summary row gives a departure time, an arrival time and a throughput,
 * but no date, so on its own it cannot say whether 15:40 -> 18:49 means 189
 * minutes or 1629. Only the supplied rows carry that. Where they stop short of
 * the destination there is nothing to infer from, and null is returned rather
 * than a guess.
 *
 * The offsets themselves are not above suspicion. Train 18415 departs at
 * 23:35 and arrives at 00:42, plainly the next morning, and carries
 * Depart_Day = 0 on every row including the last — the offset was never
 * incremented. A run cannot take negative time, so where the arithmetic says
 * it does, the offset is treated as one day stale and corrected.
 */
function arrivalDayOffset(s: TrainSchedule): number | null {
  const last = s.rows.filter((r) => r.arrival != null).at(-1);
  const first = s.rows.find((r) => r.departDay != null)?.departDay;
  if (last?.departDay == null || first == null) return null;
  if (last.station !== s.destination) return null;
  let days = last.departDay - first;
  if (s.destinationArrival + days * 1440 - s.originDeparture < 0) days += 1;
  return days;
}

/**
 * Check the schedule against its own arithmetic.
 *
 * Times are minutes within a day, so a journey that crosses midnight has an
 * arrival numerically SMALLER than its departure. Individual hops are taken
 * modulo 1440 for that reason — no single hop in the sample approaches 24
 * hours. The journey TOTALS are not: they use the day offsets, because a run
 * can and does exceed a full day.
 */
export function validateSchedule(s: TrainSchedule): ScheduleValidation {
  const span = (from: Minutes, to: Minutes) => (to - from + 1440) % 1440;

  /**
   * The stated throughput is checked against the summary row, not against the
   * rows supplied. Where those rows run through to the destination they say
   * how many days the journey took, which is the only way to read a span
   * longer than a day; where they stop short, the modular reading is all
   * there is to go on.
   */
  const days = arrivalDayOffset(s);
  const summarySpan =
    days == null
      ? span(s.originDeparture, s.destinationArrival)
      : s.destinationArrival + days * 1440 - s.originDeparture;
  const throughputTies = Math.abs(summarySpan - s.throughputRuntime) < EPS;

  const runtimeMismatches: string[] = [];
  const standingMismatches: string[] = [];
  const unrecordedTravel: string[] = [];
  let previousDeparture = s.originDeparture;

  s.rows.forEach((r, i) => {
    if (r.arrival != null && r.pointToPointRuntime != null) {
      if (Math.abs(span(previousDeparture, r.arrival) - r.pointToPointRuntime) > EPS) {
        runtimeMismatches.push(r.station);
      }
    } else if (
      /**
       * Only where the summary row was supplied. A continuation begins
       * mid-train with no origin departure to measure the first hop from, so
       * the span there is meaningless rather than small.
       */
      hasSummary(s) &&
      r.arrival != null &&
      Math.abs(span(previousDeparture, r.arrival)) > EPS
    ) {
      unrecordedTravel.push(r.station);
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
     *
     * But 00:00:00 is genuinely ambiguous, and testing the departure alone is
     * not enough. Train 8000 arrives at UMKOMAAS at midnight and departs at
     * midnight, eleven rows before its journey ends; treating that as a
     * terminus left the previous departure stale and reported the row after
     * it as three and a half minutes adrift when it was exact. Train 1710
     * departs HAMMARSDALE at a real midnight with five minutes of standing
     * recorded against it. So the row must also be the LAST row, and any
     * recorded standing time disqualifies it on its own.
     */
    const isTerminus =
      i === s.rows.length - 1 && r.departure === 0 && r.standingTime == null;
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
  /**
   * The elapsed identity is measured over the rows supplied, so it is a claim
   * about those rows and not about the whole journey. On a partial extract it
   * is expected to fail, and that is a true report rather than a defect.
   */
  const elapsed = elapsedMinutes(s);

  return {
    throughputTies,
    runtimeMismatches,
    standingMismatches,
    unrecordedTravel,
    elapsedIdentityHolds:
      elapsed != null && Math.abs(totalRuntime + totalStanding - elapsed) < EPS,
  };
}

/**
 * Whether a run spans more than one calendar day.
 *
 * Derived from the per-row day offsets rather than by comparing clock times:
 * a run that departs at 16:30 and arrives at 12:57 has an arrival that is
 * NUMERICALLY EARLIER than its departure, and a run that departs at 04:00 and
 * arrives at 21:36 does not. Only the day offset distinguishes them reliably.
 */
export function spansDays(s: TrainSchedule): boolean {
  const days = new Set(s.rows.map((r) => r.departDay).filter((d): d is number => d != null));
  return days.size > 1;
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
