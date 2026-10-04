import { describe, it, expect } from 'vitest';
import {
  CORRIDOR_TAXONOMY_NOTE,
  decodeEntities,
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

const B7 = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
UBO-LOKO	113	1	CONTAINER	UBO-LOKO		13:00:00				BAYHEAD	13:00:00	13:15:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:15:00	0	
UBO-LOKO	113	1	NORTH	EMG/S661422	13:00:45	13:00:45	00:00:45			BAYHEAD						00:15:00	0	
UBO-LOKO	113	1	CONTAINER	BYD/S660914	13:01:30	13:01:30	00:00:45			BAYHEAD						00:15:00	0	
UBO-LOKO	113	1	CONTAINER	UBO/S660825	13:02:15	13:02:15	00:00:45			BAYHEAD						00:15:00	0	0.97
UBO-LOKO	113	1	CONTAINER	BYD/S660078	13:03:24	13:03:24	00:01:09			BAYHEAD						00:15:00	0	
UBO-LOKO	113	1	CONTAINER	UBO/S650455	13:04:33	13:04:33	00:01:09			BAYHEAD						00:15:00	0	
UBO-LOKO	113	1	CONTAINER	UBO/S650331	13:05:18	13:05:18	00:00:45			BAYHEAD						00:15:00	0	0.97
UBO-LOKO	113	1	CONTAINER	UBO/S650315	13:06:03	13:06:03	00:00:45			BAYHEAD						00:15:00	0	0.97
UBO-LOKO	113	1	CONTAINER	UBO/S650307	13:06:48	13:06:48	00:00:45			BAYHEAD						00:15:00	0	0.97
UBO-LOKO	113	1	CONTAINER	UBO/S650226	13:07:33	13:07:33	00:00:45			BAYHEAD						00:15:00	0	0.97
UBO-LOKO	113	1	CONTAINER	UBO/S650153	13:08:18	13:08:18	00:00:45			BAYHEAD						00:15:00	0	0.97
UBO-LOKO	113	1	CONTAINER	UBO/S650129	13:09:03	13:09:03	00:00:45			BAYHEAD						00:15:00	0	0.97
UBO-LOKO	113	1	CONTAINER	UBO/S650102	13:09:48	13:09:48	00:00:45			BAYHEAD						00:15:00	0	0.97
UBO-LOKO	113	1	CONTAINER	UMBILO	13:10:33	13:10:33	00:00:45			BAYHEAD						00:15:00	0	0.97
UBO-LOKO	113	2	CONTAINER	ROSSBURGH	13:11:14	13:11:14	00:00:41			BAYHEAD						00:15:00	0	2
UBO-LOKO	113	3	CONTAINER	BAYHEAD	13:15:00	00:00:00	00:03:46		A RT	BAYHEAD						00:15:00	0	3.1
UBO-LOKO	1710	1	CONTAINER	UBO-LOKO		21:15:00				TALANA	21:15:00	10:51:00	2	YYYYYYY	VACUUM TRAINS/LIGHT LOCO-S	13:36:00	0	
UBO-LOKO	1710	1	NORTH	EMG/S661422	21:18:00	21:18:00	00:03:00		B	TALANA						13:36:00	0	
UBO-LOKO	1710	1	CONTAINER	BYD/S660914	21:20:00	21:20:00	00:02:00			TALANA						13:36:00	0	
UBO-LOKO	1710	1	CONTAINER	UBO/S660825	21:22:00	21:22:00	00:02:00			TALANA						13:36:00	0	0.97
UBO-LOKO	1710	1	CONTAINER	BYD/S660078	21:26:00	21:26:00	00:04:00			TALANA						13:36:00	0	
UBO-LOKO	1710	1	CONTAINER	UBO/S650455	21:30:00	21:30:00	00:04:00			TALANA						13:36:00	0	
UBO-LOKO	1710	1	CONTAINER	UBO/S650331	21:32:00	21:32:00	00:02:00			TALANA						13:36:00	0	0.97
UBO-LOKO	1710	1	CONTAINER	UBO/S650315	21:34:00	21:34:00	00:02:00			TALANA						13:36:00	0	0.97
UBO-LOKO	1710	1	CONTAINER	UBO/S650307	21:36:00	21:36:00	00:02:00			TALANA						13:36:00	0	0.97
UBO-LOKO	1710	1	CONTAINER	UBO/S650226	21:38:00	21:38:00	00:02:00			TALANA						13:36:00	0	0.97
UBO-LOKO	1710	1	CONTAINER	UBO/S650153	21:40:00	21:40:00	00:02:00			TALANA						13:36:00	0	0.97
UBO-LOKO	1710	1	CONTAINER	UBO/S650129	21:42:00	21:42:00	00:02:00			TALANA						13:36:00	0	0.97
UBO-LOKO	1710	1	CONTAINER	UBO/S650102	21:44:00	21:44:00	00:02:00			TALANA						13:36:00	0	0.97
UBO-LOKO	1710	1	CONTAINER	UMBILO	21:46:00	21:46:00	00:02:00			TALANA						13:36:00	0	0.97
UBO-LOKO	1710	2	CONTAINER	ROSSBURGH	21:53:00	21:53:00	00:07:00			TALANA						13:36:00	0	2
UBO-LOKO	1710	3	CONTAINER	BOOTH	22:00:00	22:00:00	00:07:00			TALANA						13:36:00	0	2.95
UBO-LOKO	1710	4	CONTAINER	MOUNTVERNON	22:09:30	22:09:30	00:09:30			TALANA						13:36:00	0	1.88
UBO-LOKO	1710	5	CONTAINER	CAVENDISH	22:12:30	22:12:30	00:03:00			TALANA						13:36:00	0	3.12
UBO-LOKO	1710	5	CONTAINER	BURLINGTON	22:19:30	22:19:30	00:07:00			TALANA						13:36:00	0	2.47
UBO-LOKO	1710	5	CONTAINER	SHALLCROSS	22:29:30	22:29:30	00:10:00			TALANA						13:36:00	0	3.12
UBO-LOKO	1710	5	CONTAINER	KLAARWATER	22:34:30	22:34:30	00:05:00			TALANA						13:36:00	0	3.62
UBO-LOKO	1710	5	CONTAINER	MARIANNHILL	22:48:00	22:48:00	00:13:30			TALANA						13:36:00	0	3.66
UBO-LOKO	1710	5	CONTAINER	THORNWOOD	22:55:00	22:55:00	00:07:00			TALANA						13:36:00	0	3.06
UBO-LOKO	1710	5	CONTAINER	SITUNDUHILLS	23:03:00	23:03:00	00:08:00			TALANA						13:36:00	0	3.41
UBO-LOKO	1710	5	CONTAINER	DASSENHOEK	23:05:00	23:05:00	00:02:00			TALANA						13:36:00	0	1.12
UBO-LOKO	1710	5	CONTAINER	KWANDENGEZI	23:12:00	23:12:00	00:07:00			TALANA						13:36:00	0	2.29
UBO-LOKO	1710	5	CONTAINER	DELVILLEWOOD	23:22:30	23:22:30	00:10:30			TALANA						13:36:00	0	7.12
UBO-LOKO	1710	5	CONTAINER	NSHONGWENI	23:29:00	23:29:00	00:06:30			TALANA						13:36:00	0	0.93
UBO-LOKO	1710	5	CONTAINER	CLIFFDALE	23:42:00	23:42:00	00:13:00			TALANA						13:36:00	0	6.08
UBO-LOKO	1710	6	CONTAINER	HAMMARSDALE	23:55:00	00:00:00	00:13:00	00:05:00	F 8946	TALANA						13:36:00	0	6
UBO-LOKO	1710	7	CONTAINER	KWATANDAZA	00:10:00	00:10:00	00:10:00			TALANA						13:36:00	1	4.08
UBO-LOKO	1710	7	CONTAINER	GEORGEDALE	00:13:00	00:13:00	00:03:00			TALANA						13:36:00	1	2.18
UBO-LOKO	1710	7	CONTAINER	CATORIDGE	00:26:00	00:26:00	00:13:00			TALANA						13:36:00	1	7.24
UBO-LOKO	1710	8	CONTAINER	CAMPERDOWN	00:31:30	00:31:30	00:05:30			TALANA						13:36:00	1	4.95
UBO-LOKO	1710	8	CONTAINER	UMLAASROAD	00:40:30	00:40:30	00:09:00			TALANA						13:36:00	1	3.77
UBO-LOKO	1710	9	CONTAINER	ASHBURTON	00:56:00	00:56:00	00:15:30			TALANA						13:36:00	1	10.56
UBO-LOKO	1710	9	CONTAINER	PENTRICH	01:12:00	01:12:00	00:16:00			TALANA						13:36:00	1	10.11
UBO-LOKO	1710	10	CONTAINER	NAPIER (N)	01:15:30	01:15:30	00:03:30			TALANA						13:36:00	1	2.35
UBO-LOKO	1710	11	CONTAINER	PIETERMARITZB	01:27:30	01:27:30	00:12:00			TALANA						13:36:00	1	2.91
UBO-LOKO	1710	12	CONTAINER	BOUGHTON	01:43:30	01:43:30	00:16:00			TALANA						13:36:00	1	6.49
UBO-LOKO	1710	12	CONTAINER	CEDARA(N)	02:04:00	02:04:00	00:20:30			TALANA						13:36:00	1	13.8
UBO-LOKO	1710	13	CONTAINER	MERRIVALE	02:13:30	02:13:30	00:09:30			TALANA						13:36:00	1	3.7
UBO-LOKO	1710	14	CONTAINER	TWEEDIE	02:23:00	02:23:00	00:09:30			TALANA						13:36:00	1	7.71
UBO-LOKO	1710	14	CONTAINER	LIONSRIVER	02:32:00	02:32:00	00:09:00			TALANA						13:36:00	1	4.5
UBO-LOKO	1710	14	CONTAINER	DARGLE	02:40:30	02:40:30	00:08:30			TALANA						13:36:00	1	6.15
UBO-LOKO	1710	15	CONTAINER	LIDGETTON	02:51:00	02:51:00	00:10:30			TALANA						13:36:00	1	3.87
UBO-LOKO	1710	16	CONTAINER	BALGOWAN	03:04:30	03:04:30	00:13:30			TALANA						13:36:00	1	7.83
UBO-LOKO	1710	17	CONTAINER	NOTTINGHAMROA	03:22:30	03:22:30	00:18:00			TALANA						13:36:00	1	11.35
UBO-LOKO	1710	18	CONTAINER	ROSETTA	03:29:30	03:29:30	00:07:00			TALANA						13:36:00	1	6.36
UBO-LOKO	1710	18	CONTAINER	MOOIRIVIER	03:46:30	03:46:30	00:17:00			TALANA						13:36:00	1	10.94
UBO-LOKO	1710	19	CONTAINER	HIDCOTE	03:55:00	03:55:00	00:08:30			TALANA						13:36:00	1	6.71
UBO-LOKO	1710	19	CONTAINER	LOWLANDS	04:11:30	04:11:30	00:16:30			TALANA						13:36:00	1	9.5
UBO-LOKO	1710	19	CONTAINER	BEACONHILL	04:22:30	04:22:30	00:11:00			TALANA						13:36:00	1	5.79
UBO-LOKO	1710	19	CONTAINER	ESTCOURT	04:40:00	04:40:00	00:17:30			TALANA						13:36:00	1	10.32
UBO-LOKO	1710	20	CONTAINER	ENNERSDALE	04:51:00	04:51:00	00:11:00			TALANA						13:36:00	1	10.17
UBO-LOKO	1710	21	CONTAINER	FRERE	05:07:30	05:07:30	00:16:30			TALANA						13:36:00	1	11.19
UBO-LOKO	1710	21	CONTAINER	CHIEVELEY	05:16:30	05:16:30	00:09:00			TALANA						13:36:00	1	8.47
UBO-LOKO	1710	21	CONTAINER	COLENSO	05:32:30	05:32:30	00:16:00			TALANA						13:36:00	1	10.98
UBO-LOKO	1710	21	CONTAINER	PIETERS	05:43:30	05:43:30	00:11:00			TALANA						13:36:00	1	9.88
UBO-LOKO	1710	22	CONTAINER	UMBULWANA	05:54:00	05:54:00	00:10:30			TALANA						13:36:00	1	6.67
UBO-LOKO	1710	22	CONTAINER	DSL-LADYSMITH(N)	06:05:00	06:05:00	00:11:00			TALANA						13:36:00	1	7.05
UBO-LOKO	1710	23	CONTAINER	DANSKRAAL	06:12:00	08:30:00	00:07:00	02:18:00	SHUNT	TALANA						13:36:00	1	1.63
UBO-LOKO	1710	24	CONTAINER	PEPWORTH	08:50:00	08:50:00	00:20:00			TALANA						13:36:00	1	12.57
UBO-LOKO	1710	24	CONTAINER	ELANDSLAAGTE	09:03:00	09:03:00	00:13:00			TALANA						13:36:00	1	10.41
UBO-LOKO	1710	25	CONTAINER	WESSELSNEK	09:18:00	09:18:00	00:15:00			TALANA						13:36:00	1	12.67
UBO-LOKO	1710	25	CONTAINER	WASBANK	09:28:00	09:28:00	00:10:00			TALANA						13:36:00	1	7.5
UBO-LOKO	1710	25	CONTAINER	UITHOEK	09:39:00	09:39:00	00:11:00			TALANA						13:36:00	1	8.56
UBO-LOKO	1710	25	NORTH	GLENCOE	09:59:00	09:59:00	00:20:00			TALANA						13:36:00	1	10.68
UBO-LOKO	1710	26	NORTH	DUNDEE	10:18:00	10:18:00	00:19:00			TALANA						13:36:00	1	8.49
UBO-LOKO	1710	27	NORTH	TALANA	10:26:00	10:27:00	00:08:00	00:01:00	SHUNT	TALANA						13:36:00	1	2.87
UBO-LOKO	1710	28	NORTH	TLN/S645753	10:28:00	10:29:00	00:01:00	00:01:00	SHUNT	TALANA						13:36:00	1	0.97
UBO-LOKO	1710	28	NORTH	TLN/S645761	10:30:00	10:31:00	00:01:00	00:01:00	SHUNT	TALANA						13:36:00	1	0.97
UBO-LOKO	1710	28	NORTH	TLN/S645796	10:32:00	10:33:00	00:01:00	00:01:00	SHUNT	TALANA						13:36:00	1	0.97
UBO-LOKO	1710	28	NORTH	TLN/S645818	10:34:00	10:35:00	00:01:00	00:01:00	SHUNT	TALANA						13:36:00	1	0.97
UBO-LOKO	1710	28	NORTH	TLN/S652679	10:36:00	10:37:00	00:01:00	00:01:00	SHUNT	TALANA						13:36:00	1	0.97
UBO-LOKO	1710	29	NORTH	TLN/S645818	10:38:00	10:39:00	00:01:00	00:01:00	SHUNT	TALANA						13:36:00	1	0.97
UBO-LOKO	1710	29	NORTH	TLN/S645796	10:40:00	10:41:00	00:01:00	00:01:00	SHUNT	TALANA						13:36:00	1	0.97
UBO-LOKO	1710	29	NORTH	TLN/S645761	10:42:00	10:43:00	00:01:00	00:01:00	SHUNT	TALANA						13:36:00	1	0.97
UBO-LOKO	1710	29	NORTH	TLN/S645753	10:44:00	10:45:00	00:01:00	00:01:00	SHUNT	TALANA						13:36:00	1	0.97
UBO-LOKO	1710	29	NORTH	TALANA	10:51:00	00:00:00	00:06:00		RT	TALANA						13:36:00	1	0.97
UBO-LOKO	6614	1	CONTAINER	UBO-LOKO		14:05:00				CATORIDGE	14:05:00	15:58:00	1	YYYYYYY	VACUUM TRAINS/LIGHT LOCO-S	01:53:00	0	
UBO-LOKO	6614	1	NORTH	EMG/S661422	14:05:30	14:05:30	00:00:30		C	CATORIDGE						01:53:00	0	
UBO-LOKO	6614	1	CONTAINER	BYD/S660914	14:06:00	14:06:00	00:00:30			CATORIDGE						01:53:00	0	
UBO-LOKO	6614	1	CONTAINER	UBO/S660825	14:06:30	14:06:30	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6614	1	CONTAINER	BYD/S660078	14:07:30	14:07:30	00:01:00			CATORIDGE						01:53:00	0	
UBO-LOKO	6614	1	CONTAINER	UBO/S650455	14:08:30	14:08:30	00:01:00			CATORIDGE						01:53:00	0	
UBO-LOKO	6614	1	CONTAINER	UBO/S650331	14:09:00	14:09:00	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6614	1	CONTAINER	UBO/S650315	14:09:30	14:09:30	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6614	1	CONTAINER	UBO/S650307	14:10:00	14:10:00	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6614	1	CONTAINER	UBO/S650226	14:10:30	14:10:30	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6614	1	CONTAINER	UBO/S650153	14:11:00	14:11:00	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6614	1	CONTAINER	UBO/S650129	14:11:30	14:11:30	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6614	1	CONTAINER	UBO/S650102	14:12:00	14:12:00	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6614	1	CONTAINER	UMBILO	14:12:30	14:12:30	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6614	2	CONTAINER	ROSSBURGH	14:14:00	14:14:00	00:01:30			CATORIDGE						01:53:00	0	2
UBO-LOKO	6614	3	CONTAINER	BOOTH	14:21:00	14:21:00	00:07:00			CATORIDGE						01:53:00	0	2.95
UBO-LOKO	6614	4	CONTAINER	MOUNTVERNON	14:26:30	14:26:30	00:05:30			CATORIDGE						01:53:00	0	1.88
UBO-LOKO	6614	5	CONTAINER	CAVENDISH	14:29:30	14:29:30	00:03:00			CATORIDGE						01:53:00	0	3.12
UBO-LOKO	6614	5	CONTAINER	BURLINGTON	14:32:30	14:32:30	00:03:00			CATORIDGE						01:53:00	0	2.47
UBO-LOKO	6614	5	CONTAINER	SHALLCROSS	14:38:30	14:38:30	00:06:00			CATORIDGE						01:53:00	0	3.12
UBO-LOKO	6614	5	CONTAINER	KLAARWATER	14:43:30	14:43:30	00:05:00			CATORIDGE						01:53:00	0	3.62
UBO-LOKO	6614	5	CONTAINER	MARIANNHILL	14:53:00	14:53:00	00:09:30			CATORIDGE						01:53:00	0	3.66
UBO-LOKO	6614	5	CONTAINER	THORNWOOD	15:00:00	15:00:00	00:07:00			CATORIDGE						01:53:00	0	3.06
UBO-LOKO	6614	5	CONTAINER	SITUNDUHILLS	15:04:00	15:04:00	00:04:00			CATORIDGE						01:53:00	0	3.41
UBO-LOKO	6614	5	CONTAINER	DASSENHOEK	15:06:00	15:06:00	00:02:00			CATORIDGE						01:53:00	0	1.12
UBO-LOKO	6614	5	CONTAINER	KWANDENGEZI	15:09:00	15:09:00	00:03:00			CATORIDGE						01:53:00	0	2.29
UBO-LOKO	6614	5	CONTAINER	DELVILLEWOOD	15:15:30	15:15:30	00:06:30			CATORIDGE						01:53:00	0	7.12
UBO-LOKO	6614	5	CONTAINER	NSHONGWENI	15:22:00	15:22:00	00:06:30			CATORIDGE						01:53:00	0	0.93
UBO-LOKO	6614	5	CONTAINER	CLIFFDALE	15:31:00	15:31:00	00:09:00			CATORIDGE						01:53:00	0	6.08
UBO-LOKO	6614	6	CONTAINER	HAMMARSDALE	15:40:00	15:40:00	00:09:00			CATORIDGE						01:53:00	0	6
UBO-LOKO	6614	7	CONTAINER	KWATANDAZA	15:46:00	15:46:00	00:06:00			CATORIDGE						01:53:00	0	4.08
UBO-LOKO	6614	7	CONTAINER	GEORGEDALE	15:49:00	15:49:00	00:03:00			CATORIDGE						01:53:00	0	2.18
UBO-LOKO	6614	7	CONTAINER	CATORIDGE	15:58:00	00:00:00	00:09:00		LN8814	CATORIDGE						01:53:00	0	7.24
UBO-LOKO	6616	1	CONTAINER	UBO-LOKO		06:54:00				CATORIDGE	06:54:00	08:47:00	1	YYYYYYY	VACUUM TRAINS/LIGHT LOCO-S	01:53:00	0	
UBO-LOKO	6616	1	NORTH	EMG/S661422	06:54:30	06:54:30	00:00:30		C	CATORIDGE						01:53:00	0	
UBO-LOKO	6616	1	CONTAINER	BYD/S660914	06:55:00	06:55:00	00:00:30			CATORIDGE						01:53:00	0	
UBO-LOKO	6616	1	CONTAINER	UBO/S660825	06:55:30	06:55:30	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6616	1	CONTAINER	BYD/S660078	06:56:30	06:56:30	00:01:00			CATORIDGE						01:53:00	0	
UBO-LOKO	6616	1	CONTAINER	UBO/S650455	06:57:30	06:57:30	00:01:00			CATORIDGE						01:53:00	0	
UBO-LOKO	6616	1	CONTAINER	UBO/S650331	06:58:00	06:58:00	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6616	1	CONTAINER	UBO/S650315	06:58:30	06:58:30	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6616	1	CONTAINER	UBO/S650307	06:59:00	06:59:00	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6616	1	CONTAINER	UBO/S650226	06:59:30	06:59:30	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6616	1	CONTAINER	UBO/S650153	07:00:00	07:00:00	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6616	1	CONTAINER	UBO/S650129	07:00:30	07:00:30	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6616	1	CONTAINER	UBO/S650102	07:01:00	07:01:00	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6616	1	CONTAINER	UMBILO	07:01:30	07:01:30	00:00:30			CATORIDGE						01:53:00	0	0.97
UBO-LOKO	6616	2	CONTAINER	ROSSBURGH	07:03:00	07:03:00	00:01:30			CATORIDGE						01:53:00	0	2
UBO-LOKO	6616	3	CONTAINER	BOOTH	07:10:00	07:10:00	00:07:00			CATORIDGE						01:53:00	0	2.95
UBO-LOKO	6616	4	CONTAINER	MOUNTVERNON	07:15:30	07:15:30	00:05:30			CATORIDGE						01:53:00	0	1.88
UBO-LOKO	6616	5	CONTAINER	CAVENDISH	07:18:30	07:18:30	00:03:00			CATORIDGE						01:53:00	0	3.12
UBO-LOKO	6616	5	CONTAINER	BURLINGTON	07:21:30	07:21:30	00:03:00			CATORIDGE						01:53:00	0	2.47
UBO-LOKO	6616	5	CONTAINER	SHALLCROSS	07:27:30	07:27:30	00:06:00			CATORIDGE						01:53:00	0	3.12
UBO-LOKO	6616	5	CONTAINER	KLAARWATER	07:32:30	07:32:30	00:05:00			CATORIDGE						01:53:00	0	3.62
UBO-LOKO	6616	5	CONTAINER	MARIANNHILL	07:42:00	07:42:00	00:09:30			CATORIDGE						01:53:00	0	3.66
UBO-LOKO	6616	5	CONTAINER	THORNWOOD	07:49:00	07:49:00	00:07:00			CATORIDGE						01:53:00	0	3.06
UBO-LOKO	6616	5	CONTAINER	SITUNDUHILLS	07:53:00	07:53:00	00:04:00			CATORIDGE						01:53:00	0	3.41
UBO-LOKO	6616	5	CONTAINER	DASSENHOEK	07:55:00	07:55:00	00:02:00			CATORIDGE						01:53:00	0	1.12
UBO-LOKO	6616	5	CONTAINER	KWANDENGEZI	07:58:00	07:58:00	00:03:00			CATORIDGE						01:53:00	0	2.29
UBO-LOKO	6616	5	CONTAINER	DELVILLEWOOD	08:04:30	08:04:30	00:06:30			CATORIDGE						01:53:00	0	7.12
UBO-LOKO	6616	5	CONTAINER	NSHONGWENI	08:11:00	08:11:00	00:06:30			CATORIDGE						01:53:00	0	0.93
UBO-LOKO	6616	5	CONTAINER	CLIFFDALE	08:20:00	08:20:00	00:09:00			CATORIDGE						01:53:00	0	6.08
UBO-LOKO	6616	6	CONTAINER	HAMMARSDALE	08:29:00	08:29:00	00:09:00			CATORIDGE						01:53:00	0	6
UBO-LOKO	6616	7	CONTAINER	KWATANDAZA	08:35:00	08:35:00	00:06:00			CATORIDGE						01:53:00	0	4.08
UBO-LOKO	6616	7	CONTAINER	GEORGEDALE	08:38:00	08:38:00	00:03:00			CATORIDGE						01:53:00	0	2.18
UBO-LOKO	6616	7	CONTAINER	CATORIDGE	08:47:00	00:00:00	00:09:00		LN8816	CATORIDGE						01:53:00	0	7.24
UBO-LOKO	8038	1	CONTAINER	UBO-LOKO		11:44:00				CATORIDGE	11:44:00	13:37:00	1	YYYYYYY	VACUUM TRAINS/LIGHT LOCO-S	01:53:00	0	
UBO-LOKO	8038	1	NORTH	EMG/S661422	11:44:00	11:44:00			B	CATORIDGE						01:53:00	0	
UBO-LOKO	8038	1	CONTAINER	BYD/S660914	11:44:00	11:44:00				CATORIDGE						01:53:00	0	
UBO-LOKO	8038	1	CONTAINER	UBO/S660825	11:44:00	11:44:00				CATORIDGE						01:53:00	0	0.97
UBO-LOKO	8038	1	CONTAINER	BYD/S660078	11:44:00	11:44:00				CATORIDGE						01:53:00	0	
UBO-LOKO	8038	1	CONTAINER	UBO/S650455	11:44:00	11:44:00				CATORIDGE						01:53:00	0	
UBO-LOKO	8038	1	CONTAINER	UBO/S650331	11:44:00	11:44:00				CATORIDGE						01:53:00	0	0.97
UBO-LOKO	8038	1	CONTAINER	UBO/S650315	11:44:00	11:44:00				CATORIDGE						01:53:00	0	0.97
UBO-LOKO	8038	1	CONTAINER	UBO/S650307	11:44:00	11:44:00				CATORIDGE						01:53:00	0	0.97
UBO-LOKO	8038	1	CONTAINER	UBO/S650226	11:44:00	11:44:00				CATORIDGE						01:53:00	0	0.97
UBO-LOKO	8038	1	CONTAINER	UBO/S650153	11:44:00	11:44:00				CATORIDGE						01:53:00	0	0.97
UBO-LOKO	8038	1	CONTAINER	UBO/S650129	11:44:00	11:44:00				CATORIDGE						01:53:00	0	0.97
UBO-LOKO	8038	1	CONTAINER	UBO/S650102	11:44:00	11:44:00				CATORIDGE						01:53:00	0	0.97
UBO-LOKO	8038	1	CONTAINER	UMBILO	11:44:00	11:44:00				CATORIDGE						01:53:00	0	0.97
UBO-LOKO	8038	2	CONTAINER	ROSSBURGH	11:53:00	11:53:00	00:09:00			CATORIDGE						01:53:00	0	2
UBO-LOKO	8038	3	CONTAINER	BOOTH	12:00:00	12:00:00	00:07:00			CATORIDGE						01:53:00	0	2.95
UBO-LOKO	8038	4	CONTAINER	MOUNTVERNON	12:05:30	12:05:30	00:05:30			CATORIDGE						01:53:00	0	1.88
UBO-LOKO	8038	5	CONTAINER	CAVENDISH	12:08:30	12:08:30	00:03:00			CATORIDGE						01:53:00	0	3.12
UBO-LOKO	8038	5	CONTAINER	BURLINGTON	12:11:30	12:11:30	00:03:00			CATORIDGE						01:53:00	0	2.47
UBO-LOKO	8038	5	CONTAINER	SHALLCROSS	12:17:30	12:17:30	00:06:00			CATORIDGE						01:53:00	0	3.12
UBO-LOKO	8038	5	CONTAINER	KLAARWATER	12:22:30	12:22:30	00:05:00			CATORIDGE						01:53:00	0	3.62
UBO-LOKO	8038	5	CONTAINER	MARIANNHILL	12:32:00	12:32:00	00:09:30			CATORIDGE						01:53:00	0	3.66
UBO-LOKO	8038	5	CONTAINER	THORNWOOD	12:39:00	12:39:00	00:07:00			CATORIDGE						01:53:00	0	3.06
UBO-LOKO	8038	5	CONTAINER	SITUNDUHILLS	12:43:00	12:43:00	00:04:00			CATORIDGE						01:53:00	0	3.41
UBO-LOKO	8038	5	CONTAINER	DASSENHOEK	12:45:00	12:45:00	00:02:00			CATORIDGE						01:53:00	0	1.12
UBO-LOKO	8038	5	CONTAINER	KWANDENGEZI	12:48:00	12:48:00	00:03:00			CATORIDGE						01:53:00	0	2.29
UBO-LOKO	8038	5	CONTAINER	DELVILLEWOOD	12:54:30	12:54:30	00:06:30			CATORIDGE						01:53:00	0	7.12
UBO-LOKO	8038	5	CONTAINER	NSHONGWENI	13:01:00	13:01:00	00:06:30			CATORIDGE						01:53:00	0	0.93
UBO-LOKO	8038	5	CONTAINER	CLIFFDALE	13:10:00	13:10:00	00:09:00			CATORIDGE						01:53:00	0	6.08
UBO-LOKO	8038	6	CONTAINER	HAMMARSDALE	13:19:00	13:19:00	00:09:00			CATORIDGE						01:53:00	0	6
UBO-LOKO	8038	7	CONTAINER	KWATANDAZA	13:25:00	13:25:00	00:06:00			CATORIDGE						01:53:00	0	4.08
UBO-LOKO	8038	7	CONTAINER	GEORGEDALE	13:28:00	13:28:00	00:03:00			CATORIDGE						01:53:00	0	2.18
UBO-LOKO	8038	7	CONTAINER	CATORIDGE	13:37:00	00:00:00	00:09:00		RT	CATORIDGE						01:53:00	0	7.24
UBO-LOKO	8040	1	CONTAINER	UBO-LOKO		20:55:00				ISIPINGO	20:55:00	21:24:00	2	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	00:29:00	0	
UBO-LOKO	8040	1	NORTH	EMG/S661422	20:55:00	20:55:00			B	ISIPINGO						00:29:00	0	
UBO-LOKO	8040	1	CONTAINER	BYD/S660914	20:55:00	20:55:00				ISIPINGO						00:29:00	0	
UBO-LOKO	8040	1	CONTAINER	UBO/S660825	20:55:00	20:55:00				ISIPINGO						00:29:00	0	0.97
UBO-LOKO	8040	1	CONTAINER	BYD/S660078	20:55:00	20:55:00				ISIPINGO						00:29:00	0	
UBO-LOKO	8040	1	CONTAINER	UBO/S650455	20:55:00	20:55:00				ISIPINGO						00:29:00	0	
UBO-LOKO	8040	1	CONTAINER	UBO/S650331	20:55:00	20:55:00				ISIPINGO						00:29:00	0	0.97
UBO-LOKO	8040	1	CONTAINER	UBO/S650315	20:55:00	20:55:00				ISIPINGO						00:29:00	0	0.97
UBO-LOKO	8040	1	CONTAINER	UBO/S650307	20:55:00	20:55:00				ISIPINGO						00:29:00	0	0.97
UBO-LOKO	8040	1	CONTAINER	UBO/S650226	20:55:00	20:55:00				ISIPINGO						00:29:00	0	0.97
UBO-LOKO	8040	1	CONTAINER	UBO/S650153	20:55:00	20:55:00				ISIPINGO						00:29:00	0	0.97
UBO-LOKO	8040	1	CONTAINER	UBO/S650129	20:55:00	20:55:00				ISIPINGO						00:29:00	0	0.97
UBO-LOKO	8040	1	CONTAINER	UBO/S650102	20:55:00	20:55:00				ISIPINGO						00:29:00	0	0.97
UBO-LOKO	8040	1	CONTAINER	UMBILO	20:55:00	20:55:00				ISIPINGO						00:29:00	0	0.97
UBO-LOKO	8040	2	CONTAINER	ROSSBURGH	21:07:00	21:07:00	00:12:00			ISIPINGO						00:29:00	0	2
UBO-LOKO	8040	3	CONTAINER	CLAIRWOOD	21:10:00	21:10:00	00:03:00			ISIPINGO						00:29:00	0	1.73
UBO-LOKO	8040	4	CONTAINER	MONTCLAIR	21:13:00	21:13:00	00:03:00			ISIPINGO						00:29:00	0	3.33
UBO-LOKO	8040	5	CONTAINER	RACECOURSE	21:15:00	21:15:00	00:02:00			ISIPINGO						00:29:00	0	2
UBO-LOKO	8040	6	CONTAINER	MEREBANK	21:17:00	21:17:00	00:02:00			ISIPINGO						00:29:00	0	0.59
UBO-LOKO	8040	7	CONTAINER	REUNION	21:20:00	21:20:00	00:03:00			ISIPINGO						00:29:00	0	2.68
UBO-LOKO	8040	8	CONTAINER	PELGRIM	21:23:00	21:23:00	00:03:00			ISIPINGO						00:29:00	0	1.36
UBO-LOKO	8040	8	CONTAINER	ISIPINGO	21:24:00	00:00:00	00:01:00		RT	ISIPINGO						00:29:00	0	1.27
WWH-LOKO	8000	1	NORTH	WWH-LOKO		23:00:00				UKS/S650579	23:00:00	00:03:00	3	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	01:03:00	0	
WWH-LOKO	8000	1	CONTAINER	WENTWORTHPARK	23:01:01	23:01:01	00:01:01			UKS/S650579						01:03:00	0	3.1
WWH-LOKO	8000	1	CONTAINER	JACOBS	23:03:30	23:03:30	00:02:29		C	UKS/S650579						01:03:00	0	1.25
WWH-LOKO	8000	2	CONTAINER	MONTCLAIR	23:09:00	23:09:00	00:05:30			UKS/S650579						01:03:00	0	1.97
WWH-LOKO	8000	3	CONTAINER	RACECOURSE	23:10:00	23:10:00	00:01:00			UKS/S650579						01:03:00	0	2
WWH-LOKO	8000	4	CONTAINER	MEREBANK	23:12:00	23:12:00	00:02:00			UKS/S650579						01:03:00	0	0.59
WWH-LOKO	8000	5	CONTAINER	REUNION	23:16:30	23:16:30	00:04:30			UKS/S650579						01:03:00	0	2.68
WWH-LOKO	8000	6	CONTAINER	PELGRIM	23:18:30	23:18:30	00:02:00			UKS/S650579						01:03:00	0	1.36
WWH-LOKO	8000	6	CONTAINER	ISIPINGO	23:20:30	23:20:30	00:02:00			UKS/S650579						01:03:00	0	1.27
WWH-LOKO	8000	7	CONTAINER	UMBOGINTWINI	23:28:00	23:28:00	00:07:30			UKS/S650579						01:03:00	0	5.11
WWH-LOKO	8000	8	CONTAINER	PAHLA	23:34:30	23:34:30	00:06:30			UKS/S650579						01:03:00	0	2.75
WWH-LOKO	8000	8	CONTAINER	AMANZIMTOTI	23:37:00	23:37:00	00:02:30			UKS/S650579						01:03:00	0	1.85
WWH-LOKO	8000	8	CONTAINER	DOONSIDE	23:39:00	23:39:00	00:02:00			UKS/S650579						01:03:00	0	1.9
WWH-LOKO	8000	8	CONTAINER	WARNERBEACH	23:40:30	23:40:30	00:01:30			UKS/S650579						01:03:00	0	1.51
WWH-LOKO	8000	8	CONTAINER	WINKLESPRUIT	23:43:00	23:43:00	00:02:30			UKS/S650579						01:03:00	0	2.02
WWH-LOKO	8000	9	CONTAINER	ILLOVOBEACH	23:46:00	23:46:00	00:03:00			UKS/S650579						01:03:00	0	2.25
WWH-LOKO	8000	9	CONTAINER	KARRIDENE	23:47:30	23:47:30	00:01:30			UKS/S650579						01:03:00	0	1.07
WWH-LOKO	8000	9	CONTAINER	UMGABABA	23:51:00	23:51:00	00:03:30			UKS/S650579						01:03:00	0	2.5
WWH-LOKO	8000	9	CONTAINER	ILFRACOMBE	23:57:30	23:57:30	00:06:30			UKS/S650579						01:03:00	0	5.33
WWH-LOKO	8000	9	CONTAINER	UMKOMAAS	00:00:00	00:00:00	00:02:30			UKS/S650579						01:03:00	1	1.57
WWH-LOKO	8000	10	CONTAINER	UKS/S661589	00:01:00	00:02:00	00:01:00	00:01:00	SHUNT	UKS/S650579						01:03:00	1	0.97
WWH-LOKO	8000	10	CONTAINER	UKS/S650579	00:03:00	00:00:00	00:01:00		RT	UKS/S650579						01:03:00	1	0.97
WWH-LOKO	8002	1	NORTH	WWH-LOKO		09:55:00				UKS/S650579	09:55:00	11:05:00	3	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	01:10:00	0	
WWH-LOKO	8002	1	CONTAINER	WENTWORTHPARK	09:56:01	09:56:01	00:01:01			UKS/S650579						01:10:00	0	3.1
WWH-LOKO	8002	1	CONTAINER	JACOBS	09:58:30	09:58:30	00:02:29		C	UKS/S650579						01:10:00	0	1.25
WWH-LOKO	8002	2	CONTAINER	MONTCLAIR	10:04:00	10:04:00	00:05:30			UKS/S650579						01:10:00	0	1.97
WWH-LOKO	8002	3	CONTAINER	RACECOURSE	10:05:00	10:05:00	00:01:00			UKS/S650579						01:10:00	0	2
WWH-LOKO	8002	4	CONTAINER	MEREBANK	10:07:00	10:07:00	00:02:00			UKS/S650579						01:10:00	0	0.59
WWH-LOKO	8002	5	CONTAINER	REUNION	10:11:30	10:11:30	00:04:30			UKS/S650579						01:10:00	0	2.68
WWH-LOKO	8002	6	CONTAINER	PELGRIM	10:13:30	10:13:30	00:02:00			UKS/S650579						01:10:00	0	1.36
WWH-LOKO	8002	6	CONTAINER	ISIPINGO	10:15:30	10:15:30	00:02:00			UKS/S650579						01:10:00	0	1.27
WWH-LOKO	8002	7	CONTAINER	UMBOGINTWINI	10:23:00	10:23:00	00:07:30			UKS/S650579						01:10:00	0	5.11
WWH-LOKO	8002	8	CONTAINER	PAHLA	10:29:30	10:29:30	00:06:30			UKS/S650579						01:10:00	0	2.75
WWH-LOKO	8002	8	CONTAINER	AMANZIMTOTI	10:32:00	10:32:00	00:02:30			UKS/S650579						01:10:00	0	1.85
WWH-LOKO	8002	8	CONTAINER	DOONSIDE	10:34:00	10:34:00	00:02:00			UKS/S650579						01:10:00	0	1.9
WWH-LOKO	8002	8	CONTAINER	WARNERBEACH	10:36:00	10:42:00	00:02:00	00:06:00	X 0749	UKS/S650579						01:10:00	0	1.51
WWH-LOKO	8002	8	CONTAINER	WINKLESPRUIT	10:46:30	10:46:30	00:04:30			UKS/S650579						01:10:00	0	2.02
WWH-LOKO	8002	9	CONTAINER	ILLOVOBEACH	10:49:30	10:49:30	00:03:00		X 1843	UKS/S650579						01:10:00	0	2.25
WWH-LOKO	8002	9	CONTAINER	KARRIDENE	10:51:00	10:51:00	00:01:30			UKS/S650579						01:10:00	0	1.07
WWH-LOKO	8002	9	CONTAINER	UMGABABA	10:54:30	10:54:30	00:03:30			UKS/S650579						01:10:00	0	2.5
WWH-LOKO	8002	9	CONTAINER	ILFRACOMBE	11:01:00	11:01:00	00:06:30			UKS/S650579						01:10:00	0	5.33
WWH-LOKO	8002	9	CONTAINER	UMKOMAAS	11:03:30	11:03:30	00:02:30			UKS/S650579						01:10:00	0	1.57
WWH-LOKO	8002	10	CONTAINER	UKS/S661589	11:04:00	11:04:30	00:00:30	00:00:30	SHUNT	UKS/S650579						01:10:00	0	0.97
WWH-LOKO	8002	10	CONTAINER	UKS/S650579	11:05:00	00:00:00	00:00:30		RT	UKS/S650579						01:10:00	0	0.97`;

/**
 * Seventh extract, and a different network: the Umbilo and Wentworth depots
 * around Durban, on the CONTAINER and NORTH corridors. Eight trains, all
 * complete, all of them short.
 *
 * Every train in it ties on both measures — elapsed against the stated
 * throughput, and sum(runtime) + sum(standing) against the same figure. Eight
 * for eight is the parser's cleanest result so far, and it arrived alongside
 * the one case in this sample that broke it.
 */
describe('a seventh extract: a second network, and midnight', () => {
  const byId = (id: string) => parseRunningTimes(B7).find((t) => t.train === id)!;

  it('ties all eight trains, on both measures', () => {
    for (const t of parseRunningTimes(B7)) {
      const v = validateSchedule(t);
      expect([t.train, v.throughputTies]).toEqual([t.train, true]);
      expect([t.train, v.elapsedIdentityHolds]).toEqual([t.train, true]);
      expect([t.train, v.runtimeMismatches]).toEqual([t.train, []]);
      expect([t.train, v.standingMismatches]).toEqual([t.train, []]);
    }
  });

  /**
   * 6614, 6616 and 8038 are the same timetable pattern run three times a day
   * — 06:54, 11:44 and 14:05 — over the same 32 nodes and the same 75.06 km,
   * with the same stated throughput of 01:53. From BOOTH onward every
   * point-to-point value is identical across all three.
   */
  it('runs one timetable three times a day, identically', () => {
    const [a, b, c] = ['6614', '6616', '8038'].map(byId);
    for (const t of [a, b, c]) {
      expect(t.throughputRuntime).toBe(113);
      expect(t.destination).toBe('CATORIDGE');
    }
    expect(a.rows.map((r) => r.station)).toEqual(b.rows.map((r) => r.station));
    expect(a.rows.map((r) => r.station)).toEqual(c.rows.map((r) => r.station));

    // From BOOTH onward, since 8038 records nothing at all before it.
    const fromBooth = (t: ReturnType<typeof byId>) => {
      const i = t.rows.findIndex((r) => r.station === 'BOOTH');
      return t.rows.slice(i).map((r) => [r.station, r.pointToPointRuntime]);
    };
    expect(fromBooth(a)).toEqual(fromBooth(b));
    expect(fromBooth(a)).toEqual(fromBooth(c));
  });

  /**
   * Where they are not identical is the yard. 6614 and 6616 record a runtime
   * on each of thirteen depot movements; 8038 records none of them and carries
   * 9 minutes into ROSSBURGH where the other two carry 1:30. The totals still
   * agree, so the same journey is distributed two different ways and any
   * per-section analysis has to know that.
   */
  it('distributes the same yard movement two different ways', () => {
    const head = (id: string) =>
      byId(id).rows.filter((r) => r.nodeSeq === 1 && r.pointToPointRuntime == null).length;
    expect(head('6614')).toBe(0);
    expect(head('8038')).toBe(13);

    expect(byId('6614').rows.find((r) => r.station === 'ROSSBURGH')!.pointToPointRuntime)
      .toBe(1.5);
    expect(byId('8038').rows.find((r) => r.station === 'ROSSBURGH')!.pointToPointRuntime)
      .toBe(9);
  });

  /**
   * 8000 and 8002 run the same 44.02 km to the same siding. 8000 takes 63
   * minutes, 8002 takes 70, and the difference is one crossing: 8002 waits six
   * minutes at WARNERBEACH for train 0749. Two minutes of the remainder is a
   * slower section out of that same station, and the last half minute is a
   * quicker shunt at the far end.
   *
   * A single crossing accounts for most of a seven minute gap on a 44 km run.
   */
  it('accounts for a seven minute gap with one crossing', () => {
    const a = byId('8000');
    const b = byId('8002');
    expect(a.throughputRuntime).toBe(63);
    expect(b.throughputRuntime).toBe(70);
    expect(a.destination).toBe('UKS/S650579');
    expect(b.destination).toBe('UKS/S650579');

    const warner = b.rows.find((r) => r.station === 'WARNERBEACH')!;
    expect(warner.standingTime).toBe(6);
    expect(warner.standingReason).toBe('X 0749');
    expect(a.rows.find((r) => r.station === 'WARNERBEACH')!.standingTime).toBeNull();

    expect(b.rows.find((r) => r.station === 'WINKLESPRUIT')!.pointToPointRuntime).toBe(4.5);
    expect(a.rows.find((r) => r.station === 'WINKLESPRUIT')!.pointToPointRuntime).toBe(2.5);
  });

  /**
   * The bug this extract exposed. Train 8000 arrives at UMKOMAAS at midnight
   * and departs at midnight, eleven rows before its journey ends. Testing
   * Departure = 00:00:00 alone marked it the terminus, which left the previous
   * departure stale and reported the following row as three and a half minutes
   * adrift when it was exact.
   *
   * 00:00:00 is three different things in this file: the absence of a
   * departure at the end of a run, a real midnight departure (1710 leaves
   * HAMMARSDALE at midnight with five minutes of standing recorded), and a
   * real midnight arrival. The row's position and its standing column together
   * are what separate them.
   */
  it('does not mistake a midnight arrival for the end of the run', () => {
    const t = byId('8000');
    const rows = t.rows;
    const i = rows.findIndex((r) => r.station === 'UMKOMAAS');
    expect(rows[i].arrival).toBe(0);
    expect(rows[i].departure).toBe(0);
    expect(i).toBeLessThan(rows.length - 1);
    expect(validateSchedule(t).runtimeMismatches).toEqual([]);

    // A real midnight departure, mid-journey, with standing recorded.
    const ham = byId('1710').rows.find((r) => r.station === 'HAMMARSDALE')!;
    expect(ham.departure).toBe(0);
    expect(ham.standingTime).toBe(5);
    expect(ham.standingReason).toBe('F 8946');
  });

  /**
   * Through stations dominate: the great majority of rows arrive and depart
   * in the same instant, with no dwell recorded at all.
   */
  it('carries no dwell at most of the nodes it passes', () => {
    const rows = parseRunningTimes(B7).flatMap((t) => t.rows);
    const zeroDwell = rows.filter((r) => r.arrival != null && r.arrival === r.departure);
    expect(zeroDwell.length).toBeGreaterThan(200);
    expect(zeroDwell.length / rows.length).toBeGreaterThan(0.8);
  });

  /**
   * Sched reaches 3 here. Every train in the first six extracts carried 1, so
   * a timetable holds at least three schedules and the column is a real
   * discriminator rather than a constant.
   */
  it('records a third schedule', () => {
    const sched = (id: string) => byId(id).sched;
    expect(sched('113')).toBe(3);
    expect(sched('8000')).toBe(3);
    expect(sched('1710')).toBe(2);
    expect(sched('6614')).toBe(1);
    expect(new Set(parseRunningTimes(B7).map((t) => t.sched))).toEqual(new Set([1, 2, 3]));
  });

  /**
   * 'VACUUM TRAINS/LIGHT LOCO-S' and 'VACUUM TRAINS/LIGHT LOCO' both appear,
   * differing by a trailing '-S'. Two near-identical strings for what is
   * presumably one thing, so matching on the type has to be exact and any
   * grouping by it will silently split.
   */
  it('carries two spellings of the same train type', () => {
    expect(byId('6614').trainType).toBe('VACUUM TRAINS/LIGHT LOCO-S');
    expect(byId('8040').trainType).toBe('VACUUM TRAINS/LIGHT LOCO');
    expect(byId('8040').trainType).not.toBe(byId('6614').trainType);
    expect(byId('113').trainType).toBe('VACUUM TRAINS/FEEDER TRAIN');
  });

  /**
   * Three more reason shapes: 'A RT' at a terminus, 'LN8814' and 'LN8816',
   * each embedding a number that is not the train's own, and 'F 8946'. Along
   * with 'X 0749' and 'X 1843' these confirm the field is free text.
   */
  it('adds three more reason shapes', () => {
    expect(byId('113').rows.at(-1)!.standingReason).toBe('A RT');
    expect(byId('6614').rows.at(-1)!.standingReason).toBe('LN8814');
    expect(byId('6616').rows.at(-1)!.standingReason).toBe('LN8816');
    expect(byId('1710').rows.find((r) => r.station === 'HAMMARSDALE')!.standingReason)
      .toBe('F 8946');
  });

  /**
   * Seconds now include 1, 29 and 41, against a sample that began on whole
   * and half minutes. WENTWORTHPARK is reached in 00:01:01.
   */
  it('resolves seconds finer than the earlier sample ever needed', () => {
    const went = byId('8000').rows.find((r) => r.station === 'WENTWORTHPARK')!;
    expect(went.pointToPointRuntime).toBeCloseTo(1 + 1 / 60, 6);
    expect(byId('8000').rows.find((r) => r.station === 'JACOBS')!.pointToPointRuntime)
      .toBeCloseTo(2 + 29 / 60, 6);
    expect(byId('113').rows.find((r) => r.station === 'ROSSBURGH')!.pointToPointRuntime)
      .toBeCloseTo(41 / 60, 6);
  });
});

const B8 = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
WATERVALBOVEN	8915	10	NORTHEAST	NELSPRUIT	17:40:00	17:50:00	00:03:00	00:10:00	SHUNT	KOMATIPOORT						06:55:00	0	4.42
WATERVALBOVEN	8915	11	NORTHEAST	MAYFERN	18:05:00	18:05:00	00:15:00			KOMATIPOORT						06:55:00	0	7.05
WATERVALBOVEN	8915	12	NORTHEAST	KARINO	18:14:00	18:14:00	00:09:00			KOMATIPOORT						06:55:00	0	6.99
WATERVALBOVEN	8915	13	NORTHEAST	KROKODILPOORT	18:23:00	18:23:00	00:09:00			KOMATIPOORT						06:55:00	0	7.12
WATERVALBOVEN	8915	13	NORTHEAST	GRANIETPOORT	18:29:00	18:29:00	00:06:00			KOMATIPOORT						06:55:00	0	4.16
WATERVALBOVEN	8915	13	NORTHEAST	GORGE	18:37:00	18:37:00	00:08:00			KOMATIPOORT						06:55:00	0	6.08
WATERVALBOVEN	8915	13	NORTHEAST	BOULDERS	18:45:00	18:45:00	00:08:00			KOMATIPOORT						06:55:00	0	11.71
WATERVALBOVEN	8915	13	NORTHEAST	KAAPMUIDEN	18:50:00	19:00:00	00:05:00	00:10:00		KOMATIPOORT						06:55:00	0	2.75
WATERVALBOVEN	8915	14	NORTHEAST	ROCKVALE	19:15:00	19:15:00	00:15:00			KOMATIPOORT						06:55:00	0	7.87
WATERVALBOVEN	8915	15	NORTHEAST	ALTHORPE	19:20:30	19:20:30	00:05:30			KOMATIPOORT						06:55:00	0	1.5
WATERVALBOVEN	8915	15	NORTHEAST	MAGNESITE	19:29:00	19:29:00	00:08:30			KOMATIPOORT						06:55:00	0	3.29
WATERVALBOVEN	8915	16	NORTHEAST	MALELANE	19:40:30	19:40:30	00:11:30			KOMATIPOORT						06:55:00	0	6.59
WATERVALBOVEN	8915	17	NORTHEAST	IMPALA	20:00:00	20:00:00	00:19:30			KOMATIPOORT						06:55:00	0	8.83
WATERVALBOVEN	8915	18	NORTHEAST	HECTORSPRUIT	20:23:00	20:23:00	00:23:00			KOMATIPOORT						06:55:00	0	10.17
WATERVALBOVEN	8915	19	NORTHEAST	DROOGLAND	20:34:00	20:34:00	00:11:00			KOMATIPOORT						06:55:00	0	6.2
WATERVALBOVEN	8915	19	NORTHEAST	OORSPRONG	20:41:00	20:41:00	00:07:00			KOMATIPOORT						06:55:00	0	4.4
WATERVALBOVEN	8915	19	NORTHEAST	TENBOSCH	20:49:00	20:49:00	00:08:00			KOMATIPOORT						06:55:00	0	5.16
WATERVALBOVEN	8915	19	NORTHEAST	KOORSBOOM	21:20:00	21:20:00	00:31:00			KOMATIPOORT						06:55:00	0	7.44
WATERVALBOVEN	8915	19	NORTHEAST	KOMATIPOORT	21:40:00	00:00:00	00:20:00			KOMATIPOORT						06:55:00	0	6.58
WATERVALBOVEN	8942	1	NORTHEAST	WATERVALBOVEN		11:15:00				WITBANK	11:15:00	15:50:00	1	AYAYYYA	MEDIUM HEAVY/MEDIUM HEAVY	04:35:00	0	
WATERVALBOVEN	8942	1	NORTHEAST	GOEDGELUK	11:29:00	11:29:00	00:14:00		B	WITBANK						04:35:00	0	7.08
WATERVALBOVEN	8942	2	NORTHEAST	MACHADODORP	11:41:00	11:41:00	00:12:00			WITBANK						04:35:00	0	5.29
WATERVALBOVEN	8942	3	NORTHEAST	FAIRVIEW	11:55:00	11:55:00	00:14:00			WITBANK						04:35:00	0	7.21
WATERVALBOVEN	8942	4	NORTHEAST	DALMANUTHA	12:09:00	12:09:00	00:14:00			WITBANK						04:35:00	0	7.83
WATERVALBOVEN	8942	4	NORTHEAST	BERGENDAL	12:22:00	12:22:00	00:13:00			WITBANK						04:35:00	0	8.26
WATERVALBOVEN	8942	4	NORTHEAST	BELFAST	12:36:00	12:44:00	00:14:00	00:08:00	SHUNT	WITBANK						04:35:00	0	6.4
WATERVALBOVEN	8942	5	NORTHEAST	SUNBURY	13:02:00	13:03:00	00:18:00	00:01:00	SHUNT	WITBANK						04:35:00	0	11.9
WATERVALBOVEN	8942	6	NORTHEAST	WONDERFONTEIN	13:19:00	13:20:00	00:16:00	00:01:00	SHUNT	WITBANK						04:35:00	0	8.9
WATERVALBOVEN	8942	7	NORTHEAST	ARNOT	13:39:00	14:02:00	00:19:00	00:23:00	SHUNT	WITBANK						04:35:00	0	13.05
WATERVALBOVEN	8942	8	NORTHEAST	CASSHOME	14:13:30	14:13:30	00:11:30			WITBANK						04:35:00	0	6.29
WATERVALBOVEN	8942	9	NORTHEAST	PAN	14:23:00	14:24:00	00:09:30	00:01:00	SHUNT	WITBANK						04:35:00	0	5.16
WATERVALBOVEN	8942	10	NORTHEAST	DERWENT	14:40:00	14:40:00	00:16:00			WITBANK						04:35:00	0	11.92
WATERVALBOVEN	8942	11	NORTHEAST	MIDDELBURGT	14:52:00	14:53:00	00:12:00	00:01:00	SHUNT	WITBANK						04:35:00	0	9.25
WATERVALBOVEN	8942	12	NORTHEAST	UITKYK	15:05:00	15:08:00	00:12:00	00:03:00	SHUNT	WITBANK						04:35:00	0	8.15
WATERVALBOVEN	8942	13	NORTHEAST	HILLSIDE	15:19:00	15:19:00	00:11:00			WITBANK						04:35:00	0	8.05
WATERVALBOVEN	8942	13	NORTHEAST	OLIFANTSRIVIE	15:30:00	15:30:00	00:11:00			WITBANK						04:35:00	0	6.71
WATERVALBOVEN	8942	13	NORTHEAST	WIR-OOSBANK	15:41:00	15:41:00	00:11:00			WITBANK						04:35:00	0	9.02
WATERVALBOVEN	8942	14	NORTHEAST	WITBANK	15:50:00	00:00:00	00:09:00		XP	WITBANK						04:35:00	0	1.69
WATERVALBOVEN	14801	1	NORTHEAST	WATERVALBOVEN		14:13:00				NELSPRUIT	14:13:00	16:39:00	2	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:26:00	0	
WATERVALBOVEN	14801	1	NORTHEAST	ONDERVALLE	14:27:00	14:27:00	00:14:00		C	NELSPRUIT						02:26:00	0	6.08
WATERVALBOVEN	14801	1	NORTHEAST	WATERVALONDER	14:42:00	14:42:00	00:15:00			NELSPRUIT						02:26:00	0	6.66
WATERVALBOVEN	14801	2	NORTHEAST	SYCAMORE	14:54:00	14:54:00	00:12:00			NELSPRUIT						02:26:00	0	7.84
WATERVALBOVEN	14801	3	NORTHEAST	HEYSFORD	14:56:00	14:56:00	00:02:00			NELSPRUIT						02:26:00	0	3.91
WATERVALBOVEN	14801	3	NORTHEAST	AIRLIE	15:04:00	15:04:00	00:08:00			NELSPRUIT						02:26:00	0	4.25
WATERVALBOVEN	14801	3	NORTHEAST	HEMLOCK	15:12:00	15:12:00	00:08:00			NELSPRUIT						02:26:00	0	6.87
WATERVALBOVEN	14801	3	NORTHEAST	NGODWANA	15:20:00	15:30:00	00:08:00	00:10:00	SHUNT	NELSPRUIT						02:26:00	0	7.53
WATERVALBOVEN	14801	4	NORTHEAST	CITRIODORA	15:40:00	15:40:00	00:10:00			NELSPRUIT						02:26:00	0	8.36
WATERVALBOVEN	14801	4	NORTHEAST	ELANDSHOEK	15:47:00	15:47:00	00:07:00			NELSPRUIT						02:26:00	0	5.69
WATERVALBOVEN	14801	5	NORTHEAST	RECEPTION	15:52:00	15:52:00	00:05:00			NELSPRUIT						02:26:00	0	4.71
WATERVALBOVEN	14801	5	NORTHEAST	RIVULETS	16:00:00	16:00:00	00:08:00			NELSPRUIT						02:26:00	0	5.61
WATERVALBOVEN	14801	6	NORTHEAST	SCHAGEN	16:07:00	16:07:00	00:07:00			NELSPRUIT						02:26:00	0	5.58
WATERVALBOVEN	14801	6	NORTHEAST	ALKMAAR	16:12:00	16:12:00	00:05:00			NELSPRUIT						02:26:00	0	4.32
WATERVALBOVEN	14801	6	NORTHEAST	BROHAM	16:20:00	16:20:00	00:08:00			NELSPRUIT						02:26:00	0	6.32
WATERVALBOVEN	14801	7	NORTHEAST	CAIRN	16:23:00	16:23:00	00:03:00			NELSPRUIT						02:26:00	0	2.31
WATERVALBOVEN	14801	7	NORTHEAST	WESTAFFIN	16:28:00	16:28:00	00:05:00			NELSPRUIT						02:26:00	0	4.04
WATERVALBOVEN	14801	7	NORTHEAST	NLP-MATAFFIN	16:36:00	16:36:00	00:08:00			NELSPRUIT						02:26:00	0	1.29
WATERVALBOVEN	14801	8	NORTHEAST	NELSPRUIT	16:39:00	00:00:00	00:03:00		RT	NELSPRUIT						02:26:00	0	4.42
WATERVALBOVEN	17462	1	NORTHEAST	WATERVALBOVEN		12:00:00				BSX/S749532	12:00:00	16:19:00	2	YYYYYYY	VACUUM TRAINS/LIGHT LOCO-S	04:19:00	0	
WATERVALBOVEN	17462	1	NORTHEAST	GOEDGELUK	12:12:00	12:12:00	00:12:00		B	BSX/S749532						04:19:00	0	7.08
WATERVALBOVEN	17462	2	NORTHEAST	MACHADODORP	12:20:00	12:20:00	00:08:00			BSX/S749532						04:19:00	0	5.29
WATERVALBOVEN	17462	3	NORTHEAST	FAIRVIEW	12:30:00	12:30:00	00:10:00			BSX/S749532						04:19:00	0	7.21
WATERVALBOVEN	17462	4	NORTHEAST	DALMANUTHA	12:41:00	12:41:00	00:11:00			BSX/S749532						04:19:00	0	7.83
WATERVALBOVEN	17462	4	NORTHEAST	BERGENDAL	12:51:00	12:51:00	00:10:00			BSX/S749532						04:19:00	0	8.26
WATERVALBOVEN	17462	4	NORTHEAST	BELFAST	13:00:00	13:46:00	00:09:00	00:46:00	X 8805	BSX/S749532						04:19:00	0	6.4
WATERVALBOVEN	17462	5	NORTHEAST	SUNBURY	14:01:00	14:30:00	00:15:00	00:29:00	X 8905/8413	BSX/S749532						04:19:00	0	11.9
WATERVALBOVEN	17462	6	NORTHEAST	WONDERFONTEIN	14:42:00	14:42:00	00:12:00			BSX/S749532						04:19:00	0	8.9
WATERVALBOVEN	17462	7	NORTH	BSX-RIETKUIL	15:07:00	15:07:00	00:25:00			BSX/S749532						04:19:00	0	20.73
WATERVALBOVEN	17462	8	NORTH	BSX-PULLENSHO	15:41:00	15:41:00	00:34:00			BSX/S749532						04:19:00	0	28.28
WATERVALBOVEN	17462	9	NORTH	GELUKSPLAAS	15:58:00	15:58:00	00:17:00			BSX/S749532						04:19:00	0	9.07
WATERVALBOVEN	17462	10	NORTH	BROODSNYERSPL	16:07:00	16:14:00	00:09:00	00:07:00	SHUNT	BSX/S749532						04:19:00	0	2.1
WATERVALBOVEN	17462	11	NORTH	BSX/S749532	16:19:00	00:00:00	00:05:00		RT	BSX/S749532						04:19:00	0	0.1
WATERVALBOVEN	18415	1	NORTHEAST	WATERVALBOVEN		23:35:00				NGODWANA	23:35:00	00:42:00	1	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	01:07:00	0	
WATERVALBOVEN	18415	1	NORTHEAST	ONDERVALLE	23:49:00	23:49:00	00:14:00		B	NGODWANA						01:07:00	0	6.08
WATERVALBOVEN	18415	1	NORTHEAST	WATERVALONDER	00:04:00	00:04:00	00:15:00			NGODWANA						01:07:00	0	6.66
WATERVALBOVEN	18415	2	NORTHEAST	SYCAMORE	00:16:00	00:16:00	00:12:00			NGODWANA						01:07:00	0	7.84
WATERVALBOVEN	18415	3	NORTHEAST	HEYSFORD	00:20:00	00:20:00	00:04:00			NGODWANA						01:07:00	0	3.91
WATERVALBOVEN	18415	3	NORTHEAST	AIRLIE	00:26:00	00:26:00	00:06:00			NGODWANA						01:07:00	0	4.25
WATERVALBOVEN	18415	3	NORTHEAST	HEMLOCK	00:34:00	00:34:00	00:08:00			NGODWANA						01:07:00	0	6.87
WATERVALBOVEN	18415	3	NORTHEAST	NGODWANA	00:42:00	00:00:00	00:08:00		RT	NGODWANA						01:07:00	0	7.53
WATERVALBOVEN	18420	1	NORTHEAST	WATERVALBOVEN		10:05:00				ERMELO	10:05:00	15:12:00	1	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	05:07:00	0	
WATERVALBOVEN	18420	1	NORTHEAST	GOEDGELUK	10:37:00	10:37:00	00:32:00		B	ERMELO						05:07:00	0	7.08
WATERVALBOVEN	18420	2	NORTHEAST	MACHADODORP	10:45:00	10:45:00	00:08:00			ERMELO						05:07:00	0	5.29
WATERVALBOVEN	18420	3	NORTHEAST	FAIRVIEW	10:55:00	10:55:00	00:10:00			ERMELO						05:07:00	0	7.21
WATERVALBOVEN	18420	4	NORTHEAST	DALMANUTHA	11:06:00	11:06:00	00:11:00			ERMELO						05:07:00	0	7.83
WATERVALBOVEN	18420	4	NORTHEAST	BERGENDAL	11:16:00	11:16:00	00:10:00			ERMELO						05:07:00	0	8.26
WATERVALBOVEN	18420	4	NORTHEAST	BELFAST	11:25:00	11:25:00	00:09:00			ERMELO						05:07:00	0	6.4
WATERVALBOVEN	18420	5	NORTHEAST	SUNBURY	11:40:00	11:40:00	00:15:00			ERMELO						05:07:00	0	11.9
WATERVALBOVEN	18420	6	NORTHEAST	WONDERFONTEIN	11:52:00	11:52:00	00:12:00			ERMELO						05:07:00	0	8.9
WATERVALBOVEN	18420	7	NORTH	BSX-RIETKUIL	12:17:00	12:17:00	00:25:00			ERMELO						05:07:00	0	20.73
WATERVALBOVEN	18420	8	NORTH	BSX-PULLENSHO	12:53:00	12:53:00	00:36:00			ERMELO						05:07:00	0	28.28
WATERVALBOVEN	18420	9	NORTH	GELUKSPLAAS	13:11:00	13:11:00	00:18:00			ERMELO						05:07:00	0	9.07
WATERVALBOVEN	18420	10	NORTH	HALFGEWONNEN	13:38:00	13:38:00	00:27:00			ERMELO						05:07:00	0	15.3
WATERVALBOVEN	18420	11	NORTH	WEBBSRUS	14:03:00	14:03:00	00:25:00			ERMELO						05:07:00	0	20.8
WATERVALBOVEN	18420	11	NORTH	HAMELFONTEIN	14:21:00	14:21:00	00:18:00			ERMELO						05:07:00	0	15.89
WATERVALBOVEN	18420	12	NORTH	RIETVLEIRUS	14:37:00	14:37:00	00:16:00			ERMELO						05:07:00	0	12.89
WATERVALBOVEN	18420	13	NORTH	ERMELO	15:12:00	00:00:00	00:35:00		RT	ERMELO						05:07:00	0	23.19
WATERVALBOVEN	18436	1	NORTHEAST	WATERVALBOVEN		02:25:00				RTI/S743631	02:25:00	03:53:00	3	YYYYYYA	MEDIUM HEAVY/MEDIUM HEAVY	01:28:00	0	
WATERVALBOVEN	18436	1	NORTHEAST	GOEDGELUK	02:35:00	02:35:00	00:10:00		B	RTI/S743631						01:28:00	0	7.08
WATERVALBOVEN	18436	2	NORTHEAST	MACHADODORP	02:41:00	02:41:00	00:06:00			RTI/S743631						01:28:00	0	5.29
WATERVALBOVEN	18436	3	NORTHEAST	FAIRVIEW	02:49:00	02:49:00	00:08:00			RTI/S743631						01:28:00	0	7.21
WATERVALBOVEN	18436	4	NORTHEAST	DALMANUTHA	02:58:00	02:58:00	00:09:00			RTI/S743631						01:28:00	0	7.83
WATERVALBOVEN	18436	4	NORTHEAST	BERGENDAL	03:05:00	03:05:00	00:07:00			RTI/S743631						01:28:00	0	8.26
WATERVALBOVEN	18436	4	NORTHEAST	BELFAST	03:12:00	03:12:00	00:07:00			RTI/S743631						01:28:00	0	6.4
WATERVALBOVEN	18436	5	NORTHEAST	SUNBURY	03:24:00	03:24:00	00:12:00			RTI/S743631						01:28:00	0	11.9
WATERVALBOVEN	18436	6	NORTHEAST	WONDERFONTEIN	03:33:00	03:33:00	00:09:00			RTI/S743631						01:28:00	0	8.9
WATERVALBOVEN	18436	7	NORTH	BSX-RIETKUIL	03:50:00	03:50:00	00:17:00			RTI/S743631						01:28:00	0	20.73
WATERVALBOVEN	18436	8	NORTH	RTI/S743631	03:53:00	00:00:00	00:03:00		RT	RTI/S743631						01:28:00	0	0.96
WATERVALBOVEN	18438	1	NORTHEAST	WATERVALBOVEN		12:40:00				RTI/S743631	12:40:00	14:57:00	3	AAAAAAA	MEDIUM HEAVY/MEDIUM HEAVY	02:17:00	0	
WATERVALBOVEN	18438	1	NORTHEAST	GOEDGELUK	12:54:00	12:54:00	00:14:00		B	RTI/S743631						02:17:00	0	7.08
WATERVALBOVEN	18438	2	NORTHEAST	MACHADODORP	13:06:00	13:06:00	00:12:00			RTI/S743631						02:17:00	0	5.29
WATERVALBOVEN	18438	3	NORTHEAST	FAIRVIEW	13:20:00	13:20:00	00:14:00			RTI/S743631						02:17:00	0	7.21
WATERVALBOVEN	18438	4	NORTHEAST	DALMANUTHA	13:34:00	13:34:00	00:14:00			RTI/S743631						02:17:00	0	7.83
WATERVALBOVEN	18438	4	NORTHEAST	BERGENDAL	13:47:00	13:47:00	00:13:00			RTI/S743631						02:17:00	0	8.26
WATERVALBOVEN	18438	4	NORTHEAST	BELFAST	14:01:00	14:01:00	00:14:00			RTI/S743631						02:17:00	0	6.4
WATERVALBOVEN	18438	5	NORTHEAST	SUNBURY	14:19:00	14:19:00	00:18:00			RTI/S743631						02:17:00	0	11.9
WATERVALBOVEN	18438	6	NORTHEAST	WONDERFONTEIN	14:34:00	14:34:00	00:15:00			RTI/S743631						02:17:00	0	8.9
WATERVALBOVEN	18438	7	NORTH	BSX-RIETKUIL	14:50:00	14:50:00	00:16:00			RTI/S743631						02:17:00	0	20.73
WATERVALBOVEN	18438	8		RTI/S743747	14:51:00	14:51:30	00:01:00	00:00:30	SHUNT	RTI/S743631						02:17:00	0	
WATERVALBOVEN	18438	9	NORTH	BSX-RIETKUIL	14:53:00	14:53:00	00:01:30			RTI/S743631						02:17:00	0	
WATERVALBOVEN	18438	10	NORTH	RTI/S765198	14:55:00	14:56:00	00:02:00	00:01:00	SHUNT	RTI/S743631						02:17:00	0	0.1
WATERVALBOVEN	18438	11	NORTH	BSX-RIETKUIL	14:56:30	14:56:30	00:00:30			RTI/S743631						02:17:00	0	0.1
WATERVALBOVEN	18438	12	NORTH	RTI/S743631	14:57:00	00:00:00	00:00:30		RT	RTI/S743631						02:17:00	0	0.96
WATERVALBOVEN	18481	1	NORTHEAST	WATERVALBOVEN		00:55:00				KAAPMUIDEN	00:55:00	04:06:00	3	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	03:11:00	0	
WATERVALBOVEN	18481	1	NORTHEAST	ONDERVALLE	01:09:00	01:09:00	00:14:00		B	KAAPMUIDEN						03:11:00	0	6.08
WATERVALBOVEN	18481	1	NORTHEAST	WATERVALONDER	01:24:00	01:24:00	00:15:00			KAAPMUIDEN						03:11:00	0	6.66
WATERVALBOVEN	18481	2	NORTHEAST	SYCAMORE	01:36:00	01:36:00	00:12:00			KAAPMUIDEN						03:11:00	0	7.84
WATERVALBOVEN	18481	3	NORTHEAST	HEYSFORD	01:40:00	01:40:00	00:04:00			KAAPMUIDEN						03:11:00	0	3.91
WATERVALBOVEN	18481	3	NORTHEAST	AIRLIE	01:46:00	01:46:00	00:06:00			KAAPMUIDEN						03:11:00	0	4.25
WATERVALBOVEN	18481	3	NORTHEAST	HEMLOCK	01:54:00	01:54:00	00:08:00			KAAPMUIDEN						03:11:00	0	6.87
WATERVALBOVEN	18481	3	NORTHEAST	NGODWANA	02:02:00	02:02:00	00:08:00			KAAPMUIDEN						03:11:00	0	7.53
WATERVALBOVEN	18481	4	NORTHEAST	CITRIODORA	02:12:00	02:12:00	00:10:00			KAAPMUIDEN						03:11:00	0	8.36
WATERVALBOVEN	18481	4	NORTHEAST	ELANDSHOEK	02:19:00	02:19:00	00:07:00			KAAPMUIDEN						03:11:00	0	5.69
WATERVALBOVEN	18481	5	NORTHEAST	RECEPTION	02:24:00	02:24:00	00:05:00			KAAPMUIDEN						03:11:00	0	4.71
WATERVALBOVEN	18481	5	NORTHEAST	RIVULETS	02:32:00	02:32:00	00:08:00			KAAPMUIDEN						03:11:00	0	5.61
WATERVALBOVEN	18481	6	NORTHEAST	SCHAGEN	02:39:00	02:39:00	00:07:00			KAAPMUIDEN						03:11:00	0	5.58
WATERVALBOVEN	18481	6	NORTHEAST	ALKMAAR	02:44:00	02:44:00	00:05:00			KAAPMUIDEN						03:11:00	0	4.32
WATERVALBOVEN	18481	6	NORTHEAST	BROHAM	02:52:00	02:52:00	00:08:00			KAAPMUIDEN						03:11:00	0	6.32
WATERVALBOVEN	18481	7	NORTHEAST	CAIRN	02:55:00	02:55:00	00:03:00			KAAPMUIDEN						03:11:00	0	2.31
WATERVALBOVEN	18481	7	NORTHEAST	WESTAFFIN	03:00:00	03:00:00	00:05:00			KAAPMUIDEN						03:11:00	0	4.04
WATERVALBOVEN	18481	7	NORTHEAST	NLP-MATAFFIN	03:01:00	03:01:00	00:01:00			KAAPMUIDEN						03:11:00	0	1.29
WATERVALBOVEN	18481	8	NORTHEAST	NELSPRUIT	03:11:00	03:11:00	00:10:00			KAAPMUIDEN						03:11:00	0	4.42
WATERVALBOVEN	18481	9	NORTHEAST	MAYFERN	03:21:00	03:21:00	00:10:00			KAAPMUIDEN						03:11:00	0	7.05
WATERVALBOVEN	18481	10	NORTHEAST	KARINO	03:30:00	03:30:00	00:09:00			KAAPMUIDEN						03:11:00	0	6.99
WATERVALBOVEN	18481	11	NORTHEAST	KROKODILPOORT	03:39:00	03:39:00	00:09:00			KAAPMUIDEN						03:11:00	0	7.12
WATERVALBOVEN	18481	11	NORTHEAST	GRANIETPOORT	03:45:00	03:45:00	00:06:00			KAAPMUIDEN						03:11:00	0	4.16
WATERVALBOVEN	18481	11	NORTHEAST	GORGE	03:53:00	03:53:00	00:08:00			KAAPMUIDEN						03:11:00	0	6.08
WATERVALBOVEN	18481	11	NORTHEAST	BOULDERS	04:01:00	04:01:00	00:08:00			KAAPMUIDEN						03:11:00	0	11.71
WATERVALBOVEN	18481	11	NORTHEAST	KAAPMUIDEN	04:06:00	00:00:00	00:05:00		RM	KAAPMUIDEN						03:11:00	0	2.75
WATERVALBOVEN	18801	1	NORTHEAST	WATERVALBOVEN		05:30:00				NELSPRUIT	05:30:00	07:46:00	1	YYYYYAY	VACUUM TRAINS/LIGHT LOCO	02:16:00	0	
WATERVALBOVEN	18801	1	NORTHEAST	ONDERVALLE	05:44:00	05:44:00	00:14:00		C	NELSPRUIT						02:16:00	0	6.08
WATERVALBOVEN	18801	1	NORTHEAST	WATERVALONDER	05:59:00	05:59:00	00:15:00			NELSPRUIT						02:16:00	0	6.66
WATERVALBOVEN	18801	2	NORTHEAST	SYCAMORE	06:11:00	06:11:00	00:12:00			NELSPRUIT						02:16:00	0	7.84
WATERVALBOVEN	18801	3	NORTHEAST	HEYSFORD	06:15:00	06:15:00	00:04:00			NELSPRUIT						02:16:00	0	3.91
WATERVALBOVEN	18801	3	NORTHEAST	AIRLIE	06:21:00	06:21:00	00:06:00			NELSPRUIT						02:16:00	0	4.25
WATERVALBOVEN	18801	3	NORTHEAST	HEMLOCK	06:29:00	06:29:00	00:08:00			NELSPRUIT						02:16:00	0	6.87
WATERVALBOVEN	18801	3	NORTHEAST	NGODWANA	06:37:00	06:37:00	00:08:00			NELSPRUIT						02:16:00	0	7.53
WATERVALBOVEN	18801	4	NORTHEAST	CITRIODORA	06:47:00	06:47:00	00:10:00			NELSPRUIT						02:16:00	0	8.36
WATERVALBOVEN	18801	4	NORTHEAST	ELANDSHOEK	06:54:00	06:54:00	00:07:00			NELSPRUIT						02:16:00	0	5.69
WATERVALBOVEN	18801	5	NORTHEAST	RECEPTION	06:59:00	06:59:00	00:05:00			NELSPRUIT						02:16:00	0	4.71
WATERVALBOVEN	18801	5	NORTHEAST	RIVULETS	07:07:00	07:07:00	00:08:00			NELSPRUIT						02:16:00	0	5.61
WATERVALBOVEN	18801	6	NORTHEAST	SCHAGEN	07:14:00	07:14:00	00:07:00			NELSPRUIT						02:16:00	0	5.58
WATERVALBOVEN	18801	6	NORTHEAST	ALKMAAR	07:19:00	07:19:00	00:05:00			NELSPRUIT						02:16:00	0	4.32
WATERVALBOVEN	18801	6	NORTHEAST	BROHAM	07:27:00	07:27:00	00:08:00			NELSPRUIT						02:16:00	0	6.32
WATERVALBOVEN	18801	7	NORTHEAST	CAIRN	07:30:00	07:30:00	00:03:00			NELSPRUIT						02:16:00	0	2.31
WATERVALBOVEN	18801	7	NORTHEAST	WESTAFFIN	07:35:00	07:35:00	00:05:00			NELSPRUIT						02:16:00	0	4.04
WATERVALBOVEN	18801	7	NORTHEAST	NLP-MATAFFIN	07:35:00	07:35:00				NELSPRUIT						02:16:00	0	1.29
WATERVALBOVEN	18801	8	NORTHEAST	NELSPRUIT	07:46:00	00:00:00	00:11:00		RT	NELSPRUIT						02:16:00	0	4.42
WATERVALBOVEN	18818	1	NORTHEAST	WATERVALBOVEN		10:05:00				ERMELO	10:05:00	15:12:00	1	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	05:07:00	0	
WATERVALBOVEN	18818	1	NORTHEAST	GOEDGELUK	10:37:00	10:37:00	00:32:00		B	ERMELO						05:07:00	0	7.08
WATERVALBOVEN	18818	2	NORTHEAST	MACHADODORP	10:45:00	10:45:00	00:08:00			ERMELO						05:07:00	0	5.29
WATERVALBOVEN	18818	3	NORTHEAST	FAIRVIEW	10:55:00	10:55:00	00:10:00			ERMELO						05:07:00	0	7.21
WATERVALBOVEN	18818	4	NORTHEAST	DALMANUTHA	11:06:00	11:06:00	00:11:00			ERMELO						05:07:00	0	7.83
WATERVALBOVEN	18818	4	NORTHEAST	BERGENDAL	11:16:00	11:16:00	00:10:00			ERMELO						05:07:00	0	8.26
WATERVALBOVEN	18818	4	NORTHEAST	BELFAST	11:25:00	11:25:00	00:09:00			ERMELO						05:07:00	0	6.4
WATERVALBOVEN	18818	5	NORTHEAST	SUNBURY	11:40:00	11:40:00	00:15:00			ERMELO						05:07:00	0	11.9
WATERVALBOVEN	18818	6	NORTHEAST	WONDERFONTEIN	11:52:00	11:52:00	00:12:00			ERMELO						05:07:00	0	8.9
WATERVALBOVEN	18818	7	NORTH	BSX-RIETKUIL	12:17:00	12:17:00	00:25:00			ERMELO						05:07:00	0	20.73
WATERVALBOVEN	18818	8	NORTH	BSX-PULLENSHO	12:53:00	12:53:00	00:36:00			ERMELO						05:07:00	0	28.28
WATERVALBOVEN	18818	9	NORTH	GELUKSPLAAS	13:11:00	13:11:00	00:18:00			ERMELO						05:07:00	0	9.07
WATERVALBOVEN	18818	10	NORTH	HALFGEWONNEN	13:38:00	13:38:00	00:27:00			ERMELO						05:07:00	0	15.3
WATERVALBOVEN	18818	11	NORTH	WEBBSRUS	14:03:00	14:03:00	00:25:00			ERMELO						05:07:00	0	20.8
WATERVALBOVEN	18818	11	NORTH	HAMELFONTEIN	14:21:00	14:21:00	00:18:00			ERMELO						05:07:00	0	15.89
WATERVALBOVEN	18818	12	NORTH	RIETVLEIRUS	14:37:00	14:37:00	00:16:00			ERMELO						05:07:00	0	12.89
WATERVALBOVEN	18818	13	NORTH	ERMELO	15:12:00	00:00:00	00:35:00		RT	ERMELO						05:07:00	0	23.19
WATERVALBOVEN	18820	1	NORTHEAST	WATERVALBOVEN		15:20:00				SAAIWATER	15:20:00	19:14:00	2	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	03:54:00	0	
WATERVALBOVEN	18820	1	NORTHEAST	GOEDGELUK	15:32:00	15:32:00	00:12:00		B	SAAIWATER						03:54:00	0	7.08
WATERVALBOVEN	18820	2	NORTHEAST	MACHADODORP	15:40:00	15:48:00	00:08:00	00:08:00	X 8663	SAAIWATER						03:54:00	0	5.29
WATERVALBOVEN	18820	3	NORTHEAST	FAIRVIEW	15:58:00	15:58:00	00:10:00			SAAIWATER						03:54:00	0	7.21
WATERVALBOVEN	18820	4	NORTHEAST	DALMANUTHA	16:09:00	16:09:00	00:11:00			SAAIWATER						03:54:00	0	7.83
WATERVALBOVEN	18820	4	NORTHEAST	BERGENDAL	16:19:00	16:19:00	00:10:00			SAAIWATER						03:54:00	0	8.26
WATERVALBOVEN	18820	4	NORTHEAST	BELFAST	16:28:00	16:28:00	00:09:00			SAAIWATER						03:54:00	0	6.4
WATERVALBOVEN	18820	5	NORTHEAST	SUNBURY	16:43:00	16:43:00	00:15:00			SAAIWATER						03:54:00	0	11.9
WATERVALBOVEN	18820	6	NORTHEAST	WONDERFONTEIN	16:55:00	16:56:00	00:12:00	00:01:00	SHUNT	SAAIWATER						03:54:00	0	8.9
WATERVALBOVEN	18820	7	NORTH	BSX-RIETKUIL	17:19:00	17:19:00	00:23:00			SAAIWATER						03:54:00	0	20.73
WATERVALBOVEN	18820	8	NORTH	BSX-PULLENSHO	17:37:00	17:37:00	00:18:00			SAAIWATER						03:54:00	0	28.28
WATERVALBOVEN	18820	9	NORTH	GELUKSPLAAS	17:49:00	17:49:00	00:12:00			SAAIWATER						03:54:00	0	9.07
WATERVALBOVEN	18820	10	NORTH	BROODSNYERSPL	18:01:00	18:01:00	00:12:00			SAAIWATER						03:54:00	0	2.1
WATERVALBOVEN	18820	11	NORTH	BLINKPAN	18:17:00	18:17:00	00:16:00			SAAIWATER						03:54:00	0	8.76
WATERVALBOVEN	18820	12	NORTH	VANDYKSDRIF	18:28:00	18:28:00	00:11:00			SAAIWATER						03:54:00	0	10.3
WATERVALBOVEN	18820	13	NORTH	SRW-BEZUIDENHOUTS	18:38:00	18:38:00	00:10:00			SAAIWATER						03:54:00	0	9.07
WATERVALBOVEN	18820	14	NORTH	KROMKLIP	18:45:00	18:45:00	00:07:00			SAAIWATER						03:54:00	0	7.59
WATERVALBOVEN	18820	15	NORTH	NMY/S752681	18:52:00	18:52:00	00:07:00			SAAIWATER						03:54:00	0	3.89
WATERVALBOVEN	18820	16	NORTH	NMY/S752592	18:54:32	18:54:32	00:02:32			SAAIWATER						03:54:00	0	0.97
WATERVALBOVEN	18820	17	NORTH	SAAIWATER	19:00:00	19:00:00	00:05:28			SAAIWATER						03:54:00	0	2.79
WATERVALBOVEN	18820	18	NORTH	SRW/S752649	19:02:40	19:02:40	00:02:40			SAAIWATER						03:54:00	0	0.97
WATERVALBOVEN	18820	19	NORTH	SRW/S752673	19:05:20	19:05:20	00:02:40			SAAIWATER						03:54:00	0	0.97
WATERVALBOVEN	18820	20	NORTH	SRW/S752584	19:08:00	19:09:00	00:02:40	00:01:00	SHUNT	SAAIWATER						03:54:00	0	0.97
WATERVALBOVEN	18820	21	NORTH	SRW/S752673	19:10:00	19:10:00	00:01:00		RT	SAAIWATER						03:54:00	0	0.97
WATERVALBOVEN	18820	22	NORTH	SRW/S752649	19:12:00	19:12:00	00:02:00		RT	SAAIWATER						03:54:00	0	0.97
WATERVALBOVEN	18820	23	NORTH	SAAIWATER	19:14:00	00:00:00	00:02:00			SAAIWATER						03:54:00	0	0.97
WATERVALBOVEN	18830	1	NORTHEAST	WATERVALBOVEN		02:38:00				PSH/S742902	02:38:00	06:07:00	2	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	03:29:00	0	
WATERVALBOVEN	18830	1	NORTHEAST	GOEDGELUK	02:50:00	02:50:00	00:12:00		B	PSH/S742902						03:29:00	0	7.08
WATERVALBOVEN	18830	2	NORTHEAST	MACHADODORP	02:58:00	02:58:00	00:08:00			PSH/S742902						03:29:00	0	5.29
WATERVALBOVEN	18830	3	NORTHEAST	FAIRVIEW	03:08:00	03:08:00	00:10:00			PSH/S742902						03:29:00	0	7.21
WATERVALBOVEN	18830	4	NORTHEAST	DALMANUTHA	03:19:00	03:19:00	00:11:00			PSH/S742902						03:29:00	0	7.83
WATERVALBOVEN	18830	4	NORTHEAST	BERGENDAL	03:29:00	03:29:00	00:10:00			PSH/S742902						03:29:00	0	8.26
WATERVALBOVEN	18830	4	NORTHEAST	BELFAST	03:38:00	03:38:00	00:09:00			PSH/S742902						03:29:00	0	6.4
WATERVALBOVEN	18830	5	NORTHEAST	SUNBURY	03:53:00	03:53:00	00:15:00			PSH/S742902						03:29:00	0	11.9
WATERVALBOVEN	18830	6	NORTHEAST	WONDERFONTEIN	04:05:00	04:06:00	00:12:00	00:01:00	SHUNT	PSH/S742902						03:29:00	0	8.9
WATERVALBOVEN	18830	7	NORTH	BSX-RIETKUIL	04:29:00	04:29:00	00:23:00			PSH/S742902						03:29:00	0	20.73
WATERVALBOVEN	18830	8	NORTH	BSX-PULLENSHO	05:59:00	05:59:00	01:30:00			PSH/S742902						03:29:00	0	28.28
WATERVALBOVEN	18830	9	NORTH	PSH/S742902	06:07:00	00:00:00	00:08:00		RT	PSH/S742902						03:29:00	0	0.97
WATERVALBOVEN	18873	1	NORTHEAST	WATERVALBOVEN		03:30:00				NELSPRUIT	03:30:00	05:46:00	1	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	02:16:00	0	
WATERVALBOVEN	18873	1	NORTHEAST	ONDERVALLE	03:44:00	03:44:00	00:14:00		B	NELSPRUIT						02:16:00	0	6.08
WATERVALBOVEN	18873	1	NORTHEAST	WATERVALONDER	03:59:00	03:59:00	00:15:00			NELSPRUIT						02:16:00	0	6.66
WATERVALBOVEN	18873	2	NORTHEAST	SYCAMORE	04:11:00	04:11:00	00:12:00			NELSPRUIT						02:16:00	0	7.84
WATERVALBOVEN	18873	3	NORTHEAST	HEYSFORD	04:15:00	04:15:00	00:04:00			NELSPRUIT						02:16:00	0	3.91
WATERVALBOVEN	18873	3	NORTHEAST	AIRLIE	04:21:00	04:21:00	00:06:00			NELSPRUIT						02:16:00	0	4.25
WATERVALBOVEN	18873	3	NORTHEAST	HEMLOCK	04:29:00	04:29:00	00:08:00			NELSPRUIT						02:16:00	0	6.87
WATERVALBOVEN	18873	3	NORTHEAST	NGODWANA	04:37:00	04:37:00	00:08:00			NELSPRUIT						02:16:00	0	7.53
WATERVALBOVEN	18873	4	NORTHEAST	CITRIODORA	04:47:00	04:47:00	00:10:00			NELSPRUIT						02:16:00	0	8.36
WATERVALBOVEN	18873	4	NORTHEAST	ELANDSHOEK	04:54:00	04:54:00	00:07:00			NELSPRUIT						02:16:00	0	5.69
WATERVALBOVEN	18873	5	NORTHEAST	RECEPTION	04:59:00	04:59:00	00:05:00			NELSPRUIT						02:16:00	0	4.71
WATERVALBOVEN	18873	5	NORTHEAST	RIVULETS	05:07:00	05:07:00	00:08:00			NELSPRUIT						02:16:00	0	5.61
WATERVALBOVEN	18873	6	NORTHEAST	SCHAGEN	05:14:00	05:14:00	00:07:00			NELSPRUIT						02:16:00	0	5.58
WATERVALBOVEN	18873	6	NORTHEAST	ALKMAAR	05:19:00	05:19:00	00:05:00			NELSPRUIT						02:16:00	0	4.32
WATERVALBOVEN	18873	6	NORTHEAST	BROHAM	05:27:00	05:27:00	00:08:00			NELSPRUIT						02:16:00	0	6.32
WATERVALBOVEN	18873	7	NORTHEAST	CAIRN	05:30:00	05:30:00	00:03:00			NELSPRUIT						02:16:00	0	2.31
WATERVALBOVEN	18873	7	NORTHEAST	WESTAFFIN	05:35:00	05:35:00	00:05:00			NELSPRUIT						02:16:00	0	4.04
WATERVALBOVEN	18873	7	NORTHEAST	NLP-MATAFFIN	05:35:00	05:35:00				NELSPRUIT						02:16:00	0	1.29
WATERVALBOVEN	18873	8	NORTHEAST	NELSPRUIT	05:46:00	00:00:00	00:11:00		RT	NELSPRUIT						02:16:00	0	4.42
WATERVALBOVEN	28818	1	NORTHEAST	WATERVALBOVEN		05:23:00				ERMELO	05:23:00	10:30:00	1	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	05:07:00	0	
WATERVALBOVEN	28818	1	NORTHEAST	GOEDGELUK	05:55:00	05:55:00	00:32:00		B	ERMELO						05:07:00	0	7.08
WATERVALBOVEN	28818	2	NORTHEAST	MACHADODORP	06:03:00	06:03:00	00:08:00			ERMELO						05:07:00	0	5.29
WATERVALBOVEN	28818	3	NORTHEAST	FAIRVIEW	06:13:00	06:13:00	00:10:00			ERMELO						05:07:00	0	7.21
WATERVALBOVEN	28818	4	NORTHEAST	DALMANUTHA	06:24:00	06:24:00	00:11:00			ERMELO						05:07:00	0	7.83
WATERVALBOVEN	28818	4	NORTHEAST	BERGENDAL	06:34:00	06:34:00	00:10:00			ERMELO						05:07:00	0	8.26
WATERVALBOVEN	28818	4	NORTHEAST	BELFAST	06:43:00	06:43:00	00:09:00			ERMELO						05:07:00	0	6.4
WATERVALBOVEN	28818	5	NORTHEAST	SUNBURY	06:58:00	06:58:00	00:15:00			ERMELO						05:07:00	0	11.9
WATERVALBOVEN	28818	6	NORTHEAST	WONDERFONTEIN	07:10:00	07:10:00	00:12:00			ERMELO						05:07:00	0	8.9
WATERVALBOVEN	28818	7	NORTH	BSX-RIETKUIL	07:35:00	07:35:00	00:25:00			ERMELO						05:07:00	0	20.73
WATERVALBOVEN	28818	8	NORTH	BSX-PULLENSHO	08:11:00	08:11:00	00:36:00			ERMELO						05:07:00	0	28.28
WATERVALBOVEN	28818	9	NORTH	GELUKSPLAAS	08:29:00	08:29:00	00:18:00			ERMELO						05:07:00	0	9.07
WATERVALBOVEN	28818	10	NORTH	HALFGEWONNEN	08:56:00	08:56:00	00:27:00			ERMELO						05:07:00	0	15.3
WATERVALBOVEN	28818	11	NORTH	WEBBSRUS	09:21:00	09:21:00	00:25:00			ERMELO						05:07:00	0	20.8
WATERVALBOVEN	28818	11	NORTH	HAMELFONTEIN	09:39:00	09:39:00	00:18:00			ERMELO						05:07:00	0	15.89
WATERVALBOVEN	28818	12	NORTH	RIETVLEIRUS	09:55:00	09:55:00	00:16:00			ERMELO						05:07:00	0	12.89
WATERVALBOVEN	28818	13	NORTH	ERMELO	10:30:00	00:00:00	00:35:00		RT	ERMELO						05:07:00	0	23.19
WATERVALBOVEN	28820	1	NORTHEAST	WATERVALBOVEN		06:00:00				CLA/S643963	06:00:00	07:43:00	2	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	01:43:00	0	
WATERVALBOVEN	28820	1	NORTHEAST	GOEDGELUK	06:14:00	06:14:00	00:14:00		B	CLA/S643963						01:43:00	0	7.08
WATERVALBOVEN	28820	2	NORTHEAST	MACHADODORP	06:23:00	06:23:00	00:09:00			CLA/S643963						01:43:00	0	5.29
WATERVALBOVEN	28820	3	NORTH	KORINGLAND	06:29:00	06:29:00	00:06:00			CLA/S643963						01:43:00	0	7.24
WATERVALBOVEN	28820	3	NORTH	SEWEFONTEIN	06:42:00	06:42:00	00:13:00			CLA/S643963						01:43:00	0	5.95
WATERVALBOVEN	28820	4	NORTH	PRAIRE	06:57:00	06:57:00	00:15:00			CLA/S643963						01:43:00	0	9.59
WATERVALBOVEN	28820	5	NORTH	MOEDIG	07:11:00	07:11:00	00:14:00			CLA/S643963						01:43:00	0	9.08
WATERVALBOVEN	28820	5	NORTH	AMBLESIDE	07:21:00	07:21:00	00:10:00			CLA/S643963						01:43:00	0	8.83
WATERVALBOVEN	28820	5	NORTH	HAWERFONTEIN	07:26:00	07:26:00	00:05:00			CLA/S643963						01:43:00	0	6.21
WATERVALBOVEN	28820	5	NORTH	CAROLINA	07:38:00	07:43:00	00:12:00	00:05:00		CLA/S643963						01:43:00	0	9.26
WATERVALBOVEN	28820	6	NORTH	CLA/S643963	07:43:00	00:00:00			RT	CLA/S643963						01:43:00	0	0.1
WATERVALBOVEN	29405	1	NORTHEAST	WATERVALBOVEN		17:20:00				RCBSKOONKAAI	17:20:00	16:15:00	1	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	22:55:00	0	
WATERVALBOVEN	29405	1	NORTHEAST	GOEDGELUK	17:32:00	17:50:00	00:12:00	00:18:00	C SHUNT/8817	RCBSKOONKAAI						22:55:00	0	7.08
WATERVALBOVEN	29405	2	NORTHEAST	MACHADODORP	17:58:00	17:58:00	00:08:00			RCBSKOONKAAI						22:55:00	0	5.29
WATERVALBOVEN	29405	3	NORTHEAST	FAIRVIEW	18:08:00	18:10:00	00:10:00	00:02:00	SHUNT	RCBSKOONKAAI						22:55:00	0	7.21
WATERVALBOVEN	29405	4	NORTHEAST	DALMANUTHA	18:21:00	18:22:00	00:11:00	00:01:00	SHUNT	RCBSKOONKAAI						22:55:00	0	7.83
WATERVALBOVEN	29405	4	NORTHEAST	BERGENDAL	18:32:00	18:35:00	00:10:00	00:03:00	SHUNT	RCBSKOONKAAI						22:55:00	0	8.26
WATERVALBOVEN	29405	4	NORTHEAST	BELFAST	18:44:00	18:51:00	00:09:00	00:07:00	SHUNT	RCBSKOONKAAI						22:55:00	0	6.4
WATERVALBOVEN	29405	5	NORTHEAST	SUNBURY	19:05:00	19:05:00	00:14:00			RCBSKOONKAAI						22:55:00	0	11.9
WATERVALBOVEN	29405	6	NORTHEAST	WONDERFONTEIN	19:17:00	19:17:00	00:12:00			RCBSKOONKAAI						22:55:00	0	8.9
WATERVALBOVEN	29405	7	NORTH	BSX-RIETKUIL	19:42:00	19:42:00	00:25:00			RCBSKOONKAAI						22:55:00	0	20.73
WATERVALBOVEN	29405	8	NORTH	BSX-PULLENSHO	20:18:00	20:18:00	00:36:00			RCBSKOONKAAI						22:55:00	0	28.28
WATERVALBOVEN	29405	9	NORTH	GELUKSPLAAS	20:36:00	20:36:00	00:18:00			RCBSKOONKAAI						22:55:00	0	9.07
WATERVALBOVEN	29405	10	NORTH	HALFGEWONNEN	21:03:00	21:03:00	00:27:00			RCBSKOONKAAI						22:55:00	0	15.3
WATERVALBOVEN	29405	11	NORTH	WEBBSRUS	21:28:00	21:28:00	00:25:00			RCBSKOONKAAI						22:55:00	0	20.8
WATERVALBOVEN	29405	11	NORTH	HAMELFONTEIN	21:35:00	21:45:00	00:07:00	00:10:00		RCBSKOONKAAI						22:55:00	0	15.89
WATERVALBOVEN	29405	12	NORTH	RIETVLEIRUS	22:01:00	22:01:00	00:16:00			RCBSKOONKAAI						22:55:00	0	12.89
WATERVALBOVEN	29405	13	NORTH	ERMELO	22:37:00	04:30:00	00:36:00	05:53:00	RM	RCBSKOONKAAI						22:55:00	0	23.19
WATERVALBOVEN	29405	14	NORTH	EML-LUGREMTER	04:33:27	04:33:27	00:03:27		RM	RCBSKOONKAAI						22:55:00	1	4.08
WATERVALBOVEN	29405	15	NORTH	CAMDEN	04:42:00	04:42:00	00:08:33			RCBSKOONKAAI						22:55:00	1	8.71
WATERVALBOVEN	29405	16	NORTH	OVERVAAL	04:53:00	04:55:00	00:11:00	00:02:00	X 8842	RCBSKOONKAAI						22:55:00	1	9.59
WATERVALBOVEN	29405	17	NORTH	MAVIRISTAD	05:05:00	05:05:00	00:10:00			RCBSKOONKAAI						22:55:00	1	11.69
WATERVALBOVEN	29405	17	NORTH	SHEEPMOOR	05:13:00	05:13:00	00:08:00			RCBSKOONKAAI						22:55:00	1	9.27
WATERVALBOVEN	29405	18	NORTH	NGWEMPISI	05:22:00	05:22:00	00:09:00			RCBSKOONKAAI						22:55:00	1	9.9
WATERVALBOVEN	29405	18	NORTH	PANBULT	05:30:00	05:30:00	00:08:00			RCBSKOONKAAI						22:55:00	1	4.67
WATERVALBOVEN	29405	19	NORTH	ISWEPE	05:45:00	05:45:00	00:15:00			RCBSKOONKAAI						22:55:00	1	6.79
WATERVALBOVEN	29405	20	NORTH	WILDRAND	06:07:00	06:07:00	00:22:00			RCBSKOONKAAI						22:55:00	1	19.42
WATERVALBOVEN	29405	21	NORTH	KEMP	06:21:00	06:21:00	00:14:00			RCBSKOONKAAI						22:55:00	1	9.01
WATERVALBOVEN	29405	22	NORTH	PIETRETIEF	06:36:00	06:36:00	00:15:00			RCBSKOONKAAI						22:55:00	1	9.83
WATERVALBOVEN	29405	23	NORTH	MKONDO	06:54:00	06:54:00	00:18:00			RCBSKOONKAAI						22:55:00	1	11.08
WATERVALBOVEN	29405	24	NORTH	MOOLMAN	07:01:00	07:01:00	00:07:00			RCBSKOONKAAI						22:55:00	1	8.81
WATERVALBOVEN	29405	25	NORTH	CONFIDENCE	07:31:00	07:31:00	00:30:00			RCBSKOONKAAI						22:55:00	1	9.07
WATERVALBOVEN	29405	26	NORTH	COMMONDALE	07:45:30	07:45:30	00:14:30			RCBSKOONKAAI						22:55:00	1	9.6
WATERVALBOVEN	29405	27	NORTH	HLUNGWANA	07:59:30	07:59:30	00:14:00			RCBSKOONKAAI						22:55:00	1	7.51
WATERVALBOVEN	29405	28	NORTH	PAULPIETERSBU	08:49:00	08:49:00	00:49:30			RCBSKOONKAAI						22:55:00	1	8.52
WATERVALBOVEN	29405	29	NORTH	MAHULUMBE	09:07:00	09:07:00	00:18:00			RCBSKOONKAAI						22:55:00	1	7.83
WATERVALBOVEN	29405	29	NORTH	MQWABE	09:32:30	09:32:30	00:25:30			RCBSKOONKAAI						22:55:00	1	13.06
WATERVALBOVEN	29405	30	NORTH	MSWANENI	09:44:00	09:44:00	00:11:30			RCBSKOONKAAI						22:55:00	1	9.4
WATERVALBOVEN	29405	31	NORTH	VYD-SIKAME	10:01:00	10:01:00	00:17:00			RCBSKOONKAAI						22:55:00	1	10.09
WATERVALBOVEN	29405	32	NORTH	VRYHEIDOOS	10:16:00	11:30:00	00:15:00	01:14:00	RT	RCBSKOONKAAI						22:55:00	1	3.7
WATERVALBOVEN	29405	33	NORTH	TINTASDRIFT	11:43:00	11:43:00	00:13:00			RCBSKOONKAAI						22:55:00	1	3.99
WATERVALBOVEN	29405	34	NORTH	DASSIESHOOGTE	11:49:00	11:49:00	00:06:00			RCBSKOONKAAI						22:55:00	1	6.67
WATERVALBOVEN	29405	34	NORTH	LENJANEDRIF	12:00:30	12:00:30	00:11:30			RCBSKOONKAAI						22:55:00	1	9.64
WATERVALBOVEN	29405	35	NORTH	ENGOGWENI	12:16:00	12:16:00	00:15:30			RCBSKOONKAAI						22:55:00	1	13.3
WATERVALBOVEN	29405	35	NORTH	KOMVOORHOOGTE	12:27:00	12:27:00	00:11:00			RCBSKOONKAAI						22:55:00	1	9.9
WATERVALBOVEN	29405	36	NORTH	BLOUBANK	12:42:00	12:42:00	00:15:00			RCBSKOONKAAI						22:55:00	1	8.5
WATERVALBOVEN	29405	36	NORTH	NHLAZATSHE	12:57:00	12:57:00	00:15:00			RCBSKOONKAAI						22:55:00	1	10.9
WATERVALBOVEN	29405	37	NORTH	IZOLOF	13:11:00	13:11:00	00:14:00			RCBSKOONKAAI						22:55:00	1	8.69
WATERVALBOVEN	29405	37	NORTH	EQWASHA	13:20:30	13:20:30	00:09:30			RCBSKOONKAAI						22:55:00	1	8.3
WATERVALBOVEN	29405	37	NORTH	ULOLIWE	13:35:00	13:35:00	00:14:30			RCBSKOONKAAI						22:55:00	1	10.86
WATERVALBOVEN	29405	37	NORTH	ULUNDI	13:49:30	13:49:30	00:14:30			RCBSKOONKAAI						22:55:00	1	8.42
WATERVALBOVEN	29405	38	NORTH	ILANGAKAZI	14:05:00	14:05:00	00:15:30			RCBSKOONKAAI						22:55:00	1	9.8
WATERVALBOVEN	29405	38	NORTH	INTSHAMANZI	14:20:30	14:20:30	00:15:30			RCBSKOONKAAI						22:55:00	1	11.4
WATERVALBOVEN	29405	38	NORTH	ENGOLOTHI	14:33:30	14:33:30	00:13:00			RCBSKOONKAAI						22:55:00	1	9
WATERVALBOVEN	29405	39	NORTH	UMUNYWANA	14:46:00	14:46:00	00:12:30			RCBSKOONKAAI						22:55:00	1	10
WATERVALBOVEN	29405	39	NORTH	ISANGOYANA	15:01:00	15:01:00	00:15:00			RCBSKOONKAAI						22:55:00	1	9.8
WATERVALBOVEN	29405	39	NORTH	EMAKWEZINI	15:13:00	15:13:00	00:12:00			RCBSKOONKAAI						22:55:00	1	9
WATERVALBOVEN	29405	39	NORTH	IDONDOTHA	15:23:00	15:23:00	00:10:00			RCBSKOONKAAI						22:55:00	1	9.8
WATERVALBOVEN	29405	39	NORTH	ELUBANA	15:39:00	15:39:00	00:16:00			RCBSKOONKAAI						22:55:00	1	10
WATERVALBOVEN	29405	40	NORTH	RCB-VISGRAAT	15:44:00	15:44:00	00:05:00			RCBSKOONKAAI						22:55:00	1	13.59
WATERVALBOVEN	29405	41	NORTH	RCB-BHIZOLO	15:55:00	16:00:00	00:11:00	00:05:00	SHUNT	RCBSKOONKAAI						22:55:00	1	1
WATERVALBOVEN	29405	42	NORTH	RCBSKOONKAAI	16:15:00	00:00:00	00:15:00		RT	RCBSKOONKAAI						22:55:00	1	3.79
WATERVALBOVEN	88501	1	NORTHEAST	WATERVALBOVEN		07:00:00				KAAPMUIDEN	07:00:00	10:36:00	1	NNNNNNY	PASSENGER TRN/OOSTERLIJN	03:36:00	0	
WATERVALBOVEN	88501	1	NORTHEAST	ONDERVALLE	07:17:00	07:17:00	00:17:00		C	KAAPMUIDEN						03:36:00	0	6.08
WATERVALBOVEN	88501	1	NORTHEAST	WATERVALONDER	07:28:00	07:28:00	00:11:00			KAAPMUIDEN						03:36:00	0	6.66
WATERVALBOVEN	88501	2	NORTHEAST	SYCAMORE	07:43:00	07:43:00	00:15:00			KAAPMUIDEN						03:36:00	0	7.84
WATERVALBOVEN	88501	3	NORTHEAST	HEYSFORD	07:47:00	07:47:00	00:04:00			KAAPMUIDEN						03:36:00	0	3.91
WATERVALBOVEN	88501	3	NORTHEAST	AIRLIE	07:52:00	07:52:00	00:05:00			KAAPMUIDEN						03:36:00	0	4.25
WATERVALBOVEN	88501	3	NORTHEAST	HEMLOCK	08:00:00	08:00:00	00:08:00			KAAPMUIDEN						03:36:00	0	6.87
WATERVALBOVEN	88501	3	NORTHEAST	NGODWANA	08:09:00	08:09:00	00:09:00			KAAPMUIDEN						03:36:00	0	7.53
WATERVALBOVEN	88501	4	NORTHEAST	CITRIODORA	08:19:00	08:19:00	00:10:00			KAAPMUIDEN						03:36:00	0	8.36
WATERVALBOVEN	88501	4	NORTHEAST	ELANDSHOEK	08:26:00	08:26:00	00:07:00			KAAPMUIDEN						03:36:00	0	5.69
WATERVALBOVEN	88501	5	NORTHEAST	RECEPTION	08:34:00	08:34:00	00:08:00			KAAPMUIDEN						03:36:00	0	4.71
WATERVALBOVEN	88501	5	NORTHEAST	RIVULETS	08:42:00	08:42:00	00:08:00			KAAPMUIDEN						03:36:00	0	5.61
WATERVALBOVEN	88501	6	NORTHEAST	SCHAGEN	08:49:00	08:49:00	00:07:00			KAAPMUIDEN						03:36:00	0	5.58
WATERVALBOVEN	88501	6	NORTHEAST	ALKMAAR	08:54:00	08:54:00	00:05:00			KAAPMUIDEN						03:36:00	0	4.32
WATERVALBOVEN	88501	6	NORTHEAST	BROHAM	09:03:00	09:03:00	00:09:00			KAAPMUIDEN						03:36:00	0	6.32
WATERVALBOVEN	88501	7	NORTHEAST	CAIRN	09:06:00	09:06:00	00:03:00			KAAPMUIDEN						03:36:00	0	2.31
WATERVALBOVEN	88501	7	NORTHEAST	WESTAFFIN	09:11:00	09:11:00	00:05:00			KAAPMUIDEN						03:36:00	0	4.04
WATERVALBOVEN	88501	7	NORTHEAST	NLP-MATAFFIN	09:16:00	09:16:00	00:05:00			KAAPMUIDEN						03:36:00	0	1.29
WATERVALBOVEN	88501	8	NORTHEAST	NELSPRUIT	09:18:00	09:40:00	00:02:00	00:22:00	PLATFORM	KAAPMUIDEN						03:36:00	0	4.42
WATERVALBOVEN	88501	9	NORTHEAST	MAYFERN	09:50:00	09:50:00	00:10:00			KAAPMUIDEN						03:36:00	0	7.05
WATERVALBOVEN	88501	10	NORTHEAST	KARINO	09:59:00	09:59:00	00:09:00			KAAPMUIDEN						03:36:00	0	6.99
WATERVALBOVEN	88501	11	NORTHEAST	KROKODILPOORT	10:07:00	10:07:00	00:08:00			KAAPMUIDEN						03:36:00	0	7.12
WATERVALBOVEN	88501	11	NORTHEAST	GRANIETPOORT	10:14:00	10:14:00	00:07:00			KAAPMUIDEN						03:36:00	0	4.16
WATERVALBOVEN	88501	11	NORTHEAST	GORGE	10:22:00	10:22:00	00:08:00			KAAPMUIDEN						03:36:00	0	6.08
WATERVALBOVEN	88501	11	NORTHEAST	BOULDERS	10:31:00	10:31:00	00:09:00			KAAPMUIDEN						03:36:00	0	11.71
WATERVALBOVEN	88501	11	NORTHEAST	KAAPMUIDEN	10:36:00	00:00:00	00:05:00		RT	KAAPMUIDEN						03:36:00	0	2.75
WATERVALBOVEN	88675	1	NORTHEAST	WATERVALBOVEN		11:00:00				WATERVALONDER	11:00:00	11:30:00	1	YYYYYYY	PASSENGER TRN/OOSTERLIJN	00:30:00	0	
WATERVALBOVEN	88675	1	NORTHEAST	ONDERVALLE	11:12:00	11:12:00	00:12:00		C	WATERVALONDER						00:30:00	0	6.08
WATERVALBOVEN	88675	1	NORTHEAST	WATERVALONDER	11:30:00	00:00:00	00:18:00		RT	WATERVALONDER						00:30:00	0	6.66
WATERVALONDER	88586	1	NORTHEAST	WATERVALONDER		07:00:00				CPK-GOEDERE	07:00:00	14:06:00	1	YYYYYYY	PASSENGER TRN/ROVOS RAIL	07:06:00	0	
WATERVALONDER	88586	1	NORTHEAST	ONDERVALLE	07:13:00	07:13:00	00:13:00		C	CPK-GOEDERE						07:06:00	0	6.66
WATERVALONDER	88586	1	NORTHEAST	WATERVALBOVEN	07:25:00	07:35:00	00:12:00	00:10:00	PASSENGERS	CPK-GOEDERE						07:06:00	0	6.08
WATERVALONDER	88586	1	NORTHEAST	GOEDGELUK	07:47:00	07:47:00	00:12:00			CPK-GOEDERE						07:06:00	0	7.08
WATERVALONDER	88586	2	NORTHEAST	MACHADODORP	07:56:00	07:56:00	00:09:00			CPK-GOEDERE						07:06:00	0	5.29
WATERVALONDER	88586	3	NORTHEAST	FAIRVIEW	08:07:00	08:07:00	00:11:00			CPK-GOEDERE						07:06:00	0	7.21
WATERVALONDER	88586	4	NORTHEAST	DALMANUTHA	08:17:00	08:17:00	00:10:00			CPK-GOEDERE						07:06:00	0	7.83
WATERVALONDER	88586	4	NORTHEAST	BERGENDAL	08:27:00	08:27:00	00:10:00			CPK-GOEDERE						07:06:00	0	8.26
WATERVALONDER	88586	4	NORTHEAST	BELFAST	08:36:00	08:36:00	00:09:00			CPK-GOEDERE						07:06:00	0	6.4
WATERVALONDER	88586	5	NORTHEAST	SUNBURY	08:47:00	08:47:00	00:11:00			CPK-GOEDERE						07:06:00	0	11.9
WATERVALONDER	88586	6	NORTHEAST	WONDERFONTEIN	08:59:00	08:59:00	00:12:00			CPK-GOEDERE						07:06:00	0	8.9
WATERVALONDER	88586	7	NORTHEAST	ARNOT	09:14:00	09:14:00	00:15:00			CPK-GOEDERE						07:06:00	0	13.05
WATERVALONDER	88586	8	NORTHEAST	CASSHOME	09:20:00	09:20:00	00:06:00			CPK-GOEDERE						07:06:00	0	6.29
WATERVALONDER	88586	9	NORTHEAST	PAN	09:36:00	09:36:00	00:16:00			CPK-GOEDERE						07:06:00	0	5.16
WATERVALONDER	88586	10	NORTHEAST	DERWENT	09:48:00	09:48:00	00:12:00			CPK-GOEDERE						07:06:00	0	11.92
WATERVALONDER	88586	11	NORTHEAST	MIDDELBURGT	09:59:00	09:59:00	00:11:00			CPK-GOEDERE						07:06:00	0	9.25
WATERVALONDER	88586	12	NORTHEAST	UITKYK	10:09:00	10:09:00	00:10:00			CPK-GOEDERE						07:06:00	0	8.15
WATERVALONDER	88586	13	NORTHEAST	HILLSIDE	10:18:00	10:18:00	00:09:00			CPK-GOEDERE						07:06:00	0	8.05
WATERVALONDER	88586	13	NORTHEAST	OLIFANTSRIVIE	10:36:00	10:36:00	00:18:00			CPK-GOEDERE						07:06:00	0	6.71
WATERVALONDER	88586	13	NORTHEAST	WIR-OOSBANK	10:39:00	10:39:00	00:03:00			CPK-GOEDERE						07:06:00	0	9.02
WATERVALONDER	88586	14	NORTHEAST	WITBANK	10:43:00	11:10:00	00:04:00	00:27:00	RM	CPK-GOEDERE						07:06:00	0	1.69
WATERVALONDER	88586	1	NORTHEAST	SKOONGESIG	11:15:00	11:15:00	00:05:00			CPK-GOEDERE						07:06:00	0	6.28
WATERVALONDER	88586	2	NORTHEAST	CLEWER	11:17:00	11:17:00	00:02:00			CPK-GOEDERE						07:06:00	0	3.81
WATERVALONDER	88586	3	NORTHEAST	WAKEFIELD	11:26:00	11:26:00	00:09:00			CPK-GOEDERE						07:06:00	0	7.48
WATERVALONDER	88586	4	NORTHEAST	BALMORAL	11:37:00	11:37:00	00:11:00			CPK-GOEDERE						07:06:00	0	10.1
WATERVALONDER	88586	5	NORTHEAST	CROWNDOUGLAS	11:46:00	11:46:00	00:09:00			CPK-GOEDERE						07:06:00	0	8.4
WATERVALONDER	88586	5	NORTHEAST	WILGERIVIER	11:53:00	11:53:00	00:07:00			CPK-GOEDERE						07:06:00	0	5.4
WATERVALONDER	88586	5	NORTHEAST	BRONKHORSTSPR	12:06:00	12:06:00	00:13:00			CPK-GOEDERE						07:06:00	0	11.47
WATERVALONDER	88586	6	NORTHEAST	SKIETPOORT	12:19:00	12:19:00	00:13:00			CPK-GOEDERE						07:06:00	0	8.24
WATERVALONDER	88586	6	NORTHEAST	FORFAR	12:26:00	12:26:00	00:07:00			CPK-GOEDERE						07:06:00	0	4.87
WATERVALONDER	88586	7	NORTHEAST	ELANDSRIVIER	12:33:00	12:33:00	00:07:00			CPK-GOEDERE						07:06:00	0	4.92
WATERVALONDER	88586	7	NORTHEAST	RAYTON	12:40:00	13:05:00	00:07:00	00:25:00	STEAM LOCO	CPK-GOEDERE						07:06:00	0	5.32
WATERVALONDER	88586	8	NORTHEAST	VANDERMERWE	13:12:00	13:12:00	00:07:00			CPK-GOEDERE						07:06:00	0	5.01
WATERVALONDER	88586	8	NORTHEAST	PANPOORT	13:18:00	13:18:00	00:06:00			CPK-GOEDERE						07:06:00	0	5.24
WATERVALONDER	88586	9	NORTHEAST	PIENAARSPOORT	13:21:00	13:21:00	00:03:00			CPK-GOEDERE						07:06:00	0	2.22
WATERVALONDER	88586	10	CENTRAL	GREENVIEW	13:25:00	13:25:00	00:04:00			CPK-GOEDERE						07:06:00	0	1.98
WATERVALONDER	88586	10	CENTRAL	EERSTEFABRIEK	13:33:00	13:33:00	00:08:00			CPK-GOEDERE						07:06:00	0	4.99
WATERVALONDER	88586	11	CENTRAL	DENNEBOOM	13:36:00	13:36:00	00:03:00			CPK-GOEDERE						07:06:00	0	2.39
WATERVALONDER	88586	11	CENTRAL	WALTLOO	13:39:00	13:39:00	00:03:00			CPK-GOEDERE						07:06:00	0	1.6
WATERVALONDER	88586	12	CENTRAL	EERSTERUS	13:42:00	13:42:00	00:03:00			CPK-GOEDERE						07:06:00	0	1.55
WATERVALONDER	88586	12	CENTRAL	EFN-SILVERTON	13:45:00	13:45:00	00:03:00			CPK-GOEDERE						07:06:00	0	1.31
WATERVALONDER	88586	12	CENTRAL	KOEDOESPOORT	13:48:00	13:48:00	00:03:00			CPK-GOEDERE						07:06:00	0	1.81
WATERVALONDER	88586	13	CENTRAL	QUEENSWOOD	13:49:00	13:49:00	00:01:00			CPK-GOEDERE						07:06:00	0	2.74
WATERVALONDER	88586	14	CENTRAL	VILLIERIA	13:52:00	13:52:00	00:03:00			CPK-GOEDERE						07:06:00	0	2.37
WATERVALONDER	88586	14	CENTRAL	DEERNESS	13:54:00	13:54:00	00:02:00			CPK-GOEDERE						07:06:00	0	1.34
WATERVALONDER	88586	14	CENTRAL	GEZINA	13:57:00	13:57:00	00:03:00			CPK-GOEDERE						07:06:00	0	1.07
WATERVALONDER	88586	14	CENTRAL	PIERNEEFSRUS	14:03:00	14:03:00	00:06:00			CPK-GOEDERE						07:06:00	0	3.5
WATERVALONDER	88586	14	CENTRAL	CAPITALPARK	14:05:00	14:05:00	00:02:00			CPK-GOEDERE						07:06:00	0	5.07
WATERVALONDER	88586	15	CENTRAL	CPK-GOEDERE	14:06:00	00:00:00	00:01:00		C	CPK-GOEDERE						07:06:00	0	0.1
WATERVALONDER	88676	1	NORTHEAST	WATERVALONDER		12:30:00				WATERVALBOVEN	12:30:00	13:00:00	1	YYYYYYY	PASSENGER TRN/OOSTERLIJN	00:30:00	0	
WATERVALONDER	88676	1	NORTHEAST	ONDERVALLE	12:42:00	12:42:00	00:12:00		C	WATERVALBOVEN						00:30:00	0	6.66
WATERVALONDER	88676	1	NORTHEAST	WATERVALBOVEN	13:00:00	00:00:00	00:18:00		RT	WATERVALBOVEN						00:30:00	0	6.08
WELVERDIEND	4465	1	CENTRAL	WELVERDIEND		12:00:00				KLERKSDORP	12:00:00	14:02:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	02:02:00	0	
WELVERDIEND	4465	1	CENTRAL	GATSRAND	12:17:00	12:17:00	00:17:00		B	KLERKSDORP						02:02:00	0	14.5
WELVERDIEND	4465	2	CENTRAL	FREDERIKSTAD	12:27:00	12:27:00	00:10:00			KLERKSDORP						02:02:00	0	9.18
WELVERDIEND	4465	2	CENTRAL	BOSKOP	12:35:00	12:35:00	00:08:00			KLERKSDORP						02:02:00	0	6.46
WELVERDIEND	4465	3	CENTRAL	SAFARCAMP	12:49:00	12:49:00	00:14:00			KLERKSDORP						02:02:00	0	12.48
WELVERDIEND	4465	4	CENTRAL	CACHET	12:52:00	12:52:00	00:03:00			KLERKSDORP						02:02:00	0	2.56
WELVERDIEND	4465	5	CENTRAL	POTCHEFSTROOM	12:59:00	12:59:00	00:07:00			KLERKSDORP						02:02:00	0	2.6
WELVERDIEND	4465	6	CENTRAL	CRESCENT	13:10:00	13:10:00	00:11:00			KLERKSDORP						02:02:00	0	9.92
WELVERDIEND	4465	6	CENTRAL	NEWMACHAVIE	13:21:00	13:21:00	00:11:00			KLERKSDORP						02:02:00	0	9.52
WELVERDIEND	4465	6	CENTRAL	KOEKEMOER	13:38:00	13:38:00	00:17:00			KLERKSDORP						02:02:00	0	13.17
WELVERDIEND	4465	7	CENTRAL	STILFONTEIN	13:41:00	13:41:00	00:03:00			KLERKSDORP						02:02:00	0	4.91
WELVERDIEND	4465	7	CENTRAL	SANDPAN	13:48:00	13:48:00	00:07:00			KLERKSDORP						02:02:00	0	2.95
WELVERDIEND	4465	7	CENTRAL	KLERKSDORP	14:02:00	00:00:00	00:14:00		RT	KLERKSDORP						02:02:00	0	6.41
WELVERDIEND	7355	1	CENTRAL	WELVERDIEND		12:00:00				KLERKSDORP	12:00:00	14:57:00	2	YYYYYYY	VACUUM TRAINS/MATERIAL TRN	02:57:00	0	
WELVERDIEND	7355	1	CENTRAL	GATSRAND	12:17:00	12:22:00	00:17:00	00:05:00	B SHUNT	KLERKSDORP						02:57:00	0	14.5
WELVERDIEND	7355	2	CENTRAL	FREDERIKSTAD	12:32:00	12:37:00	00:10:00	00:05:00	SHUNT	KLERKSDORP						02:57:00	0	9.18
WELVERDIEND	7355	2	CENTRAL	BOSKOP	12:45:00	12:50:00	00:08:00	00:05:00	SHUNT	KLERKSDORP						02:57:00	0	6.46
WELVERDIEND	7355	3	CENTRAL	SAFARCAMP	13:04:00	13:09:00	00:14:00	00:05:00	SHUNT	KLERKSDORP						02:57:00	0	12.48
WELVERDIEND	7355	4	CENTRAL	CACHET	13:12:00	13:17:00	00:03:00	00:05:00	SHUNT	KLERKSDORP						02:57:00	0	2.56
WELVERDIEND	7355	5	CENTRAL	POTCHEFSTROOM	13:24:00	13:29:00	00:07:00	00:05:00	SHUNT	KLERKSDORP						02:57:00	0	2.6
WELVERDIEND	7355	6	CENTRAL	CRESCENT	13:40:00	13:45:00	00:11:00	00:05:00	SHUNT	KLERKSDORP						02:57:00	0	9.92
WELVERDIEND	7355	6	CENTRAL	NEWMACHAVIE	13:56:00	14:01:00	00:11:00	00:05:00	SHUNT	KLERKSDORP						02:57:00	0	9.52
WELVERDIEND	7355	6	CENTRAL	KOEKEMOER	14:18:00	14:23:00	00:17:00	00:05:00	SHUNT	KLERKSDORP						02:57:00	0	13.17
WELVERDIEND	7355	7	CENTRAL	STILFONTEIN	14:26:00	14:31:00	00:03:00	00:05:00	SHUNT	KLERKSDORP						02:57:00	0	4.91
WELVERDIEND	7355	7	CENTRAL	SANDPAN	14:38:00	14:43:00	00:07:00	00:05:00	SHUNT	KLERKSDORP						02:57:00	0	2.95
WELVERDIEND	7355	7	CENTRAL	KLERKSDORP	14:57:00	00:00:00	00:14:00		RT	KLERKSDORP						02:57:00	0	6.41
WELVERDIEND	7751	1	CENTRAL	WELVERDIEND		10:30:00				ROODEPOORT	10:30:00	12:27:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:57:00	0	
WELVERDIEND	7751	1	CENTRAL	SPANUIT	10:37:00	10:37:00	00:07:00		B	ROODEPOORT						01:57:00	0	4.3
WELVERDIEND	7751	2	CENTRAL	OBERHOLZER	10:52:00	10:55:00	00:15:00	00:03:00	ORDER	ROODEPOORT						01:57:00	0	14.3
WELVERDIEND	7751	3	CENTRAL	MAIZELANDS	11:02:00	11:02:00	00:07:00			ROODEPOORT						01:57:00	0	7.8
WELVERDIEND	7751	3	CENTRAL	BANK	11:10:00	11:13:00	00:08:00	00:03:00	ORDER	ROODEPOORT						01:57:00	0	11.68
WELVERDIEND	7751	4	CENTRAL	VLEIKOP	11:23:00	11:23:00	00:10:00			ROODEPOORT						01:57:00	0	14.35
WELVERDIEND	7751	4	CENTRAL	MIDDELVLEI	11:35:00	11:35:00	00:12:00			ROODEPOORT						01:57:00	0	10.58
WELVERDIEND	7751	5	CENTRAL	RANDFONTEIN	11:48:00	11:48:00	00:13:00			ROODEPOORT						01:57:00	0	13.41
WELVERDIEND	7751	6	CENTRAL	HOMELAKE	11:52:00	11:52:00	00:04:00			ROODEPOORT						01:57:00	0	5.16
WELVERDIEND	7751	6	CENTRAL	ROBINSON(T)	11:54:00	11:55:00	00:02:00	00:01:00	SHUNT	ROODEPOORT						01:57:00	0	3.64
WELVERDIEND	7751	7	CENTRAL	CENTRAL	11:58:30	11:58:30	00:03:30			ROODEPOORT						01:57:00	0	2.7
WELVERDIEND	7751	7	CENTRAL	MILLSITE	12:00:30	12:00:30	00:02:00			ROODEPOORT						01:57:00	0	1.61
WELVERDIEND	7751	7	CENTRAL	WESRAND	12:03:00	12:03:00	00:02:30			ROODEPOORT						01:57:00	0	2.2
WELVERDIEND	7751	7	CENTRAL	KRUGERSDORP	12:08:00	12:08:00	00:05:00			ROODEPOORT						01:57:00	0	2.33
WELVERDIEND	7751	8	CENTRAL	WINDSORMINE	12:10:30	12:10:30	00:02:30			ROODEPOORT						01:57:00	0	1.06
WELVERDIEND	7751	8	CENTRAL	LANWEN	12:13:00	12:13:00	00:02:30			ROODEPOORT						01:57:00	0	1.37
WELVERDIEND	7751	8	CENTRAL	LUIPAARDSVLEI	12:15:30	12:15:30	00:02:30			ROODEPOORT						01:57:00	0	1.9
WELVERDIEND	7751	9	CENTRAL	WITPOORTJIE	12:18:30	12:18:30	00:03:00			ROODEPOORT						01:57:00	0	2.08
WELVERDIEND	7751	9	CONTAINER	PRINCESS	12:21:30	12:21:30	00:03:00			ROODEPOORT						01:57:00	0	2.37
WELVERDIEND	7751	9	CONTAINER	HORISON	12:24:30	12:24:30	00:03:00			ROODEPOORT						01:57:00	0	1.91
WELVERDIEND	7751	9	CENTRAL	ROODEPOORT	12:27:00	00:00:00	00:02:30		RT	ROODEPOORT						01:57:00	0	1.52
WELVERDIEND	7753	1	CENTRAL	WELVERDIEND		23:30:00				ROODEPOORT	23:30:00	01:21:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:51:00	0	
WELVERDIEND	7753	1	CENTRAL	SPANUIT	23:37:00	23:37:00	00:07:00		B	ROODEPOORT						01:51:00	0	4.3
WELVERDIEND	7753	2	CENTRAL	OBERHOLZER	23:52:00	23:53:00	00:15:00	00:01:00	SHUNT	ROODEPOORT						01:51:00	0	14.3
WELVERDIEND	7753	3	CENTRAL	MAIZELANDS	00:01:00	00:01:00	00:08:00			ROODEPOORT						01:51:00	1	7.8
WELVERDIEND	7753	3	CENTRAL	BANK	00:08:30	00:09:30	00:07:30	00:01:00	SHUNT	ROODEPOORT						01:51:00	1	11.68
WELVERDIEND	7753	4	CENTRAL	VLEIKOP	00:19:30	00:19:30	00:10:00			ROODEPOORT						01:51:00	1	14.35
WELVERDIEND	7753	4	CENTRAL	MIDDELVLEI	00:28:00	00:28:00	00:08:30			ROODEPOORT						01:51:00	1	10.58
WELVERDIEND	7753	5	CENTRAL	RANDFONTEIN	00:41:30	00:41:30	00:13:30			ROODEPOORT						01:51:00	1	13.41
WELVERDIEND	7753	6	CENTRAL	HOMELAKE	00:46:00	00:46:00	00:04:30			ROODEPOORT						01:51:00	1	5.16
WELVERDIEND	7753	6	CENTRAL	ROBINSON(T)	00:48:30	00:49:30	00:02:30	00:01:00	SHUNT	ROODEPOORT						01:51:00	1	3.64
WELVERDIEND	7753	7	CENTRAL	CENTRAL	00:53:00	00:53:00	00:03:30			ROODEPOORT						01:51:00	1	2.7
WELVERDIEND	7753	7	CENTRAL	MILLSITE	00:55:00	00:55:00	00:02:00			ROODEPOORT						01:51:00	1	1.61
WELVERDIEND	7753	7	CENTRAL	WESRAND	00:57:30	00:57:30	00:02:30			ROODEPOORT						01:51:00	1	2.2
WELVERDIEND	7753	7	CENTRAL	KRUGERSDORP	01:02:30	01:02:30	00:05:00			ROODEPOORT						01:51:00	1	2.33
WELVERDIEND	7753	8	CENTRAL	WINDSORMINE	01:05:00	01:05:00	00:02:30			ROODEPOORT						01:51:00	1	1.06
WELVERDIEND	7753	8	CENTRAL	LANWEN	01:07:30	01:07:30	00:02:30			ROODEPOORT						01:51:00	1	1.37
WELVERDIEND	7753	8	CENTRAL	LUIPAARDSVLEI	01:10:00	01:10:00	00:02:30			ROODEPOORT						01:51:00	1	1.9
WELVERDIEND	7753	9	CENTRAL	WITPOORTJIE	01:13:00	01:13:00	00:03:00			ROODEPOORT						01:51:00	1	2.08
WELVERDIEND	7753	9	CONTAINER	PRINCESS	01:16:00	01:16:00	00:03:00			ROODEPOORT						01:51:00	1	2.37
WELVERDIEND	7753	9	CONTAINER	HORISON	01:19:00	01:19:00	00:03:00			ROODEPOORT						01:51:00	1	1.91
WELVERDIEND	7753	9	CENTRAL	ROODEPOORT	01:21:00	00:00:00	00:02:00		RT	ROODEPOORT						01:51:00	1	1.52
WELVERDIEND	8853	1	CENTRAL	WELVERDIEND		04:30:00				ROBINSON(T)	04:30:00	05:54:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	01:24:00	0	
WELVERDIEND	8853	1	CENTRAL	SPANUIT	04:37:00	04:37:00	00:07:00		B	ROBINSON(T)						01:24:00	0	4.3
WELVERDIEND	8853	2	CENTRAL	OBERHOLZER	04:52:00	04:55:00	00:15:00	00:03:00	ORDER	ROBINSON(T)						01:24:00	0	14.3
WELVERDIEND	8853	3	CENTRAL	MAIZELANDS	05:02:00	05:02:00	00:07:00			ROBINSON(T)						01:24:00	0	7.8
WELVERDIEND	8853	3	CENTRAL	BANK	05:10:00	05:13:00	00:08:00	00:03:00	ORDER	ROBINSON(T)						01:24:00	0	11.68
WELVERDIEND	8853	4	CENTRAL	VLEIKOP	05:23:00	05:23:00	00:10:00			ROBINSON(T)						01:24:00	0	14.35
WELVERDIEND	8853	4	CENTRAL	MIDDELVLEI	05:35:00	05:35:00	00:12:00			ROBINSON(T)						01:24:00	0	10.58
WELVERDIEND	8853	5	CENTRAL	RANDFONTEIN	05:48:00	05:48:00	00:13:00			ROBINSON(T)						01:24:00	0	13.41
WELVERDIEND	8853	6	CENTRAL	HOMELAKE	05:52:00	05:52:00	00:04:00			ROBINSON(T)						01:24:00	0	5.16
WELVERDIEND	8853	6	CENTRAL	ROBINSON(T)	05:54:00	00:00:00	00:02:00		RT	ROBINSON(T)						01:24:00	0	3.64
WELVERDIEND	8965	1	CENTRAL	WELVERDIEND		12:00:00				KLERKSDORP	12:00:00	14:07:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:07:00	0	
WELVERDIEND	8965	1	CENTRAL	GATSRAND	12:17:00	12:17:00	00:17:00		B	KLERKSDORP						02:07:00	0	14.5
WELVERDIEND	8965	2	CENTRAL	FREDERIKSTAD	12:27:00	12:27:00	00:10:00			KLERKSDORP						02:07:00	0	9.18
WELVERDIEND	8965	2	CENTRAL	BOSKOP	12:35:00	12:35:00	00:08:00			KLERKSDORP						02:07:00	0	6.46
WELVERDIEND	8965	3	CENTRAL	SAFARCAMP	12:49:00	12:49:00	00:14:00			KLERKSDORP						02:07:00	0	12.48
WELVERDIEND	8965	4	CENTRAL	CACHET	12:52:00	12:52:00	00:03:00			KLERKSDORP						02:07:00	0	2.56
WELVERDIEND	8965	5	CENTRAL	POTCHEFSTROOM	12:59:00	13:04:00	00:07:00	00:05:00	SHUNT	KLERKSDORP						02:07:00	0	2.6
WELVERDIEND	8965	6	CENTRAL	CRESCENT	13:15:00	13:15:00	00:11:00			KLERKSDORP						02:07:00	0	9.92
WELVERDIEND	8965	6	CENTRAL	NEWMACHAVIE	13:26:00	13:26:00	00:11:00			KLERKSDORP						02:07:00	0	9.52
WELVERDIEND	8965	6	CENTRAL	KOEKEMOER	13:43:00	13:43:00	00:17:00			KLERKSDORP						02:07:00	0	13.17
WELVERDIEND	8965	7	CENTRAL	STILFONTEIN	13:46:00	13:46:00	00:03:00			KLERKSDORP						02:07:00	0	4.91
WELVERDIEND	8965	7	CENTRAL	SANDPAN	13:53:00	13:53:00	00:07:00			KLERKSDORP						02:07:00	0	2.95
WELVERDIEND	8965	7	CENTRAL	KLERKSDORP	14:07:00	00:00:00	00:14:00		RT	KLERKSDORP						02:07:00	0	6.41`;

/**
 * Eighth extract, and the largest: 27 trains from three more origins —
 * Waterval Boven, Waterval Onder and Welverdiend — including the first
 * passenger services in the sample.
 *
 * Twenty-five of the twenty-six trains carrying a summary tie on both
 * measures. The twenty-sixth exposed a defect in the day offsets, which is
 * what this block is mostly about.
 */
describe('an eighth extract: three trains, one route, byte-identical', () => {
  const byId = (id: string) => parseRunningTimes(B8).find((t) => t.train === id)!;

  /**
   * The finding. 4465, 7355 and 8965 all run WELVERDIEND -> KLERKSDORP over
   * the same twelve nodes, and their point-to-point values are identical at
   * every single one: 122 minutes of running on all three.
   *
   * Their throughputs are 122, 177 and 127 minutes. Every minute of that
   * spread is standing — 7355 stops for five minutes at eleven consecutive
   * stations, 8965 stops once, 4465 does not stop at all.
   *
   * This is the fourth pair-or-group to say it, and the first where the share
   * is 100% rather than 94% or thereabouts. Running time on a given section is
   * a constant; journey time is decided entirely by what happens standing
   * still.
   */
  it('shows three trains with identical running and every difference standing', () => {
    const [a, b, c] = ['4465', '7355', '8965'].map(byId);
    for (const t of [a, b, c]) expect(t.destination).toBe('KLERKSDORP');

    expect(a.rows.map((r) => r.station)).toEqual(b.rows.map((r) => r.station));
    expect(a.rows.map((r) => r.station)).toEqual(c.rows.map((r) => r.station));

    const running = (t: ReturnType<typeof byId>) =>
      t.rows.reduce((n, r) => n + (r.pointToPointRuntime ?? 0), 0);
    const standing = (t: ReturnType<typeof byId>) =>
      t.rows.reduce((n, r) => n + (r.standingTime ?? 0), 0);
    const sections = (t: ReturnType<typeof byId>) =>
      t.rows.map((r) => [r.station, r.pointToPointRuntime]);

    expect(running(a)).toBe(122);
    expect(running(b)).toBe(122);
    expect(running(c)).toBe(122);
    expect(sections(a)).toEqual(sections(b));
    expect(sections(a)).toEqual(sections(c));

    expect(standing(a)).toBe(0);
    expect(standing(b)).toBe(55);
    expect(standing(c)).toBe(5);

    expect(a.throughputRuntime).toBe(122);
    expect(b.throughputRuntime).toBe(177);
    expect(c.throughputRuntime).toBe(127);
    expect(b.throughputRuntime - a.throughputRuntime).toBe(standing(b) - standing(a));
    expect(c.throughputRuntime - a.throughputRuntime).toBe(standing(c) - standing(a));
  });

  /**
   * 7355's fifty-five minutes are eleven separate five-minute stops, one at
   * each station from GATSRAND to SANDPAN. A material train working its way
   * down the line, and the whole of the difference between it and a train
   * that simply runs through.
   */
  it('accounts for 7355 every five minutes at eleven stations', () => {
    const rows = byId('7355').rows.filter((r) => r.standingTime != null);
    expect(rows).toHaveLength(11);
    expect(rows.every((r) => r.standingTime === 5)).toBe(true);
    expect(rows[0].station).toBe('GATSRAND');
    expect(rows.at(-1)!.station).toBe('SANDPAN');
  });

  /**
   * The defect. 18415 departs at 23:35 and arrives at 00:42 — plainly the
   * next morning — and carries Depart_Day = 0 on every row including the
   * last. The offset was never incremented, so the elapsed time came out at
   * minus 1373 minutes instead of 67.
   *
   * A run cannot take negative time, so where the arithmetic says it does the
   * offset is treated as one day stale. This is the second column in this
   * file found to carry a value that is simply wrong rather than absent.
   */
  it('recovers 18415 from a day offset that was never incremented', () => {
    const t = byId('18415');
    expect(t.originDeparture).toBe(1415); // 23:35
    expect(t.destinationArrival).toBe(42); // 00:42
    expect(new Set(t.rows.map((r) => r.departDay))).toEqual(new Set([0]));

    expect(elapsedMinutes(t)).toBe(67);
    expect(validateSchedule(t).throughputTies).toBe(true);
    expect(validateSchedule(t).elapsedIdentityHolds).toBe(true);
  });

  /**
   * Every other train in the extract that carries a summary ties on both
   * measures, including 29405 at 22h55 across a midnight and 88586 at 7h06
   * across three corridors.
   */
  it('ties every other summarised train in the extract', () => {
    for (const t of parseRunningTimes(B8)) {
      if (t.throughputRuntime <= 0) continue; // 8915 has no summary row
      const v = validateSchedule(t);
      expect([t.train, v.throughputTies]).toEqual([t.train, true]);
      expect([t.train, v.elapsedIdentityHolds]).toEqual([t.train, true]);
    }
  });

  /**
   * 18420 and 18818 are the same service twice: same origin, same
   * destination, same departure of 10:05, same train type, same schedule, the
   * same sixteen nodes and the same runtime at every one of them. Identical
   * under two train numbers.
   *
   * 28818 shares the node list and every runtime but departs at 05:23 and is
   * typed as a light loco. Three trains, one timetable.
   */
  it('lists one service twice under two train numbers', () => {
    const [a, b, c] = ['18420', '18818', '28818'].map(byId);
    expect(a.rows.map((r) => r.station)).toEqual(b.rows.map((r) => r.station));
    expect(a.rows.map((r) => r.pointToPointRuntime))
      .toEqual(b.rows.map((r) => r.pointToPointRuntime));
    expect(a.originDeparture).toBe(b.originDeparture);
    expect(a.trainType).toBe(b.trainType);
    expect(a.throughputRuntime).toBe(b.throughputRuntime);

    expect(c.rows.map((r) => r.station)).toEqual(a.rows.map((r) => r.station));
    expect(c.rows.map((r) => r.pointToPointRuntime))
      .toEqual(a.rows.map((r) => r.pointToPointRuntime));
    expect(c.originDeparture).not.toBe(a.originDeparture);
  });

  /**
   * The first passenger services. They bring three standing reasons the file
   * has never used: PLATFORM for a station stop, PASSENGERS for boarding, and
   * STEAM LOCO on the Rovos Rail working, twenty-five minutes at RAYTON.
   */
  it('brings passenger workings and their own standing reasons', () => {
    expect(byId('88501').trainType).toBe('PASSENGER TRN/OOSTERLIJN');
    expect(byId('88586').trainType).toBe('PASSENGER TRN/ROVOS RAIL');

    const platform = byId('88501').rows.find((r) => r.station === 'NELSPRUIT')!;
    expect(platform.standingReason).toBe('PLATFORM');
    expect(platform.standingTime).toBe(22);

    expect(byId('88586').rows.find((r) => r.station === 'WATERVALBOVEN')!.standingReason)
      .toBe('PASSENGERS');
    const rayton = byId('88586').rows.find((r) => r.station === 'RAYTON')!;
    expect(rayton.standingReason).toBe('STEAM LOCO');
    expect(rayton.standingTime).toBe(25);
  });

  /**
   * A third frequency code. 88501 runs NNNNNNY — Sunday only — so Y, A and N
   * are three states, not two, and a service cannot be assumed daily.
   */
  it('adds a third frequency code', () => {
    expect(byId('88501').frequency).toBe('NNNNNNY');
    expect(new Set(parseRunningTimes(B8).map((t) => t.frequency).flatMap((f) => [...f])))
      .toEqual(new Set(['Y', 'A', 'N']));
  });

  /**
   * 88586 crosses three corridors: NORTHEAST for most of its length, then
   * CENTRAL for the last fourteen rows into Pretoria. It is the first train
   * in the sample to touch CENTRAL from the northeast.
   */
  it('runs a train across three corridors', () => {
    const corridors = [...new Set(byId('88586').rows.map((r) => r.corridor))];
    expect(corridors).toEqual(['NORTHEAST', 'CENTRAL']);
    expect(byId('88586').destination).toBe('CPK-GOEDERE');
  });

  /**
   * 28820's last row carries no point-to-point runtime at all, and it is the
   * destination. A terminus with no arrival leg recorded.
   */
  it('carries a terminus with no runtime recorded', () => {
    const last = byId('28820').rows.at(-1)!;
    expect(last.station).toBe('CLA/S643963');
    expect(last.pointToPointRuntime).toBeNull();
    expect(last.departure).toBe(0);
    expect(validateSchedule(byId('28820')).throughputTies).toBe(true);
  });

  /**
   * NLP-MATAFFIN is reached at 07:35 on 18801, which is the same instant
   * WESTAFFIN was reached, with no runtime between them. Two nodes, one
   * moment — so arrival time does not order the rows of this file either.
   */
  it('records two stations reached at the same instant', () => {
    const rows = byId('18801').rows;
    const i = rows.findIndex((r) => r.station === 'NLP-MATAFFIN');
    expect(rows[i - 1].station).toBe('WESTAFFIN');
    expect(rows[i].arrival).toBe(rows[i - 1].arrival);
    expect(rows[i].pointToPointRuntime).toBeNull();
  });

  /**
   * 29405 stands 353 minutes at ERMELO — five hours fifty-three — the largest
   * single stand in the sample, ahead of Warronton's 321 on 7405.
   */
  it('records the largest stand in the sample', () => {
    const ermelo = byId('29405').rows.find((r) => r.station === 'ERMELO')!;
    expect(ermelo.standingTime).toBe(353);
    expect(ermelo.standingReason).toBe('RM');
    expect(byId('29405').throughputRuntime).toBe(1375);
  });
});

const B9 = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
WOR-NOORD	83	1	CAPE	WOR-NOORD		06:00:00				KARRINGMELK	06:00:00	11:15:00	3	YYYCYCY	VACUUM TRAINS/MATERIAL TRN	05:15:00	0	
WOR-NOORD	83	1	CAPE	OVERHEX	06:15:00	06:16:00	00:15:00	00:01:00	B	KARRINGMELK						05:15:00	0	9.64
WOR-NOORD	83	1	CAPE	NUY	06:23:00	06:24:00	00:07:00	00:01:00	SHUNT	KARRINGMELK						05:15:00	0	5.41
WOR-NOORD	83	1	CAPE	MOWERS	06:37:00	06:38:00	00:13:00	00:01:00		KARRINGMELK						05:15:00	0	8.33
WOR-NOORD	83	1	CAPE	LANGVLEI	06:51:00	06:52:00	00:13:00	00:01:00	SHUNT	KARRINGMELK						05:15:00	0	8.64
WOR-NOORD	83	2	CAPE	LVL/S141895	06:53:00	06:55:00	00:01:00	00:02:00	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	3	CAPE	LANGVLEI	06:58:00	06:59:00	00:03:00	00:01:00	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	4	CAPE	VINK	07:01:00	07:02:00	00:02:00	00:01:00		KARRINGMELK						05:15:00	0	5.49
WOR-NOORD	83	4	CAPE	ROBERTSON(K/C	07:18:00	07:18:10	00:16:00	00:00:10	SHUNT	KARRINGMELK						05:15:00	0	10.88
WOR-NOORD	83	5	CAPE	ROR/S144061	07:18:15	07:18:25		00:00:10	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	5	CAPE	ROR/S144088	07:18:30	07:18:35			SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	5	CAPE	ROR/S144096	07:18:40	07:18:45			SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	6	CAPE	ROR/S144088	07:18:50	07:18:55			SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	6	CAPE	ROR/S144061	07:19:00	07:19:10		00:00:10	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	6	CAPE	ROBERTSON(K/C	07:19:20	07:20:00	00:00:10	00:00:40	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	7	CAPE	KLAASVOOGDSRI	07:33:00	07:33:30	00:13:00	00:00:30		KARRINGMELK						05:15:00	0	9.01
WOR-NOORD	83	7	CAPE	SANDVLIET	07:43:00	07:43:30	00:09:30	00:00:30		KARRINGMELK						05:15:00	0	6.58
WOR-NOORD	83	7	CAPE	ASHTON	07:48:00	07:48:05	00:04:30		SHUNT	KARRINGMELK						05:15:00	0	2.6
WOR-NOORD	83	8	CAPE	AHT/S147206	07:48:10	07:48:15			SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	8	CAPE	AHT/S147842	07:48:20	07:48:25			SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	8	CAPE	AHT/S148024	07:48:30	07:48:35			SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	9	CAPE	AHT/S147842	07:48:40	07:48:45			SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	9	CAPE	AHT/S147206	07:49:00	07:49:15	00:00:15	00:00:15	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	9	CAPE	ASHTON	07:49:30	07:50:00	00:00:15	00:00:30	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	10	CAPE	BONNIEVALE	08:24:00	08:24:30	00:34:00	00:00:30	SHUNT	KARRINGMELK						05:15:00	0	16.96
WOR-NOORD	83	10	CAPE	MERWESPONT	08:36:00	08:37:00	00:11:30	00:01:00		KARRINGMELK						05:15:00	0	6.11
WOR-NOORD	83	10	CAPE	DREW	08:49:00	08:50:00	00:12:00	00:01:00	SHUNT	KARRINGMELK						05:15:00	0	7.96
WOR-NOORD	83	10	CAPE	JUBILEE	09:15:00	09:16:00	00:25:00	00:01:00	SHUNT	KARRINGMELK						05:15:00	0	14.16
WOR-NOORD	83	10	CAPE	LEEURIVIER	09:25:00	09:25:30	00:09:00	00:00:30		KARRINGMELK						05:15:00	0	4.25
WOR-NOORD	83	10	CAPE	VOORHUIS	09:30:00	09:30:30	00:04:30	00:00:30		KARRINGMELK						05:15:00	0	1.75
WOR-NOORD	83	10	CAPE	SWELLENDAM	09:58:00	09:58:15	00:27:30	00:00:15	SHUNT	KARRINGMELK						05:15:00	0	15.01
WOR-NOORD	83	11	CAPE	SWD/S144517	09:58:30	09:58:45	00:00:15	00:00:15	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	11	CAPE	SWD/S144525	09:59:00	09:59:15	00:00:15	00:00:15	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	11	CAPE	SWD/S145262	09:59:30	09:59:45	00:00:15	00:00:15	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	12	CAPE	SWD/S144525	10:00:00	10:00:15	00:00:15	00:00:15	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	12	CAPE	SWD/S144517	10:00:30	10:00:45	00:00:15	00:00:15	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	12	CAPE	SWELLENDAM	10:01:00	10:02:00	00:00:15	00:01:00	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	13	CAPE	BUFFELJAGSRIV	10:21:00	10:21:05	00:19:00		SHUNT	KARRINGMELK						05:15:00	0	10.51
WOR-NOORD	83	14	CAPE	BJS/S140236	10:21:10	10:21:15			SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	15	CAPE	BUFFELJAGSRIV	10:21:30	10:22:00	00:00:15	00:00:30	SHUNT	KARRINGMELK						05:15:00	0	0.97
WOR-NOORD	83	16	CAPE	BONTBOKSKLOOF	10:37:00	10:37:30	00:15:00	00:00:30	SHUNT	KARRINGMELK						05:15:00	0	8.02
WOR-NOORD	83	16	CAPE	NIEKERKSHEK	10:47:00	10:47:15	00:09:30	00:00:15		KARRINGMELK						05:15:00	0	7.54
WOR-NOORD	83	16	CAPE	RENIER	11:01:00	11:01:15	00:13:45	00:00:15		KARRINGMELK						05:15:00	0	7.42
WOR-NOORD	83	16	CAPE	KARRINGMELK	11:15:00	00:00:00	00:13:45		XP	KARRINGMELK						05:15:00	0	8.42
WOR-NOORD	92	1	CAPE	WOR-NOORD		10:25:00				BELLVILLE	10:25:00	15:45:00	3	YYYYYYY	VACUUM TRAINS/MATERIAL TRN	05:20:00	0	
WOR-NOORD	92	1	CAPE	WORCESTER	10:32:00	10:34:00	00:07:00	00:02:00	B SHUNT	BELLVILLE						05:20:00	0	8.16
WOR-NOORD	92	2	CAPE	CHAVONNES	10:44:00	10:46:00	00:10:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	6.7
WOR-NOORD	92	2	CAPE	GOUDINIWEG	10:56:00	10:58:00	00:10:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	5.96
WOR-NOORD	92	3	CAPE	BOTHA	11:08:00	11:10:00	00:10:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	7.2
WOR-NOORD	92	3	CAPE	BREERIVIER	11:20:00	11:22:00	00:10:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	6.62
WOR-NOORD	92	3	CAPE	ROMANSRIVIER	11:31:00	11:33:00	00:09:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	5.66
WOR-NOORD	92	3	CAPE	LAPLAISANTE	11:35:00	11:35:00	00:02:00		SHUNT	BELLVILLE						05:20:00	0	2.02
WOR-NOORD	92	3	CAPE	WOLSELEY	11:44:00	11:46:00	00:09:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	5.05
WOR-NOORD	92	4	CAPE	ARTOIS	12:00:00	12:02:00	00:14:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	5.95
WOR-NOORD	92	4	CAPE	TULBAGHWEG	12:19:00	12:21:00	00:17:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	8.92
WOR-NOORD	92	4	CAPE	GOUDA	12:34:00	12:34:15	00:13:00	00:00:15	SHUNT	BELLVILLE						05:20:00	0	7.26
WOR-NOORD	92	5	CAPE	GDD/S147699	12:34:30	12:34:45	00:00:15	00:00:15	SHUNT	BELLVILLE						05:20:00	0	0.97
WOR-NOORD	92	6	CAPE	GOUDA	12:35:00	12:36:00	00:00:15	00:01:00	SHUNT	BELLVILLE						05:20:00	0	0.97
WOR-NOORD	92	7	CAPE	VOELVLEI	12:48:00	12:50:00	00:12:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	7.48
WOR-NOORD	92	7	CAPE	HERMON	13:04:00	13:06:00	00:14:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	7.62
WOR-NOORD	92	8	CAPE	SOETENDAL	13:19:00	13:19:15	00:13:00	00:00:15	SHUNT	BELLVILLE						05:20:00	0	10.57
WOR-NOORD	92	9	CAPE	SNL/S144371	13:19:30	13:19:45	00:00:15	00:00:15	SHUNT	BELLVILLE						05:20:00	0	0.97
WOR-NOORD	92	10	CAPE	SOETENDAL	13:20:00	13:21:00	00:00:15	00:01:00	SHUNT	BELLVILLE						05:20:00	0	0.97
WOR-NOORD	92	11	CAPE	MALAN	13:33:00	13:35:00	00:12:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	1.33
WOR-NOORD	92	11	CAPE	WELLINGTON	13:47:00	13:49:00	00:12:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	13.71
WOR-NOORD	92	12	CAPE	MBEKWENI	13:52:00	13:52:00	00:03:00		SHUNT	BELLVILLE						05:20:00	0	4.53
WOR-NOORD	92	12	CAPE	DALJOSAFAT	14:02:00	14:04:00	00:10:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	3.58
WOR-NOORD	92	13	CAPE	HUGUENOT	14:08:00	14:10:00	00:04:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	2.52
WOR-NOORD	92	14	CAPE	PAARL	14:17:00	14:19:00	00:07:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	4.24
WOR-NOORD	92	15	CAPE	KLAPMUTS	14:36:00	14:38:00	00:17:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	10.68
WOR-NOORD	92	15	CAPE	MULDERSVLEI	14:48:00	14:50:00	00:10:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	5.79
WOR-NOORD	92	16	CAPE	KRAAIFONTEIN	15:06:00	15:08:00	00:16:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	10.21
WOR-NOORD	92	17	CAPE	EIKENFONTEIN	15:10:00	15:10:00	00:02:00			BELLVILLE						05:20:00	0	1.66
WOR-NOORD	92	17	CAPE	BRACKENFELL	15:19:00	15:21:00	00:09:00	00:02:00	SHUNT	BELLVILLE						05:20:00	0	3.37
WOR-NOORD	92	18	CAPE	STIKLAND	15:32:00	15:32:00	00:11:00			BELLVILLE						05:20:00	0	3.85
WOR-NOORD	92	19	CAPE	BELLVILLE	15:45:00	00:00:00	00:13:00		RT	BELLVILLE						05:20:00	0	2.79
WOR-NOORD	93	1	CAPE	WOR-NOORD		06:00:00				LAINGSBURG	06:00:00	10:30:00	3	YYYYYYY	VACUUM TRAINS/MATERIAL TRN	04:30:00	0	
WOR-NOORD	93	1	CAPE	DEWET	06:12:00	06:14:00	00:12:00	00:02:00	B SHUNT	LAINGSBURG						04:30:00	0	5.12
WOR-NOORD	93	1	CAPE	SANDHILLS	06:27:00	06:29:00	00:13:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	10.97
WOR-NOORD	93	1	CAPE	HEXRIVIER	06:36:00	06:38:00	00:07:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	5.83
WOR-NOORD	93	1	CAPE	ORCHARD	06:42:00	06:44:00	00:04:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	3.08
WOR-NOORD	93	2	CAPE	DEDOORNS	06:50:00	06:52:00	00:06:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	4.29
WOR-NOORD	93	3	CAPE	ALMERIA	07:01:00	07:03:00	00:09:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	8.05
WOR-NOORD	93	3	CAPE	SALBAR	07:13:00	07:15:00	00:10:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	6.58
WOR-NOORD	93	3	CAPE	HEXTON	07:26:00	07:28:00	00:11:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	7.25
WOR-NOORD	93	3	CAPE	KLEINSTRAAT	07:42:00	07:44:00	00:14:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	11.41
WOR-NOORD	93	4	CAPE	HUGO	07:50:00	07:52:00	00:06:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	2.7
WOR-NOORD	93	4	CAPE	TOUWSRIVIER	08:03:00	08:05:00	00:11:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	7.4
WOR-NOORD	93	5	CAPE	DRAAI	08:14:00	08:16:00	00:09:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	5.66
WOR-NOORD	93	5	CAPE	JANDEBOERS	08:25:00	08:27:00	00:09:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	7.12
WOR-NOORD	93	5	CAPE	QUARRY	08:36:00	08:38:00	00:09:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	6.38
WOR-NOORD	93	5	CAPE	KONSTABEL	08:48:00	08:50:00	00:10:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	7.65
WOR-NOORD	93	5	CAPE	TWEEDSIDE	09:00:00	09:02:00	00:10:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	7.55
WOR-NOORD	93	5	CAPE	PIETERMEINTJE	09:10:00	09:12:00	00:08:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	5.99
WOR-NOORD	93	5	CAPE	MEMORIAL	09:21:00	09:23:00	00:09:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	5.32
WOR-NOORD	93	5	CAPE	BANTAMS	09:30:00	09:32:00	00:07:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	4.87
WOR-NOORD	93	5	CAPE	MATJIESFONTEI	09:41:00	09:43:00	00:09:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	5.58
WOR-NOORD	93	5	CAPE	WHITEHILL	09:51:00	09:53:00	00:08:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	5.29
WOR-NOORD	93	5	CAPE	SKEIDING	09:59:00	10:01:00	00:06:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	4.79
WOR-NOORD	93	5	CAPE	BAVIAAN	10:10:00	10:12:00	00:09:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	5.86
WOR-NOORD	93	5	CAPE	VISKUIL	10:21:00	10:23:00	00:09:00	00:02:00	SHUNT	LAINGSBURG						04:30:00	0	5.83
WOR-NOORD	93	5	CAPE	LAINGSBURG	10:30:00	00:00:00	00:07:00		RT SHUNT	LAINGSBURG						04:30:00	0	5.37
WOR-NOORD	1006	1	CAPE	WOR-NOORD		13:30:00				WSY/S148016	13:30:00	14:35:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:05:00	0	
WOR-NOORD	1006	1	CAPE	WORCESTER	13:39:00	13:39:00	00:09:00		B	WSY/S148016						01:05:00	0	8.16
WOR-NOORD	1006	2	CAPE	CHAVONNES	13:48:00	13:49:00	00:09:00	00:01:00	RANGEER	WSY/S148016						01:05:00	0	6.7
WOR-NOORD	1006	2	CAPE	GOUDINIWEG	13:56:00	13:56:10	00:07:00	00:00:10	RANGEER	WSY/S148016						01:05:00	0	5.96
WOR-NOORD	1006	3	CAPE	GDG/S141526	13:56:20	13:56:30	00:00:10	00:00:10	RANGEER	WSY/S148016						01:05:00	0	0.97
WOR-NOORD	1006	4	CAPE	GOUDINIWEG	13:56:45	13:57:00	00:00:15	00:00:15	RANGEER	WSY/S148016						01:05:00	0	0.97
WOR-NOORD	1006	5	CAPE	BOTHA	14:05:00	14:05:15	00:08:00	00:00:15	SHUNT	WSY/S148016						01:05:00	0	7.2
WOR-NOORD	1006	5	CAPE	BREERIVIER	14:14:00	14:16:00	00:08:45	00:02:00	SHUNT	WSY/S148016						01:05:00	0	6.62
WOR-NOORD	1006	5	CAPE	ROMANSRIVIER	14:23:00	14:25:00	00:07:00	00:02:00	SHUNT	WSY/S148016						01:05:00	0	5.66
WOR-NOORD	1006	5	CAPE	LAPLAISANTE	14:25:00	14:25:00				WSY/S148016						01:05:00	0	2.02
WOR-NOORD	1006	5	CAPE	WOLSELEY	14:32:00	14:33:00	00:07:00	00:01:00	RANGEER	WSY/S148016						01:05:00	0	5.05
WOR-NOORD	1006	6	CAPE	WSY/S148016	14:35:00	00:00:00	00:02:00		RT	WSY/S148016						01:05:00	0	0.97
WOR-NOORD	1039	1	CAPE	WOR-NOORD		06:15:00				TOUWSRIVIER	06:15:00	08:20:00	3	YYYYYYY	VACUUM TRAINS/PICKUP TRAIN	02:05:00	0	
WOR-NOORD	1039	1	CAPE	DEWET	06:26:00	06:26:00	00:11:00		B	TOUWSRIVIER						02:05:00	0	5.12
WOR-NOORD	1039	1	CAPE	SANDHILLS	06:38:30	06:38:45	00:12:30	00:00:15	SHUNT	TOUWSRIVIER						02:05:00	0	10.97
WOR-NOORD	1039	1	CAPE	HEXRIVIER	06:44:00	06:44:00	00:05:15			TOUWSRIVIER						02:05:00	0	5.83
WOR-NOORD	1039	1	CAPE	ORCHARD	06:47:00	06:47:05	00:03:00		SHUNT	TOUWSRIVIER						02:05:00	0	3.08
WOR-NOORD	1039	2	CAPE	ODR/S142697	06:47:10	06:47:12			SHUNT	TOUWSRIVIER						02:05:00	0	0.97
WOR-NOORD	1039	2	CAPE	ODR/S142662	06:47:14	06:47:16			SHUNT	TOUWSRIVIER						02:05:00	0	0.97
WOR-NOORD	1039	3	CAPE	ODR/S142697	06:47:18	06:47:20			SHUNT	TOUWSRIVIER						02:05:00	0	0.97
WOR-NOORD	1039	3	CAPE	ORCHARD	06:47:25	06:47:30			SHUNT	TOUWSRIVIER						02:05:00	0	0.97
WOR-NOORD	1039	4	CAPE	DEDOORNS	06:52:15	06:52:30	00:04:45	00:00:15	SHUNT &amp; X 1214	TOUWSRIVIER						02:05:00	0	4.29
WOR-NOORD	1039	5	CAPE	ALMERIA	07:00:30	07:00:30	00:08:00			TOUWSRIVIER						02:05:00	0	8.05
WOR-NOORD	1039	5	CAPE	SALBAR	07:09:30	07:09:30	00:09:00			TOUWSRIVIER						02:05:00	0	6.58
WOR-NOORD	1039	5	CAPE	HEXTON	07:19:00	07:19:00	00:09:30		X 81002	TOUWSRIVIER						02:05:00	0	7.25
WOR-NOORD	1039	5	CAPE	KLEINSTRAAT	07:32:00	07:45:00	00:13:00	00:13:00	SHUNT &amp; X 81002	TOUWSRIVIER						02:05:00	0	11.41
WOR-NOORD	1039	6	CAPE	HUGO	07:50:30	07:50:30	00:05:30			TOUWSRIVIER						02:05:00	0	2.7
WOR-NOORD	1039	6	CAPE	TOUWSRIVIER	08:00:00	08:19:00	00:09:30	00:19:00	SHUNT	TOUWSRIVIER						02:05:00	0	7.4
WOR-NOORD	1039	7	CAPE	TOW/S161527	08:19:30	08:19:45	00:00:30	00:00:15	SHUNT	TOUWSRIVIER						02:05:00	0	0.97
WOR-NOORD	1039	8	CAPE	TOUWSRIVIER	08:20:00	00:00:00	00:00:15		RT	TOUWSRIVIER						02:05:00	0	0.97
WOR-NOORD	1053	1	CAPE	WOR-NOORD		11:50:00				ASHTON	11:50:00	13:45:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:55:00	0	
WOR-NOORD	1053	1	CAPE	OVERHEX	12:05:00	12:05:00	00:15:00		B	ASHTON						01:55:00	0	9.64
WOR-NOORD	1053	1	CAPE	NUY	12:13:00	12:18:00	00:08:00	00:05:00	SHUNT	ASHTON						01:55:00	0	5.41
WOR-NOORD	1053	1	CAPE	MOWERS	12:32:00	12:32:00	00:14:00			ASHTON						01:55:00	0	8.33
WOR-NOORD	1053	1	CAPE	LANGVLEI	12:45:00	12:46:00	00:13:00	00:01:00	SHUNT	ASHTON						01:55:00	0	8.64
WOR-NOORD	1053	2	CAPE	LVL/S141895	12:47:00	12:47:30	00:01:00	00:00:30	SHUNT	ASHTON						01:55:00	0	0.97
WOR-NOORD	1053	3	CAPE	LANGVLEI	12:48:00	12:50:00	00:00:30	00:02:00	SHUNT	ASHTON						01:55:00	0	0.97
WOR-NOORD	1053	4	CAPE	VINK	12:59:00	12:59:00	00:09:00			ASHTON						01:55:00	0	5.49
WOR-NOORD	1053	4	CAPE	ROBERTSON(K/C	13:15:00	13:15:15	00:16:00	00:00:15	SHUNT	ASHTON						01:55:00	0	10.88
WOR-NOORD	1053	5	CAPE	ROR/S144061	13:15:30	13:15:45	00:00:15	00:00:15	SHUNT	ASHTON						01:55:00	0	0.97
WOR-NOORD	1053	5	CAPE	ROR/S144088	13:16:00	13:16:15	00:00:15	00:00:15	SHUNT	ASHTON						01:55:00	0	0.97
WOR-NOORD	1053	5	CAPE	ROR/S144096	13:16:30	13:16:45	00:00:15	00:00:15	SHUNT	ASHTON						01:55:00	0	0.97
WOR-NOORD	1053	6	CAPE	ROR/S144088	13:17:00	13:17:15	00:00:15	00:00:15	SHUNT	ASHTON						01:55:00	0	0.97
WOR-NOORD	1053	6	CAPE	ROR/S144061	13:17:30	13:18:00	00:00:15	00:00:30	SHUNT	ASHTON						01:55:00	0	0.97
WOR-NOORD	1053	6	CAPE	ROBERTSON(K/C	13:19:00	13:20:00	00:01:00	00:01:00	SHUNT	ASHTON						01:55:00	0	0.97
WOR-NOORD	1053	7	CAPE	KLAASVOOGDSRI	13:32:00	13:32:00	00:12:00			ASHTON						01:55:00	0	9.01
WOR-NOORD	1053	7	CAPE	SANDVLIET	13:40:00	13:40:00	00:08:00			ASHTON						01:55:00	0	6.58
WOR-NOORD	1053	7	CAPE	ASHTON	13:45:00	00:00:00	00:05:00		RT	ASHTON						01:55:00	0	2.6
WOR-NOORD	1104	1	CAPE	WOR-NOORD		23:25:00				BELLVILLE	23:25:00	03:40:00	3	YYYYYYY	VACUUM TRAINS/PICKUP TRAIN	04:15:00	0	
WOR-NOORD	1104	1	CAPE	WORCESTER	23:33:30	23:33:30	00:08:30		B	BELLVILLE						04:15:00	0	8.16
WOR-NOORD	1104	2	CAPE	CHAVONNES	23:42:30	23:42:30	00:09:00			BELLVILLE						04:15:00	0	6.7
WOR-NOORD	1104	2	CAPE	GOUDINIWEG	23:49:30	23:49:30	00:07:00			BELLVILLE						04:15:00	0	5.96
WOR-NOORD	1104	3	CAPE	BOTHA	23:57:30	23:57:30	00:08:00			BELLVILLE						04:15:00	0	7.2
WOR-NOORD	1104	3	CAPE	BREERIVIER	00:06:30	00:11:00	00:09:00	00:04:30	X 8485	BELLVILLE						04:15:00	1	6.62
WOR-NOORD	1104	3	CAPE	ROMANSRIVIER	00:18:00	00:18:00	00:07:00			BELLVILLE						04:15:00	1	5.66
WOR-NOORD	1104	3	CAPE	LAPLAISANTE	00:18:00	00:18:00				BELLVILLE						04:15:00	1	2.02
WOR-NOORD	1104	3	CAPE	WOLSELEY	00:28:00	00:32:30	00:10:00	00:04:30	SHUNT	BELLVILLE						04:15:00	1	5.05
WOR-NOORD	1104	4	CAPE	ARTOIS	00:42:30	00:47:00	00:10:00	00:04:30	SHUNT	BELLVILLE						04:15:00	1	5.95
WOR-NOORD	1104	4	CAPE	TULBAGHWEG	01:00:30	01:05:00	00:13:30	00:04:30	SHUNT	BELLVILLE						04:15:00	1	8.92
WOR-NOORD	1104	4	CAPE	GOUDA	01:16:00	01:16:30	00:11:00	00:00:30	SHUNT	BELLVILLE						04:15:00	1	7.26
WOR-NOORD	1104	5	CAPE	GDD/S147699	01:17:00	01:18:00	00:00:30	00:01:00	SHUNT	BELLVILLE						04:15:00	1	0.97
WOR-NOORD	1104	6	CAPE	GOUDA	01:19:00	01:20:30	00:01:00	00:01:30	SHUNT	BELLVILLE						04:15:00	1	0.97
WOR-NOORD	1104	7	CAPE	VOELVLEI	01:30:00	01:34:00	00:09:30	00:04:00	SHUNT	BELLVILLE						04:15:00	1	7.48
WOR-NOORD	1104	7	CAPE	HERMON	01:46:30	01:47:30	00:12:30	00:01:00	SHUNT &amp; X 2025 / 2031	BELLVILLE						04:15:00	1	7.62
WOR-NOORD	1104	8	CAPE	SOETENDAL	02:01:30	02:01:35	00:14:00		SHUNT	BELLVILLE						04:15:00	1	10.57
WOR-NOORD	1104	9	CAPE	SNL/S144371	02:01:40	02:01:45			SHUNT	BELLVILLE						04:15:00	1	0.97
WOR-NOORD	1104	10	CAPE	SOETENDAL	02:02:00	02:02:30	00:00:15	00:00:30	SHUNT	BELLVILLE						04:15:00	1	0.97
WOR-NOORD	1104	11	CAPE	MALAN	02:12:30	02:13:30	00:10:00	00:01:00	SHUNT	BELLVILLE						04:15:00	1	1.33
WOR-NOORD	1104	11	CAPE	WELLINGTON	02:22:30	02:23:30	00:09:00	00:01:00	SHUNT	BELLVILLE						04:15:00	1	13.71
WOR-NOORD	1104	12	CAPE	MBEKWENI	02:27:30	02:27:30	00:04:00			BELLVILLE						04:15:00	1	4.53
WOR-NOORD	1104	12	CAPE	DALJOSAFAT	02:33:00	02:34:00	00:05:30	00:01:00	SHUNT	BELLVILLE						04:15:00	1	3.58
WOR-NOORD	1104	13	CAPE	HUGUENOT	02:38:00	02:38:00	00:04:00			BELLVILLE						04:15:00	1	2.52
WOR-NOORD	1104	14	CAPE	PAARL	02:43:00	02:43:00	00:05:00			BELLVILLE						04:15:00	1	4.24
WOR-NOORD	1104	15	CAPE	KLAPMUTS	02:56:00	02:56:00	00:13:00			BELLVILLE						04:15:00	1	10.68
WOR-NOORD	1104	15	CAPE	MULDERSVLEI	03:04:00	03:04:00	00:08:00			BELLVILLE						04:15:00	1	5.79
WOR-NOORD	1104	16	CAPE	KRAAIFONTEIN	03:16:00	03:16:00	00:12:00			BELLVILLE						04:15:00	1	10.21
WOR-NOORD	1104	17	CAPE	EIKENFONTEIN	03:16:00	03:16:00				BELLVILLE						04:15:00	1	1.66
WOR-NOORD	1104	17	CAPE	BRACKENFELL	03:23:00	03:23:00	00:07:00			BELLVILLE						04:15:00	1	3.37
WOR-NOORD	1104	18	CAPE	STIKLAND	03:28:30	03:28:30	00:05:30			BELLVILLE						04:15:00	1	3.85
WOR-NOORD	1104	19	CAPE	BELLVILLE	03:40:00	00:00:00	00:11:30		RT	BELLVILLE						04:15:00	1	2.79
WOR-NOORD	1108	1	CAPE	WOR-NOORD		05:05:00				HERMON	05:05:00	07:10:00	3	YCYCYYY	VACUUM TRAINS/FEEDER TRAIN	02:05:00	0	
WOR-NOORD	1108	1	CAPE	WORCESTER	05:13:30	05:13:30	00:08:30		B	HERMON						02:05:00	0	8.16
WOR-NOORD	1108	2	CAPE	CHAVONNES	05:22:30	05:22:30	00:09:00			HERMON						02:05:00	0	6.7
WOR-NOORD	1108	2	CAPE	GOUDINIWEG	05:29:30	05:29:35	00:07:00		SHUNT	HERMON						02:05:00	0	5.96
WOR-NOORD	1108	3	CAPE	GDG/S141526	05:29:40	05:29:45			SHUNT	HERMON						02:05:00	0	0.97
WOR-NOORD	1108	4	CAPE	GOUDINIWEG	05:30:00	05:30:30	00:00:15	00:00:30	SHUNT	HERMON						02:05:00	0	0.97
WOR-NOORD	1108	5	CAPE	BOTHA	05:38:30	05:38:30	00:08:00			HERMON						02:05:00	0	7.2
WOR-NOORD	1108	5	CAPE	BREERIVIER	05:47:30	05:48:30	00:09:00	00:01:00		HERMON						02:05:00	0	6.62
WOR-NOORD	1108	5	CAPE	ROMANSRIVIER	05:55:30	05:55:30	00:07:00			HERMON						02:05:00	0	5.66
WOR-NOORD	1108	5	CAPE	LAPLAISANTE	05:55:30	05:55:30				HERMON						02:05:00	0	2.02
WOR-NOORD	1108	5	CAPE	WOLSELEY	06:05:30	06:05:40	00:10:00	00:00:10	SHUNT	HERMON						02:05:00	0	5.05
WOR-NOORD	1108	6	CAPE	WSY/S148016	06:05:50	06:05:55	00:00:10		SHUNT	HERMON						02:05:00	0	0.97
WOR-NOORD	1108	7	CAPE	WOLSELEY	06:06:00	06:07:00		00:01:00	SHUNT	HERMON						02:05:00	0	0.97
WOR-NOORD	1108	8	CAPE	ARTOIS	06:17:00	06:17:00	00:10:00			HERMON						02:05:00	0	5.95
WOR-NOORD	1108	8	CAPE	TULBAGHWEG	06:30:30	06:30:30	00:13:30			HERMON						02:05:00	0	8.92
WOR-NOORD	1108	8	CAPE	GOUDA	06:41:30	06:42:00	00:11:00	00:00:30	SHUNT	HERMON						02:05:00	0	7.26
WOR-NOORD	1108	9	CAPE	GDD/S147699	06:42:30	06:42:55	00:00:30	00:00:25	SHUNT	HERMON						02:05:00	0	0.97
WOR-NOORD	1108	10	CAPE	GOUDA	06:44:00	06:45:00	00:01:05	00:01:00	SHUNT	HERMON						02:05:00	0	0.97
WOR-NOORD	1108	11	CAPE	VOELVLEI	06:55:30	06:55:30	00:10:30			HERMON						02:05:00	0	7.48
WOR-NOORD	1108	11	CAPE	HERMON	07:10:00	00:00:00	00:14:30		RT	HERMON						02:05:00	0	7.62
WOR-NOORD	1112	1	CAPE	WOR-NOORD		17:25:00				BELLVILLE	17:25:00	21:15:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	03:50:00	0	
WOR-NOORD	1112	1	CAPE	WORCESTER	17:33:30	17:33:30	00:08:30		B	BELLVILLE						03:50:00	0	8.16
WOR-NOORD	1112	2	CAPE	CHAVONNES	17:42:30	17:42:30	00:09:00			BELLVILLE						03:50:00	0	6.7
WOR-NOORD	1112	2	CAPE	GOUDINIWEG	17:49:30	17:49:30	00:07:00			BELLVILLE						03:50:00	0	5.96
WOR-NOORD	1112	3	CAPE	BOTHA	17:57:30	17:57:30	00:08:00			BELLVILLE						03:50:00	0	7.2
WOR-NOORD	1112	3	CAPE	BREERIVIER	18:06:30	18:11:00	00:09:00	00:04:30	X 2153	BELLVILLE						03:50:00	0	6.62
WOR-NOORD	1112	3	CAPE	ROMANSRIVIER	18:18:00	18:18:00	00:07:00			BELLVILLE						03:50:00	0	5.66
WOR-NOORD	1112	3	CAPE	LAPLAISANTE	18:18:00	18:18:00				BELLVILLE						03:50:00	0	2.02
WOR-NOORD	1112	3	CAPE	WOLSELEY	18:28:00	18:28:00	00:10:00			BELLVILLE						03:50:00	0	5.05
WOR-NOORD	1112	4	CAPE	ARTOIS	18:38:00	18:38:00	00:10:00			BELLVILLE						03:50:00	0	5.95
WOR-NOORD	1112	4	CAPE	TULBAGHWEG	18:52:00	18:52:00	00:14:00			BELLVILLE						03:50:00	0	8.92
WOR-NOORD	1112	4	CAPE	GOUDA	19:03:00	19:03:00	00:11:00			BELLVILLE						03:50:00	0	7.26
WOR-NOORD	1112	5	CAPE	VOELVLEI	19:12:00	19:12:00	00:09:00			BELLVILLE						03:50:00	0	7.48
WOR-NOORD	1112	5	CAPE	HERMON	19:24:00	19:24:00	00:12:00			BELLVILLE						03:50:00	0	7.62
WOR-NOORD	1112	6	CAPE	SOETENDAL	19:38:00	19:38:00	00:14:00			BELLVILLE						03:50:00	0	10.57
WOR-NOORD	1112	7	CAPE	MALAN	19:48:00	19:48:00	00:10:00			BELLVILLE						03:50:00	0	1.33
WOR-NOORD	1112	7	CAPE	WELLINGTON	19:57:00	19:57:00	00:09:00			BELLVILLE						03:50:00	0	13.71
WOR-NOORD	1112	8	CAPE	MBEKWENI	20:01:00	20:01:00	00:04:00			BELLVILLE						03:50:00	0	4.53
WOR-NOORD	1112	8	CAPE	DALJOSAFAT	20:07:00	20:07:00	00:06:00			BELLVILLE						03:50:00	0	3.58
WOR-NOORD	1112	9	CAPE	HUGUENOT	20:11:00	20:11:00	00:04:00			BELLVILLE						03:50:00	0	2.52
WOR-NOORD	1112	10	CAPE	PAARL	20:16:00	20:16:00	00:05:00			BELLVILLE						03:50:00	0	4.24
WOR-NOORD	1112	11	CAPE	KLAPMUTS	20:29:00	20:29:00	00:13:00			BELLVILLE						03:50:00	0	10.68
WOR-NOORD	1112	11	CAPE	MULDERSVLEI	20:37:00	20:37:00	00:08:00			BELLVILLE						03:50:00	0	5.79
WOR-NOORD	1112	12	CAPE	KRAAIFONTEIN	20:50:00	20:50:00	00:13:00			BELLVILLE						03:50:00	0	10.21
WOR-NOORD	1112	13	CAPE	EIKENFONTEIN	20:50:00	20:50:00				BELLVILLE						03:50:00	0	1.66
WOR-NOORD	1112	13	CAPE	BRACKENFELL	20:57:00	20:57:00	00:07:00			BELLVILLE						03:50:00	0	3.37
WOR-NOORD	1112	14	CAPE	STIKLAND	20:57:00	20:57:00				BELLVILLE						03:50:00	0	3.85
WOR-NOORD	1112	15	CAPE	BELLVILLE	21:15:00	00:00:00	00:18:00		RT	BELLVILLE						03:50:00	0	2.79
WOR-NOORD	1173	1	CAPE	WOR-NOORD		06:50:00				VOORBAAI	06:50:00	17:15:00	3	YYYCYCY	VACUUM TRAINS/PICKUP TRAIN	10:25:00	0	
WOR-NOORD	1173	1	CAPE	OVERHEX	07:05:00	07:05:00	00:15:00		B	VOORBAAI						10:25:00	0	9.64
WOR-NOORD	1173	1	CAPE	NUY	07:12:00	07:14:00	00:07:00	00:02:00	SHUNT	VOORBAAI						10:25:00	0	5.41
WOR-NOORD	1173	1	CAPE	MOWERS	07:26:00	07:26:00	00:12:00			VOORBAAI						10:25:00	0	8.33
WOR-NOORD	1173	1	CAPE	LANGVLEI	07:39:00	07:42:00	00:13:00	00:03:00	SHUNT	VOORBAAI						10:25:00	0	8.64
WOR-NOORD	1173	2	CAPE	LVL/S141895	07:43:00	07:46:00	00:01:00	00:03:00	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	3	CAPE	LANGVLEI	07:47:00	07:49:00	00:01:00	00:02:00	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	4	CAPE	VINK	07:56:00	07:56:00	00:07:00			VOORBAAI						10:25:00	0	5.49
WOR-NOORD	1173	4	CAPE	ROBERTSON(K/C	08:12:00	08:12:10	00:16:00	00:00:10	SHUNT	VOORBAAI						10:25:00	0	10.88
WOR-NOORD	1173	5	CAPE	ROR/S144061	08:12:15	08:12:25		00:00:10	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	5	CAPE	ROR/S144088	08:12:30	08:12:35			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	5	CAPE	ROR/S144096	08:12:40	08:12:45			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	6	CAPE	ROR/S144088	08:12:50	08:12:55			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	6	CAPE	ROR/S144061	08:13:00	08:13:10		00:00:10	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	6	CAPE	ROBERTSON(K/C	08:13:20	08:14:00	00:00:10	00:00:40	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	7	CAPE	KLAASVOOGDSRI	08:27:00	08:27:00	00:13:00			VOORBAAI						10:25:00	0	9.01
WOR-NOORD	1173	7	CAPE	SANDVLIET	08:37:00	08:37:00	00:10:00			VOORBAAI						10:25:00	0	6.58
WOR-NOORD	1173	7	CAPE	ASHTON	08:42:00	08:42:05	00:05:00		SHUNT	VOORBAAI						10:25:00	0	2.6
WOR-NOORD	1173	8	CAPE	AHT/S147206	08:42:10	08:42:15			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	8	CAPE	AHT/S147842	08:42:20	08:42:25			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	8	CAPE	AHT/S148024	08:42:30	08:42:35			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	9	CAPE	AHT/S147842	08:42:40	08:42:45			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	9	CAPE	AHT/S147206	08:43:00	08:43:15	00:00:15	00:00:15	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	9	CAPE	ASHTON	08:43:30	08:44:00	00:00:15	00:00:30	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	10	CAPE	BONNIEVALE	09:18:00	09:19:00	00:34:00	00:01:00	SHUNT	VOORBAAI						10:25:00	0	16.96
WOR-NOORD	1173	10	CAPE	MERWESPONT	09:30:00	09:30:00	00:11:00			VOORBAAI						10:25:00	0	6.11
WOR-NOORD	1173	10	CAPE	DREW	09:43:00	09:44:00	00:13:00	00:01:00	SHUNT	VOORBAAI						10:25:00	0	7.96
WOR-NOORD	1173	10	CAPE	JUBILEE	10:09:00	10:10:00	00:25:00	00:01:00	SHUNT	VOORBAAI						10:25:00	0	14.16
WOR-NOORD	1173	10	CAPE	LEEURIVIER	10:19:00	10:19:00	00:09:00			VOORBAAI						10:25:00	0	4.25
WOR-NOORD	1173	10	CAPE	VOORHUIS	10:24:00	10:24:00	00:05:00			VOORBAAI						10:25:00	0	1.75
WOR-NOORD	1173	10	CAPE	SWELLENDAM	10:52:00	10:52:15	00:28:00	00:00:15	SHUNT	VOORBAAI						10:25:00	0	15.01
WOR-NOORD	1173	11	CAPE	SWD/S144517	10:52:30	10:52:45	00:00:15	00:00:15	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	11	CAPE	SWD/S144525	10:53:00	10:53:15	00:00:15	00:00:15	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	11	CAPE	SWD/S145262	10:53:30	10:53:45	00:00:15	00:00:15	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	12	CAPE	SWD/S144525	10:54:00	10:54:15	00:00:15	00:00:15	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	12	CAPE	SWD/S144517	10:54:30	10:54:45	00:00:15	00:00:15	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	12	CAPE	SWELLENDAM	10:55:00	10:57:00	00:00:15	00:02:00	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	13	CAPE	BUFFELJAGSRIV	11:15:00	11:15:05	00:18:00		SHUNT	VOORBAAI						10:25:00	0	10.51
WOR-NOORD	1173	14	CAPE	BJS/S140236	11:15:10	11:15:15			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	15	CAPE	BUFFELJAGSRIV	11:15:30	11:16:00	00:00:15	00:00:30	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	16	CAPE	BONTBOKSKLOOF	11:31:00	11:31:30	00:15:00	00:00:30	SHUNT	VOORBAAI						10:25:00	0	8.02
WOR-NOORD	1173	16	CAPE	NIEKERKSHEK	11:41:00	11:41:00	00:09:30			VOORBAAI						10:25:00	0	7.54
WOR-NOORD	1173	16	CAPE	RENIER	11:55:00	11:55:00	00:14:00			VOORBAAI						10:25:00	0	7.42
WOR-NOORD	1173	16	CAPE	KARRINGMELK	12:10:00	12:15:00	00:15:00	00:05:00	XP SHUNT	VOORBAAI						10:25:00	0	8.42
WOR-NOORD	1173	17	CAPE	KXK/S141836	12:16:00	12:20:00	00:01:00	00:04:00	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	18	CAPE	KARRINGMELK	12:21:00	12:25:00	00:01:00	00:04:00	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	19	CAPE	VLEIDAM	12:49:00	12:49:05	00:24:00		SHUNT	VOORBAAI						10:25:00	0	11.38
WOR-NOORD	1173	20	CAPE	VLM/S144967	12:49:10	12:49:15			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	21	CAPE	VLEIDAM	12:49:30	12:50:00	00:00:15	00:00:30	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	22	CAPE	HEIDELBERGK	13:20:00	13:20:30	00:30:00	00:00:30	SHUNT	VOORBAAI						10:25:00	0	14.41
WOR-NOORD	1173	23	CAPE	HBS/S141585	13:20:45	13:21:00	00:00:15	00:00:15	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	23	CAPE	HBS/S141593	13:21:15	13:21:30	00:00:15	00:00:15	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	24	CAPE	HBS/S141585	13:21:45	13:22:00	00:00:15	00:00:15	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	24	CAPE	HEIDELBERGK	13:23:00	13:25:00	00:01:00	00:02:00	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	25	CAPE	KROMBEK	13:50:00	13:51:00	00:25:00	00:01:00	SHUNT	VOORBAAI						10:25:00	0	9.91
WOR-NOORD	1173	25	CAPE	BADENHORST	14:01:00	14:01:00	00:10:00			VOORBAAI						10:25:00	0	5.55
WOR-NOORD	1173	25	CAPE	GROOTKRAGGA	14:17:00	14:17:00	00:16:00			VOORBAAI						10:25:00	0	7.58
WOR-NOORD	1173	25	CAPE	SONRUG	14:21:00	14:21:00	00:04:00			VOORBAAI						10:25:00	0	2.54
WOR-NOORD	1173	25	CAPE	VANWYK	14:26:00	14:26:00	00:05:00			VOORBAAI						10:25:00	0	2.54
WOR-NOORD	1173	25	CAPE	RIVERSDALE	14:36:00	14:36:05	00:10:00		SHUNT	VOORBAAI						10:25:00	0	5.21
WOR-NOORD	1173	26	CAPE	RDS/S144037	14:36:10	14:36:15			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	27	CAPE	RIVERSDALE	14:36:20	14:37:00		00:00:40	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	28	CAPE	SOETMELKRIVIE	14:59:00	14:59:00	00:22:00			VOORBAAI						10:25:00	0	10.33
WOR-NOORD	1173	28	CAPE	REISIESBAAN	15:16:00	15:17:00	00:17:00	00:01:00	SHUNT	VOORBAAI						10:25:00	0	8.9
WOR-NOORD	1173	28	CAPE	DEKRIET	15:31:00	15:31:00	00:14:00			VOORBAAI						10:25:00	0	8.13
WOR-NOORD	1173	28	CAPE	ALBERTINIA	15:44:00	15:44:05	00:13:00		SHUNT	VOORBAAI						10:25:00	0	12.05
WOR-NOORD	1173	29	CAPE	ARA/S343781	15:44:10	15:44:15			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	30	CAPE	ALBERTINIA	15:44:20	15:45:00		00:00:40	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	31	CAPE	KEURFONTEIN	15:54:00	15:54:00	00:09:00			VOORBAAI						10:25:00	0	8.06
WOR-NOORD	1173	31	CAPE	LODEWYKTENK	15:58:00	15:58:00	00:04:00			VOORBAAI						10:25:00	0	3.43
WOR-NOORD	1173	31	CAPE	GOURITS	16:01:00	16:01:00	00:03:00			VOORBAAI						10:25:00	0	2.66
WOR-NOORD	1173	31	CAPE	COOPER	16:19:00	16:20:00	00:18:00	00:01:00	SHUNT	VOORBAAI						10:25:00	0	8.46
WOR-NOORD	1173	31	CAPE	KLEINBERG	16:34:00	16:34:05	00:14:00		SHUNT	VOORBAAI						10:25:00	0	10.41
WOR-NOORD	1173	32	CAPE	KLX/S341045	16:34:10	16:34:15			SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	33	CAPE	KLEINBERG	16:34:20	16:35:00		00:00:40	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	34	CAPE	BARTLESFONTEI	16:46:00	16:47:00	00:11:00	00:01:00	SHUNT	VOORBAAI						10:25:00	0	8.14
WOR-NOORD	1173	35	CAPE	BNT/S344354	16:47:30	16:48:00	00:00:30	00:00:30	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	36	CAPE	BARTLESFONTEI	16:48:30	16:49:00	00:00:30	00:00:30	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	37	CAPE	BNT/S366501	16:49:30	16:50:00	00:00:30	00:00:30	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	38	CAPE	BARTLESFONTEI	16:50:30	16:51:00	00:00:30	00:00:30	SHUNT	VOORBAAI						10:25:00	0	0.97
WOR-NOORD	1173	39	CAPE	VOORBAAI	17:15:00	00:00:00	00:24:00		RT	VOORBAAI						10:25:00	0	12
WOR-NOORD	1186	1	CAPE	WOR-NOORD		08:15:00				BELLVILLE	08:15:00	12:40:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	04:25:00	0	
WOR-NOORD	1186	1	CAPE	WORCESTER	08:23:30	08:23:30	00:08:30		B   X 1101	BELLVILLE						04:25:00	0	8.16
WOR-NOORD	1186	2	CAPE	CHAVONNES	08:32:30	08:32:30	00:09:00			BELLVILLE						04:25:00	0	6.7
WOR-NOORD	1186	2	CAPE	GOUDINIWEG	08:39:30	08:39:30	00:07:00			BELLVILLE						04:25:00	0	5.96
WOR-NOORD	1186	3	CAPE	BOTHA	08:47:30	08:47:30	00:08:00			BELLVILLE						04:25:00	0	7.2
WOR-NOORD	1186	3	CAPE	BREERIVIER	08:56:30	08:59:00	00:09:00	00:02:30	X 7651	BELLVILLE						04:25:00	0	6.62
WOR-NOORD	1186	3	CAPE	ROMANSRIVIER	09:06:00	09:06:00	00:07:00			BELLVILLE						04:25:00	0	5.66
WOR-NOORD	1186	3	CAPE	LAPLAISANTE	09:06:00	09:06:00				BELLVILLE						04:25:00	0	2.02
WOR-NOORD	1186	3	CAPE	WOLSELEY	09:16:00	09:16:00	00:10:00			BELLVILLE						04:25:00	0	5.05
WOR-NOORD	1186	4	CAPE	ARTOIS	09:26:00	09:26:00	00:10:00			BELLVILLE						04:25:00	0	5.95
WOR-NOORD	1186	4	CAPE	TULBAGHWEG	09:39:30	09:39:30	00:13:30			BELLVILLE						04:25:00	0	8.92
WOR-NOORD	1186	4	CAPE	GOUDA	09:50:30	09:50:30	00:11:00			BELLVILLE						04:25:00	0	7.26
WOR-NOORD	1186	5	CAPE	VOELVLEI	09:59:30	09:59:30	00:09:00			BELLVILLE						04:25:00	0	7.48
WOR-NOORD	1186	5	CAPE	HERMON	10:11:30	10:21:00	00:12:00	00:09:30	X 18001	BELLVILLE						04:25:00	0	7.62
WOR-NOORD	1186	6	CAPE	SOETENDAL	10:35:00	11:06:00	00:14:00	00:31:00	X 17005 &amp; F 71006	BELLVILLE						04:25:00	0	10.57
WOR-NOORD	1186	7	CAPE	MALAN	11:16:00	11:16:00	00:10:00			BELLVILLE						04:25:00	0	1.33
WOR-NOORD	1186	7	CAPE	WELLINGTON	11:25:00	11:25:00	00:09:00			BELLVILLE						04:25:00	0	13.71
WOR-NOORD	1186	8	CAPE	MBEKWENI	11:29:00	11:29:00	00:04:00			BELLVILLE						04:25:00	0	4.53
WOR-NOORD	1186	8	CAPE	DALJOSAFAT	11:34:00	11:34:00	00:05:00			BELLVILLE						04:25:00	0	3.58
WOR-NOORD	1186	9	CAPE	HUGUENOT	11:38:00	11:38:00	00:04:00			BELLVILLE						04:25:00	0	2.52
WOR-NOORD	1186	10	CAPE	PAARL	11:43:00	11:43:00	00:05:00			BELLVILLE						04:25:00	0	4.24
WOR-NOORD	1186	11	CAPE	KLAPMUTS	11:56:00	11:56:00	00:13:00			BELLVILLE						04:25:00	0	10.68
WOR-NOORD	1186	11	CAPE	MULDERSVLEI	12:04:00	12:04:00	00:08:00			BELLVILLE						04:25:00	0	5.79
WOR-NOORD	1186	12	CAPE	KRAAIFONTEIN	12:16:00	12:16:00	00:12:00			BELLVILLE						04:25:00	0	10.21
WOR-NOORD	1186	13	CAPE	EIKENFONTEIN	12:16:00	12:16:00				BELLVILLE						04:25:00	0	1.66
WOR-NOORD	1186	13	CAPE	BRACKENFELL	12:23:00	12:23:00	00:07:00			BELLVILLE						04:25:00	0	3.37
WOR-NOORD	1186	14	CAPE	STIKLAND	12:23:30	12:23:30	00:00:30			BELLVILLE						04:25:00	0	3.85
WOR-NOORD	1186	15	CAPE	BELLVILLE	12:40:00	00:00:00	00:16:30		RT	BELLVILLE						04:25:00	0	2.79
WOR-NOORD	3221	1	CAPE	WOR-NOORD		22:10:00				VOORBAAI	22:10:00	08:15:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	10:05:00	0	
WOR-NOORD	3221	1	CAPE	OVERHEX	22:25:00	22:25:00	00:15:00		B	VOORBAAI						10:05:00	0	9.64
WOR-NOORD	3221	1	CAPE	NUY	22:32:00	22:32:00	00:07:00			VOORBAAI						10:05:00	0	5.41
WOR-NOORD	3221	1	CAPE	MOWERS	22:45:00	22:45:00	00:13:00			VOORBAAI						10:05:00	0	8.33
WOR-NOORD	3221	1	CAPE	LANGVLEI	22:57:00	22:57:00	00:12:00			VOORBAAI						10:05:00	0	8.64
WOR-NOORD	3221	2	CAPE	VINK	23:05:00	23:05:00	00:08:00			VOORBAAI						10:05:00	0	5.49
WOR-NOORD	3221	2	CAPE	ROBERTSON(K/C	23:20:00	23:20:00	00:15:00			VOORBAAI						10:05:00	0	10.88
WOR-NOORD	3221	3	CAPE	KLAASVOOGDSRI	23:31:00	23:31:00	00:11:00			VOORBAAI						10:05:00	0	9.01
WOR-NOORD	3221	3	CAPE	SANDVLIET	23:40:00	23:40:00	00:09:00			VOORBAAI						10:05:00	0	6.58
WOR-NOORD	3221	3	CAPE	ASHTON	23:44:00	23:44:00	00:04:00			VOORBAAI						10:05:00	0	2.6
WOR-NOORD	3221	4	CAPE	BONNIEVALE	00:15:00	00:15:00	00:31:00			VOORBAAI						10:05:00	1	16.96
WOR-NOORD	3221	4	CAPE	MERWESPONT	00:24:00	00:24:00	00:09:00			VOORBAAI						10:05:00	1	6.11
WOR-NOORD	3221	4	CAPE	DREW	00:36:00	00:36:00	00:12:00			VOORBAAI						10:05:00	1	7.96
WOR-NOORD	3221	4	CAPE	JUBILEE	01:00:00	01:08:00	00:24:00	00:08:00	SHUNT	VOORBAAI						10:05:00	1	14.16
WOR-NOORD	3221	4	CAPE	LEEURIVIER	01:17:00	01:17:00	00:09:00			VOORBAAI						10:05:00	1	4.25
WOR-NOORD	3221	4	CAPE	VOORHUIS	01:22:00	01:22:00	00:05:00			VOORBAAI						10:05:00	1	1.75
WOR-NOORD	3221	4	CAPE	SWELLENDAM	01:50:00	01:50:10	00:28:00	00:00:10	SHUNT	VOORBAAI						10:05:00	1	15.01
WOR-NOORD	3221	5	CAPE	SWD/S144517	01:50:15	01:50:30		00:00:15	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	5	CAPE	SWD/S144525	01:50:45	01:51:00	00:00:15	00:00:15	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	5	CAPE	SWD/S145262	01:51:15	01:51:30	00:00:15	00:00:15	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	6	CAPE	SWD/S144525	01:52:00	01:52:30	00:00:30	00:00:30	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	6	CAPE	SWD/S144517	01:53:00	01:53:30	00:00:30	00:00:30	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	6	CAPE	SWELLENDAM	01:54:00	01:55:00	00:00:30	00:01:00	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	7	CAPE	BUFFELJAGSRIV	02:13:00	02:13:00	00:18:00			VOORBAAI						10:05:00	1	10.51
WOR-NOORD	3221	8	CAPE	BONTBOKSKLOOF	02:27:30	02:28:00	00:14:30	00:00:30	SHUNT	VOORBAAI						10:05:00	1	8.02
WOR-NOORD	3221	8	CAPE	NIEKERKSHEK	02:38:00	02:38:00	00:10:00			VOORBAAI						10:05:00	1	7.54
WOR-NOORD	3221	8	CAPE	RENIER	02:51:00	02:51:00	00:13:00			VOORBAAI						10:05:00	1	7.42
WOR-NOORD	3221	8	CAPE	KARRINGMELK	03:05:00	03:25:00	00:14:00	00:20:00	X / P 1620	VOORBAAI						10:05:00	1	8.42
WOR-NOORD	3221	9	CAPE	VLEIDAM	03:47:00	03:47:00	00:22:00			VOORBAAI						10:05:00	1	11.38
WOR-NOORD	3221	10	CAPE	HEIDELBERGK	04:15:00	04:16:00	00:28:00	00:01:00	SHUNT	VOORBAAI						10:05:00	1	14.41
WOR-NOORD	3221	11	CAPE	HBS/S141585	04:16:30	04:17:00	00:00:30	00:00:30	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	11	CAPE	HBS/S141593	04:17:30	04:18:00	00:00:30	00:00:30	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	12	CAPE	HBS/S141585	04:18:30	04:19:00	00:00:30	00:00:30	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	12	CAPE	HEIDELBERGK	04:19:30	04:20:00	00:00:30	00:00:30	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	13	CAPE	KROMBEK	04:43:00	04:43:00	00:23:00			VOORBAAI						10:05:00	1	9.91
WOR-NOORD	3221	13	CAPE	BADENHORST	04:53:00	04:53:00	00:10:00			VOORBAAI						10:05:00	1	5.55
WOR-NOORD	3221	13	CAPE	GROOTKRAGGA	05:09:00	05:09:00	00:16:00			VOORBAAI						10:05:00	1	7.58
WOR-NOORD	3221	13	CAPE	SONRUG	05:13:00	05:13:00	00:04:00			VOORBAAI						10:05:00	1	2.54
WOR-NOORD	3221	13	CAPE	VANWYK	05:18:00	05:18:00	00:05:00			VOORBAAI						10:05:00	1	2.54
WOR-NOORD	3221	13	CAPE	RIVERSDALE	05:28:00	05:29:00	00:10:00	00:01:00	SHUNT	VOORBAAI						10:05:00	1	5.21
WOR-NOORD	3221	14	CAPE	RDS/S144037	05:30:00	05:31:00	00:01:00	00:01:00	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	15	CAPE	RIVERSDALE	05:32:00	05:33:00	00:01:00	00:01:00	SHUNT	VOORBAAI						10:05:00	1	0.97
WOR-NOORD	3221	16	CAPE	SOETMELKRIVIE	05:54:00	05:59:00	00:21:00	00:05:00	SHUNT	VOORBAAI						10:05:00	1	10.33
WOR-NOORD	3221	16	CAPE	REISIESBAAN	06:16:00	06:16:00	00:17:00			VOORBAAI						10:05:00	1	8.9
WOR-NOORD	3221	16	CAPE	DEKRIET	06:29:00	06:29:00	00:13:00			VOORBAAI						10:05:00	1	8.13
WOR-NOORD	3221	16	CAPE	ALBERTINIA	06:42:00	06:42:00	00:13:00			VOORBAAI						10:05:00	1	12.05
WOR-NOORD	3221	17	CAPE	KEURFONTEIN	06:51:00	06:51:00	00:09:00			VOORBAAI						10:05:00	1	8.06
WOR-NOORD	3221	17	CAPE	LODEWYKTENK	06:55:00	06:55:00	00:04:00			VOORBAAI						10:05:00	1	3.43
WOR-NOORD	3221	17	CAPE	GOURITS	06:58:00	06:58:00	00:03:00			VOORBAAI						10:05:00	1	2.66
WOR-NOORD	3221	17	CAPE	COOPER	07:15:00	07:20:00	00:17:00	00:05:00	X 1174	VOORBAAI						10:05:00	1	8.46
WOR-NOORD	3221	17	CAPE	KLEINBERG	07:32:00	07:32:00	00:12:00			VOORBAAI						10:05:00	1	10.41
WOR-NOORD	3221	18	CAPE	BARTLESFONTEI	07:40:00	07:53:00	00:08:00	00:13:00		VOORBAAI						10:05:00	1	8.14
WOR-NOORD	3221	19	CAPE	VOORBAAI	08:15:00	00:00:00	00:22:00		RT	VOORBAAI						10:05:00	1	12
WOR-NOORD	3506	1	CAPE	WOR-NOORD		06:00:00				KAAPSTADPAS	06:00:00	09:25:00	1	YNNNNNN	METRO TRAIN/METRORAIL-CWN	03:25:00	0	
WOR-NOORD	3506	1	CAPE	WORCESTER	06:00:00	06:00:00			C	KAAPSTADPAS						03:25:00	0	8.16
WOR-NOORD	3506	2	CAPE	CHAVONNES	06:08:00	06:08:00	00:08:00			KAAPSTADPAS						03:25:00	0	6.7
WOR-NOORD	3506	2	CAPE	GOUDINIWEG	06:12:00	06:13:00	00:04:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	5.96
WOR-NOORD	3506	3	CAPE	BOTHA	06:18:00	06:19:00	00:05:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	7.2
WOR-NOORD	3506	3	CAPE	BREERIVIER	06:24:00	06:25:00	00:05:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	6.62
WOR-NOORD	3506	3	CAPE	ROMANSRIVIER	06:29:00	06:31:00	00:04:00	00:02:00	PASS	KAAPSTADPAS						03:25:00	0	5.66
WOR-NOORD	3506	3	CAPE	LAPLAISANTE	06:34:00	06:34:00	00:03:00			KAAPSTADPAS						03:25:00	0	2.02
WOR-NOORD	3506	3	CAPE	WOLSELEY	06:37:00	06:38:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	5.05
WOR-NOORD	3506	4	CAPE	ARTOIS	06:45:00	06:46:00	00:07:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	5.95
WOR-NOORD	3506	4	CAPE	TULBAGHWEG	06:56:00	06:57:00	00:10:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	8.92
WOR-NOORD	3506	4	CAPE	GOUDA	07:06:00	07:06:00	00:09:00		PASS	KAAPSTADPAS						03:25:00	0	7.26
WOR-NOORD	3506	5	CAPE	VOELVLEI	07:12:00	07:13:00	00:06:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	7.48
WOR-NOORD	3506	5	CAPE	HERMON	07:20:00	07:21:00	00:07:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	7.62
WOR-NOORD	3506	6	CAPE	SOETENDAL	07:27:00	07:28:00	00:06:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	10.57
WOR-NOORD	3506	7	CAPE	MALAN	07:34:00	07:35:00	00:06:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	1.33
WOR-NOORD	3506	7	CAPE	WELLINGTON	07:44:00	07:45:00	00:09:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	13.71
WOR-NOORD	3506	8	CAPE	MBEKWENI	07:50:00	07:50:00	00:05:00			KAAPSTADPAS						03:25:00	0	4.53
WOR-NOORD	3506	8	CAPE	DALJOSAFAT	07:53:00	07:53:00	00:03:00			KAAPSTADPAS						03:25:00	0	3.58
WOR-NOORD	3506	9	CAPE	HUGUENOT	07:55:00	07:55:00	00:02:00			KAAPSTADPAS						03:25:00	0	2.52
WOR-NOORD	3506	10	CAPE	PAARL	08:00:00	08:00:00	00:05:00			KAAPSTADPAS						03:25:00	0	4.24
WOR-NOORD	3506	11	CAPE	KLAPMUTS	08:08:00	08:08:00	00:08:00			KAAPSTADPAS						03:25:00	0	10.68
WOR-NOORD	3506	11	CAPE	MULDERSVLEI	08:13:00	08:13:00	00:05:00			KAAPSTADPAS						03:25:00	0	5.79
WOR-NOORD	3506	12	CAPE	KRAAIFONTEIN	08:22:00	08:25:00	00:09:00	00:03:00	PASS	KAAPSTADPAS						03:25:00	0	10.21
WOR-NOORD	3506	13	CAPE	EIKENFONTEIN	08:27:00	08:27:00	00:02:00			KAAPSTADPAS						03:25:00	0	1.66
WOR-NOORD	3506	13	CAPE	BRACKENFELL	08:29:00	08:29:00	00:02:00			KAAPSTADPAS						03:25:00	0	3.37
WOR-NOORD	3506	14	CAPE	STIKLAND	08:32:00	08:32:00	00:03:00			KAAPSTADPAS						03:25:00	0	3.85
WOR-NOORD	3506	15	CAPE	BELLVILLE	08:37:00	08:41:00	00:05:00	00:04:00	PASS / THIRD ROAD	KAAPSTADPAS						03:25:00	0	2.79
WOR-NOORD	3506	16	CAPE	OOSTERZEE	08:43:00	08:48:00	00:02:00	00:05:00	PASS	KAAPSTADPAS						03:25:00	0	0.79
WOR-NOORD	3506	17	CAPE	AVONDALE	08:51:00	08:52:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	1.32
WOR-NOORD	3506	17	CAPE	DEGRENDEL	08:54:00	08:58:00	00:02:00	00:04:00	PASS	KAAPSTADPAS						03:25:00	0	1.42
WOR-NOORD	3506	17	CAPE	MONTEVISTA	08:59:00	09:01:00	00:01:00	00:02:00	PASS	KAAPSTADPAS						03:25:00	0	2.87
WOR-NOORD	3506	17	CAPE	AKASIAPARK	09:01:00	09:03:00		00:02:00	PASS	KAAPSTADPAS						03:25:00	0	1.26
WOR-NOORD	3506	18	CAPE	WINDERMERE	09:06:00	09:06:00	00:03:00			KAAPSTADPAS						03:25:00	0	1.04
WOR-NOORD	3506	19	CAPE	KENTEMADE	09:11:00	09:12:00	00:05:00	00:01:00	PASS	KAAPSTADPAS						03:25:00	0	2.64
WOR-NOORD	3506	19	CAPE	KENSINGTON	09:12:00	09:12:00				KAAPSTADPAS						03:25:00	0	0.83
WOR-NOORD	3506	20	CAPE	YSTERPLAAT	09:14:00	09:16:00	00:02:00	00:02:00	PASS	KAAPSTADPAS						03:25:00	0	1.25
WOR-NOORD	3506	21	CAPE	PAARDENEILAND	09:17:00	09:17:00	00:01:00			KAAPSTADPAS						03:25:00	0	0.96
WOR-NOORD	3506	22	CAPE	BAYJUNCTION	09:17:00	09:17:00				KAAPSTADPAS						03:25:00	0	0.85
WOR-NOORD	3506	23	CAPE	ESPLANADE	09:17:00	09:17:00				KAAPSTADPAS						03:25:00	0	1.11
WOR-NOORD	3506	23	CAPE	KAAPSTADPAS	09:25:00	00:00:00	00:08:00		RT	KAAPSTADPAS						03:25:00	0	2.41
WOR-NOORD	3508	1	CAPE	WOR-NOORD		05:00:00				KAAPSTADPAS	05:00:00	08:24:00	1	NNNNNNY	METRO TRAIN/METRORAIL-CWN	03:24:00	0	
WOR-NOORD	3508	1	CAPE	WORCESTER	05:00:00	05:00:00			C	KAAPSTADPAS						03:24:00	0	8.16
WOR-NOORD	3508	2	CAPE	CHAVONNES	05:08:00	05:08:00	00:08:00			KAAPSTADPAS						03:24:00	0	6.7
WOR-NOORD	3508	2	CAPE	GOUDINIWEG	05:12:00	05:13:00	00:04:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	5.96
WOR-NOORD	3508	3	CAPE	BOTHA	05:18:00	05:19:00	00:05:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	7.2
WOR-NOORD	3508	3	CAPE	BREERIVIER	05:24:00	05:25:00	00:05:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	6.62
WOR-NOORD	3508	3	CAPE	ROMANSRIVIER	05:29:00	05:30:00	00:04:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	5.66
WOR-NOORD	3508	3	CAPE	LAPLAISANTE	05:33:00	05:33:00	00:03:00			KAAPSTADPAS						03:24:00	0	2.02
WOR-NOORD	3508	3	CAPE	WOLSELEY	05:37:00	05:38:00	00:04:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	5.05
WOR-NOORD	3508	4	CAPE	ARTOIS	05:45:00	05:46:00	00:07:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	5.95
WOR-NOORD	3508	4	CAPE	TULBAGHWEG	05:56:00	05:57:00	00:10:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	8.92
WOR-NOORD	3508	4	CAPE	GOUDA	06:05:00	06:05:00	00:08:00			KAAPSTADPAS						03:24:00	0	7.26
WOR-NOORD	3508	5	CAPE	VOELVLEI	06:11:00	06:13:00	00:06:00	00:02:00	PASS	KAAPSTADPAS						03:24:00	0	7.48
WOR-NOORD	3508	5	CAPE	HERMON	06:20:00	06:21:00	00:07:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	7.62
WOR-NOORD	3508	6	CAPE	SOETENDAL	06:27:00	06:28:00	00:06:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	10.57
WOR-NOORD	3508	7	CAPE	MALAN	06:34:00	06:35:00	00:06:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	1.33
WOR-NOORD	3508	7	CAPE	WELLINGTON	06:44:00	06:45:00	00:09:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	13.71
WOR-NOORD	3508	8	CAPE	MBEKWENI	06:49:00	06:50:00	00:04:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	4.53
WOR-NOORD	3508	8	CAPE	DALJOSAFAT	06:53:00	06:54:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	3.58
WOR-NOORD	3508	9	CAPE	HUGUENOT	06:57:00	06:58:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	2.52
WOR-NOORD	3508	10	CAPE	PAARL	07:01:00	07:02:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	4.24
WOR-NOORD	3508	11	CAPE	KLAPMUTS	07:11:00	07:12:00	00:09:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	10.68
WOR-NOORD	3508	11	CAPE	MULDERSVLEI	07:18:00	07:19:00	00:06:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	5.79
WOR-NOORD	3508	12	CAPE	KRAAIFONTEIN	07:28:00	07:29:00	00:09:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	10.21
WOR-NOORD	3508	13	CAPE	EIKENFONTEIN	07:31:00	07:32:00	00:02:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	1.66
WOR-NOORD	3508	13	CAPE	BRACKENFELL	07:35:00	07:36:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	3.37
WOR-NOORD	3508	14	CAPE	STIKLAND	07:39:00	07:40:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	3.85
WOR-NOORD	3508	15	CAPE	BELLVILLE	07:44:00	07:45:00	00:04:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	2.79
WOR-NOORD	3508	16	CAPE	OOSTERZEE	07:48:00	07:49:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	0.79
WOR-NOORD	3508	17	CAPE	AVONDALE	07:52:00	07:53:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	1.32
WOR-NOORD	3508	17	CAPE	DEGRENDEL	07:54:00	07:55:00	00:01:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	1.42
WOR-NOORD	3508	17	CAPE	MONTEVISTA	07:58:00	07:59:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	2.87
WOR-NOORD	3508	17	CAPE	AKASIAPARK	08:02:00	08:03:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	1.26
WOR-NOORD	3508	18	CAPE	WINDERMERE	08:04:00	08:04:00	00:01:00			KAAPSTADPAS						03:24:00	0	1.04
WOR-NOORD	3508	19	CAPE	KENTEMADE	08:09:00	08:10:00	00:05:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	2.64
WOR-NOORD	3508	19	CAPE	KENSINGTON	08:11:00	08:11:00	00:01:00			KAAPSTADPAS						03:24:00	0	0.83
WOR-NOORD	3508	20	CAPE	YSTERPLAAT	08:13:00	08:14:00	00:02:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	1.25
WOR-NOORD	3508	21	CAPE	PAARDENEILAND	08:17:00	08:17:00	00:03:00			KAAPSTADPAS						03:24:00	0	0.96
WOR-NOORD	3508	22	CAPE	BAYJUNCTION	08:17:00	08:17:00				KAAPSTADPAS						03:24:00	0	0.85
WOR-NOORD	3508	23	CAPE	ESPLANADE	08:20:00	08:21:00	00:03:00	00:01:00	PASS	KAAPSTADPAS						03:24:00	0	1.11
WOR-NOORD	3508	23	CAPE	KAAPSTADPAS	08:24:00	00:00:00	00:03:00		RT	KAAPSTADPAS						03:24:00	0	2.41
WOR-NOORD	4701	1	CAPE	WOR-NOORD		06:25:00				WOR-NOORD	06:25:00	07:46:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	01:21:00	0	
WOR-NOORD	4701	1	CAPE	WOR/S140031	06:28:00	06:31:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.16
WOR-NOORD	4701	1	CAPE	WOR/S145122	06:34:00	06:37:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.97
WOR-NOORD	4701	2	CAPE	WOR/S140031	06:40:00	06:43:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.97
WOR-NOORD	4701	2	CAPE	WOR-NOORD	06:46:00	06:49:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.16
WOR-NOORD	4701	3	CAPE	WON/S161438	06:52:00	06:55:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	
WOR-NOORD	4701	3	CAPE	WOR/S145181	06:58:00	07:01:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.54
WOR-NOORD	4701	3	CAPE	WOR/S145173	07:04:00	07:07:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.59
WOR-NOORD	4701	4	CAPE	WOR/S145181	07:10:00	07:13:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.59
WOR-NOORD	4701	4	CAPE	WON/S161438	07:16:00	07:19:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.54
WOR-NOORD	4701	4	CAPE	WOR-NOORD	07:22:00	07:25:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	
WOR-NOORD	4701	5	CAPE	WOR-HERSTEL	07:28:00	07:31:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	4.55
WOR-NOORD	4701	5	CAPE	WOR/S140686	07:34:00	07:37:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.64
WOR-NOORD	4701	6	CAPE	WOR-HERSTEL	07:40:00	07:43:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.64
WOR-NOORD	4701	6	CAPE	WOR-NOORD	07:46:00	00:00:00	00:03:00		RT	WOR-NOORD						01:21:00	0	4.55
WOR-NOORD	4703	1	CAPE	WOR-NOORD		12:35:00				WOR-NOORD	12:35:00	13:08:00	3	NYYYYYY	VACUUM TRAINS/SHUNT CAR	00:33:00	0	
WOR-NOORD	4703	1	CAPE	WOR/S140031	12:38:00	12:41:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						00:33:00	0	0.16
WOR-NOORD	4703	1	CAPE	WOR/S145122	12:44:00	12:47:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						00:33:00	0	0.97
WOR-NOORD	4703	2	CAPE	WOR/S140031	12:50:00	12:53:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						00:33:00	0	0.97
WOR-NOORD	4703	2	CAPE	WOR-NOORD	12:56:00	12:59:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						00:33:00	0	0.16
WOR-NOORD	4703	3	CAPE	WOR/S160164	13:02:00	13:05:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						00:33:00	0	0.2
WOR-NOORD	4703	4	CAPE	WOR-NOORD	13:08:00	00:00:00	00:03:00		RT	WOR-NOORD						00:33:00	0	0.2
WOR-NOORD	4704	1	CAPE	WOR-NOORD		15:15:00				WOR-NOORD	15:15:00	19:00:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	03:45:00	0	
WOR-NOORD	4704	1	CAPE	WOR/S140031	15:18:00	15:21:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	4704	1	CAPE	WOR/S145122	15:24:00	15:27:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	4704	2	CAPE	WOR/S140031	15:30:00	15:33:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	4704	2	CAPE	WOR-NOORD	15:36:00	15:39:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	4704	3	CAPE	WOR/S160725	15:42:00	15:45:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	4704	3	CAPE	WON/S161128	15:48:00	15:51:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	4704	4	CAPE	WOR/S160725	15:54:00	15:57:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	4704	4	CAPE	WOR-NOORD	16:00:00	16:03:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	4704	5	CAPE	WOR/S161063	16:06:00	16:09:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.77
WOR-NOORD	4704	6	CAPE	WOR-NOORD	16:12:00	16:15:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.77
WOR-NOORD	4704	7	CAPE	WON/S161438	16:18:00	16:21:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	4704	7	CAPE	WOR/S145181	16:24:00	16:27:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.54
WOR-NOORD	4704	7	CAPE	WOR/S145173	16:30:00	16:33:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.59
WOR-NOORD	4704	8	CAPE	WOR/S145181	16:36:00	16:39:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.59
WOR-NOORD	4704	8	CAPE	WON/S161438	16:42:00	16:45:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.54
WOR-NOORD	4704	8	CAPE	WOR-NOORD	16:48:00	16:51:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	4704	9	CAPE	WOR/S145386	16:54:00	16:57:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	5.05
WOR-NOORD	4704	9	CAPE	WOR/S140635	17:00:00	17:03:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	1.11
WOR-NOORD	4704	10	CAPE	WOR/S145386	17:06:00	17:09:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	1.11
WOR-NOORD	4704	10	CAPE	WOR-NOORD	17:12:00	17:15:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	5.05
WOR-NOORD	4704	11	CAPE	WOR/S140333	17:18:00	17:21:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.41
WOR-NOORD	4704	11	CAPE	WOR/S140538	17:24:00	17:27:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	4704	11	CAPE	WOR/S140589	17:30:00	17:33:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.7
WOR-NOORD	4704	11	CAPE	WOR/S140473	17:36:00	17:39:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.66
WOR-NOORD	4704	11	CAPE	WOR/S140422	17:42:00	17:45:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	4704	11	CAPE	WON/S161306	17:48:00	17:51:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	4704	11	CAPE	WOR/S140384	17:54:00	17:57:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	4704	12	CAPE	WON/S161306	18:00:00	18:03:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	4704	12	CAPE	WOR/S140422	18:06:00	18:09:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	4704	12	CAPE	WOR/S140473	18:12:00	18:15:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	4704	12	CAPE	WOR/S140589	18:18:00	18:21:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.66
WOR-NOORD	4704	12	CAPE	WOR/S140538	18:24:00	18:27:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.7
WOR-NOORD	4704	12	CAPE	WOR/S140333	18:30:00	18:33:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	4704	12	CAPE	WOR-NOORD	18:36:00	18:39:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.41
WOR-NOORD	4704	13	CAPE	WOR-HERSTEL	18:42:00	18:45:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	4.55
WOR-NOORD	4704	13	CAPE	WOR/S140686	18:48:00	18:51:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.64
WOR-NOORD	4704	14	CAPE	WOR-HERSTEL	18:54:00	18:57:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.64
WOR-NOORD	4704	14	CAPE	WOR-NOORD	19:00:00	00:00:00	00:03:00		RT	WOR-NOORD						03:45:00	0	4.55
WOR-NOORD	4705	1	CAPE	WOR-NOORD		20:00:00				WOR-NOORD	20:00:00	20:09:00	3	NYYYYYY	VACUUM TRAINS/SHUNT CAR	00:09:00	0	
WOR-NOORD	4705	1	CAPE	WOR/S160164	20:03:00	20:06:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						00:09:00	0	0.2
WOR-NOORD	4705	2	CAPE	WOR-NOORD	20:09:00	00:00:00	00:03:00		RT	WOR-NOORD						00:09:00	0	0.2
WOR-NOORD	4706	1	CAPE	WOR-NOORD		22:30:00				WOR-NOORD	22:30:00	00:39:00	3	YNNNNNN	VACUUM TRAINS/SHUNT CAR	02:09:00	0	
WOR-NOORD	4706	1	CAPE	WOR/S161063	22:33:00	22:36:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	3.77
WOR-NOORD	4706	2	CAPE	WOR-NOORD	22:39:00	22:42:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	3.77
WOR-NOORD	4706	3	CAPE	WOR-HERSTEL	22:45:00	22:48:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	4.55
WOR-NOORD	4706	3	CAPE	WOR/S140686	22:51:00	22:54:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	0.64
WOR-NOORD	4706	4	CAPE	WOR-HERSTEL	22:57:00	23:00:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	0.64
WOR-NOORD	4706	4	CAPE	WOR-NOORD	23:03:00	23:06:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	4.55
WOR-NOORD	4706	5	CAPE	WOR/S140333	23:09:00	23:12:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	2.41
WOR-NOORD	4706	5	CAPE	WOR/S140538	23:15:00	23:18:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	0.97
WOR-NOORD	4706	5	CAPE	WOR/S140589	23:21:00	23:24:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	2.7
WOR-NOORD	4706	5	CAPE	WOR/S140473	23:27:00	23:30:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	3.66
WOR-NOORD	4706	5	CAPE	WOR/S140422	23:33:00	23:36:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	0.97
WOR-NOORD	4706	5	CAPE	WON/S161306	23:39:00	23:42:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	
WOR-NOORD	4706	5	CAPE	WOR/S140384	23:45:00	23:48:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	
WOR-NOORD	4706	6	CAPE	WON/S161306	23:51:00	23:54:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	
WOR-NOORD	4706	6	CAPE	WOR/S140422	23:57:00	00:00:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	0	
WOR-NOORD	4706	6	CAPE	WOR/S140473	00:03:00	00:06:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	1	0.97
WOR-NOORD	4706	6	CAPE	WOR/S140589	00:09:00	00:12:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	1	3.66
WOR-NOORD	4706	6	CAPE	WOR/S140538	00:15:00	00:18:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	1	2.7
WOR-NOORD	4706	6	CAPE	WOR/S140333	00:21:00	00:24:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	1	0.97
WOR-NOORD	4706	6	CAPE	WOR-NOORD	00:27:00	00:30:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	1	2.41
WOR-NOORD	4706	7	CAPE	WOR/S160164	00:33:00	00:36:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						02:09:00	1	0.2
WOR-NOORD	4706	8	CAPE	WOR-NOORD	00:39:00	00:00:00	00:03:00		RT	WOR-NOORD						02:09:00	1	0.2
WOR-NOORD	4799	1	CAPE	WOR-NOORD		00:05:00				WOR-NOORD	00:05:00	01:12:00	3	NYYYYYN	VACUUM TRAINS/SHUNT CAR	01:07:00	0	
WOR-NOORD	4799	1	CAPE	WOR/S145041	00:06:00	00:07:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.14
WOR-NOORD	4799	1	CAPE	WOR/S145394	00:08:00	00:09:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	1	CAPE	WOR/S145343	00:10:00	00:11:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	1	CAPE	WOR/S145408	00:12:00	00:13:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	1	CAPE	WOR/S145297	00:14:00	00:15:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	1	CAPE	WOR/S145335	00:16:00	00:17:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	1	CAPE	WOR/S145254	00:18:00	00:19:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	3.08
WOR-NOORD	4799	1	CAPE	WOR/S145203	00:20:00	00:21:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.13
WOR-NOORD	4799	1	CAPE	WOR/S145246	00:22:00	00:23:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.13
WOR-NOORD	4799	1	CAPE	WOR/S147745	00:24:00	00:25:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.11
WOR-NOORD	4799	1	CAPE	WOR/S145351	00:26:00	00:27:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.14
WOR-NOORD	4799	1	CAPE	WOR/S145106	00:28:00	00:29:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.14
WOR-NOORD	4799	1	CAPE	WOR/S145327	00:30:00	00:31:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.14
WOR-NOORD	4799	1	CAPE	WON/S161098	00:32:00	00:33:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	
WOR-NOORD	4799	1	CAPE	WOR/S160733	00:34:00	00:35:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	
WOR-NOORD	4799	1	CAPE	WOR/S160741	00:36:00	00:37:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	1	CAPE	WOR/S161071	00:38:00	00:39:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	2	CAPE	WOR/S160741	00:40:00	00:41:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	2	CAPE	WOR/S160733	00:42:00	00:43:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	2	CAPE	WON/S161098	00:44:00	00:45:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	
WOR-NOORD	4799	2	CAPE	WOR/S145327	00:46:00	00:47:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	
WOR-NOORD	4799	2	CAPE	WOR/S145106	00:48:00	00:49:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.14
WOR-NOORD	4799	2	CAPE	WOR/S145351	00:50:00	00:51:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.14
WOR-NOORD	4799	2	CAPE	WOR/S147745	00:52:00	00:53:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.14
WOR-NOORD	4799	2	CAPE	WOR/S145246	00:54:00	00:55:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.11
WOR-NOORD	4799	2	CAPE	WOR/S145203	00:56:00	00:57:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.13
WOR-NOORD	4799	2	CAPE	WOR/S145254	00:58:00	00:59:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.13
WOR-NOORD	4799	2	CAPE	WOR/S145335	01:00:00	01:01:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	3.08
WOR-NOORD	4799	2	CAPE	WOR/S145297	01:02:00	01:03:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	2	CAPE	WOR/S145408	01:04:00	01:05:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	2	CAPE	WOR/S145343	01:06:00	01:07:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	2	CAPE	WOR/S145394	01:08:00	01:09:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	2	CAPE	WOR/S145041	01:10:00	01:11:00	00:01:00	00:01:00	RANGEER	WOR-NOORD						01:07:00	0	0.97
WOR-NOORD	4799	2	CAPE	WOR-NOORD	01:12:00	00:00:00	00:01:00		RT	WOR-NOORD						01:07:00	0	0.14
WOR-NOORD	8701	1	CAPE	WOR-NOORD		06:25:00				WOR-NOORD	06:25:00	07:46:00	3	NYYYYYN	MEDIUM HEAVY/MEDIUM HEAVY	01:21:00	0	
WOR-NOORD	8701	1	CAPE	WOR/S140031	06:28:00	06:31:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.16
WOR-NOORD	8701	1	CAPE	WOR/S145122	06:34:00	06:37:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.97
WOR-NOORD	8701	2	CAPE	WOR/S140031	06:40:00	06:43:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.97
WOR-NOORD	8701	2	CAPE	WOR-NOORD	06:46:00	06:49:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.16
WOR-NOORD	8701	3	CAPE	WON/S161438	06:52:00	06:55:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	
WOR-NOORD	8701	3	CAPE	WOR/S145181	06:58:00	07:01:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.54
WOR-NOORD	8701	3	CAPE	WOR/S145173	07:04:00	07:07:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.59
WOR-NOORD	8701	4	CAPE	WOR/S145181	07:10:00	07:13:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.59
WOR-NOORD	8701	4	CAPE	WON/S161438	07:16:00	07:19:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.54
WOR-NOORD	8701	4	CAPE	WOR-NOORD	07:22:00	07:25:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	
WOR-NOORD	8701	5	CAPE	WOR-HERSTEL	07:28:00	07:31:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	4.55
WOR-NOORD	8701	5	CAPE	WOR/S140686	07:34:00	07:37:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.64
WOR-NOORD	8701	6	CAPE	WOR-HERSTEL	07:40:00	07:43:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						01:21:00	0	0.64
WOR-NOORD	8701	6	CAPE	WOR-NOORD	07:46:00	00:00:00	00:03:00		RT	WOR-NOORD						01:21:00	0	4.55
WOR-NOORD	8910	1	CAPE	WOR-NOORD		09:40:00				WOR-NOORD	09:40:00	13:25:00	3	YYYYAYY	VACUUM TRAINS/SHUNT CAR	03:45:00	0	
WOR-NOORD	8910	1	CAPE	WOR/S140031	09:43:00	09:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8910	1	CAPE	WOR/S145122	09:49:00	09:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8910	2	CAPE	WOR/S140031	09:55:00	09:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8910	2	CAPE	WOR-NOORD	10:01:00	10:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8910	3	CAPE	WON/S161438	10:07:00	10:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8910	3	CAPE	WOR/S145181	10:13:00	10:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.54
WOR-NOORD	8910	3	CAPE	WOR/S145173	10:19:00	10:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.59
WOR-NOORD	8910	4	CAPE	WOR/S145181	10:25:00	10:28:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.59
WOR-NOORD	8910	4	CAPE	WON/S161438	10:31:00	10:34:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.54
WOR-NOORD	8910	4	CAPE	WOR-NOORD	10:37:00	10:40:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8910	5	CAPE	WOR/S160725	10:43:00	10:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8910	5	CAPE	WON/S161128	10:49:00	10:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8910	6	CAPE	WOR/S160725	10:55:00	10:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8910	6	CAPE	WOR-NOORD	11:01:00	11:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8910	7	CAPE	WOR/S161063	11:07:00	11:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.77
WOR-NOORD	8910	8	CAPE	WOR-NOORD	11:13:00	11:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.77
WOR-NOORD	8910	9	CAPE	WOR/S140333	11:19:00	11:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.41
WOR-NOORD	8910	9	CAPE	WOR/S140538	11:25:00	11:28:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8910	9	CAPE	WOR/S140589	11:31:00	11:34:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.7
WOR-NOORD	8910	9	CAPE	WOR/S140473	11:37:00	11:40:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.66
WOR-NOORD	8910	9	CAPE	WOR/S140422	11:43:00	11:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8910	9	CAPE	WON/S161306	11:49:00	11:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8910	9	CAPE	WOR/S140384	11:55:00	11:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8910	10	CAPE	WON/S161306	12:01:00	12:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8910	10	CAPE	WOR/S140422	12:07:00	12:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8910	10	CAPE	WOR/S140473	12:13:00	12:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8910	10	CAPE	WOR/S140589	12:19:00	12:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.66
WOR-NOORD	8910	10	CAPE	WOR/S140538	12:25:00	12:28:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.7
WOR-NOORD	8910	10	CAPE	WOR/S140333	12:31:00	12:34:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8910	10	CAPE	WOR-NOORD	12:37:00	12:40:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.41
WOR-NOORD	8910	11	CAPE	WOR/S145386	12:43:00	12:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	5.05
WOR-NOORD	8910	11	CAPE	WOR/S140635	12:49:00	12:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	1.11
WOR-NOORD	8910	12	CAPE	WOR/S145386	12:55:00	12:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	1.11
WOR-NOORD	8910	12	CAPE	WOR-NOORD	13:01:00	13:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	5.05
WOR-NOORD	8910	13	CAPE	WOR-HERSTEL	13:07:00	13:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	4.55
WOR-NOORD	8910	13	CAPE	WOR/S140686	13:13:00	13:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.64
WOR-NOORD	8910	14	CAPE	WOR-HERSTEL	13:19:00	13:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.64
WOR-NOORD	8910	14	CAPE	WOR-NOORD	13:25:00	00:00:00	00:03:00		RT	WOR-NOORD						03:45:00	0	4.55
WOR-NOORD	8924	1	CAPE	WOR-NOORD		09:40:00				WOR-NOORD	09:40:00	13:25:00	3	YYYYAYY	VACUUM TRAINS/SHUNT CAR	03:45:00	0	
WOR-NOORD	8924	1	CAPE	WOR/S140031	09:43:00	09:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8924	1	CAPE	WOR/S145122	09:49:00	09:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8924	2	CAPE	WOR/S140031	09:55:00	09:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8924	2	CAPE	WOR-NOORD	10:01:00	10:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8924	3	CAPE	WON/S161438	10:07:00	10:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8924	3	CAPE	WOR/S145181	10:13:00	10:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.54
WOR-NOORD	8924	3	CAPE	WOR/S145173	10:19:00	10:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.59
WOR-NOORD	8924	4	CAPE	WOR/S145181	10:25:00	10:28:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.59
WOR-NOORD	8924	4	CAPE	WON/S161438	10:31:00	10:34:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.54
WOR-NOORD	8924	4	CAPE	WOR-NOORD	10:37:00	10:40:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8924	5	CAPE	WOR/S160725	10:43:00	10:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8924	5	CAPE	WON/S161128	10:49:00	10:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8924	6	CAPE	WOR/S160725	10:55:00	10:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8924	6	CAPE	WOR-NOORD	11:01:00	11:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8924	7	CAPE	WOR/S161063	11:07:00	11:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.77
WOR-NOORD	8924	8	CAPE	WOR-NOORD	11:13:00	11:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.77
WOR-NOORD	8924	9	CAPE	WOR/S140333	11:19:00	11:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.41
WOR-NOORD	8924	9	CAPE	WOR/S140538	11:25:00	11:28:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8924	9	CAPE	WOR/S140589	11:31:00	11:34:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.7
WOR-NOORD	8924	9	CAPE	WOR/S140473	11:37:00	11:40:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.66
WOR-NOORD	8924	9	CAPE	WOR/S140422	11:43:00	11:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8924	9	CAPE	WON/S161306	11:49:00	11:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8924	9	CAPE	WOR/S140384	11:55:00	11:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8924	10	CAPE	WON/S161306	12:01:00	12:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8924	10	CAPE	WOR/S140422	12:07:00	12:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8924	10	CAPE	WOR/S140473	12:13:00	12:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8924	10	CAPE	WOR/S140589	12:19:00	12:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.66
WOR-NOORD	8924	10	CAPE	WOR/S140538	12:25:00	12:28:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.7
WOR-NOORD	8924	10	CAPE	WOR/S140333	12:31:00	12:34:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8924	10	CAPE	WOR-NOORD	12:37:00	12:40:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.41
WOR-NOORD	8924	11	CAPE	WOR/S145386	12:43:00	12:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	5.05
WOR-NOORD	8924	11	CAPE	WOR/S140635	12:49:00	12:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	1.11
WOR-NOORD	8924	12	CAPE	WOR/S145386	12:55:00	12:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	1.11
WOR-NOORD	8924	12	CAPE	WOR-NOORD	13:01:00	13:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	5.05
WOR-NOORD	8924	13	CAPE	WOR-HERSTEL	13:07:00	13:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	4.55
WOR-NOORD	8924	13	CAPE	WOR/S140686	13:13:00	13:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.64
WOR-NOORD	8924	14	CAPE	WOR-HERSTEL	13:19:00	13:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.64
WOR-NOORD	8924	14	CAPE	WOR-NOORD	13:25:00	00:00:00	00:03:00		RT	WOR-NOORD						03:45:00	0	4.55
WOR-NOORD	8928	1	CAPE	WOR-NOORD		15:15:00				WOR-NOORD	15:15:00	19:00:00	3	AYYAYAN	MEDIUM HEAVY/MEDIUM HEAVY	03:45:00	0	
WOR-NOORD	8928	1	CAPE	WOR/S140031	15:18:00	15:21:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8928	1	CAPE	WOR/S145122	15:24:00	15:27:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8928	2	CAPE	WOR/S140031	15:30:00	15:33:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8928	2	CAPE	WOR-NOORD	15:36:00	15:39:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8928	3	CAPE	WOR/S160725	15:42:00	15:45:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8928	3	CAPE	WON/S161128	15:48:00	15:51:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8928	4	CAPE	WOR/S160725	15:54:00	15:57:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8928	4	CAPE	WOR-NOORD	16:00:00	16:03:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	8928	5	CAPE	WOR/S161063	16:06:00	16:09:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.77
WOR-NOORD	8928	6	CAPE	WOR-NOORD	16:12:00	16:15:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.77
WOR-NOORD	8928	7	CAPE	WON/S161438	16:18:00	16:21:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8928	7	CAPE	WOR/S145181	16:24:00	16:27:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.54
WOR-NOORD	8928	7	CAPE	WOR/S145173	16:30:00	16:33:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.59
WOR-NOORD	8928	8	CAPE	WOR/S145181	16:36:00	16:39:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.59
WOR-NOORD	8928	8	CAPE	WON/S161438	16:42:00	16:45:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.54
WOR-NOORD	8928	8	CAPE	WOR-NOORD	16:48:00	16:51:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8928	9	CAPE	WOR/S145386	16:54:00	16:57:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	5.05
WOR-NOORD	8928	9	CAPE	WOR/S140635	17:00:00	17:03:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	1.11
WOR-NOORD	8928	10	CAPE	WOR/S145386	17:06:00	17:09:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	1.11
WOR-NOORD	8928	10	CAPE	WOR-NOORD	17:12:00	17:15:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	5.05
WOR-NOORD	8928	11	CAPE	WOR/S140333	17:18:00	17:21:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.41
WOR-NOORD	8928	11	CAPE	WOR/S140538	17:24:00	17:27:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8928	11	CAPE	WOR/S140589	17:30:00	17:33:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.7
WOR-NOORD	8928	11	CAPE	WOR/S140473	17:36:00	17:39:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.66
WOR-NOORD	8928	11	CAPE	WOR/S140422	17:42:00	17:45:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8928	11	CAPE	WON/S161306	17:48:00	17:51:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8928	11	CAPE	WOR/S140384	17:54:00	17:57:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8928	12	CAPE	WON/S161306	18:00:00	18:03:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8928	12	CAPE	WOR/S140422	18:06:00	18:09:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	8928	12	CAPE	WOR/S140473	18:12:00	18:15:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8928	12	CAPE	WOR/S140589	18:18:00	18:21:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.66
WOR-NOORD	8928	12	CAPE	WOR/S140538	18:24:00	18:27:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.7
WOR-NOORD	8928	12	CAPE	WOR/S140333	18:30:00	18:33:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	8928	12	CAPE	WOR-NOORD	18:36:00	18:39:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.41
WOR-NOORD	8928	13	CAPE	WOR-HERSTEL	18:42:00	18:45:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	4.55
WOR-NOORD	8928	13	CAPE	WOR/S140686	18:48:00	18:51:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.64
WOR-NOORD	8928	14	CAPE	WOR-HERSTEL	18:54:00	18:57:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.64
WOR-NOORD	8928	14	CAPE	WOR-NOORD	19:00:00	00:00:00	00:03:00		RT	WOR-NOORD						03:45:00	0	4.55
WOR-NOORD	8941	1	CAPE	WOR-NOORD		01:00:00				BEACONSFIELD	01:00:00	01:15:00	1	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	24:15:00	0	
WOR-NOORD	8941	1	CAPE	DEWET	01:11:00	01:11:00	00:11:00		C	BEACONSFIELD						24:15:00	0	5.12
WOR-NOORD	8941	1	CAPE	SANDHILLS	01:23:30	01:23:30	00:12:30			BEACONSFIELD						24:15:00	0	10.97
WOR-NOORD	8941	1	CAPE	HEXRIVIER	01:29:00	01:29:00	00:05:30			BEACONSFIELD						24:15:00	0	5.83
WOR-NOORD	8941	1	CAPE	ORCHARD	01:32:30	01:32:30	00:03:30			BEACONSFIELD						24:15:00	0	3.08
WOR-NOORD	8941	2	CAPE	DEDOORNS	01:37:30	01:37:30	00:05:00			BEACONSFIELD						24:15:00	0	4.29
WOR-NOORD	8941	3	CAPE	ALMERIA	01:45:30	01:45:30	00:08:00			BEACONSFIELD						24:15:00	0	8.05
WOR-NOORD	8941	3	CAPE	SALBAR	01:54:30	01:54:30	00:09:00			BEACONSFIELD						24:15:00	0	6.58
WOR-NOORD	8941	3	CAPE	HEXTON	02:04:00	02:04:00	00:09:30			BEACONSFIELD						24:15:00	0	7.25
WOR-NOORD	8941	3	CAPE	KLEINSTRAAT	02:17:00	02:17:00	00:13:00			BEACONSFIELD						24:15:00	0	11.41
WOR-NOORD	8941	4	CAPE	HUGO	02:22:30	02:22:30	00:05:30			BEACONSFIELD						24:15:00	0	2.7
WOR-NOORD	8941	4	CAPE	TOUWSRIVIER	02:32:00	02:32:00	00:09:30			BEACONSFIELD						24:15:00	0	7.4
WOR-NOORD	8941	5	CAPE	DRAAI	02:40:30	02:40:30	00:08:30			BEACONSFIELD						24:15:00	0	5.66
WOR-NOORD	8941	5	CAPE	JANDEBOERS	02:48:30	02:48:30	00:08:00			BEACONSFIELD						24:15:00	0	7.12
WOR-NOORD	8941	5	CAPE	QUARRY	02:56:00	02:56:00	00:07:30			BEACONSFIELD						24:15:00	0	6.38
WOR-NOORD	8941	5	CAPE	KONSTABEL	03:05:30	03:05:30	00:09:30			BEACONSFIELD						24:15:00	0	7.65
WOR-NOORD	8941	5	CAPE	TWEEDSIDE	03:14:00	03:14:00	00:08:30			BEACONSFIELD						24:15:00	0	7.55
WOR-NOORD	8941	5	CAPE	PIETERMEINTJE	03:21:00	03:21:00	00:07:00			BEACONSFIELD						24:15:00	0	5.99
WOR-NOORD	8941	5	CAPE	MEMORIAL	03:29:00	03:29:00	00:08:00			BEACONSFIELD						24:15:00	0	5.32
WOR-NOORD	8941	5	CAPE	BANTAMS	03:35:30	03:35:30	00:06:30			BEACONSFIELD						24:15:00	0	4.87
WOR-NOORD	8941	5	CAPE	MATJIESFONTEI	03:43:30	03:43:30	00:08:00			BEACONSFIELD						24:15:00	0	5.58
WOR-NOORD	8941	5	CAPE	WHITEHILL	03:50:00	03:50:00	00:06:30			BEACONSFIELD						24:15:00	0	5.29
WOR-NOORD	8941	5	CAPE	SKEIDING	03:55:30	03:55:30	00:05:30			BEACONSFIELD						24:15:00	0	4.79
WOR-NOORD	8941	5	CAPE	BAVIAAN	04:03:30	04:03:30	00:08:00			BEACONSFIELD						24:15:00	0	5.86
WOR-NOORD	8941	5	CAPE	VISKUIL	04:11:00	04:11:00	00:07:30			BEACONSFIELD						24:15:00	0	5.83
WOR-NOORD	8941	5	CAPE	LAINGSBURG	04:17:30	04:17:30	00:06:30			BEACONSFIELD						24:15:00	0	5.37
WOR-NOORD	8941	6	CAPE	GEELBEK	04:25:30	04:25:30	00:08:00			BEACONSFIELD						24:15:00	0	7.29
WOR-NOORD	8941	6	CAPE	VLEIFONTEIN	04:41:00	04:41:00	00:15:30			BEACONSFIELD						24:15:00	0	12.17
WOR-NOORD	8941	6	CAPE	RUITERSKOP	04:49:00	04:49:00	00:08:00			BEACONSFIELD						24:15:00	0	6.37
WOR-NOORD	8941	6	CAPE	WYKE	04:56:00	04:56:00	00:07:00			BEACONSFIELD						24:15:00	0	6.91
WOR-NOORD	8941	6	CAPE	KOUP	05:04:30	05:04:30	00:08:30			BEACONSFIELD						24:15:00	0	7.65
WOR-NOORD	8941	6	CAPE	GEMSBOK	05:17:00	05:17:00	00:12:30		X 81600 &amp; 81002	BEACONSFIELD						24:15:00	0	10.6
WOR-NOORD	8941	6	CAPE	KETTING	05:23:00	05:23:00	00:06:00			BEACONSFIELD						24:15:00	0	5.59
WOR-NOORD	8941	6	CAPE	ANTJIESKRAAL	05:31:00	05:35:00	00:08:00	00:04:00	X 71010	BEACONSFIELD						24:15:00	0	7.37
WOR-NOORD	8941	6	CAPE	DWYKA	05:41:30	05:41:30	00:06:30			BEACONSFIELD						24:15:00	0	5.04
WOR-NOORD	8941	6	CAPE	BOTESLAND	05:51:00	05:51:00	00:09:30			BEACONSFIELD						24:15:00	0	8.14
WOR-NOORD	8941	6	CAPE	PRINSALBERTRO	06:00:30	06:00:30	00:09:30			BEACONSFIELD						24:15:00	0	7.58
WOR-NOORD	8941	6	CAPE	WELTEVREDE	06:11:30	06:34:00	00:11:00	00:22:30	X 41256 / 8	BEACONSFIELD						24:15:00	0	9
WOR-NOORD	8941	6	CAPE	ZWARTS	06:44:00	06:44:00	00:10:00			BEACONSFIELD						24:15:00	0	8.91
WOR-NOORD	8941	6	CAPE	PALMIET	06:51:30	06:51:30	00:07:30			BEACONSFIELD						24:15:00	0	7.41
WOR-NOORD	8941	6	CAPE	KRUIDFONTEIN	06:57:30	06:57:30	00:06:00			BEACONSFIELD						24:15:00	0	5.44
WOR-NOORD	8941	6	CAPE	LEEUGAMKA	07:06:30	07:06:30	00:09:00		X 71008	BEACONSFIELD						24:15:00	0	8.84
WOR-NOORD	8941	6	CAPE	KOETSKOP	07:16:30	07:16:30	00:10:00			BEACONSFIELD						24:15:00	0	9.94
WOR-NOORD	8941	6	CAPE	LUTTIG	07:25:30	07:25:30	00:09:00			BEACONSFIELD						24:15:00	0	9.19
WOR-NOORD	8941	7	CAPE	VIVIERS	07:35:30	08:00:00	00:10:00	00:24:30	X 71006	BEACONSFIELD						24:15:00	0	10.01
WOR-NOORD	8941	7	CAPE	LETJIESBOS	08:08:30	08:08:30	00:08:30			BEACONSFIELD						24:15:00	0	8.35
WOR-NOORD	8941	7	CAPE	STEINS	08:20:00	08:20:00	00:11:30			BEACONSFIELD						24:15:00	0	11.61
WOR-NOORD	8941	7	CAPE	KLIPBANK	08:31:00	08:31:00	00:11:00			BEACONSFIELD						24:15:00	0	10.26
WOR-NOORD	8941	7	CAPE	DROERIVIER	08:41:00	08:41:00	00:10:00			BEACONSFIELD						24:15:00	0	9.07
WOR-NOORD	8941	7	CAPE	BEAUFORTWEST	08:55:00	09:55:00	00:14:00	01:00:00	BO	BEACONSFIELD						24:15:00	0	8.98
WOR-NOORD	8941	1	CAPE	ACACIA	10:11:00	10:11:00	00:16:00			BEACONSFIELD						24:15:00	0	10.16
WOR-NOORD	8941	1	CAPE	LEMOEN	10:23:00	10:23:00	00:12:00			BEACONSFIELD						24:15:00	0	10.11
WOR-NOORD	8941	1	CAPE	RENOSTERKOP	10:34:00	10:34:00	00:11:00			BEACONSFIELD						24:15:00	0	10.65
WOR-NOORD	8941	1	CAPE	YSTERRANTE	10:39:30	10:39:30	00:05:30			BEACONSFIELD						24:15:00	0	5.34
WOR-NOORD	8941	1	CAPE	RIEM	10:44:30	10:44:30	00:05:00			BEACONSFIELD						24:15:00	0	4.41
WOR-NOORD	8941	1	CAPE	JUK	10:49:00	10:49:00	00:04:30			BEACONSFIELD						24:15:00	0	4.65
WOR-NOORD	8941	1	CAPE	NELSPOORT	10:54:30	10:54:30	00:05:30			BEACONSFIELD						24:15:00	0	5.37
WOR-NOORD	8941	1	CAPE	GANNA	11:02:00	11:02:00	00:07:30			BEACONSFIELD						24:15:00	0	7.09
WOR-NOORD	8941	1	CAPE	KROMRIVIER	11:10:00	11:10:00	00:08:00			BEACONSFIELD						24:15:00	0	8.09
WOR-NOORD	8941	1	CAPE	TRAVALIA	11:18:30	11:18:30	00:08:30			BEACONSFIELD						24:15:00	0	6.91
WOR-NOORD	8941	1	CAPE	THREESISTERS	11:26:30	11:26:30	00:08:00			BEACONSFIELD						24:15:00	0	6.54
WOR-NOORD	8941	1	CAPE	HAZEL	11:34:30	11:34:30	00:08:00			BEACONSFIELD						24:15:00	0	7.61
WOR-NOORD	8941	1	CAPE	NOBLESFONTEIN	11:41:30	11:41:30	00:07:00			BEACONSFIELD						24:15:00	0	6.55
WOR-NOORD	8941	1	CAPE	STAPELIA	11:48:00	11:48:00	00:06:30			BEACONSFIELD						24:15:00	0	5.12
WOR-NOORD	8941	1	CAPE	BIESIESPOORT	11:53:00	11:53:00	00:05:00			BEACONSFIELD						24:15:00	0	5.04
WOR-NOORD	8941	1	CAPE	EGGOKLIP	11:59:00	11:59:00	00:06:00			BEACONSFIELD						24:15:00	0	5.79
WOR-NOORD	8941	1	CAPE	VERSTER	12:06:00	12:06:00	00:07:00			BEACONSFIELD						24:15:00	0	6.8
WOR-NOORD	8941	1	CAPE	HUTCHINSON	12:19:30	12:24:30	00:13:30	00:05:00	X 81600	BEACONSFIELD						24:15:00	0	12.39
WOR-NOORD	8941	2	CAPE	BARNARD	12:32:00	12:32:00	00:07:30			BEACONSFIELD						24:15:00	0	7.62
WOR-NOORD	8941	2	CAPE	FORTRUG	12:41:00	12:41:00	00:09:00			BEACONSFIELD						24:15:00	0	8.86
WOR-NOORD	8941	2	CAPE	BRAKPOORT	12:48:00	12:48:00	00:07:00			BEACONSFIELD						24:15:00	0	6.88
WOR-NOORD	8941	2	CAPE	WILDEBEESTE	12:58:00	12:58:00	00:10:00			BEACONSFIELD						24:15:00	0	9.52
WOR-NOORD	8941	2	CAPE	DEKLERK	13:07:00	13:07:00	00:09:00			BEACONSFIELD						24:15:00	0	10
WOR-NOORD	8941	2	CAPE	MERRIMAN	13:17:30	13:17:30	00:10:30			BEACONSFIELD						24:15:00	0	9.52
WOR-NOORD	8941	2	CAPE	LAKEN	13:26:00	13:26:00	00:08:30			BEACONSFIELD						24:15:00	0	8.56
WOR-NOORD	8941	2	CAPE	STERKAAR	13:35:00	13:35:00	00:09:00			BEACONSFIELD						24:15:00	0	8.42
WOR-NOORD	8941	2	CAPE	PLAATFONTEIN	13:42:30	13:42:30	00:07:30			BEACONSFIELD						24:15:00	0	7.28
WOR-NOORD	8941	2	CAPE	DEELFONTEIN	13:50:30	13:50:30	00:08:00			BEACONSFIELD						24:15:00	0	7.19
WOR-NOORD	8941	2	CAPE	JOEN	13:59:00	13:59:00	00:08:30			BEACONSFIELD						24:15:00	0	8.15
WOR-NOORD	8941	2	CAPE	MYNFONTEIN	14:07:30	14:07:30	00:08:30			BEACONSFIELD						24:15:00	0	7.95
WOR-NOORD	8941	2	CAPE	OLOFF	14:14:30	14:14:30	00:07:00			BEACONSFIELD						24:15:00	0	6.23
WOR-NOORD	8941	2	CAPE	DIEPUT	14:23:30	14:23:30	00:09:00			BEACONSFIELD						24:15:00	0	8.46
WOR-NOORD	8941	2	CAPE	BRITSVILLE	14:32:30	14:32:30	00:09:00			BEACONSFIELD						24:15:00	0	8.55
WOR-NOORD	8941	3	CAPE	DEAAR	14:45:00	16:20:00	00:12:30	01:35:00	SHUNT	BEACONSFIELD						24:15:00	0	6.94
WOR-NOORD	8941	4	CAPE	PERDEVLEI	16:37:00	16:37:00	00:17:00			BEACONSFIELD						24:15:00	0	12.02
WOR-NOORD	8941	4	CAPE	BEHRSHOEK	16:46:00	16:46:00	00:09:00			BEACONSFIELD						24:15:00	0	8.82
WOR-NOORD	8941	4	CAPE	HOUTKRAAL	17:01:00	18:35:00	00:15:00	01:34:00	X 1210; 81600; 8732	BEACONSFIELD						24:15:00	0	9.51
WOR-NOORD	8941	4	CAPE	BAARTMAN	18:46:00	18:46:00	00:11:00			BEACONSFIELD						24:15:00	0	12.14
WOR-NOORD	8941	4	CAPE	POTFONTEIN	18:57:00	19:01:00	00:11:00	00:04:00	X 1450	BEACONSFIELD						24:15:00	0	8.84
WOR-NOORD	8941	4	CAPE	KALKBULT	19:12:00	19:12:00	00:11:00			BEACONSFIELD						24:15:00	0	8.71
WOR-NOORD	8941	4	CAPE	POUPAN	19:23:00	19:40:00	00:11:00	00:17:00	X 8912	BEACONSFIELD						24:15:00	0	9.91
WOR-NOORD	8941	4	CAPE	KRAANKUIL	19:59:00	20:10:00	00:19:00	00:11:00	X 3472	BEACONSFIELD						24:15:00	0	18.08
WOR-NOORD	8941	4	CAPE	ORR-KKL-LOOP130	20:23:00	20:23:00	00:13:00			BEACONSFIELD						24:15:00	0	12.39
WOR-NOORD	8941	4	CAPE	ORANJERIVIER	20:36:00	21:20:00	00:13:00	00:44:00	RM X 81002 &amp; 71010	BEACONSFIELD						24:15:00	0	11.64
WOR-NOORD	8941	5	CAPE	WITPUT	21:38:00	21:38:00	00:18:00			BEACONSFIELD						24:15:00	0	16.6
WOR-NOORD	8941	5	CAPE	BELMONT	21:56:00	21:56:00	00:18:00			BEACONSFIELD						24:15:00	0	16.6
WOR-NOORD	8941	6	CAPE	GRASPAN	22:11:00	23:10:00	00:15:00	00:59:00	X 71008 &amp; 3474	BEACONSFIELD						24:15:00	0	13.41
WOR-NOORD	8941	6	CAPE	HEUNINGNESKLO	23:29:00	23:29:00	00:19:00			BEACONSFIELD						24:15:00	0	16.28
WOR-NOORD	8941	6	CAPE	KLOKFONTEIN	23:40:00	23:40:00	00:11:00			BEACONSFIELD						24:15:00	0	9.06
WOR-NOORD	8941	6	CAPE	MODDERRIVIER	23:52:00	00:05:00	00:12:00	00:13:00	X 8924	BEACONSFIELD						24:15:00	0	12.63
WOR-NOORD	8941	7	CAPE	SPYTFONTEIN	00:27:00	00:27:00	00:22:00			BEACONSFIELD						24:15:00	1	16.48
WOR-NOORD	8941	7	CAPE	BEC-OUTERREIN	00:45:00	01:00:00	00:18:00	00:15:00	BO LOCO	BEACONSFIELD						24:15:00	1	17.01
WOR-NOORD	8941	8	CAPE	BEACONSFIELD	01:15:00	00:00:00	00:15:00		LN 8941	BEACONSFIELD						24:15:00	1	1
WOR-NOORD	12024	1	CAPE	WOR-NOORD		10:30:00				BELLVILLE	10:30:00	16:15:00	3	YAYAYAY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	05:45:00	0	
WOR-NOORD	12024	1	CAPE	WORCESTER	10:38:30	10:38:30	00:08:30		C	BELLVILLE						05:45:00	0	8.16
WOR-NOORD	12024	2	CAPE	CHAVONNES	10:47:30	10:47:30	00:09:00			BELLVILLE						05:45:00	0	6.7
WOR-NOORD	12024	2	CAPE	GOUDINIWEG	10:54:30	10:54:30	00:07:00			BELLVILLE						05:45:00	0	5.96
WOR-NOORD	12024	3	CAPE	BOTHA	11:02:30	11:02:30	00:08:00			BELLVILLE						05:45:00	0	7.2
WOR-NOORD	12024	3	CAPE	BREERIVIER	11:11:30	11:11:30	00:09:00			BELLVILLE						05:45:00	0	6.62
WOR-NOORD	12024	3	CAPE	ROMANSRIVIER	11:18:30	12:05:00	00:07:00	00:46:30	X 18001 &amp; F 81002	BELLVILLE						05:45:00	0	5.66
WOR-NOORD	12024	3	CAPE	LAPLAISANTE	12:05:00	12:05:00				BELLVILLE						05:45:00	0	2.02
WOR-NOORD	12024	3	CAPE	WOLSELEY	12:15:00	12:15:00	00:10:00			BELLVILLE						05:45:00	0	5.05
WOR-NOORD	12024	4	CAPE	ARTOIS	12:25:00	12:35:00	00:10:00	00:10:00	X 17007	BELLVILLE						05:45:00	0	5.95
WOR-NOORD	12024	4	CAPE	TULBAGHWEG	12:48:30	12:56:00	00:13:30	00:07:30	X 14255 / 7	BELLVILLE						05:45:00	0	8.92
WOR-NOORD	12024	4	CAPE	GOUDA	13:07:00	13:07:00	00:11:00			BELLVILLE						05:45:00	0	7.26
WOR-NOORD	12024	5	CAPE	VOELVLEI	13:16:00	13:35:00	00:09:00	00:19:00	X 18601 &amp; RF 71008	BELLVILLE						05:45:00	0	7.48
WOR-NOORD	12024	5	CAPE	HERMON	13:47:00	13:50:00	00:12:00	00:03:00	X 8913	BELLVILLE						05:45:00	0	7.62
WOR-NOORD	12024	6	CAPE	SOETENDAL	14:04:00	14:22:00	00:14:00	00:18:00	X 17011	BELLVILLE						05:45:00	0	10.57
WOR-NOORD	12024	7	CAPE	MALAN	14:32:00	14:32:00	00:10:00			BELLVILLE						05:45:00	0	1.33
WOR-NOORD	12024	7	CAPE	WELLINGTON	14:41:00	14:41:00	00:09:00			BELLVILLE						05:45:00	0	13.71
WOR-NOORD	12024	8	CAPE	MBEKWENI	14:45:00	14:45:00	00:04:00			BELLVILLE						05:45:00	0	4.53
WOR-NOORD	12024	8	CAPE	DALJOSAFAT	14:50:00	14:50:00	00:05:00			BELLVILLE						05:45:00	0	3.58
WOR-NOORD	12024	9	CAPE	HUGUENOT	14:54:00	14:54:00	00:04:00			BELLVILLE						05:45:00	0	2.52
WOR-NOORD	12024	10	CAPE	PAARL	14:59:00	14:59:00	00:05:00			BELLVILLE						05:45:00	0	4.24
WOR-NOORD	12024	11	CAPE	KLAPMUTS	15:12:00	15:12:00	00:13:00			BELLVILLE						05:45:00	0	10.68
WOR-NOORD	12024	11	CAPE	MULDERSVLEI	15:20:00	15:20:00	00:08:00			BELLVILLE						05:45:00	0	5.79
WOR-NOORD	12024	12	CAPE	KRAAIFONTEIN	15:32:00	15:32:00	00:12:00			BELLVILLE						05:45:00	0	10.21
WOR-NOORD	12024	13	CAPE	EIKENFONTEIN	15:34:00	15:34:00	00:02:00			BELLVILLE						05:45:00	0	1.66
WOR-NOORD	12024	13	CAPE	BRACKENFELL	15:39:00	15:55:00	00:05:00	00:16:00	F 71010	BELLVILLE						05:45:00	0	3.37
WOR-NOORD	12024	14	CAPE	STIKLAND	15:56:00	15:56:00	00:01:00			BELLVILLE						05:45:00	0	3.85
WOR-NOORD	12024	15	CAPE	BELLVILLE	16:15:00	00:00:00	00:19:00		RT	BELLVILLE						05:45:00	0	2.79
WOR-NOORD	12025	1	CAPE	WOR-NOORD		11:35:00				ORCHARD	11:35:00	11:59:00	3	YYYYYYY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	00:24:00	0	
WOR-NOORD	12025	1	CAPE	DEWET	11:42:00	11:42:00	00:07:00			ORCHARD						00:24:00	0	5.12
WOR-NOORD	12025	1	CAPE	SANDHILLS	11:52:00	11:52:00	00:10:00			ORCHARD						00:24:00	0	10.97
WOR-NOORD	12025	1	CAPE	HEXRIVIER	11:57:00	11:57:00	00:05:00			ORCHARD						00:24:00	0	5.83
WOR-NOORD	12025	1	CAPE	ORCHARD	11:59:00	00:00:00	00:02:00		RT	ORCHARD						00:24:00	0	3.08
WOR-NOORD	17635	1	CAPE	WOR-NOORD		19:00:00				BEACONSFIELD	19:00:00	16:45:00	1	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	21:45:00	0	
WOR-NOORD	17635	1	CAPE	DEWET	19:11:00	19:11:00	00:11:00		B	BEACONSFIELD						21:45:00	0	5.12
WOR-NOORD	17635	1	CAPE	SANDHILLS	19:23:30	19:23:30	00:12:30			BEACONSFIELD						21:45:00	0	10.97
WOR-NOORD	17635	1	CAPE	HEXRIVIER	19:29:00	19:29:00	00:05:30			BEACONSFIELD						21:45:00	0	5.83
WOR-NOORD	17635	1	CAPE	ORCHARD	19:32:30	19:32:30	00:03:30			BEACONSFIELD						21:45:00	0	3.08
WOR-NOORD	17635	2	CAPE	DEDOORNS	19:37:30	19:37:30	00:05:00			BEACONSFIELD						21:45:00	0	4.29
WOR-NOORD	17635	3	CAPE	ALMERIA	19:45:30	19:45:30	00:08:00			BEACONSFIELD						21:45:00	0	8.05
WOR-NOORD	17635	3	CAPE	SALBAR	19:54:30	19:54:30	00:09:00			BEACONSFIELD						21:45:00	0	6.58
WOR-NOORD	17635	3	CAPE	HEXTON	20:04:00	20:04:00	00:09:30			BEACONSFIELD						21:45:00	0	7.25
WOR-NOORD	17635	3	CAPE	KLEINSTRAAT	20:17:00	20:17:00	00:13:00			BEACONSFIELD						21:45:00	0	11.41
WOR-NOORD	17635	4	CAPE	HUGO	20:22:30	20:22:30	00:05:30			BEACONSFIELD						21:45:00	0	2.7
WOR-NOORD	17635	4	CAPE	TOUWSRIVIER	20:32:00	20:32:00	00:09:30			BEACONSFIELD						21:45:00	0	7.4
WOR-NOORD	17635	5	CAPE	DRAAI	20:40:30	20:40:30	00:08:30			BEACONSFIELD						21:45:00	0	5.66
WOR-NOORD	17635	5	CAPE	JANDEBOERS	20:48:30	20:48:30	00:08:00			BEACONSFIELD						21:45:00	0	7.12
WOR-NOORD	17635	5	CAPE	QUARRY	20:56:00	20:56:00	00:07:30			BEACONSFIELD						21:45:00	0	6.38
WOR-NOORD	17635	5	CAPE	KONSTABEL	21:05:30	21:05:30	00:09:30			BEACONSFIELD						21:45:00	0	7.65
WOR-NOORD	17635	5	CAPE	TWEEDSIDE	21:14:00	21:14:00	00:08:30			BEACONSFIELD						21:45:00	0	7.55
WOR-NOORD	17635	5	CAPE	PIETERMEINTJE	21:21:00	21:21:00	00:07:00			BEACONSFIELD						21:45:00	0	5.99
WOR-NOORD	17635	5	CAPE	MEMORIAL	21:29:00	21:29:00	00:08:00			BEACONSFIELD						21:45:00	0	5.32
WOR-NOORD	17635	5	CAPE	BANTAMS	21:35:30	21:35:30	00:06:30			BEACONSFIELD						21:45:00	0	4.87
WOR-NOORD	17635	5	CAPE	MATJIESFONTEI	21:43:30	21:43:30	00:08:00			BEACONSFIELD						21:45:00	0	5.58
WOR-NOORD	17635	5	CAPE	WHITEHILL	21:50:00	21:50:00	00:06:30			BEACONSFIELD						21:45:00	0	5.29
WOR-NOORD	17635	5	CAPE	SKEIDING	21:55:30	21:55:30	00:05:30			BEACONSFIELD						21:45:00	0	4.79
WOR-NOORD	17635	5	CAPE	BAVIAAN	22:03:30	22:03:30	00:08:00			BEACONSFIELD						21:45:00	0	5.86
WOR-NOORD	17635	5	CAPE	VISKUIL	22:11:00	22:11:00	00:07:30			BEACONSFIELD						21:45:00	0	5.83
WOR-NOORD	17635	5	CAPE	LAINGSBURG	22:18:00	22:25:00	00:07:00	00:07:00	X 81600	BEACONSFIELD						21:45:00	0	5.37
WOR-NOORD	17635	6	CAPE	GEELBEK	22:33:00	22:33:00	00:08:00			BEACONSFIELD						21:45:00	0	7.29
WOR-NOORD	17635	6	CAPE	VLEIFONTEIN	22:48:30	22:48:30	00:15:30			BEACONSFIELD						21:45:00	0	12.17
WOR-NOORD	17635	6	CAPE	RUITERSKOP	22:56:30	22:56:30	00:08:00			BEACONSFIELD						21:45:00	0	6.37
WOR-NOORD	17635	6	CAPE	WYKE	23:03:30	23:03:30	00:07:00			BEACONSFIELD						21:45:00	0	6.91
WOR-NOORD	17635	6	CAPE	KOUP	23:12:00	23:12:00	00:08:30			BEACONSFIELD						21:45:00	0	7.65
WOR-NOORD	17635	6	CAPE	GEMSBOK	23:24:30	23:24:30	00:12:30			BEACONSFIELD						21:45:00	0	10.6
WOR-NOORD	17635	6	CAPE	KETTING	23:30:30	23:30:30	00:06:00			BEACONSFIELD						21:45:00	0	5.59
WOR-NOORD	17635	6	CAPE	ANTJIESKRAAL	23:40:00	23:40:00	00:09:30			BEACONSFIELD						21:45:00	0	7.37
WOR-NOORD	17635	6	CAPE	DWYKA	23:46:30	23:46:30	00:06:30			BEACONSFIELD						21:45:00	0	5.04
WOR-NOORD	17635	6	CAPE	BOTESLAND	23:56:00	23:56:00	00:09:30			BEACONSFIELD						21:45:00	0	8.14
WOR-NOORD	17635	6	CAPE	PRINSALBERTRO	00:05:30	00:05:30	00:09:30			BEACONSFIELD						21:45:00	1	7.58
WOR-NOORD	17635	6	CAPE	WELTEVREDE	00:16:30	00:16:30	00:11:00			BEACONSFIELD						21:45:00	1	9
WOR-NOORD	17635	6	CAPE	ZWARTS	00:26:30	00:26:30	00:10:00			BEACONSFIELD						21:45:00	1	8.91
WOR-NOORD	17635	6	CAPE	PALMIET	00:34:00	00:34:00	00:07:30			BEACONSFIELD						21:45:00	1	7.41
WOR-NOORD	17635	6	CAPE	KRUIDFONTEIN	00:40:00	00:40:00	00:06:00			BEACONSFIELD						21:45:00	1	5.44
WOR-NOORD	17635	6	CAPE	LEEUGAMKA	00:49:00	00:51:00	00:09:00	00:02:00	X 1250	BEACONSFIELD						21:45:00	1	8.84
WOR-NOORD	17635	6	CAPE	KOETSKOP	01:01:00	01:01:00	00:10:00			BEACONSFIELD						21:45:00	1	9.94
WOR-NOORD	17635	6	CAPE	LUTTIG	01:10:00	01:10:00	00:09:00			BEACONSFIELD						21:45:00	1	9.19
WOR-NOORD	17635	7	CAPE	VIVIERS	01:20:00	01:30:00	00:10:00	00:10:00	X 81600	BEACONSFIELD						21:45:00	1	10.01
WOR-NOORD	17635	7	CAPE	LETJIESBOS	01:38:30	01:38:30	00:08:30			BEACONSFIELD						21:45:00	1	8.35
WOR-NOORD	17635	7	CAPE	STEINS	01:50:00	01:50:00	00:11:30			BEACONSFIELD						21:45:00	1	11.61
WOR-NOORD	17635	7	CAPE	KLIPBANK	02:01:00	02:01:00	00:11:00			BEACONSFIELD						21:45:00	1	10.26
WOR-NOORD	17635	7	CAPE	DROERIVIER	02:11:00	02:11:00	00:10:00			BEACONSFIELD						21:45:00	1	9.07
WOR-NOORD	17635	7	CAPE	BEAUFORTWEST	02:25:00	03:25:00	00:14:00	01:00:00	BO	BEACONSFIELD						21:45:00	1	8.98
WOR-NOORD	17635	1	CAPE	ACACIA	03:41:00	03:41:00	00:16:00			BEACONSFIELD						21:45:00	1	10.16
WOR-NOORD	17635	1	CAPE	LEMOEN	03:53:00	03:53:00	00:12:00			BEACONSFIELD						21:45:00	1	10.11
WOR-NOORD	17635	1	CAPE	RENOSTERKOP	04:04:00	04:04:00	00:11:00			BEACONSFIELD						21:45:00	1	10.65
WOR-NOORD	17635	1	CAPE	YSTERRANTE	04:11:00	04:11:00	00:07:00		X 41256 / 8	BEACONSFIELD						21:45:00	1	5.34
WOR-NOORD	17635	1	CAPE	RIEM	04:16:00	04:16:00	00:05:00			BEACONSFIELD						21:45:00	1	4.41
WOR-NOORD	17635	1	CAPE	JUK	04:20:30	04:20:30	00:04:30			BEACONSFIELD						21:45:00	1	4.65
WOR-NOORD	17635	1	CAPE	NELSPOORT	04:26:00	04:39:00	00:05:30	00:13:00	X 71008	BEACONSFIELD						21:45:00	1	5.37
WOR-NOORD	17635	1	CAPE	GANNA	04:46:30	04:46:30	00:07:30			BEACONSFIELD						21:45:00	1	7.09
WOR-NOORD	17635	1	CAPE	KROMRIVIER	04:54:30	04:54:30	00:08:00			BEACONSFIELD						21:45:00	1	8.09
WOR-NOORD	17635	1	CAPE	TRAVALIA	05:03:00	05:03:00	00:08:30			BEACONSFIELD						21:45:00	1	6.91
WOR-NOORD	17635	1	CAPE	THREESISTERS	05:11:00	05:11:00	00:08:00			BEACONSFIELD						21:45:00	1	6.54
WOR-NOORD	17635	1	CAPE	HAZEL	05:19:00	05:19:00	00:08:00			BEACONSFIELD						21:45:00	1	7.61
WOR-NOORD	17635	1	CAPE	NOBLESFONTEIN	05:26:00	05:26:00	00:07:00			BEACONSFIELD						21:45:00	1	6.55
WOR-NOORD	17635	1	CAPE	STAPELIA	05:33:00	05:35:00	00:07:00	00:02:00	X 71006	BEACONSFIELD						21:45:00	1	5.12
WOR-NOORD	17635	1	CAPE	BIESIESPOORT	05:40:00	05:40:00	00:05:00			BEACONSFIELD						21:45:00	1	5.04
WOR-NOORD	17635	1	CAPE	EGGOKLIP	05:46:00	05:46:00	00:06:00			BEACONSFIELD						21:45:00	1	5.79
WOR-NOORD	17635	1	CAPE	VERSTER	05:53:00	05:53:00	00:07:00			BEACONSFIELD						21:45:00	1	6.8
WOR-NOORD	17635	1	CAPE	HUTCHINSON	06:07:00	06:15:00	00:14:00	00:08:00	X 81600	BEACONSFIELD						21:45:00	1	12.39
WOR-NOORD	17635	2	CAPE	BARNARD	06:22:30	06:22:30	00:07:30			BEACONSFIELD						21:45:00	1	7.62
WOR-NOORD	17635	2	CAPE	FORTRUG	06:31:30	06:31:30	00:09:00			BEACONSFIELD						21:45:00	1	8.86
WOR-NOORD	17635	2	CAPE	BRAKPOORT	06:38:30	06:38:30	00:07:00			BEACONSFIELD						21:45:00	1	6.88
WOR-NOORD	17635	2	CAPE	WILDEBEESTE	06:48:30	06:48:30	00:10:00			BEACONSFIELD						21:45:00	1	9.52
WOR-NOORD	17635	2	CAPE	DEKLERK	06:57:30	06:57:30	00:09:00			BEACONSFIELD						21:45:00	1	10
WOR-NOORD	17635	2	CAPE	MERRIMAN	07:08:00	07:08:00	00:10:30			BEACONSFIELD						21:45:00	1	9.52
WOR-NOORD	17635	2	CAPE	LAKEN	07:16:30	07:16:30	00:08:30			BEACONSFIELD						21:45:00	1	8.56
WOR-NOORD	17635	2	CAPE	STERKAAR	07:25:30	07:25:30	00:09:00			BEACONSFIELD						21:45:00	1	8.42
WOR-NOORD	17635	2	CAPE	PLAATFONTEIN	07:33:00	07:33:00	00:07:30			BEACONSFIELD						21:45:00	1	7.28
WOR-NOORD	17635	2	CAPE	DEELFONTEIN	07:40:30	07:40:30	00:07:30			BEACONSFIELD						21:45:00	1	7.19
WOR-NOORD	17635	2	CAPE	JOEN	07:49:00	07:49:00	00:08:30			BEACONSFIELD						21:45:00	1	8.15
WOR-NOORD	17635	2	CAPE	MYNFONTEIN	07:57:00	07:57:00	00:08:00			BEACONSFIELD						21:45:00	1	7.95
WOR-NOORD	17635	2	CAPE	OLOFF	08:03:30	08:03:30	00:06:30			BEACONSFIELD						21:45:00	1	6.23
WOR-NOORD	17635	2	CAPE	DIEPUT	08:12:00	08:12:00	00:08:30			BEACONSFIELD						21:45:00	1	8.46
WOR-NOORD	17635	2	CAPE	BRITSVILLE	08:20:30	08:20:30	00:08:30			BEACONSFIELD						21:45:00	1	8.55
WOR-NOORD	17635	3	CAPE	DEAAR	08:35:00	09:05:00	00:14:30	00:30:00	SHUNT	BEACONSFIELD						21:45:00	1	6.94
WOR-NOORD	17635	4	CAPE	PERDEVLEI	09:22:00	09:22:00	00:17:00			BEACONSFIELD						21:45:00	1	12.02
WOR-NOORD	17635	4	CAPE	BEHRSHOEK	09:31:00	09:31:00	00:09:00			BEACONSFIELD						21:45:00	1	8.82
WOR-NOORD	17635	4	CAPE	HOUTKRAAL	09:46:00	09:56:00	00:15:00	00:10:00	X8856	BEACONSFIELD						21:45:00	1	9.51
WOR-NOORD	17635	4	CAPE	BAARTMAN	10:07:00	10:07:00	00:11:00			BEACONSFIELD						21:45:00	1	12.14
WOR-NOORD	17635	4	CAPE	POTFONTEIN	10:18:00	10:55:00	00:11:00	00:37:00	X1214	BEACONSFIELD						21:45:00	1	8.84
WOR-NOORD	17635	4	CAPE	KALKBULT	11:06:00	11:06:00	00:11:00			BEACONSFIELD						21:45:00	1	8.71
WOR-NOORD	17635	4	CAPE	POUPAN	11:17:00	11:17:00	00:11:00			BEACONSFIELD						21:45:00	1	9.91
WOR-NOORD	17635	4	CAPE	KRAANKUIL	11:36:00	12:00:00	00:19:00	00:24:00	X1250	BEACONSFIELD						21:45:00	1	18.08
WOR-NOORD	17635	4	CAPE	ORR-KKL-LOOP130	12:13:00	12:13:00	00:13:00			BEACONSFIELD						21:45:00	1	12.39
WOR-NOORD	17635	4	CAPE	ORANJERIVIER	12:26:00	12:30:00	00:13:00	00:04:00	X1256	BEACONSFIELD						21:45:00	1	11.64
WOR-NOORD	17635	5	CAPE	WITPUT	12:48:00	13:02:00	00:18:00	00:14:00	X3471	BEACONSFIELD						21:45:00	1	16.6
WOR-NOORD	17635	5	CAPE	BELMONT	13:20:00	13:20:00	00:18:00			BEACONSFIELD						21:45:00	1	16.6
WOR-NOORD	17635	6	CAPE	GRASPAN	13:35:00	14:23:00	00:15:00	00:48:00	RM X81600; 1210	BEACONSFIELD						21:45:00	1	13.41
WOR-NOORD	17635	6	CAPE	HEUNINGNESKLO	14:42:00	14:42:00	00:19:00			BEACONSFIELD						21:45:00	1	16.28
WOR-NOORD	17635	6	CAPE	KLOKFONTEIN	14:53:00	14:53:00	00:11:00			BEACONSFIELD						21:45:00	1	9.06
WOR-NOORD	17635	6	CAPE	MODDERRIVIER	15:05:00	15:41:00	00:12:00	00:36:00	X8732; 1450	BEACONSFIELD						21:45:00	1	12.63
WOR-NOORD	17635	7	CAPE	SPYTFONTEIN	16:03:00	16:03:00	00:22:00			BEACONSFIELD						21:45:00	1	16.48
WOR-NOORD	17635	7	CAPE	BEC-OUTERREIN	16:20:00	16:35:00	00:17:00	00:15:00		BEACONSFIELD						21:45:00	1	17.01
WOR-NOORD	17635	8	CAPE	BEACONSFIELD	16:45:00	00:00:00	00:10:00		BO	BEACONSFIELD						21:45:00	1	1
WOR-NOORD	22024	1	CAPE	WOR-NOORD		09:40:00				WOR-NOORD	09:40:00	13:25:00	3	YAYAAAY	VACUUM TRAINS/SHUNT CAR	03:45:00	0	
WOR-NOORD	22024	1	CAPE	WOR/S140031	09:43:00	09:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	22024	1	CAPE	WOR/S145122	09:49:00	09:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	22024	2	CAPE	WOR/S140031	09:55:00	09:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	22024	2	CAPE	WOR-NOORD	10:01:00	10:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	22024	3	CAPE	WON/S161438	10:07:00	10:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	22024	3	CAPE	WOR/S145181	10:13:00	10:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.54
WOR-NOORD	22024	3	CAPE	WOR/S145173	10:19:00	10:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.59
WOR-NOORD	22024	4	CAPE	WOR/S145181	10:25:00	10:28:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.59
WOR-NOORD	22024	4	CAPE	WON/S161438	10:31:00	10:34:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.54
WOR-NOORD	22024	4	CAPE	WOR-NOORD	10:37:00	10:40:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	22024	5	CAPE	WOR/S160725	10:43:00	10:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	22024	5	CAPE	WON/S161128	10:49:00	10:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	22024	6	CAPE	WOR/S160725	10:55:00	10:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	22024	6	CAPE	WOR-NOORD	11:01:00	11:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.16
WOR-NOORD	22024	7	CAPE	WOR/S161063	11:07:00	11:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.77
WOR-NOORD	22024	8	CAPE	WOR-NOORD	11:13:00	11:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.77
WOR-NOORD	22024	9	CAPE	WOR/S140333	11:19:00	11:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.41
WOR-NOORD	22024	9	CAPE	WOR/S140538	11:25:00	11:28:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	22024	9	CAPE	WOR/S140589	11:31:00	11:34:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.7
WOR-NOORD	22024	9	CAPE	WOR/S140473	11:37:00	11:40:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.66
WOR-NOORD	22024	9	CAPE	WOR/S140422	11:43:00	11:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	22024	9	CAPE	WON/S161306	11:49:00	11:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	22024	9	CAPE	WOR/S140384	11:55:00	11:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	22024	10	CAPE	WON/S161306	12:01:00	12:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	22024	10	CAPE	WOR/S140422	12:07:00	12:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	
WOR-NOORD	22024	10	CAPE	WOR/S140473	12:13:00	12:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	22024	10	CAPE	WOR/S140589	12:19:00	12:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	3.66
WOR-NOORD	22024	10	CAPE	WOR/S140538	12:25:00	12:28:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.7
WOR-NOORD	22024	10	CAPE	WOR/S140333	12:31:00	12:34:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.97
WOR-NOORD	22024	10	CAPE	WOR-NOORD	12:37:00	12:40:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	2.41
WOR-NOORD	22024	11	CAPE	WOR/S145386	12:43:00	12:46:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	5.05
WOR-NOORD	22024	11	CAPE	WOR/S140635	12:49:00	12:52:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	1.11
WOR-NOORD	22024	12	CAPE	WOR/S145386	12:55:00	12:58:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	1.11
WOR-NOORD	22024	12	CAPE	WOR-NOORD	13:01:00	13:04:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	5.05
WOR-NOORD	22024	13	CAPE	WOR-HERSTEL	13:07:00	13:10:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	4.55
WOR-NOORD	22024	13	CAPE	WOR/S140686	13:13:00	13:16:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.64
WOR-NOORD	22024	14	CAPE	WOR-HERSTEL	13:19:00	13:22:00	00:03:00	00:03:00	RANGEER	WOR-NOORD						03:45:00	0	0.64
WOR-NOORD	22024	14	CAPE	WOR-NOORD	13:25:00	00:00:00	00:03:00		RT	WOR-NOORD						03:45:00	0	4.55
WOR-NOORD	48915	1	CAPE	WOR-NOORD		22:45:00				KAZ-CITYDEEP	22:45:00	09:55:00	1	YYYYYYY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	35:10:00	0	
WOR-NOORD	48915	1	CAPE	DEWET	22:56:00	22:56:00	00:11:00		C	KAZ-CITYDEEP						35:10:00	0	5.12
WOR-NOORD	48915	1	CAPE	SANDHILLS	23:08:30	23:08:30	00:12:30			KAZ-CITYDEEP						35:10:00	0	10.97
WOR-NOORD	48915	1	CAPE	HEXRIVIER	23:14:00	23:14:00	00:05:30			KAZ-CITYDEEP						35:10:00	0	5.83
WOR-NOORD	48915	1	CAPE	ORCHARD	23:17:30	23:17:30	00:03:30			KAZ-CITYDEEP						35:10:00	0	3.08
WOR-NOORD	48915	2	CAPE	DEDOORNS	23:22:30	23:22:30	00:05:00			KAZ-CITYDEEP						35:10:00	0	4.29
WOR-NOORD	48915	3	CAPE	ALMERIA	23:30:30	23:30:30	00:08:00			KAZ-CITYDEEP						35:10:00	0	8.05
WOR-NOORD	48915	3	CAPE	SALBAR	23:39:30	23:39:30	00:09:00			KAZ-CITYDEEP						35:10:00	0	6.58
WOR-NOORD	48915	3	CAPE	HEXTON	23:49:00	23:49:00	00:09:30			KAZ-CITYDEEP						35:10:00	0	7.25
WOR-NOORD	48915	3	CAPE	KLEINSTRAAT	00:02:00	00:02:00	00:13:00			KAZ-CITYDEEP						35:10:00	1	11.41
WOR-NOORD	48915	4	CAPE	HUGO	00:07:30	00:07:30	00:05:30			KAZ-CITYDEEP						35:10:00	1	2.7
WOR-NOORD	48915	4	CAPE	TOUWSRIVIER	00:17:00	00:17:00	00:09:30			KAZ-CITYDEEP						35:10:00	1	7.4
WOR-NOORD	48915	5	CAPE	DRAAI	00:25:30	00:25:30	00:08:30			KAZ-CITYDEEP						35:10:00	1	5.66
WOR-NOORD	48915	5	CAPE	JANDEBOERS	00:33:30	00:33:30	00:08:00			KAZ-CITYDEEP						35:10:00	1	7.12
WOR-NOORD	48915	5	CAPE	QUARRY	00:41:00	00:41:00	00:07:30			KAZ-CITYDEEP						35:10:00	1	6.38
WOR-NOORD	48915	5	CAPE	KONSTABEL	00:50:30	00:50:30	00:09:30			KAZ-CITYDEEP						35:10:00	1	7.65
WOR-NOORD	48915	5	CAPE	TWEEDSIDE	00:59:00	00:59:00	00:08:30			KAZ-CITYDEEP						35:10:00	1	7.55
WOR-NOORD	48915	5	CAPE	PIETERMEINTJE	01:06:00	01:06:00	00:07:00			KAZ-CITYDEEP						35:10:00	1	5.99
WOR-NOORD	48915	5	CAPE	MEMORIAL	01:14:00	01:14:00	00:08:00			KAZ-CITYDEEP						35:10:00	1	5.32
WOR-NOORD	48915	5	CAPE	BANTAMS	01:20:30	01:20:30	00:06:30			KAZ-CITYDEEP						35:10:00	1	4.87
WOR-NOORD	48915	5	CAPE	MATJIESFONTEI	01:28:30	01:28:30	00:08:00			KAZ-CITYDEEP						35:10:00	1	5.58
WOR-NOORD	48915	5	CAPE	WHITEHILL	01:35:00	01:35:00	00:06:30			KAZ-CITYDEEP						35:10:00	1	5.29
WOR-NOORD	48915	5	CAPE	SKEIDING	01:40:30	01:40:30	00:05:30			KAZ-CITYDEEP						35:10:00	1	4.79
WOR-NOORD	48915	5	CAPE	BAVIAAN	01:46:30	01:46:30	00:06:00			KAZ-CITYDEEP						35:10:00	1	5.86
WOR-NOORD	48915	5	CAPE	VISKUIL	01:56:00	01:56:00	00:09:30			KAZ-CITYDEEP						35:10:00	1	5.83
WOR-NOORD	48915	5	CAPE	LAINGSBURG	02:02:30	02:04:00	00:06:30	00:01:30	X 81600	KAZ-CITYDEEP						35:10:00	1	5.37
WOR-NOORD	48915	6	CAPE	GEELBEK	02:12:00	02:12:00	00:08:00			KAZ-CITYDEEP						35:10:00	1	7.29
WOR-NOORD	48915	6	CAPE	VLEIFONTEIN	02:27:30	02:27:30	00:15:30			KAZ-CITYDEEP						35:10:00	1	12.17
WOR-NOORD	48915	6	CAPE	RUITERSKOP	02:35:30	02:35:30	00:08:00			KAZ-CITYDEEP						35:10:00	1	6.37
WOR-NOORD	48915	6	CAPE	WYKE	02:42:30	02:42:30	00:07:00			KAZ-CITYDEEP						35:10:00	1	6.91
WOR-NOORD	48915	6	CAPE	KOUP	02:51:00	02:51:00	00:08:30			KAZ-CITYDEEP						35:10:00	1	7.65
WOR-NOORD	48915	6	CAPE	GEMSBOK	03:03:30	03:03:30	00:12:30			KAZ-CITYDEEP						35:10:00	1	10.6
WOR-NOORD	48915	6	CAPE	KETTING	03:09:30	03:09:30	00:06:00			KAZ-CITYDEEP						35:10:00	1	5.59
WOR-NOORD	48915	6	CAPE	ANTJIESKRAAL	03:17:30	03:17:30	00:08:00		X 81600	KAZ-CITYDEEP						35:10:00	1	7.37
WOR-NOORD	48915	6	CAPE	DWYKA	03:24:00	03:24:00	00:06:30			KAZ-CITYDEEP						35:10:00	1	5.04
WOR-NOORD	48915	6	CAPE	BOTESLAND	03:33:30	03:33:30	00:09:30			KAZ-CITYDEEP						35:10:00	1	8.14
WOR-NOORD	48915	6	CAPE	PRINSALBERTRO	03:43:00	03:43:00	00:09:30			KAZ-CITYDEEP						35:10:00	1	7.58
WOR-NOORD	48915	6	CAPE	WELTEVREDE	03:54:00	03:54:00	00:11:00			KAZ-CITYDEEP						35:10:00	1	9
WOR-NOORD	48915	6	CAPE	ZWARTS	04:04:00	04:04:00	00:10:00			KAZ-CITYDEEP						35:10:00	1	8.91
WOR-NOORD	48915	6	CAPE	PALMIET	04:11:30	04:25:00	00:07:30	00:13:30	X 81002	KAZ-CITYDEEP						35:10:00	1	7.41
WOR-NOORD	48915	6	CAPE	KRUIDFONTEIN	04:31:00	04:31:00	00:06:00			KAZ-CITYDEEP						35:10:00	1	5.44
WOR-NOORD	48915	6	CAPE	LEEUGAMKA	04:40:00	04:42:00	00:09:00	00:02:00	X 71010	KAZ-CITYDEEP						35:10:00	1	8.84
WOR-NOORD	48915	6	CAPE	KOETSKOP	04:52:00	04:52:00	00:10:00			KAZ-CITYDEEP						35:10:00	1	9.94
WOR-NOORD	48915	6	CAPE	LUTTIG	05:01:00	05:01:00	00:09:00			KAZ-CITYDEEP						35:10:00	1	9.19
WOR-NOORD	48915	7	CAPE	VIVIERS	05:11:00	05:11:00	00:10:00			KAZ-CITYDEEP						35:10:00	1	10.01
WOR-NOORD	48915	7	CAPE	LETJIESBOS	05:19:30	05:19:30	00:08:30			KAZ-CITYDEEP						35:10:00	1	8.35
WOR-NOORD	48915	7	CAPE	STEINS	05:31:00	05:31:00	00:11:30		X 41256 / 8	KAZ-CITYDEEP						35:10:00	1	11.61
WOR-NOORD	48915	7	CAPE	KLIPBANK	05:42:00	05:42:00	00:11:00			KAZ-CITYDEEP						35:10:00	1	10.26
WOR-NOORD	48915	7	CAPE	DROERIVIER	05:52:00	06:12:00	00:10:00	00:20:00	X 71008	KAZ-CITYDEEP						35:10:00	1	9.07
WOR-NOORD	48915	7	CAPE	BEAUFORTWEST	06:25:00	07:10:00	00:13:00	00:45:00	BO	KAZ-CITYDEEP						35:10:00	1	8.98
WOR-NOORD	48915	1	CAPE	ACACIA	07:26:00	07:26:00	00:16:00			KAZ-CITYDEEP						35:10:00	1	10.16
WOR-NOORD	48915	1	CAPE	LEMOEN	07:38:00	07:38:00	00:12:00			KAZ-CITYDEEP						35:10:00	1	10.11
WOR-NOORD	48915	1	CAPE	RENOSTERKOP	07:49:00	07:49:00	00:11:00			KAZ-CITYDEEP						35:10:00	1	10.65
WOR-NOORD	48915	1	CAPE	YSTERRANTE	07:54:30	07:54:30	00:05:30			KAZ-CITYDEEP						35:10:00	1	5.34
WOR-NOORD	48915	1	CAPE	RIEM	07:59:30	07:59:30	00:05:00			KAZ-CITYDEEP						35:10:00	1	4.41
WOR-NOORD	48915	1	CAPE	JUK	08:04:00	08:04:00	00:04:30			KAZ-CITYDEEP						35:10:00	1	4.65
WOR-NOORD	48915	1	CAPE	NELSPOORT	08:09:30	08:09:30	00:05:30			KAZ-CITYDEEP						35:10:00	1	5.37
WOR-NOORD	48915	1	CAPE	GANNA	08:17:00	08:17:00	00:07:30			KAZ-CITYDEEP						35:10:00	1	7.09
WOR-NOORD	48915	1	CAPE	KROMRIVIER	08:25:00	08:25:00	00:08:00			KAZ-CITYDEEP						35:10:00	1	8.09
WOR-NOORD	48915	1	CAPE	TRAVALIA	08:33:30	08:33:30	00:08:30			KAZ-CITYDEEP						35:10:00	1	6.91
WOR-NOORD	48915	1	CAPE	THREESISTERS	08:41:30	08:41:30	00:08:00			KAZ-CITYDEEP						35:10:00	1	6.54
WOR-NOORD	48915	1	CAPE	HAZEL	08:49:30	08:49:30	00:08:00			KAZ-CITYDEEP						35:10:00	1	7.61
WOR-NOORD	48915	1	CAPE	NOBLESFONTEIN	08:56:30	08:56:30	00:07:00			KAZ-CITYDEEP						35:10:00	1	6.55
WOR-NOORD	48915	1	CAPE	STAPELIA	09:03:00	09:03:00	00:06:30			KAZ-CITYDEEP						35:10:00	1	5.12
WOR-NOORD	48915	1	CAPE	BIESIESPOORT	09:08:00	09:08:00	00:05:00			KAZ-CITYDEEP						35:10:00	1	5.04
WOR-NOORD	48915	1	CAPE	EGGOKLIP	09:14:00	09:14:00	00:06:00			KAZ-CITYDEEP						35:10:00	1	5.79
WOR-NOORD	48915	1	CAPE	VERSTER	09:21:00	09:21:00	00:07:00			KAZ-CITYDEEP						35:10:00	1	6.8
WOR-NOORD	48915	1	CAPE	HUTCHINSON	09:34:30	09:40:00	00:13:30	00:05:30	X 81600	KAZ-CITYDEEP						35:10:00	1	12.39
WOR-NOORD	48915	2	CAPE	BARNARD	09:47:30	09:47:30	00:07:30			KAZ-CITYDEEP						35:10:00	1	7.62
WOR-NOORD	48915	2	CAPE	FORTRUG	09:56:30	09:56:30	00:09:00			KAZ-CITYDEEP						35:10:00	1	8.86
WOR-NOORD	48915	2	CAPE	BRAKPOORT	10:03:30	10:03:30	00:07:00			KAZ-CITYDEEP						35:10:00	1	6.88
WOR-NOORD	48915	2	CAPE	WILDEBEESTE	10:13:30	10:13:30	00:10:00			KAZ-CITYDEEP						35:10:00	1	9.52
WOR-NOORD	48915	2	CAPE	DEKLERK	10:22:30	10:22:30	00:09:00			KAZ-CITYDEEP						35:10:00	1	10
WOR-NOORD	48915	2	CAPE	MERRIMAN	10:33:00	10:33:00	00:10:30			KAZ-CITYDEEP						35:10:00	1	9.52
WOR-NOORD	48915	2	CAPE	LAKEN	10:41:30	10:41:30	00:08:30			KAZ-CITYDEEP						35:10:00	1	8.56
WOR-NOORD	48915	2	CAPE	STERKAAR	10:50:30	10:50:30	00:09:00			KAZ-CITYDEEP						35:10:00	1	8.42
WOR-NOORD	48915	2	CAPE	PLAATFONTEIN	10:58:00	10:58:00	00:07:30			KAZ-CITYDEEP						35:10:00	1	7.28
WOR-NOORD	48915	2	CAPE	DEELFONTEIN	11:05:30	11:05:30	00:07:30			KAZ-CITYDEEP						35:10:00	1	7.19
WOR-NOORD	48915	2	CAPE	JOEN	11:14:00	11:14:00	00:08:30			KAZ-CITYDEEP						35:10:00	1	8.15
WOR-NOORD	48915	2	CAPE	MYNFONTEIN	11:22:00	11:22:00	00:08:00			KAZ-CITYDEEP						35:10:00	1	7.95
WOR-NOORD	48915	2	CAPE	OLOFF	11:28:30	11:28:30	00:06:30			KAZ-CITYDEEP						35:10:00	1	6.23
WOR-NOORD	48915	2	CAPE	DIEPUT	11:37:00	11:37:00	00:08:30			KAZ-CITYDEEP						35:10:00	1	8.46
WOR-NOORD	48915	2	CAPE	BRITSVILLE	11:45:30	11:45:30	00:08:30			KAZ-CITYDEEP						35:10:00	1	8.55
WOR-NOORD	48915	3	CAPE	DEAAR	12:00:00	13:50:00	00:14:30	01:50:00	SHUNT	KAZ-CITYDEEP						35:10:00	1	6.94
WOR-NOORD	48915	4	CAPE	PERDEVLEI	14:07:00	14:50:00	00:17:00	00:43:00	X1250; 1256	KAZ-CITYDEEP						35:10:00	1	12.02
WOR-NOORD	48915	4	CAPE	BEHRSHOEK	14:59:00	14:59:00	00:09:00			KAZ-CITYDEEP						35:10:00	1	8.82
WOR-NOORD	48915	4	CAPE	HOUTKRAAL	15:14:00	15:18:00	00:15:00	00:04:00	X3471	KAZ-CITYDEEP						35:10:00	1	9.51
WOR-NOORD	48915	4	CAPE	BAARTMAN	15:29:00	15:29:00	00:11:00			KAZ-CITYDEEP						35:10:00	1	12.14
WOR-NOORD	48915	4	CAPE	POTFONTEIN	15:40:00	15:53:00	00:11:00	00:13:00	X1210	KAZ-CITYDEEP						35:10:00	1	8.84
WOR-NOORD	48915	4	CAPE	KALKBULT	16:04:00	16:04:00	00:11:00			KAZ-CITYDEEP						35:10:00	1	8.71
WOR-NOORD	48915	4	CAPE	POUPAN	16:15:00	16:15:00	00:11:00			KAZ-CITYDEEP						35:10:00	1	9.91
WOR-NOORD	48915	4	CAPE	KRAANKUIL	16:34:00	16:37:00	00:19:00	00:03:00	X81600	KAZ-CITYDEEP						35:10:00	1	18.08
WOR-NOORD	48915	4	CAPE	ORR-KKL-LOOP130	16:50:00	17:10:00	00:13:00	00:20:00	X8732	KAZ-CITYDEEP						35:10:00	1	12.39
WOR-NOORD	48915	4	CAPE	ORANJERIVIER	17:23:00	17:40:00	00:13:00	00:17:00	X1450	KAZ-CITYDEEP						35:10:00	1	11.64
WOR-NOORD	48915	5	CAPE	WITPUT	17:58:00	18:10:00	00:18:00	00:12:00	RM X8912	KAZ-CITYDEEP						35:10:00	1	16.6
WOR-NOORD	48915	5	CAPE	BELMONT	18:28:00	18:28:00	00:18:00			KAZ-CITYDEEP						35:10:00	1	16.6
WOR-NOORD	48915	6	CAPE	GRASPAN	18:43:00	18:45:00	00:15:00	00:02:00	X3472	KAZ-CITYDEEP						35:10:00	1	13.41
WOR-NOORD	48915	6	CAPE	HEUNINGNESKLO	19:04:00	19:04:00	00:19:00			KAZ-CITYDEEP						35:10:00	1	16.28
WOR-NOORD	48915	6	CAPE	KLOKFONTEIN	19:15:00	19:15:00	00:11:00			KAZ-CITYDEEP						35:10:00	1	9.06
WOR-NOORD	48915	6	CAPE	MODDERRIVIER	19:27:00	19:27:00	00:12:00			KAZ-CITYDEEP						35:10:00	1	12.63
WOR-NOORD	48915	7	CAPE	SPYTFONTEIN	19:49:00	19:49:00	00:22:00			KAZ-CITYDEEP						35:10:00	1	16.48
WOR-NOORD	48915	7	CAPE	BEC-OUTERREIN	20:05:00	20:05:00	00:16:00			KAZ-CITYDEEP						35:10:00	1	17.01
WOR-NOORD	48915	8	CAPE	BEACONSFIELD	20:10:00	20:45:00	00:05:00	00:35:00	BO SHUNT	KAZ-CITYDEEP						35:10:00	1	1
WOR-NOORD	48915	1	CAPE	KAMFERSDAM	21:07:00	21:07:00	00:22:00			KAZ-CITYDEEP						35:10:00	1	9.18
WOR-NOORD	48915	2	CAPE	DRONFIELD	21:16:00	21:16:00	00:09:00			KAZ-CITYDEEP						35:10:00	1	7.08
WOR-NOORD	48915	2	CAPE	MACFARLANE	21:25:00	21:25:00	00:09:00			KAZ-CITYDEEP						35:10:00	1	8
WOR-NOORD	48915	3	CAPE	RIVERTON	21:32:00	21:32:00	00:07:00			KAZ-CITYDEEP						35:10:00	1	6.12
WOR-NOORD	48915	4	CAPE	SLYPKLIP	21:41:00	21:41:00	00:09:00			KAZ-CITYDEEP						35:10:00	1	7.92
WOR-NOORD	48915	4	CAPE	WINDSORTONROA	22:00:00	22:00:00	00:19:00			KAZ-CITYDEEP						35:10:00	1	9.4
WOR-NOORD	48915	5	CAPE	KOEDOE	22:08:00	22:08:00	00:08:00			KAZ-CITYDEEP						35:10:00	1	12.4
WOR-NOORD	48915	5	CAPE	CONTENT	22:25:00	22:25:00	00:17:00			KAZ-CITYDEEP						35:10:00	1	8
WOR-NOORD	48915	5	CAPE	WARRENTON	22:41:00	23:00:00	00:16:00	00:19:00	RT	KAZ-CITYDEEP						35:10:00	1	12.64
WOR-NOORD	48915	6	CAPE	VEERTIENSTROM	23:08:00	23:08:00	00:08:00			KAZ-CITYDEEP						35:10:00	1	5.8
WOR-NOORD	48915	7	CENTRAL	CAMELFORD	23:23:00	23:50:00	00:15:00	00:27:00		KAZ-CITYDEEP						35:10:00	1	13.9
WOR-NOORD	48915	7	CENTRAL	FENDYKE	00:01:00	00:01:00	00:11:00			KAZ-CITYDEEP						35:10:00	2	9.69
WOR-NOORD	48915	7	CENTRAL	CHRISTIANA	00:16:00	00:16:00	00:15:00			KAZ-CITYDEEP						35:10:00	2	9.91
WOR-NOORD	48915	8	CENTRAL	KROMELLENBOOG	00:39:00	00:50:00	00:23:00	00:11:00	X2446	KAZ-CITYDEEP						35:10:00	2	14.18
WOR-NOORD	48915	9	CENTRAL	BRITTEN	01:06:00	01:06:00	00:16:00			KAZ-CITYDEEP						35:10:00	2	11.77
WOR-NOORD	48915	10	CENTRAL	FERNDALE	01:18:00	01:18:00	00:12:00			KAZ-CITYDEEP						35:10:00	2	8.82
WOR-NOORD	48915	10	CENTRAL	WILDHOEN	01:26:00	01:26:00	00:08:00			KAZ-CITYDEEP						35:10:00	2	4.94
WOR-NOORD	48915	10	CENTRAL	YDELHOOP	01:42:00	01:42:00	00:16:00			KAZ-CITYDEEP						35:10:00	2	7.11
WOR-NOORD	48915	10	CENTRAL	BLOEMHOF	01:49:00	01:49:00	00:07:00			KAZ-CITYDEEP						35:10:00	2	6.28
WOR-NOORD	48915	11	CENTRAL	STRYDERS	01:55:00	01:55:00	00:06:00			KAZ-CITYDEEP						35:10:00	2	6.62
WOR-NOORD	48915	11	CENTRAL	GRASSLANDS	02:04:00	02:04:00	00:09:00			KAZ-CITYDEEP						35:10:00	2	6.5
WOR-NOORD	48915	11	CENTRAL	KINGSWOOD	02:11:00	02:11:00	00:07:00			KAZ-CITYDEEP						35:10:00	2	11.74
WOR-NOORD	48915	12	CENTRAL	DRIERUITERS	02:23:30	02:23:30	00:12:30			KAZ-CITYDEEP						35:10:00	2	6.5
WOR-NOORD	48915	12	CENTRAL	BOSKUIL	02:31:30	02:31:30	00:08:00			KAZ-CITYDEEP						35:10:00	2	6.26
WOR-NOORD	48915	12	CENTRAL	MAKWASSIE	02:47:30	02:47:30	00:16:00			KAZ-CITYDEEP						35:10:00	2	15.56
WOR-NOORD	48915	13	CENTRAL	EERSTELING	03:00:30	03:00:30	00:13:00			KAZ-CITYDEEP						35:10:00	2	9.66
WOR-NOORD	48915	13	CENTRAL	DAALDER	03:16:30	03:16:30	00:16:00			KAZ-CITYDEEP						35:10:00	2	7.48
WOR-NOORD	48915	13	CENTRAL	LEEUDORINGSTA	03:22:30	03:22:30	00:06:00			KAZ-CITYDEEP						35:10:00	2	8.38
WOR-NOORD	48915	14	CENTRAL	LEEUBOS	03:31:30	03:31:30	00:09:00			KAZ-CITYDEEP						35:10:00	2	9.68
WOR-NOORD	48915	14	CENTRAL	HARRISBURG	03:48:30	03:48:30	00:17:00			KAZ-CITYDEEP						35:10:00	2	9.56
WOR-NOORD	48915	14	CENTRAL	REGINA	04:04:30	04:04:30	00:16:00			KAZ-CITYDEEP						35:10:00	2	14.71
WOR-NOORD	48915	15	CENTRAL	DEAN	04:20:00	04:20:00	00:15:30			KAZ-CITYDEEP						35:10:00	2	7.44
WOR-NOORD	48915	15	CENTRAL	LAVA	04:27:30	04:27:30	00:07:30			KAZ-CITYDEEP						35:10:00	2	5.33
WOR-NOORD	48915	15	CENTRAL	ORKNEY	04:34:30	04:41:00	00:07:00	00:06:30	X1450	KAZ-CITYDEEP						35:10:00	2	6.54
WOR-NOORD	48915	16	CENTRAL	ARISTON	04:48:00	04:48:00	00:07:00			KAZ-CITYDEEP						35:10:00	2	3.43
WOR-NOORD	48915	16	CENTRAL	KLERKSDORP	05:00:00	05:00:00	00:12:00			KAZ-CITYDEEP						35:10:00	2	6.58
WOR-NOORD	48915	17	CENTRAL	SANDPAN	05:06:00	05:06:00	00:06:00			KAZ-CITYDEEP						35:10:00	2	6.41
WOR-NOORD	48915	17	CENTRAL	STILFONTEIN	05:11:00	05:11:00	00:05:00			KAZ-CITYDEEP						35:10:00	2	2.95
WOR-NOORD	48915	17	CENTRAL	KOEKEMOER	05:22:00	05:22:00	00:11:00			KAZ-CITYDEEP						35:10:00	2	4.91
WOR-NOORD	48915	18	CENTRAL	NEWMACHAVIE	05:28:00	05:28:00	00:06:00			KAZ-CITYDEEP						35:10:00	2	13.17
WOR-NOORD	48915	18	CENTRAL	CRESCENT	05:41:00	05:41:00	00:13:00			KAZ-CITYDEEP						35:10:00	2	9.52
WOR-NOORD	48915	18	CENTRAL	POTCHEFSTROOM	05:54:00	05:54:00	00:13:00			KAZ-CITYDEEP						35:10:00	2	9.92
WOR-NOORD	48915	19	CENTRAL	CACHET	05:57:00	05:57:00	00:03:00			KAZ-CITYDEEP						35:10:00	2	2.6
WOR-NOORD	48915	20	CENTRAL	TARENTAAL	06:02:00	06:02:00	00:05:00			KAZ-CITYDEEP						35:10:00	2	9.08
WOR-NOORD	48915	20	CENTRAL	KLIPDRIF	06:07:00	06:07:00	00:05:00			KAZ-CITYDEEP						35:10:00	2	9.75
WOR-NOORD	48915	20	CENTRAL	ENSELSPRUIT	06:11:00	06:11:00	00:04:00			KAZ-CITYDEEP						35:10:00	2	14.5
WOR-NOORD	48915	21	CENTRAL	FOCHVILLE	06:19:00	06:19:00	00:08:00			KAZ-CITYDEEP						35:10:00	2	13.18
WOR-NOORD	48915	21	CENTRAL	MICHAELSRAAD	06:26:00	06:26:00	00:07:00			KAZ-CITYDEEP						35:10:00	2	10.93
WOR-NOORD	48915	21	CENTRAL	RAATHSVLEI	06:34:00	06:34:00	00:08:00			KAZ-CITYDEEP						35:10:00	2	4.88
WOR-NOORD	48915	22	CENTRAL	BLOEKOMHEUNING	06:39:00	06:39:00	00:05:00			KAZ-CITYDEEP						35:10:00	2	7.78
WOR-NOORD	48915	22		VANDERBIJL	06:43:00	06:43:00	00:04:00			KAZ-CITYDEEP						35:10:00	2	7.95
WOR-NOORD	48915	22	CENTRAL	VANDERBIJLPAR	06:45:00	06:45:00	00:02:00			KAZ-CITYDEEP						35:10:00	2	1
WOR-NOORD	48915	22	CENTRAL	HOUTHEUWEL	06:53:00	06:53:00	00:08:00			KAZ-CITYDEEP						35:10:00	2	5.34
WOR-NOORD	48915	23	CENTRAL	KLEIGROND	06:58:00	06:58:00	00:05:00			KAZ-CITYDEEP						35:10:00	2	4.38
WOR-NOORD	48915	24	CENTRAL	LEEUHOF	07:06:00	07:16:00	00:08:00	00:10:00	F18601	KAZ-CITYDEEP						35:10:00	2	3.06
WOR-NOORD	48915	25	CENTRAL	DUNCANVILLE	07:20:00	07:20:00	00:04:00			KAZ-CITYDEEP						35:10:00	2	3.12
WOR-NOORD	48915	25	CENTRAL	VER-NOORD	07:24:00	07:24:00	00:04:00			KAZ-CITYDEEP						35:10:00	2	0.98
WOR-NOORD	48915	26	CENTRAL	ALLOY	07:28:00	07:28:00	00:04:00			KAZ-CITYDEEP						35:10:00	2	1.55
WOR-NOORD	48915	26	CENTRAL	REDAN	07:34:00	07:49:00	00:06:00	00:15:00	RM	KAZ-CITYDEEP						35:10:00	2	3.97
WOR-NOORD	48915	27	CENTRAL	KOOKRUS	07:54:30	07:54:30	00:05:30			KAZ-CITYDEEP						35:10:00	2	5.11
WOR-NOORD	48915	27	CENTRAL	MEYERTON	08:04:30	08:04:30	00:10:00			KAZ-CITYDEEP						35:10:00	2	3.91
WOR-NOORD	48915	28	CENTRAL	HENLYONKLIP	08:09:30	08:09:30	00:05:00			KAZ-CITYDEEP						35:10:00	2	4.46
WOR-NOORD	48915	29	CENTRAL	DALESIDE	08:20:30	08:20:30	00:11:00			KAZ-CITYDEEP						35:10:00	2	4.91
WOR-NOORD	48915	30	CONTAINER	SKANSDAM	08:23:30	08:23:30	00:03:00			KAZ-CITYDEEP						35:10:00	2	2.62
WOR-NOORD	48915	30	CENTRAL	SYBRAND	08:28:30	08:28:30	00:05:00			KAZ-CITYDEEP						35:10:00	2	2.58
WOR-NOORD	48915	31	CONTAINER	KLIPRIVIER	08:34:00	08:55:00	00:05:30	00:21:00	F18601	KAZ-CITYDEEP						35:10:00	2	2.58
WOR-NOORD	48915	32	CONTAINER	RANDWATER	09:01:00	09:01:00	00:06:00			KAZ-CITYDEEP						35:10:00	2	4.91
WOR-NOORD	48915	33	CONTAINER	ANGUS	09:03:00	09:03:00	00:02:00			KAZ-CITYDEEP						35:10:00	2	4.51
WOR-NOORD	48915	33	CONTAINER	MPILISWENI	09:11:00	09:11:00	00:08:00			KAZ-CITYDEEP						35:10:00	2	3.75
WOR-NOORD	48915	33	CONTAINER	NATALSPRUIT	09:15:30	09:15:30	00:04:30			KAZ-CITYDEEP						35:10:00	2	1.68
WOR-NOORD	48915	34	CONTAINER	UNION	09:18:00	09:18:00	00:02:30			KAZ-CITYDEEP						35:10:00	2	4.42
WOR-NOORD	48915	35	CONTAINER	WATTLES	09:20:00	09:20:00	00:02:00			KAZ-CITYDEEP						35:10:00	2	1.81
WOR-NOORD	48915	35	CONTAINER	DALLAS	09:22:00	09:22:00	00:02:00			KAZ-CITYDEEP						35:10:00	2	1.53
WOR-NOORD	48915	36	CONTAINER	ELSBURG	09:23:00	09:23:00	00:01:00			KAZ-CITYDEEP						35:10:00	2	0.9
WOR-NOORD	48915	37	CONTAINER	PARKHILL	09:24:00	09:24:00	00:01:00			KAZ-CITYDEEP						35:10:00	2	0.7
WOR-NOORD	48915	37	CONTAINER	WEBBER	09:29:00	09:29:00	00:05:00			KAZ-CITYDEEP						35:10:00	2	1.12
WOR-NOORD	48915	37	CONTAINER	GERMISTONLAKE	09:32:00	09:32:00	00:03:00			KAZ-CITYDEEP						35:10:00	2	0.88
WOR-NOORD	48915	37	CONTAINER	GERMISTONSOUT	09:37:00	09:37:00	00:05:00			KAZ-CITYDEEP						35:10:00	2	0.61
WOR-NOORD	48915	38	CONTAINER	GERMISTONWEST	09:38:00	09:38:00	00:01:00			KAZ-CITYDEEP						35:10:00	2	0.59
WOR-NOORD	48915	38	CONTAINER	INDIA	09:39:00	09:39:00	00:01:00			KAZ-CITYDEEP						35:10:00	2	0.4
WOR-NOORD	48915	39	CONTAINER	REFINERY	09:40:00	09:40:00	00:01:00			KAZ-CITYDEEP						35:10:00	2	1.25
WOR-NOORD	48915	40	CONTAINER	JUPITER	09:43:00	09:43:00	00:03:00			KAZ-CITYDEEP						35:10:00	2	3.54
WOR-NOORD	48915	41	CONTAINER	KAZ-CITYDEEP	09:55:00	00:00:00	00:12:00		RT	KAZ-CITYDEEP						35:10:00	2	2.5
WORCESTER	3510	1	CAPE	WORCESTER		04:40:00				KAAPSTADPAS	04:40:00	08:25:00	1	NYYYYYN	METRO TRAIN/METRORAIL-CWN	03:45:00	0	
WORCESTER	3510	1	CAPE	CHAVONNES	04:48:00	04:48:00	00:08:00		C	KAAPSTADPAS						03:45:00	0	6.7
WORCESTER	3510	1	CAPE	GOUDINIWEG	04:52:00	04:53:00	00:04:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	5.96
WORCESTER	3510	2	CAPE	BOTHA	04:58:00	04:59:00	00:05:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	7.2
WORCESTER	3510	2	CAPE	BREERIVIER	05:04:00	05:05:00	00:05:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	6.62
WORCESTER	3510	2	CAPE	ROMANSRIVIER	05:09:00	05:10:00	00:04:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	5.66
WORCESTER	3510	2	CAPE	LAPLAISANTE	05:13:00	05:13:00	00:03:00			KAAPSTADPAS						03:45:00	0	2.02
WORCESTER	3510	2	CAPE	WOLSELEY	05:17:00	05:18:00	00:04:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	5.05
WORCESTER	3510	3	CAPE	ARTOIS	05:25:00	05:26:00	00:07:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	5.95
WORCESTER	3510	3	CAPE	TULBAGHWEG	05:36:00	05:37:00	00:10:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	8.92
WORCESTER	3510	3	CAPE	GOUDA	05:45:00	05:45:00	00:08:00			KAAPSTADPAS						03:45:00	0	7.26
WORCESTER	3510	4	CAPE	VOELVLEI	05:51:00	05:52:00	00:06:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	7.48
WORCESTER	3510	4	CAPE	HERMON	05:59:00	06:00:00	00:07:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	7.62
WORCESTER	3510	5	CAPE	SOETENDAL	06:06:00	06:08:00	00:06:00	00:02:00	PASS	KAAPSTADPAS						03:45:00	0	10.57
WORCESTER	3510	6	CAPE	MALAN	06:14:00	06:15:00	00:06:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	1.33
WORCESTER	3510	6	CAPE	WELLINGTON	06:24:00	06:25:00	00:09:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	13.71
WORCESTER	3510	7	CAPE	MBEKWENI	06:30:00	06:30:00	00:05:00			KAAPSTADPAS						03:45:00	0	4.53
WORCESTER	3510	7	CAPE	DALJOSAFAT	06:40:00	06:40:00	00:10:00			KAAPSTADPAS						03:45:00	0	3.58
WORCESTER	3510	8	CAPE	HUGUENOT	06:45:00	06:47:00	00:05:00	00:02:00	PASS	KAAPSTADPAS						03:45:00	0	2.52
WORCESTER	3510	9	CAPE	PAARL	06:53:00	06:53:00	00:06:00			KAAPSTADPAS						03:45:00	0	4.24
WORCESTER	3510	10	CAPE	KLAPMUTS	07:03:00	07:03:00	00:10:00			KAAPSTADPAS						03:45:00	0	10.68
WORCESTER	3510	10	CAPE	MULDERSVLEI	07:10:00	07:10:00	00:07:00			KAAPSTADPAS						03:45:00	0	5.79
WORCESTER	3510	11	CAPE	KRAAIFONTEIN	07:20:00	07:22:00	00:10:00	00:02:00	PASS	KAAPSTADPAS						03:45:00	0	10.21
WORCESTER	3510	12	CAPE	EIKENFONTEIN	07:27:00	07:27:00	00:05:00			KAAPSTADPAS						03:45:00	0	1.66
WORCESTER	3510	12	CAPE	BRACKENFELL	07:34:00	07:34:00	00:07:00			KAAPSTADPAS						03:45:00	0	3.37
WORCESTER	3510	13	CAPE	STIKLAND	07:39:00	07:39:00	00:05:00			KAAPSTADPAS						03:45:00	0	3.85
WORCESTER	3510	14	CAPE	BELLVILLE	07:47:00	07:48:00	00:08:00	00:01:00	PASS	KAAPSTADPAS						03:45:00	0	2.79
WORCESTER	3510	15	CAPE	OOSTERZEE	07:51:30	07:51:30	00:03:30			KAAPSTADPAS						03:45:00	0	0.79
WORCESTER	3510	16	CAPE	AVONDALE	07:54:00	07:54:00	00:02:30			KAAPSTADPAS						03:45:00	0	1.32
WORCESTER	3510	16	CAPE	DEGRENDEL	07:56:30	07:56:30	00:02:30			KAAPSTADPAS						03:45:00	0	1.42
WORCESTER	3510	16	CAPE	MONTEVISTA	08:00:00	08:02:00	00:03:30	00:02:00	PASS	KAAPSTADPAS						03:45:00	0	2.87
WORCESTER	3510	16	CAPE	AKASIAPARK	08:05:00	08:07:00	00:03:00	00:02:00	PASS	KAAPSTADPAS						03:45:00	0	1.26
WORCESTER	3510	17	CAPE	WINDERMERE	08:09:00	08:09:00	00:02:00			KAAPSTADPAS						03:45:00	0	1.04
WORCESTER	3510	18	CAPE	KENTEMADE	08:09:30	08:09:30	00:00:30			KAAPSTADPAS						03:45:00	0	2.64
WORCESTER	3510	18	CAPE	KENSINGTON	08:11:00	08:11:00	00:01:30			KAAPSTADPAS						03:45:00	0	0.83
WORCESTER	3510	19	CAPE	YSTERPLAAT	08:13:00	08:15:00	00:02:00	00:02:00	PASS	KAAPSTADPAS						03:45:00	0	1.25
WORCESTER	3510	20	CAPE	PAARDENEILAND	08:17:00	08:17:00	00:02:00			KAAPSTADPAS						03:45:00	0	0.96
WORCESTER	3510	21	CAPE	BAYJUNCTION	08:18:00	08:18:00	00:01:00			KAAPSTADPAS						03:45:00	0	0.85
WORCESTER	3510	22	CAPE	ESPLANADE	08:20:00	08:20:00	00:02:00			KAAPSTADPAS						03:45:00	0	1.11
WORCESTER	3510	22	CAPE	KAAPSTADPAS	08:25:00	00:00:00	00:05:00		RT	KAAPSTADPAS						03:45:00	0	2.41
WINDSORTONROA	2138	1	CAPE	WINDSORTONROA		15:40:00				BEACONSFIELD	15:40:00	17:16:00	3	NYYYYYN	VACUUM TRAINS/VACUUM TRAIN	01:36:00	0	
WINDSORTONROA	2138	1	CAPE	WOW/S242144	15:41:00	15:42:00	00:01:00	00:01:00	B SHUNT	BEACONSFIELD						01:36:00	0	0.97
WINDSORTONROA	2138	2	CAPE	WINDSORTONROA	15:43:00	15:44:00	00:01:00	00:01:00	SHUNT	BEACONSFIELD						01:36:00	0	0.97
WINDSORTONROA	2138	3	CAPE	SLYPKLIP	15:53:00	15:53:00	00:09:00			BEACONSFIELD						01:36:00	0	9.4
WINDSORTONROA	2138	3	CAPE	RIVERTON	16:03:00	16:23:00	00:10:00	00:20:00	SHUNT	BEACONSFIELD						01:36:00	0	7.92
WINDSORTONROA	2138	4	CAPE	RVT/S243671	16:25:00	16:27:00	00:02:00	00:02:00	SHUNT	BEACONSFIELD						01:36:00	0	0.97
WINDSORTONROA	2138	5	CAPE	RIVERTON	16:29:00	16:31:00	00:02:00	00:02:00	SHUNT	BEACONSFIELD						01:36:00	0	0.97
WINDSORTONROA	2138	6	CAPE	MACFARLANE	16:39:00	16:39:00	00:08:00			BEACONSFIELD						01:36:00	0	6.12
WINDSORTONROA	2138	7	CAPE	DRONFIELD	16:48:00	16:48:00	00:09:00			BEACONSFIELD						01:36:00	0	8
WINDSORTONROA	2138	7	CAPE	KAMFERSDAM	16:56:00	16:56:00	00:08:00			BEACONSFIELD						01:36:00	0	7.08
WINDSORTONROA	2138	8	CAPE	BEACONSFIELD	17:16:00	00:00:00	00:20:00		RT	BEACONSFIELD						01:36:00	0	9.18
BELA BELA	2206	1	NORTHEAST	BELA BELA		15:10:00				PYRAMIDSUID	15:10:00	16:47:00	2	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	01:37:00	0	
BELA BELA	2206	1	NORTHEAST	WILLEM	15:17:00	15:17:00	00:07:00		B	PYRAMIDSUID						01:37:00	0	7.41
BELA BELA	2206	1	NORTHEAST	CODRINGTON	15:28:00	15:28:00	00:11:00			PYRAMIDSUID						01:37:00	0	11.08
BELA BELA	2206	1	NORTHEAST	RADIUM	15:33:00	15:33:00	00:05:00			PYRAMIDSUID						01:37:00	0	4.29
BELA BELA	2206	1	NORTHEAST	TOKOMANE	15:36:00	15:36:00	00:03:00			PYRAMIDSUID						01:37:00	0	3.31
BELA BELA	2206	1	NORTHEAST	PIENAARSRIVIE	15:47:00	15:47:00	00:11:00			PYRAMIDSUID						01:37:00	0	9.67
BELA BELA	2206	2	NORTH	BOSPLAAS	15:59:00	15:59:00	00:12:00			PYRAMIDSUID						01:37:00	0	12.21
BELA BELA	2206	2	NORTH	KEKANA	16:04:00	16:04:00	00:05:00			PYRAMIDSUID						01:37:00	0	4.79
BELA BELA	2206	2	NORTH	BABALEGI	16:06:00	16:06:00	00:02:00			PYRAMIDSUID						01:37:00	0	2.16
BELA BELA	2206	2	NORTH	HAMMANSKRAAL	16:09:00	16:09:00	00:03:00			PYRAMIDSUID						01:37:00	0	3.27
BELA BELA	2206	3	NORTH	SPYKERRAS	16:16:00	16:16:00	00:07:00			PYRAMIDSUID						01:37:00	0	6.16
BELA BELA	2206	3	NORTH	PETRONELLA	16:22:00	16:22:00	00:06:00			PYRAMIDSUID						01:37:00	0	5.58
BELA BELA	2206	3	CENTRAL	VASFONTEIN	16:27:00	16:27:00	00:05:00			PYRAMIDSUID						01:37:00	0	3.85
BELA BELA	2206	3	NORTH	PYRAMID	16:33:00	16:33:00	00:06:00			PYRAMIDSUID						01:37:00	0	5.51
BELA BELA	2206	4	NORTH	PYRAMIDSUID	16:47:00	00:00:00	00:14:00		RT	PYRAMIDSUID						01:37:00	0	5
BELA BELA	3001	1	NORTHEAST	BELA BELA		09:40:00				NABOOMSPRUIT	09:40:00	12:58:00	3	NYYYYYY	VACUUM TRAINS/PICKUP TRAIN	03:18:00	0	
BELA BELA	3001	1	NORTHEAST	WSR/S846449	09:41:00	09:41:00	00:01:00			NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	1	NORTHEAST	WSR/S846465	09:42:00	09:47:00	00:01:00	00:05:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	1	NORTHEAST	WSR/S846481	09:48:00	09:48:00	00:01:00			NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	1	NORTHEAST	WSR/S846546	09:49:00	09:54:00	00:01:00	00:05:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	1	NORTHEAST	WSR/S846562	09:55:00	10:00:00	00:01:00	00:05:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	2	NORTHEAST	WSR/S846546	10:01:00	10:06:00	00:01:00	00:05:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	2	NORTHEAST	WSR/S846481	10:07:00	10:07:00	00:01:00			NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	2	NORTHEAST	WSR/S846465	10:08:00	10:13:00	00:01:00	00:05:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	2	NORTHEAST	WSR/S846449	10:14:00	10:14:00	00:01:00			NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	2	NORTHEAST	BELA BELA	10:20:00	10:25:00	00:06:00	00:05:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	3	NORTH	KLEINKARIBA	10:34:00	10:34:00	00:09:00			NABOOMSPRUIT						03:18:00	0	8.07
BELA BELA	3001	3	NORTHEAST	EERSBEWOOND	10:38:00	10:38:00	00:04:00			NABOOMSPRUIT						03:18:00	0	3.18
BELA BELA	3001	3	NORTHEAST	JANTINGH	10:43:00	10:43:00	00:05:00			NABOOMSPRUIT						03:18:00	0	4.41
BELA BELA	3001	3	NORTHEAST	KEESPOORT	10:53:00	11:05:00	00:10:00	00:12:00	X 2082	NABOOMSPRUIT						03:18:00	0	7.11
BELA BELA	3001	3	NORTHEAST	MODIMOLLE	11:14:00	11:18:00	00:09:00	00:04:00	SHUNT	NABOOMSPRUIT						03:18:00	0	4.83
BELA BELA	3001	4	NORTHEAST	NSR/S843229	11:19:00	11:23:00	00:01:00	00:04:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	4	NORTHEAST	NSR/S843245	11:24:00	11:28:00	00:01:00	00:04:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	4	NORTHEAST	NSR/S843261	11:29:00	11:33:00	00:01:00	00:04:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	4	NORTHEAST	NSR/S843296	11:34:00	11:38:00	00:01:00	00:04:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	4	NORTHEAST	NSR/S843318	11:39:00	11:43:00	00:01:00	00:04:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	5	NORTHEAST	NSR/S843296	11:44:00	11:48:00	00:01:00	00:04:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	5	NORTHEAST	NSR/S843261	11:49:00	11:53:00	00:01:00	00:04:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	5	NORTHEAST	NSR/S843245	11:54:00	11:58:00	00:01:00	00:04:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	5	NORTHEAST	NSR/S843229	11:59:00	12:03:00	00:01:00	00:04:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	5	NORTHEAST	MODIMOLLE	12:05:00	12:09:00	00:02:00	00:04:00	SHUNT	NABOOMSPRUIT						03:18:00	0	0.97
BELA BELA	3001	6	NORTHEAST	JASPER	12:16:00	12:16:00	00:07:00			NABOOMSPRUIT						03:18:00	0	7.49
BELA BELA	3001	6	NORTHEAST	MIDDELFONTEIN	12:25:00	12:25:00	00:09:00			NABOOMSPRUIT						03:18:00	0	6.88
BELA BELA	3001	6	NORTHEAST	GROENVALLEI	12:31:00	12:31:00	00:06:00			NABOOMSPRUIT						03:18:00	0	4.91
BELA BELA	3001	6	NORTHEAST	BOEKENHOUT	12:40:00	12:40:00	00:09:00			NABOOMSPRUIT						03:18:00	0	7.15
BELA BELA	3001	6	NORTHEAST	YPRES	12:49:00	12:49:00	00:09:00			NABOOMSPRUIT						03:18:00	0	7.75
BELA BELA	3001	6	NORTHEAST	NABOOMSPRUIT	12:58:00	00:00:00	00:09:00			NABOOMSPRUIT						03:18:00	0	6.49
BELA BELA	48923	1	NORTHEAST	BELA BELA		19:59:00				KINGSREST	19:59:00	06:41:00	1	YYAYAYY	MEDIUM HEAVY/CONTAINER MH	34:42:00	0	
BELA BELA	48923	1	NORTHEAST	WILLEM	20:05:00	20:05:00	00:06:00			KINGSREST						34:42:00	0	7.41
BELA BELA	48923	1	NORTHEAST	CODRINGTON	20:30:00	20:30:00	00:25:00			KINGSREST						34:42:00	0	11.08
BELA BELA	48923	1	NORTHEAST	RADIUM	20:35:00	20:35:00	00:05:00			KINGSREST						34:42:00	0	4.29
BELA BELA	48923	1	NORTHEAST	TOKOMANE	20:39:00	20:39:00	00:04:00			KINGSREST						34:42:00	0	3.31
BELA BELA	48923	1	NORTHEAST	PIENAARSRIVIE	20:51:00	20:51:00	00:12:00			KINGSREST						34:42:00	0	9.67
BELA BELA	48923	2	NORTH	BOSPLAAS	21:04:00	21:04:00	00:13:00			KINGSREST						34:42:00	0	12.21
BELA BELA	48923	2	NORTH	KEKANA	21:09:00	21:09:00	00:05:00			KINGSREST						34:42:00	0	4.79
BELA BELA	48923	2	NORTH	BABALEGI	21:11:00	21:11:00	00:02:00			KINGSREST						34:42:00	0	2.16
BELA BELA	48923	2	NORTH	HAMMANSKRAAL	21:14:00	21:14:00	00:03:00			KINGSREST						34:42:00	0	3.27
BELA BELA	48923	3	NORTH	SPYKERRAS	21:22:00	21:22:00	00:08:00			KINGSREST						34:42:00	0	6.16
BELA BELA	48923	3	NORTH	PETRONELLA	21:28:00	21:28:00	00:06:00			KINGSREST						34:42:00	0	5.58
BELA BELA	48923	3	CENTRAL	VASFONTEIN	21:33:00	21:33:00	00:05:00			KINGSREST						34:42:00	0	3.85
BELA BELA	48923	3	NORTH	PYRAMID	21:39:00	21:39:00	00:06:00			KINGSREST						34:42:00	0	5.51
BELA BELA	48923	4	NORTH	PYRAMIDSUID	21:52:00	23:30:00	00:13:00	01:38:00		KINGSREST						34:42:00	0	5
BELA BELA	48923	5	NORTH	KAMEELDRIF	23:39:00	23:39:00	00:09:00			KINGSREST						34:42:00	0	6.67
BELA BELA	48923	5	NORTH	BAVIAANSPOORT	23:48:00	23:48:00	00:09:00			KINGSREST						34:42:00	0	5.36
BELA BELA	48923	5	NORTH	LEEUFONTEIN	23:56:00	23:56:00	00:08:00			KINGSREST						34:42:00	0	8.96
BELA BELA	48923	6	CENTRAL	LUD(STQLYN)	00:03:00	00:03:00	00:07:00			KINGSREST						34:42:00	1	5.5
BELA BELA	48923	7	CENTRAL	DONKERHOEK	00:12:00	00:12:00	00:09:00			KINGSREST						34:42:00	1	4.95
BELA BELA	48923	7	CENTRAL	TWEEDRAG	00:22:00	00:22:00	00:10:00			KINGSREST						34:42:00	1	8.76
BELA BELA	48923	7	CENTRAL	KLEINSONDERHOUT	00:31:00	00:31:00	00:09:00			KINGSREST						34:42:00	1	5.5
BELA BELA	48923	7	CENTRAL	ROODEKNOPPIES	00:40:00	00:40:00	00:09:00			KINGSREST						34:42:00	1	6.91
BELA BELA	48923	7	CENTRAL	KNOPPIESFONTE	00:52:00	00:52:00	00:12:00			KINGSREST						34:42:00	1	12.66
BELA BELA	48923	7	CENTRAL	YSTERVARKFONT	01:08:00	01:08:00	00:16:00			KINGSREST						34:42:00	1	3.43
BELA BELA	48923	8	CENTRAL	STQ-KATBOSFONTEIN	01:20:00	01:20:00	00:12:00			KINGSREST						34:42:00	1	7.62
BELA BELA	48923	9	CENTRAL	ZESFONTEIN	01:33:00	01:33:00	00:13:00			KINGSREST						34:42:00	1	6.05
BELA BELA	48923	10	CENTRAL	COWLESDAM	01:51:00	01:51:00	00:18:00			KINGSREST						34:42:00	1	9.59
BELA BELA	48923	11	CENTRAL	AURUM	02:03:00	02:03:00	00:12:00			KINGSREST						34:42:00	1	10.38
BELA BELA	48923	12	CENTRAL	WITHOK	02:21:00	02:21:00	00:18:00			KINGSREST						34:42:00	1	7
BELA BELA	48923	13	CENTRAL	VLAKFONTEIN	02:31:00	02:31:00	00:10:00			KINGSREST						34:42:00	1	11.74
BELA BELA	48923	13	CENTRAL	ROOIVLEI	02:41:00	02:41:00	00:10:00			KINGSREST						34:42:00	1	2.89
BELA BELA	48923	14	CONTAINER	RIETVALLEI	02:51:00	02:51:00	00:10:00			KINGSREST						34:42:00	1	3.14
BELA BELA	48923	15	CONTAINER	GLENROY	02:59:00	02:59:00	00:08:00			KINGSREST						34:42:00	1	4.23
BELA BELA	48923	16	CONTAINER	DRIEMANSKAP	03:10:00	03:40:00	00:11:00	00:30:00	REMAN	KINGSREST						34:42:00	1	5.24
BELA BELA	48923	17	CONTAINER	KAYDALE	03:46:00	03:46:00	00:06:00			KINGSREST						34:42:00	1	7.92
BELA BELA	48923	18	CONTAINER	KLIPPOORTJIE	03:51:00	03:51:00	00:05:00			KINGSREST						34:42:00	1	3.27
BELA BELA	48923	18	CONTAINER	HEIDELBERGT	04:02:00	04:02:00	00:11:00			KINGSREST						34:42:00	1	2.54
BELA BELA	48923	19	CONTAINER	KRAAL	04:15:00	04:15:00	00:13:00			KINGSREST						34:42:00	1	8
BELA BELA	48923	19	CONTAINER	SPRUYTSRUS	04:29:00	04:29:00	00:14:00			KINGSREST						34:42:00	1	8.31
BELA BELA	48923	19	CONTAINER	FORTUNA	04:43:00	04:43:00	00:14:00			KINGSREST						34:42:00	1	6.76
BELA BELA	48923	19	CONTAINER	BALFOURNORTH	04:56:00	04:56:00	00:13:00			KINGSREST						34:42:00	1	7.83
BELA BELA	48923	20	CONTAINER	SPRUCEWELL	04:58:00	04:58:00	00:02:00			KINGSREST						34:42:00	1	9.38
BELA BELA	48923	20	CONTAINER	GREYLINGSTAD	05:07:00	05:07:00	00:09:00			KINGSREST						34:42:00	1	9.91
BELA BELA	48923	21	CONTAINER	TEAKWORTH	05:15:00	05:15:00	00:08:00			KINGSREST						34:42:00	1	9.09
BELA BELA	48923	21	CONTAINER	BEYTELPLAATS	05:23:00	05:23:00	00:08:00			KINGSREST						34:42:00	1	11.8
BELA BELA	48923	21	CONTAINER	VAL	05:34:00	05:34:00	00:11:00			KINGSREST						34:42:00	1	7.5
BELA BELA	48923	22	CONTAINER	CEDARMONT	05:46:00	05:46:00	00:12:00			KINGSREST						34:42:00	1	7.5
BELA BELA	48923	22	CONTAINER	HOLMDENE	05:59:00	05:59:00	00:13:00			KINGSREST						34:42:00	1	7.45
BELA BELA	48923	23	CONTAINER	ELMTREE	06:14:00	06:14:00	00:15:00			KINGSREST						34:42:00	1	9.53
BELA BELA	48923	23	CONTAINER	STANDERTON	06:36:00	06:36:00	00:22:00			KINGSREST						34:42:00	1	11.63
BELA BELA	48923	24	CONTAINER	FIRHAM	06:46:00	06:46:00	00:10:00			KINGSREST						34:42:00	1	5.48
BELA BELA	48923	25	CONTAINER	KROMDRAAI	06:58:00	06:58:00	00:12:00			KINGSREST						34:42:00	1	10.56
BELA BELA	48923	25	CONTAINER	KANONHEUWEL	07:09:00	07:09:00	00:11:00			KINGSREST						34:42:00	1	5.94
BELA BELA	48923	25	CONTAINER	PLATRAND	07:18:00	07:18:00	00:09:00			KINGSREST						34:42:00	1	7.15
BELA BELA	48923	26	CONTAINER	RUSTHOF	07:28:00	07:28:00	00:10:00			KINGSREST						34:42:00	1	8.18
BELA BELA	48923	26	CONTAINER	KOPPIEALLEEN	07:35:00	07:35:00	00:07:00			KINGSREST						34:42:00	1	5.25
BELA BELA	48923	26	CONTAINER	PERDEKOP	07:47:00	07:47:00	00:12:00			KINGSREST						34:42:00	1	4.54
BELA BELA	48923	27	CONTAINER	ELANDSPOORT	07:56:00	07:56:00	00:09:00			KINGSREST						34:42:00	1	5
BELA BELA	48923	27	CONTAINER	PALMFORD	08:05:00	08:05:00	00:09:00			KINGSREST						34:42:00	1	3.43
BELA BELA	48923	28	CONTAINER	BEECHWICK	08:13:00	08:13:00	00:08:00			KINGSREST						34:42:00	1	5.66
BELA BELA	48923	28	CONTAINER	SANDSPRUIT	08:28:00	08:28:00	00:15:00			KINGSREST						34:42:00	1	8.19
BELA BELA	48923	28	CONTAINER	VOORUITSIG	08:54:00	08:54:00	00:26:00			KINGSREST						34:42:00	1	8.66
BELA BELA	48923	29	CONTAINER	CLAVIS	09:04:00	09:04:00	00:10:00			KINGSREST						34:42:00	1	11.61
BELA BELA	48923	30	CONTAINER	LANGSNEK	09:15:00	09:15:00	00:11:00			KINGSREST						34:42:00	1	3.45
BELA BELA	48923	30	CONTAINER	MOUNTPROSPECT	09:27:00	09:27:00	00:12:00			KINGSREST						34:42:00	1	7.76
BELA BELA	48923	30	CONTAINER	INGOGO	09:50:00	09:50:00	00:23:00			KINGSREST						34:42:00	1	15.72
BELA BELA	48923	31	CONTAINER	CLONTARF	10:03:00	10:03:00	00:13:00			KINGSREST						34:42:00	1	8.66
BELA BELA	48923	31	NORTH	WYKOM	10:12:00	10:12:00	00:09:00			KINGSREST						34:42:00	1	4.25
BELA BELA	48923	32	CONTAINER	SIGNALHILL	10:23:00	10:23:00	00:11:00			KINGSREST						34:42:00	1	4.71
BELA BELA	48923	33	CONTAINER	NCS-STASIE	10:35:00	10:35:00	00:12:00			KINGSREST						34:42:00	1	4.53
BELA BELA	48923	34	CONTAINER	NEWCASTLE	10:43:00	11:13:00	00:08:00	00:30:00	BO	KINGSREST						34:42:00	1	1.46
BELA BELA	48923	1	CONTAINER	NGAGANE	11:25:00	11:25:00	00:12:00			KINGSREST						34:42:00	1	14
BELA BELA	48923	2	NORTH	BALLENGEICH	11:53:00	11:53:00	00:28:00			KINGSREST						34:42:00	1	2.91
BELA BELA	48923	3	CONTAINER	DANNHAUSER	12:29:00	12:29:00	00:36:00			KINGSREST						34:42:00	1	18.42
BELA BELA	48923	4	CONTAINER	HATTINGSPRUIT	12:46:00	12:46:00	00:17:00			KINGSREST						34:42:00	1	10.17
BELA BELA	48923	5	NORTH	GLENCOE	13:25:00	13:25:00	00:39:00			KINGSREST						34:42:00	1	13
BELA BELA	48923	6	CONTAINER	UITHOEK	13:57:00	13:57:00	00:32:00			KINGSREST						34:42:00	1	10.68
BELA BELA	48923	6	CONTAINER	WASBANK	14:09:00	14:09:00	00:12:00			KINGSREST						34:42:00	1	8.56
BELA BELA	48923	6	CONTAINER	WESSELSNEK	14:23:00	14:23:00	00:14:00			KINGSREST						34:42:00	1	7.5
BELA BELA	48923	6	CONTAINER	ELANDSLAAGTE	14:47:00	14:47:00	00:24:00			KINGSREST						34:42:00	1	12.67
BELA BELA	48923	7	CONTAINER	PEPWORTH	15:35:00	15:35:00	00:48:00			KINGSREST						34:42:00	1	10.41
BELA BELA	48923	7	CONTAINER	DANSKRAAL	16:07:00	16:37:00	00:32:00	00:30:00		KINGSREST						34:42:00	1	12.57
BELA BELA	48923	8	CONTAINER	DSL-LADYSMITH(N)	16:42:00	16:42:00	00:05:00			KINGSREST						34:42:00	1	1.63
BELA BELA	48923	9	CONTAINER	UMBULWANA	17:39:00	17:39:00	00:57:00			KINGSREST						34:42:00	1	7.05
BELA BELA	48923	9	CONTAINER	PIETERS	17:49:00	17:49:00	00:10:00			KINGSREST						34:42:00	1	6.67
BELA BELA	48923	10	CONTAINER	COLENSO	18:18:00	18:18:00	00:29:00			KINGSREST						34:42:00	1	9.88
BELA BELA	48923	10	CONTAINER	CHIEVELEY	18:39:00	18:39:00	00:21:00			KINGSREST						34:42:00	1	10.98
BELA BELA	48923	10	CONTAINER	FRERE	18:55:00	18:55:00	00:16:00			KINGSREST						34:42:00	1	8.47
BELA BELA	48923	10	CONTAINER	ENNERSDALE	19:25:00	19:25:00	00:30:00			KINGSREST						34:42:00	1	11.19
BELA BELA	48923	11	CONTAINER	ESTCOURT	19:43:00	19:43:00	00:18:00			KINGSREST						34:42:00	1	10.17
BELA BELA	48923	12	CONTAINER	BEACONHILL	20:05:00	20:05:00	00:22:00			KINGSREST						34:42:00	1	10.32
BELA BELA	48923	12	CONTAINER	LOWLANDS	20:23:00	20:23:00	00:18:00			KINGSREST						34:42:00	1	5.79
BELA BELA	48923	12	CONTAINER	HIDCOTE	20:40:00	20:40:00	00:17:00			KINGSREST						34:42:00	1	9.5
BELA BELA	48923	12	CONTAINER	MOOIRIVIER	20:58:00	21:28:00	00:18:00	00:30:00	REMAN	KINGSREST						34:42:00	1	6.71
BELA BELA	48923	13	CONTAINER	ROSETTA	21:55:00	21:55:00	00:27:00			KINGSREST						34:42:00	1	10.94
BELA BELA	48923	13	CONTAINER	NOTTINGHAMROA	22:11:00	22:11:00	00:16:00			KINGSREST						34:42:00	1	6.36
BELA BELA	48923	14	CONTAINER	BALGOWAN	22:38:00	22:38:00	00:27:00			KINGSREST						34:42:00	1	11.35
BELA BELA	48923	15	CONTAINER	LIDGETTON	22:49:00	22:49:00	00:11:00			KINGSREST						34:42:00	1	7.83
BELA BELA	48923	16	CONTAINER	DARGLE	22:59:00	22:59:00	00:10:00			KINGSREST						34:42:00	1	3.87
BELA BELA	48923	17	CONTAINER	LIONSRIVER	23:07:00	23:07:00	00:08:00			KINGSREST						34:42:00	1	6.15
BELA BELA	48923	17	CONTAINER	TWEEDIE	23:16:00	23:16:00	00:09:00			KINGSREST						34:42:00	1	4.5
BELA BELA	48923	17	CONTAINER	MERRIVALE	23:30:00	23:30:00	00:14:00			KINGSREST						34:42:00	1	7.71
BELA BELA	48923	18	CONTAINER	CEDARA(N)	23:41:00	23:41:00	00:11:00			KINGSREST						34:42:00	1	3.7
BELA BELA	48923	19	CONTAINER	BOUGHTON	00:22:00	00:22:00	00:41:00			KINGSREST						34:42:00	2	13.8
BELA BELA	48923	19	CONTAINER	PIETERMARITZB	00:40:00	00:40:00	00:18:00			KINGSREST						34:42:00	2	6.49
BELA BELA	48923	20	CONTAINER	NAPIER (N)	00:55:00	00:55:00	00:15:00			KINGSREST						34:42:00	2	2.91
BELA BELA	48923	21	CONTAINER	PENTRICH	01:09:00	01:09:00	00:14:00			KINGSREST						34:42:00	2	2.35
BELA BELA	48923	22	CONTAINER	ASHBURTON	01:27:00	01:27:00	00:18:00			KINGSREST						34:42:00	2	10.11
BELA BELA	48923	22	CONTAINER	UMLAASROAD	01:57:00	01:57:00	00:30:00			KINGSREST						34:42:00	2	10.56
BELA BELA	48923	23	CONTAINER	CAMPERDOWN	02:05:00	02:05:00	00:08:00			KINGSREST						34:42:00	2	3.77
BELA BELA	48923	23	CONTAINER	CATORIDGE	02:18:00	02:48:00	00:13:00	00:30:00	REMAN	KINGSREST						34:42:00	2	4.95
BELA BELA	48923	24	CONTAINER	GEORGEDALE	03:08:00	03:08:00	00:20:00			KINGSREST						34:42:00	2	7.24
BELA BELA	48923	24	CONTAINER	KWATANDAZA	03:13:00	03:13:00	00:05:00			KINGSREST						34:42:00	2	2.18
BELA BELA	48923	24	CONTAINER	HAMMARSDALE	03:20:00	03:20:00	00:07:00			KINGSREST						34:42:00	2	4.08
BELA BELA	48923	25	CONTAINER	CLIFFDALE	03:34:00	03:34:00	00:14:00			KINGSREST						34:42:00	2	6
BELA BELA	48923	26	CONTAINER	NSHONGWENI	04:13:00	04:13:00	00:39:00			KINGSREST						34:42:00	2	6.08
BELA BELA	48923	26	CONTAINER	DELVILLEWOOD	04:18:00	04:18:00	00:05:00			KINGSREST						34:42:00	2	0.93
BELA BELA	48923	26	CONTAINER	KWANDENGEZI	04:26:00	04:26:00	00:08:00			KINGSREST						34:42:00	2	7.12
BELA BELA	48923	26	CONTAINER	DASSENHOEK	04:30:00	04:30:00	00:04:00			KINGSREST						34:42:00	2	2.29
BELA BELA	48923	26	CONTAINER	SITUNDUHILLS	04:33:00	04:33:00	00:03:00			KINGSREST						34:42:00	2	1.12
BELA BELA	48923	26	CONTAINER	THORNWOOD	04:48:00	04:48:00	00:15:00			KINGSREST						34:42:00	2	3.41
BELA BELA	48923	26	CONTAINER	MARIANNHILL	04:52:00	04:52:00	00:04:00			KINGSREST						34:42:00	2	3.06
BELA BELA	48923	26	CONTAINER	KLAARWATER	05:02:00	05:02:00	00:10:00			KINGSREST						34:42:00	2	3.66
BELA BELA	48923	26	CONTAINER	SHALLCROSS	05:17:00	05:17:00	00:15:00			KINGSREST						34:42:00	2	3.62
BELA BELA	48923	26	CONTAINER	BURLINGTON	05:31:00	05:31:00	00:14:00			KINGSREST						34:42:00	2	3.12
BELA BELA	48923	26	CONTAINER	CAVENDISH	05:46:00	05:46:00	00:15:00			KINGSREST						34:42:00	2	2.47
BELA BELA	48923	26	CONTAINER	MOUNTVERNON	05:59:00	05:59:00	00:13:00			KINGSREST						34:42:00	2	3.12
BELA BELA	48923	27	CONTAINER	BOOTH	06:14:00	06:14:00	00:15:00			KINGSREST						34:42:00	2	1.88
BELA BELA	48923	28	CONTAINER	CLAIRWOOD	06:19:00	06:19:00	00:05:00			KINGSREST						34:42:00	2	1.73
BELA BELA	48923	29	CONTAINER	JACOBS	06:24:00	06:24:00	00:05:00			KINGSREST						34:42:00	2	1.94
BELA BELA	48923	30	CONTAINER	WENTWORTHPARK	06:29:00	06:29:00	00:05:00			KINGSREST						34:42:00	2	1.25
BELA BELA	48923	31	CONTAINER	KINGSREST	06:41:00	00:00:00	00:12:00		BO	KINGSREST						34:42:00	2	2.31
`;


describe('a ninth extract: thirty-five trains, one yard, and nothing over-counted', () => {
  const all = parseRunningTimes(B9);
  const byId = (id: string) => all.find((t) => t.train === id)!;
  type Sched = ReturnType<typeof byId>;
  const running = (t: Sched) => t.rows.reduce((n, r) => n + (r.pointToPointRuntime ?? 0), 0);
  const standing = (t: Sched) => t.rows.reduce((n, r) => n + (r.standingTime ?? 0), 0);
  const stations = (t: Sched) => t.rows.map((r) => r.station);

  /**
   * Thirty-five trains, and all thirty-five carry a summary row and tie their
   * stated throughput. Because every one of them runs through to its
   * destination, the day offsets supply the span and the check is not a
   * modular one.
   *
   * An earlier revision of this file claimed sixty trains across 1,497 rows.
   * Twenty-five of them — the whole WESTS origin — had been reconstructed from
   * the pattern of the series rather than transcribed from supplied text, and
   * they are not evidence. They are gone, and so are the two findings that
   * rested on them (see the note above the unrecorded-travel test).
   */
  it('ties all thirty-five trains to their stated throughput', () => {
    expect(all).toHaveLength(35);
    for (const t of all) {
      expect([t.train, hasSummary(t)]).toEqual([t.train, true]);
      expect([t.train, validateSchedule(t).throughputTies]).toEqual([t.train, true]);
      expect([t.train, isComplete(t)]).toEqual([t.train, true]);
    }
  });

  /**
   * The finding. Five trains — 4704, 8910, 8924, 8928, 22024 — work the same
   * yard at WOR-NOORD and return to it. Every one of them visits the same
   * thirty-nine nodes, runs 114 minutes, stands 111, and takes 3h45.
   *
   * They are not copies of each other's rows. The yard is swept in six
   * independent blocks, and 4704 and 8928 take those blocks in a different
   * order from 8910, 8924 and 22024: the first three sweeps are rotated.
   * Total is invariant to the order, because the blocks are independent.
   *
   * A duplicate check that compares rows in file order sees two families. A
   * check that compares the node SET sees one service filed five times.
   */
  it('finds one yard worked five times over, in two orders', () => {
    const pool = ['4704', '8910', '8924', '8928', '22024'].map(byId);
    for (const t of pool) {
      expect(t.origin).toBe('WOR-NOORD');
      expect(t.destination).toBe('WOR-NOORD');
      expect(t.rows).toHaveLength(38);
      expect(running(t)).toBe(114);
      expect(standing(t)).toBe(111);
      expect(t.throughputRuntime).toBe(225);
    }

    const setOf = (t: Sched) => new Set(stations(t));
    for (const t of pool) expect(setOf(t)).toEqual(setOf(pool[0]));

    expect(new Set(pool.map((t) => JSON.stringify(stations(t)))).size).toBe(2);
    // Fifth node of the sweep — the first yard block, once the origin pair
    // is done. 4704 and 8928 take the 160725 block first; 8910, 8924 and
    // 22024 take the 161438 block first.
    expect(stations(byId('4704'))[4]).toBe('WOR/S160725');
    expect(stations(byId('8928'))[4]).toBe('WOR/S160725');
    expect(stations(byId('8910'))[4]).toBe('WON/S161438');
    expect(stations(byId('8924'))[4]).toBe('WON/S161438');
    expect(stations(byId('22024'))[4]).toBe('WON/S161438');
  });

  /**
   * 8910 and 8924 are the same train under two numbers: identical departure,
   * arrival, frequency, schedule and runtimes, node for node. 22024 works the
   * same shift at the same time and differs only in how often it runs.
   */
  it('files one shift three times at 09:40', () => {
    const [a, b, c] = ['8910', '8924', '22024'].map(byId);
    expect(a.originDeparture).toBe(b.originDeparture);
    expect(a.destinationArrival).toBe(b.destinationArrival);
    expect(a.frequency).toBe('YYYYAYY');
    expect(b.frequency).toBe('YYYYAYY');
    expect(a.trainType).toBe(b.trainType);

    expect(stations(a)).toEqual(stations(c));
    expect(c.originDeparture).toBe(a.originDeparture);
    expect(c.frequency).toBe('YAYAAAY');
  });

  /**
   * 8941 and 17635 run WOR-NOORD to BEACONSFIELD over the same 103 nodes in
   * the same order, and are 150 minutes apart: 24h15 against 21h45.
   *
   * Two of those minutes are running. The other 148 are standing.
   */
  it('runs one route twice, 150 minutes apart, and 148 of them standing', () => {
    const [x, y] = ['8941', '17635'].map(byId);
    expect(x.rows).toHaveLength(102);
    expect(stations(x)).toEqual(stations(y));

    expect(running(x)).toBe(987);
    expect(running(y)).toBe(985);
    expect(standing(x)).toBe(468);
    expect(standing(y)).toBe(320);
    expect(x.throughputRuntime).toBe(1455);
    expect(y.throughputRuntime).toBe(1305);
    expect(x.throughputRuntime - y.throughputRuntime).toBe(150);
    expect(standing(x) - standing(y)).toBe(148);
    expect(running(x) - running(y)).toBe(2);
  });

  /**
   * But they are not one train timed twice. They wait in different places:
   * 8941 loses 94 minutes at HOUTKRAAL and 44 at ORANJERIVIER, while 17635
   * runs both in ten and four and gives 37 to POTFONTEIN and 36 to
   * MODDERRIVIER instead. Two rosters planned against each other, not one
   * schedule measured twice.
   */
  it('shows the two workings waiting in different places', () => {
    const waits = (t: Sched) =>
      new Set(t.rows.filter((r) => (r.standingTime ?? 0) >= 30).map((r) => r.station));
    const x = waits(byId('8941'));
    const y = waits(byId('17635'));
    expect([...x].filter((s) => !y.has(s)).sort()).toEqual(['HOUTKRAAL', 'ORANJERIVIER']);
    expect([...y].filter((s) => !x.has(s)).sort()).toEqual(['MODDERRIVIER', 'POTFONTEIN']);
  });

  /**
   * 1112, 1186 and 12024 cover the same 28 nodes from WOR-NOORD to BELLVILLE.
   * Their running times are 225.5, 222 and 225 minutes — three and a half
   * minutes apart across the whole route. Their standing times are 4.5, 43
   * and 120.
   *
   * The spread from fastest to slowest is 115 minutes. The spread in standing
   * is 115.5. This is the fifth group in this file to say it, and here the
   * running time is constant to within one part in sixty.
   */
  it('finds the spread between three workings is entirely standing', () => {
    const [a, b, c] = ['1112', '1186', '12024'].map(byId);
    expect(stations(a)).toEqual(stations(b));
    expect(stations(a)).toEqual(stations(c));

    expect(running(a)).toBeCloseTo(225.5, 6);
    expect(running(b)).toBe(222);
    expect(running(c)).toBe(225);
    expect(standing(a)).toBeCloseTo(4.5, 6);
    expect(standing(b)).toBe(43);
    expect(standing(c)).toBe(120);

    expect(a.throughputRuntime).toBe(230);
    expect(b.throughputRuntime).toBe(265);
    expect(c.throughputRuntime).toBe(345);
    expect(c.throughputRuntime - a.throughputRuntime).toBe(115);
    expect(standing(c) - standing(a)).toBeCloseTo(115.5, 6);
  });

  /**
   * 4701 and 8701 leave WOR-NOORD at 06:25, return at 07:46, visit the same
   * fifteen nodes and are identical on every clock and every runtime. They
   * differ in two columns only: how often they run and what they are called.
   *
   * A duplicate check on the movement alone merges them. A duplicate check
   * that includes the rostering columns does not. Both answers are defensible
   * and they lead to different train counts, so the file has to say which one
   * it means.
   */
  it('files one movement under two rosters', () => {
    const [p, q] = ['4701', '8701'].map(byId);
    expect(stations(p)).toEqual(stations(q));
    expect(p.originDeparture).toBe(q.originDeparture);
    expect(p.destinationArrival).toBe(q.destinationArrival);
    expect(p.throughputRuntime).toBe(q.throughputRuntime);
    expect(running(p)).toBe(running(q));
    expect(standing(p)).toBe(standing(q));
    expect(p.sched).toBe(q.sched);

    expect(p.frequency).toBe('YYYYYYY');
    expect(q.frequency).toBe('NYYYYYN');
    expect(p.trainType).toBe('VACUUM TRAINS/SHUNT CAR');
    expect(q.trainType).toBe('MEDIUM HEAVY/MEDIUM HEAVY');
  });

  /**
   * 83 is 1173 stopped early. Both work the same 44 nodes out of WOR-NOORD on
   * the same frequency code; 83 terminates at KARRINGMELK, and 1173 passes
   * through KARRINGMELK at the 44th node and carries on another 37 to
   * VOORBAAI.
   *
   * So the same route appears once as a service and once as the first leg of
   * a longer one — and counting trains counts it twice.
   */
  it('finds one train that is another train stopped early', () => {
    const a = byId('83');
    const b = byId('1173');
    expect(stations(a)).toEqual(stations(b).slice(0, a.rows.length));
    expect(a.destination).toBe('KARRINGMELK');
    expect(b.destination).toBe('VOORBAAI');
    expect(stations(b)).toContain('KARRINGMELK');
    expect(b.rows.length).toBeGreaterThan(a.rows.length);
    expect(a.frequency).toBe(b.frequency);
    expect(a.originDeparture).not.toBe(b.originDeparture);
  });

  /**
   * WITHDRAWN — "declares a minute of standing at a node that did not wait".
   *
   * This file previously asserted that WESTS 10001 arrived at 01:04 and
   * departed at 01:04 while declaring a minute of standing, and that it was
   * the only row in the sample whose two numeric columns claimed more time
   * than the clocks took. Those rows were not supplied: they had been
   * reconstructed from the pattern of the hourly series, and the
   * reconstruction was wrong.
   *
   * The test is not merely deleted. It is replaced by its negation, below —
   * no train in the verified extract over-counts — so that the fixture can
   * never again acquire a row that claims time the clocks did not take.
   */

  /**
   * The seventh defect class. The reason column arrives HTML-escaped: every
   * reason that names two trains carries a literal `&amp;` where the ampersand
   * should be — `SHUNT &amp; X 1214`, `X 71008 &amp; 3474`, `RM X 81002 &amp;
   * 71010`. Nine rows across five trains.
   *
   * Stored raw, each one is a distinct reason from its own unescaped form, so
   * any grouping on reason splits a single cause in two. The ampersand is
   * exactly the character that appears, because it is what joins two train
   * numbers.
   */
  it('decodes the HTML entities the export leaves in the reason column', () => {
    expect(decodeEntities('SHUNT &amp; X 1214')).toBe('SHUNT & X 1214');
    expect(decodeEntities('X 71008 &amp; 3474')).toBe('X 71008 & 3474');
    expect(decodeEntities('&#38; &#x26;')).toBe('& &');
    expect(decodeEntities('PLATFORM')).toBe('PLATFORM');
    expect(decodeEntities('unknown &frac12;')).toBe('unknown &frac12;');

    const reasons = byId('8941')
      .rows.map((r) => r.standingReason)
      .filter((r): r is string => r != null);
    expect(reasons).toContain('X 81600 & 81002');
    expect(reasons).toContain('RM X 81002 & 71010');
    for (const t of all) {
      expect(t.rows.some((r) => (r.standingReason ?? '').includes('&amp;'))).toBe(false);
    }
    expect(byId('1039').rows.some((r) => r.standingReason === 'SHUNT & X 1214')).toBe(true);
  });

  /**
   * The eighth defect class, and the reason the numeric columns do not add up.
   *
   * Yard moves are recorded at five-second granularity and the export leaves
   * the runtime column blank rather than writing 00:00:05. Across the 1,423
   * rows, 52 carry no point-to-point value and 765 carry no standing value —
   * but most are genuine zeros. Only 35 of the 52 record travel the clocks
   * actually took, and every one of them is a five-second yard move.
   *
   * A blank in these columns means "not written", not "zero" — read as zero,
   * the elapsed identity silently fails.
   *
   * Reported rather than inferred. The missing seconds are genuinely absent
   * from the source; putting a number in the schedule that no supplied line
   * supports would be worse than admitting the column is short.
   */
  it('reports rows that moved with no runtime recorded', () => {
    const total = all.reduce((n, t) => n + validateSchedule(t).unrecordedTravel.length, 0);
    expect(total).toBe(35);
    expect(validateSchedule(byId('1173')).unrecordedTravel.length).toBe(17);
    expect(validateSchedule(byId('83')).unrecordedTravel.length).toBe(10);
    expect(validateSchedule(byId('92')).unrecordedTravel).toEqual([]);
  });

  /**
   * Six of the thirty-five fail the elapsed identity, and all six fail in the
   * same direction: they under-count, by five seconds to 2m55s, because the
   * yard moves above were never written into the columns.
   *
   * Every one of them still ties its stated throughput, because the stated
   * figure is computed from the clocks and not from the two columns.
   */
  it('names the six trains whose columns do not add up', () => {
    const failing = all.filter((t) => !validateSchedule(t).elapsedIdentityHolds);
    expect(failing.map((t) => t.train).sort()).toEqual([
      '1039',
      '1104',
      '1108',
      '1173',
      '3221',
      '83',
    ]);
    for (const t of failing) expect(validateSchedule(t).throughputTies).toBe(true);
  });

  /**
   * The guard the withdrawn WESTS finding left behind.
   *
   * Not one train in the verified extract claims more time in its two numeric
   * columns than the clocks took. A row that over-counts cannot be produced by
   * a missing value — a blank under-counts — so an over-count is the signature
   * of a row that was written rather than read. Any future sample that trips
   * this assertion is to be treated as unsourced until its supplied text is
   * produced.
   */
  it('has no train that claims more time than the clocks took', () => {
    for (const t of all) {
      const { elapsedIdentityHolds } = validateSchedule(t);
      if (elapsedIdentityHolds) continue;
      const declared =
        t.rows.reduce((n, r) => n + (r.pointToPointRuntime ?? 0), 0) +
        t.rows.reduce((n, r) => n + (r.standingTime ?? 0), 0);
      expect([t.train, declared < elapsedMinutes(t)]).toEqual([t.train, true]);
    }
  });

  /**
   * The whole WESTS origin and both WOLSELEY workings are absent from this
   * fixture. They were supplied, and then lost before they could be captured
   * row by row. Asserting their absence keeps a future paste from silently
   * reinstating rows that cannot be traced to supplied text.
   */
  it('holds no train from an origin that was never captured', () => {
    expect(all.filter((t) => t.origin === 'WESTS')).toEqual([]);
    expect(all.filter((t) => t.origin === 'WOLSELEY')).toEqual([]);
    expect(new Set(all.map((t) => t.origin))).toEqual(
      new Set(['WOR-NOORD', 'WORCESTER', 'WINDSORTONROA', 'BELA BELA']),
    );
  });

  /**
   * Two trains run into a third day. 48915 leaves WOR-NOORD at 22:45 and
   * reaches KAZ-CITYDEEP at 09:55 on the second morning after — 2,110
   * minutes, 35h10. 48923 leaves BELA BELA at 19:59 and reaches KINGSREST
   * 2,082 minutes later.
   *
   * Both carry sequence groups that restart mid-train, so the node counter is
   * not a position either.
   */
  it('measures two trains that run into a third day', () => {
    for (const [id, minutes] of [
      ['48915', 2110],
      ['48923', 2082],
    ] as const) {
      const t = byId(id);
      expect(new Set(t.rows.map((r) => r.departDay))).toEqual(new Set([0, 1, 2]));
      expect(spansDays(t)).toBe(true);
      expect(elapsedMinutes(t)).toBe(minutes);
      expect(t.throughputRuntime).toBe(minutes);
      expect(validateSchedule(t).throughputTies).toBe(true);
    }
    expect(byId('48915').destination).toBe('KAZ-CITYDEEP');
    expect(byId('48923').destination).toBe('KINGSREST');
  });

  /**
   * A fourth frequency code. 83 and 1173 run YYYCYCY and 1108 runs YCYCYYY,
   * so the column carries Y, N, A and now C. Three trains use it and nothing
   * in the supplied sources says what it means.
   *
   * Recorded as an exception rather than guessed: a service whose C days are
   * read as running or not running is a service that is planned on the wrong
   * days.
   */
  it('adds a fourth frequency code and does not guess what it means', () => {
    expect(new Set(all.flatMap((t) => [...t.frequency]))).toEqual(new Set(['Y', 'N', 'A', 'C']));
    expect(byId('83').frequency).toBe('YYYCYCY');
    expect(byId('1173').frequency).toBe('YYYCYCY');
    expect(byId('1108').frequency).toBe('YCYCYYY');
  });

  /**
   * Corridor is an attribute of the node, not of the train. 48923 crosses
   * between NORTHEAST, NORTH, CENTRAL and CONTAINER eleven times on one
   * journey, and it does not settle: north of Newcastle it alternates
   * CONTAINER, NORTH, CONTAINER six times in twenty rows.
   *
   * So a train cannot be assigned a single corridor, and any KPI aggregated
   * by corridor has to be aggregated per node and then summed.
   */
  it('shows corridor changing eleven times on a single train', () => {
    const corridors = byId('48923').rows.map((r) => r.corridor);
    expect(new Set(corridors)).toEqual(new Set(['NORTHEAST', 'NORTH', 'CENTRAL', 'CONTAINER']));
    let flaps = 0;
    for (let i = 1; i < corridors.length; i += 1) if (corridors[i] !== corridors[i - 1]) flaps += 1;
    expect(flaps).toBe(11);

    expect(byId('48915').rows.find((r) => r.station === 'VANDERBIJL')!.corridor).toBe('');
  });

  /**
   * The three metro workings are the only passenger services in the extract.
   * 3506 runs Mondays only, 3508 Sundays only, and WORCESTER's 3510 runs
   * Tuesday to Saturday — the three services between them cover the week
   * without ever overlapping.
   */
  it('covers the week with three metro workings that never overlap', () => {
    const metro = ['3506', '3510', '3508'].map(byId);
    for (const t of metro) expect(t.trainType).toBe('METRO TRAIN/METRORAIL-CWN');
    expect(byId('3506').frequency).toBe('YNNNNNN');
    expect(byId('3510').frequency).toBe('NYYYYYN');
    expect(byId('3508').frequency).toBe('NNNNNNY');
  });
});
