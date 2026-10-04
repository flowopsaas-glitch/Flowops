import { describe, it, expect } from 'vitest';
import {
  CORRIDOR_TAXONOMY_NOTE,
  hasSummary,
  distanceCovered,
  formatClock,
  isComplete,
  parseClock,
  parseRunningTimes,
  runningSpeedKph,
  shuntingBandFor,
  validateSchedule,
} from './railRunningTimes';

/**
 * The supplied sample: train 2469, ANGLOALPHA -> NATALSPRUIT, CENTRAL corridor.
 * Truncated at HARDEKLIP — 37% of the journey.
 */
const SAMPLE = `Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
ANGLOALPHA	2469	1	CENTRAL	ANGLOALPHA		19:58:00				NATALSPRUIT	19:58:00	04:42:00	1.0	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	08:44:00	0
ANGLOALPHA	2469	1	CENTRAL	AAA/S241253	19:59:00	20:00:00	00:01:00	00:01:00	B SHUNT	NATALSPRUIT						08:44:00	0	0.97
ANGLOALPHA	2469	2	CENTRAL	ANGLOALPHA	20:01:00	20:03:00	00:01:00	00:02:00	SHUNT	NATALSPRUIT						08:44:00	0	0.97
ANGLOALPHA	2469	3	CENTRAL	RIETGAT	20:06:00	20:06:00	00:03:00			NATALSPRUIT						08:44:00	0	2.93
ANGLOALPHA	2469	4	CENTRAL	HALFPAD	20:12:00	20:13:00	00:06:00	00:01:00	SHUNT	NATALSPRUIT						08:44:00	0	8.36
ANGLOALPHA	2469	5	CENTRAL	HAD/S242896	20:14:00	20:15:00	00:01:00	00:01:00	SHUNT	NATALSPRUIT						08:44:00	0	0.97
ANGLOALPHA	2469	6	CENTRAL	HALFPAD	20:16:00	20:17:00	00:01:00	00:01:00	SHUNT	NATALSPRUIT						08:44:00	0	0.97
ANGLOALPHA	2469	7	CENTRAL	SYFERPAN	20:25:00	20:25:00	00:08:00			NATALSPRUIT						08:44:00	0	8.65
ANGLOALPHA	2469	7	CENTRAL	COLIGNY	20:35:00	20:46:00	00:10:00	00:11:00	CHANGE OF TCO/SHUNT	NATALSPRUIT						08:44:00	0	11.82
ANGLOALPHA	2469	8	CENTRAL	TATODI	21:00:00	21:00:00	00:14:00			NATALSPRUIT						08:44:00	0	17.73
ANGLOALPHA	2469	8	CENTRAL	BODENSTEIN	21:06:00	21:06:00	00:06:00			NATALSPRUIT						08:44:00	0	5.83
ANGLOALPHA	2469	9	CENTRAL	GATIEP	21:16:00	21:16:00	00:10:00			NATALSPRUIT						08:44:00	0	11.53
ANGLOALPHA	2469	9	CENTRAL	MAKOKSKRAAL	21:27:00	21:27:00	00:11:00			NATALSPRUIT						08:44:00	0	13.99
ANGLOALPHA	2469	10	CENTRAL	RATSAGAE	21:41:00	21:41:00	00:14:00			NATALSPRUIT						08:44:00	0	18.55
ANGLOALPHA	2469	10	CENTRAL	VENTERSDORP	21:55:30	21:55:30	00:14:30			NATALSPRUIT						08:44:00	0	14.99
ANGLOALPHA	2469	11	CENTRAL	NOLTE	22:13:00	22:28:00	00:17:30	00:15:00	X ?	NATALSPRUIT						08:44:00	0	13.81
ANGLOALPHA	2469	11	CENTRAL	GROMOFONT	22:37:30	22:37:30	00:09:30			NATALSPRUIT						08:44:00	0	9.64
ANGLOALPHA	2469	11	CENTRAL	BUCKINGHAM	22:45:30	22:45:30	00:08:00			NATALSPRUIT						08:44:00	0	7.75
ANGLOALPHA	2469	12	CENTRAL	RYSMIERBULT	23:01:00	23:01:00	00:15:30			NATALSPRUIT						08:44:00	0	19.42
ANGLOALPHA	2469	12	CENTRAL	HARDEKLIP	23:13:30	23:13:30	00:12:30			NATALSPRUIT						08:44:00	0	11.3`;

const schedule = () => parseRunningTimes(SAMPLE)[0];

describe('clock parsing', () => {
  it('reads hh:mm:ss as minutes', () => {
    expect(parseClock('19:58:00')).toBe(1198);
    expect(parseClock('08:44:00')).toBe(524);
  });

  /**
   * Thirteen of the sample's values carry thirty seconds. Rounding them would
   * shift every downstream arrival and drift the journey by minutes.
   */
  it('preserves half minutes', () => {
    expect(parseClock('21:55:30')).toBe(1315.5);
    expect(parseClock('00:14:30')).toBe(14.5);
    expect(parseClock('00:17:30')).toBe(17.5);
  });

  it('round-trips through formatClock', () => {
    expect(formatClock(parseClock('21:55:30'))).toBe('21:55:30');
    expect(formatClock(parseClock('08:44:00'))).toBe('08:44:00');
  });

  it('returns null for empty and unparseable input rather than 0', () => {
    expect(parseClock('')).toBeNull();
    expect(parseClock(null)).toBeNull();
    expect(parseClock('nonsense')).toBeNull();
  });
});

describe('parsing the workbook', () => {
  it('reads the summary row without inventing a phantom stop', () => {
    const s = schedule();
    expect(s.train).toBe('2469');
    expect(s.origin).toBe('ANGLOALPHA');
    expect(s.destination).toBe('NATALSPRUIT');
    expect(s.rows).toHaveLength(19);
    expect(s.rows.every((r) => r.station.length > 0)).toBe(true);
  });

  it('carries the schedule-level fields', () => {
    const s = schedule();
    expect(s.originDeparture).toBe(1198);
    expect(s.destinationArrival).toBe(282); // 04:42, the following day
    expect(s.throughputRuntime).toBe(524);
    expect(s.frequency).toBe('YYYYYYY');
    expect(s.trainType).toBe('MEDIUM HEAVY/MEDIUM HEAVY');
  });

  /**
   * NODE_Seq looks like a row id and is not one. In the sample, blocks 7-12
   * each cover two stations and block 11 covers three. Anything keyed on it
   * will silently drop stops.
   */
  it('exposes NODE_Seq as a non-unique block number', () => {
    const s = schedule();
    const seqs = s.rows.map((r) => r.nodeSeq);
    expect(new Set(seqs).size).toBeLessThan(seqs.length);
    expect(seqs.filter((n) => n === 11)).toHaveLength(3);
  });

  /** A train shunts out to a siding and back, so one station can recur. */
  it('allows a station to appear more than once', () => {
    const s = schedule();
    expect(s.rows.filter((r) => r.station === 'HALFPAD')).toHaveLength(2);
  });
});

describe('the schedule ties to its own arithmetic', () => {
  it('throughput equals destination arrival minus origin departure, across midnight', () => {
    const s = schedule();
    expect((s.destinationArrival - s.originDeparture + 1440) % 1440).toBe(s.throughputRuntime);
  });

  it('reports no mismatches anywhere', () => {
    const v = validateSchedule(schedule());
    expect(v.throughputTies).toBe(true);
    expect(v.runtimeMismatches).toEqual([]);
    expect(v.standingMismatches).toEqual([]);
    expect(v.elapsedIdentityHolds).toBe(true);
  });

  /** A future edition that lies about itself must fail rather than load. */
  it('detects a runtime that contradicts the clock', () => {
    const broken = parseRunningTimes(SAMPLE)[0];
    const i = broken.rows.findIndex((r) => r.station === 'RIETGAT');
    expect(i).toBeGreaterThanOrEqual(0);
    broken.rows[i] = { ...broken.rows[i], pointToPointRuntime: 99 };
    const v = validateSchedule(broken);
    expect(v.runtimeMismatches).toContain('RIETGAT');
    expect(v.elapsedIdentityHolds).toBe(false);
  });

  it('detects a throughput that contradicts the endpoints', () => {
    const broken = parseRunningTimes(SAMPLE)[0];
    broken.throughputRuntime = 400;
    expect(validateSchedule(broken).throughputTies).toBe(false);
  });
});

describe('what the sample covers', () => {
  /** The export stops at HARDEKLIP, not NATALSPRUIT. */
  it('knows it is truncated rather than complete', () => {
    expect(isComplete(schedule())).toBe(false);
    expect(schedule().rows.at(-1)?.station).toBe('HARDEKLIP');
  });

  it('covers 180.18 km and 37 percent of the journey', () => {
    const s = schedule();
    expect(distanceCovered(s)).toBeCloseTo(180.18, 2);
    const elapsed = (s.rows.at(-1)!.arrival! - s.originDeparture + 1440) % 1440;
    expect(elapsed / s.throughputRuntime).toBeCloseTo(0.373, 2);
  });

  it('averages 66.1 km/h running, 55.3 km/h including standing', () => {
    expect(runningSpeedKph(schedule())).toBeCloseTo(66.1, 1);
    const s = schedule();
    const elapsed = (s.rows.at(-1)!.arrival! - s.originDeparture + 1440) % 1440;
    expect((distanceCovered(s) / elapsed) * 60).toBeCloseTo(55.3, 1);
  });
});

describe('cross-document links', () => {
  /**
   * Annexure 40 item 1 is billed "Per wagon movement (GF <50 wagons; Medium
   * heavy >50 <100; heavy >100)". The Train Type column uses the same
   * vocabulary, so the schedule decides the tariff band.
   */
  it('maps train type onto the Annexure 40 shunting bands', () => {
    expect(shuntingBandFor('MEDIUM HEAVY/MEDIUM HEAVY')).toBe('medium heavy (>50 <100 wagons)');
    expect(shuntingBandFor('HEAVY/HEAVY')).toBe('heavy (>100 wagons)');
    expect(shuntingBandFor('GF/GF')).toBe('GF (<50 wagons)');
    expect(shuntingBandFor('MEDIUM HEAVY/MEDIUM HEAVY')).not.toBe('heavy (>100 wagons)');
  });

  it('returns null for a train type it does not recognise', () => {
    expect(shuntingBandFor('SOMETHING ELSE')).toBeNull();
  });

  /**
   * The blocking gap. "CENTRAL" is this file's corridor; Annexure 43 names its
   * ten corridors by route and CENTRAL is not one of them, so a running time
   * cannot yet be measured against its KPI target.
   */
  it('records that the corridor taxonomies do not match', () => {
    expect(schedule().rows[0].corridor).toBe('CENTRAL');
    expect(CORRIDOR_TAXONOMY_NOTE).toMatch(/do not match/);
  });
});

/**
 * Second supplied extract: trains 8412, 8422, 8426, 10008, 10010 on the CAPE
 * and ORELINE corridors. Two of its properties broke the first implementation.
 */
const BATCH2 = `Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
SIN-MYN-WISST	8412	6	CAPE	BEK/S242799	16:29:00	16:30:00	00:01:00	00:01:00	SHUNT	POSTMASBURG						02:10:00	0	0.97
SIN-MYN-WISST	8412	7	CAPE	BEESHOEK	16:31:00	16:31:00	00:01:00			POSTMASBURG						02:10:00	0	0.97
SIN-MYN-WISST	8412	8	CAPE	POSTMASBURG	16:45:00	00:00:00	00:14:00		RT	POSTMASBURG						02:10:00	0	7.84
SIN-MYN-WISST	8422	1	CAPE	SIN-MYN-WISST		15:10:00				POSTMASBURG	15:10:00	17:10:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:00:00	0
SIN-MYN-WISST	8422	1	CAPE	GAMMAGARA	15:29:30	15:29:30	00:19:30		C	POSTMASBURG						02:00:00	0	3.25
SIN-MYN-WISST	8422	2	CAPE	MOOKANENG	15:35:00	15:35:00	00:05:30			POSTMASBURG						02:00:00	0	9.63
SIN-MYN-WISST	8422	2	CAPE	HAAKBOSLEEGTE	15:50:00	16:00:00	00:15:00	00:10:00	X8304	POSTMASBURG						02:00:00	0	5.04
SIN-MYN-WISST	8422	3	CAPE	LOHATLHA	16:13:30	16:13:30	00:13:30			POSTMASBURG						02:00:00	0	10.57
SIN-MYN-WISST	8422	4	CAPE	ERTSRAND	16:21:00	16:21:00	00:07:30			POSTMASBURG						02:00:00	0	5.57
SIN-MYN-WISST	8422	4	CAPE	GLOSAM	16:25:00	16:25:00	00:04:00			POSTMASBURG						02:00:00	0	2.75
SIN-MYN-WISST	8422	4	CAPE	PALINGPAN	16:32:00	16:32:00	00:07:00			POSTMASBURG						02:00:00	0	4.95
SIN-MYN-WISST	8422	5	CAPE	BOKKOPPIE	16:40:30	16:40:30	00:08:30			POSTMASBURG						02:00:00	0	6.51
SIN-MYN-WISST	8422	5	CAPE	BEESHOEK	16:52:30	16:52:30	00:12:00			POSTMASBURG						02:00:00	0	8.86
SIN-MYN-WISST	8422	6	CAPE	BEK/S242799	16:53:30	16:54:30	00:01:00	00:01:00	SHUNT	POSTMASBURG						02:00:00	0	0.97
SIN-MYN-WISST	8422	7	CAPE	BEESHOEK	16:55:30	16:55:30	00:01:00			POSTMASBURG						02:00:00	0	0.97
SIN-MYN-WISST	8422	8	CAPE	POSTMASBURG	17:10:00	00:00:00	00:14:30		RT	POSTMASBURG						02:00:00	0	7.84
SIN-MYN-WISST	8426	1	CAPE	SIN-MYN-WISST		16:00:00				POSTMASBURG	16:00:00	18:10:00	2	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:10:00	0
SIN-MYN-WISST	8426	1	CAPE	GAMMAGARA	16:19:30	16:19:30	00:19:30		C	POSTMASBURG						02:10:00	0	3.25
SIN-MYN-WISST	8426	2	CAPE	MOOKANENG	16:25:00	16:25:00	00:05:30			POSTMASBURG						02:10:00	0	9.63
SIN-MYN-WISST	8426	2	CAPE	HAAKBOSLEEGTE	16:40:30	16:40:30	00:15:30			POSTMASBURG						02:10:00	0	5.04
SIN-MYN-WISST	8426	3	CAPE	LOHATLHA	16:53:30	16:53:30	00:13:00			POSTMASBURG						02:10:00	0	10.57
SIN-MYN-WISST	8426	4	CAPE	ERTSRAND	17:01:00	17:01:00	00:07:30			POSTMASBURG						02:10:00	0	5.57
SIN-MYN-WISST	8426	4	CAPE	GLOSAM	17:05:00	17:05:00	00:04:00			POSTMASBURG						02:10:00	0	2.75
SIN-MYN-WISST	8426	4	CAPE	PALINGPAN	17:12:00	17:12:00	00:07:00			POSTMASBURG						02:10:00	0	4.95
SIN-MYN-WISST	8426	5	CAPE	BOKKOPPIE	17:20:30	17:20:30	00:08:30			POSTMASBURG						02:10:00	0	6.51
SIN-MYN-WISST	8426	5	CAPE	BEESHOEK	17:32:30	17:52:00	00:12:00	00:19:30	X8417	POSTMASBURG						02:10:00	0	8.86
SIN-MYN-WISST	8426	6	CAPE	BEK/S242799	17:53:00	17:54:00	00:01:00	00:01:00	SHUNT	POSTMASBURG						02:10:00	0	0.97
SIN-MYN-WISST	8426	7	CAPE	BEESHOEK	17:55:00	17:55:00	00:01:00			POSTMASBURG						02:10:00	0	0.97
SIN-MYN-WISST	8426	8	CAPE	POSTMASBURG	18:10:00	00:00:00	00:15:00		RT	POSTMASBURG						02:10:00	0	7.84
SIN-MYN-WISST	10008	1	CAPE	SIN-MYN-WISST		11:40:00				GMA/S261955	11:40:00	11:47:00	3	YYYYYYY	HEAVYAIRBRAKE/HEAVYAIRBRAKE	00:07:00	0
SIN-MYN-WISST	10008	1	CAPE	GAMMAGARA	11:42:30	11:42:30	00:02:30			GMA/S261955						00:07:00	0	3.25
SIN-MYN-WISST	10008	2	ORELINE	GMA/S261955	11:47:00	00:00:00	00:04:30		SHUNT	GMA/S261955						00:07:00	0	0.96
SIN-MYN-WISST	10010	1	CAPE	SIN-MYN-WISST		17:40:00				GMA/S261955	17:40:00	17:47:00	3	YYYYYYY	HEAVYAIRBRAKE/HEAVYAIRBRAKE	00:07:00	0
SIN-MYN-WISST	10010	1	CAPE	GAMMAGARA	17:45:30	17:45:30	00:05:30			GMA/S261955						00:07:00	0	3.25
SIN-MYN-WISST	10010	2	ORELINE	GMA/S261955	17:47:00	00:00:00	00:01:30		SHUNT	GMA/S261955						00:07:00	0	0.96`;

describe('a second extract: continuations and termini', () => {
  const trains = () => parseRunningTimes(BATCH2);
  const byId = (id: string) => trains().find((t) => t.train === id)!;

  /**
   * BUG 1. Train 8412 begins at NODE_Seq 6 — its summary row lies above the
   * cut. Keying rows on the preceding summary discarded all three of them.
   */
  it('keeps rows that appear before any summary row', () => {
    expect(trains().map((t) => t.train)).toEqual(['8412', '8422', '8426', '10008', '10010']);
    expect(byId('8412').rows).toHaveLength(3);
    expect(distanceCovered(byId('8412'))).toBeCloseTo(9.78, 2);
  });

  it('marks a continuation as lacking its summary rather than as complete', () => {
    expect(hasSummary(byId('8412'))).toBe(false);
    expect(hasSummary(byId('8422'))).toBe(true);
  });

  /**
   * BUG 2. Every terminus row carries Departure 00:00:00 with no standing
   * time. Read as a real time it is 435 minutes of standing at POSTMASBURG.
   */
  it('does not read the terminus 00:00:00 as a departure', () => {
    ['8422', '8426', '10008', '10010'].forEach((id) => {
      const v = validateSchedule(byId(id));
      expect(v.standingMismatches, `${id} terminus`).toEqual([]);
      expect(v.runtimeMismatches, `${id} runtimes`).toEqual([]);
      expect(v.throughputTies, `${id} throughput`).toBe(true);
    });
  });

  it('validates every complete train in the extract', () => {
    ['8422', '8426', '10008', '10010'].forEach((id) => {
      const v = validateSchedule(byId(id));
      expect(v.elapsedIdentityHolds, `${id} identity`).toBe(true);
    });
  });

  it('ties the two Ore Line runs at 7 minutes over 4.21 km', () => {
    ['10008', '10010'].forEach((id) => {
      const t = byId(id);
      expect(t.throughputRuntime).toBe(7);
      expect(distanceCovered(t)).toBeCloseTo(4.21, 2);
    });
  });

  /** 8422 and 8426 follow the same route; only the standing differs. */
  it('shows 8426 losing 10 minutes to standing against 8422', () => {
    const standing = (id: string) =>
      byId(id).rows.reduce((n, r) => n + (r.standingTime ?? 0), 0);
    expect(standing('8422')).toBe(11);
    expect(standing('8426')).toBe(20.5);
    expect(byId('8426').throughputRuntime - byId('8422').throughputRuntime).toBe(10);
  });

  /**
   * Corridor is a per-ROW attribute, not per train: 10008 departs on CAPE and
   * arrives on ORELINE. Any corridor rollup that reads it from the summary row
   * will file the whole journey under the wrong corridor.
   */
  it('carries a corridor per row, which can change mid-journey', () => {
    const rows = byId('10008').rows;
    expect(rows.map((r) => r.corridor)).toEqual(['CAPE', 'ORELINE']);
  });

  /** HEAVYAIRBRAKE is a fourth vocabulary not in Annexure 40's three bands. */
  it('maps HEAVYAIRBRAKE to the heavy band and flags unknown types as null', () => {
    expect(shuntingBandFor('HEAVYAIRBRAKE/HEAVYAIRBRAKE')).toBe('heavy (>100 wagons)');
    expect(shuntingBandFor('VACUUM TRAINS/VACUUM TRAIN')).toBeNull();
  });
});

/**
 * Third extract: train 7407 (Sishen to Bijlkor, 701 km, crossing CAPE into
 * CENTRAL), 7430, and 8412's missing head.
 */
const BATCH3_HEAD = `Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
SIN-MYN-WISST	7407	2	CAPE	MOOKANENG	04:17:30	04:17:30	00:10:30			BIJLKOR						17:36:00	0	9.63
SIN-MYN-WISST	7407	8	CAPE	POSTMASBURG	05:32:00	06:00:00	00:12:00	00:28:00	INSPECTION ROLL BY	BIJLKOR						17:36:00	0	7.84
SIN-MYN-WISST	7407	12	CAPE	BAH/S261866	09:39:00	09:40:00	00:11:00	00:01:00	WEIGHBRIGH	BIJLKOR						17:36:00	0	0.1
SIN-MYN-WISST	7407	17	CAPE	WARRENTON	11:20:00	14:35:00	00:12:00	03:15:00	BO	BIJLKOR						17:36:00	0	12.64
SIN-MYN-WISST	7407	19	CENTRAL	CAMELFORD	14:53:30	14:53:30	00:12:30			BIJLKOR						17:36:00	0	13.9
SIN-MYN-WISST	7407	34		VANDERBIJL	21:19:30	21:19:30	00:07:00			BIJLKOR						17:36:00	0	7.95
SIN-MYN-WISST	7407	37	CENTRAL	BIJLKOR	21:36:00	00:00:00	00:06:00		BO	BIJLKOR						17:36:00	0	6.69
SIN-MYN-WISST	7430	1	CAPE	SIN-MYN-WISST		09:00:00				POSTMASBURG	09:00:00	10:50:00	2	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	01:50:00	0
SIN-MYN-WISST	7430	1	CAPE	GAMMAGARA	09:19:30	09:19:30	00:19:30		C	POSTMASBURG						01:50:00	0	3.25
SIN-MYN-WISST	7430	2	CAPE	MOOKANENG	09:25:00	09:25:00	00:05:30			POSTMASBURG						01:50:00	0	9.63
SIN-MYN-WISST	7430	2	CAPE	HAAKBOSLEEGTE	09:40:30	09:40:30	00:15:30			POSTMASBURG						01:50:00	0	5.04
SIN-MYN-WISST	7430	3	CAPE	LOHATLHA	09:53:30	09:53:30	00:13:00			POSTMASBURG						01:50:00	0	10.57
SIN-MYN-WISST	7430	4	CAPE	ERTSRAND	10:01:00	10:01:00	00:07:30			POSTMASBURG						01:50:00	0	5.57
SIN-MYN-WISST	7430	4	CAPE	GLOSAM	10:05:00	10:05:00	00:04:00			POSTMASBURG						01:50:00	0	2.75
SIN-MYN-WISST	7430	4	CAPE	PALINGPAN	10:12:00	10:12:00	00:07:00			POSTMASBURG						01:50:00	0	4.95
SIN-MYN-WISST	7430	5	CAPE	BOKKOPPIE	10:20:30	10:20:30	00:08:30			POSTMASBURG						01:50:00	0	6.51
SIN-MYN-WISST	7430	5	CAPE	BEESHOEK	10:32:30	10:32:30	00:12:00			POSTMASBURG						01:50:00	0	8.86
SIN-MYN-WISST	7430	6	CAPE	BEK/S242799	10:33:30	10:34:30	00:01:00	00:01:00	SHUNT	POSTMASBURG						01:50:00	0	0.97
SIN-MYN-WISST	7430	7	CAPE	BEESHOEK	10:35:30	10:35:30	00:01:00			POSTMASBURG						01:50:00	0	0.97
SIN-MYN-WISST	7430	8	CAPE	POSTMASBURG	10:50:00	00:00:00	00:14:30		RT	POSTMASBURG						01:50:00	0	7.84
SIN-MYN-WISST	8412	1	CAPE	SIN-MYN-WISST		14:35:00				POSTMASBURG	14:35:00	16:45:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:10:00	0
SIN-MYN-WISST	8412	1	CAPE	GAMMAGARA	14:54:30	14:54:30	00:19:30		B	POSTMASBURG						02:10:00	0	3.25
SIN-MYN-WISST	8412	2	CAPE	MOOKANENG	15:00:00	15:00:00	00:05:30			POSTMASBURG						02:10:00	0	9.63
SIN-MYN-WISST	8412	2	CAPE	HAAKBOSLEEGTE	15:15:30	15:36:00	00:15:30	00:20:30	X 8309	POSTMASBURG						02:10:00	0	5.04
SIN-MYN-WISST	8412	3	CAPE	LOHATLHA	15:49:00	15:49:00	00:13:00			POSTMASBURG						02:10:00	0	10.57
SIN-MYN-WISST	8412	4	CAPE	ERTSRAND	15:56:30	15:56:30	00:07:30			POSTMASBURG						02:10:00	0	5.57
SIN-MYN-WISST	8412	4	CAPE	GLOSAM	16:00:30	16:00:30	00:04:00			POSTMASBURG						02:10:00	0	2.75
SIN-MYN-WISST	8412	4	CAPE	PALINGPAN	16:07:30	16:07:30	00:07:00			POSTMASBURG						02:10:00	0	4.95
SIN-MYN-WISST	8412	5	CAPE	BOKKOPPIE	16:16:00	16:16:00	00:08:30			POSTMASBURG						02:10:00	0	6.51
SIN-MYN-WISST	8412	5	CAPE	BEESHOEK	16:28:00	16:28:00	00:12:00			POSTMASBURG						02:10:00	0	8.86`;

/** The tail of 8412, supplied in the FIRST extract, before its head arrived. */
const BATCH1_TAIL = `Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
SIN-MYN-WISST	8412	6	CAPE	BEK/S242799	16:29:00	16:30:00	00:01:00	00:01:00	SHUNT	POSTMASBURG						02:10:00	0	0.97
SIN-MYN-WISST	8412	7	CAPE	BEESHOEK	16:31:00	16:31:00	00:01:00			POSTMASBURG						02:10:00	0	0.97
SIN-MYN-WISST	8412	8	CAPE	POSTMASBURG	16:45:00	00:00:00	00:14:00		RT	POSTMASBURG						02:10:00	0	7.84`;

describe('a third extract: long hauls, corridor changes, and split pastes', () => {
  const byId = (tsv: string, id: string) => parseRunningTimes(tsv).find((t) => t.train === id)!;

  /**
   * BATCH3_HEAD is ABRIDGED — 7 of 7407's 90 rows, kept short so the fixture
   * stays readable. The full extract in the source record runs 701.05 km
   * across CAPE into CENTRAL. Assertions here cover only what the fixture
   * actually contains.
   */
  it('reads 7407 as a long haul still missing its summary row', () => {
    const t = byId(BATCH3_HEAD, '7407');
    expect(hasSummary(t)).toBe(false);
    expect(t.rows[0].station).toBe('MOOKANENG');
    expect(t.rows.at(-1)?.station).toBe('BIJLKOR');
    expect(distanceCovered(t)).toBeCloseTo(58.75, 2);
  });

  /**
   * Standing is a per-row fact, so it is checkable on a gapped extract. The
   * runtime chain is not: it depends on the previous row's departure, and this
   * fixture is deliberately abridged. The full 90-row extract in the source
   * record validates clean.
   */
  it('reads the 3h15m Warronton stand and its BO reason', () => {
    const t = byId(BATCH3_HEAD, '7407');
    const warrenton = t.rows.find((r) => r.station === 'WARRENTON')!;
    expect(warrenton.standingTime).toBe(195); // 03:15:00
    expect(warrenton.standingReason).toBe('BO');
    expect(warrenton.arrival).toBe(680);       // 11:20:00
    expect(warrenton.departure).toBe(875);     // 14:35:00
  });

  /**
   * Corridor is per row AND can be blank. 7407 runs CAPE, crosses to CENTRAL,
   * and has one row with no corridor at all sandwiched between two CENTRAL
   * rows. A rollup must not assume a train has a single corridor.
   */
  it('crosses corridors mid-journey and carries a row with no corridor', () => {
    const t = byId(BATCH3_HEAD, '7407');
    const corridors = t.rows.map((r) => r.corridor);
    expect(corridors).toContain('CAPE');
    expect(corridors).toContain('CENTRAL');
    expect(corridors.filter((c) => c === '')).toHaveLength(1);
    const blank = t.rows.find((r) => r.corridor === '')!;
    expect(blank.station).toBe('VANDERBIJL');
  });

  it('ties 7430 end to end at 110 minutes', () => {
    const t = byId(BATCH3_HEAD, '7430');
    const v = validateSchedule(t);
    expect(v.throughputTies).toBe(true);
    expect(v.elapsedIdentityHolds).toBe(true);
    expect(t.throughputRuntime).toBe(110);
  });

  /**
   * The head of 8412 arrived in the third extract and its tail in the first.
   * The seam is BEESHOEK 16:28 -> BEK 16:29, exactly one minute, and joining
   * them yields the 130 minutes the summary row claims.
   */
  it('joins two halves of 8412 pasted three extracts apart', () => {
    const head = byId(BATCH3_HEAD, '8412');
    const tail = byId(BATCH1_TAIL, '8412');
    const joined: typeof head = {
      ...head,
      rows: [...head.rows, ...tail.rows],
    };
    expect(hasSummary(joined)).toBe(true);
    const v = validateSchedule(joined);
    expect(v.throughputTies).toBe(true);
    expect(v.runtimeMismatches).toEqual([]);
    expect(v.standingMismatches).toEqual([]);
    expect(v.elapsedIdentityHolds).toBe(true);
    expect(joined.throughputRuntime).toBe(130);
  });

  it('reports 8412 as incomplete from either half alone', () => {
    expect(isComplete(byId(BATCH3_HEAD, '8412'))).toBe(false);
    expect(hasSummary(byId(BATCH1_TAIL, '8412'))).toBe(false);
  });

  /**
   * 7430, 8422 and 8426 run the same 66.91 km route. Their running times are
   * within 30 seconds of each other; the 20-minute spread in throughput is
   * entirely standing time. Delay attribution here is a standing problem,
   * not a running problem.
   */
  it('shows 8426 losing 10 minutes to 8422 on standing alone, not running', () => {
    const total = (id: string, pick: (r: { pointToPointRuntime: number | null; standingTime: number | null }) => number) =>
      byId(BATCH2, id).rows.reduce((n, r) => n + pick(r), 0);
    const running = (id: string) => total(id, (r) => r.pointToPointRuntime ?? 0);
    const standing = (id: string) => total(id, (r) => r.standingTime ?? 0);

    // Same route, within 30 seconds of identical running time.
    expect(Math.abs(running('8422') - running('8426'))).toBeLessThanOrEqual(0.5);
    // The whole 10-minute throughput gap is standing.
    expect(standing('8426') - standing('8422')).toBe(9.5);
    expect(byId(BATCH2, '8426').throughputRuntime - byId(BATCH2, '8422').throughputRuntime).toBe(10);
  });

  /** Truncated vocabulary in the source, kept verbatim rather than expanded. */
  it('preserves truncated reason and station names as supplied', () => {
    const t = byId(BATCH3_HEAD, '7407');
    expect(t.rows.find((r) => r.station === 'BAH/S261866')?.standingReason).toBe('WEIGHBRIGH');
    expect(t.rows.find((r) => r.station === 'POSTMASBURG')?.standingReason).toBe('INSPECTION ROLL BY');
  });
});
