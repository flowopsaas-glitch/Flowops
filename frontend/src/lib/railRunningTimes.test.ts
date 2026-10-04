import { describe, it, expect } from 'vitest';
import {
  CORRIDOR_TAXONOMY_NOTE,
  hasSummary,
  spansDays,
  elapsedMinutes,
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

/**
 * Fourth extract. Supplies the summary rows for 7405 and 7407, which makes
 * both of them end-to-end verifiable for the first time.
 */
const BATCH4 = `Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
SIN-MYN-WISST	7405	1	CAPE	SIN-MYN-WISST		16:30:00				BIJLKOR	16:30:00	12:57:00	1	YYYYYYY	MEDIUM HEAVY/AMSA IRON ORE	20:27:00	0
SIN-MYN-WISST	7405	1	CAPE	GAMMAGARA	16:36:00	16:36:00	00:06:00		C	BIJLKOR						20:27:00	0	3.25
SIN-MYN-WISST	7405	2	ORELINE	GMA/S261955	16:37:00	16:38:00	00:01:00	00:01:00	SHUNT	BIJLKOR						20:27:00	0	0.96
SIN-MYN-WISST	7405	3	CAPE	GAMMAGARA	16:39:00	16:39:00	00:01:00			BIJLKOR						20:27:00	0	0.96
SIN-MYN-WISST	7405	4	CAPE	MOOKANENG	16:47:00	16:47:00	00:08:00			BIJLKOR						20:27:00	0	9.63
SIN-MYN-WISST	7405	10	CAPE	POSTMASBURG	18:09:00	18:40:00	00:16:00	00:31:00	INSPECTION ROLL BY	BIJLKOR						20:27:00	0	7.84
SIN-MYN-WISST	7405	14	CAPE	BAH/S261866	22:37:00	22:37:00				BIJLKOR						20:27:00	0	0.1
SIN-MYN-WISST	7405	14	CAPE	DIAMANTOORD	22:41:00	22:41:00	00:04:00			BIJLKOR						20:27:00	0	6.44
SIN-MYN-WISST	7405	19	CAPE	WARRENTON	00:29:00	05:50:00	00:13:00	05:21:00	BO	BIJLKOR						20:27:00	1	12.64
SIN-MYN-WISST	7405	39	CENTRAL	BIJLKOR	12:57:00	00:00:00	00:06:00		BO	BIJLKOR						20:27:00	1	6.69
SIN-MYN-WISST	7407	1	CAPE	SIN-MYN-WISST		04:00:00				BIJLKOR	04:00:00	21:36:00	1	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	17:36:00	0
SIN-MYN-WISST	7407	1	CAPE	GAMMAGARA	04:07:00	04:07:00	00:07:00		C	BIJLKOR						17:36:00	0	3.25
SIN-MYN-WISST	7403	14	CAPE	BAH/S261866	13:54:18	13:54:18				BIJLKOR						18:01:00	0	0.1
SIN-MYN-WISST	7403	14	CAPE	DIAMANTOORD	13:58:09	13:58:09	00:03:51			BIJLKOR						18:01:00	0	6.44
SIN-MYN-WISST	7403	19	CAPE	WARRENTON	15:45:00	19:00:00	00:12:00	03:15:00	BO	BIJLKOR						18:01:00	0	12.64
SIN-MYN-WISST	7403	32	CENTRAL	NEWMACHAVIE	00:01:00	00:01:00	00:15:00			BIJLKOR						18:01:00	1	13.17`;

describe('a fourth extract: summary rows arrive, and day offsets', () => {
  const byId = (id: string) => parseRunningTimes(BATCH4).find((t) => t.train === id)!;

  /**
   * 7405 departs 16:30 and arrives 12:57 the next day. Its arrival is
   * NUMERICALLY EARLIER than its departure, so the span only resolves modulo
   * 1440 — 1227 minutes, exactly the stated 20:27.
   */
  it('ties 7405 at 20h27 across midnight', () => {
    const t = byId('7405');
    expect(hasSummary(t)).toBe(true);
    expect(t.throughputRuntime).toBe(1227);
    expect((t.destinationArrival - t.originDeparture + 1440) % 1440).toBe(1227);
    expect(validateSchedule(t).throughputTies).toBe(true);
  });

  /**
   * 7407 was a continuation for two extracts, arriving only as rows. Its
   * throughput of 17:36 with an arrival of 21:36 implied a 04:00 departure;
   * the summary row now supplied says 04:00:00.
   */
  it('ties 7407 at 17h36 and confirms the inferred departure', () => {
    const t = byId('7407');
    expect(t.originDeparture).toBe(240); // 04:00
    expect(t.throughputRuntime).toBe(1056);
    expect(validateSchedule(t).throughputTies).toBe(true);
  });

  /**
   * Depart_Day was modelled as a per-train field taken from the summary row.
   * It is per row and increments mid-run: 7403 carries 0 up to 23:46 and 1
   * from 00:01 onward.
   */
  it('reads Depart_Day per row, where it changes partway through a run', () => {
    const t = byId('7403');
    const days = t.rows.map((r) => r.departDay);
    expect(days).toContain(0);
    expect(days).toContain(1);
    expect(spansDays(t)).toBe(true);
  });

  it('does not report a single-day run as spanning days', () => {
    expect(spansDays(byId('7407'))).toBe(false);
  });

  /**
   * The weighbridge siding carries an arrival and departure but no
   * point-to-point runtime. It must be read as null rather than as zero.
   *
   * The 7403 fixture here is gapped — it jumps seq 14 to seq 19 to seq 32 —
   * so no end-to-end runtime claim is made about it.
   */
  it('carries rows with no runtime at all', () => {
    const weigh = byId('7403').rows.find((r) => r.station === 'BAH/S261866')!;
    expect(weigh.pointToPointRuntime).toBeNull();
    expect(weigh.arrival).toBeCloseTo(834.3, 4);
  });

  /**
   * Seconds are not only :30. This extract adds :09 and :51, so values land
   * on 0.15 and 0.85 of a minute. Parsing to whole minutes would round both.
   */
  it('preserves seconds beyond half-minutes', () => {
    const t = byId('7403');
    const diamant = t.rows.find((r) => r.station === 'DIAMANTOORD')!;
    expect(diamant.arrival).toBeCloseTo(838.15, 6);
    expect(diamant.pointToPointRuntime).toBeCloseTo(3.85, 6);
    expect(formatClock(diamant.pointToPointRuntime)).toBe('00:03:51');
  });

  /**
   * Train Type is not a symmetric X/X pair. 7405 carries
   * "MEDIUM HEAVY/AMSA IRON ORE" — a shunting band followed by a commodity,
   * where 7407 carries a band twice and 10008 carries a brake type twice. The
   * field is overloaded, so shuntingBandFor's reading of it is a guess and is
   * recorded as such rather than treated as authoritative.
   */
  it('shows Train Type mixing bands, commodities and brake types', () => {
    expect(byId('7405').trainType).toBe('MEDIUM HEAVY/AMSA IRON ORE');
    expect(byId('7407').trainType).toBe('MEDIUM HEAVY/MEDIUM HEAVY');
    expect(byId('7405').trainType.split('/')[0]).not.toBe(byId('7405').trainType.split('/')[1]);
  });

  it('records the 5h21m Warronton stand on 7405', () => {
    const t = byId('7405');
    const w = t.rows.find((r) => r.station === 'WARRENTON')!;
    expect(w.standingTime).toBe(321); // 05:21:00
    expect(w.standingReason).toBe('BO');
  });
});

const B5_6455 = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
SIN-MYN-WISST	6455	1	CAPE	SIN-MYN-WISST		15:40:00				NEWCASTLYSKOR	15:40:00	18:49:00	1	YYYYAYY	MEDIUM HEAVY/AMSA IRON ORE	27:09:00	0	
SIN-MYN-WISST	6455	1	CAPE	GAMMAGARA	15:57:30	15:57:30	00:17:30		C	NEWCASTLYSKOR						27:09:00	0	3.25
SIN-MYN-WISST	6455	2	ORELINE	GMA/S261955	15:58:30	15:59:30	00:01:00	00:01:00	SHUNT	NEWCASTLYSKOR						27:09:00	0	0.96
SIN-MYN-WISST	6455	3	CAPE	GAMMAGARA	16:03:00	16:03:00	00:03:30			NEWCASTLYSKOR						27:09:00	0	0.96
SIN-MYN-WISST	6455	4	CAPE	MOOKANENG	16:05:00	16:05:00	00:02:00			NEWCASTLYSKOR						27:09:00	0	9.63
SIN-MYN-WISST	6455	4	CAPE	HAAKBOSLEEGTE	16:20:30	16:20:30	00:15:30			NEWCASTLYSKOR						27:09:00	0	5.04
SIN-MYN-WISST	6455	5	CAPE	LOHATLHA	16:33:30	16:33:30	00:13:00			NEWCASTLYSKOR						27:09:00	0	10.57
SIN-MYN-WISST	6455	6	CAPE	ERTSRAND	16:41:00	16:41:00	00:07:30			NEWCASTLYSKOR						27:09:00	0	5.57
SIN-MYN-WISST	6455	6	CAPE	GLOSAM	16:45:00	16:45:00	00:04:00			NEWCASTLYSKOR						27:09:00	0	2.75
SIN-MYN-WISST	6455	6	CAPE	PALINGPAN	16:52:00	16:52:00	00:07:00			NEWCASTLYSKOR						27:09:00	0	4.95
SIN-MYN-WISST	6455	7	CAPE	BOKKOPPIE	17:00:30	17:00:30	00:08:30			NEWCASTLYSKOR						27:09:00	0	6.51
SIN-MYN-WISST	6455	7	CAPE	BEESHOEK	17:12:30	17:12:30	00:12:00			NEWCASTLYSKOR						27:09:00	0	8.86
SIN-MYN-WISST	6455	8	CAPE	BEK/S242799	17:13:30	17:14:30	00:01:00	00:01:00	SHUNT	NEWCASTLYSKOR						27:09:00	0	0.97
SIN-MYN-WISST	6455	9	CAPE	BEESHOEK	17:15:30	17:15:30	00:01:00			NEWCASTLYSKOR						27:09:00	0	0.97
SIN-MYN-WISST	6455	10	CAPE	POSTMASBURG	17:30:00	18:00:00	00:14:30	00:30:00	INSPECTION ROLL BY	NEWCASTLYSKOR						27:09:00	0	7.84
SIN-MYN-WISST	6455	11	CAPE	TSANTSABANE	18:20:00	18:20:00	00:20:00			NEWCASTLYSKOR						27:09:00	0	9.06
SIN-MYN-WISST	6455	11	CAPE	BLINKKLIP	18:32:00	18:32:00	00:12:00			NEWCASTLYSKOR						27:09:00	0	9
SIN-MYN-WISST	6455	11	CAPE	GROENWATER	18:47:00	18:47:00	00:15:00			NEWCASTLYSKOR						27:09:00	0	11.9
SIN-MYN-WISST	6455	11	CAPE	CLIFTON	18:58:00	19:00:00	00:11:00	00:02:00	X 2435	NEWCASTLYSKOR						27:09:00	0	8.38
SIN-MYN-WISST	6455	11	CAPE	LIMEACRES	19:15:00	19:15:00	00:15:00			NEWCASTLYSKOR						27:09:00	0	14.46
SIN-MYN-WISST	6455	12	CAPE	SILVERSTREAMS	19:21:30	19:21:30	00:06:30			NEWCASTLYSKOR						27:09:00	0	5.87
SIN-MYN-WISST	6455	13	CAPE	TREWIL	19:35:00	19:35:00	00:13:30			NEWCASTLYSKOR						27:09:00	0	11.43
SIN-MYN-WISST	6455	13	CAPE	ARIESFONTEIN	19:43:30	19:43:30	00:08:30			NEWCASTLYSKOR						27:09:00	0	8.21
SIN-MYN-WISST	6455	13	CAPE	PLATEAU	19:58:30	19:58:30	00:15:00			NEWCASTLYSKOR						27:09:00	0	14.08
SIN-MYN-WISST	6455	13	CAPE	KOOPMANSFONTE	20:15:00	20:35:00	00:16:30	00:20:00	X 2577/2463	NEWCASTLYSKOR						27:09:00	0	13.26
SIN-MYN-WISST	6455	13	CAPE	NOOIBOS	20:41:00	20:41:00	00:06:00			NEWCASTLYSKOR						27:09:00	0	5.41
SIN-MYN-WISST	6455	13	CAPE	OLEA	20:48:00	20:48:00	00:07:00			NEWCASTLYSKOR						27:09:00	0	4.37
SIN-MYN-WISST	6455	13	CAPE	KNEUKEL	20:52:30	20:52:30	00:04:30			NEWCASTLYSKOR						27:09:00	0	3.12
SIN-MYN-WISST	6455	13	CAPE	GHAAP	21:05:00	21:05:00	00:12:30			NEWCASTLYSKOR						27:09:00	0	6.51
SIN-MYN-WISST	6455	13	CAPE	ULCO	21:28:00	21:28:00	00:23:00			NEWCASTLYSKOR						27:09:00	0	11.85
SIN-MYN-WISST	6455	14	CAPE	BORRELSKOP	21:35:00	21:35:00	00:07:00			NEWCASTLYSKOR						27:09:00	0	6.04
SIN-MYN-WISST	6455	14	CAPE	WINTERSRUSH	21:42:00	21:42:00	00:07:00			NEWCASTLYSKOR						27:09:00	0	6.54
SIN-MYN-WISST	6455	14	CAPE	GONGGONG	21:50:00	21:50:00	00:08:00			NEWCASTLYSKOR						27:09:00	0	7.51
SIN-MYN-WISST	6455	14	CAPE	BADHOPE	21:55:00	21:55:00	00:05:00			NEWCASTLYSKOR						27:09:00	0	4.5
SIN-MYN-WISST	6455	14	CAPE	BAH/S261866	21:55:30	21:55:30	00:00:30		WEIGHBRIDGE	NEWCASTLYSKOR						27:09:00	0	0.1
SIN-MYN-WISST	6455	14	CAPE	DIAMANTOORD	21:59:30	21:59:30	00:04:00			NEWCASTLYSKOR						27:09:00	0	6.44
SIN-MYN-WISST	6455	14	CAPE	BARKLYWEST	22:05:30	22:05:30	00:06:00			NEWCASTLYSKOR						27:09:00	0	1.7
SIN-MYN-WISST	6455	15	CAPE	WEIR	22:14:00	22:33:00	00:08:30	00:19:00		NEWCASTLYSKOR						27:09:00	0	6.19
SIN-MYN-WISST	6455	15	CAPE	RIVERMEAD	22:39:30	22:39:30	00:06:30			NEWCASTLYSKOR						27:09:00	0	4.11
SIN-MYN-WISST	6455	15	CAPE	FIELDSVIEW	22:46:30	22:46:30	00:07:00			NEWCASTLYSKOR						27:09:00	0	6.41
SIN-MYN-WISST	6455	16	CAPE	MACFARLANE	23:02:30	23:02:30	00:16:00			NEWCASTLYSKOR						27:09:00	0	12.09
SIN-MYN-WISST	6455	17	CAPE	RIVERTON	23:12:00	23:12:00	00:09:30			NEWCASTLYSKOR						27:09:00	0	6.12
SIN-MYN-WISST	6455	18	CAPE	SLYPKLIP	23:20:00	23:20:00	00:08:00			NEWCASTLYSKOR						27:09:00	0	7.92
SIN-MYN-WISST	6455	18	CAPE	WINDSORTONROA	23:29:30	23:29:30	00:09:30			NEWCASTLYSKOR						27:09:00	0	9.4
SIN-MYN-WISST	6455	19	CAPE	KOEDOE	23:37:30	23:37:30	00:08:00			NEWCASTLYSKOR						27:09:00	0	12.4
SIN-MYN-WISST	6455	19	CAPE	CONTENT	23:46:00	23:46:00	00:08:30			NEWCASTLYSKOR						27:09:00	0	8
SIN-MYN-WISST	6455	19	CAPE	WARRENTON	00:01:00	02:50:00	00:15:00	02:49:00	RM	NEWCASTLYSKOR						27:09:00	1	12.64
SIN-MYN-WISST	6455	20	CAPE	VEERTIENSTROM	02:56:00	02:56:00	00:06:00			NEWCASTLYSKOR						27:09:00	1	5.8
SIN-MYN-WISST	6455	21	CENTRAL	CAMELFORD	03:08:30	03:08:30	00:12:30			NEWCASTLYSKOR						27:09:00	1	13.9
SIN-MYN-WISST	6455	21	CENTRAL	FENDYKE	03:17:30	03:17:30	00:09:00			NEWCASTLYSKOR						27:09:00	1	9.69
SIN-MYN-WISST	6455	21	CENTRAL	CHRISTIANA	03:30:00	03:45:00	00:12:30	00:15:00	X 2440	NEWCASTLYSKOR						27:09:00	1	9.91
SIN-MYN-WISST	6455	22	CENTRAL	KROMELLENBOOG	03:57:00	03:57:00	00:12:00			NEWCASTLYSKOR						27:09:00	1	14.18
SIN-MYN-WISST	6455	23	CENTRAL	BRITTEN	04:09:00	04:09:00	00:12:00			NEWCASTLYSKOR						27:09:00	1	11.77
SIN-MYN-WISST	6455	24	CENTRAL	FERNDALE	04:19:00	04:19:00	00:10:00			NEWCASTLYSKOR						27:09:00	1	8.82
SIN-MYN-WISST	6455	24	CENTRAL	WILDHOEN	04:26:00	04:26:00	00:07:00			NEWCASTLYSKOR						27:09:00	1	4.94
SIN-MYN-WISST	6455	24	CENTRAL	YDELHOOP	04:41:30	04:41:30	00:15:30			NEWCASTLYSKOR						27:09:00	1	7.11
SIN-MYN-WISST	6455	24	CENTRAL	BLOEMHOF	04:48:30	04:48:30	00:07:00			NEWCASTLYSKOR						27:09:00	1	6.28
SIN-MYN-WISST	6455	25	CENTRAL	STRYDERS	04:54:30	04:54:30	00:06:00			NEWCASTLYSKOR						27:09:00	1	6.62
SIN-MYN-WISST	6455	25	CENTRAL	GRASSLANDS	05:01:00	05:01:00	00:06:30			NEWCASTLYSKOR						27:09:00	1	6.5
SIN-MYN-WISST	6455	25	CENTRAL	KINGSWOOD	05:07:00	05:07:00	00:06:00			NEWCASTLYSKOR						27:09:00	1	11.74
SIN-MYN-WISST	6455	26	CENTRAL	DRIERUITERS	05:20:00	05:40:00	00:13:00	00:20:00	H17005P	NEWCASTLYSKOR						27:09:00	1	6.5
SIN-MYN-WISST	6455	26	CENTRAL	BOSKUIL	05:45:00	05:45:00	00:05:00			NEWCASTLYSKOR						27:09:00	1	6.26
SIN-MYN-WISST	6455	26	CENTRAL	MAKWASSIE	05:58:00	05:58:00	00:13:00			NEWCASTLYSKOR						27:09:00	1	15.56
SIN-MYN-WISST	6455	27	CENTRAL	EERSTELING	06:09:30	06:09:30	00:11:30			NEWCASTLYSKOR						27:09:00	1	9.66
SIN-MYN-WISST	6455	27	CENTRAL	DAALDER	06:24:30	06:24:30	00:15:00			NEWCASTLYSKOR						27:09:00	1	7.48
SIN-MYN-WISST	6455	27	CENTRAL	LEEUDORINGSTA	06:29:30	06:29:30	00:05:00			NEWCASTLYSKOR						27:09:00	1	8.38
SIN-MYN-WISST	6455	28	CENTRAL	LEEUBOS	06:35:30	06:35:30	00:06:00			NEWCASTLYSKOR						27:09:00	1	9.68
SIN-MYN-WISST	6455	28	CENTRAL	HARRISBURG	06:46:00	07:05:00	00:10:30	00:19:00	X 2464	NEWCASTLYSKOR						27:09:00	1	9.56
SIN-MYN-WISST	6455	28	CENTRAL	REGINA	07:19:30	07:19:30	00:14:30			NEWCASTLYSKOR						27:09:00	1	14.71
SIN-MYN-WISST	6455	29	CENTRAL	DEAN	07:34:30	07:34:30	00:15:00			NEWCASTLYSKOR						27:09:00	1	7.44
SIN-MYN-WISST	6455	29	CENTRAL	LAVA	07:41:30	07:41:30	00:07:00			NEWCASTLYSKOR						27:09:00	1	5.33
SIN-MYN-WISST	6455	29	CENTRAL	ORKNEY	07:46:30	07:46:30	00:05:00			NEWCASTLYSKOR						27:09:00	1	6.54
SIN-MYN-WISST	6455	30	CENTRAL	ARISTON	07:53:30	07:53:30	00:07:00			NEWCASTLYSKOR						27:09:00	1	3.43
SIN-MYN-WISST	6455	30	CENTRAL	KLERKSDORP	08:00:00	08:00:00	00:06:30			NEWCASTLYSKOR						27:09:00	1	6.58
SIN-MYN-WISST	6455	31	CENTRAL	SANDPAN	08:06:00	08:06:00	00:06:00			NEWCASTLYSKOR						27:09:00	1	6.41
SIN-MYN-WISST	6455	31	CENTRAL	STILFONTEIN	08:11:00	08:11:00	00:05:00			NEWCASTLYSKOR						27:09:00	1	2.95
SIN-MYN-WISST	6455	31	CENTRAL	KOEKEMOER	08:22:00	08:22:00	00:11:00			NEWCASTLYSKOR						27:09:00	1	4.91
SIN-MYN-WISST	6455	32	CENTRAL	NEWMACHAVIE	08:28:00	08:28:00	00:06:00			NEWCASTLYSKOR						27:09:00	1	13.17
SIN-MYN-WISST	6455	32	CENTRAL	CRESCENT	08:41:00	08:41:00	00:13:00			NEWCASTLYSKOR						27:09:00	1	9.52
SIN-MYN-WISST	6455	32	CENTRAL	POTCHEFSTROOM	08:54:00	08:54:00	00:13:00			NEWCASTLYSKOR						27:09:00	1	9.92
SIN-MYN-WISST	6455	33	CENTRAL	CACHET	08:57:00	08:57:00	00:03:00			NEWCASTLYSKOR						27:09:00	1	2.6
SIN-MYN-WISST	6455	34	CENTRAL	TARENTAAL	09:02:00	09:02:00	00:05:00			NEWCASTLYSKOR						27:09:00	1	9.08
SIN-MYN-WISST	6455	34	CENTRAL	KLIPDRIF	09:07:00	09:07:00	00:05:00			NEWCASTLYSKOR						27:09:00	1	9.75
SIN-MYN-WISST	6455	34	CENTRAL	ENSELSPRUIT	09:11:00	09:11:00	00:04:00			NEWCASTLYSKOR						27:09:00	1	14.5
SIN-MYN-WISST	6455	35	CENTRAL	FOCHVILLE	09:19:00	09:19:00	00:08:00			NEWCASTLYSKOR						27:09:00	1	13.18
SIN-MYN-WISST	6455	35	CENTRAL	MICHAELSRAAD	09:26:00	09:26:00	00:07:00			NEWCASTLYSKOR						27:09:00	1	10.93
SIN-MYN-WISST	6455	35	CENTRAL	RAATHSVLEI	09:34:00	09:59:00	00:08:00	00:25:00	RM	NEWCASTLYSKOR						27:09:00	1	4.88
SIN-MYN-WISST	6455	36	CENTRAL	BLOEKOMHEUNING	10:04:00	10:04:00	00:05:00			NEWCASTLYSKOR						27:09:00	1	7.78
SIN-MYN-WISST	6455	36		VANDERBIJL	10:08:00	10:08:00	00:04:00			NEWCASTLYSKOR						27:09:00	1	7.95
SIN-MYN-WISST	6455	36	CENTRAL	VANDERBIJLPAR	10:10:00	10:10:00	00:02:00			NEWCASTLYSKOR						27:09:00	1	1
SIN-MYN-WISST	6455	36	CENTRAL	HOUTHEUWEL	10:18:00	10:18:00	00:08:00			NEWCASTLYSKOR						27:09:00	1	5.34
SIN-MYN-WISST	6455	37	CENTRAL	KLEIGROND	10:23:00	10:23:00	00:05:00			NEWCASTLYSKOR						27:09:00	1	4.38
SIN-MYN-WISST	6455	38	CENTRAL	LEEUHOF	10:31:00	10:31:00	00:08:00			NEWCASTLYSKOR						27:09:00	1	3.06
SIN-MYN-WISST	6455	39	CENTRAL	DUNCANVILLE	10:35:00	10:35:00	00:04:00			NEWCASTLYSKOR						27:09:00	1	3.12
SIN-MYN-WISST	6455	39	CENTRAL	VER-NOORD	10:39:00	10:39:00	00:04:00			NEWCASTLYSKOR						27:09:00	1	0.98
SIN-MYN-WISST	6455	40	CENTRAL	ALLOY	10:43:00	10:43:00	00:04:00			NEWCASTLYSKOR						27:09:00	1	1.55
SIN-MYN-WISST	6455	40	CENTRAL	REDAN	10:49:00	10:49:00	00:06:00			NEWCASTLYSKOR						27:09:00	1	3.97
SIN-MYN-WISST	6455	41	CENTRAL	KOOKRUS	10:54:30	10:54:30	00:05:30			NEWCASTLYSKOR						27:09:00	1	5.11
SIN-MYN-WISST	6455	41	CENTRAL	MEYERTON	11:04:30	11:04:30	00:10:00			NEWCASTLYSKOR						27:09:00	1	3.91
SIN-MYN-WISST	6455	42	CENTRAL	HENLYONKLIP	11:09:30	11:09:30	00:05:00			NEWCASTLYSKOR						27:09:00	1	4.46
SIN-MYN-WISST	6455	43	CENTRAL	DALESIDE	11:20:30	11:20:30	00:11:00			NEWCASTLYSKOR						27:09:00	1	4.91
SIN-MYN-WISST	6455	44	CONTAINER	SKANSDAM	11:23:30	11:23:30	00:03:00			NEWCASTLYSKOR						27:09:00	1	2.62
SIN-MYN-WISST	6455	44	CENTRAL	SYBRAND	11:28:30	11:28:30	00:05:00			NEWCASTLYSKOR						27:09:00	1	2.58
SIN-MYN-WISST	6455	45	CENTRAL	ROODE	11:51:30	11:51:30	00:23:00			NEWCASTLYSKOR						27:09:00	1	22.66
SIN-MYN-WISST	6455	46	CENTRAL	ROOIVLEI	11:55:00	11:55:00	00:03:30			NEWCASTLYSKOR						27:09:00	1	2.93
SIN-MYN-WISST	6455	47	CONTAINER	RIETVALLEI	12:25:00	12:25:00	00:30:00			NEWCASTLYSKOR						27:09:00	1	3.14
SIN-MYN-WISST	6455	48	CONTAINER	GLENROY	12:29:30	12:29:30	00:04:30			NEWCASTLYSKOR						27:09:00	1	4.23
SIN-MYN-WISST	6455	49	CONTAINER	DRIEMANSKAP	12:37:00	12:37:00	00:07:30			NEWCASTLYSKOR						27:09:00	1	5.24
SIN-MYN-WISST	6455	50	CONTAINER	KAYDALE	12:47:00	12:47:00	00:10:00			NEWCASTLYSKOR						27:09:00	1	7.92
SIN-MYN-WISST	6455	51	CONTAINER	KLIPPOORTJIE	12:52:00	12:52:00	00:05:00			NEWCASTLYSKOR						27:09:00	1	3.27
SIN-MYN-WISST	6455	51	CONTAINER	HEIDELBERGT	12:56:00	12:56:00	00:04:00			NEWCASTLYSKOR						27:09:00	1	2.54
SIN-MYN-WISST	6455	52	CONTAINER	KRAAL	13:05:30	13:05:30	00:09:30			NEWCASTLYSKOR						27:09:00	1	8
SIN-MYN-WISST	6455	52	CONTAINER	SPRUYTSRUS	13:16:30	13:16:30	00:11:00			NEWCASTLYSKOR						27:09:00	1	8.31
SIN-MYN-WISST	6455	52	CONTAINER	FORTUNA	13:27:30	13:27:30	00:11:00			NEWCASTLYSKOR						27:09:00	1	6.76
SIN-MYN-WISST	6455	52	CONTAINER	BALFOURNORTH	13:37:00	13:37:00	00:09:30			NEWCASTLYSKOR						27:09:00	1	7.83
SIN-MYN-WISST	6455	53	CONTAINER	SPRUCEWELL	13:49:00	13:49:00	00:12:00			NEWCASTLYSKOR						27:09:00	1	9.38
SIN-MYN-WISST	6455	53	CONTAINER	GREYLINGSTAD	14:01:00	14:01:00	00:12:00			NEWCASTLYSKOR						27:09:00	1	9.91
SIN-MYN-WISST	6455	54	CONTAINER	TEAKWORTH	14:12:00	14:12:00	00:11:00			NEWCASTLYSKOR						27:09:00	1	9.09
SIN-MYN-WISST	6455	54	CONTAINER	BEYTELPLAATS	14:20:00	14:20:00	00:08:00			NEWCASTLYSKOR						27:09:00	1	11.8
SIN-MYN-WISST	6455	54	CONTAINER	VAL	14:29:00	14:29:00	00:09:00			NEWCASTLYSKOR						27:09:00	1	7.5
SIN-MYN-WISST	6455	55	CONTAINER	CEDARMONT	14:38:00	14:38:00	00:09:00			NEWCASTLYSKOR						27:09:00	1	7.5
SIN-MYN-WISST	6455	55	CONTAINER	HOLMDENE	14:47:30	14:47:30	00:09:30			NEWCASTLYSKOR						27:09:00	1	7.45
SIN-MYN-WISST	6455	56	CONTAINER	ELMTREE	14:59:00	14:59:00	00:11:30			NEWCASTLYSKOR						27:09:00	1	9.53
SIN-MYN-WISST	6455	56	CONTAINER	STANDERTON	15:15:30	15:15:30	00:16:30			NEWCASTLYSKOR						27:09:00	1	11.63
SIN-MYN-WISST	6455	57	CONTAINER	FIRHAM	15:22:30	15:22:30	00:07:00			NEWCASTLYSKOR						27:09:00	1	5.48
SIN-MYN-WISST	6455	58	CONTAINER	KROMDRAAI	15:35:00	15:35:00	00:12:30			NEWCASTLYSKOR						27:09:00	1	10.56
SIN-MYN-WISST	6455	58	CONTAINER	KANONHEUWEL	15:43:30	15:43:30	00:08:30			NEWCASTLYSKOR						27:09:00	1	5.94
SIN-MYN-WISST	6455	58	CONTAINER	PLATRAND	15:52:30	15:52:30	00:09:00			NEWCASTLYSKOR						27:09:00	1	7.15
SIN-MYN-WISST	6455	59	CONTAINER	RUSTHOF	16:02:30	16:02:30	00:10:00			NEWCASTLYSKOR						27:09:00	1	8.18
SIN-MYN-WISST	6455	59	CONTAINER	KOPPIEALLEEN	16:09:00	16:09:00	00:06:30			NEWCASTLYSKOR						27:09:00	1	5.25
SIN-MYN-WISST	6455	59	CONTAINER	PERDEKOP	16:15:00	16:15:00	00:06:00			NEWCASTLYSKOR						27:09:00	1	4.54
SIN-MYN-WISST	6455	60	CONTAINER	ELANDSPOORT	16:22:00	16:22:00	00:07:00			NEWCASTLYSKOR						27:09:00	1	5
SIN-MYN-WISST	6455	60	CONTAINER	PALMFORD	16:28:00	16:28:00	00:06:00			NEWCASTLYSKOR						27:09:00	1	3.43
SIN-MYN-WISST	6455	61	CONTAINER	BEECHWICK	16:36:30	16:36:30	00:08:30			NEWCASTLYSKOR						27:09:00	1	5.66
SIN-MYN-WISST	6455	61	CONTAINER	SANDSPRUIT	16:46:30	16:46:30	00:10:00			NEWCASTLYSKOR						27:09:00	1	8.19
SIN-MYN-WISST	6455	61	CONTAINER	VOORUITSIG	17:02:30	17:02:30	00:16:00			NEWCASTLYSKOR						27:09:00	1	8.66
SIN-MYN-WISST	6455	62	CONTAINER	CLAVIS	17:17:30	17:17:30	00:15:00			NEWCASTLYSKOR						27:09:00	1	11.61
SIN-MYN-WISST	6455	63	CONTAINER	LANGSNEK	17:25:00	17:25:00	00:07:30			NEWCASTLYSKOR						27:09:00	1	3.45
SIN-MYN-WISST	6455	63	CONTAINER	MOUNTPROSPECT	17:39:00	17:39:00	00:14:00			NEWCASTLYSKOR						27:09:00	1	7.76
SIN-MYN-WISST	6455	63	CONTAINER	INGOGO	18:07:00	18:07:00	00:28:00			NEWCASTLYSKOR						27:09:00	1	15.72
SIN-MYN-WISST	6455	64	CONTAINER	CLONTARF	18:18:00	18:18:00	00:11:00			NEWCASTLYSKOR						27:09:00	1	8.66
SIN-MYN-WISST	6455	64	NORTH	WYKOM	18:30:00	18:30:00	00:12:00			NEWCASTLYSKOR						27:09:00	1	4.25
SIN-MYN-WISST	6455	65	CONTAINER	NEWCASTLYSKOR	18:49:00	00:00:00	00:19:00		BO	NEWCASTLYSKOR						27:09:00	1	7`;

const B5_7403 = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
SIN-MYN-WISST	7403	1	CAPE	SIN-MYN-WISST		08:00:00				BIJLKOR	08:00:00	02:01:00	1	YYAYAYY	MEDIUM HEAVY/AMSA IRON ORE	18:01:00	0	
SIN-MYN-WISST	7403	1	CAPE	GAMMAGARA	08:07:00	08:07:00	00:07:00		C	BIJLKOR						18:01:00	0	3.25
SIN-MYN-WISST	7403	2	ORELINE	GMA/S261955	08:08:00	08:09:00	00:01:00	00:01:00	SHUNT	BIJLKOR						18:01:00	0	0.96
SIN-MYN-WISST	7403	3	CAPE	GAMMAGARA	08:10:00	08:10:00	00:01:00			BIJLKOR						18:01:00	0	0.96
SIN-MYN-WISST	7403	4	CAPE	MOOKANENG	08:17:30	08:17:30	00:07:30			BIJLKOR						18:01:00	0	9.63
SIN-MYN-WISST	7403	4	CAPE	HAAKBOSLEEGTE	08:23:30	08:23:30	00:06:00			BIJLKOR						18:01:00	0	5.04
SIN-MYN-WISST	7403	5	CAPE	LOHATLHA	08:36:30	08:36:30	00:13:00			BIJLKOR						18:01:00	0	10.57
SIN-MYN-WISST	7403	6	CAPE	ERTSRAND	08:44:00	08:44:00	00:07:30			BIJLKOR						18:01:00	0	5.57
SIN-MYN-WISST	7403	6	CAPE	GLOSAM	08:48:00	08:48:00	00:04:00			BIJLKOR						18:01:00	0	2.75
SIN-MYN-WISST	7403	6	CAPE	PALINGPAN	08:55:00	08:55:00	00:07:00			BIJLKOR						18:01:00	0	4.95
SIN-MYN-WISST	7403	7	CAPE	BOKKOPPIE	09:03:00	09:03:00	00:08:00			BIJLKOR						18:01:00	0	6.51
SIN-MYN-WISST	7403	7	CAPE	BEESHOEK	09:15:30	09:15:30	00:12:30			BIJLKOR						18:01:00	0	8.86
SIN-MYN-WISST	7403	8	CAPE	BEK/S242799	09:17:00	09:19:00	00:01:30	00:02:00	SHUNT	BIJLKOR						18:01:00	0	0.97
SIN-MYN-WISST	7403	9	CAPE	BEESHOEK	09:20:00	09:20:00	00:01:00			BIJLKOR						18:01:00	0	0.97
SIN-MYN-WISST	7403	10	CAPE	POSTMASBURG	09:32:00	10:00:00	00:12:00	00:28:00	INSPECTION ROLL BY	BIJLKOR						18:01:00	0	7.84
SIN-MYN-WISST	7403	11	CAPE	TSANTSABANE	10:19:00	10:19:00	00:19:00			BIJLKOR						18:01:00	0	9.06
SIN-MYN-WISST	7403	11	CAPE	BLINKKLIP	10:31:00	10:31:00	00:12:00			BIJLKOR						18:01:00	0	9
SIN-MYN-WISST	7403	11	CAPE	GROENWATER	10:46:00	10:46:00	00:15:00			BIJLKOR						18:01:00	0	11.9
SIN-MYN-WISST	7403	11	CAPE	CLIFTON	10:56:30	10:56:30	00:10:30			BIJLKOR						18:01:00	0	8.38
SIN-MYN-WISST	7403	11	CAPE	LIMEACRES	11:11:30	11:11:30	00:15:00			BIJLKOR						18:01:00	0	14.46
SIN-MYN-WISST	7403	12	CAPE	SILVERSTREAMS	11:18:00	11:18:00	00:06:30			BIJLKOR						18:01:00	0	5.87
SIN-MYN-WISST	7403	13	CAPE	TREWIL	11:31:30	11:31:30	00:13:30			BIJLKOR						18:01:00	0	11.43
SIN-MYN-WISST	7403	13	CAPE	ARIESFONTEIN	11:40:00	11:40:00	00:08:30			BIJLKOR						18:01:00	0	8.21
SIN-MYN-WISST	7403	13	CAPE	PLATEAU	11:55:00	12:20:00	00:15:00	00:25:00	X	BIJLKOR						18:01:00	0	14.08
SIN-MYN-WISST	7403	13	CAPE	KOOPMANSFONTE	12:36:30	12:36:30	00:16:30			BIJLKOR						18:01:00	0	13.26
SIN-MYN-WISST	7403	13	CAPE	NOOIBOS	12:42:30	12:42:30	00:06:00			BIJLKOR						18:01:00	0	5.41`;

const B5_6431 = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
SIN-MYN-WISST	6431	54	CONTAINER	VAL	21:49:00	21:49:00	00:09:00			NEWCASTLYSKOR						29:09:00	1	7.5
SIN-MYN-WISST	6431	55	CONTAINER	CEDARMONT	21:58:00	21:58:00	00:09:00			NEWCASTLYSKOR						29:09:00	1	7.5
SIN-MYN-WISST	6431	55	CONTAINER	HOLMDENE	22:07:30	22:07:30	00:09:30			NEWCASTLYSKOR						29:09:00	1	7.45
SIN-MYN-WISST	6431	56	CONTAINER	ELMTREE	22:19:00	22:19:00	00:11:30			NEWCASTLYSKOR						29:09:00	1	9.53
SIN-MYN-WISST	6431	56	CONTAINER	STANDERTON	22:35:00	22:35:00	00:16:00			NEWCASTLYSKOR						29:09:00	1	11.63
SIN-MYN-WISST	6431	57	CONTAINER	FIRHAM	22:42:30	22:42:30	00:07:30			NEWCASTLYSKOR						29:09:00	1	5.48
SIN-MYN-WISST	6431	58	CONTAINER	KROMDRAAI	22:55:00	22:55:00	00:12:30			NEWCASTLYSKOR						29:09:00	1	10.56
SIN-MYN-WISST	6431	58	CONTAINER	KANONHEUWEL	23:03:30	23:03:30	00:08:30			NEWCASTLYSKOR						29:09:00	1	5.94
SIN-MYN-WISST	6431	58	CONTAINER	PLATRAND	23:12:30	23:12:30	00:09:00			NEWCASTLYSKOR						29:09:00	1	7.15
SIN-MYN-WISST	6431	59	CONTAINER	RUSTHOF	23:22:30	23:22:30	00:10:00			NEWCASTLYSKOR						29:09:00	1	8.18
SIN-MYN-WISST	6431	59	CONTAINER	KOPPIEALLEEN	23:29:00	23:29:00	00:06:30			NEWCASTLYSKOR						29:09:00	1	5.25
SIN-MYN-WISST	6431	59	CONTAINER	PERDEKOP	23:35:00	23:35:00	00:06:00			NEWCASTLYSKOR						29:09:00	1	4.54
SIN-MYN-WISST	6431	60	CONTAINER	ELANDSPOORT	23:42:00	23:42:00	00:07:00			NEWCASTLYSKOR						29:09:00	1	5
SIN-MYN-WISST	6431	60	CONTAINER	PALMFORD	23:48:00	23:48:00	00:06:00			NEWCASTLYSKOR						29:09:00	1	3.43
SIN-MYN-WISST	6431	61	CONTAINER	BEECHWICK	23:56:30	23:56:30	00:08:30			NEWCASTLYSKOR						29:09:00	1	5.66
SIN-MYN-WISST	6431	61	CONTAINER	SANDSPRUIT	00:06:30	00:06:30	00:10:00			NEWCASTLYSKOR						29:09:00	2	8.19
SIN-MYN-WISST	6431	61	CONTAINER	VOORUITSIG	00:22:30	00:22:30	00:16:00			NEWCASTLYSKOR						29:09:00	2	8.66
SIN-MYN-WISST	6431	62	CONTAINER	CLAVIS	00:37:30	00:37:30	00:15:00			NEWCASTLYSKOR						29:09:00	2	11.61
SIN-MYN-WISST	6431	63	CONTAINER	LANGSNEK	00:45:00	00:45:00	00:07:30			NEWCASTLYSKOR						29:09:00	2	3.45
SIN-MYN-WISST	6431	63	CONTAINER	MOUNTPROSPECT	00:59:00	00:59:00	00:14:00			NEWCASTLYSKOR						29:09:00	2	7.76
SIN-MYN-WISST	6431	63	CONTAINER	INGOGO	01:27:00	01:27:00	00:28:00			NEWCASTLYSKOR						29:09:00	2	15.72
SIN-MYN-WISST	6431	64	CONTAINER	CLONTARF	01:38:00	01:38:00	00:11:00			NEWCASTLYSKOR						29:09:00	2	8.66
SIN-MYN-WISST	6431	64	NORTH	WYKOM	01:50:00	01:50:00	00:12:00			NEWCASTLYSKOR						29:09:00	2	4.25
SIN-MYN-WISST	6431	65	CONTAINER	NEWCASTLYSKOR	02:09:00	00:00:00	00:19:00		BO	NEWCASTLYSKOR						29:09:00	2	7`;


/**
 * Fifth extract. Supplies 7403's head and summary, a complete 6455, and the
 * tail of 6431. 6455 is the longest run in the sample at 27h09m and is the
 * first long haul whose totals reconcile all the way through.
 */
describe('a fifth extract: a run longer than a day', () => {
  const byId = (c: string, id: string) => parseRunningTimes(c).find((t) => t.train === id)!;
  const c6455 = () => byId(B5_6455, '6455');
  const c7403 = () => byId(B5_7403, '7403');
  const c6431 = () => byId(B5_6431, '6431');

  /**
   * The whole point of the extract. 6455 departs 15:40 on day 0 and arrives
   * 18:49 on day 1: 1629 minutes, which is 27h09m and MORE THAN A DAY.
   *
   * On a 24-hour clock the arrival is only 189 minutes after the departure, so
   * a modular difference reports a train that reconciles exactly as failing
   * every check. elapsedMinutes() carries the day offset and gets 1629.
   */
  it('ties 6455 at 27h09, which no modular difference can reach', () => {
    const t = c6455();
    expect(t.throughputRuntime).toBe(1629);
    expect(elapsedMinutes(t)).toBe(1629);
    // The modular reading of the same two clock times, for contrast.
    expect((t.destinationArrival - t.originDeparture + 1440) % 1440).toBe(189);
    expect(validateSchedule(t).throughputTies).toBe(true);
  });

  /**
   * The full identity, on a train long enough for it to mean something:
   * sum(point-to-point) + sum(standing) == elapsed == stated throughput.
   * 1308 + 321 == 1629, over 1036 km.
   */
  it('reconciles 6455 end to end across every row', () => {
    const t = c6455();
    const runtime = t.rows.reduce((n, r) => n + (r.pointToPointRuntime ?? 0), 0);
    const standing = t.rows.reduce((n, r) => n + (r.standingTime ?? 0), 0);
    expect(runtime).toBe(1308);
    expect(standing).toBe(321);
    expect(runtime + standing).toBe(1629);

    const v = validateSchedule(t);
    expect(v.runtimeMismatches).toEqual([]);
    expect(v.standingMismatches).toEqual([]);
    expect(v.elapsedIdentityHolds).toBe(true);
    expect(v.throughputTies).toBe(true);
  });

  /**
   * 6455 is not a continuation and not abridged — it carries its summary row
   * and 65 sequence groups, so the reconciliation above is a real result and
   * not an artefact of a fixture that happens to add up.
   */
  it('carries 6455 complete, at 65 sequence groups', () => {
    const t = c6455();
    expect(hasSummary(t)).toBe(true);
    expect(t.rows.length).toBe(142);
    expect(new Set(t.rows.map((r) => r.nodeSeq)).size).toBe(65);
    expect(t.destination).toBe('NEWCASTLYSKOR');
  });

  /**
   * Two corridor values never seen before, and the second one appears exactly
   * once in each train that has it: WYKOM is a NORTH island between two
   * CONTAINER rows. It recurs identically on 6431 and 6455, so it is a
   * property of the node, not a stray entry.
   */
  it('adds CONTAINER and NORTH, with WYKOM a one-row island in both', () => {
    for (const c of [B5_6455, B5_6431]) {
      const rows = byId(c, c === B5_6455 ? '6455' : '6431').rows;
      const i = rows.findIndex((r) => r.station === 'WYKOM');
      expect(rows[i].corridor).toBe('NORTH');
      expect(rows[i - 1].corridor).toBe('CONTAINER');
      expect(rows[i + 1].corridor).toBe('CONTAINER');
    }
    const corridors = [...new Set(c6455().rows.map((r) => r.corridor))];
    expect(corridors).toContain('CAPE');
    expect(corridors).toContain('CENTRAL');
    expect(corridors).toContain('CONTAINER');
    expect(corridors).toContain('ORELINE');
  });

  /**
   * A day offset of 2: 6431's rows start on day 1 and finish on day 2, so any
   * assumption that the offset only ever runs 0 to 1 is wrong.
   */
  it('runs the day offset past 1', () => {
    const days = c6431().rows.map((r) => r.departDay);
    expect(days).toContain(1);
    expect(days).toContain(2);
    expect(spansDays(c6431())).toBe(true);
  });

  /**
   * 7403 arrives with its head and summary together. Its throughput of 18:01
   * ties, and the 08:00 origin departure is now read rather than inferred.
   */
  it('ties 7403 now that its head and summary have arrived', () => {
    const t = c7403();
    expect(hasSummary(t)).toBe(true);
    expect(t.originDeparture).toBe(480); // 08:00
    expect(t.throughputRuntime).toBe(1081);
    expect(validateSchedule(t).throughputTies).toBe(true);
  });

  /**
   * Frequency is not always YYYYYYY. 6455 runs YYYYAYY and 7403 runs YYAYAYY,
   * so a train is not a daily service by default and capacity planning cannot
   * assume seven runs a week.
   */
  it('shows services that do not run every day', () => {
    expect(c6455().frequency).toBe('YYYYAYY');
    expect(c7403().frequency).toBe('YYAYAYY');
  });

  /**
   * Three standing reasons never seen before. 'RM' is the new largest stand in
   * the sample at Warronton (169 min) — note Warronton also carries 'BO' on
   * 7403, 7405 and 7407, so the bottleneck is the node and not the reason.
   * 'X 2577/2463' holds TWO train numbers, and 'H17005P' matches no pattern
   * seen so far.
   */
  it('adds RM, a two-train crossing, and a reason of no known shape', () => {
    const t = c6455();
    const at = (st: string) => t.rows.find((r) => r.station === st)!;
    expect(at('WARRENTON').standingTime).toBe(169);
    expect(at('WARRENTON').standingReason).toBe('RM');
    expect(at('RAATHSVLEI').standingReason).toBe('RM');
    expect(at('KOOPMANSFONTE').standingReason).toBe('X 2577/2463');
    expect(at('DRIERUITERS').standingReason).toBe('H17005P');
  });

  /**
   * WEIR stands 19 minutes with no reason given at all.
   */
  it('carries a stand with no reason recorded', () => {
    const weir = c6455().rows.find((r) => r.station === 'WEIR')!;
    expect(weir.standingTime).toBe(19);
    expect(weir.standingReason).toBeNull();
  });

  /**
   * The weighbridge siding carries a 30-second runtime here, where on 7403 and
   * 7405 the same siding has none. The row cannot be identified by its station
   * name alone — the same node is both a timing point and a non-event
   * depending on the train.
   */
  it('gives the weighbridge a runtime on 6455 and none on 7403', () => {
    expect(c6455().rows.find((r) => r.station === 'BAH/S261866')!.pointToPointRuntime)
      .toBeCloseTo(0.5, 6);
    expect(c7403().rows.find((r) => r.station === 'BAH/S261866')).toBeUndefined();
  });

  /**
   * 6455 covers the same CAPE sections as 7403 at wildly different speeds —
   * 9.63 km to MOOKANENG in 2 minutes (289 km/h, impossible for heavy haul)
   * against 7403's 7.5 minutes for the same distance. Recorded as an anomaly
   * rather than resolved: the source disagrees with itself and no reading of
   * it is safe to prefer.
   */
  it('disagrees with itself on sections other trains agree on', () => {
    const mook = c6455().rows.find((r) => r.station === 'MOOKANENG')!;
    expect(mook.pointToPointRuntime).toBe(2);
    expect(mook.distanceKm).toBeCloseTo(9.63, 2);
    expect((mook.distanceKm ?? 0) / ((mook.pointToPointRuntime ?? 1) / 60)).toBeGreaterThan(200);
  });
});

const B6_2312 = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
SIN-MYN-WISST	2312	1	CAPE	SIN-MYN-WISST		18:29:00				POSTMASBURG	18:29:00	20:46:00	2	YYYYYYY	VACUUM TRAINS/MATERIAL TRN	02:17:00	0	
SIN-MYN-WISST	2312	1	CAPE	GAMMAGARA	18:48:00	18:49:00	00:19:00	00:01:00	B SHUNT	POSTMASBURG						02:17:00	0	3.25
SIN-MYN-WISST	2312	2	CAPE	MOOKANENG	18:59:30	19:01:00	00:10:30	00:01:30	SHUNT	POSTMASBURG						02:17:00	0	9.63
SIN-MYN-WISST	2312	2	CAPE	HAAKBOSLEEGTE	19:11:00	19:12:00	00:10:00	00:01:00	SHUNT	POSTMASBURG						02:17:00	0	5.04
SIN-MYN-WISST	2312	3	CAPE	LOHATLHA	19:24:00	19:25:00	00:12:00	00:01:00	SHUNT	POSTMASBURG						02:17:00	0	10.57
SIN-MYN-WISST	2312	4	CAPE	ERTSRAND	19:32:30	19:33:00	00:07:30	00:00:30	SHUNT	POSTMASBURG						02:17:00	0	5.57
SIN-MYN-WISST	2312	4	CAPE	GLOSAM	19:36:00	19:37:00	00:03:00	00:01:00	SHUNT	POSTMASBURG						02:17:00	0	2.75
SIN-MYN-WISST	2312	4	CAPE	PALINGPAN	19:42:30	19:44:00	00:05:30	00:01:30	SHUNT	POSTMASBURG						02:17:00	0	4.95
SIN-MYN-WISST	2312	5	CAPE	BOKKOPPIE	19:51:00	20:20:00	00:07:00	00:29:00	SHUNT / WAIT CROSSINGS	POSTMASBURG						02:17:00	0	6.51
SIN-MYN-WISST	2312	5	CAPE	BEESHOEK	20:30:00	20:31:00	00:10:00	00:01:00	SHUNT	POSTMASBURG						02:17:00	0	8.86
SIN-MYN-WISST	2312	6	CAPE	POSTMASBURG	20:46:00	00:00:00	00:15:00		RT	POSTMASBURG						02:17:00	0	7.84`;

const B6_6431_HEAD = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
SIN-MYN-WISST	6431	1	CAPE	SIN-MYN-WISST		21:00:00				NEWCASTLYSKOR	21:00:00	02:09:00	1	AAAAAAA	MEDIUM HEAVY/AMSA IRON ORE	29:09:00	0	
SIN-MYN-WISST	6431	1	CAPE	GAMMAGARA	21:04:00	21:04:00	00:04:00		C	NEWCASTLYSKOR						29:09:00	0	3.25
SIN-MYN-WISST	6431	2	ORELINE	GMA/S261955	21:05:00	21:06:00	00:01:00	00:01:00	SHUNT	NEWCASTLYSKOR						29:09:00	0	0.96
SIN-MYN-WISST	6431	3	CAPE	GAMMAGARA	21:07:00	21:07:00	00:01:00			NEWCASTLYSKOR						29:09:00	0	0.96
SIN-MYN-WISST	6431	4	CAPE	MOOKANENG	21:17:00	21:17:00	00:10:00			NEWCASTLYSKOR						29:09:00	0	9.63
SIN-MYN-WISST	6431	4	CAPE	HAAKBOSLEEGTE	21:23:00	21:23:00	00:06:00			NEWCASTLYSKOR						29:09:00	0	5.04
SIN-MYN-WISST	6431	5	CAPE	LOHATLHA	21:36:00	21:36:00	00:13:00			NEWCASTLYSKOR						29:09:00	0	10.57
SIN-MYN-WISST	6431	6	CAPE	ERTSRAND	21:44:00	21:44:00	00:08:00			NEWCASTLYSKOR						29:09:00	0	5.57
SIN-MYN-WISST	6431	6	CAPE	GLOSAM	21:48:00	21:48:00	00:04:00			NEWCASTLYSKOR						29:09:00	0	2.75
SIN-MYN-WISST	6431	6	CAPE	PALINGPAN	21:55:00	21:55:00	00:07:00			NEWCASTLYSKOR						29:09:00	0	4.95
SIN-MYN-WISST	6431	7	CAPE	BOKKOPPIE	22:03:30	22:03:30	00:08:30			NEWCASTLYSKOR						29:09:00	0	6.51
SIN-MYN-WISST	6431	7	CAPE	BEESHOEK	22:09:00	22:09:00	00:05:30			NEWCASTLYSKOR						29:09:00	0	8.86
SIN-MYN-WISST	6431	8	CAPE	BEK/S242799	22:11:00	22:13:00	00:02:00	00:02:00	SHUNT	NEWCASTLYSKOR						29:09:00	0	0.97
SIN-MYN-WISST	6431	9	CAPE	BEESHOEK	22:15:30	22:15:30	00:02:30			NEWCASTLYSKOR						29:09:00	0	0.97
SIN-MYN-WISST	6431	10	CAPE	POSTMASBURG	22:32:00	23:00:00	00:16:30	00:28:00	INSPECTION ROLL BY	NEWCASTLYSKOR						29:09:00	0	7.84
SIN-MYN-WISST	6431	11	CAPE	TSANTSABANE	23:19:00	23:19:00	00:19:00			NEWCASTLYSKOR						29:09:00	0	9.06
SIN-MYN-WISST	6431	11	CAPE	BLINKKLIP	23:31:00	23:31:00	00:12:00			NEWCASTLYSKOR						29:09:00	0	9
SIN-MYN-WISST	6431	11	CAPE	GROENWATER	23:46:30	23:46:30	00:15:30			NEWCASTLYSKOR						29:09:00	0	11.9
SIN-MYN-WISST	6431	11	CAPE	CLIFTON	00:30:00	00:30:00	00:43:30			NEWCASTLYSKOR						29:09:00	1	8.38
SIN-MYN-WISST	6431	11	CAPE	LIMEACRES	00:45:30	00:45:30	00:15:30			NEWCASTLYSKOR						29:09:00	1	14.46
SIN-MYN-WISST	6431	12	CAPE	SILVERSTREAMS	00:52:00	00:52:00	00:06:30			NEWCASTLYSKOR						29:09:00	1	5.87
SIN-MYN-WISST	6431	13	CAPE	TREWIL	01:05:30	01:05:30	00:13:30			NEWCASTLYSKOR						29:09:00	1	11.43
SIN-MYN-WISST	6431	13	CAPE	ARIESFONTEIN	01:14:00	01:14:00	00:08:30			NEWCASTLYSKOR						29:09:00	1	8.21
SIN-MYN-WISST	6431	13	CAPE	PLATEAU	01:29:00	01:29:00	00:15:00			NEWCASTLYSKOR						29:09:00	1	14.08
SIN-MYN-WISST	6431	13	CAPE	KOOPMANSFONTE	01:45:30	01:45:30	00:16:30			NEWCASTLYSKOR						29:09:00	1	13.26
SIN-MYN-WISST	6431	13	CAPE	NOOIBOS	01:47:00	01:47:00	00:01:30			NEWCASTLYSKOR						29:09:00	1	5.41
SIN-MYN-WISST	6431	13	CAPE	OLEA	01:58:30	01:58:30	00:11:30			NEWCASTLYSKOR						29:09:00	1	4.37
SIN-MYN-WISST	6431	13	CAPE	KNEUKEL	02:03:00	02:03:00	00:04:30			NEWCASTLYSKOR						29:09:00	1	3.12
SIN-MYN-WISST	6431	13	CAPE	GHAAP	02:15:30	02:15:30	00:12:30			NEWCASTLYSKOR						29:09:00	1	6.51
SIN-MYN-WISST	6431	13	CAPE	ULCO	02:39:00	02:39:00	00:23:30			NEWCASTLYSKOR						29:09:00	1	11.85
SIN-MYN-WISST	6431	14	CAPE	BORRELSKOP	02:46:30	02:46:30	00:07:30			NEWCASTLYSKOR						29:09:00	1	6.04
SIN-MYN-WISST	6431	14	CAPE	WINTERSRUSH	02:53:00	02:53:00	00:06:30			NEWCASTLYSKOR						29:09:00	1	6.54
SIN-MYN-WISST	6431	14	CAPE	GONGGONG	03:01:00	03:01:00	00:08:00			NEWCASTLYSKOR						29:09:00	1	7.51
SIN-MYN-WISST	6431	14	CAPE	BADHOPE	03:05:00	03:05:00	00:04:00			NEWCASTLYSKOR						29:09:00	1	4.5
SIN-MYN-WISST	6431	14	CAPE	BAH/S261866	03:06:00	03:07:00	00:01:00	00:01:00	WEIGHBRIDGE	NEWCASTLYSKOR						29:09:00	1	0.1
SIN-MYN-WISST	6431	14	CAPE	DIAMANTOORD	03:09:00	03:09:00	00:02:00			NEWCASTLYSKOR						29:09:00	1	6.44
SIN-MYN-WISST	6431	14	CAPE	BARKLYWEST	03:16:00	03:16:00	00:07:00			NEWCASTLYSKOR						29:09:00	1	1.7
SIN-MYN-WISST	6431	15	CAPE	WEIR	03:25:00	03:25:00	00:09:00			NEWCASTLYSKOR						29:09:00	1	6.19
SIN-MYN-WISST	6431	15	CAPE	RIVERMEAD	03:27:00	03:27:00	00:02:00			NEWCASTLYSKOR						29:09:00	1	4.11
SIN-MYN-WISST	6431	15	CAPE	FIELDSVIEW	03:38:30	03:38:30	00:11:30			NEWCASTLYSKOR						29:09:00	1	6.41
SIN-MYN-WISST	6431	16	CAPE	MACFARLANE	03:54:30	03:54:30	00:16:00			NEWCASTLYSKOR						29:09:00	1	12.09
SIN-MYN-WISST	6431	17	CAPE	RIVERTON	04:04:00	04:04:00	00:09:30			NEWCASTLYSKOR						29:09:00	1	6.12
SIN-MYN-WISST	6431	18	CAPE	SLYPKLIP	04:07:00	04:07:00	00:03:00			NEWCASTLYSKOR						29:09:00	1	7.92
SIN-MYN-WISST	6431	18	CAPE	WINDSORTONROA	04:23:30	04:23:30	00:16:30			NEWCASTLYSKOR						29:09:00	1	9.4
SIN-MYN-WISST	6431	19	CAPE	KOEDOE	04:26:30	04:26:30	00:03:00			NEWCASTLYSKOR						29:09:00	1	12.4
SIN-MYN-WISST	6431	19	CAPE	CONTENT	04:42:00	04:42:00	00:15:30			NEWCASTLYSKOR						29:09:00	1	8
SIN-MYN-WISST	6431	19	CAPE	WARRENTON	04:55:00	10:00:00	00:13:00	05:05:00	BO	NEWCASTLYSKOR						29:09:00	1	12.64
SIN-MYN-WISST	6431	20	CAPE	VEERTIENSTROM	10:06:00	10:06:00	00:06:00			NEWCASTLYSKOR						29:09:00	1	5.8
SIN-MYN-WISST	6431	21	CENTRAL	CAMELFORD	10:17:00	10:17:00	00:11:00			NEWCASTLYSKOR						29:09:00	1	13.9
SIN-MYN-WISST	6431	21	CENTRAL	FENDYKE	10:27:30	10:27:30	00:10:30			NEWCASTLYSKOR						29:09:00	1	9.69
SIN-MYN-WISST	6431	21	CENTRAL	CHRISTIANA	10:36:30	10:36:30	00:09:00			NEWCASTLYSKOR						29:09:00	1	9.91
SIN-MYN-WISST	6431	22	CENTRAL	KROMELLENBOOG	10:49:00	10:49:00	00:12:30			NEWCASTLYSKOR						29:09:00	1	14.18
SIN-MYN-WISST	6431	23	CENTRAL	BRITTEN	11:06:00	11:06:00	00:17:00			NEWCASTLYSKOR						29:09:00	1	11.77
SIN-MYN-WISST	6431	24	CENTRAL	FERNDALE	11:13:00	11:13:00	00:07:00			NEWCASTLYSKOR						29:09:00	1	8.82
SIN-MYN-WISST	6431	24	CENTRAL	WILDHOEN	11:20:00	11:20:00	00:07:00			NEWCASTLYSKOR						29:09:00	1	4.94
SIN-MYN-WISST	6431	24	CENTRAL	YDELHOOP	11:35:00	11:35:00	00:15:00			NEWCASTLYSKOR						29:09:00	1	7.11
SIN-MYN-WISST	6431	24	CENTRAL	BLOEMHOF	11:42:30	11:42:30	00:07:30			NEWCASTLYSKOR						29:09:00	1	6.28
SIN-MYN-WISST	6431	25	CENTRAL	STRYDERS	11:48:30	11:48:30	00:06:00			NEWCASTLYSKOR						29:09:00	1	6.62
SIN-MYN-WISST	6431	25	CENTRAL	GRASSLANDS	11:55:00	11:55:00	00:06:30			NEWCASTLYSKOR						29:09:00	1	6.5
SIN-MYN-WISST	6431	25	CENTRAL	KINGSWOOD	12:01:00	12:01:00	00:06:00			NEWCASTLYSKOR						29:09:00	1	11.74
SIN-MYN-WISST	6431	26	CENTRAL	DRIERUITERS	12:16:00	12:16:00	00:15:00		X CONTAINER	NEWCASTLYSKOR						29:09:00	1	6.5
SIN-MYN-WISST	6431	26	CENTRAL	BOSKUIL	12:38:00	12:38:00	00:22:00			NEWCASTLYSKOR						29:09:00	1	6.26
SIN-MYN-WISST	6431	26	CENTRAL	MAKWASSIE	12:51:00	13:15:00	00:13:00	00:24:00	X 81002	NEWCASTLYSKOR						29:09:00	1	15.56
SIN-MYN-WISST	6431	27	CENTRAL	EERSTELING	13:26:00	13:26:00	00:11:00			NEWCASTLYSKOR						29:09:00	1	9.66
SIN-MYN-WISST	6431	27	CENTRAL	DAALDER	13:41:00	13:41:00	00:15:00			NEWCASTLYSKOR						29:09:00	1	7.48
SIN-MYN-WISST	6431	27	CENTRAL	LEEUDORINGSTA	13:46:30	13:46:30	00:05:30			NEWCASTLYSKOR						29:09:00	1	8.38
SIN-MYN-WISST	6431	28	CENTRAL	LEEUBOS	13:52:30	13:52:30	00:06:00			NEWCASTLYSKOR						29:09:00	1	9.68
SIN-MYN-WISST	6431	28	CENTRAL	HARRISBURG	14:02:30	14:02:30	00:10:00			NEWCASTLYSKOR						29:09:00	1	9.56
SIN-MYN-WISST	6431	28	CENTRAL	REGINA	14:17:00	14:17:00	00:14:30			NEWCASTLYSKOR						29:09:00	1	14.71
SIN-MYN-WISST	6431	29	CENTRAL	DEAN	14:32:00	14:32:00	00:15:00			NEWCASTLYSKOR						29:09:00	1	7.44
SIN-MYN-WISST	6431	29	CENTRAL	LAVA	14:39:00	14:39:00	00:07:00			NEWCASTLYSKOR						29:09:00	1	5.33
SIN-MYN-WISST	6431	29	CENTRAL	ORKNEY	14:44:00	14:44:00	00:05:00			NEWCASTLYSKOR						29:09:00	1	6.54
SIN-MYN-WISST	6431	30	CENTRAL	ARISTON	14:51:00	14:51:00	00:07:00			NEWCASTLYSKOR						29:09:00	1	3.43
SIN-MYN-WISST	6431	30	CENTRAL	KLERKSDORP	15:00:00	15:00:00	00:09:00			NEWCASTLYSKOR						29:09:00	1	6.58
SIN-MYN-WISST	6431	31	CENTRAL	SANDPAN	15:06:00	15:06:00	00:06:00			NEWCASTLYSKOR						29:09:00	1	6.41
SIN-MYN-WISST	6431	31	CENTRAL	STILFONTEIN	15:11:00	15:11:00	00:05:00			NEWCASTLYSKOR						29:09:00	1	2.95
SIN-MYN-WISST	6431	31	CENTRAL	KOEKEMOER	15:22:00	15:22:00	00:11:00			NEWCASTLYSKOR						29:09:00	1	4.91
SIN-MYN-WISST	6431	32	CENTRAL	NEWMACHAVIE	15:28:00	15:28:00	00:06:00			NEWCASTLYSKOR						29:09:00	1	13.17
SIN-MYN-WISST	6431	32	CENTRAL	CRESCENT	15:41:00	15:41:00	00:13:00			NEWCASTLYSKOR						29:09:00	1	9.52
SIN-MYN-WISST	6431	32	CENTRAL	POTCHEFSTROOM	15:54:00	15:54:00	00:13:00			NEWCASTLYSKOR						29:09:00	1	9.92
SIN-MYN-WISST	6431	33	CENTRAL	CACHET	15:57:00	15:57:00	00:03:00			NEWCASTLYSKOR						29:09:00	1	2.6
SIN-MYN-WISST	6431	34	CENTRAL	TARENTAAL	16:02:00	16:02:06	00:05:00			NEWCASTLYSKOR						29:09:00	1	9.08
SIN-MYN-WISST	6431	34	CENTRAL	KLIPDRIF	16:07:00	16:07:00	00:04:54			NEWCASTLYSKOR						29:09:00	1	9.75
SIN-MYN-WISST	6431	34	CENTRAL	ENSELSPRUIT	16:11:00	16:11:00	00:04:00			NEWCASTLYSKOR						29:09:00	1	14.5
SIN-MYN-WISST	6431	35	CENTRAL	FOCHVILLE	16:19:00	16:19:00	00:08:00			NEWCASTLYSKOR						29:09:00	1	13.18
SIN-MYN-WISST	6431	35	CENTRAL	MICHAELSRAAD	16:26:00	16:26:00	00:07:00			NEWCASTLYSKOR						29:09:00	1	10.93
SIN-MYN-WISST	6431	35	CENTRAL	RAATHSVLEI	16:34:00	17:44:00	00:08:00	01:10:00	BO	NEWCASTLYSKOR						29:09:00	1	4.88
SIN-MYN-WISST	6431	36	CENTRAL	BLOEKOMHEUNING	17:49:00	17:49:00	00:05:00			NEWCASTLYSKOR						29:09:00	1	7.78
SIN-MYN-WISST	6431	36		VANDERBIJL	17:53:00	17:53:00	00:04:00			NEWCASTLYSKOR						29:09:00	1	7.95
SIN-MYN-WISST	6431	36	CENTRAL	VANDERBIJLPAR	17:55:00	17:55:00	00:02:00			NEWCASTLYSKOR						29:09:00	1	1
SIN-MYN-WISST	6431	36	CENTRAL	HOUTHEUWEL	18:03:00	18:03:00	00:08:00			NEWCASTLYSKOR						29:09:00	1	5.34
SIN-MYN-WISST	6431	37	CENTRAL	KLEIGROND	18:08:00	18:08:00	00:05:00			NEWCASTLYSKOR						29:09:00	1	4.38
SIN-MYN-WISST	6431	38	CENTRAL	LEEUHOF	18:16:00	18:16:00	00:08:00			NEWCASTLYSKOR						29:09:00	1	3.06
SIN-MYN-WISST	6431	39	CENTRAL	DUNCANVILLE	18:20:00	18:20:00	00:04:00			NEWCASTLYSKOR						29:09:00	1	3.12
SIN-MYN-WISST	6431	39	CENTRAL	VER-NOORD	18:24:00	18:24:00	00:04:00			NEWCASTLYSKOR						29:09:00	1	0.98
SIN-MYN-WISST	6431	40	CENTRAL	ALLOY	18:28:00	18:28:00	00:04:00			NEWCASTLYSKOR						29:09:00	1	1.55
SIN-MYN-WISST	6431	40	CENTRAL	REDAN	18:34:00	18:34:00	00:06:00			NEWCASTLYSKOR						29:09:00	1	3.97
SIN-MYN-WISST	6431	41	CENTRAL	KOOKRUS	18:39:30	18:39:30	00:05:30			NEWCASTLYSKOR						29:09:00	1	5.11
SIN-MYN-WISST	6431	41	CENTRAL	MEYERTON	18:49:30	18:49:30	00:10:00			NEWCASTLYSKOR						29:09:00	1	3.91
SIN-MYN-WISST	6431	42	CENTRAL	HENLYONKLIP	18:54:30	18:54:30	00:05:00			NEWCASTLYSKOR						29:09:00	1	4.46
SIN-MYN-WISST	6431	43	CENTRAL	DALESIDE	19:05:30	19:05:30	00:11:00			NEWCASTLYSKOR						29:09:00	1	4.91
SIN-MYN-WISST	6431	44	CONTAINER	SKANSDAM	19:08:30	19:08:30	00:03:00			NEWCASTLYSKOR						29:09:00	1	2.62
SIN-MYN-WISST	6431	44	CENTRAL	SYBRAND	19:13:30	19:13:30	00:05:00			NEWCASTLYSKOR						29:09:00	1	2.58
SIN-MYN-WISST	6431	45	CENTRAL	ROODE	19:36:30	19:36:30	00:23:00			NEWCASTLYSKOR						29:09:00	1	22.66
SIN-MYN-WISST	6431	46	CENTRAL	ROOIVLEI	19:40:00	19:40:00	00:03:30			NEWCASTLYSKOR						29:09:00	1	2.93
SIN-MYN-WISST	6431	47	CONTAINER	RIETVALLEI	19:42:00	19:45:00	00:02:00	00:03:00	F MAJUBA	NEWCASTLYSKOR						29:09:00	1	3.14
SIN-MYN-WISST	6431	48	CONTAINER	GLENROY	19:49:30	19:49:30	00:04:30			NEWCASTLYSKOR						29:09:00	1	4.23
SIN-MYN-WISST	6431	49	CONTAINER	DRIEMANSKAP	19:57:00	19:57:00	00:07:30			NEWCASTLYSKOR						29:09:00	1	5.24
SIN-MYN-WISST	6431	50	CONTAINER	KAYDALE	20:07:00	20:07:00	00:10:00			NEWCASTLYSKOR						29:09:00	1	7.92
SIN-MYN-WISST	6431	51	CONTAINER	KLIPPOORTJIE	20:12:00	20:12:00	00:05:00			NEWCASTLYSKOR						29:09:00	1	3.27
SIN-MYN-WISST	6431	51	CONTAINER	HEIDELBERGT	20:16:00	20:16:00	00:04:00			NEWCASTLYSKOR						29:09:00	1	2.54
SIN-MYN-WISST	6431	52	CONTAINER	KRAAL	20:25:30	20:25:30	00:09:30			NEWCASTLYSKOR						29:09:00	1	8
SIN-MYN-WISST	6431	52	CONTAINER	SPRUYTSRUS	20:36:30	20:36:30	00:11:00			NEWCASTLYSKOR						29:09:00	1	8.31
SIN-MYN-WISST	6431	52	CONTAINER	FORTUNA	20:47:30	20:47:30	00:11:00			NEWCASTLYSKOR						29:09:00	1	6.76
SIN-MYN-WISST	6431	52	CONTAINER	BALFOURNORTH	20:57:00	20:57:00	00:09:30			NEWCASTLYSKOR						29:09:00	1	7.83
SIN-MYN-WISST	6431	53	CONTAINER	SPRUCEWELL	21:09:00	21:09:00	00:12:00			NEWCASTLYSKOR						29:09:00	1	9.38
SIN-MYN-WISST	6431	53	CONTAINER	GREYLINGSTAD	21:21:00	21:21:00	00:12:00			NEWCASTLYSKOR						29:09:00	1	9.91
SIN-MYN-WISST	6431	54	CONTAINER	TEAKWORTH	21:32:00	21:32:00	00:11:00			NEWCASTLYSKOR						29:09:00	1	9.09
SIN-MYN-WISST	6431	54	CONTAINER	BEYTELPLAATS	21:40:00	21:40:00	00:08:00			NEWCASTLYSKOR						29:09:00	1	11.8`;


/**
 * Sixth extract. Supplies 6431's head and summary, which joins the tail held
 * from the fifth, and adds 2312 complete.
 *
 * The 6431 head plus the 6431 tail is the same node list as 6455, in the same
 * order, over the same distance. Two trains, one route, and a controlled
 * comparison of where the time actually goes.
 */
describe('a sixth extract: two trains, one route', () => {
  const byId = (c: string, id: string) => parseRunningTimes(c).find((t) => t.train === id)!;
  const joined6431 = () => byId(`${B6_6431_HEAD}\n${B5_6431}`, '6431');
  const c6455 = () => byId(B5_6455, '6455');

  /**
   * 6431 departs 21:00 on day 0 and arrives 02:09 on day 2 — 1749 minutes,
   * which is 29h09m and more than a full day. Its modular reading is 309
   * minutes, so this is the second train that cannot be checked on a 24-hour
   * clock and the one that confirms the day-offset repair was not a fix
   * fitted to a single case.
   */
  it('ties 6431 at 29h09 across two midnights', () => {
    const t = joined6431();
    expect(t.throughputRuntime).toBe(1749);
    expect(elapsedMinutes(t)).toBe(1749);
    expect((t.destinationArrival - t.originDeparture + 1440) % 1440).toBe(309);
    expect(validateSchedule(t).throughputTies).toBe(true);
  });

  /**
   * The head ends at BEYTELPLAATS 21:40 and the tail opens at VAL 21:49, nine
   * minutes later, which is exactly the p2p the tail records. Two pastes,
   * three extracts apart, joining on the arithmetic rather than on my word.
   */
  it('joins 6431 head to tail on the section between them', () => {
    const rows = joined6431().rows;
    const i = rows.findIndex((r) => r.station === 'VAL');
    expect(rows[i - 1].station).toBe('BEYTELPLAATS');
    expect(rows[i - 1].departure).toBe(1300); // 21:40
    expect(rows[i].arrival).toBe(1309); // 21:49
    expect(rows[i].pointToPointRuntime).toBe(9);
  });

  /**
   * The central result of the sample so far.
   *
   * 6455 and 6431 visit the same 142 nodes in the same order over the same
   * 1035.85 km. Their running times differ by 6.9 minutes — half a percent
   * over a thousand kilometres. Their standing times differ by 113 minutes.
   * Of the 120 minute gap between them, 94% is standing.
   *
   * This is the second pair to say so, after 8422 and 8426 on a much shorter
   * corridor, and it is the finding that decides where a reconciliation
   * process should look: running time is close to deterministic per section,
   * and the variance lives entirely in standing.
   */
  it('shows 94% of the gap between two trains on one route is standing', () => {
    const a = c6455();
    const b = joined6431();

    expect(a.rows.map((r) => r.station)).toEqual(b.rows.map((r) => r.station));

    const distance = (t: ReturnType<typeof c6455>) =>
      t.rows.reduce((n, r) => n + (r.distanceKm ?? 0), 0);
    expect(distance(a)).toBeCloseTo(distance(b), 2);
    expect(distance(a)).toBeCloseTo(1035.85, 2);

    const running = (t: ReturnType<typeof c6455>) =>
      t.rows.reduce((n, r) => n + (r.pointToPointRuntime ?? 0), 0);
    const standing = (t: ReturnType<typeof c6455>) =>
      t.rows.reduce((n, r) => n + (r.standingTime ?? 0), 0);

    expect(running(a)).toBe(1308);
    expect(running(b)).toBeCloseTo(1314.9, 1);
    expect(standing(a)).toBe(321);
    expect(standing(b)).toBe(434);

    const gap = b.throughputRuntime - a.throughputRuntime;
    expect(gap).toBe(120);
    expect((standing(b) - standing(a)) / gap).toBeGreaterThan(0.9);
    expect(Math.abs(running(b) - running(a)) / running(a)).toBeLessThan(0.01);
  });

  /**
   * 2312 is complete and short: 99.5 minutes running plus 37.5 standing is
   * 137, which is its stated 02:17. It is the first train supplied with a
   * Sched of 2 rather than 1, so a timetable holds more than one schedule.
   */
  it('ties 2312 complete, and records a schedule other than 1', () => {
    const t = byId(B6_2312, '2312');
    const runtime = t.rows.reduce((n, r) => n + (r.pointToPointRuntime ?? 0), 0);
    const standing = t.rows.reduce((n, r) => n + (r.standingTime ?? 0), 0);
    expect(runtime).toBe(99.5);
    expect(standing).toBe(37.5);
    expect(t.throughputRuntime).toBe(137);
    expect(validateSchedule(t).throughputTies).toBe(true);
    expect(validateSchedule(t).elapsedIdentityHolds).toBe(true);
    expect(validateSchedule(t).runtimeMismatches).toEqual([]);
  });

  /**
   * The terminus sentinel is Departure 00:00:00, and 2312 proves the reason
   * code is not what marks it: its terminus carries 'RT', not the 'BO' seen
   * on every other train, while 'BO' also appears mid-journey at Warronton.
   * Neither the reason nor the departure time alone identifies a terminus.
   */
  it('marks the terminus with RT, so the reason does not identify it', () => {
    const terminus = byId(B6_2312, '2312').rows.at(-1)!;
    expect(terminus.station).toBe('POSTMASBURG');
    expect(terminus.departure).toBe(0);
    expect(terminus.standingReason).toBe('RT');
    expect(terminus.standingTime).toBeNull();
  });

  /**
   * A reason with no standing time against it. 6431 records 'X CONTAINER' at
   * DRIERUITERS and 'C' at GAMMAGARA with the standing column empty, and 2312
   * does the same with 'RT' at its terminus. The reason column is not
   * evidence that a stand occurred.
   */
  it('carries standing reasons with no standing time at all', () => {
    const rows = joined6431().rows;
    expect(rows.find((r) => r.station === 'DRIERUITERS')!.standingReason).toBe('X CONTAINER');
    expect(rows.find((r) => r.station === 'DRIERUITERS')!.standingTime).toBeNull();
    expect(rows.find((r) => r.station === 'GAMMAGARA' && r.standingReason === 'C')!.standingTime)
      .toBeNull();
  });

  /**
   * A compound reason: 'SHUNT / WAIT CROSSINGS', 29 minutes at BOKKOPPIE.
   * The vocabulary is free text and now contains a slash joining two causes.
   */
  it('adds a compound standing reason', () => {
    const bok = byId(B6_2312, '2312').rows.find((r) => r.station === 'BOKKOPPIE')!;
    expect(bok.standingReason).toBe('SHUNT / WAIT CROSSINGS');
    expect(bok.standingTime).toBe(29);
  });

  /**
   * Frequency 'AAAAAAA' on 6431, against YYYYYYY on 2312. Two day-of-week
   * codes, so a service is described by more than whether it runs.
   */
  it('adds a second frequency code', () => {
    expect(joined6431().frequency).toBe('AAAAAAA');
    expect(byId(B6_2312, '2312').frequency).toBe('YYYYYYY');
  });

  /**
   * 6431's rows total 1748.9 minutes against a stated 1749 — short by six
   * seconds, and the cause is a single row: TARENTAAL departs at 16:02:06
   * having arrived at 16:02:00, with the standing column blank. Sub-minute
   * standing is dropped by the source, which is why the identity is a defect
   * detector and not just a total.
   */
  it('loses six seconds to an unrecorded stand at TARENTAAL', () => {
    const rows = joined6431().rows;
    const tarentaal = rows.find((r) => r.station === 'TARENTAAL')!;
    expect(tarentaal.arrival).toBe(962); // 16:02:00
    expect(tarentaal.departure).toBeCloseTo(962.1, 6); // 16:02:06
    expect(tarentaal.standingTime).toBeNull();

    const total = rows.reduce(
      (n, r) => n + (r.pointToPointRuntime ?? 0) + (r.standingTime ?? 0),
      0,
    );
    expect(total).toBeCloseTo(1748.9, 1);
    expect(elapsedMinutes(joined6431())).toBe(1749);
  });
});
