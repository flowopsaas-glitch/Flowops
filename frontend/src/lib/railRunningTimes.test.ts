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
WESTS	904	1	CONTAINER	WESTS		12:00:00				FYN-ISLANDVIE	12:00:00	12:05:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:05:00	0	
WESTS	904	1	CONTAINER	FYN-ISLANDVIE	12:05:00	00:00:00	00:05:00		B RT	FYN-ISLANDVIE						00:05:00	0	2.39
WESTS	10001	1	CONTAINER	WESTS		01:00:00				WESTS	01:00:00	01:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	10001	1	CONTAINER	WST/S651958	01:02:00	01:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	10001	2	CONTAINER	WESTS	01:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	20001	1	CONTAINER	WESTS		02:00:00				WESTS	02:00:00	02:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	20001	1	CONTAINER	WST/S651958	02:02:00	02:03:00	00:02:00	00:01:00	RANGEER	WESTS						00:06:00	0	0.97
WESTS	20001	2	CONTAINER	WESTS	02:06:00	00:00:00	00:03:00			WESTS						00:06:00	0	0.97
WESTS	30001	1	CONTAINER	WESTS		03:00:00				WESTS	03:00:00	03:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	30001	1	CONTAINER	WST/S651958	03:02:00	03:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	30001	2	CONTAINER	WESTS	03:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	40001	1	CONTAINER	WESTS		04:00:00				WESTS	04:00:00	04:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	40001	1	CONTAINER	WST/S651958	04:02:00	04:03:00	00:02:00	00:01:00	RANGEER	WESTS						00:06:00	0	0.97
WESTS	40001	2	CONTAINER	WESTS	04:06:00	00:00:00	00:03:00			WESTS						00:06:00	0	0.97
WESTS	50001	1	CONTAINER	WESTS		05:00:00				WESTS	05:00:00	05:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	50001	1	CONTAINER	WST/S651958	05:02:00	05:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	50001	2	CONTAINER	WESTS	05:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	60001	1	CONTAINER	WESTS		06:00:00				WESTS	06:00:00	06:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	60001	1	CONTAINER	WST/S651958	06:02:00	06:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	60001	2	CONTAINER	WESTS	06:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	70001	1	CONTAINER	WESTS		07:00:00				WESTS	07:00:00	07:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	70001	1	CONTAINER	WST/S651958	07:02:00	07:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	70001	2	CONTAINER	WESTS	07:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	80001	1	CONTAINER	WESTS		08:00:00				WESTS	08:00:00	08:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	80001	1	CONTAINER	WST/S651958	08:02:00	08:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	80001	2	CONTAINER	WESTS	08:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	90001	1	CONTAINER	WESTS		09:00:00				WESTS	09:00:00	09:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	90001	1	CONTAINER	WST/S651958	09:02:00	09:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	90001	2	CONTAINER	WESTS	09:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	100001	1	CONTAINER	WESTS		10:00:00				WESTS	10:00:00	10:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	100001	1	CONTAINER	WST/S651958	10:02:00	10:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	100001	2	CONTAINER	WESTS	10:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	110001	1	CONTAINER	WESTS		11:00:00				WESTS	11:00:00	11:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	110001	1	CONTAINER	WST/S651958	11:02:00	11:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	110001	2	CONTAINER	WESTS	11:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	120001	1	CONTAINER	WESTS		12:00:00				WESTS	12:00:00	12:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	120001	1	CONTAINER	WST/S651958	12:02:00	12:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	120001	2	CONTAINER	WESTS	12:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	130001	1	CONTAINER	WESTS		13:00:00				WESTS	13:00:00	13:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	130001	1	CONTAINER	WST/S651958	13:02:00	13:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	130001	2	CONTAINER	WESTS	13:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	140001	1	CONTAINER	WESTS		14:00:00				WESTS	14:00:00	14:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	140001	1	CONTAINER	WST/S651958	14:02:00	14:03:00	00:02:00	00:01:00	RANGEER	WESTS						00:06:00	0	0.97
WESTS	140001	2	CONTAINER	WESTS	14:06:00	00:00:00	00:03:00			WESTS						00:06:00	0	0.97
WESTS	150001	1	CONTAINER	WESTS		15:00:00				WESTS	15:00:00	15:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	150001	1	CONTAINER	WST/S651958	15:02:00	15:03:00	00:02:00	00:01:00	RANGEER	WESTS						00:06:00	0	0.97
WESTS	150001	2	CONTAINER	WESTS	15:06:00	00:00:00	00:03:00			WESTS						00:06:00	0	0.97
WESTS	160001	1	CONTAINER	WESTS		16:00:00				WESTS	16:00:00	16:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	160001	1	CONTAINER	WST/S651958	16:02:00	16:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	160001	2	CONTAINER	WESTS	16:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	170001	1	CONTAINER	WESTS		17:00:00				WESTS	17:00:00	17:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	170001	1	CONTAINER	WST/S651958	17:02:00	17:03:00	00:02:00	00:01:00	RANGEER	WESTS						00:06:00	0	0.97
WESTS	170001	2	CONTAINER	WESTS	17:06:00	00:00:00	00:03:00			WESTS						00:06:00	0	0.97
WESTS	180001	1	CONTAINER	WESTS		18:00:00				WESTS	18:00:00	18:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	180001	1	CONTAINER	WST/S651958	18:02:00	18:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	180001	2	CONTAINER	WESTS	18:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	190001	1	CONTAINER	WESTS		19:00:00				WESTS	19:00:00	19:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	190001	1	CONTAINER	WST/S651958	19:02:00	19:03:00	00:02:00	00:01:00	RANGEER	WESTS						00:06:00	0	0.97
WESTS	190001	2	CONTAINER	WESTS	19:06:00	00:00:00	00:03:00			WESTS						00:06:00	0	0.97
WESTS	200001	1	CONTAINER	WESTS		20:00:00				WESTS	20:00:00	20:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	200001	1	CONTAINER	WST/S651958	20:02:00	20:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	200001	2	CONTAINER	WESTS	20:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	210001	1	CONTAINER	WESTS		21:00:00				WESTS	21:00:00	21:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	210001	1	CONTAINER	WST/S651958	21:02:00	21:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	210001	2	CONTAINER	WESTS	21:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	220001	1	CONTAINER	WESTS		22:00:00				WESTS	22:00:00	22:03:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:03:00	0	
WESTS	220001	1	CONTAINER	WST/S651958	22:01:00	22:02:00	00:01:00	00:01:00	RANGEER	WESTS						00:03:00	0	0.97
WESTS	220001	2	CONTAINER	WESTS	22:03:00	00:00:00	00:01:00			WESTS						00:03:00	0	0.97
WESTS	230001	1	CONTAINER	WESTS		23:00:00				WESTS	23:00:00	23:06:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	230001	1	CONTAINER	WST/S651958	23:02:00	23:03:00	00:02:00	00:01:00	A SHUNT	WESTS						00:06:00	0	0.97
WESTS	230001	2	CONTAINER	WESTS	23:06:00	00:00:00	00:03:00		RT	WESTS						00:06:00	0	0.97
WESTS	240001	1	CONTAINER	WESTS		00:01:00				WESTS	00:01:00	00:07:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:06:00	0	
WESTS	240001	1	CONTAINER	WST/S651958	00:03:00	00:04:00	00:02:00	00:01:00	RANGEER	WESTS						00:06:00	0	0.97
WESTS	240001	2	CONTAINER	WESTS	00:07:00	00:00:00	00:03:00			WESTS						00:06:00	0	0.97
WOLSELEY	1417	1	CAPE	WOLSELEY		07:00:00				CERES	07:00:00	09:00:00	3	YYYYYYY	LIGHTAIRBRAKE/CONTAINER TRN	02:00:00	0	
WOLSELEY	1417	1	CAPE	WAVEREN	07:32:00	07:32:00	00:32:00			CERES						02:00:00	0	5.57
WOLSELEY	1417	1	CAPE	MICHELLSPASS	07:45:00	07:45:00	00:13:00			CERES						02:00:00	0	2.16
WOLSELEY	1417	1	CAPE	DEMETER	08:36:00	08:36:00	00:51:00			CERES						02:00:00	0	8.44
WOLSELEY	1417	1	CAPE	BONCHRETIEN	08:49:00	08:49:00	00:13:00			CERES						02:00:00	0	2.87
WOLSELEY	1417	1	CAPE	CERES	09:00:00	00:00:00	00:11:00		RT	CERES						02:00:00	0	1.12
WOLSELEY	1418	1	CAPE	WOLSELEY		12:10:00				BELLVILLE	12:10:00	16:10:00	3	YYYYYYY	LIGHTAIRBRAKE/CONTAINER TRN	04:00:00	0	
WOLSELEY	1418	1	CAPE	ARTOIS	12:20:00	12:30:00	00:10:00	00:10:00	B X 17007	BELLVILLE						04:00:00	0	5.95
WOLSELEY	1418	1	CAPE	TULBAGHWEG	12:43:30	12:51:00	00:13:30	00:07:30	X 14255 / 7	BELLVILLE						04:00:00	0	8.92
WOLSELEY	1418	1	CAPE	GOUDA	13:02:00	13:02:00	00:11:00			BELLVILLE						04:00:00	0	7.26
WOLSELEY	1418	2	CAPE	VOELVLEI	13:11:00	13:30:00	00:09:00	00:19:00	X 18601 &amp; F 71008	BELLVILLE						04:00:00	0	7.48
WOLSELEY	1418	2	CAPE	HERMON	13:42:00	13:45:00	00:12:00	00:03:00	X 8913	BELLVILLE						04:00:00	0	7.62
WOLSELEY	1418	3	CAPE	SOETENDAL	13:59:00	14:17:00	00:14:00	00:18:00	X 17011	BELLVILLE						04:00:00	0	10.57
WOLSELEY	1418	4	CAPE	MALAN	14:27:00	14:27:00	00:10:00			BELLVILLE						04:00:00	0	1.33
WOLSELEY	1418	4	CAPE	WELLINGTON	14:36:00	14:36:00	00:09:00			BELLVILLE						04:00:00	0	13.71
WOLSELEY	1418	5	CAPE	MBEKWENI	14:40:00	14:40:00	00:04:00			BELLVILLE						04:00:00	0	4.53
WOLSELEY	1418	5	CAPE	DALJOSAFAT	14:45:00	14:45:00	00:05:00			BELLVILLE						04:00:00	0	3.58
WOLSELEY	1418	6	CAPE	HUGUENOT	14:49:00	14:49:00	00:04:00			BELLVILLE						04:00:00	0	2.52
WOLSELEY	1418	7	CAPE	PAARL	14:54:00	14:54:00	00:05:00			BELLVILLE						04:00:00	0	4.24
WOLSELEY	1418	8	CAPE	KLAPMUTS	15:07:00	15:07:00	00:13:00			BELLVILLE						04:00:00	0	10.68
WOLSELEY	1418	8	CAPE	MULDERSVLEI	15:15:00	15:15:00	00:08:00			BELLVILLE						04:00:00	0	5.79
WOLSELEY	1418	9	CAPE	KRAAIFONTEIN	15:27:00	15:27:00	00:12:00			BELLVILLE						04:00:00	0	10.21
WOLSELEY	1418	10	CAPE	EIKENFONTEIN	15:30:00	15:30:00	00:03:00			BELLVILLE						04:00:00	0	1.66
WOLSELEY	1418	10	CAPE	BRACKENFELL	15:34:00	15:34:00	00:04:00		F 71010	BELLVILLE						04:00:00	0	3.37
WOLSELEY	1418	11	CAPE	STIKLAND	15:51:00	15:51:00	00:17:00			BELLVILLE						04:00:00	0	3.85
WOLSELEY	1418	12	CAPE	BELLVILLE	16:10:00	00:00:00	00:19:00		LN 1418	BELLVILLE						04:00:00	0	2.79
`;


describe('a ninth extract: sixty-two trains, one yard, and nothing over-counted', () => {
  const all = parseRunningTimes(B9);
  const byId = (id: string) => all.find((t) => t.train === id)!;
  type Sched = ReturnType<typeof byId>;
  const running = (t: Sched) => t.rows.reduce((n, r) => n + (r.pointToPointRuntime ?? 0), 0);
  const standing = (t: Sched) => t.rows.reduce((n, r) => n + (r.standingTime ?? 0), 0);
  const stations = (t: Sched) => t.rows.map((r) => r.station);

  /**
   * Sixty-two trains, and all sixty-two carry a summary row and tie their
   * stated throughput. Because every one of them runs through to its
   * destination, the day offsets supply the span and the check is not a
   * modular one.
   *
   * An earlier revision of this file claimed sixty trains across 1,497 rows.
   * The twenty-five WESTS trains in that count had been reconstructed from the
   * pattern of the hourly series rather than transcribed from supplied text,
   * and they are not evidence. They were removed, and so were the two findings
   * that rested on them (see the note above the unrecorded-travel test).
   * WESTS and WOLSELEY were then re-supplied in full and read back in, which
   * is how the count reached sixty-two.
   */
  it('ties all sixty-two trains to their stated throughput', () => {
    expect(all).toHaveLength(62);
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
   * Six of the sixty-two fail the elapsed identity, and all six fail in the
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
   * WESTS, re-supplied in full on 2026-10-04 and read back in.
   *
   * 904 is the odd one out: a single node, WESTS to FYN-ISLANDVIE, 12:00 to
   * 12:05, on the CONTAINER corridor. Everything else at this origin is a
   * shunt car working WST/S651958 and coming back.
   */
  it('runs 904 out to FYN-ISLANDVIE and nothing else like it', () => {
    const t = byId('904');
    expect(t.origin).toBe('WESTS');
    expect(t.destination).toBe('FYN-ISLANDVIE');
    expect(t.rows).toHaveLength(1);
    expect(new Set(t.rows.map((r) => r.corridor))).toEqual(new Set(['CONTAINER']));
    expect(t.throughputRuntime).toBe(5);
    expect(standing(t)).toBe(0);
    expect(t.rows[0].standingReason).toBe('B RT');
  });

  /**
   * Twenty-four shunt cars, one an hour, every hour. Each leaves on the hour,
   * works WST/S651958 for exactly one minute, and is back six minutes after it
   * left: two minutes out, one standing, three back.
   *
   * The grid is not quite a grid. 10001 through 230001 leave at 01:00 to
   * 23:00; 240001 leaves at 00:01, one minute off the hour, and arrives at
   * 00:07.
   */
  it('runs one shunt car an hour for twenty-four hours', () => {
    const hourly = all.filter((t) => t.origin === 'WESTS' && t.train.endsWith('001'));
    expect(hourly).toHaveLength(24);
    for (const t of hourly) {
      expect(t.destination).toBe('WESTS');
      expect(t.rows).toHaveLength(2);
      expect(stations(t)).toEqual(['WST/S651958', 'WESTS']);
      expect(standing(t)).toBe(1);
      expect([t.train, t.throughputRuntime]).toEqual([
        t.train,
        t.train === '220001' ? 3 : 6,
      ]);
    }
    /** 01:00, 23:00 — and then 00:01, one minute off the hour. */
    expect(byId('10001').originDeparture).toBe(60);
    expect(byId('230001').originDeparture).toBe(23 * 60);
    expect(byId('240001').originDeparture).toBe(1);
    expect(byId('240001').destinationArrival).toBe(7);
  });

  /**
   * 220001 is the one car that is not like the others. Every sibling declares
   * two minutes out to the siding and three back; 220001 declares one and one,
   * works it at 22:01 to 22:02 instead of 22:02 to 22:03, and is home in three
   * minutes instead of six.
   *
   * It is not a typo the totals would catch: its stated throughput says
   * 00:03:00 as well, so the whole record is internally consistent. It is
   * simply a shorter job carrying the same shape, and it is the only one.
   */
  it('has exactly one hourly car that is half as long', () => {
    const t = byId('220001');
    expect(t.throughputRuntime).toBe(3);
    expect(running(t)).toBe(2);
    expect(t.rows[0].arrival).toBe(22 * 60 + 1);
    expect(t.rows[0].departure).toBe(22 * 60 + 2);
    expect(validateSchedule(t).throughputTies).toBe(true);
    expect(validateSchedule(t).elapsedIdentityHolds).toBe(true);

    const sixes = all.filter(
      (x) => x.origin === 'WESTS' && x.train.endsWith('001') && x.train !== '220001',
    );
    expect(sixes).toHaveLength(23);
    for (const x of sixes) {
      expect([x.train, running(x)]).toEqual([x.train, 5]);
      expect([x.train, x.rows[0].pointToPointRuntime]).toEqual([x.train, 2]);
      expect([x.train, x.rows[1].pointToPointRuntime]).toEqual([x.train, 3]);
      /** The siding is worked two minutes out and one minute standing. */
      expect(x.rows[0].departure - x.rows[0].arrival).toBe(1);
    }
  });

  /**
   * Two spellings of one job, and they always travel together. Sixteen cars
   * say A SHUNT at the siding and RT at the terminus; eight say RANGEER and
   * nothing at all. Not one car mixes them.
   *
   * So the two reason columns are not two independent fields here — they are
   * one binary attribute written twice, in two vocabularies, on an otherwise
   * mechanical series. Grouping on either column alone splits the fleet in the
   * same place; grouping on both at once is the only safe rule.
   */
  it('files one job under two vocabularies, never mixed', () => {
    const cars = all.filter((t) => t.origin === 'WESTS' && t.train.endsWith('001'));
    const pairs = cars.map((t) => [t.rows[0].standingReason, t.rows[1].standingReason ?? '']);
    expect(new Set(pairs.map((p) => p.join('|')))).toEqual(
      new Set(['A SHUNT|RT', 'RANGEER|']),
    );
    expect(pairs.filter((p) => p[0] === 'A SHUNT')).toHaveLength(16);
    expect(pairs.filter((p) => p[0] === 'RANGEER')).toHaveLength(8);
  });

  /**
   * WOLSELEY, also re-supplied. 1417 climbs to CERES in two hours without
   * stopping once; 1418 runs the same ground as half a dozen WOR-NOORD trains
   * and takes four hours, nearly a quarter of it standing.
   *
   * 1417 also carries the same sequence number — 1 — on all five of its rows,
   * which is the clearest case in the sample of NODE_Seq not being a position
   * within the journey.
   */
  it('measures the two WOLSELEY workings', () => {
    const a = byId('1417');
    const b = byId('1418');
    expect([a.origin, b.origin]).toEqual(['WOLSELEY', 'WOLSELEY']);
    expect(a.destination).toBe('CERES');
    expect(b.destination).toBe('BELLVILLE');
    expect(a.rows).toHaveLength(5);
    expect(b.rows).toHaveLength(19);
    expect(standing(a)).toBe(0);
    expect(a.throughputRuntime).toBe(120);
    expect(b.throughputRuntime).toBe(240);
    expect(standing(b)).toBe(57.5);
    expect(new Set(a.rows.map((r) => r.nodeSeq ?? null)).size).toBe(1);
    expect(b.rows.at(-1)!.standingReason).toBe('LN 1418');

    /** 1418 carries the tenth escaped-ampersand row in the sample. */
    expect(b.rows.some((r) => r.standingReason === 'X 18601 & F 71008')).toBe(true);
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

const B10 = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
WELLINGTON	7776	1	CAPE	WELLINGTON		10:30:00				DALJOSAFAT	10:30:00	10:40:00	3	NYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:10:00	0	
WELLINGTON	7776	1	CAPE	MBEKWENI	10:35:00	10:35:00	00:05:00			DALJOSAFAT						00:10:00	0	4.53
WELLINGTON	7776	1	CAPE	DALJOSAFAT	10:40:00	00:00:00	00:05:00		RT	DALJOSAFAT						00:10:00	0	3.58
WELLINGTON	9906	1	CAPE	WELLINGTON		14:00:00				BELLVILLE	14:00:00	15:09:00	3	YYYYYYY	VACUUM TRAINS/NON-REVENUE	01:09:00	0	
WELLINGTON	9906	1	CAPE	MBEKWENI	14:05:00	14:05:00	00:05:00			BELLVILLE						01:09:00	0	4.53
WELLINGTON	9906	1	CAPE	DALJOSAFAT	14:10:00	14:10:00	00:05:00			BELLVILLE						01:09:00	0	3.58
WELLINGTON	9906	2	CAPE	HUGUENOT	14:14:00	14:14:00	00:04:00			BELLVILLE						01:09:00	0	2.52
WELLINGTON	9906	3	CAPE	PAARL	14:19:00	14:19:00	00:05:00			BELLVILLE						01:09:00	0	4.24
WELLINGTON	9906	4	CAPE	KLAPMUTS	14:30:00	14:30:00	00:11:00			BELLVILLE						01:09:00	0	10.68
WELLINGTON	9906	4	CAPE	MULDERSVLEI	14:37:00	14:37:00	00:07:00			BELLVILLE						01:09:00	0	5.79
WELLINGTON	9906	5	CAPE	KRAAIFONTEIN	14:48:00	14:48:00	00:11:00			BELLVILLE						01:09:00	0	10.21
WELLINGTON	9906	6	CAPE	EIKENFONTEIN	14:52:00	14:52:00	00:04:00			BELLVILLE						01:09:00	0	1.66
WELLINGTON	9906	6	CAPE	BRACKENFELL	14:55:00	14:55:00	00:03:00			BELLVILLE						01:09:00	0	3.37
WELLINGTON	9906	7	CAPE	STIKLAND	15:02:00	15:02:00	00:07:00			BELLVILLE						01:09:00	0	3.85
WELLINGTON	9906	8	CAPE	BELLVILLE	15:09:00	00:00:00	00:07:00		RT	BELLVILLE						01:09:00	0	2.79
WINBURG	5002	1	CAPE	WINBURG		12:30:00				THEUNISSEN	12:30:00	13:45:00	3	NYNYNYN	VACUUM TRAINS/FEEDER TRAIN	01:15:00	0	
WINBURG	5002	1	CAPE	WGR/S545392	12:30:00	12:31:00		00:01:00	RANGEER	THEUNISSEN						01:15:00	0	0.97
WINBURG	5002	1	CAPE	WGR/S545414	12:31:00	12:32:00		00:01:00	RANGEER	THEUNISSEN						01:15:00	0	0.97
WINBURG	5002	2	CAPE	WGR/S545392	12:32:00	12:33:00		00:01:00	RANGEER	THEUNISSEN						01:15:00	0	0.97
WINBURG	5002	2	CAPE	WINBURG	12:33:00	12:34:00		00:01:00	RANGEER	THEUNISSEN						01:15:00	0	0.97
WINBURG	5002	3	CAPE	DEELSPRUIT	12:50:00	12:51:00	00:16:00	00:01:00	RANGEER	THEUNISSEN						01:15:00	0	13.43
WINBURG	5002	3	CAPE	KAREEFONTEIN	13:03:00	13:04:00	00:12:00	00:01:00	RANGEER	THEUNISSEN						01:15:00	0	7.69
WINBURG	5002	3	CAPE	MEYERS	13:17:00	13:18:00	00:13:00	00:01:00	RANGEER	THEUNISSEN						01:15:00	0	11.99
WINBURG	5002	3	CAPE	THEUNISSEN	13:34:00	13:34:00	00:16:00			THEUNISSEN						01:15:00	0	12.1
WINBURG	5002	4	CAPE	THN/S545694	13:37:00	13:42:00	00:03:00	00:05:00	RANGEER	THEUNISSEN						01:15:00	0	0.97
WINBURG	5002	5	CAPE	THEUNISSEN	13:45:00	00:00:00	00:03:00			THEUNISSEN						01:15:00	0	0.97
WINBURG	8906	1	CAPE	WINBURG		12:30:00				THEUNISSEN	12:30:00	13:45:00	2	NYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	01:15:00	0	
WINBURG	8906	1	CAPE	WGR/S545392	12:30:00	12:31:00		00:01:00	B RANGEER	THEUNISSEN						01:15:00	0	0.97
WINBURG	8906	1	CAPE	WGR/S545414	12:31:00	12:32:00		00:01:00	RANGEER	THEUNISSEN						01:15:00	0	0.97
WINBURG	8906	2	CAPE	WGR/S545392	12:32:00	12:33:00		00:01:00	RANGEER	THEUNISSEN						01:15:00	0	0.97
WINBURG	8906	2	CAPE	WINBURG	12:33:00	12:34:00		00:01:00	RANGEER	THEUNISSEN						01:15:00	0	0.97
WINBURG	8906	3	CAPE	DEELSPRUIT	12:50:00	12:51:00	00:16:00	00:01:00	RANGEER	THEUNISSEN						01:15:00	0	13.43
WINBURG	8906	3	CAPE	KAREEFONTEIN	13:03:00	13:04:00	00:12:00	00:01:00	RANGEER	THEUNISSEN						01:15:00	0	7.69
WINBURG	8906	3	CAPE	MEYERS	13:17:00	13:18:00	00:13:00	00:01:00	RANGEER	THEUNISSEN						01:15:00	0	11.99
WINBURG	8906	3	CAPE	THEUNISSEN	13:34:00	13:34:00	00:16:00			THEUNISSEN						01:15:00	0	12.1
WINBURG	8906	4	CAPE	THN/S545694	13:37:00	13:42:00	00:03:00	00:05:00	RANGEER	THEUNISSEN						01:15:00	0	0.97
WINBURG	8906	5	CAPE	THEUNISSEN	13:45:00	00:00:00	00:03:00		RT	THEUNISSEN						01:15:00	0	0.97
WELGEDAG	1264	1	NORTH	WELGEDAG		07:05:00				ELSBURG	07:05:00	08:35:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:30:00	0	
WELGEDAG	1264	1	NORTH	GEDULD	07:23:00	07:23:00	00:18:00			ELSBURG						01:30:00	0	5.8
WELGEDAG	1264	2	NORTH	MODREA	07:33:00	07:33:00	00:10:00			ELSBURG						01:30:00	0	6
WELGEDAG	1264	2	NORTH	APEX	07:45:00	07:45:00	00:12:00			ELSBURG						01:30:00	0	5.5
WELGEDAG	1264	3	CENTRAL	RANGEVIEW	07:52:00	07:52:00	00:07:00			ELSBURG						01:30:00	0	2.72
WELGEDAG	1264	3	CENTRAL	DUNSWART	08:00:00	08:00:00	00:08:00			ELSBURG						01:30:00	0	3
WELGEDAG	1264	4	CENTRAL	BOKSBURGOOS	08:05:00	08:05:00	00:05:00			ELSBURG						01:30:00	0	2.58
WELGEDAG	1264	5	CENTRAL	BOKSBURG	08:06:00	08:06:00	00:01:00			ELSBURG						01:30:00	0	1.86
WELGEDAG	1264	5	CENTRAL	OOSRAND	08:10:00	08:10:00	00:04:00			ELSBURG						01:30:00	0	1.15
WELGEDAG	1264	6	CENTRAL	ANGELO	08:13:00	08:13:00	00:03:00			ELSBURG						01:30:00	0	2.14
WELGEDAG	1264	7	CENTRAL	DELMORE	08:17:00	08:17:00	00:04:00			ELSBURG						01:30:00	0	1.52
WELGEDAG	1264	8	CENTRAL	GMR-OOS	08:20:00	08:20:00	00:03:00			ELSBURG						01:30:00	0	1.94
WELGEDAG	1264	9	CONTAINER	ELSBURG	08:35:00	00:00:00	00:15:00			ELSBURG						01:30:00	0	3.6
WELGEDAG	1266	1	NORTH	WELGEDAG		07:05:00				NATALSPRUIT	07:05:00	08:56:00	2	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:51:00	0	
WELGEDAG	1266	1	NORTH	GEDULD	07:23:00	07:23:00	00:18:00		B	NATALSPRUIT						01:51:00	0	5.8
WELGEDAG	1266	2	NORTH	MODREA	07:33:00	07:33:00	00:10:00			NATALSPRUIT						01:51:00	0	6
WELGEDAG	1266	2	NORTH	APEX	07:45:00	07:45:00	00:12:00			NATALSPRUIT						01:51:00	0	5.5
WELGEDAG	1266	3	CENTRAL	NEWKLEINFONTE	07:47:00	07:47:00	00:02:00			NATALSPRUIT						01:51:00	0	2.33
WELGEDAG	1266	3	CENTRAL	BENONI	07:54:00	07:54:00	00:07:00			NATALSPRUIT						01:51:00	0	1.66
WELGEDAG	1266	4	CENTRAL	DUNSWART	08:00:00	08:00:00	00:06:00			NATALSPRUIT						01:51:00	0	2.85
WELGEDAG	1266	5	CENTRAL	BOKSBURGOOS	08:06:00	08:06:00	00:06:00			NATALSPRUIT						01:51:00	0	2.58
WELGEDAG	1266	6	CENTRAL	BOKSBURG	08:07:00	08:07:00	00:01:00			NATALSPRUIT						01:51:00	0	1.86
WELGEDAG	1266	6	CENTRAL	OOSRAND	08:13:00	08:13:00	00:06:00			NATALSPRUIT						01:51:00	0	1.15
WELGEDAG	1266	7	CENTRAL	ANGELO	08:19:00	08:19:00	00:06:00			NATALSPRUIT						01:51:00	0	2.14
WELGEDAG	1266	8	CENTRAL	DELMORE	08:24:00	08:24:00	00:05:00			NATALSPRUIT						01:51:00	0	1.52
WELGEDAG	1266	9	CENTRAL	GMR-OOS	08:28:00	08:28:00	00:04:00			NATALSPRUIT						01:51:00	0	1.94
WELGEDAG	1266	10	CONTAINER	ELSBURG	08:36:00	08:36:00	00:08:00			NATALSPRUIT						01:51:00	0	3.6
WELGEDAG	1266	11	CONTAINER	DALLAS	08:40:00	08:40:00	00:04:00			NATALSPRUIT						01:51:00	0	0.9
WELGEDAG	1266	12	CONTAINER	WATTLES	08:43:00	08:43:00	00:03:00			NATALSPRUIT						01:51:00	0	1.53
WELGEDAG	1266	12	CONTAINER	UNION	08:48:00	08:48:00	00:05:00			NATALSPRUIT						01:51:00	0	1.81
WELGEDAG	1266	13	CONTAINER	NATALSPRUIT	08:56:00	00:00:00	00:08:00		RT	NATALSPRUIT						01:51:00	0	4.42
WELGEDAG	1268	1	NORTH	WELGEDAG		07:05:00				JUP/S752525	07:05:00	08:07:30	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:02:00	0	
WELGEDAG	1268	1	NORTH	GEDULD	07:13:00	07:13:00	00:08:00			JUP/S752525						01:02:00	0	5.8
WELGEDAG	1268	2	NORTH	MODREA	07:21:00	07:21:00	00:08:00			JUP/S752525						01:02:00	0	6
WELGEDAG	1268	2	NORTH	APEX	07:31:00	07:31:00	00:10:00			JUP/S752525						01:02:00	0	5.5
WELGEDAG	1268	3	CENTRAL	NEWKLEINFONTE	07:33:00	07:33:00	00:02:00			JUP/S752525						01:02:00	0	2.33
WELGEDAG	1268	3	CENTRAL	BENONI	07:38:00	07:38:00	00:05:00			JUP/S752525						01:02:00	0	1.66
WELGEDAG	1268	4	CENTRAL	DUNSWART	07:42:00	07:42:00	00:04:00			JUP/S752525						01:02:00	0	2.85
WELGEDAG	1268	5	CENTRAL	BOKSBURGOOS	07:46:00	07:46:00	00:04:00			JUP/S752525						01:02:00	0	2.58
WELGEDAG	1268	6	CENTRAL	BOKSBURG	07:47:00	07:47:00	00:01:00			JUP/S752525						01:02:00	0	1.86
WELGEDAG	1268	6	CENTRAL	OOSRAND	07:51:00	07:51:00	00:04:00			JUP/S752525						01:02:00	0	1.15
WELGEDAG	1268	7	CENTRAL	ANGELO	07:55:00	07:55:00	00:04:00			JUP/S752525						01:02:00	0	2.14
WELGEDAG	1268	8	CENTRAL	DELMORE	07:56:00	07:56:00	00:01:00			JUP/S752525						01:02:00	0	1.52
WELGEDAG	1268	9	CENTRAL	GERMISTON	07:57:00	07:57:00	00:01:00			JUP/S752525						01:02:00	0	3.5
WELGEDAG	1268	10	CONTAINER	PRESIDENT	07:58:00	07:58:00	00:01:00			JUP/S752525						01:02:00	0	1.08
WELGEDAG	1268	11	CONTAINER	INDIA	07:59:00	07:59:00	00:01:00			JUP/S752525						01:02:00	0	1.75
WELGEDAG	1268	12	CONTAINER	GERMISTONWEST	08:00:00	08:00:00	00:01:00			JUP/S752525						01:02:00	0	0.4
WELGEDAG	1268	12	CONTAINER	GERMISTONSOUT	08:01:00	08:01:00	00:01:00			JUP/S752525						01:02:00	0	0.59
WELGEDAG	1268	13	CONTAINER	REFINERY	08:02:00	08:02:00	00:01:00			JUP/S752525						01:02:00	0	1.19
WELGEDAG	1268	14	CONTAINER	JUPITER	08:06:30	08:06:30	00:04:30			JUP/S752525						01:02:00	0	3.54
WELGEDAG	1268	15	CONTAINER	JUP/S752525	08:07:30	00:00:00	00:01:00			JUP/S752525						01:02:00	0	0.97
WELGEDAG	1336	1	NORTH	WELGEDAG		07:50:00				GERMISTON	07:50:00	08:50:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:00:00	0	
WELGEDAG	1336	1	NORTH	GEDULD	07:58:00	07:58:00	00:08:00			GERMISTON						01:00:00	0	5.8
WELGEDAG	1336	2	NORTH	MODREA	08:06:00	08:06:00	00:08:00			GERMISTON						01:00:00	0	6
WELGEDAG	1336	2	NORTH	APEX	08:16:00	08:16:00	00:10:00			GERMISTON						01:00:00	0	5.5
WELGEDAG	1336	3	CENTRAL	NEWKLEINFONTE	08:18:00	08:18:00	00:02:00			GERMISTON						01:00:00	0	2.33
WELGEDAG	1336	3	CENTRAL	BENONI	08:23:00	08:23:00	00:05:00			GERMISTON						01:00:00	0	1.66
WELGEDAG	1336	4	CENTRAL	DUNSWART	08:27:00	08:27:00	00:04:00			GERMISTON						01:00:00	0	2.85
WELGEDAG	1336	5	CENTRAL	BOKSBURGOOS	08:31:00	08:31:00	00:04:00			GERMISTON						01:00:00	0	2.58
WELGEDAG	1336	6	CENTRAL	BOKSBURG	08:32:00	08:32:00	00:01:00			GERMISTON						01:00:00	0	1.86
WELGEDAG	1336	6	CENTRAL	OOSRAND	08:36:00	08:36:00	00:04:00			GERMISTON						01:00:00	0	1.15
WELGEDAG	1336	7	CENTRAL	ANGELO	08:40:00	08:40:00	00:04:00			GERMISTON						01:00:00	0	2.14
WELGEDAG	1336	8	CENTRAL	DELMORE	08:41:00	08:41:00	00:01:00			GERMISTON						01:00:00	0	1.52
WELGEDAG	1336	9	CENTRAL	GERMISTON	08:50:00	00:00:00	00:09:00			GERMISTON						01:00:00	0	3.5
WELGEDAG	1395	1	NORTH	WELGEDAG		04:05:00				PYRAMIDSUID	04:05:00	06:20:00	1	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	02:15:00	0	
WELGEDAG	1395	1	CENTRAL	COWLESDAM	04:22:36	04:22:36	00:17:36			PYRAMIDSUID						02:15:00	0	5.83
WELGEDAG	1395	2	CENTRAL	ZESFONTEIN	04:32:00	04:32:00	00:09:24		B	PYRAMIDSUID						02:15:00	0	9.59
WELGEDAG	1395	3	CENTRAL	STQ-VARKFONTEIN	04:42:00	04:42:00	00:10:00			PYRAMIDSUID						02:15:00	0	11.52
WELGEDAG	1395	4	CENTRAL	BRONKHORSTFONTEIN	04:48:54	04:48:54	00:06:54			PYRAMIDSUID						02:15:00	0	4.98
WELGEDAG	1395	5	CENTRAL	AVONDSRUS	05:00:00	05:00:00	00:11:06			PYRAMIDSUID						02:15:00	0	8.67
WELGEDAG	1395	6	CENTRAL	YSTERVARKFONT	05:04:00	05:04:00	00:04:00			PYRAMIDSUID						02:15:00	0	3.1
WELGEDAG	1395	7	CENTRAL	KNOPPIESFONTE	05:08:00	05:08:00	00:04:00			PYRAMIDSUID						02:15:00	0	3.43
WELGEDAG	1395	7	CENTRAL	ROODEKNOPPIES	05:22:00	05:22:00	00:14:00			PYRAMIDSUID						02:15:00	0	12.66
WELGEDAG	1395	7	CENTRAL	KLEINSONDERHOUT	05:30:00	05:30:00	00:08:00			PYRAMIDSUID						02:15:00	0	6.91
WELGEDAG	1395	7	CENTRAL	TWEEDRAG	05:35:00	05:35:00	00:05:00			PYRAMIDSUID						02:15:00	0	5.5
WELGEDAG	1395	7	CENTRAL	DONKERHOEK	05:47:00	05:47:00	00:12:00			PYRAMIDSUID						02:15:00	0	8.76
WELGEDAG	1395	7	CENTRAL	LUD(STQLYN)	05:52:00	05:52:00	00:05:00			PYRAMIDSUID						02:15:00	0	4.95
WELGEDAG	1395	8	NORTH	LEEUFONTEIN	05:57:00	05:57:00	00:05:00			PYRAMIDSUID						02:15:00	0	5.5
WELGEDAG	1395	9	NORTH	BAVIAANSPOORT	06:07:00	06:07:00	00:10:00			PYRAMIDSUID						02:15:00	0	8.96
WELGEDAG	1395	9	NORTH	KAMEELDRIF	06:13:00	06:13:00	00:06:00			PYRAMIDSUID						02:15:00	0	5.36
WELGEDAG	1395	9	NORTH	PYRAMIDSUID	06:20:00	00:00:00	00:07:00		RT	PYRAMIDSUID						02:15:00	0	6.67
WELGEDAG	1768	1	NORTH	WELGEDAG		00:50:00				GEDULD	00:50:00	01:07:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:17:00	0	
WELGEDAG	1768	1	NORTH	GEDULD	01:07:00	00:00:00	00:17:00			GEDULD						00:17:00	0	5.8
WELGEDAG	9982	1	NORTH	WELGEDAG		16:30:00				GEDULD	16:30:00	16:47:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:17:00	0	
WELGEDAG	9982	1	NORTH	GEDULD	16:47:00	00:00:00	00:17:00			GEDULD						00:17:00	0	5.8
WELGEDAG	7469	1	NORTH	WELGEDAG		17:30:00				SPRINGS	17:30:00	17:44:00	2	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:14:00	0	
WELGEDAG	7469	1	NORTH	SPRINGS	17:44:00	00:00:00	00:14:00		C RT	SPRINGS						00:14:00	0	7
WELGEDAG	7470	1	NORTH	WELGEDAG		17:30:00				SPRINGS	17:30:00	17:44:00	2	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:14:00	0	
WELGEDAG	7470	1	NORTH	SPRINGS	17:44:00	00:00:00	00:14:00		C RT	SPRINGS						00:14:00	0	7
WELGEDAG	7701	1	NORTH	WELGEDAG		15:00:00				SPRINGS	15:00:00	15:15:00	2	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:15:00	0	
WELGEDAG	7701	1	NORTH	SPRINGS	15:15:00	00:00:00	00:15:00		B RT	SPRINGS						00:15:00	0	7
WELGEDAG	7703	1	NORTH	WELGEDAG		03:00:00				SPRINGS	03:00:00	03:15:00	2	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:15:00	0	
WELGEDAG	7703	1	NORTH	SPRINGS	03:15:00	00:00:00	00:15:00		B RT	SPRINGS						00:15:00	0	7
WELGEDAG	3328	1	NORTH	WELGEDAG		05:10:00				GUD/S743429	05:10:00	05:33:00	3	YYYYAYY	VACUUM TRAINS/FEEDER TRAIN	00:23:00	0	
WELGEDAG	3328	1	NORTH	GEDULD	05:27:00	05:27:00	00:17:00			GUD/S743429						00:23:00	0	5.8
WELGEDAG	3328	1	NORTH	GUD/S743372	05:29:00	05:29:00	00:02:00			GUD/S743429						00:23:00	0	0.97
WELGEDAG	3328	1	NORTH	GUD/S743402	05:31:00	05:31:00	00:02:00			GUD/S743429						00:23:00	0	0.97
WELGEDAG	3328	1	NORTH	GUD/S743429	05:33:00	00:00:00	00:02:00			GUD/S743429						00:23:00	0	0.97
WELGEDAG	7401	1	NORTH	WELGEDAG		05:10:00				GUD/S743429	05:10:00	05:33:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:23:00	0	
WELGEDAG	7401	1	NORTH	GEDULD	05:27:00	05:27:00	00:17:00			GUD/S743429						00:23:00	0	5.8
WELGEDAG	7401	1	NORTH	GUD/S743372	05:29:00	05:29:00	00:02:00			GUD/S743429						00:23:00	0	0.97
WELGEDAG	7401	1	NORTH	GUD/S743402	05:31:00	05:31:00	00:02:00			GUD/S743429						00:23:00	0	0.97
WELGEDAG	7401	1	NORTH	GUD/S743429	05:33:00	00:00:00	00:02:00			GUD/S743429						00:23:00	0	0.97
WELGEDAG	7410	1	NORTH	WELGEDAG		05:10:00				GUD/S743429	05:10:00	05:33:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:23:00	0	
WELGEDAG	7410	1	NORTH	GEDULD	05:27:00	05:27:00	00:17:00			GUD/S743429						00:23:00	0	5.8
WELGEDAG	7410	1	NORTH	GUD/S743372	05:29:00	05:29:00	00:02:00			GUD/S743429						00:23:00	0	0.97
WELGEDAG	7410	1	NORTH	GUD/S743402	05:31:00	05:31:00	00:02:00			GUD/S743429						00:23:00	0	0.97
WELGEDAG	7410	1	NORTH	GUD/S743429	05:33:00	00:00:00	00:02:00			GUD/S743429						00:23:00	0	0.97
WELGEDAG	7452	1	NORTH	WELGEDAG		17:00:00				GUD/S743453	17:00:00	17:30:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:30:00	0	
WELGEDAG	7452	1	NORTH	GEDULD	17:15:00	17:15:00	00:15:00			GUD/S743453						00:30:00	0	5.8
WELGEDAG	7452	2	NORTH	GUD/S743372	17:17:00	17:17:00	00:02:00			GUD/S743453						00:30:00	0	0.97
WELGEDAG	7452	2	NORTH	GUD/S743402	17:19:00	17:19:00	00:02:00			GUD/S743453						00:30:00	0	0.97
WELGEDAG	7452	2	NORTH	GUD/S743429	17:21:00	17:26:00	00:02:00	00:05:00	SHUNT	GUD/S743453						00:30:00	0	0.97
WELGEDAG	7452	2	NORTH	GUD/S743437	17:28:00	17:28:00	00:02:00			GUD/S743453						00:30:00	0	0.97
WELGEDAG	7452	2	NORTH	GUD/S743453	17:30:00	00:00:00	00:02:00			GUD/S743453						00:30:00	0	0.97
WELGEDAG	8485	1	NORTH	WELGEDAG		22:05:00				DMS/S741523	22:05:00	23:00:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:55:00	0	
WELGEDAG	8485	1	NORTH	SUNDRA	22:17:00	22:17:00	00:12:00		B	DMS/S741523						00:55:00	0	8.55
WELGEDAG	8485	2	NORTH	ELF/S766011	22:22:15	22:24:45	00:05:15	00:02:30	WEIGHBRIDGE	DMS/S741523						00:55:00	0	5.29
WELGEDAG	8485	2	NORTH	ELOFF	22:25:00	22:25:00	00:00:15			DMS/S741523						00:55:00	0	0.1
WELGEDAG	8485	3	NORTH	DELMAS	22:35:00	22:35:00	00:10:00			DMS/S741523						00:55:00	0	8.59
WELGEDAG	8485	4	NORTH	DMS/S741523	23:00:00	00:00:00	00:25:00		RT	DMS/S741523						00:55:00	0	0.97
WELGEDAG	18852	1	NORTH	WELGEDAG		10:00:00				DMS/S742171	10:00:00	10:53:00	3	YYYYYYY	MEDIUM HEAVY/MAJUBA	00:53:00	0	
WELGEDAG	18852	1	NORTH	SUNDRA	10:15:00	10:15:00	00:15:00			DMS/S742171						00:53:00	0	8.55
WELGEDAG	18852	2	NORTH	ELF/S766011	10:20:15	10:22:45	00:05:15	00:02:30	WEIGHBRIDGE	DMS/S742171						00:53:00	0	5.29
WELGEDAG	18852	2	NORTH	ELOFF	10:23:00	10:23:00	00:00:15			DMS/S742171						00:53:00	0	0.1
WELGEDAG	18852	3	NORTH	DELMAS	10:33:00	10:33:00	00:10:00			DMS/S742171						00:53:00	0	8.59
WELGEDAG	18852	4	NORTH	DMS/S742171	10:53:00	00:00:00	00:20:00			DMS/S742171						00:53:00	0	0.97
WELGEDAG	18868	1	NORTH	WELGEDAG		17:00:00				DMS/S742171	17:00:00	17:53:00	3	AAAAAAA	MEDIUM HEAVY/MAJUBA	00:53:00	0	
WELGEDAG	18868	1	NORTH	SUNDRA	17:15:00	17:15:00	00:15:00			DMS/S742171						00:53:00	0	8.55
WELGEDAG	18868	2	NORTH	ELF/S766011	17:20:15	17:22:45	00:05:15	00:02:30	WEIGHBRIDGE	DMS/S742171						00:53:00	0	5.29
WELGEDAG	18868	2	NORTH	ELOFF	17:23:00	17:23:00	00:00:15			DMS/S742171						00:53:00	0	0.1
WELGEDAG	18868	3	NORTH	DELMAS	17:33:00	17:33:00	00:10:00			DMS/S742171						00:53:00	0	8.59
WELGEDAG	18868	4	NORTH	DMS/S742171	17:53:00	00:00:00	00:20:00			DMS/S742171						00:53:00	0	0.97
WELGEDAG	18872	1	NORTH	WELGEDAG		21:00:00				DMS/S742171	21:00:00	21:53:00	3	YYYYYYY	MEDIUM HEAVY/MAJUBA	00:53:00	0	
WELGEDAG	18872	1	NORTH	SUNDRA	21:15:00	21:15:00	00:15:00			DMS/S742171						00:53:00	0	8.55
WELGEDAG	18872	2	NORTH	ELF/S766011	21:20:15	21:22:45	00:05:15	00:02:30	WEIGHBRIDGE	DMS/S742171						00:53:00	0	5.29
WELGEDAG	18872	2	NORTH	ELOFF	21:23:00	21:23:00	00:00:15			DMS/S742171						00:53:00	0	0.1
WELGEDAG	18872	3	NORTH	DELMAS	21:33:00	21:33:00	00:10:00			DMS/S742171						00:53:00	0	8.59
WELGEDAG	18872	4	NORTH	DMS/S742171	21:53:00	00:00:00	00:20:00			DMS/S742171						00:53:00	0	0.97
WELGEDAG	18892	1	NORTH	WELGEDAG		06:00:00				DMS/S742171	06:00:00	06:53:00	3	YYYYYYY	MEDIUM HEAVY/MAJUBA	00:53:00	0	
WELGEDAG	18892	1	NORTH	SUNDRA	06:15:00	06:15:00	00:15:00			DMS/S742171						00:53:00	0	8.55
WELGEDAG	18892	2	NORTH	ELF/S766011	06:20:15	06:22:45	00:05:15	00:02:30	WEIGHBRIDGE	DMS/S742171						00:53:00	0	5.29
WELGEDAG	18892	2	NORTH	ELOFF	06:23:00	06:23:00	00:00:15			DMS/S742171						00:53:00	0	0.1
WELGEDAG	18892	3	NORTH	DELMAS	06:33:00	06:33:00	00:10:00			DMS/S742171						00:53:00	0	8.59
WELGEDAG	18892	4	NORTH	DMS/S742171	06:53:00	00:00:00	00:20:00			DMS/S742171						00:53:00	0	0.97
WELGEDAG	8205	1	NORTH	WELGEDAG		14:45:00				WITBANK	14:45:00	16:34:00	1	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:49:00	0	
WELGEDAG	8205	1	NORTH	SUNDRA	14:55:00	14:55:00	00:10:00		B	WITBANK						01:49:00	0	8.55
WELGEDAG	8205	2	NORTH	ELF/S766011	15:00:15	15:02:45	00:05:15	00:02:30	WEIGHBRIDGE	WITBANK						01:49:00	0	5.29
WELGEDAG	8205	2	NORTH	ELOFF	15:03:00	15:03:00	00:00:15			WITBANK						01:49:00	0	0.1
WELGEDAG	8205	3	NORTH	DELMAS	15:13:00	15:13:00	00:10:00			WITBANK						01:49:00	0	8.59
WELGEDAG	8205	4	NORTH	DRYDEN	15:23:00	15:23:00	00:10:00			WITBANK						01:49:00	0	10.66
WELGEDAG	8205	5	NORTH	ARGENT	15:34:00	15:34:00	00:11:00			WITBANK						01:49:00	0	9.68
WELGEDAG	8205	6	NORTH	ARBOR	15:43:00	15:43:00	00:09:00			WITBANK						01:49:00	0	8.01
WELGEDAG	8205	7	NORTH	KENDAL	15:51:00	15:51:00	00:08:00			WITBANK						01:49:00	0	7.45
WELGEDAG	8205	8	NORTH	OGIES	16:01:00	16:01:00	00:10:00			WITBANK						01:49:00	0	10.14
WELGEDAG	8205	9	NORTH	MINNAAR	16:09:00	16:09:00	00:08:00			WITBANK						01:49:00	0	6.86
WELGEDAG	8205	10	NORTH	BLACKHILL	16:19:00	16:19:00	00:10:00			WITBANK						01:49:00	0	8.82
WELGEDAG	8205	11	NORTHEAST	WITBANK	16:34:00	00:00:00	00:15:00		RT	WITBANK						01:49:00	0	11.76
WELGEDAG	8215	1	NORTH	WELGEDAG		14:45:00				WITBANK	14:45:00	16:34:00	1	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:49:00	0	
WELGEDAG	8215	1	NORTH	SUNDRA	14:55:00	14:55:00	00:10:00		B	WITBANK						01:49:00	0	8.55
WELGEDAG	8215	2	NORTH	ELF/S766011	15:00:15	15:02:45	00:05:15	00:02:30	WEIGHBRIDGE	WITBANK						01:49:00	0	5.29
WELGEDAG	8215	2	NORTH	ELOFF	15:03:00	15:03:00	00:00:15			WITBANK						01:49:00	0	0.1
WELGEDAG	8215	3	NORTH	DELMAS	15:13:00	15:13:00	00:10:00			WITBANK						01:49:00	0	8.59
WELGEDAG	8215	4	NORTH	DRYDEN	15:23:00	15:23:00	00:10:00			WITBANK						01:49:00	0	10.66
WELGEDAG	8215	5	NORTH	ARGENT	15:34:00	15:34:00	00:11:00			WITBANK						01:49:00	0	9.68
WELGEDAG	8215	6	NORTH	ARBOR	15:43:00	15:43:00	00:09:00			WITBANK						01:49:00	0	8.01
WELGEDAG	8215	7	NORTH	KENDAL	15:51:00	15:51:00	00:08:00			WITBANK						01:49:00	0	7.45
WELGEDAG	8215	8	NORTH	OGIES	16:01:00	16:01:00	00:10:00			WITBANK						01:49:00	0	10.14
WELGEDAG	8215	9	NORTH	MINNAAR	16:09:00	16:09:00	00:08:00			WITBANK						01:49:00	0	6.86
WELGEDAG	8215	10	NORTH	BLACKHILL	16:19:00	16:19:00	00:10:00			WITBANK						01:49:00	0	8.82
WELGEDAG	8215	11	NORTHEAST	WITBANK	16:34:00	00:00:00	00:15:00		RT	WITBANK						01:49:00	0	11.76
WELGEDAG	8219	1	NORTH	WELGEDAG		14:45:00				WITBANK	14:45:00	16:34:00	1	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:49:00	0	
WELGEDAG	8219	1	NORTH	SUNDRA	14:55:00	14:55:00	00:10:00		B	WITBANK						01:49:00	0	8.55
WELGEDAG	8219	2	NORTH	ELF/S766011	15:00:15	15:02:45	00:05:15	00:02:30	WEIGHBRIDGE	WITBANK						01:49:00	0	5.29
WELGEDAG	8219	2	NORTH	ELOFF	15:03:00	15:03:00	00:00:15			WITBANK						01:49:00	0	0.1
WELGEDAG	8219	3	NORTH	DELMAS	15:13:00	15:13:00	00:10:00			WITBANK						01:49:00	0	8.59
WELGEDAG	8219	4	NORTH	DRYDEN	15:23:00	15:23:00	00:10:00			WITBANK						01:49:00	0	10.66
WELGEDAG	8219	5	NORTH	ARGENT	15:34:00	15:34:00	00:11:00			WITBANK						01:49:00	0	9.68
WELGEDAG	8219	6	NORTH	ARBOR	15:43:00	15:43:00	00:09:00			WITBANK						01:49:00	0	8.01
WELGEDAG	8219	7	NORTH	KENDAL	15:51:00	15:51:00	00:08:00			WITBANK						01:49:00	0	7.45
WELGEDAG	8219	8	NORTH	OGIES	16:01:00	16:01:00	00:10:00			WITBANK						01:49:00	0	10.14
WELGEDAG	8219	9	NORTH	MINNAAR	16:09:00	16:09:00	00:08:00			WITBANK						01:49:00	0	6.86
WELGEDAG	8219	10	NORTH	BLACKHILL	16:19:00	16:19:00	00:10:00			WITBANK						01:49:00	0	8.82
WELGEDAG	8219	11	NORTHEAST	WITBANK	16:34:00	00:00:00	00:15:00		RT	WITBANK						01:49:00	0	11.76
WELGEDAG	8407	1	NORTH	WELGEDAG		14:45:00				WITBANK	14:45:00	16:34:00	1	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	01:49:00	0	
WELGEDAG	8407	1	NORTH	SUNDRA	14:55:00	14:55:00	00:10:00		B	WITBANK						01:49:00	0	8.55
WELGEDAG	8407	2	NORTH	ELF/S766011	15:00:15	15:02:45	00:05:15	00:02:30	WEIGHBRIDGE	WITBANK						01:49:00	0	5.29
WELGEDAG	8407	2	NORTH	ELOFF	15:03:00	15:03:00	00:00:15			WITBANK						01:49:00	0	0.1
WELGEDAG	8407	3	NORTH	DELMAS	15:13:00	15:13:00	00:10:00			WITBANK						01:49:00	0	8.59
WELGEDAG	8407	4	NORTH	DRYDEN	15:23:00	15:23:00	00:10:00			WITBANK						01:49:00	0	10.66
WELGEDAG	8407	5	NORTH	ARGENT	15:34:00	15:34:00	00:11:00			WITBANK						01:49:00	0	9.68
WELGEDAG	8407	6	NORTH	ARBOR	15:43:00	15:43:00	00:09:00			WITBANK						01:49:00	0	8.01
WELGEDAG	8407	7	NORTH	KENDAL	15:51:00	15:51:00	00:08:00			WITBANK						01:49:00	0	7.45
WELGEDAG	8407	8	NORTH	OGIES	16:01:00	16:01:00	00:10:00			WITBANK						01:49:00	0	10.14
WELGEDAG	8407	9	NORTH	MINNAAR	16:09:00	16:09:00	00:08:00			WITBANK						01:49:00	0	6.86
WELGEDAG	8407	10	NORTH	BLACKHILL	16:19:00	16:19:00	00:10:00			WITBANK						01:49:00	0	8.82
WELGEDAG	8407	11	NORTHEAST	WITBANK	16:34:00	00:00:00	00:15:00		RT	WITBANK						01:49:00	0	11.76
WELGEDAG	8816	1	NORTH	WELGEDAG		10:00:00				RTI/S765198	10:00:00	13:48:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	03:48:00	0	
WELGEDAG	8816	1	NORTH	SUNDRA	10:13:00	10:13:00	00:13:00			RTI/S765198						03:48:00	0	8.55
WELGEDAG	8816	2	NORTH	ELF/S766011	10:19:15	10:19:45	00:06:15	00:00:30		RTI/S765198						03:48:00	0	5.29
WELGEDAG	8816	2	NORTH	ELOFF	10:20:00	10:20:00	00:00:15		WEIGH BRIDGE	RTI/S765198						03:48:00	0	0.1
WELGEDAG	8816	3	NORTH	DELMAS	10:28:00	10:28:00	00:08:00			RTI/S765198						03:48:00	0	8.59
WELGEDAG	8816	4	NORTH	DRYDEN	10:38:00	10:38:00	00:10:00			RTI/S765198						03:48:00	0	10.66
WELGEDAG	8816	5	NORTH	ARGENT	10:48:00	10:48:00	00:10:00			RTI/S765198						03:48:00	0	9.68
WELGEDAG	8816	6	NORTH	ARBOR	10:57:00	10:57:00	00:09:00			RTI/S765198						03:48:00	0	8.01
WELGEDAG	8816	7	NORTH	KENDAL	11:04:00	11:04:00	00:07:00			RTI/S765198						03:48:00	0	7.45
WELGEDAG	8816	8	NORTH	OGIES	11:14:00	11:14:00	00:10:00			RTI/S765198						03:48:00	0	10.14
WELGEDAG	8816	9	NORTH	SAAIWATER	11:28:00	11:28:00	00:14:00			RTI/S765198						03:48:00	0	11.98
WELGEDAG	8816	10	NORTH	KROMKLIP	11:56:00	11:56:00	00:28:00			RTI/S765198						03:48:00	0	5.83
WELGEDAG	8816	11	NORTH	SRW-BEZUIDENHOUTS	12:05:00	12:05:00	00:09:00			RTI/S765198						03:48:00	0	7.59
WELGEDAG	8816	12	NORTH	VANDYKSDRIF	12:16:00	12:16:00	00:11:00			RTI/S765198						03:48:00	0	9.07
WELGEDAG	8816	13	NORTH	BLINKPAN	12:33:00	12:33:00	00:17:00			RTI/S765198						03:48:00	0	10.3
WELGEDAG	8816	14	NORTH	BROODSNYERSPL	12:48:00	12:48:00	00:15:00			RTI/S765198						03:48:00	0	8.76
WELGEDAG	8816	15	NORTH	GELUKSPLAAS	13:00:00	13:00:00	00:12:00			RTI/S765198						03:48:00	0	2.1
WELGEDAG	8816	16	NORTH	BSX-PULLENSHO	13:14:00	13:14:00	00:14:00			RTI/S765198						03:48:00	0	9.07
WELGEDAG	8816	17	NORTH	BSX-RIETKUIL	13:42:00	13:42:00	00:28:00			RTI/S765198						03:48:00	0	28.28
WELGEDAG	8816	18	NORTH	RTI/S765198	13:48:00	00:00:00	00:06:00			RTI/S765198						03:48:00	0	0.1
WELGEDAG	8838	1	NORTH	WELGEDAG		04:05:00				RTI/S843083	04:05:00	08:05:00	3	AAAAAAA	MEDIUM HEAVY/MEDIUM HEAVY	04:00:00	0	
WELGEDAG	8838	1	NORTH	SUNDRA	04:18:00	04:18:00	00:13:00			RTI/S843083						04:00:00	0	8.55
WELGEDAG	8838	2	NORTH	ELF/S766011	04:24:15	04:24:45	00:06:15	00:00:30		RTI/S843083						04:00:00	0	5.29
WELGEDAG	8838	2	NORTH	ELOFF	04:25:00	04:25:00	00:00:15		WEIGH BRIDGE	RTI/S843083						04:00:00	0	0.1
WELGEDAG	8838	3	NORTH	DELMAS	04:33:00	04:33:00	00:08:00			RTI/S843083						04:00:00	0	8.59
WELGEDAG	8838	4	NORTH	DRYDEN	04:43:00	04:43:00	00:10:00			RTI/S843083						04:00:00	0	10.66
WELGEDAG	8838	5	NORTH	ARGENT	04:53:00	04:53:00	00:10:00			RTI/S843083						04:00:00	0	9.68
WELGEDAG	8838	6	NORTH	ARBOR	05:02:00	05:02:00	00:09:00			RTI/S843083						04:00:00	0	8.01
WELGEDAG	8838	7	NORTH	KENDAL	05:09:00	05:09:00	00:07:00			RTI/S843083						04:00:00	0	7.45
WELGEDAG	8838	8	NORTH	OGIES	05:19:00	05:19:00	00:10:00			RTI/S843083						04:00:00	0	10.14
WELGEDAG	8838	9	NORTH	SAAIWATER	05:33:00	05:33:00	00:14:00			RTI/S843083						04:00:00	0	11.98
WELGEDAG	8838	10	NORTH	KROMKLIP	06:01:00	06:01:00	00:28:00			RTI/S843083						04:00:00	0	5.83
WELGEDAG	8838	11	NORTH	SRW-BEZUIDENHOUTS	06:10:00	06:10:00	00:09:00			RTI/S843083						04:00:00	0	7.59
WELGEDAG	8838	12	NORTH	VANDYKSDRIF	06:21:00	06:21:00	00:11:00			RTI/S843083						04:00:00	0	9.07
WELGEDAG	8838	13	NORTH	BLINKPAN	06:38:00	06:43:00	00:17:00	00:05:00	SHUNT	RTI/S843083						04:00:00	0	10.3
WELGEDAG	8838	14	NORTH	BROODSNYERSPL	06:58:00	06:58:00	00:15:00			RTI/S843083						04:00:00	0	8.76
WELGEDAG	8838	15	NORTH	GELUKSPLAAS	07:10:00	07:10:00	00:12:00			RTI/S843083						04:00:00	0	2.1
WELGEDAG	8838	16	NORTH	BSX-PULLENSHO	07:24:00	07:24:00	00:14:00			RTI/S843083						04:00:00	0	9.07
WELGEDAG	8838	17	NORTH	BSX-RIETKUIL	07:52:00	07:52:00	00:28:00			RTI/S843083						04:00:00	0	28.28
WELGEDAG	8838	18	NORTH	RTI/S765198	07:58:00	07:59:00	00:06:00	00:01:00		RTI/S843083						04:00:00	0	0.1
WELGEDAG	8838	19	NORTH	BSX-RIETKUIL	08:00:00	08:00:00	00:01:00			RTI/S843083						04:00:00	0	0.1
WELGEDAG	8838	20	NORTH	RTI/S843083	08:05:00	00:00:00	00:05:00			RTI/S843083						04:00:00	0	
WELGEDAG	8870	1	NORTH	WELGEDAG		00:04:00				CLEWER	00:04:00	02:00:00	2	YYYYYYY	MEDIUM HEAVY/ESKOM COAL	01:56:00	0	
WELGEDAG	8870	1	NORTH	SUNDRA	00:14:00	00:14:00	00:10:00		B	CLEWER						01:56:00	0	8.55
WELGEDAG	8870	2	NORTH	ELF/S766011	00:19:15	00:20:45	00:05:15	00:01:30	WEIGHBRIDGE	CLEWER						01:56:00	0	5.29
WELGEDAG	8870	2	NORTH	ELOFF	00:20:45	00:20:45				CLEWER						01:56:00	0	0.1
WELGEDAG	8870	3	NORTH	DELMAS	00:30:45	00:30:45	00:10:00			CLEWER						01:56:00	0	8.59
WELGEDAG	8870	4	NORTH	DRYDEN	00:40:45	00:40:45	00:10:00			CLEWER						01:56:00	0	10.66
WELGEDAG	8870	5	NORTH	ARGENT	00:50:45	00:50:45	00:10:00			CLEWER						01:56:00	0	9.68
WELGEDAG	8870	6	NORTH	ARBOR	00:59:45	00:59:45	00:09:00			CLEWER						01:56:00	0	8.01
WELGEDAG	8870	7	NORTH	KENDAL	01:08:45	01:08:45	00:09:00			CLEWER						01:56:00	0	7.45
WELGEDAG	8870	8	NORTH	OGIES	01:18:45	01:18:45	00:10:00			CLEWER						01:56:00	0	10.14
WELGEDAG	8870	9	NORTH	MINNAAR	01:26:45	01:26:45	00:08:00			CLEWER						01:56:00	0	6.86
WELGEDAG	8870	10	NORTH	BLACKHILL	01:36:45	01:36:45	00:10:00			CLEWER						01:56:00	0	8.82
WELGEDAG	8870	11	NORTHEAST	SKOONGESIG	01:45:45	01:45:45	00:09:00			CLEWER						01:56:00	0	17.12
WELGEDAG	8870	12	NORTHEAST	CLEWER	02:00:00	00:00:00	00:14:15		RT	CLEWER						01:56:00	0	3.81
WELGEDAG	8915	1	NORTH	WELGEDAG		05:54:00				ERMELO	05:54:00	10:25:00	1	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	04:31:00	0	
WELGEDAG	8915	1	NORTH	SUNDRA	06:09:00	06:09:00	00:15:00		C	ERMELO						04:31:00	0	8.55
WELGEDAG	8915	2	NORTH	ELF/S766011	06:14:15	06:16:45	00:05:15	00:02:30	WEIGHBRIDGE	ERMELO						04:31:00	0	5.29
WELGEDAG	8915	2	NORTH	ELOFF	06:17:00	06:17:00	00:00:15			ERMELO						04:31:00	0	0.1
WELGEDAG	8915	3	NORTH	DELMAS	06:27:00	06:27:00	00:10:00			ERMELO						04:31:00	0	8.59
WELGEDAG	8915	4	NORTH	DRYDEN	06:39:00	06:39:00	00:12:00			ERMELO						04:31:00	0	10.66
WELGEDAG	8915	5	NORTH	ARGENT	06:50:00	06:50:00	00:11:00			ERMELO						04:31:00	0	9.68
WELGEDAG	8915	6	NORTH	ARBOR	07:00:00	07:00:00	00:10:00			ERMELO						04:31:00	0	8.01
WELGEDAG	8915	7	NORTH	KENDAL	07:09:00	07:09:00	00:09:00			ERMELO						04:31:00	0	7.45
WELGEDAG	8915	8	NORTH	OGIES	07:21:00	07:21:00	00:12:00			ERMELO						04:31:00	0	10.14
WELGEDAG	8915	9	NORTH	SAAIWATER	07:37:00	07:37:00	00:16:00			ERMELO						04:31:00	0	11.98
WELGEDAG	8915	10	NORTH	KROMKLIP	07:44:00	07:44:00	00:07:00			ERMELO						04:31:00	0	5.83
WELGEDAG	8915	11	NORTH	SRW-BEZUIDENHOUTS	07:53:00	07:53:00	00:09:00			ERMELO						04:31:00	0	7.59
WELGEDAG	8915	12	NORTH	VANDYKSDRIF	08:04:00	08:04:00	00:11:00			ERMELO						04:31:00	0	9.07
WELGEDAG	8915	13	NORTH	BLINKPAN	08:21:00	08:21:00	00:17:00			ERMELO						04:31:00	0	10.3
WELGEDAG	8915	14	NORTH	BROODSNYERSPL	08:36:00	08:36:00	00:15:00			ERMELO						04:31:00	0	8.76
WELGEDAG	8915	15	NORTH	GELUKSPLAAS	08:48:00	08:48:00	00:12:00			ERMELO						04:31:00	0	2.1
WELGEDAG	8915	16	NORTH	HALFGEWONNEN	09:04:00	09:04:00	00:16:00			ERMELO						04:31:00	0	15.3
WELGEDAG	8915	17	NORTH	WEBBSRUS	09:29:00	09:29:00	00:25:00			ERMELO						04:31:00	0	20.8
WELGEDAG	8915	17	NORTH	HAMELFONTEIN	09:47:00	09:47:00	00:18:00			ERMELO						04:31:00	0	15.89
WELGEDAG	8915	18	NORTH	RIETVLEIRUS	10:03:00	10:03:00	00:16:00			ERMELO						04:31:00	0	12.89
WELGEDAG	8915	19	NORTH	ERMELO	10:25:00	00:00:00	00:22:00		RT	ERMELO						04:31:00	0	23.19
WELGEDAG	9471	1	NORTH	WELGEDAG		03:45:00				ERMELO	03:45:00	08:47:00	1	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	05:02:00	0	
WELGEDAG	9471	1	NORTH	SUNDRA	04:11:00	04:11:00	00:26:00		B	ERMELO						05:02:00	0	8.55
WELGEDAG	9471	2	NORTH	ELF/S766011	04:16:15	04:18:45	00:05:15	00:02:30	WEIGHBRIDGE	ERMELO						05:02:00	0	5.29
WELGEDAG	9471	2	NORTH	ELOFF	04:19:00	04:19:00	00:00:15			ERMELO						05:02:00	0	0.1
WELGEDAG	9471	3	NORTH	DELMAS	04:29:00	04:29:00	00:10:00			ERMELO						05:02:00	0	8.59
WELGEDAG	9471	4	NORTH	DRYDEN	04:41:00	04:41:00	00:12:00			ERMELO						05:02:00	0	10.66
WELGEDAG	9471	5	NORTH	ARGENT	04:52:00	04:52:00	00:11:00			ERMELO						05:02:00	0	9.68
WELGEDAG	9471	6	NORTH	ARBOR	05:02:00	05:02:00	00:10:00			ERMELO						05:02:00	0	8.01
WELGEDAG	9471	7	NORTH	KENDAL	05:11:00	05:11:00	00:09:00			ERMELO						05:02:00	0	7.45
WELGEDAG	9471	8	NORTH	OGIES	05:23:00	05:43:00	00:12:00	00:20:00	RT	ERMELO						05:02:00	0	10.14
WELGEDAG	9471	1	NORTH	SAAIWATER	05:59:00	05:59:00	00:16:00			ERMELO						05:02:00	0	11.98
WELGEDAG	9471	2	NORTH	KROMKLIP	06:06:00	06:06:00	00:07:00			ERMELO						05:02:00	0	5.83
WELGEDAG	9471	3	NORTH	SRW-BEZUIDENHOUTS	06:15:00	06:15:00	00:09:00			ERMELO						05:02:00	0	7.59
WELGEDAG	9471	4	NORTH	VANDYKSDRIF	06:26:00	06:26:00	00:11:00			ERMELO						05:02:00	0	9.07
WELGEDAG	9471	5	NORTH	BLINKPAN	06:43:00	06:43:00	00:17:00			ERMELO						05:02:00	0	10.3
WELGEDAG	9471	6	NORTH	BROODSNYERSPL	06:58:00	06:58:00	00:15:00			ERMELO						05:02:00	0	8.76
WELGEDAG	9471	7	NORTH	GELUKSPLAAS	07:10:00	07:10:00	00:12:00			ERMELO						05:02:00	0	2.1
WELGEDAG	9471	8	NORTH	HALFGEWONNEN	07:26:00	07:26:00	00:16:00			ERMELO						05:02:00	0	15.3
WELGEDAG	9471	9	NORTH	WEBBSRUS	07:51:00	07:51:00	00:25:00			ERMELO						05:02:00	0	20.8
WELGEDAG	9471	9	NORTH	HAMELFONTEIN	08:09:00	08:09:00	00:18:00			ERMELO						05:02:00	0	15.89
WELGEDAG	9471	10	NORTH	RIETVLEIRUS	08:25:00	08:25:00	00:16:00			ERMELO						05:02:00	0	12.89
WELGEDAG	9471	11	NORTH	ERMELO	08:47:00	00:00:00	00:22:00		RT	ERMELO						05:02:00	0	23.19
WELGEDAG	48894	1	NORTH	WELGEDAG		13:00:00				HAW/S754536	13:00:00	15:59:00	3	AAAAAAA	MEDIUM HEAVY/MAJUBA	02:59:00	0	
WELGEDAG	48894	1	NORTH	SUNDRA	13:10:00	13:10:00	00:10:00		B	HAW/S754536						02:59:00	0	8.55
WELGEDAG	48894	2	NORTH	ELF/S766011	13:15:15	13:17:45	00:05:15	00:02:30	WEIGHBRIDGE	HAW/S754536						02:59:00	0	5.29
WELGEDAG	48894	2	NORTH	ELOFF	13:18:00	13:18:00	00:00:15			HAW/S754536						02:59:00	0	0.1
WELGEDAG	48894	3	NORTH	DELMAS	13:28:00	13:28:00	00:10:00			HAW/S754536						02:59:00	0	8.59
WELGEDAG	48894	4	NORTH	DRYDEN	13:40:00	13:40:00	00:12:00			HAW/S754536						02:59:00	0	10.66
WELGEDAG	48894	5	NORTH	ARGENT	13:51:00	13:51:00	00:11:00			HAW/S754536						02:59:00	0	9.68
WELGEDAG	48894	6	NORTH	ARBOR	14:01:00	14:01:00	00:10:00			HAW/S754536						02:59:00	0	8.01
WELGEDAG	48894	7	NORTH	KENDAL	14:10:00	14:10:00	00:09:00			HAW/S754536						02:59:00	0	7.45
WELGEDAG	48894	8	NORTH	OGIES	14:22:00	14:22:00	00:12:00			HAW/S754536						02:59:00	0	10.14
WELGEDAG	48894	9	NORTH	KENDAL	14:33:00	14:33:00	00:11:00			HAW/S754536						02:59:00	0	10.14
WELGEDAG	48894	10	NORTH	ARBOR	14:42:00	14:42:00	00:09:00			HAW/S754536						02:59:00	0	7.45
WELGEDAG	48894	11	NORTH	ARGENT	14:53:00	14:53:00	00:11:00			HAW/S754536						02:59:00	0	8.01
WELGEDAG	48894	12	NORTH	DRYDEN	15:05:00	15:05:00	00:12:00			HAW/S754536						02:59:00	0	9.68
WELGEDAG	48894	13	NORTH	DELMAS	15:18:00	15:18:00	00:13:00			HAW/S754536						02:59:00	0	10.66
WELGEDAG	48894	14	NORTH	SILICA	15:35:00	15:35:00	00:17:00			HAW/S754536						02:59:00	0	11.64
WELGEDAG	48894	15	NORTH	HAWERKLIP	15:50:00	15:50:00	00:15:00			HAW/S754536						02:59:00	0	10.96
WELGEDAG	48894	16	NORTH	HAW/S743488	15:52:00	15:57:00	00:02:00	00:05:00	SHUNT	HAW/S754536						02:59:00	0	0.97
WELGEDAG	48894	16	NORTH	HAW/S754536	15:59:00	00:00:00	00:02:00		RT	HAW/S754536						02:59:00	0	0.97
WELGEDAG	8883	1	NORTH	WELGEDAG		16:15:00				SNR/S761427	16:15:00	20:27:00	1	YYYYYYY	MEDIUM HEAVY/THUTHUKA	04:12:00	0	
WELGEDAG	8883	1	CENTRAL	COWLESDAM	16:32:00	16:32:00	00:17:00		C	SNR/S761427						04:12:00	0	5.83
WELGEDAG	8883	2	CENTRAL	AURUM	16:42:00	16:42:00	00:10:00			SNR/S761427						04:12:00	0	10.38
WELGEDAG	8883	3	CENTRAL	WITHOK	16:48:30	16:48:30	00:06:30			SNR/S761427						04:12:00	0	7
WELGEDAG	8883	4	CENTRAL	VLAKFONTEIN	16:54:30	16:54:30	00:06:00			SNR/S761427						04:12:00	0	11.74
WELGEDAG	8883	4	CENTRAL	ROOIVLEI	16:58:30	16:58:30	00:04:00			SNR/S761427						04:12:00	0	2.89
WELGEDAG	8883	5	CONTAINER	RIETVALLEI	17:10:30	17:10:30	00:12:00			SNR/S761427						04:12:00	0	3.14
WELGEDAG	8883	6	CONTAINER	GLENROY	17:14:00	17:14:00	00:03:30			SNR/S761427						04:12:00	0	4.23
WELGEDAG	8883	7	CONTAINER	DRIEMANSKAP	17:24:30	17:24:30	00:10:30			SNR/S761427						04:12:00	0	5.24
WELGEDAG	8883	8	CONTAINER	KAYDALE	17:33:30	17:33:30	00:09:00			SNR/S761427						04:12:00	0	7.92
WELGEDAG	8883	9	CONTAINER	KLIPPOORTJIE	17:37:30	17:37:30	00:04:00			SNR/S761427						04:12:00	0	3.27
WELGEDAG	8883	9	CONTAINER	HEIDELBERGT	17:44:30	17:44:30	00:07:00			SNR/S761427						04:12:00	0	2.54
WELGEDAG	8883	10	CONTAINER	KRAAL	17:53:00	17:53:00	00:08:30			SNR/S761427						04:12:00	0	8
WELGEDAG	8883	10	CONTAINER	SPRUYTSRUS	18:07:00	18:07:00	00:14:00			SNR/S761427						04:12:00	0	8.31
WELGEDAG	8883	10	CONTAINER	FORTUNA	18:17:00	18:17:00	00:10:00			SNR/S761427						04:12:00	0	6.76
WELGEDAG	8883	10	CONTAINER	BALFOURNORTH	18:29:00	18:24:00	00:12:00	23:55:00	SHUNT	SNR/S761427						04:12:00	0	7.83
WELGEDAG	8883	11	CONTAINER	SPRUCEWELL	18:40:30	18:40:30	00:16:30			SNR/S761427						04:12:00	0	9.38
WELGEDAG	8883	11	CONTAINER	GREYLINGSTAD	18:55:30	18:55:30	00:15:00			SNR/S761427						04:12:00	0	9.91
WELGEDAG	8883	12	CONTAINER	TEAKWORTH	19:05:30	19:05:30	00:10:00			SNR/S761427						04:12:00	0	9.09
WELGEDAG	8883	12	CONTAINER	BEYTELPLAATS	19:16:30	19:16:30	00:11:00			SNR/S761427						04:12:00	0	11.8
WELGEDAG	8883	12	CONTAINER	VAL	19:24:30	19:24:30	00:08:00			SNR/S761427						04:12:00	0	7.5
WELGEDAG	8883	13	CONTAINER	CEDARMONT	19:32:30	19:32:30	00:08:00			SNR/S761427						04:12:00	0	7.5
WELGEDAG	8883	13	CONTAINER	HOLMDENE	19:45:00	19:45:00	00:12:30			SNR/S761427						04:12:00	0	7.45
WELGEDAG	8883	14	CONTAINER	ELMTREE	19:59:30	19:59:30	00:14:30			SNR/S761427						04:12:00	0	9.53
WELGEDAG	8883	14	CONTAINER	STANDERTON	20:18:00	20:18:00	00:18:30			SNR/S761427						04:12:00	0	11.63
WELGEDAG	8883	15	CONTAINER	SNR/S761249	20:19:07	20:19:07	00:01:07			SNR/S761427						04:12:00	0	0.97
WELGEDAG	8883	15	CONTAINER	SNR/S761222	20:20:14	20:20:14	00:01:07			SNR/S761427						04:12:00	0	0.97
WELGEDAG	8883	15	CONTAINER	SNR/S761214	20:21:21	20:21:21	00:01:07			SNR/S761427						04:12:00	0	0.97
WELGEDAG	8883	15	CONTAINER	SNR/S749117	20:22:28	20:22:28	00:01:07			SNR/S761427						04:12:00	0	0.97
WELGEDAG	8883	15	CONTAINER	SNR/S749109	20:23:35	20:23:35	00:01:07			SNR/S761427						04:12:00	0	0.97
WELGEDAG	8883	15	CONTAINER	SNR/S749095	20:24:42	20:24:42	00:01:07			SNR/S761427						04:12:00	0	0.97
WELGEDAG	8883	15	CONTAINER	SNR/S749079	20:25:49	20:25:49	00:01:07			SNR/S761427						04:12:00	0	0.97
WELGEDAG	8883	15	NORTH	SNR/S761427	20:27:00	00:00:00	00:01:11		RT	SNR/S761427						04:12:00	0	0.97
WELGEDAG	8881	1	NORTH	WELGEDAG		15:00:00				PMD/S742074	15:00:00	23:21:00	1	YYYYYYY	MEDIUM HEAVY/ESKOM COAL	08:21:00	0	
WELGEDAG	8881	1	CENTRAL	COWLESDAM	15:28:00	15:28:00	00:28:00		C	PMD/S742074						08:21:00	0	5.83
WELGEDAG	8881	2	CENTRAL	AURUM	15:41:00	15:41:00	00:13:00			PMD/S742074						08:21:00	0	10.38
WELGEDAG	8881	3	CENTRAL	WITHOK	15:59:30	15:59:30	00:18:30			PMD/S742074						08:21:00	0	7
WELGEDAG	8881	4	CENTRAL	VLAKFONTEIN	16:17:30	16:17:30	00:18:00			PMD/S742074						08:21:00	0	11.74
WELGEDAG	8881	4	CENTRAL	ROOIVLEI	16:23:00	16:23:00	00:05:30			PMD/S742074						08:21:00	0	2.89
WELGEDAG	8881	5	CONTAINER	RIETVALLEI	16:32:00	16:32:00	00:09:00			PMD/S742074						08:21:00	0	3.14
WELGEDAG	8881	6	CONTAINER	GLENROY	16:37:30	16:37:30	00:05:30			PMD/S742074						08:21:00	0	4.23
WELGEDAG	8881	7	CONTAINER	DRIEMANSKAP	16:50:00	16:50:00	00:12:30			PMD/S742074						08:21:00	0	5.24
WELGEDAG	8881	8	CONTAINER	KAYDALE	17:01:00	17:01:00	00:11:00			PMD/S742074						08:21:00	0	7.92
WELGEDAG	8881	9	CONTAINER	KLIPPOORTJIE	17:07:00	17:07:00	00:06:00			PMD/S742074						08:21:00	0	3.27
WELGEDAG	8881	9	CONTAINER	HEIDELBERGT	17:16:00	17:16:00	00:09:00			PMD/S742074						08:21:00	0	2.54
WELGEDAG	8881	10	CONTAINER	KRAAL	17:26:30	17:26:30	00:10:30			PMD/S742074						08:21:00	0	8
WELGEDAG	8881	10	CONTAINER	SPRUYTSRUS	17:42:30	17:42:30	00:16:00			PMD/S742074						08:21:00	0	8.31
WELGEDAG	8881	10	CONTAINER	FORTUNA	17:54:30	17:54:30	00:12:00			PMD/S742074						08:21:00	0	6.76
WELGEDAG	8881	10	CONTAINER	BALFOURNORTH	18:09:00	18:09:00	00:14:30			PMD/S742074						08:21:00	0	7.83
WELGEDAG	8881	11	CONTAINER	SPRUCEWELL	18:22:00	18:22:00	00:13:00			PMD/S742074						08:21:00	0	9.38
WELGEDAG	8881	11	CONTAINER	GREYLINGSTAD	18:39:00	18:39:00	00:17:00			PMD/S742074						08:21:00	0	9.91
WELGEDAG	8881	12	CONTAINER	TEAKWORTH	18:51:00	18:51:00	00:12:00			PMD/S742074						08:21:00	0	9.09
WELGEDAG	8881	12	CONTAINER	BEYTELPLAATS	19:04:00	19:04:00	00:13:00			PMD/S742074						08:21:00	0	11.8
WELGEDAG	8881	12	CONTAINER	VAL	19:14:00	19:14:00	00:10:00			PMD/S742074						08:21:00	0	7.5
WELGEDAG	8881	13	CONTAINER	CEDARMONT	19:24:00	19:24:00	00:10:00			PMD/S742074						08:21:00	0	7.5
WELGEDAG	8881	13	CONTAINER	HOLMDENE	19:38:30	19:38:30	00:14:30			PMD/S742074						08:21:00	0	7.45
WELGEDAG	8881	14	CONTAINER	ELMTREE	19:55:00	19:55:00	00:16:30			PMD/S742074						08:21:00	0	9.53
WELGEDAG	8881	14	CONTAINER	STANDERTON	20:16:00	20:36:00	00:21:00	00:20:00	XP 8870	PMD/S742074						08:21:00	0	11.63
WELGEDAG	8881	15	CONTAINER	FIRHAM	20:44:00	20:44:00	00:08:00			PMD/S742074						08:21:00	0	5.48
WELGEDAG	8881	16	CONTAINER	KROMDRAAI	21:01:30	21:01:30	00:17:30			PMD/S742074						08:21:00	0	10.56
WELGEDAG	8881	16	CONTAINER	KANONHEUWEL	21:15:00	21:15:00	00:13:30			PMD/S742074						08:21:00	0	5.94
WELGEDAG	8881	16	CONTAINER	PLATRAND	21:25:00	21:25:00	00:10:00			PMD/S742074						08:21:00	0	7.15
WELGEDAG	8881	17	CONTAINER	RUSTHOF	21:40:00	21:40:00	00:15:00			PMD/S742074						08:21:00	0	8.18
WELGEDAG	8881	17	CONTAINER	KOPPIEALLEEN	21:47:30	21:47:30	00:07:30			PMD/S742074						08:21:00	0	5.25
WELGEDAG	8881	17	CONTAINER	PERDEKOP	21:58:30	21:58:30	00:11:00			PMD/S742074						08:21:00	0	4.54
WELGEDAG	8881	18	CONTAINER	ELANDSPOORT	22:05:30	22:05:30	00:07:00			PMD/S742074						08:21:00	0	5
WELGEDAG	8881	18	CONTAINER	PALMFORD	22:12:30	22:12:30	00:07:00			PMD/S742074						08:21:00	0	3.43
WELGEDAG	8881	19	CONTAINER	MAJUBAKRAGSTASIE	22:14:00	22:14:00	00:01:30			PMD/S742074						08:21:00	0	23
WELGEDAG	8881	20	NORTH	PMD/S742074	23:21:00	00:00:00	01:07:00		RT	PMD/S742074						08:21:00	0	0.97
`;

describe('a tenth extract: three origins, and the first over-count that is not a fabrication', () => {
  const all = parseRunningTimes(B10);
  const byId = (id: string) => all.find((t) => t.train === id)!;
  type Sched = ReturnType<typeof byId>;
  const declared = (t: Sched) =>
    t.rows.reduce((n, r) => n + (r.pointToPointRuntime ?? 0), 0) +
    t.rows.reduce((n, r) => n + (r.standingTime ?? 0), 0);
  const stations = (t: Sched) => t.rows.map((r) => r.station);

  /**
   * Thirty-six trains across WELGEDAG, WELLINGTON and WINBURG.
   *
   * This is a PARTIAL capture of the supplied WELGEDAG page, not the whole of
   * it. Only trains transcribed verbatim while the source text was in view are
   * here; the remainder has not been read and is not represented. The count is
   * a count of what was captured, and nothing in this block should be read as
   * a statement about WELGEDAG as a whole.
   */
  it('reads thirty-six trains across three origins', () => {
    expect(all).toHaveLength(36);
    expect(new Set(all.map((t) => t.origin))).toEqual(
      new Set(['WELGEDAG', 'WELLINGTON', 'WINBURG']),
    );
    expect(all.reduce((n, t) => n + t.rows.length, 0)).toBe(422 - 36);
    expect(all.every(hasSummary)).toBe(true);
  });

  /**
   * parseRunningTimes keys on the TRAIN NUMBER alone, not on (origin, train).
   *
   * That is safe here only because no number is shared between the three
   * origins. It is not safe in general: a page covering two origins that both
   * work a train 8219 would silently merge them into one schedule with two
   * destinations. Asserted so the day that stops being true, a test says so
   * rather than the merge passing quietly.
   */
  it('has no train number shared between two origins, which is why the number-keyed map holds', () => {
    const numbers = all.map((t) => t.train);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  /** Thirty-four of thirty-six reconcile exactly; the two that do not are named below. */
  it('ties thirty-four of thirty-six on the clock', () => {
    const adrift = all
      .filter((t) => !validateSchedule(t).elapsedIdentityHolds || !validateSchedule(t).throughputTies)
      .map((t) => t.train)
      .sort();
    expect(adrift).toEqual(['1268', '8883']);
  });

  /**
   * 1268 arrives at 08:07:30 and the summary calls the run 01:02:00.
   *
   * The clocks say 62 minutes 30 seconds. The stated figure is not wrong by a
   * rounding error in either direction — it is the elapsed time TRUNCATED to
   * the whole minute, and it is short by exactly the half minute the arrival
   * carries. The node rows add up to the full 62.5, so the discrepancy lives
   * in the summary column alone.
   */
  it('truncates the 1268 stated runtime to the whole minute', () => {
    const t = byId('1268');
    expect(t.destinationArrival).toBe(8 * 60 + 7.5);
    expect(elapsedMinutes(t)).toBe(62.5);
    expect(t.throughputRuntime).toBe(62);
    expect(elapsedMinutes(t)! - t.throughputRuntime).toBe(0.5);
    // The rows themselves are complete: only the summary is short.
    expect(declared(t)).toBe(62.5);
    expect(validateSchedule(t).elapsedIdentityHolds).toBe(true);
    expect(validateSchedule(t).throughputTies).toBe(false);
  });

  /**
   * 8883 over-counts by EXACTLY one day, and the row responsible runs backwards.
   *
   * BALFOURNORTH is recorded as arriving 18:29:00 and departing 18:24:00 —
   * five minutes before it got there — with a standing time of 23:55:00. The
   * source computed (departure - arrival) modulo 24 hours: minus five minutes
   * became 1435, and the train is credited with 1440 minutes it never spent.
   *
   * This is the first time the over-count guard has fired on supplied text.
   * It matters that it is distinguishable from the fabrication it was written
   * to catch: an invented row over-counts by an arbitrary amount, whereas this
   * is exactly 1440 and the offending row is visible in the source. The guard
   * below is therefore made SHARPER, not weaker.
   */
  it('over-counts 8883 by exactly one day, and the row that does it departs before it arrives', () => {
    const t = byId('8883');
    const elapsed = elapsedMinutes(t)!;
    expect(declared(t) - elapsed).toBe(1440);

    const backwards = t.rows.filter(
      (r, i) =>
        r.arrival != null &&
        r.departure != null &&
        !(i === t.rows.length - 1 && r.departure === 0 && r.standingTime == null) &&
        r.departure < r.arrival,
    );
    expect(backwards.map((r) => r.station)).toEqual(['BALFOURNORTH']);
    const bad = backwards[0];
    expect(bad.arrival).toBe(18 * 60 + 29);
    expect(bad.departure).toBe(18 * 60 + 24);
    expect(bad.standingTime).toBe(1435);
    expect(bad.standingTime! + (bad.arrival! - bad.departure!)).toBe(1440);
  });

  /**
   * The standing check cannot see it, because it wraps the same way the source did.
   *
   * validateSchedule measures standing as (departure - arrival + 1440) % 1440,
   * which for this row returns 1435 — precisely the figure recorded. Two
   * modular readings agreeing is not the same as a correct one, and the error
   * survives into the elapsed identity untouched. Worth pinning: it is the
   * reason a per-row check passing is not evidence that a train reconciles.
   */
  it('hides the 8883 defect from the standing check, which wraps the same way the source did', () => {
    const v = validateSchedule(byId('8883'));
    expect(v.standingMismatches).toEqual([]);
    expect(v.runtimeMismatches).toEqual([]);
    expect(v.elapsedIdentityHolds).toBe(false);
  });

  /**
   * The sharpened guard.
   *
   * A train may over-count ONLY if the excess is exactly one day and it
   * contains a row whose departure precedes its arrival. Anything else — an
   * arbitrary surplus, or a surplus with no backwards row to explain it — is
   * the signature of a row that was written rather than read, and fails here.
   */
  it('admits an over-count only when it is exactly one day and a row runs backwards', () => {
    for (const t of all) {
      const elapsed = elapsedMinutes(t);
      if (elapsed == null) continue;
      const surplus = declared(t) - elapsed;
      if (surplus <= 0) continue;
      const backwards = t.rows.some(
        (r, i) =>
          r.arrival != null &&
          r.departure != null &&
          !(i === t.rows.length - 1 && r.departure === 0 && r.standingTime == null) &&
          r.departure < r.arrival,
      );
      expect([t.train, surplus, backwards]).toEqual([t.train, 1440, true]);
    }
  });

  /**
   * 8205, 8215, 8219 and 8407 are one path run four times.
   *
   * Every node, every clock, every standing time and every reason is identical
   * across all four. The only thing that separates them is the train type:
   * three are vacuum trains, 8407 is medium heavy. Four numbers, one slot.
   */
  it('runs 8205, 8215, 8219 and 8407 over identical clocks and separates them only by train type', () => {
    const quad = ['8205', '8215', '8219', '8407'].map(byId);
    const shape = (t: Sched) =>
      t.rows.map((r) => [r.nodeSeq, r.corridor, r.station, r.arrival, r.departure,
        r.pointToPointRuntime, r.standingTime, r.standingReason, r.distanceKm]);
    for (const t of quad) {
      expect([t.train, shape(t)]).toEqual([t.train, shape(quad[0])]);
      expect(t.destination).toBe('WITBANK');
      expect(t.throughputRuntime).toBe(109);
    }
    expect(quad.map((t) => t.trainType)).toEqual([
      'VACUUM TRAINS/VACUUM TRAIN',
      'VACUUM TRAINS/VACUUM TRAIN',
      'VACUUM TRAINS/VACUUM TRAIN',
      'MEDIUM HEAVY/MEDIUM HEAVY',
    ]);
  });

  /**
   * The weighbridge reason is spelled two ways, and sits on two different nodes.
   *
   * Thirteen rows read WEIGHBRIDGE and carry it on ELF/S766011, the weighbridge
   * siding itself. Two rows — 8816 and 8838 — read WEIGH BRIDGE with a space
   * and hang it on ELOFF, the station after it, leaving their ELF/S766011 row
   * with no reason at all. Matching on the string alone finds thirteen of
   * fifteen; matching on the station finds thirteen of fifteen too, and a
   * different thirteen.
   */
  it('spells the weighbridge reason two ways, on two different nodes', () => {
    const weigh = all.flatMap((t) =>
      t.rows.filter((r) => (r.standingReason ?? '').toUpperCase().includes('WEIGH'))
        .map((r) => ({ train: t.train, station: r.station, reason: r.standingReason })),
    );
    expect(weigh).toHaveLength(15);
    const oneWord = weigh.filter((w) => w.reason === 'WEIGHBRIDGE');
    const twoWord = weigh.filter((w) => w.reason === 'WEIGH BRIDGE');
    expect(oneWord).toHaveLength(13);
    expect(twoWord).toHaveLength(2);
    expect(new Set(oneWord.map((w) => w.station))).toEqual(new Set(['ELF/S766011']));
    expect(new Set(twoWord.map((w) => w.station))).toEqual(new Set(['ELOFF']));
    expect(twoWord.map((w) => w.train).sort()).toEqual(['8816', '8838']);
  });

  /**
   * 48894 runs out to OGIES and comes back down its own path.
   *
   * Five stations are visited twice — KENDAL, ARBOR, ARGENT, DRYDEN, DELMAS —
   * in reverse order on the return, before the train carries on to SILICA and
   * HAWERKLIP. A station list is therefore not a set, and a node is not
   * identified by its name: the second DELMAS is 110 minutes after the first.
   */
  it('sends 48894 out to OGIES and back down its own path', () => {
    const t = byId('48894');
    const names = stations(t);
    const twice = [...new Set(names)].filter(
      (n) => names.filter((m) => m === n).length === 2,
    );
    expect(twice.sort()).toEqual(['ARBOR', 'ARGENT', 'DELMAS', 'DRYDEN', 'KENDAL']);
    const out = names.indexOf('OGIES');
    expect(names.slice(out - 5, out)).toEqual(['DELMAS', 'DRYDEN', 'ARGENT', 'ARBOR', 'KENDAL']);
    expect(names.slice(out + 1, out + 6)).toEqual(['KENDAL', 'ARBOR', 'ARGENT', 'DRYDEN', 'DELMAS']);
    const delmas = t.rows.filter((r) => r.station === 'DELMAS').map((r) => r.arrival!);
    expect(delmas[1] - delmas[0]).toBe(110);
    expect(validateSchedule(t).elapsedIdentityHolds).toBe(true);
  });

  /**
   * 8870 stops at ELOFF for no time at all, and the export records nothing.
   *
   * Arrival and departure are both 00:20:45 — the same instant as the previous
   * row's departure from the weighbridge — and both the runtime and standing
   * columns are blank. Not zero: blank. The train still ties, because there is
   * genuinely nothing to count.
   */
  it('leaves the 8870 ELOFF row with no elapsed time and no recorded value', () => {
    const t = byId('8870');
    const eloff = t.rows.find((r) => r.station === 'ELOFF')!;
    expect(eloff.arrival).toBe(eloff.departure);
    expect(eloff.pointToPointRuntime).toBeNull();
    expect(eloff.standingTime).toBeNull();
    const prior = t.rows[t.rows.indexOf(eloff) - 1];
    expect(prior.station).toBe('ELF/S766011');
    expect(prior.departure).toBe(eloff.arrival);
    expect(validateSchedule(t).unrecordedTravel).toEqual([]);
    expect(validateSchedule(t).elapsedIdentityHolds).toBe(true);
  });

  /**
   * 9471 restarts its node sequence at 1 in the middle of the run.
   *
   * It reaches OGIES at node 8, stands twenty minutes, and the next row is
   * node 1 again. The sequence is a block number, not a row index, and this is
   * the clearest case of it yet: the same train carries two node 1s, two node
   * 2s and so on, 100 minutes apart.
   */
  it('restarts the 9471 node sequence mid-run', () => {
    const t = byId('9471');
    const seqs = t.rows.map((r) => r.nodeSeq);
    const restart = seqs.indexOf(1, 2);
    expect(restart).toBeGreaterThan(0);
    expect(t.rows[restart - 1].station).toBe('OGIES');
    expect(t.rows[restart - 1].standingTime).toBe(20);
    expect(t.rows[restart].station).toBe('SAAIWATER');
    expect(seqs.filter((n) => n === 1)).toHaveLength(2);
    expect(validateSchedule(t).elapsedIdentityHolds).toBe(true);
  });

  /**
   * The 8838 terminus has no distance at all.
   *
   * Every other row in the extract carries a distance; the final RTI/S843083
   * row leaves the column empty. Read as zero it is invisible, so distance
   * totals for this train understate the journey by an unknown amount rather
   * than by nothing.
   */
  it('leaves the 8838 terminus without a distance', () => {
    const t = byId('8838');
    const last = t.rows[t.rows.length - 1];
    expect(last.station).toBe('RTI/S843083');
    expect(last.distanceKm).toBeNull();
    const missing = all.flatMap((s) =>
      s.rows.filter((r) => r.distanceKm == null).map((r) => `${s.train}:${r.station}`),
    );
    expect(missing).toEqual(['8838:RTI/S843083']);
  });

  /**
   * WELLINGTON and WINBURG arrive complete and tie without exception.
   *
   * Four trains between them, every one with a summary row, every one
   * reconciling. WINBURG is also the first origin seen whose trains open with
   * shunting rows that have no running time at all: 5002 begins with four
   * RANGEER moves around WGR/S545392 and WGR/S545414, each a minute of
   * standing and no travel, before it leaves at all.
   */
  it('adds WELLINGTON and WINBURG as origins that tie completely', () => {
    const small = all.filter((t) => t.origin !== 'WELGEDAG');
    expect(small.map((t) => t.train)).toEqual(['7776', '9906', '5002', '8906']);
    for (const t of small) {
      const v = validateSchedule(t);
      expect([t.train, v.throughputTies, v.elapsedIdentityHolds]).toEqual([t.train, true, true]);
    }
    const t = byId('5002');
    expect(t.rows.slice(0, 4).map((r) => [r.station, r.pointToPointRuntime, r.standingTime, r.standingReason]))
      .toEqual([
        ['WGR/S545392', null, 1, 'RANGEER'],
        ['WGR/S545414', null, 1, 'RANGEER'],
        ['WGR/S545392', null, 1, 'RANGEER'],
        ['WINBURG', null, 1, 'RANGEER'],
      ]);
  });

  /**
   * WINBURG 5002 and 8906 are the same path on different days.
   *
   * Identical nodes, identical clocks, identical standing. They differ only in
   * frequency — 5002 runs NYNYNYN, 8906 runs NYYYYYY — in train type, in sched
   * band, and in two reason strings. Same slot, two bookings.
   */
  it('books WINBURG 5002 and 8906 over one path with different frequencies', () => {
    const a = byId('5002');
    const b = byId('8906');
    const clocks = (t: Sched) => t.rows.map((r) => [r.station, r.arrival, r.departure]);
    expect(clocks(b)).toEqual(clocks(a));
    expect(a.throughputRuntime).toBe(b.throughputRuntime);
    expect([a.frequency, b.frequency]).toEqual(['NYNYNYN', 'NYYYYYY']);
    expect([a.trainType, b.trainType]).toEqual([
      'VACUUM TRAINS/FEEDER TRAIN',
      'MEDIUM HEAVY/MEDIUM HEAVY',
    ]);
    expect([a.sched, b.sched]).toEqual([3, 2]);
  });

  /**
   * The frequency alphabet in this extract is Y, N and A — no C.
   *
   * Earlier extracts carried a C in the frequency string and it remains
   * unexplained. None appears here. C does occur in this extract, but in the
   * StandingReason column, which is a different field with a different
   * meaning, and the two must not be conflated.
   */
  it('uses only Y, N and A in the frequency column here, and C only as a reason', () => {
    const freqs = new Set(all.map((t) => t.frequency));
    expect([...freqs].sort()).toEqual([
      'AAAAAAA', 'NYNYNYN', 'NYYYYYY', 'YYYYAYY', 'YYYYYYY',
    ]);
    expect([...freqs].every((f) => /^[YNA]{7}$/.test(f))).toBe(true);
    const reasons = new Set(
      all.flatMap((t) => t.rows.map((r) => r.standingReason)).filter((r) => r),
    );
    expect(reasons.has('C')).toBe(true);
  });
});

const B11 = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
KGR-WATERVAL	3005	1	CENTRAL	KGR-WATERVAL		01:05:00				KASERNE	01:05:00	03:20:00	1	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	02:15:00	0	
KGR-WATERVAL	3005	1	CENTRAL	KRUGERSDORP	01:21:00	01:21:00	00:16:00		B	KASERNE						02:15:00	0	4.37
KGR-WATERVAL	3005	2	CENTRAL	WINDSORMINE	01:23:00	01:23:00	00:02:00			KASERNE						02:15:00	0	1.06
KGR-WATERVAL	3005	2	CENTRAL	LANWEN	01:24:00	01:24:00	00:01:00			KASERNE						02:15:00	0	1.37
KGR-WATERVAL	3005	2	CENTRAL	LUIPAARDSVLEI	01:26:00	01:26:00	00:02:00			KASERNE						02:15:00	0	1.9
KGR-WATERVAL	3005	3	CENTRAL	WITPOORTJIE	01:28:00	01:28:00	00:02:00			KASERNE						02:15:00	0	2.08
KGR-WATERVAL	3005	3	CONTAINER	PRINCESS	01:29:00	01:29:00	00:01:00			KASERNE						02:15:00	0	2.37
KGR-WATERVAL	3005	3	CONTAINER	HORISON	01:31:00	01:31:00	00:02:00			KASERNE						02:15:00	0	1.91
KGR-WATERVAL	3005	3	CENTRAL	ROODEPOORT	01:36:00	01:36:00	00:05:00			KASERNE						02:15:00	0	1.52
KGR-WATERVAL	3005	4	CONTAINER	GEORGINIA	01:38:00	01:38:00	00:02:00			KASERNE						02:15:00	0	1.35
KGR-WATERVAL	3005	4	CENTRAL	HAMBERG	01:40:00	01:40:00	00:02:00			KASERNE						02:15:00	0	1.38
KGR-WATERVAL	3005	4	CENTRAL	FLORIDA	01:42:00	01:42:00	00:02:00			KASERNE						02:15:00	0	2.25
KGR-WATERVAL	3005	4	CENTRAL	UNIFIED	01:44:00	01:44:00	00:02:00			KASERNE						02:15:00	0	1.42
KGR-WATERVAL	3005	4	CENTRAL	MARAISBURG	01:46:00	01:46:00	00:02:00			KASERNE						02:15:00	0	1.37
KGR-WATERVAL	3005	4	CENTRAL	BOSMONT	01:47:00	01:47:00	00:01:00			KASERNE						02:15:00	0	1.19
KGR-WATERVAL	3005	4	CENTRAL	NEWCLARE	01:48:00	01:48:00	00:01:00			KASERNE						02:15:00	0	1.2
KGR-WATERVAL	3005	4	CENTRAL	WESTBURY	01:49:00	01:49:00	00:01:00			KASERNE						02:15:00	0	0.66
KGR-WATERVAL	3005	4	CENTRAL	INDUSTRIA	01:50:00	01:50:00	00:01:00			KASERNE						02:15:00	0	1.75
KGR-WATERVAL	3005	4	CENTRAL	LLA-LANGLAAGTEWES	01:55:00	01:55:00	00:05:00			KASERNE						02:15:00	0	0.7
KGR-WATERVAL	3005	5	CENTRAL	LANGLAAGTE	02:00:00	02:30:00	00:05:00	00:30:00	SHUNT + TURN LOAD	KASERNE						02:15:00	0	0.39
KGR-WATERVAL	3005	6	CENTRAL	LLA-LANGLAAGTEWES	02:35:00	02:35:00	00:05:00			KASERNE						02:15:00	0	0.39
KGR-WATERVAL	3005	7	CENTRAL	PAARLSHOOP	02:45:00	02:45:00	00:10:00			KASERNE						02:15:00	0	2.56
KGR-WATERVAL	3005	7	CENTRAL	CROWN	02:57:00	02:57:00	00:12:00			KASERNE						02:15:00	0	2.39
KGR-WATERVAL	3005	8	CENTRAL	BOOYSENS	03:03:00	03:03:00	00:06:00			KASERNE						02:15:00	0	2.85
KGR-WATERVAL	3005	9	CONTAINER	KASERNE	03:20:00	00:00:00	00:17:00		RT	KASERNE						02:15:00	0	3.83
KGR-WATERVAL	3018	1	CENTRAL	KGR-WATERVAL		07:00:00				MAFIKENG	07:00:00	19:00:00	1	YYYAYYA	VACUUM TRAINS/VACUUM TRAIN	12:00:00	0	
KGR-WATERVAL	3018	1	CENTRAL	BATTERY	07:14:00	07:34:00	00:14:00	00:20:00	B SHUNT	MAFIKENG						12:00:00	0	6
KGR-WATERVAL	3018	2	CENTRAL	TARLTON	07:43:00	08:08:00	00:09:00	00:25:00	SHUNT	MAFIKENG						12:00:00	0	6.09
KGR-WATERVAL	3018	3	CENTRAL	ORIENT	08:18:00	08:18:00	00:10:00			MAFIKENG						12:00:00	0	9.3
KGR-WATERVAL	3018	3	CENTRAL	MOLONEY	08:28:00	08:28:00	00:10:00			MAFIKENG						12:00:00	0	2.2
KGR-WATERVAL	3018	3	CENTRAL	MAGALIESBURG	08:39:30	08:39:30	00:11:30			MAFIKENG						12:00:00	0	3.5
KGR-WATERVAL	3018	4	CENTRAL	SEEKMORE	08:39:30	08:39:30				MAFIKENG						12:00:00	0	5.29
KGR-WATERVAL	3018	4	CENTRAL	WATERSHED	08:39:30	08:39:30				MAFIKENG						12:00:00	0	2.1
KGR-WATERVAL	3018	4	CENTRAL	VLAKDRIF	08:57:00	08:57:00	00:17:30			MAFIKENG						12:00:00	0	3.1
KGR-WATERVAL	3018	4	CENTRAL	BREETSVLEI	08:57:00	08:57:00				MAFIKENG						12:00:00	0	6.59
KGR-WATERVAL	3018	4	CENTRAL	SYFERBULT	09:06:00	09:06:00	00:09:00			MAFIKENG						12:00:00	0	5.2
KGR-WATERVAL	3018	5	CENTRAL	BOONS	09:24:00	09:30:00	00:18:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	10.3
KGR-WATERVAL	3018	6	CENTRAL	BNS/S754935	09:31:00	09:37:30	00:01:00	00:06:30	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	3018	7	CENTRAL	BOONS	09:38:30	09:44:00	00:01:00	00:05:30	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	3018	8	CENTRAL	MIDDELLAAGTE	09:54:00	09:54:00	00:10:00			MAFIKENG						12:00:00	0	3.79
KGR-WATERVAL	3018	8	CENTRAL	METZ	10:03:00	10:08:00	00:09:00	00:05:00	SHUNT	MAFIKENG						12:00:00	0	7.79
KGR-WATERVAL	3018	8	CENTRAL	DERBY	10:19:00	10:25:00	00:11:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	9
KGR-WATERVAL	3018	9	CENTRAL	DBY/S754102	10:26:00	10:32:00	00:01:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	3018	10	CENTRAL	DERBY	10:33:00	10:39:00	00:01:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	3018	11	CENTRAL	DESSING	10:50:00	10:50:00	00:11:00			MAFIKENG						12:00:00	0	5.59
KGR-WATERVAL	3018	11	CENTRAL	SKERMUTSELING	10:55:00	10:55:00	00:05:00			MAFIKENG						12:00:00	0	3.89
KGR-WATERVAL	3018	11	CENTRAL	KOSTER	11:03:00	11:23:00	00:08:00	00:20:00	SHUNT	MAFIKENG						12:00:00	0	6.59
KGR-WATERVAL	3018	12	CENTRAL	CHIDIMA	11:42:30	11:42:30	00:19:30			MAFIKENG						12:00:00	0	13
KGR-WATERVAL	3018	12	CENTRAL	KLIPBANKFONTE	12:07:00	12:12:00	00:24:30	00:05:00	SHUNT	MAFIKENG						12:00:00	0	10.65
KGR-WATERVAL	3018	12	CENTRAL	SWARTRUGGENS	12:30:00	13:05:00	00:18:00	00:35:00	SHUNT LOCO CHANGE	MAFIKENG						12:00:00	0	12
KGR-WATERVAL	3018	1	CENTRAL	SWU/S749583	13:06:00	13:51:00	00:01:00	00:45:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	3018	2	CENTRAL	SWARTRUGGENS	13:52:00	14:30:00	00:01:00	00:38:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	3018	3	CENTRAL	VLEIDRAAI	14:32:00	14:32:00	00:02:00			MAFIKENG						12:00:00	0	8.19
KGR-WATERVAL	3018	3	CENTRAL	RONDAWEL	14:32:00	14:32:00				MAFIKENG						12:00:00	0	6.5
KGR-WATERVAL	3018	3	CENTRAL	TWYFELSPOORT	14:59:30	14:59:30	00:27:30			MAFIKENG						12:00:00	0	4.79
KGR-WATERVAL	3018	3	CENTRAL	MANGOPE	14:59:30	14:59:30				MAFIKENG						12:00:00	0	5.59
KGR-WATERVAL	3018	3	CENTRAL	GROOTMARICO	15:25:00	15:40:00	00:25:30	00:15:00	SHUNT	MAFIKENG						12:00:00	0	6.2
KGR-WATERVAL	3018	3	CENTRAL	MARICOWES	15:47:00	15:47:00	00:07:00			MAFIKENG						12:00:00	0	1.6
KGR-WATERVAL	3018	3	CENTRAL	WILGEBOOMSPRU	15:59:00	15:59:00	00:12:00			MAFIKENG						12:00:00	0	10.9
KGR-WATERVAL	3018	3	CENTRAL	VAALKOP	15:59:00	15:59:00				MAFIKENG						12:00:00	0	5.9
KGR-WATERVAL	3018	3	CENTRAL	WOODBINE	16:09:00	16:09:00	00:10:00			MAFIKENG						12:00:00	0	2.79
KGR-WATERVAL	3018	3	CENTRAL	RENBAAN	16:09:00	16:09:00				MAFIKENG						12:00:00	0	5.7
KGR-WATERVAL	3018	3	CENTRAL	ZEERUST	16:33:00	16:33:00	00:24:00			MAFIKENG						12:00:00	0	10.4
KGR-WATERVAL	3018	4	CENTRAL	LUCERNE	16:52:00	16:58:00	00:19:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	11.59
KGR-WATERVAL	3018	5	CENTRAL	LUC/S745839	16:59:00	17:09:00	00:01:00	00:10:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	3018	6	CENTRAL	LUCERNE	17:10:00	17:20:00	00:01:00	00:10:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	3018	7	CENTRAL	SENDELINGSPOS	17:34:00	17:41:00	00:14:00	00:07:00		MAFIKENG						12:00:00	0	4.29
KGR-WATERVAL	3018	7	CENTRAL	BUFFELSHOEK	17:41:00	17:41:00				MAFIKENG						12:00:00	0	3.79
KGR-WATERVAL	3018	7	CENTRAL	WINDHEUWEL	17:41:00	17:41:00				MAFIKENG						12:00:00	0	5.29
KGR-WATERVAL	3018	7	CENTRAL	OTTOSHOOP	17:48:00	17:48:00	00:07:00			MAFIKENG						12:00:00	0	5.2
KGR-WATERVAL	3018	7	CENTRAL	SEEKOEI	17:50:00	17:50:00	00:02:00			MAFIKENG						12:00:00	0	6
KGR-WATERVAL	3018	7	CENTRAL	SLURRY	18:05:00	18:06:00	00:15:00	00:01:00	SHUNT	MAFIKENG						12:00:00	0	8.4
KGR-WATERVAL	3018	8	CENTRAL	SLR/S749044	18:07:00	18:10:00	00:01:00	00:03:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	3018	9	CENTRAL	SLR/S730114	18:11:00	18:14:00	00:01:00	00:03:00	SHUNT	MAFIKENG						12:00:00	0	0.47
KGR-WATERVAL	3018	10	CENTRAL	SLURRY	18:15:00	18:18:00	00:01:00	00:03:00	SHUNT	MAFIKENG						12:00:00	0	0.5
KGR-WATERVAL	3018	11	CENTRAL	BUHRMANNSDRIF	18:24:00	18:29:00	00:06:00	00:05:00	SHUNT	MAFIKENG						12:00:00	0	4.79
KGR-WATERVAL	3018	12	CENTRAL	COWANSPOST	18:34:00	18:34:00	00:05:00			MAFIKENG						12:00:00	0	4.29
KGR-WATERVAL	3018	12	CENTRAL	MACMULLINS	18:34:00	18:34:00				MAFIKENG						12:00:00	0	6.29
KGR-WATERVAL	3018	12	CENTRAL	MAFIKENG	19:00:00	00:00:00	00:26:00		FD	MAFIKENG						12:00:00	0	6.2
KGR-WATERVAL	3333	1	CENTRAL	KGR-WATERVAL		06:00:00				WELGEDAG	06:00:00	10:40:00	2	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	04:40:00	0	
KGR-WATERVAL	3333	1	CENTRAL	KRUGERSDORP	06:12:00	06:12:00	00:12:00		B	WELGEDAG						04:40:00	0	4.37
KGR-WATERVAL	3333	2	CENTRAL	WINDSORMINE	06:14:00	06:14:00	00:02:00			WELGEDAG						04:40:00	0	1.06
KGR-WATERVAL	3333	2	CENTRAL	LANWEN	06:16:00	06:16:00	00:02:00			WELGEDAG						04:40:00	0	1.37
KGR-WATERVAL	3333	2	CENTRAL	LUIPAARDSVLEI	06:17:00	06:17:00	00:01:00			WELGEDAG						04:40:00	0	1.9
KGR-WATERVAL	3333	3	CENTRAL	WITPOORTJIE	06:20:00	06:20:00	00:03:00			WELGEDAG						04:40:00	0	2.08
KGR-WATERVAL	3333	3	CONTAINER	PRINCESS	06:22:00	06:22:00	00:02:00			WELGEDAG						04:40:00	0	2.37
KGR-WATERVAL	3333	3	CONTAINER	HORISON	06:25:00	06:25:00	00:03:00			WELGEDAG						04:40:00	0	1.91
KGR-WATERVAL	3333	3	CENTRAL	ROODEPOORT	06:27:00	08:37:00	00:02:00	02:10:00	SHUNT	WELGEDAG						04:40:00	0	1.52
KGR-WATERVAL	3333	4	CONTAINER	GEORGINIA	08:39:00	08:39:00	00:02:00			WELGEDAG						04:40:00	0	1.35
KGR-WATERVAL	3333	4	CENTRAL	HAMBERG	08:41:00	08:41:00	00:02:00			WELGEDAG						04:40:00	0	1.38
KGR-WATERVAL	3333	4	CENTRAL	FLORIDA	08:43:00	08:43:00	00:02:00			WELGEDAG						04:40:00	0	2.25
KGR-WATERVAL	3333	4	CENTRAL	UNIFIED	08:45:00	08:45:00	00:02:00			WELGEDAG						04:40:00	0	1.42
KGR-WATERVAL	3333	4	CENTRAL	MARAISBURG	08:47:00	08:47:00	00:02:00			WELGEDAG						04:40:00	0	1.37
KGR-WATERVAL	3333	4	CENTRAL	BOSMONT	08:48:00	08:48:00	00:01:00			WELGEDAG						04:40:00	0	1.19
KGR-WATERVAL	3333	4	CENTRAL	NEWCLARE	08:49:00	08:49:00	00:01:00			WELGEDAG						04:40:00	0	1.2
KGR-WATERVAL	3333	4	CENTRAL	WESTBURY	08:49:00	08:49:00				WELGEDAG						04:40:00	0	0.66
KGR-WATERVAL	3333	4	CENTRAL	INDUSTRIA	08:51:00	08:51:00	00:02:00			WELGEDAG						04:40:00	0	1.75
KGR-WATERVAL	3333	4	CENTRAL	LLA-LANGLAAGTEWES	08:52:00	08:52:00	00:01:00			WELGEDAG						04:40:00	0	0.7
KGR-WATERVAL	3333	5	CENTRAL	PAARLSHOOP	08:58:00	08:58:00	00:06:00			WELGEDAG						04:40:00	0	2.56
KGR-WATERVAL	3333	5	CENTRAL	CROWN	09:04:00	09:04:00	00:06:00			WELGEDAG						04:40:00	0	2.39
KGR-WATERVAL	3333	6	CENTRAL	BOOYSENS	09:09:00	09:09:00	00:05:00			WELGEDAG						04:40:00	0	2.85
KGR-WATERVAL	3333	7	CONTAINER	KASERNE	09:21:00	09:21:00	00:12:00			WELGEDAG						04:40:00	0	3.83
KGR-WATERVAL	3333	8	CONTAINER	KAZ-CITYDEEP	09:25:27	09:25:27	00:04:27			WELGEDAG						04:40:00	0	1.85
KGR-WATERVAL	3333	9	CONTAINER	JUPITER	09:30:00	09:30:00	00:04:33			WELGEDAG						04:40:00	0	2.5
KGR-WATERVAL	3333	10	CENTRAL	DRIEHOEK	09:38:00	09:38:00	00:08:00			WELGEDAG						04:40:00	0	3.2
KGR-WATERVAL	3333	11	CONTAINER	PRESIDENT	09:41:00	09:41:00	00:03:00			WELGEDAG						04:40:00	0	1.08
KGR-WATERVAL	3333	12	CENTRAL	GERMISTON	09:45:00	09:45:00	00:04:00			WELGEDAG						04:40:00	0	1.08
KGR-WATERVAL	3333	13	CENTRAL	GMR-OOS	09:46:00	09:46:00	00:01:00			WELGEDAG						04:40:00	0	1.6
KGR-WATERVAL	3333	14	CENTRAL	DELMORE	09:48:00	09:48:00	00:02:00			WELGEDAG						04:40:00	0	1.94
KGR-WATERVAL	3333	15	CENTRAL	ANGELO	09:51:00	09:51:00	00:03:00			WELGEDAG						04:40:00	0	1.52
KGR-WATERVAL	3333	16	CENTRAL	OOSRAND	09:55:00	09:55:00	00:04:00			WELGEDAG						04:40:00	0	2.14
KGR-WATERVAL	3333	17	CENTRAL	BOKSBURG	09:59:00	09:59:00	00:04:00			WELGEDAG						04:40:00	0	1.15
KGR-WATERVAL	3333	17	CENTRAL	BOKSBURGOOS	10:04:00	10:04:00	00:05:00			WELGEDAG						04:40:00	0	1.86
KGR-WATERVAL	3333	18	CENTRAL	DUNSWART	10:08:00	10:08:00	00:04:00			WELGEDAG						04:40:00	0	2.58
KGR-WATERVAL	3333	19	CENTRAL	BENONI	10:14:00	10:14:00	00:06:00			WELGEDAG						04:40:00	0	2.85
KGR-WATERVAL	3333	20	CENTRAL	NEWKLEINFONTE	10:16:00	10:16:00	00:02:00			WELGEDAG						04:40:00	0	1.66
KGR-WATERVAL	3333	20	NORTH	APEX	10:19:00	10:19:00	00:03:00			WELGEDAG						04:40:00	0	2.33
KGR-WATERVAL	3333	21	NORTH	MODREA	10:26:00	10:26:00	00:07:00			WELGEDAG						04:40:00	0	5.5
KGR-WATERVAL	3333	21	NORTH	GEDULD	10:33:00	10:33:00	00:07:00			WELGEDAG						04:40:00	0	6
KGR-WATERVAL	3333	22	NORTH	WELGEDAG	10:40:00	00:00:00	00:07:00		RT	WELGEDAG						04:40:00	0	5.8
KGR-WATERVAL	3904	1	CENTRAL	KGR-WATERVAL		08:45:00				KGR-WATERVAL	08:45:00	10:40:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	01:55:00	0	
KGR-WATERVAL	3904	1	CENTRAL	WAV/S761044	08:50:00	08:55:00	00:05:00	00:05:00	RANGEER	KGR-WATERVAL						01:55:00	0	0.97
KGR-WATERVAL	3904	1	CENTRAL	WAV/S761168	09:00:00	09:05:00	00:05:00	00:05:00	RANGEER	KGR-WATERVAL						01:55:00	0	0.1
KGR-WATERVAL	3904	1	CENTRAL	KGR-WAV-NUWEWERKE	09:10:00	09:15:00	00:05:00	00:05:00	RANGEER	KGR-WATERVAL						01:55:00	0	0.08
KGR-WATERVAL	3904	1	CENTRAL	WAV-SPOORDEP	09:20:00	09:25:00	00:05:00	00:05:00	RANGEER	KGR-WATERVAL						01:55:00	0	1
KGR-WATERVAL	3904	1	CENTRAL	WAV-HERSTEL	09:30:00	09:35:00	00:05:00	00:05:00	RANGEER	KGR-WATERVAL						01:55:00	0	0.1
KGR-WATERVAL	3904	1	CENTRAL	WAV/S761877	09:40:00	09:45:00	00:05:00	00:05:00	RANGEER	KGR-WATERVAL						01:55:00	0	0.07
KGR-WATERVAL	3904	2	CENTRAL	WAV-HERSTEL	09:50:00	09:55:00	00:05:00	00:05:00	RANGEER	KGR-WATERVAL						01:55:00	0	0.07
KGR-WATERVAL	3904	2	CENTRAL	WAV-SPOORDEP	10:00:00	10:05:00	00:05:00	00:05:00	RANGEER	KGR-WATERVAL						01:55:00	0	0.1
KGR-WATERVAL	3904	2	CENTRAL	KGR-WAV-NUWEWERKE	10:10:00	10:15:00	00:05:00	00:05:00	RANGEER	KGR-WATERVAL						01:55:00	0	1
KGR-WATERVAL	3904	2	CENTRAL	WAV/S761168	10:20:00	10:25:00	00:05:00	00:05:00	RANGEER	KGR-WATERVAL						01:55:00	0	0.08
KGR-WATERVAL	3904	2	CENTRAL	WAV/S761044	10:30:00	10:35:00	00:05:00	00:05:00	RANGEER	KGR-WATERVAL						01:55:00	0	0.1
KGR-WATERVAL	3904	2	CENTRAL	KGR-WATERVAL	10:40:00	00:00:00	00:05:00			KGR-WATERVAL						01:55:00	0	0.97
KGR-WATERVAL	3905	1	CENTRAL	KGR-WATERVAL		11:30:00				KRUGERSDORP	11:30:00	11:43:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:13:00	0	
KGR-WATERVAL	3905	1	CENTRAL	KRUGERSDORP	11:43:00	00:00:00	00:13:00		B RT	KRUGERSDORP						00:13:00	0	4.37
KGR-WATERVAL	3907	1	CENTRAL	KGR-WATERVAL		17:30:00				KRUGERSDORP	17:30:00	17:43:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:13:00	0	
KGR-WATERVAL	3907	1	CENTRAL	KRUGERSDORP	17:43:00	00:00:00	00:13:00		B RT	KRUGERSDORP						00:13:00	0	4.37
KGR-WATERVAL	3909	1	CENTRAL	KGR-WATERVAL		23:30:00				KRUGERSDORP	23:30:00	23:43:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:13:00	0	
KGR-WATERVAL	3909	1	CENTRAL	KRUGERSDORP	23:43:00	00:00:00	00:13:00		B RT	KRUGERSDORP						00:13:00	0	4.37
KGR-WATERVAL	3911	1	CENTRAL	KGR-WATERVAL		04:30:00				KRUGERSDORP	04:30:00	04:43:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:13:00	0	
KGR-WATERVAL	3911	1	CENTRAL	KRUGERSDORP	04:43:00	00:00:00	00:13:00		B RT	KRUGERSDORP						00:13:00	0	4.37
KGR-WATERVAL	5964	1	CENTRAL	KGR-WATERVAL		12:31:00				SASOLBURG	12:31:00	16:29:00	2	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	03:58:00	0	
KGR-WATERVAL	5964	1	CENTRAL	KRUGERSDORP	12:43:00	12:43:00	00:12:00		B	SASOLBURG						03:58:00	0	4.37
KGR-WATERVAL	5964	2	CENTRAL	WINDSORMINE	12:43:00	12:43:00				SASOLBURG						03:58:00	0	1.06
KGR-WATERVAL	5964	2	CENTRAL	LANWEN	12:43:00	12:43:00				SASOLBURG						03:58:00	0	1.37
KGR-WATERVAL	5964	2	CENTRAL	LUIPAARDSVLEI	12:48:00	12:48:00	00:05:00			SASOLBURG						03:58:00	0	1.9
KGR-WATERVAL	5964	3	CENTRAL	WITPOORTJIE	12:48:00	12:48:00				SASOLBURG						03:58:00	0	2.08
KGR-WATERVAL	5964	3	CONTAINER	PRINCESS	12:48:00	12:48:00				SASOLBURG						03:58:00	0	2.37
KGR-WATERVAL	5964	3	CONTAINER	HORISON	12:48:00	12:48:00				SASOLBURG						03:58:00	0	1.91
KGR-WATERVAL	5964	3	CENTRAL	ROODEPOORT	12:58:00	12:58:00	00:10:00			SASOLBURG						03:58:00	0	1.52
KGR-WATERVAL	5964	4	CONTAINER	GEORGINIA	12:58:00	12:58:00				SASOLBURG						03:58:00	0	1.35
KGR-WATERVAL	5964	4	CENTRAL	HAMBERG	12:58:00	12:58:00				SASOLBURG						03:58:00	0	1.38
KGR-WATERVAL	5964	4	CENTRAL	FLORIDA	12:58:00	12:58:00				SASOLBURG						03:58:00	0	2.25
KGR-WATERVAL	5964	4	CENTRAL	UNIFIED	12:58:00	12:58:00				SASOLBURG						03:58:00	0	1.42
KGR-WATERVAL	5964	4	CENTRAL	MARAISBURG	13:08:00	13:08:00	00:10:00			SASOLBURG						03:58:00	0	1.37
KGR-WATERVAL	5964	4	CENTRAL	BOSMONT	13:08:00	13:08:00				SASOLBURG						03:58:00	0	1.19
KGR-WATERVAL	5964	4	CENTRAL	NEWCLARE	13:08:00	13:08:00				SASOLBURG						03:58:00	0	1.2
KGR-WATERVAL	5964	4	CENTRAL	WESTBURY	13:08:00	13:08:00				SASOLBURG						03:58:00	0	0.66
KGR-WATERVAL	5964	4	CENTRAL	INDUSTRIA	13:08:00	13:08:00				SASOLBURG						03:58:00	0	1.75
KGR-WATERVAL	5964	4	CENTRAL	LLA-LANGLAAGTEWES	13:14:00	13:14:00	00:06:00			SASOLBURG						03:58:00	0	0.7
KGR-WATERVAL	5964	5	CENTRAL	PAARLSHOOP	13:14:00	13:14:00				SASOLBURG						03:58:00	0	2.56
KGR-WATERVAL	5964	5	CENTRAL	CROWN	13:27:00	13:27:00	00:13:00			SASOLBURG						03:58:00	0	2.39
KGR-WATERVAL	5964	6	CENTRAL	BOOYSENS	13:35:00	13:35:00	00:08:00			SASOLBURG						03:58:00	0	2.85
KGR-WATERVAL	5964	7	CONTAINER	KASERNE	13:43:00	13:43:00	00:08:00			SASOLBURG						03:58:00	0	3.83
KGR-WATERVAL	5964	8	CONTAINER	KAZ-CITYDEEP	13:47:27	13:47:27	00:04:27			SASOLBURG						03:58:00	0	1.85
KGR-WATERVAL	5964	9	CONTAINER	JUPITER	13:52:00	13:59:00	00:04:33	00:07:00	SHUNT	SASOLBURG						03:58:00	0	2.5
KGR-WATERVAL	5964	10	CONTAINER	JUP/S752525	14:05:00	14:15:00	00:06:00	00:10:00	SHUNT	SASOLBURG						03:58:00	0	0.97
KGR-WATERVAL	5964	11	CONTAINER	JUPITER	14:20:00	14:26:00	00:05:00	00:06:00	SHUNT	SASOLBURG						03:58:00	0	0.97
KGR-WATERVAL	5964	12	CONTAINER	REFINERY	14:32:00	14:32:00	00:06:00			SASOLBURG						03:58:00	0	3.54
KGR-WATERVAL	5964	13	CONTAINER	GERMISTONSOUT	14:36:00	14:36:00	00:04:00			SASOLBURG						03:58:00	0	1.19
KGR-WATERVAL	5964	14	CONTAINER	GERMISTONLAKE	14:39:00	14:39:00	00:03:00			SASOLBURG						03:58:00	0	0.61
KGR-WATERVAL	5964	14	CONTAINER	WEBBER	14:40:00	14:40:00	00:01:00			SASOLBURG						03:58:00	0	0.88
KGR-WATERVAL	5964	14	CONTAINER	PARKHILL	14:42:00	14:42:00	00:02:00			SASOLBURG						03:58:00	0	1.12
KGR-WATERVAL	5964	14	CONTAINER	ELSBURG	14:44:00	14:44:00	00:02:00			SASOLBURG						03:58:00	0	0.7
KGR-WATERVAL	5964	15	CONTAINER	DALLAS	14:45:00	14:45:00	00:01:00			SASOLBURG						03:58:00	0	0.9
KGR-WATERVAL	5964	16	CONTAINER	WATTLES	14:48:00	14:48:00	00:03:00			SASOLBURG						03:58:00	0	1.53
KGR-WATERVAL	5964	16	CONTAINER	UNION	14:53:00	14:53:00	00:05:00			SASOLBURG						03:58:00	0	1.81
KGR-WATERVAL	5964	17	CONTAINER	NATALSPRUIT	15:00:00	15:00:00	00:07:00			SASOLBURG						03:58:00	0	4.42
KGR-WATERVAL	5964	18	CONTAINER	MPILISWENI	15:02:00	15:02:00	00:02:00			SASOLBURG						03:58:00	0	1.68
KGR-WATERVAL	5964	18	CONTAINER	ANGUS	15:08:00	15:08:00	00:06:00			SASOLBURG						03:58:00	0	3.75
KGR-WATERVAL	5964	18	CONTAINER	RANDWATER	15:14:00	15:14:00	00:06:00			SASOLBURG						03:58:00	0	4.51
KGR-WATERVAL	5964	19	CONTAINER	KLIPRIVIER	15:20:00	15:20:00	00:06:00			SASOLBURG						03:58:00	0	4.91
KGR-WATERVAL	5964	20	CENTRAL	SYBRAND	15:22:00	15:22:00	00:02:00			SASOLBURG						03:58:00	0	2.58
KGR-WATERVAL	5964	21	CONTAINER	SKANSDAM	15:24:00	15:24:00	00:02:00			SASOLBURG						03:58:00	0	2.58
KGR-WATERVAL	5964	21	CENTRAL	DALESIDE	15:27:00	15:27:00	00:03:00			SASOLBURG						03:58:00	0	2.62
KGR-WATERVAL	5964	22	CENTRAL	HENLYONKLIP	15:32:00	15:32:00	00:05:00			SASOLBURG						03:58:00	0	4.91
KGR-WATERVAL	5964	23	CENTRAL	MEYERTON	15:37:00	15:37:00	00:05:00			SASOLBURG						03:58:00	0	4.46
KGR-WATERVAL	5964	24	CENTRAL	KOOKRUS	15:43:00	15:43:00	00:06:00			SASOLBURG						03:58:00	0	3.91
KGR-WATERVAL	5964	24	CENTRAL	REDAN	15:48:00	15:48:00	00:05:00			SASOLBURG						03:58:00	0	5.11
KGR-WATERVAL	5964	25	CENTRAL	ALLOY	15:52:00	15:52:00	00:04:00			SASOLBURG						03:58:00	0	3.97
KGR-WATERVAL	5964	25	CENTRAL	VER-NOORD	15:55:00	15:55:00	00:03:00			SASOLBURG						03:58:00	0	1.55
KGR-WATERVAL	5964	26	CENTRAL	VEREENIGING	15:58:00	15:58:00	00:03:00			SASOLBURG						03:58:00	0	0.53
KGR-WATERVAL	5964	27	CENTRAL	VER-SUID	15:59:00	15:59:00	00:01:00			SASOLBURG						03:58:00	0	1
KGR-WATERVAL	5964	28	CENTRAL	VLC-VILJOENSD	16:09:00	16:09:00	00:10:00			SASOLBURG						03:58:00	0	1
KGR-WATERVAL	5964	29	CENTRAL	VEREST	16:17:00	16:17:00	00:08:00			SASOLBURG						03:58:00	0	6.09
KGR-WATERVAL	5964	29	CENTRAL	SASOLBURG	16:29:00	00:00:00	00:12:00		RT	SASOLBURG						03:58:00	0	8.22
KGR-WATERVAL	7224	1	CENTRAL	KGR-WATERVAL		23:00:00				KASERNE	23:00:00	14:15:00	1	YYYYYCY	VACUUM TRAINS/VACUUM TRAIN	15:15:00	0	
KGR-WATERVAL	7224	1	CENTRAL	KRUGERSDORP	23:12:00	01:12:00	00:12:00	02:00:00	C LOCO CHANGE	KASERNE						15:15:00	0	4.37
KGR-WATERVAL	7224	1	CENTRAL	WESRAND	01:15:00	01:15:00	00:03:00			KASERNE						15:15:00	1	2.33
KGR-WATERVAL	7224	1	CENTRAL	MILLSITE	01:17:00	01:17:00	00:02:00			KASERNE						15:15:00	1	2.2
KGR-WATERVAL	7224	1	CENTRAL	CENTRAL	01:18:30	01:18:30	00:01:30			KASERNE						15:15:00	1	1.61
KGR-WATERVAL	7224	1	CENTRAL	ROBINSON(T)	01:23:00	01:28:00	00:04:30	00:05:00	SHUNT	KASERNE						15:15:00	1	2.7
KGR-WATERVAL	7224	2	CENTRAL	HOMELAKE	01:32:00	01:32:00	00:04:00			KASERNE						15:15:00	1	3.64
KGR-WATERVAL	7224	2	CENTRAL	RANDFONTEIN	01:37:00	01:57:00	00:05:00	00:20:00	CRANKING	KASERNE						15:15:00	1	5.16
KGR-WATERVAL	7224	3	CENTRAL	MIDDELVLEI	02:09:00	02:09:00	00:12:00			KASERNE						15:15:00	1	13.41
KGR-WATERVAL	7224	4	CENTRAL	VLEIKOP	02:20:00	02:20:00	00:11:00			KASERNE						15:15:00	1	10.58
KGR-WATERVAL	7224	4	CENTRAL	BANK	02:32:30	02:47:00	00:12:30	00:14:30	CRANKING	KASERNE						15:15:00	1	14.35
KGR-WATERVAL	7224	5	CENTRAL	MAIZELANDS	02:57:30	02:57:30	00:10:30			KASERNE						15:15:00	1	11.68
KGR-WATERVAL	7224	5	CENTRAL	OBERHOLZER	03:06:00	03:21:00	00:08:30	00:15:00	CRANKING	KASERNE						15:15:00	1	7.8
KGR-WATERVAL	7224	6	CENTRAL	SPANUIT	03:33:30	03:33:30	00:12:30			KASERNE						15:15:00	1	14.3
KGR-WATERVAL	7224	7	CENTRAL	WELVERDIEND	03:37:30	03:48:00	00:04:00	00:10:30	CRANKING	KASERNE						15:15:00	1	4.3
KGR-WATERVAL	7224	8	CENTRAL	GATSRAND	04:02:00	04:02:00	00:14:00			KASERNE						15:15:00	1	14.5
KGR-WATERVAL	7224	9	CENTRAL	FREDERIKSTAD	04:10:30	04:10:30	00:08:30			KASERNE						15:15:00	1	9.18
KGR-WATERVAL	7224	9	CENTRAL	BOSKOP	04:16:30	04:16:30	00:06:00			KASERNE						15:15:00	1	6.46
KGR-WATERVAL	7224	10	CENTRAL	SAFARCAMP	04:28:30	04:28:30	00:12:00			KASERNE						15:15:00	1	12.48
KGR-WATERVAL	7224	11	CENTRAL	CACHET	04:31:00	04:31:00	00:02:30			KASERNE						15:15:00	1	2.56
KGR-WATERVAL	7224	12	CENTRAL	POTCHEFSTROOM	04:35:00	08:05:00	00:04:00	03:30:00	SHUNT TURN LOAD	KASERNE						15:15:00	1	2.6
KGR-WATERVAL	7224	1	CENTRAL	CACHET	08:06:00	08:11:00	00:01:00	00:05:00	CRANKING	KASERNE						15:15:00	1	2.6
KGR-WATERVAL	7224	2	CENTRAL	TARENTAAL	08:26:00	08:31:00	00:15:00	00:05:00	CRANKING	KASERNE						15:15:00	1	9.08
KGR-WATERVAL	7224	2	CENTRAL	KLIPDRIF	08:42:00	08:47:00	00:11:00	00:05:00	CRANKING	KASERNE						15:15:00	1	9.75
KGR-WATERVAL	7224	2	CENTRAL	ENSELSPRUIT	09:01:00	09:06:00	00:14:00	00:05:00	CRANKING	KASERNE						15:15:00	1	14.5
KGR-WATERVAL	7224	3	CENTRAL	FOCHVILLE	09:23:00	09:28:00	00:17:00	00:05:00	CRANKING	KASERNE						15:15:00	1	13.18
KGR-WATERVAL	7224	3	CENTRAL	MICHAELSRAAD	09:42:00	09:47:00	00:14:00	00:05:00	CRANKING	KASERNE						15:15:00	1	10.93
KGR-WATERVAL	7224	3	CENTRAL	RAATHSVLEI	09:53:00	09:53:00	00:06:00			KASERNE						15:15:00	1	4.88
KGR-WATERVAL	7224	4	CENTRAL	BLOEKOMHEUNING	09:54:00	09:59:00	00:01:00	00:05:00	CRANKING	KASERNE						15:15:00	1	7.78
KGR-WATERVAL	7224	4		VANDERBIJL	10:16:00	10:21:00	00:17:00	00:05:00	CRANKING	KASERNE						15:15:00	1	7.95
KGR-WATERVAL	7224	4	CENTRAL	VANDERBIJLPAR	10:22:00	10:27:00	00:01:00	00:05:00	CRANKING	KASERNE						15:15:00	1	1
KGR-WATERVAL	7224	4	CENTRAL	HOUTHEUWEL	10:34:00	10:39:00	00:07:00	00:05:00	CRANKING	KASERNE						15:15:00	1	5.34
KGR-WATERVAL	7224	5	CENTRAL	KLEIGROND	10:40:00	10:45:00	00:01:00	00:05:00	CRANKING	KASERNE						15:15:00	1	4.38
KGR-WATERVAL	7224	6	CENTRAL	LEEUHOF	10:56:00	11:01:00	00:11:00	00:05:00	CRANKING	KASERNE						15:15:00	1	3.06
KGR-WATERVAL	7224	7	CENTRAL	DUNCANVILLE	11:03:00	11:08:00	00:02:00	00:05:00	CRANKING	KASERNE						15:15:00	1	3.12
KGR-WATERVAL	7224	7	CENTRAL	VER-NOORD	11:10:00	11:15:00	00:02:00	00:05:00	CRANKING	KASERNE						15:15:00	1	0.98
KGR-WATERVAL	7224	8	CENTRAL	ALLOY	11:16:00	11:21:00	00:01:00	00:05:00	CRANKING	KASERNE						15:15:00	1	1.55
KGR-WATERVAL	7224	8	CENTRAL	REDAN	11:22:00	11:27:00	00:01:00	00:05:00	CRANKING	KASERNE						15:15:00	1	3.97
KGR-WATERVAL	7224	9	CENTRAL	KOOKRUS	11:29:00	11:34:00	00:02:00	00:05:00	CRANKING	KASERNE						15:15:00	1	5.11
KGR-WATERVAL	7224	9	CENTRAL	MEYERTON	11:36:00	11:41:00	00:02:00	00:05:00	CRANKING	KASERNE						15:15:00	1	3.91
KGR-WATERVAL	7224	10	CENTRAL	HENLYONKLIP	11:43:00	11:48:00	00:02:00	00:05:00	CRANKING	KASERNE						15:15:00	1	4.46
KGR-WATERVAL	7224	11	CENTRAL	DALESIDE	11:50:00	11:55:00	00:02:00	00:05:00	CRANKING	KASERNE						15:15:00	1	4.91
KGR-WATERVAL	7224	12	CONTAINER	SKANSDAM	11:56:00	12:01:00	00:01:00	00:05:00	CRANKING	KASERNE						15:15:00	1	2.62
KGR-WATERVAL	7224	12	CENTRAL	SYBRAND	12:02:00	12:07:00	00:01:00	00:05:00	CRANKING	KASERNE						15:15:00	1	2.58
KGR-WATERVAL	7224	13	CONTAINER	KLIPRIVIER	12:09:00	12:14:00	00:02:00	00:05:00	CRANKING	KASERNE						15:15:00	1	2.58
KGR-WATERVAL	7224	14	CONTAINER	RANDWATER	12:17:00	12:22:00	00:03:00	00:05:00	CRANKING	KASERNE						15:15:00	1	4.91
KGR-WATERVAL	7224	15	CONTAINER	ANGUS	12:25:00	12:30:00	00:03:00	00:05:00	CRANKING	KASERNE						15:15:00	1	4.51
KGR-WATERVAL	7224	15	CONTAINER	MPILISWENI	12:32:00	12:37:00	00:02:00	00:05:00	CRANKING	KASERNE						15:15:00	1	3.75
KGR-WATERVAL	7224	15	CONTAINER	NATALSPRUIT	12:40:00	12:45:00	00:03:00	00:05:00	CRANKING	KASERNE						15:15:00	1	1.68
KGR-WATERVAL	7224	16	CONTAINER	UNION	12:49:00	12:54:00	00:04:00	00:05:00	CRANKING	KASERNE						15:15:00	1	4.42
KGR-WATERVAL	7224	17	CONTAINER	WATTLES	12:57:00	13:02:00	00:03:00	00:05:00	CRANKING	KASERNE						15:15:00	1	1.81
KGR-WATERVAL	7224	17	CONTAINER	DALLAS	13:05:00	13:10:00	00:03:00	00:05:00	CRANKING	KASERNE						15:15:00	1	1.53
KGR-WATERVAL	7224	18	CONTAINER	ELSBURG	13:13:00	13:18:00	00:03:00	00:05:00	CRANKING	KASERNE						15:15:00	1	0.9
KGR-WATERVAL	7224	19	CONTAINER	PARKHILL	13:21:00	13:26:00	00:03:00	00:05:00	CRANKING	KASERNE						15:15:00	1	0.7
KGR-WATERVAL	7224	19	CONTAINER	WEBBER	13:30:00	13:35:00	00:04:00	00:05:00	CRANKING	KASERNE						15:15:00	1	1.12
KGR-WATERVAL	7224	19	CONTAINER	GERMISTONLAKE	13:38:00	13:43:00	00:03:00	00:05:00	CRANKING	KASERNE						15:15:00	1	0.88
KGR-WATERVAL	7224	19	CONTAINER	GERMISTONSOUT	13:46:00	13:51:00	00:03:00	00:05:00	CRANKING	KASERNE						15:15:00	1	0.61
KGR-WATERVAL	7224	20	CONTAINER	REFINERY	13:54:00	13:59:00	00:03:00	00:05:00	CRANKING	KASERNE						15:15:00	1	1.19
KGR-WATERVAL	7224	21	CONTAINER	JUPITER	14:02:00	14:07:00	00:03:00	00:05:00	CRANKING	KASERNE						15:15:00	1	3.54
KGR-WATERVAL	7224	22	CONTAINER	KAZ-CITYDEEP	14:10:32	14:10:32	00:03:32		CRANKING	KASERNE						15:15:00	1	2.5
KGR-WATERVAL	7224	23	CONTAINER	KASERNE	14:15:00	00:00:00	00:04:28		FD	KASERNE						15:15:00	1	1.85
KGR-WATERVAL	7226	1	CENTRAL	KGR-WATERVAL		09:00:00				MAFIKENG	09:00:00	21:00:00	1	YYYAYYA	VACUUM TRAINS/VACUUM TRAIN	12:00:00	0	
KGR-WATERVAL	7226	1	CENTRAL	BATTERY	09:14:00	09:34:00	00:14:00	00:20:00	B SHUNT	MAFIKENG						12:00:00	0	6
KGR-WATERVAL	7226	2	CENTRAL	TARLTON	09:43:00	10:08:00	00:09:00	00:25:00	SHUNT	MAFIKENG						12:00:00	0	6.09
KGR-WATERVAL	7226	3	CENTRAL	ORIENT	10:18:00	10:18:00	00:10:00			MAFIKENG						12:00:00	0	9.3
KGR-WATERVAL	7226	3	CENTRAL	MOLONEY	10:28:00	10:28:00	00:10:00			MAFIKENG						12:00:00	0	2.2
KGR-WATERVAL	7226	3	CENTRAL	MAGALIESBURG	10:39:30	10:39:30	00:11:30			MAFIKENG						12:00:00	0	3.5
KGR-WATERVAL	7226	4	CENTRAL	SEEKMORE	10:39:30	10:39:30				MAFIKENG						12:00:00	0	5.29
KGR-WATERVAL	7226	4	CENTRAL	WATERSHED	10:39:30	10:39:30				MAFIKENG						12:00:00	0	2.1
KGR-WATERVAL	7226	4	CENTRAL	VLAKDRIF	10:57:00	10:57:00	00:17:30			MAFIKENG						12:00:00	0	3.1
KGR-WATERVAL	7226	4	CENTRAL	BREETSVLEI	10:57:00	10:57:00				MAFIKENG						12:00:00	0	6.59
KGR-WATERVAL	7226	4	CENTRAL	SYFERBULT	11:06:00	11:06:00	00:09:00			MAFIKENG						12:00:00	0	5.2
KGR-WATERVAL	7226	5	CENTRAL	BOONS	11:24:00	11:30:00	00:18:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	10.3
KGR-WATERVAL	7226	6	CENTRAL	BNS/S754935	11:31:00	11:37:30	00:01:00	00:06:30	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7226	7	CENTRAL	BOONS	11:38:30	11:44:00	00:01:00	00:05:30	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7226	8	CENTRAL	MIDDELLAAGTE	11:54:00	11:54:00	00:10:00			MAFIKENG						12:00:00	0	3.79
KGR-WATERVAL	7226	8	CENTRAL	METZ	12:03:00	12:08:00	00:09:00	00:05:00	SHUNT	MAFIKENG						12:00:00	0	7.79
KGR-WATERVAL	7226	8	CENTRAL	DERBY	12:19:00	12:25:00	00:11:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	9
KGR-WATERVAL	7226	9	CENTRAL	DBY/S754102	12:26:00	12:32:00	00:01:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7226	10	CENTRAL	DERBY	12:33:00	12:39:00	00:01:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7226	11	CENTRAL	DESSING	12:50:00	12:50:00	00:11:00			MAFIKENG						12:00:00	0	5.59
KGR-WATERVAL	7226	11	CENTRAL	SKERMUTSELING	12:55:00	12:55:00	00:05:00			MAFIKENG						12:00:00	0	3.89
KGR-WATERVAL	7226	11	CENTRAL	KOSTER	13:03:00	13:23:00	00:08:00	00:20:00	SHUNT	MAFIKENG						12:00:00	0	6.59
KGR-WATERVAL	7226	12	CENTRAL	CHIDIMA	13:42:30	13:42:30	00:19:30			MAFIKENG						12:00:00	0	13
KGR-WATERVAL	7226	12	CENTRAL	KLIPBANKFONTE	14:07:00	14:12:00	00:24:30	00:05:00	SHUNT	MAFIKENG						12:00:00	0	10.65
KGR-WATERVAL	7226	12	CENTRAL	SWARTRUGGENS	14:30:00	15:05:00	00:18:00	00:35:00	SHUNT LOCO CHANGE	MAFIKENG						12:00:00	0	12
KGR-WATERVAL	7226	1	CENTRAL	SWU/S749583	15:06:00	15:51:00	00:01:00	00:45:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7226	2	CENTRAL	SWARTRUGGENS	15:52:00	16:30:00	00:01:00	00:38:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7226	3	CENTRAL	VLEIDRAAI	16:32:00	16:32:00	00:02:00			MAFIKENG						12:00:00	0	8.19
KGR-WATERVAL	7226	3	CENTRAL	RONDAWEL	16:32:00	16:32:00				MAFIKENG						12:00:00	0	6.5
KGR-WATERVAL	7226	3	CENTRAL	TWYFELSPOORT	16:59:30	16:59:30	00:27:30			MAFIKENG						12:00:00	0	4.79
KGR-WATERVAL	7226	3	CENTRAL	MANGOPE	16:59:30	16:59:30				MAFIKENG						12:00:00	0	5.59
KGR-WATERVAL	7226	3	CENTRAL	GROOTMARICO	17:25:00	17:40:00	00:25:30	00:15:00	SHUNT	MAFIKENG						12:00:00	0	6.2
KGR-WATERVAL	7226	3	CENTRAL	MARICOWES	17:47:00	17:47:00	00:07:00			MAFIKENG						12:00:00	0	1.6
KGR-WATERVAL	7226	3	CENTRAL	WILGEBOOMSPRU	17:59:00	17:59:00	00:12:00			MAFIKENG						12:00:00	0	10.9
KGR-WATERVAL	7226	3	CENTRAL	VAALKOP	17:59:00	17:59:00				MAFIKENG						12:00:00	0	5.9
KGR-WATERVAL	7226	3	CENTRAL	WOODBINE	18:09:00	18:09:00	00:10:00			MAFIKENG						12:00:00	0	2.79
KGR-WATERVAL	7226	3	CENTRAL	RENBAAN	18:09:00	18:09:00				MAFIKENG						12:00:00	0	5.7
KGR-WATERVAL	7226	3	CENTRAL	ZEERUST	18:33:00	18:33:00	00:24:00			MAFIKENG						12:00:00	0	10.4
KGR-WATERVAL	7226	4	CENTRAL	LUCERNE	18:52:00	18:58:00	00:19:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	11.59
KGR-WATERVAL	7226	5	CENTRAL	LUC/S745839	18:59:00	19:09:00	00:01:00	00:10:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7226	6	CENTRAL	LUCERNE	19:10:00	19:20:00	00:01:00	00:10:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7226	7	CENTRAL	SENDELINGSPOS	19:34:00	19:41:00	00:14:00	00:07:00		MAFIKENG						12:00:00	0	4.29
KGR-WATERVAL	7226	7	CENTRAL	BUFFELSHOEK	19:41:00	19:41:00				MAFIKENG						12:00:00	0	3.79
KGR-WATERVAL	7226	7	CENTRAL	WINDHEUWEL	19:41:00	19:41:00				MAFIKENG						12:00:00	0	5.29
KGR-WATERVAL	7226	7	CENTRAL	OTTOSHOOP	19:48:00	19:48:00	00:07:00			MAFIKENG						12:00:00	0	5.2
KGR-WATERVAL	7226	7	CENTRAL	SEEKOEI	19:50:00	19:50:00	00:02:00			MAFIKENG						12:00:00	0	6
KGR-WATERVAL	7226	7	CENTRAL	SLURRY	20:05:00	20:06:00	00:15:00	00:01:00	SHUNT	MAFIKENG						12:00:00	0	8.4
KGR-WATERVAL	7226	8	CENTRAL	SLR/S749044	20:07:00	20:10:00	00:01:00	00:03:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7226	9	CENTRAL	SLR/S730114	20:11:00	20:14:00	00:01:00	00:03:00	SHUNT	MAFIKENG						12:00:00	0	0.47
KGR-WATERVAL	7226	10	CENTRAL	SLURRY	20:15:00	20:18:00	00:01:00	00:03:00	SHUNT	MAFIKENG						12:00:00	0	0.5
KGR-WATERVAL	7226	11	CENTRAL	BUHRMANNSDRIF	20:24:00	20:29:00	00:06:00	00:05:00	SHUNT	MAFIKENG						12:00:00	0	4.79
KGR-WATERVAL	7226	12	CENTRAL	COWANSPOST	20:34:00	20:34:00	00:05:00			MAFIKENG						12:00:00	0	4.29
KGR-WATERVAL	7226	12	CENTRAL	MACMULLINS	20:34:00	20:34:00				MAFIKENG						12:00:00	0	6.29
KGR-WATERVAL	7226	12	CENTRAL	MAFIKENG	21:00:00	00:00:00	00:26:00		FD	MAFIKENG						12:00:00	0	6.2
KGR-WATERVAL	7228	1	CENTRAL	KGR-WATERVAL		23:00:00				NATALSPRUIT	23:00:00	16:10:00	1	YYAYYYA	VACUUM TRAINS/VACUUM TRAIN	17:10:00	0	
KGR-WATERVAL	7228	1	CENTRAL	KRUGERSDORP	23:12:00	01:12:00	00:12:00	02:00:00	B LOCO CHANGE	NATALSPRUIT						17:10:00	0	4.37
KGR-WATERVAL	7228	1	CENTRAL	WESRAND	01:15:00	01:15:00	00:03:00			NATALSPRUIT						17:10:00	1	2.33
KGR-WATERVAL	7228	1	CENTRAL	MILLSITE	01:17:00	01:17:00	00:02:00			NATALSPRUIT						17:10:00	1	2.2
KGR-WATERVAL	7228	1	CENTRAL	CENTRAL	01:19:00	01:19:00	00:02:00			NATALSPRUIT						17:10:00	1	1.61
KGR-WATERVAL	7228	1	CENTRAL	ROBINSON(T)	01:23:00	01:23:00	00:04:00			NATALSPRUIT						17:10:00	1	2.7
KGR-WATERVAL	7228	2	CENTRAL	HOMELAKE	01:27:00	01:27:00	00:04:00			NATALSPRUIT						17:10:00	1	3.64
KGR-WATERVAL	7228	2	CENTRAL	RANDFONTEIN	01:32:00	01:52:00	00:05:00	00:20:00	CRANKING	NATALSPRUIT						17:10:00	1	5.16
KGR-WATERVAL	7228	3	CENTRAL	MIDDELVLEI	02:04:00	02:04:00	00:12:00			NATALSPRUIT						17:10:00	1	13.41
KGR-WATERVAL	7228	4	CENTRAL	VLEIKOP	02:15:00	02:15:00	00:11:00			NATALSPRUIT						17:10:00	1	10.58
KGR-WATERVAL	7228	4	CENTRAL	BANK	02:27:00	02:47:00	00:12:00	00:20:00	CRANKING	NATALSPRUIT						17:10:00	1	14.35
KGR-WATERVAL	7228	5	CENTRAL	MAIZELANDS	02:58:00	02:58:00	00:11:00			NATALSPRUIT						17:10:00	1	11.68
KGR-WATERVAL	7228	5	CENTRAL	OBERHOLZER	03:07:00	03:27:00	00:09:00	00:20:00	CRANKING	NATALSPRUIT						17:10:00	1	7.8
KGR-WATERVAL	7228	6	CENTRAL	SPANUIT	03:39:00	03:39:00	00:12:00			NATALSPRUIT						17:10:00	1	14.3
KGR-WATERVAL	7228	7	CENTRAL	WELVERDIEND	03:43:00	04:03:00	00:04:00	00:20:00	CRANKING	NATALSPRUIT						17:10:00	1	4.3
KGR-WATERVAL	7228	8	CENTRAL	GATSRAND	04:17:00	04:17:00	00:14:00			NATALSPRUIT						17:10:00	1	14.5
KGR-WATERVAL	7228	9	CENTRAL	FREDERIKSTAD	04:25:00	04:45:00	00:08:00	00:20:00	CRANKING	NATALSPRUIT						17:10:00	1	9.18
KGR-WATERVAL	7228	9	CENTRAL	BOSKOP	04:51:00	04:51:00	00:06:00			NATALSPRUIT						17:10:00	1	6.46
KGR-WATERVAL	7228	10	CENTRAL	SAFARCAMP	05:03:00	05:03:00	00:12:00			NATALSPRUIT						17:10:00	1	12.48
KGR-WATERVAL	7228	11	CENTRAL	CACHET	05:07:00	05:27:00	00:04:00	00:20:00	CRANKING	NATALSPRUIT						17:10:00	1	2.56
KGR-WATERVAL	7228	12	CENTRAL	POTCHEFSTROOM	05:30:00	11:30:00	00:03:00	06:00:00	SHUNT TURN LOAD	NATALSPRUIT						17:10:00	1	2.6
KGR-WATERVAL	7228	1	CENTRAL	CACHET	11:31:00	11:36:00	00:01:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	2.6
KGR-WATERVAL	7228	2	CENTRAL	TARENTAAL	11:51:00	11:56:00	00:15:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	9.08
KGR-WATERVAL	7228	2	CENTRAL	KLIPDRIF	12:07:00	12:12:00	00:11:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	9.75
KGR-WATERVAL	7228	2	CENTRAL	ENSELSPRUIT	12:26:00	12:31:00	00:14:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	14.5
KGR-WATERVAL	7228	3	CENTRAL	FOCHVILLE	12:48:00	12:53:00	00:17:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	13.18
KGR-WATERVAL	7228	3	CENTRAL	MICHAELSRAAD	13:07:00	13:12:00	00:14:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	10.93
KGR-WATERVAL	7228	3	CENTRAL	RAATHSVLEI	13:18:00	13:18:00	00:06:00			NATALSPRUIT						17:10:00	1	4.88
KGR-WATERVAL	7228	4	CENTRAL	BLOEKOMHEUNING	13:19:00	13:24:00	00:01:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	7.78
KGR-WATERVAL	7228	4		VANDERBIJL	13:41:00	13:46:00	00:17:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	7.95
KGR-WATERVAL	7228	4	CENTRAL	VANDERBIJLPAR	13:47:00	13:52:00	00:01:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	1
KGR-WATERVAL	7228	4	CENTRAL	HOUTHEUWEL	13:59:00	14:04:00	00:07:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	5.34
KGR-WATERVAL	7228	5	CENTRAL	KLEIGROND	14:05:00	14:10:00	00:01:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	4.38
KGR-WATERVAL	7228	6	CENTRAL	LEEUHOF	14:21:00	14:26:00	00:11:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	3.06
KGR-WATERVAL	7228	7	CENTRAL	DUNCANVILLE	14:28:00	14:33:00	00:02:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	3.12
KGR-WATERVAL	7228	7	CENTRAL	VER-NOORD	14:35:00	14:40:00	00:02:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	0.98
KGR-WATERVAL	7228	8	CENTRAL	ALLOY	14:41:00	14:46:00	00:01:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	1.55
KGR-WATERVAL	7228	8	CENTRAL	REDAN	14:47:00	14:52:00	00:01:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	3.97
KGR-WATERVAL	7228	9	CENTRAL	KOOKRUS	14:54:00	14:59:00	00:02:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	5.11
KGR-WATERVAL	7228	9	CENTRAL	MEYERTON	15:01:00	15:06:00	00:02:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	3.91
KGR-WATERVAL	7228	10	CENTRAL	HENLYONKLIP	15:08:00	15:13:00	00:02:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	4.46
KGR-WATERVAL	7228	11	CENTRAL	DALESIDE	15:15:00	15:20:00	00:02:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	4.91
KGR-WATERVAL	7228	12	CONTAINER	SKANSDAM	15:21:00	15:26:00	00:01:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	2.62
KGR-WATERVAL	7228	12	CENTRAL	SYBRAND	15:27:00	15:32:00	00:01:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	2.58
KGR-WATERVAL	7228	13	CONTAINER	KLIPRIVIER	15:34:00	15:39:00	00:02:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	2.58
KGR-WATERVAL	7228	14	CONTAINER	RANDWATER	15:42:00	15:47:00	00:03:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	4.91
KGR-WATERVAL	7228	15	CONTAINER	ANGUS	15:50:00	15:55:00	00:03:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	4.51
KGR-WATERVAL	7228	15	CONTAINER	MPILISWENI	15:57:00	16:02:00	00:02:00	00:05:00	CRANKING	NATALSPRUIT						17:10:00	1	3.75
KGR-WATERVAL	7228	15	CONTAINER	NATALSPRUIT	16:10:00	00:00:00	00:08:00		FD	NATALSPRUIT						17:10:00	1	1.68
KGR-WATERVAL	7235	1	CENTRAL	KGR-WATERVAL		12:31:00				SASOLBURG	12:31:00	16:29:00	2	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	03:58:00	0	
KGR-WATERVAL	7235	1	CENTRAL	KRUGERSDORP	12:43:00	12:43:00	00:12:00		B	SASOLBURG						03:58:00	0	4.37
KGR-WATERVAL	7235	2	CENTRAL	WINDSORMINE	12:43:00	12:43:00				SASOLBURG						03:58:00	0	1.06
KGR-WATERVAL	7235	2	CENTRAL	LANWEN	12:43:00	12:43:00				SASOLBURG						03:58:00	0	1.37
KGR-WATERVAL	7235	2	CENTRAL	LUIPAARDSVLEI	12:48:00	12:48:00	00:05:00			SASOLBURG						03:58:00	0	1.9
KGR-WATERVAL	7235	3	CENTRAL	WITPOORTJIE	12:48:00	12:48:00				SASOLBURG						03:58:00	0	2.08
KGR-WATERVAL	7235	3	CONTAINER	PRINCESS	12:48:00	12:48:00				SASOLBURG						03:58:00	0	2.37
KGR-WATERVAL	7235	3	CONTAINER	HORISON	12:48:00	12:48:00				SASOLBURG						03:58:00	0	1.91
KGR-WATERVAL	7235	3	CENTRAL	ROODEPOORT	12:58:00	12:58:00	00:10:00			SASOLBURG						03:58:00	0	1.52
KGR-WATERVAL	7235	4	CONTAINER	GEORGINIA	12:58:00	12:58:00				SASOLBURG						03:58:00	0	1.35
KGR-WATERVAL	7235	4	CENTRAL	HAMBERG	12:58:00	12:58:00				SASOLBURG						03:58:00	0	1.38
KGR-WATERVAL	7235	4	CENTRAL	FLORIDA	12:58:00	12:58:00				SASOLBURG						03:58:00	0	2.25
KGR-WATERVAL	7235	4	CENTRAL	UNIFIED	12:58:00	12:58:00				SASOLBURG						03:58:00	0	1.42
KGR-WATERVAL	7235	4	CENTRAL	MARAISBURG	13:08:00	13:08:00	00:10:00			SASOLBURG						03:58:00	0	1.37
KGR-WATERVAL	7235	4	CENTRAL	BOSMONT	13:08:00	13:08:00				SASOLBURG						03:58:00	0	1.19
KGR-WATERVAL	7235	4	CENTRAL	NEWCLARE	13:08:00	13:08:00				SASOLBURG						03:58:00	0	1.2
KGR-WATERVAL	7235	4	CENTRAL	WESTBURY	13:08:00	13:08:00				SASOLBURG						03:58:00	0	0.66
KGR-WATERVAL	7235	4	CENTRAL	INDUSTRIA	13:08:00	13:08:00				SASOLBURG						03:58:00	0	1.75
KGR-WATERVAL	7235	4	CENTRAL	LLA-LANGLAAGTEWES	13:14:00	13:14:00	00:06:00			SASOLBURG						03:58:00	0	0.7
KGR-WATERVAL	7235	5	CENTRAL	PAARLSHOOP	13:14:00	13:14:00				SASOLBURG						03:58:00	0	2.56
KGR-WATERVAL	7235	5	CENTRAL	CROWN	13:27:00	13:27:00	00:13:00			SASOLBURG						03:58:00	0	2.39
KGR-WATERVAL	7235	6	CENTRAL	BOOYSENS	13:35:00	13:35:00	00:08:00			SASOLBURG						03:58:00	0	2.85
KGR-WATERVAL	7235	7	CONTAINER	KASERNE	13:43:00	13:43:00	00:08:00			SASOLBURG						03:58:00	0	3.83
KGR-WATERVAL	7235	8	CONTAINER	KAZ-CITYDEEP	13:47:27	13:47:27	00:04:27			SASOLBURG						03:58:00	0	1.85
KGR-WATERVAL	7235	9	CONTAINER	JUPITER	13:52:00	13:59:00	00:04:33	00:07:00	SHUNT	SASOLBURG						03:58:00	0	2.5
KGR-WATERVAL	7235	10	CONTAINER	JUP/S752525	14:05:00	14:15:00	00:06:00	00:10:00	SHUNT	SASOLBURG						03:58:00	0	0.97
KGR-WATERVAL	7235	11	CONTAINER	JUPITER	14:20:00	14:26:00	00:05:00	00:06:00	SHUNT	SASOLBURG						03:58:00	0	0.97
KGR-WATERVAL	7235	12	CONTAINER	REFINERY	14:32:00	14:32:00	00:06:00			SASOLBURG						03:58:00	0	3.54
KGR-WATERVAL	7235	13	CONTAINER	GERMISTONSOUT	14:36:00	14:36:00	00:04:00			SASOLBURG						03:58:00	0	1.19
KGR-WATERVAL	7235	14	CONTAINER	GERMISTONLAKE	14:39:00	14:39:00	00:03:00			SASOLBURG						03:58:00	0	0.61
KGR-WATERVAL	7235	14	CONTAINER	WEBBER	14:40:00	14:40:00	00:01:00			SASOLBURG						03:58:00	0	0.88
KGR-WATERVAL	7235	14	CONTAINER	PARKHILL	14:42:00	14:42:00	00:02:00			SASOLBURG						03:58:00	0	1.12
KGR-WATERVAL	7235	14	CONTAINER	ELSBURG	14:44:00	14:44:00	00:02:00			SASOLBURG						03:58:00	0	0.7
KGR-WATERVAL	7235	15	CONTAINER	DALLAS	14:45:00	14:45:00	00:01:00			SASOLBURG						03:58:00	0	0.9
KGR-WATERVAL	7235	16	CONTAINER	WATTLES	14:48:00	14:48:00	00:03:00			SASOLBURG						03:58:00	0	1.53
KGR-WATERVAL	7235	16	CONTAINER	UNION	14:53:00	14:53:00	00:05:00			SASOLBURG						03:58:00	0	1.81
KGR-WATERVAL	7235	17	CONTAINER	NATALSPRUIT	15:00:00	15:00:00	00:07:00			SASOLBURG						03:58:00	0	4.42
KGR-WATERVAL	7235	18	CONTAINER	MPILISWENI	15:02:00	15:02:00	00:02:00			SASOLBURG						03:58:00	0	1.68
KGR-WATERVAL	7235	18	CONTAINER	ANGUS	15:08:00	15:08:00	00:06:00			SASOLBURG						03:58:00	0	3.75
KGR-WATERVAL	7235	18	CONTAINER	RANDWATER	15:14:00	15:14:00	00:06:00			SASOLBURG						03:58:00	0	4.51
KGR-WATERVAL	7235	19	CONTAINER	KLIPRIVIER	15:20:00	15:20:00	00:06:00			SASOLBURG						03:58:00	0	4.91
KGR-WATERVAL	7235	20	CENTRAL	SYBRAND	15:22:00	15:22:00	00:02:00			SASOLBURG						03:58:00	0	2.58
KGR-WATERVAL	7235	21	CONTAINER	SKANSDAM	15:24:00	15:24:00	00:02:00			SASOLBURG						03:58:00	0	2.58
KGR-WATERVAL	7235	21	CENTRAL	DALESIDE	15:27:00	15:27:00	00:03:00			SASOLBURG						03:58:00	0	2.62
KGR-WATERVAL	7235	22	CENTRAL	HENLYONKLIP	15:32:00	15:32:00	00:05:00			SASOLBURG						03:58:00	0	4.91
KGR-WATERVAL	7235	23	CENTRAL	MEYERTON	15:37:00	15:37:00	00:05:00			SASOLBURG						03:58:00	0	4.46
KGR-WATERVAL	7235	24	CENTRAL	KOOKRUS	15:43:00	15:43:00	00:06:00			SASOLBURG						03:58:00	0	3.91
KGR-WATERVAL	7235	24	CENTRAL	REDAN	15:48:00	15:48:00	00:05:00			SASOLBURG						03:58:00	0	5.11
KGR-WATERVAL	7235	25	CENTRAL	ALLOY	15:52:00	15:52:00	00:04:00			SASOLBURG						03:58:00	0	3.97
KGR-WATERVAL	7235	25	CENTRAL	VER-NOORD	15:55:00	15:55:00	00:03:00			SASOLBURG						03:58:00	0	1.55
KGR-WATERVAL	7235	26	CENTRAL	VEREENIGING	15:58:00	15:58:00	00:03:00			SASOLBURG						03:58:00	0	0.53
KGR-WATERVAL	7235	27	CENTRAL	VER-SUID	15:59:00	15:59:00	00:01:00			SASOLBURG						03:58:00	0	1
KGR-WATERVAL	7235	28	CENTRAL	VLC-VILJOENSD	16:09:00	16:09:00	00:10:00			SASOLBURG						03:58:00	0	1
KGR-WATERVAL	7235	29	CENTRAL	VEREST	16:17:00	16:17:00	00:08:00			SASOLBURG						03:58:00	0	6.09
KGR-WATERVAL	7235	29	CENTRAL	SASOLBURG	16:29:00	00:00:00	00:12:00		RT	SASOLBURG						03:58:00	0	8.22
KGR-WATERVAL	7426	1	CENTRAL	KGR-WATERVAL		09:00:00				MAFIKENG	09:00:00	21:00:00	1	AYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	12:00:00	0	
KGR-WATERVAL	7426	1	CENTRAL	BATTERY	09:14:00	09:34:00	00:14:00	00:20:00	B SHUNT	MAFIKENG						12:00:00	0	6
KGR-WATERVAL	7426	2	CENTRAL	TARLTON	09:43:00	10:08:00	00:09:00	00:25:00	SHUNT	MAFIKENG						12:00:00	0	6.09
KGR-WATERVAL	7426	3	CENTRAL	ORIENT	10:18:00	10:18:00	00:10:00			MAFIKENG						12:00:00	0	9.3
KGR-WATERVAL	7426	3	CENTRAL	MOLONEY	10:28:00	10:28:00	00:10:00			MAFIKENG						12:00:00	0	2.2
KGR-WATERVAL	7426	3	CENTRAL	MAGALIESBURG	10:39:30	10:39:30	00:11:30			MAFIKENG						12:00:00	0	3.5
KGR-WATERVAL	7426	4	CENTRAL	SEEKMORE	10:39:30	10:39:30				MAFIKENG						12:00:00	0	5.29
KGR-WATERVAL	7426	4	CENTRAL	WATERSHED	10:39:30	10:39:30				MAFIKENG						12:00:00	0	2.1
KGR-WATERVAL	7426	4	CENTRAL	VLAKDRIF	10:57:00	10:57:00	00:17:30			MAFIKENG						12:00:00	0	3.1
KGR-WATERVAL	7426	4	CENTRAL	BREETSVLEI	10:57:00	10:57:00				MAFIKENG						12:00:00	0	6.59
KGR-WATERVAL	7426	4	CENTRAL	SYFERBULT	11:06:00	11:06:00	00:09:00			MAFIKENG						12:00:00	0	5.2
KGR-WATERVAL	7426	5	CENTRAL	BOONS	11:24:00	11:30:00	00:18:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	10.3
KGR-WATERVAL	7426	6	CENTRAL	BNS/S754935	11:31:00	11:37:00	00:01:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7426	7	CENTRAL	BOONS	11:38:00	11:44:00	00:01:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7426	8	CENTRAL	MIDDELLAAGTE	11:54:00	11:54:00	00:10:00			MAFIKENG						12:00:00	0	3.79
KGR-WATERVAL	7426	8	CENTRAL	METZ	12:03:00	12:08:00	00:09:00	00:05:00	SHUNT	MAFIKENG						12:00:00	0	7.79
KGR-WATERVAL	7426	8	CENTRAL	DERBY	12:19:00	12:25:00	00:11:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	9
KGR-WATERVAL	7426	9	CENTRAL	DBY/S754102	12:26:00	12:32:00	00:01:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7426	10	CENTRAL	DERBY	12:33:00	12:39:00	00:01:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7426	11	CENTRAL	DESSING	12:50:00	12:50:00	00:11:00			MAFIKENG						12:00:00	0	5.59
KGR-WATERVAL	7426	11	CENTRAL	SKERMUTSELING	12:55:00	12:55:00	00:05:00			MAFIKENG						12:00:00	0	3.89
KGR-WATERVAL	7426	11	CENTRAL	KOSTER	13:03:00	13:23:00	00:08:00	00:20:00	SHUNT	MAFIKENG						12:00:00	0	6.59
KGR-WATERVAL	7426	12	CENTRAL	CHIDIMA	13:42:30	13:42:30	00:19:30			MAFIKENG						12:00:00	0	13
KGR-WATERVAL	7426	12	CENTRAL	KLIPBANKFONTE	14:07:00	14:12:00	00:24:30	00:05:00	SHUNT	MAFIKENG						12:00:00	0	10.65
KGR-WATERVAL	7426	12	CENTRAL	SWARTRUGGENS	14:30:00	15:05:00	00:18:00	00:35:00	SHUNT	MAFIKENG						12:00:00	0	12
KGR-WATERVAL	7426	1	CENTRAL	SWU/S749583	15:06:00	15:51:00	00:01:00	00:45:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7426	2	CENTRAL	SWARTRUGGENS	15:52:00	16:30:00	00:01:00	00:38:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7426	3	CENTRAL	VLEIDRAAI	16:32:00	16:32:00	00:02:00			MAFIKENG						12:00:00	0	8.19
KGR-WATERVAL	7426	3	CENTRAL	RONDAWEL	16:32:00	16:32:00				MAFIKENG						12:00:00	0	6.5
KGR-WATERVAL	7426	3	CENTRAL	TWYFELSPOORT	16:59:30	16:59:30	00:27:30			MAFIKENG						12:00:00	0	4.79
KGR-WATERVAL	7426	3	CENTRAL	MANGOPE	16:59:30	16:59:30				MAFIKENG						12:00:00	0	5.59
KGR-WATERVAL	7426	3	CENTRAL	GROOTMARICO	17:25:00	17:40:00	00:25:30	00:15:00	SHUNT	MAFIKENG						12:00:00	0	6.2
KGR-WATERVAL	7426	3	CENTRAL	MARICOWES	17:47:00	17:47:00	00:07:00			MAFIKENG						12:00:00	0	1.6
KGR-WATERVAL	7426	3	CENTRAL	WILGEBOOMSPRU	17:59:00	17:59:00	00:12:00			MAFIKENG						12:00:00	0	10.9
KGR-WATERVAL	7426	3	CENTRAL	VAALKOP	17:59:00	17:59:00				MAFIKENG						12:00:00	0	5.9
KGR-WATERVAL	7426	3	CENTRAL	WOODBINE	18:09:00	18:09:00	00:10:00			MAFIKENG						12:00:00	0	2.79
KGR-WATERVAL	7426	3	CENTRAL	RENBAAN	18:09:00	18:09:00				MAFIKENG						12:00:00	0	5.7
KGR-WATERVAL	7426	3	CENTRAL	ZEERUST	18:33:00	18:33:00	00:24:00			MAFIKENG						12:00:00	0	10.4
KGR-WATERVAL	7426	4	CENTRAL	LUCERNE	18:52:00	18:58:00	00:19:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	11.59
KGR-WATERVAL	7426	5	CENTRAL	LUC/S745839	18:59:00	19:09:00	00:01:00	00:10:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7426	6	CENTRAL	LUCERNE	19:10:00	19:20:00	00:01:00	00:10:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7426	7	CENTRAL	SENDELINGSPOS	19:34:00	19:41:00	00:14:00	00:07:00		MAFIKENG						12:00:00	0	4.29
KGR-WATERVAL	7426	7	CENTRAL	BUFFELSHOEK	19:41:00	19:41:00				MAFIKENG						12:00:00	0	3.79
KGR-WATERVAL	7426	7	CENTRAL	WINDHEUWEL	19:41:00	19:41:00				MAFIKENG						12:00:00	0	5.29
KGR-WATERVAL	7426	7	CENTRAL	OTTOSHOOP	19:48:00	19:48:00	00:07:00			MAFIKENG						12:00:00	0	5.2
KGR-WATERVAL	7426	7	CENTRAL	SEEKOEI	19:50:00	19:50:00	00:02:00			MAFIKENG						12:00:00	0	6
KGR-WATERVAL	7426	7	CENTRAL	SLURRY	20:05:00	20:06:00	00:15:00	00:01:00	SHUNT	MAFIKENG						12:00:00	0	8.4
KGR-WATERVAL	7426	8	CENTRAL	SLR/S749044	20:07:00	20:10:00	00:01:00	00:03:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	7426	9	CENTRAL	SLR/S730114	20:11:00	20:14:00	00:01:00	00:03:00	SHUNT	MAFIKENG						12:00:00	0	0.47
KGR-WATERVAL	7426	10	CENTRAL	SLURRY	20:15:00	20:18:00	00:01:00	00:03:00	SHUNT	MAFIKENG						12:00:00	0	0.5
KGR-WATERVAL	7426	11	CENTRAL	BUHRMANNSDRIF	20:24:00	20:29:00	00:06:00	00:05:00	SHUNT	MAFIKENG						12:00:00	0	4.79
KGR-WATERVAL	7426	12	CENTRAL	COWANSPOST	20:34:00	20:34:00	00:05:00			MAFIKENG						12:00:00	0	4.29
KGR-WATERVAL	7426	12	CENTRAL	MACMULLINS	20:34:00	20:34:00				MAFIKENG						12:00:00	0	6.29
KGR-WATERVAL	7426	12	CENTRAL	MAFIKENG	21:00:00	00:00:00	00:26:00		FD	MAFIKENG						12:00:00	0	6.2
KGR-WATERVAL	7428	1	CENTRAL	KGR-WATERVAL		23:00:00				SASOLBURG	23:00:00	11:30:00	1	YYYAYYY	MEDIUM HEAVY/MEDIUM HEAVY	12:30:00	0	
KGR-WATERVAL	7428	1	CENTRAL	KRUGERSDORP	23:12:00	01:12:00	00:12:00	02:00:00	B LOCO CHANGE	SASOLBURG						12:30:00	0	4.37
KGR-WATERVAL	7428	1	CENTRAL	WESRAND	01:15:00	01:15:00	00:03:00			SASOLBURG						12:30:00	1	2.33
KGR-WATERVAL	7428	1	CENTRAL	MILLSITE	01:17:00	01:17:00	00:02:00			SASOLBURG						12:30:00	1	2.2
KGR-WATERVAL	7428	1	CENTRAL	CENTRAL	01:19:00	01:19:00	00:02:00			SASOLBURG						12:30:00	1	1.61
KGR-WATERVAL	7428	1	CENTRAL	ROBINSON(T)	01:23:00	01:23:00	00:04:00			SASOLBURG						12:30:00	1	2.7
KGR-WATERVAL	7428	2	CENTRAL	HOMELAKE	01:27:00	01:27:00	00:04:00			SASOLBURG						12:30:00	1	3.64
KGR-WATERVAL	7428	2	CENTRAL	RANDFONTEIN	01:32:00	01:52:00	00:05:00	00:20:00	CRANKING	SASOLBURG						12:30:00	1	5.16
KGR-WATERVAL	7428	3	CENTRAL	MIDDELVLEI	02:04:00	02:04:00	00:12:00			SASOLBURG						12:30:00	1	13.41
KGR-WATERVAL	7428	4	CENTRAL	VLEIKOP	02:15:00	02:15:00	00:11:00			SASOLBURG						12:30:00	1	10.58
KGR-WATERVAL	7428	4	CENTRAL	BANK	02:27:00	02:47:00	00:12:00	00:20:00	CRANKING	SASOLBURG						12:30:00	1	14.35
KGR-WATERVAL	7428	5	CENTRAL	MAIZELANDS	02:58:00	02:58:00	00:11:00			SASOLBURG						12:30:00	1	11.68
KGR-WATERVAL	7428	5	CENTRAL	OBERHOLZER	03:07:00	03:27:00	00:09:00	00:20:00	CRANKING	SASOLBURG						12:30:00	1	7.8
KGR-WATERVAL	7428	6	CENTRAL	SPANUIT	03:39:00	03:39:00	00:12:00			SASOLBURG						12:30:00	1	14.3
KGR-WATERVAL	7428	7	CENTRAL	WELVERDIEND	03:43:00	04:03:00	00:04:00	00:20:00	CRANKING	SASOLBURG						12:30:00	1	4.3
KGR-WATERVAL	7428	8	CENTRAL	GATSRAND	04:17:00	04:17:00	00:14:00			SASOLBURG						12:30:00	1	14.5
KGR-WATERVAL	7428	9	CENTRAL	FREDERIKSTAD	04:25:00	04:45:00	00:08:00	00:20:00		SASOLBURG						12:30:00	1	9.18
KGR-WATERVAL	7428	9	CENTRAL	BOSKOP	04:51:00	04:51:00	00:06:00			SASOLBURG						12:30:00	1	6.46
KGR-WATERVAL	7428	10	CENTRAL	SAFARCAMP	05:03:00	05:03:00	00:12:00			SASOLBURG						12:30:00	1	12.48
KGR-WATERVAL	7428	11	CENTRAL	CACHET	05:07:00	05:27:00	00:04:00	00:20:00	CRANKING	SASOLBURG						12:30:00	1	2.56
KGR-WATERVAL	7428	12	CENTRAL	POTCHEFSTROOM	05:30:00	08:00:00	00:03:00	02:30:00	SHUNT TURN LOAD	SASOLBURG						12:30:00	1	2.6
KGR-WATERVAL	7428	1	CENTRAL	CACHET	08:01:00	08:06:00	00:01:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	2.6
KGR-WATERVAL	7428	2	CENTRAL	TARENTAAL	08:21:00	08:26:00	00:15:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	9.08
KGR-WATERVAL	7428	2	CENTRAL	KLIPDRIF	08:37:00	08:42:00	00:11:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	9.75
KGR-WATERVAL	7428	2	CENTRAL	ENSELSPRUIT	08:56:00	09:01:00	00:14:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	14.5
KGR-WATERVAL	7428	3	CENTRAL	FOCHVILLE	09:18:00	09:23:00	00:17:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	13.18
KGR-WATERVAL	7428	3	CENTRAL	MICHAELSRAAD	09:37:00	09:42:00	00:14:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	10.93
KGR-WATERVAL	7428	3	CENTRAL	RAATHSVLEI	09:48:00	09:48:00	00:06:00			SASOLBURG						12:30:00	1	4.88
KGR-WATERVAL	7428	4	CENTRAL	BLOEKOMHEUNING	09:49:00	09:54:00	00:01:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	7.78
KGR-WATERVAL	7428	4		VANDERBIJL	10:11:00	10:16:00	00:17:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	7.95
KGR-WATERVAL	7428	4	CENTRAL	VANDERBIJLPAR	10:17:00	10:22:00	00:01:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	1
KGR-WATERVAL	7428	4	CENTRAL	HOUTHEUWEL	10:29:00	10:34:00	00:07:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	5.34
KGR-WATERVAL	7428	5	CENTRAL	KLEIGROND	10:35:00	10:40:00	00:01:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	4.38
KGR-WATERVAL	7428	6	CENTRAL	LEEUHOF	10:51:00	10:56:00	00:11:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	3.06
KGR-WATERVAL	7428	7	CENTRAL	VER-SUID	10:58:00	11:03:00	00:02:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	1
KGR-WATERVAL	7428	8	CENTRAL	VLC-VILJOENSD	11:05:00	11:10:00	00:02:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	1
KGR-WATERVAL	7428	9	CENTRAL	VEREST	11:17:00	11:22:00	00:07:00	00:05:00	CRANKING	SASOLBURG						12:30:00	1	6.09
KGR-WATERVAL	7428	9	CENTRAL	SASOLBURG	11:30:00	00:00:00	00:08:00	00:05:00	FD	SASOLBURG						12:30:00	1	8.22
KGR-WATERVAL	7429	1	CENTRAL	KGR-WATERVAL		12:30:00				WELGEDAG	12:30:00	17:10:00	2	AYYYYAY	MEDIUM HEAVY/MEDIUM HEAVY	04:40:00	0	
KGR-WATERVAL	7429	1	CENTRAL	KRUGERSDORP	12:42:00	12:42:00	00:12:00		B	WELGEDAG						04:40:00	0	4.37
KGR-WATERVAL	7429	2	CENTRAL	WINDSORMINE	12:44:00	12:44:00	00:02:00			WELGEDAG						04:40:00	0	1.06
KGR-WATERVAL	7429	2	CENTRAL	LANWEN	12:46:00	12:46:00	00:02:00			WELGEDAG						04:40:00	0	1.37
KGR-WATERVAL	7429	2	CENTRAL	LUIPAARDSVLEI	12:47:00	12:47:00	00:01:00			WELGEDAG						04:40:00	0	1.9
KGR-WATERVAL	7429	3	CENTRAL	WITPOORTJIE	12:50:00	12:50:00	00:03:00			WELGEDAG						04:40:00	0	2.08
KGR-WATERVAL	7429	3	CONTAINER	PRINCESS	12:52:00	12:52:00	00:02:00			WELGEDAG						04:40:00	0	2.37
KGR-WATERVAL	7429	3	CONTAINER	HORISON	12:55:00	12:55:00	00:03:00			WELGEDAG						04:40:00	0	1.91
KGR-WATERVAL	7429	3	CENTRAL	ROODEPOORT	12:57:00	15:07:00	00:02:00	02:10:00	SHUNT	WELGEDAG						04:40:00	0	1.52
KGR-WATERVAL	7429	4	CONTAINER	GEORGINIA	15:09:00	15:09:00	00:02:00			WELGEDAG						04:40:00	0	1.35
KGR-WATERVAL	7429	4	CENTRAL	HAMBERG	15:11:00	15:11:00	00:02:00			WELGEDAG						04:40:00	0	1.38
KGR-WATERVAL	7429	4	CENTRAL	FLORIDA	15:13:00	15:13:00	00:02:00			WELGEDAG						04:40:00	0	2.25
KGR-WATERVAL	7429	4	CENTRAL	UNIFIED	15:15:00	15:15:00	00:02:00			WELGEDAG						04:40:00	0	1.42
KGR-WATERVAL	7429	4	CENTRAL	MARAISBURG	15:17:00	15:17:00	00:02:00			WELGEDAG						04:40:00	0	1.37
KGR-WATERVAL	7429	4	CENTRAL	BOSMONT	15:18:00	15:18:00	00:01:00			WELGEDAG						04:40:00	0	1.19
KGR-WATERVAL	7429	4	CENTRAL	NEWCLARE	15:19:00	15:19:00	00:01:00			WELGEDAG						04:40:00	0	1.2
KGR-WATERVAL	7429	4	CENTRAL	WESTBURY	15:19:00	15:19:00				WELGEDAG						04:40:00	0	0.66
KGR-WATERVAL	7429	4	CENTRAL	INDUSTRIA	15:21:00	15:21:00	00:02:00			WELGEDAG						04:40:00	0	1.75
KGR-WATERVAL	7429	4	CENTRAL	LLA-LANGLAAGTEWES	15:22:00	15:22:00	00:01:00			WELGEDAG						04:40:00	0	0.7
KGR-WATERVAL	7429	5	CENTRAL	PAARLSHOOP	15:28:00	15:28:00	00:06:00			WELGEDAG						04:40:00	0	2.56
KGR-WATERVAL	7429	5	CENTRAL	CROWN	15:34:00	15:34:00	00:06:00			WELGEDAG						04:40:00	0	2.39
KGR-WATERVAL	7429	6	CENTRAL	BOOYSENS	15:39:00	15:39:00	00:05:00			WELGEDAG						04:40:00	0	2.85
KGR-WATERVAL	7429	7	CONTAINER	KASERNE	15:51:00	15:51:00	00:12:00			WELGEDAG						04:40:00	0	3.83
KGR-WATERVAL	7429	8	CONTAINER	KAZ-CITYDEEP	15:55:27	15:55:27	00:04:27			WELGEDAG						04:40:00	0	1.85
KGR-WATERVAL	7429	9	CONTAINER	JUPITER	16:00:00	16:00:00	00:04:33			WELGEDAG						04:40:00	0	2.5
KGR-WATERVAL	7429	10	CENTRAL	DRIEHOEK	16:08:00	16:08:00	00:08:00			WELGEDAG						04:40:00	0	3.2
KGR-WATERVAL	7429	11	CONTAINER	PRESIDENT	16:11:00	16:11:00	00:03:00			WELGEDAG						04:40:00	0	1.08
KGR-WATERVAL	7429	12	CENTRAL	GERMISTON	16:15:00	16:15:00	00:04:00			WELGEDAG						04:40:00	0	1.08
KGR-WATERVAL	7429	13	CENTRAL	GMR-OOS	16:16:00	16:16:00	00:01:00			WELGEDAG						04:40:00	0	1.6
KGR-WATERVAL	7429	14	CENTRAL	DELMORE	16:18:00	16:18:00	00:02:00			WELGEDAG						04:40:00	0	1.94
KGR-WATERVAL	7429	15	CENTRAL	ANGELO	16:21:00	16:21:00	00:03:00			WELGEDAG						04:40:00	0	1.52
KGR-WATERVAL	7429	16	CENTRAL	OOSRAND	16:25:00	16:25:00	00:04:00			WELGEDAG						04:40:00	0	2.14
KGR-WATERVAL	7429	17	CENTRAL	BOKSBURG	16:29:00	16:29:00	00:04:00			WELGEDAG						04:40:00	0	1.15
KGR-WATERVAL	7429	17	CENTRAL	BOKSBURGOOS	16:34:00	16:34:00	00:05:00			WELGEDAG						04:40:00	0	1.86
KGR-WATERVAL	7429	18	CENTRAL	DUNSWART	16:38:00	16:38:00	00:04:00			WELGEDAG						04:40:00	0	2.58
KGR-WATERVAL	7429	19	CENTRAL	BENONI	16:44:00	16:44:00	00:06:00			WELGEDAG						04:40:00	0	2.85
KGR-WATERVAL	7429	20	CENTRAL	NEWKLEINFONTE	16:46:00	16:46:00	00:02:00			WELGEDAG						04:40:00	0	1.66
KGR-WATERVAL	7429	20	NORTH	APEX	16:49:00	16:49:00	00:03:00			WELGEDAG						04:40:00	0	2.33
KGR-WATERVAL	7429	21	NORTH	MODREA	16:56:00	16:56:00	00:07:00			WELGEDAG						04:40:00	0	5.5
KGR-WATERVAL	7429	21	NORTH	GEDULD	17:03:00	17:03:00	00:07:00			WELGEDAG						04:40:00	0	6
KGR-WATERVAL	7429	22	NORTH	WELGEDAG	17:10:00	00:00:00	00:07:00		RT	WELGEDAG						04:40:00	0	5.8
KGR-WATERVAL	7745	1	CENTRAL	KGR-WATERVAL		20:20:00				KASERNE	20:20:00	21:31:00	3	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	01:11:00	0	
KGR-WATERVAL	7745	1	CENTRAL	KRUGERSDORP	20:32:00	20:32:00	00:12:00		B	KASERNE						01:11:00	0	4.37
KGR-WATERVAL	7745	2	CENTRAL	WINDSORMINE	20:34:00	20:34:00	00:02:00			KASERNE						01:11:00	0	1.06
KGR-WATERVAL	7745	2	CENTRAL	LANWEN	20:35:00	20:35:00	00:01:00			KASERNE						01:11:00	0	1.37
KGR-WATERVAL	7745	2	CENTRAL	LUIPAARDSVLEI	20:37:00	20:37:00	00:02:00			KASERNE						01:11:00	0	1.9
KGR-WATERVAL	7745	3	CENTRAL	WITPOORTJIE	20:39:00	20:39:00	00:02:00			KASERNE						01:11:00	0	2.08
KGR-WATERVAL	7745	3	CONTAINER	PRINCESS	20:40:00	20:40:00	00:01:00			KASERNE						01:11:00	0	2.37
KGR-WATERVAL	7745	3	CONTAINER	HORISON	20:42:00	20:42:00	00:02:00			KASERNE						01:11:00	0	1.91
KGR-WATERVAL	7745	3	CENTRAL	ROODEPOORT	20:47:00	20:47:00	00:05:00			KASERNE						01:11:00	0	1.52
KGR-WATERVAL	7745	4	CONTAINER	GEORGINIA	20:49:00	20:49:00	00:02:00			KASERNE						01:11:00	0	1.35
KGR-WATERVAL	7745	4	CENTRAL	HAMBERG	20:51:00	20:51:00	00:02:00			KASERNE						01:11:00	0	1.38
KGR-WATERVAL	7745	4	CENTRAL	FLORIDA	20:53:00	20:53:00	00:02:00			KASERNE						01:11:00	0	2.25
KGR-WATERVAL	7745	4	CENTRAL	UNIFIED	20:55:00	20:55:00	00:02:00			KASERNE						01:11:00	0	1.42
KGR-WATERVAL	7745	4	CENTRAL	MARAISBURG	20:57:00	20:57:00	00:02:00			KASERNE						01:11:00	0	1.37
KGR-WATERVAL	7745	4	CENTRAL	BOSMONT	20:58:00	20:58:00	00:01:00			KASERNE						01:11:00	0	1.19
KGR-WATERVAL	7745	4	CENTRAL	NEWCLARE	20:59:00	20:59:00	00:01:00			KASERNE						01:11:00	0	1.2
KGR-WATERVAL	7745	4	CENTRAL	WESTBURY	21:00:00	21:00:00	00:01:00			KASERNE						01:11:00	0	0.66
KGR-WATERVAL	7745	4	CENTRAL	INDUSTRIA	21:01:00	21:01:00	00:01:00			KASERNE						01:11:00	0	1.75
KGR-WATERVAL	7745	4	CENTRAL	LLA-LANGLAAGTEWES	21:02:00	21:02:00	00:01:00			KASERNE						01:11:00	0	0.7
KGR-WATERVAL	7745	5	CENTRAL	PAARLSHOOP	21:05:00	21:05:00	00:03:00			KASERNE						01:11:00	0	2.56
KGR-WATERVAL	7745	5	CENTRAL	CROWN	21:12:00	21:12:00	00:07:00			KASERNE						01:11:00	0	2.39
KGR-WATERVAL	7745	6	CENTRAL	BOOYSENS	21:15:00	21:15:00	00:03:00			KASERNE						01:11:00	0	2.85
KGR-WATERVAL	7745	7	CONTAINER	KASERNE	21:31:00	00:00:00	00:16:00		RT	KASERNE						01:11:00	0	3.83
KGR-WATERVAL	7748	1	CENTRAL	KGR-WATERVAL		00:10:00				ROBINSON(T)	00:10:00	00:45:00	2	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	00:35:00	0	
KGR-WATERVAL	7748	1	CENTRAL	KRUGERSDORP	00:20:00	00:30:00	00:10:00	00:10:00	B TURN LOCO'S	ROBINSON(T)						00:35:00	0	4.37
KGR-WATERVAL	7748	2	CENTRAL	WESRAND	00:32:00	00:32:00	00:02:00			ROBINSON(T)						00:35:00	0	2.33
KGR-WATERVAL	7748	2	CENTRAL	MILLSITE	00:34:00	00:34:00	00:02:00			ROBINSON(T)						00:35:00	0	2.2
KGR-WATERVAL	7748	2	CENTRAL	CENTRAL	00:39:00	00:39:00	00:05:00			ROBINSON(T)						00:35:00	0	1.61
KGR-WATERVAL	7748	2	CENTRAL	ROBINSON(T)	00:45:00	00:00:00	00:06:00		RT	ROBINSON(T)						00:35:00	0	2.7
KGR-WATERVAL	7750	1	CENTRAL	KGR-WATERVAL		12:00:00				ROBINSON(T)	12:00:00	12:35:00	2	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	00:35:00	0	
KGR-WATERVAL	7750	1	CENTRAL	KRUGERSDORP	12:10:00	12:20:00	00:10:00	00:10:00	B TURN LOCO'S	ROBINSON(T)						00:35:00	0	4.37
KGR-WATERVAL	7750	2	CENTRAL	WESRAND	12:22:00	12:22:00	00:02:00			ROBINSON(T)						00:35:00	0	2.33
KGR-WATERVAL	7750	2	CENTRAL	MILLSITE	12:24:00	12:24:00	00:02:00			ROBINSON(T)						00:35:00	0	2.2
KGR-WATERVAL	7750	2	CENTRAL	CENTRAL	12:29:00	12:29:00	00:05:00			ROBINSON(T)						00:35:00	0	1.61
KGR-WATERVAL	7750	2	CENTRAL	ROBINSON(T)	12:35:00	00:00:00	00:06:00		RT	ROBINSON(T)						00:35:00	0	2.7
KGR-WATERVAL	7785	1	CENTRAL	KGR-WATERVAL		14:20:00				KASERNE	14:20:00	15:31:00	3	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	01:11:00	0	
KGR-WATERVAL	7785	1	CENTRAL	KRUGERSDORP	14:32:00	14:32:00	00:12:00		B	KASERNE						01:11:00	0	4.37
KGR-WATERVAL	7785	2	CENTRAL	WINDSORMINE	14:34:00	14:34:00	00:02:00			KASERNE						01:11:00	0	1.06
KGR-WATERVAL	7785	2	CENTRAL	LANWEN	14:35:00	14:35:00	00:01:00			KASERNE						01:11:00	0	1.37
KGR-WATERVAL	7785	2	CENTRAL	LUIPAARDSVLEI	14:37:00	14:37:00	00:02:00			KASERNE						01:11:00	0	1.9
KGR-WATERVAL	7785	3	CENTRAL	WITPOORTJIE	14:39:00	14:39:00	00:02:00			KASERNE						01:11:00	0	2.08
KGR-WATERVAL	7785	3	CONTAINER	PRINCESS	14:40:00	14:40:00	00:01:00			KASERNE						01:11:00	0	2.37
KGR-WATERVAL	7785	3	CONTAINER	HORISON	14:42:00	14:42:00	00:02:00			KASERNE						01:11:00	0	1.91
KGR-WATERVAL	7785	3	CENTRAL	ROODEPOORT	14:47:00	14:47:00	00:05:00			KASERNE						01:11:00	0	1.52
KGR-WATERVAL	7785	4	CONTAINER	GEORGINIA	14:49:00	14:49:00	00:02:00			KASERNE						01:11:00	0	1.35
KGR-WATERVAL	7785	4	CENTRAL	HAMBERG	14:51:00	14:51:00	00:02:00			KASERNE						01:11:00	0	1.38
KGR-WATERVAL	7785	4	CENTRAL	FLORIDA	14:53:00	14:53:00	00:02:00			KASERNE						01:11:00	0	2.25
KGR-WATERVAL	7785	4	CENTRAL	UNIFIED	14:55:00	14:55:00	00:02:00			KASERNE						01:11:00	0	1.42
KGR-WATERVAL	7785	4	CENTRAL	MARAISBURG	14:57:00	14:57:00	00:02:00			KASERNE						01:11:00	0	1.37
KGR-WATERVAL	7785	4	CENTRAL	BOSMONT	14:58:00	14:58:00	00:01:00			KASERNE						01:11:00	0	1.19
KGR-WATERVAL	7785	4	CENTRAL	NEWCLARE	14:59:00	14:59:00	00:01:00			KASERNE						01:11:00	0	1.2
KGR-WATERVAL	7785	4	CENTRAL	WESTBURY	15:00:00	15:00:00	00:01:00			KASERNE						01:11:00	0	0.66
KGR-WATERVAL	7785	4	CENTRAL	INDUSTRIA	15:01:00	15:01:00	00:01:00			KASERNE						01:11:00	0	1.75
KGR-WATERVAL	7785	4	CENTRAL	LLA-LANGLAAGTEWES	15:02:00	15:02:00	00:01:00			KASERNE						01:11:00	0	0.7
KGR-WATERVAL	7785	5	CENTRAL	PAARLSHOOP	15:05:00	15:05:00	00:03:00			KASERNE						01:11:00	0	2.56
KGR-WATERVAL	7785	5	CENTRAL	CROWN	15:12:00	15:12:00	00:07:00			KASERNE						01:11:00	0	2.39
KGR-WATERVAL	7785	6	CENTRAL	BOOYSENS	15:15:00	15:15:00	00:03:00			KASERNE						01:11:00	0	2.85
KGR-WATERVAL	7785	7	CONTAINER	KASERNE	15:31:00	00:00:00	00:16:00		RT	KASERNE						01:11:00	0	3.83
KGR-WATERVAL	7791	1	CENTRAL	KGR-WATERVAL		23:45:00				KASERNE	23:45:00	00:56:00	3	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	01:11:00	0	
KGR-WATERVAL	7791	1	CENTRAL	KRUGERSDORP	23:57:00	23:57:00	00:12:00		B	KASERNE						01:11:00	0	4.37
KGR-WATERVAL	7791	2	CENTRAL	WINDSORMINE	23:59:00	23:59:00	00:02:00			KASERNE						01:11:00	0	1.06
KGR-WATERVAL	7791	2	CENTRAL	LANWEN	00:00:00	00:00:00	00:01:00			KASERNE						01:11:00	1	1.37
KGR-WATERVAL	7791	2	CENTRAL	LUIPAARDSVLEI	00:02:00	00:02:00	00:02:00			KASERNE						01:11:00	1	1.9
KGR-WATERVAL	7791	3	CENTRAL	WITPOORTJIE	00:04:00	00:04:00	00:02:00			KASERNE						01:11:00	1	2.08
KGR-WATERVAL	7791	3	CONTAINER	PRINCESS	00:05:00	00:05:00	00:01:00			KASERNE						01:11:00	1	2.37
KGR-WATERVAL	7791	3	CONTAINER	HORISON	00:07:00	00:07:00	00:02:00			KASERNE						01:11:00	1	1.91
KGR-WATERVAL	7791	3	CENTRAL	ROODEPOORT	00:12:00	00:12:00	00:05:00			KASERNE						01:11:00	1	1.52
KGR-WATERVAL	7791	4	CONTAINER	GEORGINIA	00:14:00	00:14:00	00:02:00			KASERNE						01:11:00	1	1.35
KGR-WATERVAL	7791	4	CENTRAL	HAMBERG	00:16:00	00:16:00	00:02:00			KASERNE						01:11:00	1	1.38
KGR-WATERVAL	7791	4	CENTRAL	FLORIDA	00:18:00	00:18:00	00:02:00			KASERNE						01:11:00	1	2.25
KGR-WATERVAL	7791	4	CENTRAL	UNIFIED	00:20:00	00:20:00	00:02:00			KASERNE						01:11:00	1	1.42
KGR-WATERVAL	7791	4	CENTRAL	MARAISBURG	00:22:00	00:22:00	00:02:00			KASERNE						01:11:00	1	1.37
KGR-WATERVAL	7791	4	CENTRAL	BOSMONT	00:23:00	00:23:00	00:01:00			KASERNE						01:11:00	1	1.19
KGR-WATERVAL	7791	4	CENTRAL	NEWCLARE	00:24:00	00:24:00	00:01:00			KASERNE						01:11:00	1	1.2
KGR-WATERVAL	7791	4	CENTRAL	WESTBURY	00:25:00	00:25:00	00:01:00			KASERNE						01:11:00	1	0.66
KGR-WATERVAL	7791	4	CENTRAL	INDUSTRIA	00:26:00	00:26:00	00:01:00			KASERNE						01:11:00	1	1.75
KGR-WATERVAL	7791	4	CENTRAL	LLA-LANGLAAGTEWES	00:27:00	00:27:00	00:01:00			KASERNE						01:11:00	1	0.7
KGR-WATERVAL	7791	5	CENTRAL	PAARLSHOOP	00:30:00	00:30:00	00:03:00			KASERNE						01:11:00	1	2.56
KGR-WATERVAL	7791	5	CENTRAL	CROWN	00:37:00	00:37:00	00:07:00			KASERNE						01:11:00	1	2.39
KGR-WATERVAL	7791	6	CENTRAL	BOOYSENS	00:40:00	00:40:00	00:03:00			KASERNE						01:11:00	1	2.85
KGR-WATERVAL	7791	7	CONTAINER	KASERNE	00:56:00	00:00:00	00:16:00		RT	KASERNE						01:11:00	1	3.83
KGR-WATERVAL	7999	1	CENTRAL	KGR-WATERVAL		14:00:00				ROBINSON(T)	14:00:00	14:25:00	2	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:25:00	0	
KGR-WATERVAL	7999	1	CENTRAL	KRUGERSDORP	14:10:00	14:10:00	00:10:00		B	ROBINSON(T)						00:25:00	0	4.37
KGR-WATERVAL	7999	2	CENTRAL	WESRAND	14:12:00	14:12:00	00:02:00			ROBINSON(T)						00:25:00	0	2.33
KGR-WATERVAL	7999	2	CENTRAL	MILLSITE	14:14:00	14:14:00	00:02:00			ROBINSON(T)						00:25:00	0	2.2
KGR-WATERVAL	7999	2	CENTRAL	CENTRAL	14:19:00	14:19:00	00:05:00			ROBINSON(T)						00:25:00	0	1.61
KGR-WATERVAL	7999	2	CENTRAL	ROBINSON(T)	14:25:00	00:00:00	00:06:00		RT	ROBINSON(T)						00:25:00	0	2.7
KGR-WATERVAL	8456	1	CENTRAL	KGR-WATERVAL		12:45:00				LANGLAAGTE	12:45:00	13:28:00	3	NNNNNNN	VACUUM TRAINS/VACUUM TRAIN	00:43:00	0	
KGR-WATERVAL	8456	1	CENTRAL	KRUGERSDORP	12:57:00	12:57:00	00:12:00		B	LANGLAAGTE						00:43:00	0	4.37
KGR-WATERVAL	8456	2	CENTRAL	WINDSORMINE	12:59:00	12:59:00	00:02:00			LANGLAAGTE						00:43:00	0	1.06
KGR-WATERVAL	8456	2	CENTRAL	LANWEN	13:00:00	13:00:00	00:01:00			LANGLAAGTE						00:43:00	0	1.37
KGR-WATERVAL	8456	2	CENTRAL	LUIPAARDSVLEI	13:02:00	13:02:00	00:02:00			LANGLAAGTE						00:43:00	0	1.9
KGR-WATERVAL	8456	3	CENTRAL	WITPOORTJIE	13:04:00	13:04:00	00:02:00			LANGLAAGTE						00:43:00	0	2.08
KGR-WATERVAL	8456	3	CONTAINER	PRINCESS	13:05:00	13:05:00	00:01:00			LANGLAAGTE						00:43:00	0	2.37
KGR-WATERVAL	8456	3	CONTAINER	HORISON	13:07:00	13:07:00	00:02:00			LANGLAAGTE						00:43:00	0	1.91
KGR-WATERVAL	8456	3	CENTRAL	ROODEPOORT	13:12:00	13:12:00	00:05:00			LANGLAAGTE						00:43:00	0	1.52
KGR-WATERVAL	8456	4	CONTAINER	GEORGINIA	13:14:00	13:14:00	00:02:00			LANGLAAGTE						00:43:00	0	1.35
KGR-WATERVAL	8456	4	CENTRAL	HAMBERG	13:16:00	13:16:00	00:02:00			LANGLAAGTE						00:43:00	0	1.38
KGR-WATERVAL	8456	4	CENTRAL	FLORIDA	13:18:00	13:18:00	00:02:00			LANGLAAGTE						00:43:00	0	2.25
KGR-WATERVAL	8456	4	CENTRAL	UNIFIED	13:20:00	13:20:00	00:02:00			LANGLAAGTE						00:43:00	0	1.42
KGR-WATERVAL	8456	4	CENTRAL	MARAISBURG	13:22:00	13:22:00	00:02:00			LANGLAAGTE						00:43:00	0	1.37
KGR-WATERVAL	8456	4	CENTRAL	BOSMONT	13:23:00	13:23:00	00:01:00			LANGLAAGTE						00:43:00	0	1.19
KGR-WATERVAL	8456	4	CENTRAL	NEWCLARE	13:24:00	13:24:00	00:01:00			LANGLAAGTE						00:43:00	0	1.2
KGR-WATERVAL	8456	4	CENTRAL	WESTBURY	13:25:00	13:25:00	00:01:00			LANGLAAGTE						00:43:00	0	0.66
KGR-WATERVAL	8456	4	CENTRAL	INDUSTRIA	13:26:00	13:26:00	00:01:00			LANGLAAGTE						00:43:00	0	1.75
KGR-WATERVAL	8456	4	CENTRAL	LLA-LANGLAAGTEWES	13:27:00	13:27:00	00:01:00			LANGLAAGTE						00:43:00	0	0.7
KGR-WATERVAL	8456	5	CENTRAL	LANGLAAGTE	13:28:00	00:00:00	00:01:00		RT	LANGLAAGTE						00:43:00	0	0.39
KGR-WATERVAL	8633	1	CENTRAL	KGR-WATERVAL		21:55:00				KASERNE	21:55:00	23:05:00	2	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:10:00	0	
KGR-WATERVAL	8633	1	CENTRAL	KRUGERSDORP	22:07:30	22:07:30	00:12:30		C	KASERNE						01:10:00	0	4.37
KGR-WATERVAL	8633	2	CENTRAL	WINDSORMINE	22:09:30	22:09:30	00:02:00			KASERNE						01:10:00	0	1.06
KGR-WATERVAL	8633	2	CENTRAL	LANWEN	22:10:30	22:10:30	00:01:00			KASERNE						01:10:00	0	1.37
KGR-WATERVAL	8633	2	CENTRAL	LUIPAARDSVLEI	22:13:00	22:13:00	00:02:30			KASERNE						01:10:00	0	1.9
KGR-WATERVAL	8633	3	CENTRAL	WITPOORTJIE	22:15:00	22:15:00	00:02:00			KASERNE						01:10:00	0	2.08
KGR-WATERVAL	8633	3	CONTAINER	PRINCESS	22:16:00	22:16:00	00:01:00			KASERNE						01:10:00	0	2.37
KGR-WATERVAL	8633	3	CONTAINER	HORISON	22:18:00	22:18:00	00:02:00			KASERNE						01:10:00	0	1.91
KGR-WATERVAL	8633	3	CENTRAL	ROODEPOORT	22:21:30	22:21:30	00:03:30			KASERNE						01:10:00	0	1.52
KGR-WATERVAL	8633	4	CONTAINER	GEORGINIA	22:21:30	22:21:30				KASERNE						01:10:00	0	1.35
KGR-WATERVAL	8633	4	CENTRAL	HAMBERG	22:21:30	22:21:30				KASERNE						01:10:00	0	1.38
KGR-WATERVAL	8633	4	CENTRAL	FLORIDA	22:21:30	22:21:30				KASERNE						01:10:00	0	2.25
KGR-WATERVAL	8633	4	CENTRAL	UNIFIED	22:21:30	22:21:30				KASERNE						01:10:00	0	1.42
KGR-WATERVAL	8633	4	CENTRAL	MARAISBURG	22:29:30	22:29:30	00:08:00			KASERNE						01:10:00	0	1.37
KGR-WATERVAL	8633	4	CENTRAL	BOSMONT	22:29:30	22:29:30				KASERNE						01:10:00	0	1.19
KGR-WATERVAL	8633	4	CENTRAL	NEWCLARE	22:29:30	22:29:30				KASERNE						01:10:00	0	1.2
KGR-WATERVAL	8633	4	CENTRAL	WESTBURY	22:29:30	22:29:30				KASERNE						01:10:00	0	0.66
KGR-WATERVAL	8633	4	CENTRAL	INDUSTRIA	22:29:30	22:29:30				KASERNE						01:10:00	0	1.75
KGR-WATERVAL	8633	4	CENTRAL	LLA-LANGLAAGTEWES	22:35:30	22:35:30	00:06:00			KASERNE						01:10:00	0	0.7
KGR-WATERVAL	8633	5	CENTRAL	PAARLSHOOP	22:35:30	22:35:30				KASERNE						01:10:00	0	2.56
KGR-WATERVAL	8633	5	CENTRAL	CROWN	22:45:30	22:45:30	00:10:00			KASERNE						01:10:00	0	2.39
KGR-WATERVAL	8633	6	CENTRAL	BOOYSENS	22:49:00	22:49:00	00:03:30			KASERNE						01:10:00	0	2.85
KGR-WATERVAL	8633	7	CONTAINER	KASERNE	23:05:00	00:00:00	00:16:00		RT	KASERNE						01:10:00	0	3.83
KGR-WATERVAL	8918	1	CENTRAL	KGR-WATERVAL		09:00:00				MAFIKENG	09:00:00	21:00:00	1	CCYCYCY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	12:00:00	0	
KGR-WATERVAL	8918	1	CENTRAL	BATTERY	09:14:00	09:34:00	00:14:00	00:20:00	C SHUNT	MAFIKENG						12:00:00	0	6
KGR-WATERVAL	8918	2	CENTRAL	TARLTON	09:43:00	10:08:00	00:09:00	00:25:00	SHUNT	MAFIKENG						12:00:00	0	6.09
KGR-WATERVAL	8918	3	CENTRAL	ORIENT	10:18:00	10:18:00	00:10:00			MAFIKENG						12:00:00	0	9.3
KGR-WATERVAL	8918	3	CENTRAL	MOLONEY	10:28:00	10:28:00	00:10:00			MAFIKENG						12:00:00	0	2.2
KGR-WATERVAL	8918	3	CENTRAL	MAGALIESBURG	10:39:30	10:39:30	00:11:30			MAFIKENG						12:00:00	0	3.5
KGR-WATERVAL	8918	4	CENTRAL	SEEKMORE	10:43:30	10:43:30	00:04:00			MAFIKENG						12:00:00	0	5.29
KGR-WATERVAL	8918	4	CENTRAL	WATERSHED	10:43:30	10:43:30				MAFIKENG						12:00:00	0	2.1
KGR-WATERVAL	8918	4	CENTRAL	VLAKDRIF	10:57:00	10:57:00	00:13:30			MAFIKENG						12:00:00	0	3.1
KGR-WATERVAL	8918	4	CENTRAL	BREETSVLEI	11:01:00	11:01:00	00:04:00			MAFIKENG						12:00:00	0	6.59
KGR-WATERVAL	8918	4	CENTRAL	SYFERBULT	11:06:00	11:06:00	00:05:00			MAFIKENG						12:00:00	0	5.2
KGR-WATERVAL	8918	5	CENTRAL	BOONS	11:24:00	11:44:00	00:18:00	00:20:00	SHUNT	MAFIKENG						12:00:00	0	10.3
KGR-WATERVAL	8918	6	CENTRAL	MIDDELLAAGTE	11:44:00	11:44:00				MAFIKENG						12:00:00	0	3.79
KGR-WATERVAL	8918	6	CENTRAL	METZ	12:03:00	12:08:00	00:19:00	00:05:00	SHUNT	MAFIKENG						12:00:00	0	7.79
KGR-WATERVAL	8918	6	CENTRAL	DERBY	12:19:00	12:39:00	00:11:00	00:20:00	SHUNT	MAFIKENG						12:00:00	0	9
KGR-WATERVAL	8918	7	CENTRAL	DESSING	12:39:00	12:39:00				MAFIKENG						12:00:00	0	5.59
KGR-WATERVAL	8918	7	CENTRAL	SKERMUTSELING	12:52:00	12:52:00	00:13:00			MAFIKENG						12:00:00	0	3.89
KGR-WATERVAL	8918	7	CENTRAL	KOSTER	13:03:00	13:23:00	00:11:00	00:20:00	SHUNT	MAFIKENG						12:00:00	0	6.59
KGR-WATERVAL	8918	8	CENTRAL	CHIDIMA	13:42:30	13:42:30	00:19:30			MAFIKENG						12:00:00	0	13
KGR-WATERVAL	8918	8	CENTRAL	KLIPBANKFONTE	14:07:00	14:12:00	00:24:30	00:05:00	SHUNT	MAFIKENG						12:00:00	0	10.65
KGR-WATERVAL	8918	8	CENTRAL	SWARTRUGGENS	14:30:00	16:30:00	00:18:00	02:00:00	SHUNT LOCO CHANGE	MAFIKENG						12:00:00	0	12
KGR-WATERVAL	8918	1	CENTRAL	VLEIDRAAI	16:35:00	16:35:00	00:05:00			MAFIKENG						12:00:00	0	8.19
KGR-WATERVAL	8918	1	CENTRAL	RONDAWEL	16:40:00	16:40:00	00:05:00			MAFIKENG						12:00:00	0	6.5
KGR-WATERVAL	8918	1	CENTRAL	TWYFELSPOORT	17:09:30	17:09:30	00:29:30			MAFIKENG						12:00:00	0	4.79
KGR-WATERVAL	8918	1	CENTRAL	MANGOPE	17:09:30	17:09:30				MAFIKENG						12:00:00	0	5.59
KGR-WATERVAL	8918	1	CENTRAL	GROOTMARICO	17:25:00	17:40:00	00:15:30	00:15:00	SHUNT	MAFIKENG						12:00:00	0	6.2
KGR-WATERVAL	8918	1	CENTRAL	MARICOWES	17:47:00	17:47:00	00:07:00			MAFIKENG						12:00:00	0	1.6
KGR-WATERVAL	8918	1	CENTRAL	WILGEBOOMSPRU	17:59:00	17:59:00	00:12:00			MAFIKENG						12:00:00	0	10.9
KGR-WATERVAL	8918	1	CENTRAL	VAALKOP	18:01:00	18:01:00	00:02:00			MAFIKENG						12:00:00	0	5.9
KGR-WATERVAL	8918	1	CENTRAL	WOODBINE	18:09:00	18:09:00	00:08:00			MAFIKENG						12:00:00	0	2.79
KGR-WATERVAL	8918	1	CENTRAL	RENBAAN	18:09:00	18:09:00				MAFIKENG						12:00:00	0	5.7
KGR-WATERVAL	8918	1	CENTRAL	ZEERUST	18:33:30	18:33:30	00:24:30			MAFIKENG						12:00:00	0	10.4
KGR-WATERVAL	8918	2	CENTRAL	LUCERNE	18:52:30	19:20:00	00:19:00	00:27:30	SHUNT	MAFIKENG						12:00:00	0	11.59
KGR-WATERVAL	8918	3	CENTRAL	SENDELINGSPOS	19:20:00	19:20:00				MAFIKENG						12:00:00	0	4.29
KGR-WATERVAL	8918	3	CENTRAL	BUFFELSHOEK	19:20:00	19:20:00				MAFIKENG						12:00:00	0	3.79
KGR-WATERVAL	8918	3	CENTRAL	WINDHEUWEL	19:20:00	19:20:00				MAFIKENG						12:00:00	0	5.29
KGR-WATERVAL	8918	3	CENTRAL	OTTOSHOOP	19:48:00	19:48:00	00:28:00			MAFIKENG						12:00:00	0	5.2
KGR-WATERVAL	8918	3	CENTRAL	SEEKOEI	19:48:00	19:48:00				MAFIKENG						12:00:00	0	6
KGR-WATERVAL	8918	3	CENTRAL	SLURRY	20:05:00	20:07:00	00:17:00	00:02:00	SHUNT	MAFIKENG						12:00:00	0	8.4
KGR-WATERVAL	8918	4	CENTRAL	SLR/S749044	20:08:00	20:11:00	00:01:00	00:03:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	8918	5	CENTRAL	SLURRY	20:12:00	20:18:00	00:01:00	00:06:00	SHUNT	MAFIKENG						12:00:00	0	0.97
KGR-WATERVAL	8918	6	CENTRAL	BUHRMANNSDRIF	20:21:00	20:29:00	00:03:00	00:08:00	SHUNT	MAFIKENG						12:00:00	0	4.79
KGR-WATERVAL	8918	7	CENTRAL	COWANSPOST	20:34:00	20:34:00	00:05:00			MAFIKENG						12:00:00	0	4.29
KGR-WATERVAL	8918	7	CENTRAL	MACMULLINS	20:44:00	20:44:00	00:10:00			MAFIKENG						12:00:00	0	6.29
KGR-WATERVAL	8918	7	CENTRAL	MAFIKENG	21:00:00	00:00:00	00:16:00		FD	MAFIKENG						12:00:00	0	6.2
KGR-WATERVAL	8957	1	CENTRAL	KGR-WATERVAL		01:05:00				KASERNE	01:05:00	03:20:00	3	YYCYYYC	MEDIUM HEAVY/MEDIUM HEAVY	02:15:00	0	
KGR-WATERVAL	8957	1	CENTRAL	KRUGERSDORP	01:21:00	01:21:00	00:16:00		C	KASERNE						02:15:00	0	4.37
KGR-WATERVAL	8957	2	CENTRAL	WINDSORMINE	01:23:00	01:23:00	00:02:00			KASERNE						02:15:00	0	1.06
KGR-WATERVAL	8957	2	CENTRAL	LANWEN	01:24:00	01:24:00	00:01:00			KASERNE						02:15:00	0	1.37
KGR-WATERVAL	8957	2	CENTRAL	LUIPAARDSVLEI	01:26:00	01:26:00	00:02:00			KASERNE						02:15:00	0	1.9
KGR-WATERVAL	8957	3	CENTRAL	WITPOORTJIE	01:28:00	01:28:00	00:02:00			KASERNE						02:15:00	0	2.08
KGR-WATERVAL	8957	3	CONTAINER	PRINCESS	01:29:00	01:29:00	00:01:00			KASERNE						02:15:00	0	2.37
KGR-WATERVAL	8957	3	CONTAINER	HORISON	01:31:00	01:31:00	00:02:00			KASERNE						02:15:00	0	1.91
KGR-WATERVAL	8957	3	CENTRAL	ROODEPOORT	01:36:00	01:36:00	00:05:00			KASERNE						02:15:00	0	1.52
KGR-WATERVAL	8957	4	CONTAINER	GEORGINIA	01:38:00	01:38:00	00:02:00			KASERNE						02:15:00	0	1.35
KGR-WATERVAL	8957	4	CENTRAL	HAMBERG	01:40:00	01:40:00	00:02:00			KASERNE						02:15:00	0	1.38
KGR-WATERVAL	8957	4	CENTRAL	FLORIDA	01:42:00	01:42:00	00:02:00			KASERNE						02:15:00	0	2.25
KGR-WATERVAL	8957	4	CENTRAL	UNIFIED	01:44:00	01:44:00	00:02:00			KASERNE						02:15:00	0	1.42
KGR-WATERVAL	8957	4	CENTRAL	MARAISBURG	01:46:00	01:46:00	00:02:00			KASERNE						02:15:00	0	1.37
KGR-WATERVAL	8957	4	CENTRAL	BOSMONT	01:47:00	01:47:00	00:01:00			KASERNE						02:15:00	0	1.19
KGR-WATERVAL	8957	4	CENTRAL	NEWCLARE	01:48:00	01:48:00	00:01:00			KASERNE						02:15:00	0	1.2
KGR-WATERVAL	8957	4	CENTRAL	WESTBURY	01:49:00	01:49:00	00:01:00			KASERNE						02:15:00	0	0.66
KGR-WATERVAL	8957	4	CENTRAL	INDUSTRIA	01:50:00	01:50:00	00:01:00			KASERNE						02:15:00	0	1.75
KGR-WATERVAL	8957	4	CENTRAL	LLA-LANGLAAGTEWES	01:55:00	01:55:00	00:05:00			KASERNE						02:15:00	0	0.7
KGR-WATERVAL	8957	5	CENTRAL	LANGLAAGTE	02:00:00	02:30:00	00:05:00	00:30:00	SHUNT + TURN LOAD	KASERNE						02:15:00	0	0.39
KGR-WATERVAL	8957	6	CENTRAL	LLA-LANGLAAGTEWES	02:35:00	02:35:00	00:05:00			KASERNE						02:15:00	0	0.39
KGR-WATERVAL	8957	7	CENTRAL	PAARLSHOOP	02:45:00	02:45:00	00:10:00			KASERNE						02:15:00	0	2.56
KGR-WATERVAL	8957	7	CENTRAL	CROWN	02:57:00	02:57:00	00:12:00			KASERNE						02:15:00	0	2.39
KGR-WATERVAL	8957	8	CENTRAL	BOOYSENS	03:03:00	03:03:00	00:06:00			KASERNE						02:15:00	0	2.85
KGR-WATERVAL	8957	9	CONTAINER	KASERNE	03:20:00	00:00:00	00:17:00		RT	KASERNE						02:15:00	0	3.83
KGR-WATERVAL	8974	1	CENTRAL	KGR-WATERVAL		23:00:00				MEYERTON	23:00:00	11:31:00	1	CYCYYYY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	12:31:00	0	
KGR-WATERVAL	8974	1	CENTRAL	KRUGERSDORP	23:12:00	01:12:00	00:12:00	02:00:00	C LOCO CHANGE	MEYERTON						12:31:00	0	4.37
KGR-WATERVAL	8974	1	CENTRAL	WESRAND	01:15:00	01:15:00	00:03:00			MEYERTON						12:31:00	0	2.33
KGR-WATERVAL	8974	1	CENTRAL	MILLSITE	01:17:00	01:17:00	00:02:00			MEYERTON						12:31:00	0	2.2
KGR-WATERVAL	8974	1	CENTRAL	CENTRAL	01:18:30	01:18:30	00:01:30			MEYERTON						12:31:00	0	1.61
KGR-WATERVAL	8974	1	CENTRAL	ROBINSON(T)	01:23:00	01:23:00	00:04:30			MEYERTON						12:31:00	0	2.7
KGR-WATERVAL	8974	2	CENTRAL	HOMELAKE	01:27:00	01:27:00	00:04:00			MEYERTON						12:31:00	0	3.64
KGR-WATERVAL	8974	2	CENTRAL	RANDFONTEIN	01:32:00	01:52:00	00:05:00	00:20:00	CRANKING	MEYERTON						12:31:00	0	5.16
KGR-WATERVAL	8974	3	CENTRAL	MIDDELVLEI	02:04:00	02:04:00	00:12:00			MEYERTON						12:31:00	0	13.41
KGR-WATERVAL	8974	4	CENTRAL	VLEIKOP	02:15:00	02:15:00	00:11:00			MEYERTON						12:31:00	0	10.58
KGR-WATERVAL	8974	4	CENTRAL	BANK	02:27:30	02:42:00	00:12:30	00:14:30	CRANKING	MEYERTON						12:31:00	0	14.35
KGR-WATERVAL	8974	5	CENTRAL	MAIZELANDS	02:52:30	02:52:30	00:10:30			MEYERTON						12:31:00	0	11.68
KGR-WATERVAL	8974	5	CENTRAL	OBERHOLZER	03:01:00	03:16:00	00:08:30	00:15:00	CRANKING	MEYERTON						12:31:00	0	7.8
KGR-WATERVAL	8974	6	CENTRAL	SPANUIT	03:28:30	03:28:30	00:12:30			MEYERTON						12:31:00	0	14.3
KGR-WATERVAL	8974	7	CENTRAL	WELVERDIEND	03:32:30	03:43:00	00:04:00	00:10:30	CRANKING	MEYERTON						12:31:00	0	4.3
KGR-WATERVAL	8974	8	CENTRAL	GATSRAND	03:57:00	03:57:00	00:14:00			MEYERTON						12:31:00	0	14.5
KGR-WATERVAL	8974	9	CENTRAL	FREDERIKSTAD	04:05:30	04:05:30	00:08:30			MEYERTON						12:31:00	0	9.18
KGR-WATERVAL	8974	9	CENTRAL	BOSKOP	04:11:30	04:11:30	00:06:00			MEYERTON						12:31:00	0	6.46
KGR-WATERVAL	8974	10	CENTRAL	SAFARCAMP	04:23:30	04:23:30	00:12:00			MEYERTON						12:31:00	0	12.48
KGR-WATERVAL	8974	11	CENTRAL	CACHET	04:26:00	04:26:00	00:02:30			MEYERTON						12:31:00	0	2.56
KGR-WATERVAL	8974	12	CENTRAL	POTCHEFSTROOM	04:30:00	08:00:00	00:04:00	03:30:00	SHUNT TURN LOAD	MEYERTON						12:31:00	0	2.6
KGR-WATERVAL	8974	1	CENTRAL	CACHET	08:01:00	08:06:00	00:01:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	2.6
KGR-WATERVAL	8974	2	CENTRAL	TARENTAAL	08:21:00	08:26:00	00:15:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	9.08
KGR-WATERVAL	8974	2	CENTRAL	KLIPDRIF	08:37:00	08:42:00	00:11:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	9.75
KGR-WATERVAL	8974	2	CENTRAL	ENSELSPRUIT	08:56:00	09:01:00	00:14:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	14.5
KGR-WATERVAL	8974	3	CENTRAL	FOCHVILLE	09:18:00	09:23:00	00:17:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	13.18
KGR-WATERVAL	8974	3	CENTRAL	MICHAELSRAAD	09:37:00	09:42:00	00:14:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	10.93
KGR-WATERVAL	8974	3	CENTRAL	RAATHSVLEI	09:48:00	09:48:00	00:06:00			MEYERTON						12:31:00	0	4.88
KGR-WATERVAL	8974	4	CENTRAL	BLOEKOMHEUNING	09:49:00	09:54:00	00:01:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	7.78
KGR-WATERVAL	8974	4		VANDERBIJL	10:11:00	10:16:00	00:17:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	7.95
KGR-WATERVAL	8974	4	CENTRAL	VANDERBIJLPAR	10:17:00	10:22:00	00:01:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	1
KGR-WATERVAL	8974	4	CENTRAL	HOUTHEUWEL	10:29:00	10:34:00	00:07:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	5.34
KGR-WATERVAL	8974	5	CENTRAL	KLEIGROND	10:35:00	10:40:00	00:01:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	4.38
KGR-WATERVAL	8974	6	CENTRAL	LEEUHOF	10:51:00	10:56:00	00:11:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	3.06
KGR-WATERVAL	8974	7	CENTRAL	DUNCANVILLE	10:58:00	11:03:00	00:02:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	3.12
KGR-WATERVAL	8974	7	CENTRAL	VER-NOORD	11:05:00	11:10:00	00:02:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	0.98
KGR-WATERVAL	8974	8	CENTRAL	ALLOY	11:11:00	11:16:00	00:01:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	1.55
KGR-WATERVAL	8974	8	CENTRAL	REDAN	11:17:00	11:22:00	00:01:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	3.97
KGR-WATERVAL	8974	9	CENTRAL	KOOKRUS	11:24:00	11:29:00	00:02:00	00:05:00	CRANKING	MEYERTON						12:31:00	0	5.11
KGR-WATERVAL	8974	9	CENTRAL	MEYERTON	11:31:00	00:00:00	00:02:00		CRANKING	MEYERTON						12:31:00	0	3.91
KGR-WATERVAL	8977	1	CENTRAL	KGR-WATERVAL		13:00:00				KASERNE	13:00:00	14:10:00	1	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:10:00	0	
KGR-WATERVAL	8977	1	CENTRAL	KRUGERSDORP	13:12:30	13:12:30	00:12:30		C	KASERNE						01:10:00	0	4.37
KGR-WATERVAL	8977	2	CENTRAL	WINDSORMINE	13:13:30	13:13:30	00:01:00			KASERNE						01:10:00	0	1.06
KGR-WATERVAL	8977	2	CENTRAL	LANWEN	13:15:30	13:15:30	00:02:00			KASERNE						01:10:00	0	1.37
KGR-WATERVAL	8977	2	CENTRAL	LUIPAARDSVLEI	13:18:00	13:18:00	00:02:30			KASERNE						01:10:00	0	1.9
KGR-WATERVAL	8977	3	CENTRAL	WITPOORTJIE	13:19:47	13:19:47	00:01:47			KASERNE						01:10:00	0	2.08
KGR-WATERVAL	8977	3	CONTAINER	PRINCESS	13:21:34	13:21:34	00:01:47			KASERNE						01:10:00	0	2.37
KGR-WATERVAL	8977	3	CONTAINER	HORISON	13:22:54	13:22:54	00:01:20			KASERNE						01:10:00	0	1.91
KGR-WATERVAL	8977	3	CENTRAL	ROODEPOORT	13:26:30	13:26:30	00:03:36			KASERNE						01:10:00	0	1.52
KGR-WATERVAL	8977	4	CONTAINER	GEORGINIA	13:28:30	13:28:30	00:02:00			KASERNE						01:10:00	0	1.35
KGR-WATERVAL	8977	4	CENTRAL	HAMBERG	13:30:30	13:30:30	00:02:00			KASERNE						01:10:00	0	1.38
KGR-WATERVAL	8977	4	CENTRAL	FLORIDA	13:31:30	13:31:30	00:01:00			KASERNE						01:10:00	0	2.25
KGR-WATERVAL	8977	4	CENTRAL	UNIFIED	13:32:30	13:32:30	00:01:00			KASERNE						01:10:00	0	1.42
KGR-WATERVAL	8977	4	CENTRAL	MARAISBURG	13:34:30	13:34:30	00:02:00			KASERNE						01:10:00	0	1.37
KGR-WATERVAL	8977	4	CENTRAL	BOSMONT	13:35:30	13:35:30	00:01:00			KASERNE						01:10:00	0	1.19
KGR-WATERVAL	8977	4	CENTRAL	NEWCLARE	13:36:29	13:36:29	00:00:59			KASERNE						01:10:00	0	1.2
KGR-WATERVAL	8977	4	CENTRAL	WESTBURY	13:37:29	13:37:29	00:01:00			KASERNE						01:10:00	0	0.66
KGR-WATERVAL	8977	4	CENTRAL	INDUSTRIA	13:38:29	13:38:29	00:01:00			KASERNE						01:10:00	0	1.75
KGR-WATERVAL	8977	4	CENTRAL	LLA-LANGLAAGTEWES	13:40:30	13:40:30	00:02:01			KASERNE						01:10:00	0	0.7
KGR-WATERVAL	8977	5	CENTRAL	PAARLSHOOP	13:43:30	13:43:30	00:03:00			KASERNE						01:10:00	0	2.56
KGR-WATERVAL	8977	5	CENTRAL	CROWN	13:50:30	13:50:30	00:07:00			KASERNE						01:10:00	0	2.39
KGR-WATERVAL	8977	6	CENTRAL	BOOYSENS	13:54:00	13:54:00	00:03:30			KASERNE						01:10:00	0	2.85
KGR-WATERVAL	8977	7	CONTAINER	KASERNE	14:10:00	00:00:00	00:16:00		RT	KASERNE						01:10:00	0	3.83
KGR-WATERVAL	13017	1	CENTRAL	KGR-WATERVAL		21:55:00				KASERNE	21:55:00	23:12:00	2	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:17:00	0	
KGR-WATERVAL	13017	1	CENTRAL	KRUGERSDORP	22:08:00	22:08:00	00:13:00		B	KASERNE						01:17:00	0	4.37
KGR-WATERVAL	13017	2	CENTRAL	WINDSORMINE	22:10:00	22:10:00	00:02:00			KASERNE						01:17:00	0	1.06
KGR-WATERVAL	13017	2	CENTRAL	LANWEN	22:11:00	22:11:00	00:01:00			KASERNE						01:17:00	0	1.37
KGR-WATERVAL	13017	2	CENTRAL	LUIPAARDSVLEI	22:14:00	22:19:00	00:03:00	00:05:00	SHUNT	KASERNE						01:17:00	0	1.9
KGR-WATERVAL	13017	3	CENTRAL	WITPOORTJIE	22:21:00	22:21:00	00:02:00			KASERNE						01:17:00	0	2.08
KGR-WATERVAL	13017	3	CONTAINER	PRINCESS	22:22:00	22:22:00	00:01:00			KASERNE						01:17:00	0	2.37
KGR-WATERVAL	13017	3	CONTAINER	HORISON	22:24:00	22:24:00	00:02:00			KASERNE						01:17:00	0	1.91
KGR-WATERVAL	13017	3	CENTRAL	ROODEPOORT	22:27:30	22:27:30	00:03:30			KASERNE						01:17:00	0	1.52
KGR-WATERVAL	13017	4	CONTAINER	GEORGINIA	22:29:30	22:29:30	00:02:00			KASERNE						01:17:00	0	1.35
KGR-WATERVAL	13017	4	CENTRAL	HAMBERG	22:30:30	22:30:30	00:01:00			KASERNE						01:17:00	0	1.38
KGR-WATERVAL	13017	4	CENTRAL	FLORIDA	22:32:30	22:32:30	00:02:00			KASERNE						01:17:00	0	2.25
KGR-WATERVAL	13017	4	CENTRAL	UNIFIED	22:33:30	22:33:30	00:01:00			KASERNE						01:17:00	0	1.42
KGR-WATERVAL	13017	4	CENTRAL	MARAISBURG	22:35:30	22:35:30	00:02:00			KASERNE						01:17:00	0	1.37
KGR-WATERVAL	13017	4	CENTRAL	BOSMONT	22:36:30	22:36:30	00:01:00			KASERNE						01:17:00	0	1.19
KGR-WATERVAL	13017	4	CENTRAL	NEWCLARE	22:37:30	22:37:30	00:01:00			KASERNE						01:17:00	0	1.2
KGR-WATERVAL	13017	4	CENTRAL	WESTBURY	22:38:30	22:38:30	00:01:00			KASERNE						01:17:00	0	0.66
KGR-WATERVAL	13017	4	CENTRAL	INDUSTRIA	22:39:30	22:39:30	00:01:00			KASERNE						01:17:00	0	1.75
KGR-WATERVAL	13017	4	CENTRAL	LLA-LANGLAAGTEWES	22:41:30	22:41:30	00:02:00			KASERNE						01:17:00	0	0.7
KGR-WATERVAL	13017	5	CENTRAL	PAARLSHOOP	22:46:30	22:46:30	00:05:00			KASERNE						01:17:00	0	2.56
KGR-WATERVAL	13017	5	CENTRAL	CROWN	22:51:30	22:51:30	00:05:00			KASERNE						01:17:00	0	2.39
KGR-WATERVAL	13017	6	CENTRAL	BOOYSENS	22:55:00	22:55:00	00:03:30			KASERNE						01:17:00	0	2.85
KGR-WATERVAL	13017	7	CONTAINER	KASERNE	23:12:00	00:00:00	00:17:00		RT	KASERNE						01:17:00	0	3.83
WAPADSKLOOF	10	1	NORTHEAST	WAPADSKLOOF		09:50:00				WAPADSKLOOF	09:50:00	10:06:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:16:00	0	
WAPADSKLOOF	10	1	NORTHEAST	WDF/S840092	09:51:00	09:51:00	00:01:00			WAPADSKLOOF						00:16:00	0	0.97
WAPADSKLOOF	10	1	NORTHEAST	WDF/S848727	09:52:00	10:02:00	00:01:00	00:10:00	SHUNT	WAPADSKLOOF						00:16:00	0	0.97
WAPADSKLOOF	10	1	NORTHEAST	WDF/S845043	10:03:00	10:03:00	00:01:00			WAPADSKLOOF						00:16:00	0	0.97
WAPADSKLOOF	10	2	NORTHEAST	WDF/S848727	10:04:00	10:04:00	00:01:00			WAPADSKLOOF						00:16:00	0	0.97
WAPADSKLOOF	10	2	NORTHEAST	WDF/S840092	10:05:00	10:05:00	00:01:00			WAPADSKLOOF						00:16:00	0	0.97
WAPADSKLOOF	10	2	NORTHEAST	WAPADSKLOOF	10:06:00	00:00:00	00:01:00			WAPADSKLOOF						00:16:00	0	0.97
WAPADSKLOOF	20	1	NORTHEAST	WAPADSKLOOF		11:00:00				WAPADSKLOOF	11:00:00	11:16:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:16:00	0	
WAPADSKLOOF	20	1	NORTHEAST	WDF/S840092	11:01:00	11:01:00	00:01:00			WAPADSKLOOF						00:16:00	0	0.97
WAPADSKLOOF	20	1	NORTHEAST	WDF/S848727	11:02:00	11:12:00	00:01:00	00:10:00	SHUNT	WAPADSKLOOF						00:16:00	0	0.97
WAPADSKLOOF	20	1	NORTHEAST	WDF/S845043	11:13:00	11:13:00	00:01:00			WAPADSKLOOF						00:16:00	0	0.97
WAPADSKLOOF	20	2	NORTHEAST	WDF/S848727	11:14:00	11:14:00	00:01:00			WAPADSKLOOF						00:16:00	0	0.97
WAPADSKLOOF	20	2	NORTHEAST	WDF/S840092	11:15:00	11:15:00	00:01:00			WAPADSKLOOF						00:16:00	0	0.97
WAPADSKLOOF	20	2	NORTHEAST	WAPADSKLOOF	11:16:00	00:00:00	00:01:00			WAPADSKLOOF						00:16:00	0	0.97
`;

describe('an eleventh extract: KGR-WATERVAL and WAPADSKLOOF, and a train whose days were never counted', () => {
  const all = parseRunningTimes(B11);
  const byId = (id: string) => all.find((t) => t.train === id)!;
  type Sched = ReturnType<typeof byId>;
  const declared = (t: Sched) =>
    t.rows.reduce((n, r) => n + (r.pointToPointRuntime ?? 0), 0) +
    t.rows.reduce((n, r) => n + (r.standingTime ?? 0), 0);

  /**
   * Thirty-one trains: twenty-nine at KGR-WATERVAL and two at WAPADSKLOOF, a
   * new origin. Every one carries a summary row.
   */
  it('reads thirty-one trains across two origins', () => {
    expect(all).toHaveLength(31);
    expect(new Set(all.map((t) => t.origin))).toEqual(
      new Set(['KGR-WATERVAL', 'WAPADSKLOOF']),
    );
    expect(all.reduce((n, t) => n + t.rows.length, 0)).toBe(848 - 31);
    expect(all.every(hasSummary)).toBe(true);
    const numbers = all.map((t) => t.train);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('ties twenty-nine of thirty-one on the clock', () => {
    const adrift = all
      .filter((t) => {
        const v = validateSchedule(t);
        return !v.elapsedIdentityHolds || !v.throughputTies;
      })
      .map((t) => t.train)
      .sort();
    expect(adrift).toEqual(['7428']);
  });

  /**
   * 8974 crosses midnight and NOTHING SAYS SO.
   *
   * It departs 23:00 and the summary calls the run 12:31:00. Its rows pass
   * 01:12, 08:00 and arrive 11:31 — plainly the next day — yet every one of
   * the forty rows carries Depart_Day 0.
   *
   * This is not a subtle case. Three sibling trains run the identical opening
   * from the same 23:00 departure — KRUGERSDORP, arrive 23:12, two hours of
   * LOCO CHANGE, away at 01:12 — and 7224, 7228 and 7428 all carry 0 then 1.
   * Only 8974 does not. The stated runtime is right and the day column is
   * wrong, by exactly one day: 751 stated against an elapsed of MINUS 689.
   *
   * This strikes at the reason the library reads day offsets in the first
   * place. elapsedMinutes refuses the clock because a 3-hour run and a 27-hour
   * run are indistinguishable on a 24-hour face, and takes the span from the
   * offsets instead. Here the offsets are themselves absent, so the fallback
   * has nothing to stand on and returns a NEGATIVE elapsed time. A negative
   * duration is not a defect in the reader; it is the reader faithfully
   * reporting that the source contradicts itself.
   */
  it('rescues 8974 with the stale-offset correction, and that is the only thing holding it up', () => {
    const t = byId('8974');
    expect(t.rows).toHaveLength(39);
    expect(new Set(t.rows.map((r) => r.departDay))).toEqual(new Set([0]));
    expect(t.originDeparture).toBe(23 * 60);
    expect(t.destinationArrival).toBe(11 * 60 + 31);
    expect(t.throughputRuntime).toBe(751);

    // Taken literally, the offsets say the train arrived before it left.
    const last = t.rows.filter((r) => r.arrival != null).at(-1)!;
    const literal =
      last.arrival! + (last.departDay! - t.rows[0].departDay!) * 1440 - t.originDeparture;
    expect(literal).toBe(-689);

    // The correction adds the missing day back, and everything then ties.
    expect(elapsedMinutes(t)).toBe(751);
    expect(751 - literal).toBe(1440);
    expect(validateSchedule(t).throughputTies).toBe(true);
    expect(validateSchedule(t).elapsedIdentityHolds).toBe(true);

    // But spansDays reads the offsets directly and still says no.
    expect(spansDays(t)).toBe(false);
    expect(t.rows[1].arrival!).toBeLessThan(t.rows[0].arrival!); // 01:15 after 23:12
  });

  /**
   * The three siblings prove it is the offsets and not the timetable.
   *
   * All four leave KGR-WATERVAL at 23:00 and stand two hours at KRUGERSDORP
   * for a loco change. Three of them count the day over; the fourth does not.
   */
  it('carries the day over on 7224, 7228 and 7428 but not on 8974', () => {
    const quad = ['7224', '7228', '7428', '8974'].map(byId);
    for (const t of quad) {
      expect([t.train, t.originDeparture]).toEqual([t.train, 23 * 60]);
      const kd = t.rows[0];
      expect([t.train, kd.station, kd.arrival, kd.departure, kd.standingTime])
        .toEqual([t.train, 'KRUGERSDORP', 23 * 60 + 12, 72, 120]);
    }
    expect(quad.map((t) => [...new Set(t.rows.map((r) => r.departDay))].sort()))
      .toEqual([[0, 1], [0, 1], [0, 1], [0]]);
    for (const t of [quad[0], quad[1]]) {
      expect([t.train, validateSchedule(t).elapsedIdentityHolds]).toEqual([t.train, true]);
    }
    // 7428 fails for an unrelated reason, recorded in its own test below.
    expect(validateSchedule(quad[2]).elapsedIdentityHolds).toBe(false);
  });

  /**
   * 7428 records five minutes of standing at the end of the journey.
   *
   * Its last row is SASOLBURG, arriving 11:30:00, departure 00:00:00, eight
   * minutes of running — and a standing time of 00:05:00. It is the only
   * terminus row in the extract that carries one.
   *
   * The library deliberately will not treat a last row as a terminus when it
   * has a recorded standing time, because train 1710 departs HAMMARSDALE at a
   * real midnight with five minutes against it. That rule is right for 1710
   * and wrong for this row, and the two cases are not distinguishable from the
   * columns alone: both are a last-or-late row at 00:00:00 with five minutes
   * of standing.
   *
   * The consequence is recorded rather than patched. Weakening the terminus
   * test to ignore standing would re-break 1710 and the five POSTMASBURG-class
   * false positives it was written for; that trade is worse. So 7428 is a
   * known, named exception: one flagged standing mismatch and five minutes of
   * over-count, from one row.
   */
  it('counts five minutes it should not, on the one terminus row that carries standing', () => {
    const t = byId('7428');
    const last = t.rows[t.rows.length - 1];
    expect(last.station).toBe('SASOLBURG');
    expect(last.arrival).toBe(11 * 60 + 30);
    expect(last.departure).toBe(0);
    expect(last.standingTime).toBe(5);

    expect(declared(t) - elapsedMinutes(t)!).toBe(5);
    expect(validateSchedule(t).standingMismatches).toEqual(['SASOLBURG']);
    expect(validateSchedule(t).throughputTies).toBe(true);

    // The only one in the extract.
    const withStanding = all.flatMap((s) => {
      const L = s.rows[s.rows.length - 1];
      return L.departure === 0 && L.standingTime != null ? [`${s.train}:${L.station}`] : [];
    });
    expect(withStanding).toEqual(['7428:SASOLBURG']);
  });

  /**
   * A leading B or C in the reason column is a FLAG, not part of the reason.
   *
   * Twenty-eight rows in this extract open their reason with a bare B or C —
   * "B SHUNT", "C LOCO CHANGE", "B TURN LOCO'S", "B RT", or the letter alone.
   * Every single one of them is the train's FIRST node row. Not one appears
   * anywhere else.
   *
   * So the first node row's reason is "<FLAG> [REASON]", and any rule that
   * matches the reason as a whole string misses it: eleven trains here stand
   * for SHUNT at their first node and not one of them reads "SHUNT".
   */
  it('puts the B/C flag only ever on the first node row', () => {
    const flagged = all.flatMap((t) =>
      t.rows.map((r, i) => ({ train: t.train, i, reason: r.standingReason ?? '' })),
    ).filter((x) => x.reason === 'B' || x.reason === 'C' ||
                    x.reason.startsWith('B ') || x.reason.startsWith('C '));
    expect(flagged).toHaveLength(28);
    expect(flagged.every((x) => x.i === 0)).toBe(true);

    // And the reason behind the flag is invisible to a whole-string match.
    const firstShunts = all.filter((t) => (t.rows[0]?.standingReason ?? '') === 'B SHUNT');
    expect(firstShunts.length).toBeGreaterThan(0);
    expect(firstShunts.every((t) => t.rows[0].standingReason !== 'SHUNT')).toBe(true);
  });

  /**
   * The first structural handle on the frequency code C.
   *
   * C has appeared in the Frequency column since the fourth extract and has
   * never been explained. Four trains here carry one: 7224 YYYYYCY, 8918
   * CCYCYCY, 8957 YYCYYYC, 8974 CYCYYYY. All four ALSO carry a C flag on their
   * first node row.
   *
   * The converse does not hold — 8633 and 8977 carry a C flag and run
   * YYYYYYY — so this is an implication, not an equivalence, and on four
   * trains it is a weak one. It is asserted because it is the first thing
   * about C that is checkable at all, and because if a later extract breaks
   * it, that is itself worth knowing. It is NOT a reading of what C means.
   */
  it('finds a C flag on the first node row of every train whose frequency contains C', () => {
    const freqC = all.filter((t) => t.frequency.includes('C'));
    expect(freqC.map((t) => t.train).sort()).toEqual(['7224', '8918', '8957', '8974']);
    for (const t of freqC) {
      const r = t.rows[0].standingReason ?? '';
      expect([t.train, r === 'C' || r.startsWith('C ')]).toEqual([t.train, true]);
    }
    // Converse false: a C flag does not imply a C frequency.
    const flagCOnly = all.filter((t) => {
      const r = t.rows[0]?.standingReason ?? '';
      return (r === 'C' || r.startsWith('C ')) && !t.frequency.includes('C');
    });
    expect(flagCOnly.map((t) => t.train).sort()).toEqual(['8633', '8977']);
  });

  /** A train scheduled to run on no day of the week at all. */
  it('schedules 8456 for no day of the week', () => {
    const t = byId('8456');
    expect(t.frequency).toBe('NNNNNNN');
    expect(t.destination).toBe('LANGLAAGTE');
    expect(validateSchedule(t).elapsedIdentityHolds).toBe(true);
  });

  /** A train type not seen before, and a standing reason not seen before. */
  it('introduces LIGHTAIRBRAKE as a train type and CRANKING as a reason', () => {
    const lab = all.filter((t) => t.trainType === 'LIGHTAIRBRAKE/LIGHTAIRBRAKE');
    expect(lab.map((t) => t.train).sort()).toEqual(['8918', '8974']);
    const cranking = all.filter((t) => t.rows.some((r) => r.standingReason === 'CRANKING'));
    expect(cranking.map((t) => t.train).sort()).toEqual(['7224', '7228', '7428', '8974']);
  });

  /**
   * Four trains to MAFIKENG, all stated at twelve hours.
   *
   * 7226 and 7426 are clock-for-clock identical and differ only in frequency
   * and train type. 3018 is the same path run two hours earlier. 8918 is the
   * light-airbrake working: same destination, same twelve hours, but a
   * materially different set of nodes.
   */
  it('runs four workings to MAFIKENG, two of them identical', () => {
    const maf = all.filter((t) => t.destination === 'MAFIKENG');
    expect(maf.map((t) => t.train).sort()).toEqual(['3018', '7226', '7426', '8918']);
    expect(maf.every((t) => t.throughputRuntime === 720)).toBe(true);

    const a = byId('7226');
    const b = byId('7426');
    expect(a.rows.map((r) => r.station)).toEqual(b.rows.map((r) => r.station));
    const apart = a.rows.flatMap((r, i) => {
      const q = b.rows[i];
      return r.arrival === q.arrival && r.departure === q.departure ? [] : [r.station];
    });
    expect(apart).toEqual(['BNS/S754935', 'BOONS']);
    expect([a.rows[11].departure, b.rows[11].departure]).toEqual([697.5, 697]);
    expect([a.rows[12].arrival, b.rows[12].arrival]).toEqual([698.5, 698]);
    expect(a.frequency).toBe('YYYAYYA');
    expect(b.frequency).toBe('AYYYYYY');
    expect(byId('8918').rows.length).not.toBe(a.rows.length);
  });

  /** WAPADSKLOOF: a new origin, and both its trains are yard moves that return home. */
  it('adds WAPADSKLOOF, whose two trains start and finish in their own yard', () => {
    const yard = all.filter((t) => t.origin === 'WAPADSKLOOF');
    expect(yard.map((t) => t.train)).toEqual(['10', '20']);
    for (const t of yard) {
      expect([t.train, t.destination]).toEqual([t.train, 'WAPADSKLOOF']);
      expect([t.train, t.throughputRuntime]).toEqual([t.train, 16]);
      expect(t.rows.map((r) => r.station)).toEqual([
        'WDF/S840092', 'WDF/S848727', 'WDF/S845043',
        'WDF/S848727', 'WDF/S840092', 'WAPADSKLOOF',
      ]);
      expect([t.train, validateSchedule(t).elapsedIdentityHolds]).toEqual([t.train, true]);
    }
    // One hour and ten minutes apart, otherwise the same move.
    expect(byId('20').originDeparture - byId('10').originDeparture).toBe(70);
  });

  /** 5964 and 7235 are one path booked twice, as 5002/8906 were at WINBURG. */
  it('books 5964 and 7235 over one identical path to SASOLBURG', () => {
    const a = byId('5964');
    const b = byId('7235');
    expect(b.rows.map((r) => [r.station, r.arrival, r.departure]))
      .toEqual(a.rows.map((r) => [r.station, r.arrival, r.departure]));
    expect([a.throughputRuntime, b.throughputRuntime]).toEqual([238, 238]);
    expect(a.frequency).toBe(b.frequency);
  });
});

describe('the B/C flag holds across every extract read so far', () => {
  /**
   * Checked against all three fixtures at once, because a rule derived from
   * one page is a coincidence until it survives the others.
   */
  it('puts the flag on the first row that carries any reason at all, never on a later one', () => {
    const isFlag = (s: string) =>
      s === 'B' || s === 'C' || s.startsWith('B ') || s.startsWith('C ');
    let total = 0;
    const notFirstNode: string[] = [];
    const notFirstReason: string[] = [];
    for (const tsv of [B9, B10, B11]) {
      for (const t of parseRunningTimes(tsv)) {
        const firstWithReason = t.rows.findIndex((r) => (r.standingReason ?? '') !== '');
        t.rows.forEach((r, i) => {
          if (!isFlag(r.standingReason ?? '')) return;
          total += 1;
          const where = `${t.origin}/${t.train}/${r.station}=${r.standingReason}`;
          if (i !== 0) notFirstNode.push(where);
          if (i !== firstWithReason) notFirstReason.push(where);
        });
      }
    }
    expect(total).toBe(69);
    // The narrow rule is false: one flag sits on the second node row.
    expect(notFirstNode).toEqual(['WELGEDAG/1395/ZESFONTEIN=B']);
    // The rule that survives: it is always the first reason-bearing row.
    expect(notFirstReason).toEqual([]);
  });
});

const B12 = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
VYD-STASIE	1844	1	NORTH	VYD-STASIE		16:10:00				VRYHEIDOOS	16:10:00	16:20:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:10:00	0	
VYD-STASIE	1844	1	NORTH	VRYHEIDOOS	16:20:00	00:00:00	00:10:00		B RT	VRYHEIDOOS						00:10:00	0	7.09
VYD-STASIE	1845	1	NORTH	VYD-STASIE		17:20:00				GLENCOE	17:20:00	20:13:00	2	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	02:53:00	0	
VYD-STASIE	1845	1	NORTH	STILWATER	17:43:00	17:43:00	00:23:00		B	GLENCOE						02:53:00	0	8.63
VYD-STASIE	1845	2	NORTH	SCHEEPERSNEK	17:56:00	17:56:00	00:13:00			GLENCOE						02:53:00	0	5.62
VYD-STASIE	1845	2	NORTH	BLOEDRIVIER	18:17:00	18:17:00	00:21:00			GLENCOE						02:53:00	0	16.1
VYD-STASIE	1845	3	NORTH	KINGSLEY	18:26:00	18:26:00	00:09:00			GLENCOE						02:53:00	0	6.29
VYD-STASIE	1845	3	NORTH	DORINGBERG	18:40:00	18:40:00	00:14:00			GLENCOE						02:53:00	0	8.65
VYD-STASIE	1845	3	NORTH	DEJAGERSDRIF	18:54:00	18:54:00	00:14:00			GLENCOE						02:53:00	0	7.44
VYD-STASIE	1845	3	NORTH	TAYSIDE	19:03:00	19:03:00	00:09:00			GLENCOE						02:53:00	0	6.13
VYD-STASIE	1845	3	NORTH	MALONJENI	19:13:00	19:13:00	00:10:00			GLENCOE						02:53:00	0	7.45
VYD-STASIE	1845	4	NORTH	TALANA	19:30:00	19:40:00	00:17:00	00:10:00	SHUNT	GLENCOE						02:53:00	0	11.41
VYD-STASIE	1845	5	NORTH	DUNDEE	19:54:00	19:54:00	00:14:00			GLENCOE						02:53:00	0	2.87
VYD-STASIE	1845	6	NORTH	GLENCOE	20:13:00	00:00:00	00:19:00		RT	GLENCOE						02:53:00	0	8.49
VYD-STASIE	1846	1	NORTH	VYD-STASIE		00:10:00				VRYHEIDOOS	00:10:00	00:20:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:10:00	0	
VYD-STASIE	1846	1	NORTH	VRYHEIDOOS	00:20:00	00:00:00	00:10:00		B RT	VRYHEIDOOS						00:10:00	0	7.09
VYD-STASIE	1847	1	NORTH	VYD-STASIE		01:20:00				GLENCOE	01:20:00	04:13:00	2	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	02:53:00	0	
VYD-STASIE	1847	1	NORTH	STILWATER	01:43:00	01:43:00	00:23:00		B	GLENCOE						02:53:00	0	8.63
VYD-STASIE	1847	2	NORTH	SCHEEPERSNEK	01:56:00	01:56:00	00:13:00			GLENCOE						02:53:00	0	5.62
VYD-STASIE	1847	2	NORTH	BLOEDRIVIER	02:17:00	02:17:00	00:21:00			GLENCOE						02:53:00	0	16.1
VYD-STASIE	1847	3	NORTH	KINGSLEY	02:26:00	02:26:00	00:09:00			GLENCOE						02:53:00	0	6.29
VYD-STASIE	1847	3	NORTH	DORINGBERG	02:40:00	02:40:00	00:14:00			GLENCOE						02:53:00	0	8.65
VYD-STASIE	1847	3	NORTH	DEJAGERSDRIF	02:54:00	02:54:00	00:14:00			GLENCOE						02:53:00	0	7.44
VYD-STASIE	1847	3	NORTH	TAYSIDE	03:03:00	03:03:00	00:09:00			GLENCOE						02:53:00	0	6.13
VYD-STASIE	1847	3	NORTH	MALONJENI	03:13:00	03:13:00	00:10:00			GLENCOE						02:53:00	0	7.45
VYD-STASIE	1847	4	NORTH	TALANA	03:30:00	03:40:00	00:17:00	00:10:00	SHUNT	GLENCOE						02:53:00	0	11.41
VYD-STASIE	1847	5	NORTH	DUNDEE	03:54:00	03:54:00	00:14:00			GLENCOE						02:53:00	0	2.87
VYD-STASIE	1847	6	NORTH	GLENCOE	04:13:00	00:00:00	00:19:00		RT	GLENCOE						02:53:00	0	8.49
VYD-STASIE	1848	1	NORTH	VYD-STASIE		08:10:00				VRYHEIDOOS	08:10:00	08:20:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:10:00	0	
VYD-STASIE	1848	1	NORTH	VRYHEIDOOS	08:20:00	00:00:00	00:10:00		B RT	VRYHEIDOOS						00:10:00	0	7.09
VYD-STASIE	2408	1	NORTH	VYD-STASIE		01:20:00				GLENCOE	01:20:00	04:13:00	2	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:53:00	0	
VYD-STASIE	2408	1	NORTH	STILWATER	01:43:00	01:43:00	00:23:00		C	GLENCOE						02:53:00	0	8.63
VYD-STASIE	2408	2	NORTH	SCHEEPERSNEK	01:56:00	01:56:00	00:13:00			GLENCOE						02:53:00	0	5.62
VYD-STASIE	2408	2	NORTH	BLOEDRIVIER	02:17:00	02:17:00	00:21:00			GLENCOE						02:53:00	0	16.1
VYD-STASIE	2408	3	NORTH	KINGSLEY	02:26:00	02:26:00	00:09:00			GLENCOE						02:53:00	0	6.29
VYD-STASIE	2408	3	NORTH	DORINGBERG	02:40:00	02:40:00	00:14:00			GLENCOE						02:53:00	0	8.65
VYD-STASIE	2408	3	NORTH	DEJAGERSDRIF	02:54:00	02:54:00	00:14:00			GLENCOE						02:53:00	0	7.44
VYD-STASIE	2408	3	NORTH	TAYSIDE	03:03:00	03:03:00	00:09:00			GLENCOE						02:53:00	0	6.13
VYD-STASIE	2408	3	NORTH	MALONJENI	03:13:00	03:13:00	00:10:00			GLENCOE						02:53:00	0	7.45
VYD-STASIE	2408	4	NORTH	TALANA	03:30:00	03:40:00	00:17:00	00:10:00	SHUNT	GLENCOE						02:53:00	0	11.41
VYD-STASIE	2408	5	NORTH	DUNDEE	03:54:00	03:54:00	00:14:00			GLENCOE						02:53:00	0	2.87
VYD-STASIE	2408	6	NORTH	GLENCOE	04:13:00	00:00:00	00:19:00		RT	GLENCOE						02:53:00	0	8.49
VYD-STASIE	2414	1	NORTH	VYD-STASIE		17:20:00				GLENCOE	17:20:00	20:13:00	3	YAYYAYA	MEDIUM HEAVY/MEDIUM HEAVY	02:53:00	0	
VYD-STASIE	2414	1	NORTH	STILWATER	17:43:00	17:43:00	00:23:00		C	GLENCOE						02:53:00	0	8.63
VYD-STASIE	2414	2	NORTH	SCHEEPERSNEK	17:56:00	17:56:00	00:13:00			GLENCOE						02:53:00	0	5.62
VYD-STASIE	2414	2	NORTH	BLOEDRIVIER	18:17:00	18:17:00	00:21:00			GLENCOE						02:53:00	0	16.1
VYD-STASIE	2414	3	NORTH	KINGSLEY	18:26:00	18:26:00	00:09:00			GLENCOE						02:53:00	0	6.29
VYD-STASIE	2414	3	NORTH	DORINGBERG	18:40:00	18:40:00	00:14:00			GLENCOE						02:53:00	0	8.65
VYD-STASIE	2414	3	NORTH	DEJAGERSDRIF	18:54:00	18:54:00	00:14:00			GLENCOE						02:53:00	0	7.44
VYD-STASIE	2414	3	NORTH	TAYSIDE	19:03:00	19:03:00	00:09:00			GLENCOE						02:53:00	0	6.13
VYD-STASIE	2414	3	NORTH	MALONJENI	19:13:00	19:13:00	00:10:00			GLENCOE						02:53:00	0	7.45
VYD-STASIE	2414	4	NORTH	TALANA	19:30:00	19:40:00	00:17:00	00:10:00	SHUNT	GLENCOE						02:53:00	0	11.41
VYD-STASIE	2414	5	NORTH	DUNDEE	19:54:00	19:54:00	00:14:00			GLENCOE						02:53:00	0	2.87
VYD-STASIE	2414	6	NORTH	GLENCOE	20:13:00	00:00:00	00:19:00		RT	GLENCOE						02:53:00	0	8.49
VYD-STASIE	2841	1	NORTH	VYD-STASIE		13:40:00				GLENCOE	13:40:00	16:33:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:53:00	0	
VYD-STASIE	2841	1	NORTH	STILWATER	14:03:00	14:03:00	00:23:00		C	GLENCOE						02:53:00	0	8.63
VYD-STASIE	2841	2	NORTH	SCHEEPERSNEK	14:16:00	14:16:00	00:13:00			GLENCOE						02:53:00	0	5.62
VYD-STASIE	2841	2	NORTH	BLOEDRIVIER	14:37:00	14:37:00	00:21:00			GLENCOE						02:53:00	0	16.1
VYD-STASIE	2841	3	NORTH	KINGSLEY	14:46:00	14:46:00	00:09:00			GLENCOE						02:53:00	0	6.29
VYD-STASIE	2841	3	NORTH	DORINGBERG	15:00:00	15:00:00	00:14:00			GLENCOE						02:53:00	0	8.65
VYD-STASIE	2841	3	NORTH	DEJAGERSDRIF	15:14:00	15:14:00	00:14:00			GLENCOE						02:53:00	0	7.44
VYD-STASIE	2841	3	NORTH	TAYSIDE	15:23:00	15:23:00	00:09:00			GLENCOE						02:53:00	0	6.13
VYD-STASIE	2841	3	NORTH	MALONJENI	15:33:00	15:33:00	00:10:00			GLENCOE						02:53:00	0	7.45
VYD-STASIE	2841	4	NORTH	TALANA	15:50:00	16:00:00	00:17:00	00:10:00	SHUNT	GLENCOE						02:53:00	0	11.41
VYD-STASIE	2841	5	NORTH	DUNDEE	16:14:00	16:14:00	00:14:00			GLENCOE						02:53:00	0	2.87
VYD-STASIE	2841	6	NORTH	GLENCOE	16:33:00	00:00:00	00:19:00		RT	GLENCOE						02:53:00	0	8.49
VYD-STASIE	2844	1	NORTH	VYD-STASIE		16:10:00				VRYHEIDOOS	16:10:00	16:20:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:10:00	0	
VYD-STASIE	2844	1	NORTH	VRYHEIDOOS	16:20:00	00:00:00	00:10:00		C RT	VRYHEIDOOS						00:10:00	0	7.09
VYD-STASIE	2845	1	NORTH	VYD-STASIE		17:20:00				GLENCOE	17:20:00	20:13:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:53:00	0	
VYD-STASIE	2845	1	NORTH	STILWATER	17:43:00	17:43:00	00:23:00		C	GLENCOE						02:53:00	0	8.63
VYD-STASIE	2845	2	NORTH	SCHEEPERSNEK	17:56:00	17:56:00	00:13:00			GLENCOE						02:53:00	0	5.62
VYD-STASIE	2845	2	NORTH	BLOEDRIVIER	18:17:00	18:17:00	00:21:00			GLENCOE						02:53:00	0	16.1
VYD-STASIE	2845	3	NORTH	KINGSLEY	18:26:00	18:26:00	00:09:00			GLENCOE						02:53:00	0	6.29
VYD-STASIE	2845	3	NORTH	DORINGBERG	18:40:00	18:40:00	00:14:00			GLENCOE						02:53:00	0	8.65
VYD-STASIE	2845	3	NORTH	DEJAGERSDRIF	18:54:00	18:54:00	00:14:00			GLENCOE						02:53:00	0	7.44
VYD-STASIE	2845	3	NORTH	TAYSIDE	19:03:00	19:03:00	00:09:00			GLENCOE						02:53:00	0	6.13
VYD-STASIE	2845	3	NORTH	MALONJENI	19:13:00	19:13:00	00:10:00			GLENCOE						02:53:00	0	7.45
VYD-STASIE	2845	4	NORTH	TALANA	19:30:00	19:40:00	00:17:00	00:10:00	SHUNT	GLENCOE						02:53:00	0	11.41
VYD-STASIE	2845	5	NORTH	DUNDEE	19:54:00	19:54:00	00:14:00			GLENCOE						02:53:00	0	2.87
VYD-STASIE	2845	6	NORTH	GLENCOE	20:13:00	00:00:00	00:19:00		RT	GLENCOE						02:53:00	0	8.49
VYD-STASIE	2846	1	NORTH	VYD-STASIE		00:10:00				VRYHEIDOOS	00:10:00	00:20:00	3	YAYAYAA	MEDIUM HEAVY/MEDIUM HEAVY	00:10:00	0	
VYD-STASIE	2846	1	NORTH	VRYHEIDOOS	00:20:00	00:00:00	00:10:00		C RT	VRYHEIDOOS						00:10:00	0	7.09
VYD-STASIE	2848	1	NORTH	VYD-STASIE		02:05:00				VRYHEIDOOS	02:05:00	02:15:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:10:00	0	
VYD-STASIE	2848	1	NORTH	VRYHEIDOOS	02:15:00	00:00:00	00:10:00		C RT	VRYHEIDOOS						00:10:00	0	7.09
VYD-STASIE	2849	1	NORTH	VYD-STASIE		22:00:00				GLENCOE	22:00:00	00:53:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:53:00	0	
VYD-STASIE	2849	1	NORTH	STILWATER	22:23:00	22:23:00	00:23:00		C	GLENCOE						02:53:00	0	8.63
VYD-STASIE	2849	2	NORTH	SCHEEPERSNEK	22:36:00	22:36:00	00:13:00			GLENCOE						02:53:00	0	5.62
VYD-STASIE	2849	2	NORTH	BLOEDRIVIER	22:57:00	22:57:00	00:21:00			GLENCOE						02:53:00	0	16.1
VYD-STASIE	2849	3	NORTH	KINGSLEY	23:06:00	23:06:00	00:09:00			GLENCOE						02:53:00	0	6.29
VYD-STASIE	2849	3	NORTH	DORINGBERG	23:20:00	23:20:00	00:14:00			GLENCOE						02:53:00	0	8.65
VYD-STASIE	2849	3	NORTH	DEJAGERSDRIF	23:34:00	23:34:00	00:14:00			GLENCOE						02:53:00	0	7.44
VYD-STASIE	2849	3	NORTH	TAYSIDE	23:43:00	23:43:00	00:09:00			GLENCOE						02:53:00	0	6.13
VYD-STASIE	2849	3	NORTH	MALONJENI	23:53:00	23:53:00	00:10:00			GLENCOE						02:53:00	0	7.45
VYD-STASIE	2849	4	NORTH	TALANA	00:10:00	00:20:00	00:17:00	00:10:00	SHUNT	GLENCOE						02:53:00	1	11.41
VYD-STASIE	2849	5	NORTH	DUNDEE	00:34:00	00:34:00	00:14:00			GLENCOE						02:53:00	1	2.87
VYD-STASIE	2849	6	NORTH	GLENCOE	00:53:00	00:00:00	00:19:00		RT	GLENCOE						02:53:00	1	8.49
VYD-STASIE	5955	1	NORTH	VYD-STASIE		00:10:00				VRYHEID	00:10:00	00:20:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:10:00	0	
VYD-STASIE	5955	1	NORTH	VRYHEID	00:20:00	00:00:00	00:10:00		B RT	VRYHEID						00:10:00	0	7.5
VYD-STASIE	5963	1	NORTH	VYD-STASIE		00:10:00				VRYHEID	00:10:00	00:20:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:10:00	0	
VYD-STASIE	5963	1	NORTH	VRYHEID	00:20:00	00:00:00	00:10:00		B RT	VRYHEID						00:10:00	0	7.5
VYD-STASIE	6406	1	NORTH	VYD-STASIE		01:20:00				GLENCOE	01:20:00	04:13:00	3	AAAAAAA	MEDIUM HEAVY/IMPORT COKE	02:53:00	0	
VYD-STASIE	6406	1	NORTH	STILWATER	01:43:00	01:43:00	00:23:00		C	GLENCOE						02:53:00	0	8.63
VYD-STASIE	6406	2	NORTH	SCHEEPERSNEK	01:56:00	01:56:00	00:13:00			GLENCOE						02:53:00	0	5.62
VYD-STASIE	6406	2	NORTH	BLOEDRIVIER	02:17:00	02:17:00	00:21:00			GLENCOE						02:53:00	0	16.1
VYD-STASIE	6406	3	NORTH	KINGSLEY	02:26:00	02:26:00	00:09:00			GLENCOE						02:53:00	0	6.29
VYD-STASIE	6406	3	NORTH	DORINGBERG	02:40:00	02:40:00	00:14:00			GLENCOE						02:53:00	0	8.65
VYD-STASIE	6406	3	NORTH	DEJAGERSDRIF	02:54:00	02:54:00	00:14:00			GLENCOE						02:53:00	0	7.44
VYD-STASIE	6406	3	NORTH	TAYSIDE	03:03:00	03:03:00	00:09:00			GLENCOE						02:53:00	0	6.13
VYD-STASIE	6406	3	NORTH	MALONJENI	03:13:00	03:13:00	00:10:00			GLENCOE						02:53:00	0	7.45
VYD-STASIE	6406	4	NORTH	TALANA	03:30:00	03:40:00	00:17:00	00:10:00	SHUNT	GLENCOE						02:53:00	0	11.41
VYD-STASIE	6406	5	NORTH	DUNDEE	03:54:00	03:54:00	00:14:00			GLENCOE						02:53:00	0	2.87
VYD-STASIE	6406	6	NORTH	GLENCOE	04:13:00	00:00:00	00:19:00		RT	GLENCOE						02:53:00	0	8.49
VYD-STASIE	6408	1	NORTH	VYD-STASIE		09:20:00				GLENCOE	09:20:00	12:13:00	3	YYYAYAY	MEDIUM HEAVY/MEDIUM HEAVY	02:53:00	0	
VYD-STASIE	6408	1	NORTH	STILWATER	09:43:00	09:43:00	00:23:00		C	GLENCOE						02:53:00	0	8.63
VYD-STASIE	6408	2	NORTH	SCHEEPERSNEK	09:56:00	09:56:00	00:13:00			GLENCOE						02:53:00	0	5.62
VYD-STASIE	6408	2	NORTH	BLOEDRIVIER	10:17:00	10:17:00	00:21:00			GLENCOE						02:53:00	0	16.1
VYD-STASIE	6408	3	NORTH	KINGSLEY	10:26:00	10:26:00	00:09:00			GLENCOE						02:53:00	0	6.29
VYD-STASIE	6408	3	NORTH	DORINGBERG	10:40:00	10:40:00	00:14:00			GLENCOE						02:53:00	0	8.65
VYD-STASIE	6408	3	NORTH	DEJAGERSDRIF	10:54:00	10:54:00	00:14:00			GLENCOE						02:53:00	0	7.44
VYD-STASIE	6408	3	NORTH	TAYSIDE	11:03:00	11:03:00	00:09:00			GLENCOE						02:53:00	0	6.13
VYD-STASIE	6408	3	NORTH	MALONJENI	11:13:00	11:13:00	00:10:00			GLENCOE						02:53:00	0	7.45
VYD-STASIE	6408	4	NORTH	TALANA	11:30:00	11:40:00	00:17:00	00:10:00	SHUNT	GLENCOE						02:53:00	0	11.41
VYD-STASIE	6408	5	NORTH	DUNDEE	11:54:00	11:54:00	00:14:00			GLENCOE						02:53:00	0	2.87
VYD-STASIE	6408	6	NORTH	GLENCOE	12:13:00	00:00:00	00:19:00		RT	GLENCOE						02:53:00	0	8.49
VYD-STASIE	6491	1	NORTH	VYD-STASIE		09:20:00				GLENCOE	09:20:00	12:13:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:53:00	0	
VYD-STASIE	6491	1	NORTH	STILWATER	09:43:00	09:43:00	00:23:00		C	GLENCOE						02:53:00	0	8.63
VYD-STASIE	6491	2	NORTH	SCHEEPERSNEK	09:56:00	09:56:00	00:13:00			GLENCOE						02:53:00	0	5.62
VYD-STASIE	6491	2	NORTH	BLOEDRIVIER	10:17:00	10:17:00	00:21:00			GLENCOE						02:53:00	0	16.1
VYD-STASIE	6491	3	NORTH	KINGSLEY	10:26:00	10:26:00	00:09:00			GLENCOE						02:53:00	0	6.29
VYD-STASIE	6491	3	NORTH	DORINGBERG	10:40:00	10:40:00	00:14:00			GLENCOE						02:53:00	0	8.65
VYD-STASIE	6491	3	NORTH	DEJAGERSDRIF	10:54:00	10:54:00	00:14:00			GLENCOE						02:53:00	0	7.44
VYD-STASIE	6491	3	NORTH	TAYSIDE	11:03:00	11:03:00	00:09:00			GLENCOE						02:53:00	0	6.13
VYD-STASIE	6491	3	NORTH	MALONJENI	11:13:00	11:13:00	00:10:00			GLENCOE						02:53:00	0	7.45
VYD-STASIE	6491	4	NORTH	TALANA	11:30:00	11:40:00	00:17:00	00:10:00	SHUNT	GLENCOE						02:53:00	0	11.41
VYD-STASIE	6491	5	NORTH	DUNDEE	11:54:00	11:54:00	00:14:00			GLENCOE						02:53:00	0	2.87
VYD-STASIE	6491	6	NORTH	GLENCOE	12:13:00	00:00:00	00:19:00		RT	GLENCOE						02:53:00	0	8.49
VYD-STASIE	8928	1	NORTH	VYD-STASIE		22:23:00				VRYHEID	22:23:00	22:53:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:30:00	0	
VYD-STASIE	8928	1	NORTH	VRYHEID	22:53:00	00:00:00	00:30:00		C RT	VRYHEID						00:30:00	0	7.5
VYD-STASIE	9403	1	NORTH	VYD-STASIE		08:10:00				VRYHEIDOOS	08:10:00	08:20:00	3	AYAYAAA	MEDIUM HEAVY/MEDIUM HEAVY	00:10:00	0	
VYD-STASIE	9403	1	NORTH	VRYHEIDOOS	08:20:00	00:00:00	00:10:00		C RT	VRYHEIDOOS						00:10:00	0	7.09
VYD-STASIE	9442	1	NORTH	VYD-STASIE		00:10:00				VRYHEID	00:10:00	00:20:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:10:00	0	
VYD-STASIE	9442	1	NORTH	VRYHEID	00:20:00	00:00:00	00:10:00		B RT	VRYHEID						00:10:00	0	7.5
VYD-STASIE	9465	1	NORTH	VYD-STASIE		16:10:00				VRYHEIDOOS	16:10:00	16:20:00	3	YAYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:10:00	0	
VYD-STASIE	9465	1	NORTH	VRYHEIDOOS	16:20:00	00:00:00	00:10:00		C RT	VRYHEIDOOS						00:10:00	0	7.09
VYD-STASIE	9469	1	NORTH	VYD-STASIE		00:10:00				VRYHEIDOOS	00:10:00	00:20:00	3	YYYYAYA	MEDIUM HEAVY/MEDIUM HEAVY	00:10:00	0	
VYD-STASIE	9469	1	NORTH	VRYHEIDOOS	00:20:00	00:00:00	00:10:00		C RT	VRYHEIDOOS						00:10:00	0	7.09
WAKEFIELD	5005	1	NORTHEAST	WAKEFIELD		23:50:00				CLEWER	23:50:00	00:05:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:15:00	0	
WAKEFIELD	5005	1	NORTHEAST	CLEWER	00:05:00	00:00:00	00:15:00			CLEWER						00:15:00	1	7.48
WAKEFIELD	5007	1	NORTHEAST	WAKEFIELD		14:50:00				CLEWER	14:50:00	15:05:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:15:00	0	
WAKEFIELD	5007	1	NORTHEAST	CLEWER	15:05:00	00:00:00	00:15:00			CLEWER						00:15:00	0	7.48
WARDEN	5598	1	CONTAINER	WARDEN		13:33:00				HARRISMITH	13:33:00	15:35:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	02:02:00	0	
WARDEN	5598	1	CONTAINER	WAN/S544418	13:34:00	13:38:00	00:01:00	00:04:00	SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	5598	2	CONTAINER	WAN/S544426	13:40:00	13:45:00	00:02:00	00:05:00	SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	5598	3	CONTAINER	WARDEN	13:47:00	13:50:00	00:02:00	00:03:00	SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	5598	4	CONTAINER	TOPPUNT	14:07:00	14:08:00	00:17:00	00:01:00	SHUNT	HARRISMITH						02:02:00	0	9.11
WARDEN	5598	4	CONTAINER	KORUS	14:19:00	14:19:00	00:11:00			HARRISMITH						02:02:00	0	10.52
WARDEN	5598	4	CONTAINER	KAFFERSTAD	14:23:00	14:24:00	00:04:00	00:01:00	SHUNT	HARRISMITH						02:02:00	0	3.02
WARDEN	5598	4	CONTAINER	MEULRIVIER	14:27:00	14:28:00	00:03:00	00:01:00	SHUNT	HARRISMITH						02:02:00	0	2.75
WARDEN	5598	5	CONTAINER	EERAM	14:41:00	14:54:00	00:13:00	00:13:00	SHUNT	HARRISMITH						02:02:00	0	10.19
WARDEN	5598	6	CONTAINER	ERM/S546291	14:56:00	14:59:00	00:02:00	00:03:00	SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	5598	7	CONTAINER	ERM/S546593	15:00:00	15:02:00	00:01:00	00:02:00	SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	5598	8	CONTAINER	EERAM	15:04:00	15:06:00	00:02:00	00:02:00	SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	5598	9	CONTAINER	EINDIG	15:11:00	15:11:00	00:05:00			HARRISMITH						02:02:00	0	3.04
WARDEN	5598	9	CONTAINER	SARCLET	15:19:00	15:20:00	00:08:00	00:01:00	SHUNT	HARRISMITH						02:02:00	0	8.38
WARDEN	5598	9	CONTAINER	HARRISMITH	15:35:00	00:00:00	00:15:00		RT	HARRISMITH						02:02:00	0	9.66
WARDEN	8598	1	CONTAINER	WARDEN		13:33:00				HARRISMITH	13:33:00	15:35:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:02:00	0	
WARDEN	8598	1	CONTAINER	WAN/S544418	13:34:00	13:38:00	00:01:00	00:04:00	B SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	8598	2	CONTAINER	WAN/S544426	13:40:00	13:45:00	00:02:00	00:05:00	SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	8598	3	CONTAINER	WARDEN	13:47:00	13:50:00	00:02:00	00:03:00	SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	8598	4	CONTAINER	TOPPUNT	14:07:00	14:08:00	00:17:00	00:01:00	SHUNT	HARRISMITH						02:02:00	0	9.11
WARDEN	8598	4	CONTAINER	KORUS	14:19:00	14:19:00	00:11:00			HARRISMITH						02:02:00	0	10.52
WARDEN	8598	4	CONTAINER	KAFFERSTAD	14:23:00	14:24:00	00:04:00	00:01:00	SHUNT	HARRISMITH						02:02:00	0	3.02
WARDEN	8598	4	CONTAINER	MEULRIVIER	14:27:00	14:28:00	00:03:00	00:01:00	SHUNT	HARRISMITH						02:02:00	0	2.75
WARDEN	8598	5	CONTAINER	EERAM	14:41:00	14:54:00	00:13:00	00:13:00	SHUNT	HARRISMITH						02:02:00	0	10.19
WARDEN	8598	6	CONTAINER	ERM/S546291	14:56:00	14:59:00	00:02:00	00:03:00	SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	8598	7	CONTAINER	ERM/S546593	15:00:00	15:02:00	00:01:00	00:02:00	SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	8598	8	CONTAINER	EERAM	15:04:00	15:06:00	00:02:00	00:02:00	SHUNT	HARRISMITH						02:02:00	0	0.97
WARDEN	8598	9	CONTAINER	EINDIG	15:11:00	15:11:00	00:05:00			HARRISMITH						02:02:00	0	3.04
WARDEN	8598	9	CONTAINER	SARCLET	15:19:00	15:20:00	00:08:00	00:01:00	SHUNT	HARRISMITH						02:02:00	0	8.38
WARDEN	8598	9	CONTAINER	HARRISMITH	15:35:00	00:00:00	00:15:00		RT	HARRISMITH						02:02:00	0	9.66
WALTLOO	3801	1	CENTRAL	WALTLOO		03:30:00				WALTLOO	03:30:00	04:14:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:44:00	0	
WALTLOO	3801	1	CENTRAL	WAO/S848743	03:35:00	03:40:00	00:05:00	00:05:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	3801	2	CENTRAL	WAO/S847984	03:45:00	04:00:00	00:05:00	00:15:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	3801	3	CENTRAL	WAO/S848743	04:01:00	04:02:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	3801	4	CENTRAL	WALTLOO	04:07:00	04:09:00	00:05:00	00:02:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	3801	5	CENTRAL	WAO/S847844	04:11:00	04:12:00	00:02:00	00:01:00	SHUNT	WALTLOO						00:44:00	0	0.97
WALTLOO	3801	6	CENTRAL	WALTLOO	04:14:00	00:00:00	00:02:00			WALTLOO						00:44:00	0	0.97
WALTLOO	3803	1	CENTRAL	WALTLOO		08:00:00				WALTLOO	08:00:00	08:21:00	3	NYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:21:00	0	
WALTLOO	3803	1	CENTRAL	WAO/S847968	08:05:00	08:10:00	00:05:00	00:05:00	RANGEER	WALTLOO						00:21:00	0	0.97
WALTLOO	3803	2	CENTRAL	WALTLOO	08:15:00	08:15:00	00:05:00			WALTLOO						00:21:00	0	0.97
WALTLOO	3803	3	CENTRAL	WAO/S847844	08:17:00	08:19:00	00:02:00	00:02:00	SHUNT	WALTLOO						00:21:00	0	0.97
WALTLOO	3803	4	CENTRAL	WALTLOO	08:21:00	00:00:00	00:02:00			WALTLOO						00:21:00	0	0.97
WALTLOO	3805	1	CENTRAL	WALTLOO		11:00:00				WALTLOO	11:00:00	11:44:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:44:00	0	
WALTLOO	3805	1	CENTRAL	WAO/S847917	11:01:00	11:02:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	3805	2	CENTRAL	WAO/S847941	11:03:00	11:04:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	3805	3	CENTRAL	WAO/S847933	11:09:00	11:29:00	00:05:00	00:20:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	3805	4	CENTRAL	WAO/S847941	11:30:00	11:31:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	3805	5	CENTRAL	WAO/S847917	11:32:00	11:33:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	3805	6	CENTRAL	WALTLOO	11:38:00	11:39:00	00:05:00	00:01:00	SHUNT	WALTLOO						00:44:00	0	0.97
WALTLOO	3805	7	CENTRAL	WAO/S847844	11:41:00	11:42:00	00:02:00	00:01:00	SHUNT	WALTLOO						00:44:00	0	0.97
WALTLOO	3805	8	CENTRAL	WALTLOO	11:44:00	00:00:00	00:02:00			WALTLOO						00:44:00	0	0.97
WALTLOO	3807	1	CENTRAL	WALTLOO		13:10:00				WALTLOO	13:10:00	13:40:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:30:00	0	
WALTLOO	3807	1	CENTRAL	WAO/S847917	13:15:00	13:35:00	00:05:00	00:20:00	RANGEER	WALTLOO						00:30:00	0	0.97
WALTLOO	3807	2	CENTRAL	WALTLOO	13:40:00	00:00:00	00:05:00			WALTLOO						00:30:00	0	0.97
WALTLOO	3809	1	CENTRAL	WALTLOO		13:40:00				WALTLOO	13:40:00	14:06:00	3	NYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:26:00	0	
WALTLOO	3809	1	CENTRAL	WAO/S847917	13:41:00	13:42:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:26:00	0	0.97
WALTLOO	3809	2	CENTRAL	WAO/S847941	13:43:00	14:03:00	00:01:00	00:20:00	RANGEER	WALTLOO						00:26:00	0	0.97
WALTLOO	3809	3	CENTRAL	WAO/S847917	14:04:00	14:05:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:26:00	0	0.97
WALTLOO	3809	4	CENTRAL	WALTLOO	14:06:00	00:00:00	00:01:00			WALTLOO						00:26:00	0	0.97
WALTLOO	3811	1	CENTRAL	WALTLOO		12:30:00				WALTLOO	12:30:00	12:55:00	3	YYYYYYN	VACUUM TRAINS/VACUUM TRAIN	00:25:00	0	
WALTLOO	3811	1	CENTRAL	WAO/S848743	12:35:00	12:55:00	00:05:00	00:20:00	RANGEER	WALTLOO						00:25:00	0	0.97
WALTLOO	3811	2	CENTRAL	WALTLOO	12:55:00	00:00:00				WALTLOO						00:25:00	0	0.97
WALTLOO	3813	1	CENTRAL	WALTLOO		13:30:00				WALTLOO	13:30:00	13:50:00	3	NYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:20:00	0	
WALTLOO	3813	1	CENTRAL	WAO/S848743	13:31:00	13:32:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:20:00	0	0.97
WALTLOO	3813	2	CENTRAL	WAO/S847984	13:33:00	13:43:00	00:01:00	00:10:00	RANGEER	WALTLOO						00:20:00	0	0.97
WALTLOO	3813	3	CENTRAL	WAO/S840785	13:44:00	13:45:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:20:00	0	0.97
WALTLOO	3813	4	CENTRAL	WAO/S847984	13:46:00	13:47:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:20:00	0	0.97
WALTLOO	3813	5	CENTRAL	WAO/S848743	13:48:00	13:49:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:20:00	0	0.97
WALTLOO	3813	6	CENTRAL	WALTLOO	13:50:00	00:00:00	00:01:00			WALTLOO						00:20:00	0	0.97
WALTLOO	3815	1	CENTRAL	WALTLOO		14:30:00				WALTLOO	14:30:00	14:55:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:25:00	0	
WALTLOO	3815	1	CENTRAL	WAO/S847917	14:31:00	14:32:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:25:00	0	0.97
WALTLOO	3815	2	CENTRAL	WAO/S847941	14:33:00	14:34:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:25:00	0	0.97
WALTLOO	3815	3	CENTRAL	WAO/S847933	14:35:00	14:50:00	00:01:00	00:15:00	RANGEER	WALTLOO						00:25:00	0	0.97
WALTLOO	3815	4	CENTRAL	WAO/S847941	14:51:00	14:52:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:25:00	0	0.97
WALTLOO	3815	5	CENTRAL	WAO/S847917	14:53:00	14:54:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:25:00	0	0.97
WALTLOO	3815	6	CENTRAL	WALTLOO	14:55:00	00:00:00	00:01:00			WALTLOO						00:25:00	0	0.97
WALTLOO	3817	1	CENTRAL	WALTLOO		15:45:00				WALTLOO	15:45:00	16:15:00	3	NYYYYYN	VACUUM TRAINS/VACUUM TRAIN	00:30:00	0	
WALTLOO	3817	1	CENTRAL	WAO/S847917	15:50:00	16:10:00	00:05:00	00:20:00	RANGEER	WALTLOO						00:30:00	0	0.97
WALTLOO	3817	2	CENTRAL	WALTLOO	16:15:00	00:00:00	00:05:00			WALTLOO						00:30:00	0	0.97
WALTLOO	3819	1	CENTRAL	WALTLOO		16:10:00				WALTLOO	16:10:00	16:40:00	3	NYYYYYN	VACUUM TRAINS/VACUUM TRAIN	00:30:00	0	
WALTLOO	3819	1	CENTRAL	WAO/S847917	16:11:00	16:12:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:30:00	0	0.97
WALTLOO	3819	2	CENTRAL	WAO/S847941	16:17:00	16:37:00	00:05:00	00:20:00	RANGEER	WALTLOO						00:30:00	0	0.97
WALTLOO	3819	3	CENTRAL	WAO/S847917	16:38:00	16:39:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:30:00	0	0.97
WALTLOO	3819	4	CENTRAL	WALTLOO	16:40:00	00:00:00	00:01:00			WALTLOO						00:30:00	0	0.97
WALTLOO	3821	1	CENTRAL	WALTLOO		18:15:00				WALTLOO	18:15:00	18:43:00	3	NYYYYYN	VACUUM TRAINS/VACUUM TRAIN	00:28:00	0	
WALTLOO	3821	1	CENTRAL	WAO/S848743	18:16:00	18:17:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:28:00	0	0.97
WALTLOO	3821	2	CENTRAL	WAO/S847984	18:18:00	18:33:00	00:01:00	00:15:00	RANGEER	WALTLOO						00:28:00	0	0.97
WALTLOO	3821	3	CENTRAL	WAO/S848743	18:34:00	18:35:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:28:00	0	0.97
WALTLOO	3821	4	CENTRAL	WALTLOO	18:37:00	18:38:00	00:02:00	00:01:00	RANGEER	WALTLOO						00:28:00	0	0.97
WALTLOO	3821	5	CENTRAL	WAO/S847844	18:40:00	18:41:00	00:02:00	00:01:00	RANGEER	WALTLOO						00:28:00	0	0.97
WALTLOO	3821	6	CENTRAL	WALTLOO	18:43:00	00:00:00	00:02:00			WALTLOO						00:28:00	0	0.97
WALTLOO	3823	1	CENTRAL	WALTLOO		19:15:00				WALTLOO	19:15:00	19:40:00	3	NYYYYYN	VACUUM TRAINS/VACUUM TRAIN	00:25:00	0	
WALTLOO	3823	1	CENTRAL	WAO/S848743	19:20:00	19:35:00	00:05:00	00:15:00	RANGEER	WALTLOO						00:25:00	0	0.97
WALTLOO	3823	2	CENTRAL	WALTLOO	19:40:00	00:00:00	00:05:00			WALTLOO						00:25:00	0	0.97
WALTLOO	3825	1	CENTRAL	WALTLOO		19:30:00				WALTLOO	19:30:00	20:04:00	3	NYYYYYN	VACUUM TRAINS/VACUUM TRAIN	00:34:00	0	
WALTLOO	3825	1	CENTRAL	WAO/S848743	19:31:00	19:32:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	3825	2	CENTRAL	WAO/S847984	19:33:00	19:33:00	00:01:00			WALTLOO						00:34:00	0	0.97
WALTLOO	3825	3	CENTRAL	WAO/S840785	19:38:00	19:53:00	00:05:00	00:15:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	3825	4	CENTRAL	WAO/S847984	19:54:00	19:55:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	3825	5	CENTRAL	WAO/S848743	19:56:00	19:57:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	3825	6	CENTRAL	WALTLOO	19:59:00	20:00:00	00:02:00	00:01:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	3825	7	CENTRAL	WAO/S847844	20:02:00	20:03:00	00:02:00	00:01:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	3825	8	CENTRAL	WALTLOO	20:04:00	00:00:00	00:01:00			WALTLOO						00:34:00	0	0.97
WALTLOO	3827	1	CENTRAL	WALTLOO		21:05:00				WALTLOO	21:05:00	21:34:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:29:00	0	
WALTLOO	3827	1	CENTRAL	WAO/S847917	21:06:00	21:07:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:29:00	0	0.97
WALTLOO	3827	2	CENTRAL	WAO/S847941	21:08:00	21:09:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:29:00	0	0.97
WALTLOO	3827	3	CENTRAL	WAO/S847933	21:14:00	21:29:00	00:05:00	00:15:00	RANGEER	WALTLOO						00:29:00	0	0.97
WALTLOO	3827	4	CENTRAL	WAO/S847941	21:30:00	21:31:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:29:00	0	0.97
WALTLOO	3827	5	CENTRAL	WAO/S847917	21:32:00	21:33:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:29:00	0	0.97
WALTLOO	3827	6	CENTRAL	WALTLOO	21:34:00	00:00:00	00:01:00			WALTLOO						00:29:00	0	0.97
WALTLOO	3829	1	CENTRAL	WALTLOO		22:30:00				WALTLOO	22:30:00	22:55:00	3	NYYYYYN	VACUUM TRAINS/VACUUM TRAIN	00:25:00	0	
WALTLOO	3829	1	CENTRAL	WAO/S847917	22:35:00	22:50:00	00:05:00	00:15:00	RANGEER	WALTLOO						00:25:00	0	0.97
WALTLOO	3829	2	CENTRAL	WALTLOO	22:55:00	00:00:00	00:05:00			WALTLOO						00:25:00	0	0.97
WALTLOO	3831	1	CENTRAL	WALTLOO		23:30:00				WALTLOO	23:30:00	23:55:00	3	NYYYYYN	VACUUM TRAINS/VACUUM TRAIN	00:25:00	0	
WALTLOO	3831	1	CENTRAL	WAO/S847917	23:31:00	23:32:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:25:00	0	0.97
WALTLOO	3831	2	CENTRAL	WAO/S847941	23:37:00	23:52:00	00:05:00	00:15:00	RANGEER	WALTLOO						00:25:00	0	0.97
WALTLOO	3831	3	CENTRAL	WAO/S847917	23:53:00	23:54:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:25:00	0	0.97
WALTLOO	3831	4	CENTRAL	WALTLOO	23:55:00	00:00:00	00:01:00			WALTLOO						00:25:00	0	0.97
WALTLOO	8801	1	CENTRAL	WALTLOO		03:30:00				WALTLOO	03:30:00	04:14:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:44:00	0	
WALTLOO	8801	1	CENTRAL	WAO/S848743	03:35:00	03:40:00	00:05:00	00:05:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	8801	2	CENTRAL	WAO/S847984	03:45:00	04:00:00	00:05:00	00:15:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	8801	3	CENTRAL	WAO/S848743	04:01:00	04:02:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	8801	4	CENTRAL	WALTLOO	04:07:00	04:09:00	00:05:00	00:02:00	RANGEER	WALTLOO						00:44:00	0	0.97
WALTLOO	8801	5	CENTRAL	WAO/S847844	04:11:00	04:12:00	00:02:00	00:01:00	SHUNT	WALTLOO						00:44:00	0	0.97
WALTLOO	8801	6	CENTRAL	WALTLOO	04:14:00	00:00:00	00:02:00			WALTLOO						00:44:00	0	0.97
WALTLOO	8813	1	CENTRAL	WALTLOO		13:30:00				WALTLOO	13:30:00	13:50:00	3	NYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:20:00	0	
WALTLOO	8813	1	CENTRAL	WAO/S848743	13:31:00	13:32:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:20:00	0	0.97
WALTLOO	8813	2	CENTRAL	WAO/S847984	13:33:00	13:43:00	00:01:00	00:10:00	RANGEER	WALTLOO						00:20:00	0	0.97
WALTLOO	8813	3	CENTRAL	WAO/S840785	13:44:00	13:45:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:20:00	0	0.97
WALTLOO	8813	4	CENTRAL	WAO/S847984	13:46:00	13:47:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:20:00	0	0.97
WALTLOO	8813	5	CENTRAL	WAO/S848743	13:48:00	13:49:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:20:00	0	0.97
WALTLOO	8813	6	CENTRAL	WALTLOO	13:50:00	00:00:00	00:01:00			WALTLOO						00:20:00	0	0.97
WALTLOO	8825	1	CENTRAL	WALTLOO		19:30:00				WALTLOO	19:30:00	20:04:00	3	NYYYYYN	MEDIUM HEAVY/MEDIUM HEAVY	00:34:00	0	
WALTLOO	8825	1	CENTRAL	WAO/S848743	19:31:00	19:32:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	8825	2	CENTRAL	WAO/S847984	19:33:00	19:33:00	00:01:00			WALTLOO						00:34:00	0	0.97
WALTLOO	8825	3	CENTRAL	WAO/S840785	19:38:00	19:53:00	00:05:00	00:15:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	8825	4	CENTRAL	WAO/S847984	19:54:00	19:55:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	8825	5	CENTRAL	WAO/S848743	19:56:00	19:57:00	00:01:00	00:01:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	8825	6	CENTRAL	WALTLOO	19:59:00	20:00:00	00:02:00	00:01:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	8825	7	CENTRAL	WAO/S847844	20:02:00	20:03:00	00:02:00	00:01:00	RANGEER	WALTLOO						00:34:00	0	0.97
WALTLOO	8825	8	CENTRAL	WALTLOO	20:04:00	00:00:00	00:01:00			WALTLOO						00:34:00	0	0.97
WALTLOO	8706	1	CENTRAL	WALTLOO		09:30:00				WAO/S847879	09:30:00	09:45:00	3	YYYYYYY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	00:15:00	0	
WALTLOO	8706	1	CENTRAL	WAO/S847879	09:45:00	00:00:00	00:15:00			WAO/S847879						00:15:00	0	0.1
WALTLOO	8708	1	CENTRAL	WALTLOO		12:00:00				WAO/S847879	12:00:00	12:15:00	3	YYYYYYY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	00:15:00	0	
WALTLOO	8708	1	CENTRAL	WAO/S847879	12:15:00	00:00:00	00:15:00			WAO/S847879						00:15:00	0	0.1
WALTLOO	8712	1	CENTRAL	WALTLOO		15:00:00				WAO/S847879	15:00:00	15:15:00	3	YYYYYYY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	00:15:00	0	
WALTLOO	8712	1	CENTRAL	WAO/S847879	15:15:00	00:00:00	00:15:00			WAO/S847879						00:15:00	0	0.1
WALTLOO	8714	1	CENTRAL	WALTLOO		18:00:00				WAO/S847879	18:00:00	18:15:00	3	YYYYYYY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	00:15:00	0	
WALTLOO	8714	1	CENTRAL	WAO/S847879	18:15:00	00:00:00	00:15:00			WAO/S847879						00:15:00	0	0.1
WALTLOO	8716	1	CENTRAL	WALTLOO		20:00:00				WAO/S847879	20:00:00	20:15:00	3	YYYYYYY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	00:15:00	0	
WALTLOO	8716	1	CENTRAL	WAO/S847879	20:15:00	00:00:00	00:15:00			WAO/S847879						00:15:00	0	0.1
WALTLOO	8946	1	CENTRAL	WALTLOO		12:00:00				WAO/S847879	12:00:00	12:45:00	3	YYYYYYY	LIGHTAIRBRAKE/MOTORCAR	00:45:00	0	
WALTLOO	8946	1	CENTRAL	WAO/S847879	12:45:00	00:00:00	00:45:00		C RT	WAO/S847879						00:45:00	0	0.1
WALTLOO	1361	1	CENTRAL	WALTLOO		15:50:00				PRETORIAWES	15:50:00	16:31:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:41:00	0	
WALTLOO	1361	1	CENTRAL	EERSTERUS	15:55:00	15:55:00	00:05:00			PRETORIAWES						00:41:00	0	1.55
WALTLOO	1361	1	CENTRAL	EFN-SILVERTON	15:58:00	15:58:00	00:03:00			PRETORIAWES						00:41:00	0	1.31
WALTLOO	1361	1	CENTRAL	KOEDOESPOORT	16:01:00	16:01:00	00:03:00			PRETORIAWES						00:41:00	0	1.81
WALTLOO	1361	2	CENTRAL	RISSIK	16:11:00	16:11:00	00:10:00			PRETORIAWES						00:41:00	0	5.48
WALTLOO	1361	3	CENTRAL	LOFTUSVERSFEL	16:13:00	16:13:00	00:02:00			PRETORIAWES						00:41:00	0	0.98
WALTLOO	1361	3	CENTRAL	WALKERSTREET	16:15:00	16:15:00	00:02:00			PRETORIAWES						00:41:00	0	1.47
WALTLOO	1361	3	CENTRAL	DEVENISHSTREE	16:17:00	16:17:00	00:02:00			PRETORIAWES						00:41:00	0	0.79
WALTLOO	1361	3	CENTRAL	MEARSSTREET	16:19:00	16:19:00	00:02:00			PRETORIAWES						00:41:00	0	0.77
WALTLOO	1361	3	CENTRAL	PRETORIA	16:21:00	16:21:00	00:02:00			PRETORIAWES						00:41:00	0	1.34
WALTLOO	1361	4	CENTRAL	BARRACKS	16:26:00	16:26:00	00:05:00			PRETORIAWES						00:41:00	0	1
WALTLOO	1361	4	CENTRAL	PRETORIAWES	16:31:00	00:00:00	00:05:00			PRETORIAWES						00:41:00	0	1.19
WALTLOO	1365	1	CENTRAL	WALTLOO		02:50:00				PRETORIAWES	02:50:00	03:31:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:41:00	0	
WALTLOO	1365	1	CENTRAL	EERSTERUS	02:55:00	02:55:00	00:05:00			PRETORIAWES						00:41:00	0	1.55
WALTLOO	1365	1	CENTRAL	EFN-SILVERTON	02:58:00	02:58:00	00:03:00			PRETORIAWES						00:41:00	0	1.31
WALTLOO	1365	1	CENTRAL	KOEDOESPOORT	03:01:00	03:01:00	00:03:00			PRETORIAWES						00:41:00	0	1.81
WALTLOO	1365	2	CENTRAL	RISSIK	03:11:00	03:11:00	00:10:00			PRETORIAWES						00:41:00	0	5.48
WALTLOO	1365	3	CENTRAL	LOFTUSVERSFEL	03:13:00	03:13:00	00:02:00			PRETORIAWES						00:41:00	0	0.98
WALTLOO	1365	3	CENTRAL	WALKERSTREET	03:15:00	03:15:00	00:02:00			PRETORIAWES						00:41:00	0	1.47
WALTLOO	1365	3	CENTRAL	DEVENISHSTREE	03:17:00	03:17:00	00:02:00			PRETORIAWES						00:41:00	0	0.79
WALTLOO	1365	3	CENTRAL	MEARSSTREET	03:19:00	03:19:00	00:02:00			PRETORIAWES						00:41:00	0	0.77
WALTLOO	1365	3	CENTRAL	PRETORIA	03:21:00	03:21:00	00:02:00			PRETORIAWES						00:41:00	0	1.34
WALTLOO	1365	4	CENTRAL	BARRACKS	03:26:00	03:26:00	00:05:00			PRETORIAWES						00:41:00	0	1
WALTLOO	1365	4	CENTRAL	PRETORIAWES	03:31:00	00:00:00	00:05:00			PRETORIAWES						00:41:00	0	1.19
WALTLOO	4000	1	CENTRAL	WALTLOO		10:00:00				PRETORIAWES	10:00:00	10:40:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:40:00	0	
WALTLOO	4000	1	CENTRAL	EERSTERUS	10:04:00	10:04:00	00:04:00			PRETORIAWES						00:40:00	0	1.55
WALTLOO	4000	1	CENTRAL	EFN-SILVERTON	10:07:00	10:07:00	00:03:00			PRETORIAWES						00:40:00	0	1.31
WALTLOO	4000	1	CENTRAL	KOEDOESPOORT	10:10:00	10:10:00	00:03:00			PRETORIAWES						00:40:00	0	1.81
WALTLOO	4000	2	CENTRAL	RISSIK	10:20:00	10:20:00	00:10:00			PRETORIAWES						00:40:00	0	5.48
WALTLOO	4000	3	CENTRAL	LOFTUSVERSFEL	10:22:00	10:22:00	00:02:00			PRETORIAWES						00:40:00	0	0.98
WALTLOO	4000	3	CENTRAL	WALKERSTREET	10:24:00	10:24:00	00:02:00			PRETORIAWES						00:40:00	0	1.47
WALTLOO	4000	3	CENTRAL	DEVENISHSTREE	10:26:00	10:26:00	00:02:00			PRETORIAWES						00:40:00	0	0.79
WALTLOO	4000	3	CENTRAL	MEARSSTREET	10:28:00	10:28:00	00:02:00			PRETORIAWES						00:40:00	0	0.77
WALTLOO	4000	3	CENTRAL	PRETORIA	10:30:00	10:30:00	00:02:00			PRETORIAWES						00:40:00	0	1.34
WALTLOO	4000	4	CENTRAL	BARRACKS	10:35:00	10:35:00	00:05:00			PRETORIAWES						00:40:00	0	1
WALTLOO	4000	4	CENTRAL	PRETORIAWES	10:40:00	00:00:00	00:05:00			PRETORIAWES						00:40:00	0	1.19
WALTLOO	4002	1	CENTRAL	WALTLOO		13:00:00				KOEDOESPOORT	13:00:00	13:10:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:10:00	0	
WALTLOO	4002	1	CENTRAL	EERSTERUS	13:04:00	13:04:00	00:04:00			KOEDOESPOORT						00:10:00	0	1.55
WALTLOO	4002	1	CENTRAL	EFN-SILVERTON	13:07:00	13:07:00	00:03:00			KOEDOESPOORT						00:10:00	0	1.31
WALTLOO	4002	1	CENTRAL	KOEDOESPOORT	13:10:00	00:00:00	00:03:00			KOEDOESPOORT						00:10:00	0	1.81
WALTLOO	4006	1	CENTRAL	WALTLOO		12:00:00				CAPITALPARK	12:00:00	12:20:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:20:00	0	
WALTLOO	4006	1	CENTRAL	EERSTERUS	12:03:00	12:03:00	00:03:00			CAPITALPARK						00:20:00	0	1.55
WALTLOO	4006	1	CENTRAL	EFN-SILVERTON	12:06:00	12:06:00	00:03:00			CAPITALPARK						00:20:00	0	1.31
WALTLOO	4006	1	CENTRAL	KOEDOESPOORT	12:10:00	12:10:00	00:04:00			CAPITALPARK						00:20:00	0	1.81
WALTLOO	4006	2	CENTRAL	QUEENSWOOD	12:15:00	12:15:00	00:05:00			CAPITALPARK						00:20:00	0	2.74
WALTLOO	4006	3	CENTRAL	VILLIERIA	12:16:00	12:16:00	00:01:00			CAPITALPARK						00:20:00	0	2.37
WALTLOO	4006	3	CENTRAL	DEERNESS	12:17:00	12:17:00	00:01:00			CAPITALPARK						00:20:00	0	1.34
WALTLOO	4006	3	CENTRAL	GEZINA	12:18:00	12:18:00	00:01:00			CAPITALPARK						00:20:00	0	1.07
WALTLOO	4006	3	CENTRAL	PIERNEEFSRUS	12:19:00	12:19:00	00:01:00			CAPITALPARK						00:20:00	0	3.5
WALTLOO	4006	3	CENTRAL	CAPITALPARK	12:20:00	00:00:00	00:01:00			CAPITALPARK						00:20:00	0	5.07
WALTLOO	4878	1	CENTRAL	WALTLOO		20:00:00				CAPITALPARK	20:00:00	20:20:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:20:00	0	
WALTLOO	4878	1	CENTRAL	EERSTERUS	20:03:00	20:03:00	00:03:00			CAPITALPARK						00:20:00	0	1.55
WALTLOO	4878	1	CENTRAL	EFN-SILVERTON	20:06:00	20:06:00	00:03:00			CAPITALPARK						00:20:00	0	1.31
WALTLOO	4878	1	CENTRAL	KOEDOESPOORT	20:10:00	20:10:00	00:04:00			CAPITALPARK						00:20:00	0	1.81
WALTLOO	4878	2	CENTRAL	QUEENSWOOD	20:15:00	20:15:00	00:05:00			CAPITALPARK						00:20:00	0	2.74
WALTLOO	4878	3	CENTRAL	VILLIERIA	20:16:00	20:16:00	00:01:00			CAPITALPARK						00:20:00	0	2.37
WALTLOO	4878	3	CENTRAL	DEERNESS	20:17:00	20:17:00	00:01:00			CAPITALPARK						00:20:00	0	1.34
WALTLOO	4878	3	CENTRAL	GEZINA	20:18:00	20:18:00	00:01:00			CAPITALPARK						00:20:00	0	1.07
WALTLOO	4878	3	CENTRAL	PIERNEEFSRUS	20:19:00	20:19:00	00:01:00			CAPITALPARK						00:20:00	0	3.5
WALTLOO	4878	3	CENTRAL	CAPITALPARK	20:20:00	00:00:00	00:01:00			CAPITALPARK						00:20:00	0	5.07
WALTLOO	8808	1	CENTRAL	WALTLOO		15:00:00				CAPITALPARK	15:00:00	15:20:00	3	YYYYYYY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	00:20:00	0	
WALTLOO	8808	1	CENTRAL	EERSTERUS	15:03:00	15:03:00	00:03:00			CAPITALPARK						00:20:00	0	1.55
WALTLOO	8808	1	CENTRAL	EFN-SILVERTON	15:06:00	15:06:00	00:03:00			CAPITALPARK						00:20:00	0	1.31
WALTLOO	8808	1	CENTRAL	KOEDOESPOORT	15:10:00	15:10:00	00:04:00			CAPITALPARK						00:20:00	0	1.81
WALTLOO	8808	2	CENTRAL	QUEENSWOOD	15:15:00	15:15:00	00:05:00			CAPITALPARK						00:20:00	0	2.74
WALTLOO	8808	3	CENTRAL	VILLIERIA	15:16:00	15:16:00	00:01:00			CAPITALPARK						00:20:00	0	2.37
WALTLOO	8808	3	CENTRAL	DEERNESS	15:17:00	15:17:00	00:01:00			CAPITALPARK						00:20:00	0	1.34
WALTLOO	8808	3	CENTRAL	GEZINA	15:18:00	15:18:00	00:01:00			CAPITALPARK						00:20:00	0	1.07
WALTLOO	8808	3	CENTRAL	PIERNEEFSRUS	15:19:00	15:19:00	00:01:00			CAPITALPARK						00:20:00	0	3.5
WALTLOO	8808	3	CENTRAL	CAPITALPARK	15:20:00	00:00:00	00:01:00			CAPITALPARK						00:20:00	0	5.07
WALTLOO	8878	1	CENTRAL	WALTLOO		02:00:00				CAPITALPARK	02:00:00	02:20:00	3	YYYYYYY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	00:20:00	0	
WALTLOO	8878	1	CENTRAL	EERSTERUS	02:03:00	02:03:00	00:03:00			CAPITALPARK						00:20:00	0	1.55
WALTLOO	8878	1	CENTRAL	EFN-SILVERTON	02:06:00	02:06:00	00:03:00			CAPITALPARK						00:20:00	0	1.31
WALTLOO	8878	1	CENTRAL	KOEDOESPOORT	02:10:00	02:10:00	00:04:00			CAPITALPARK						00:20:00	0	1.81
WALTLOO	8878	2	CENTRAL	QUEENSWOOD	02:15:00	02:15:00	00:05:00			CAPITALPARK						00:20:00	0	2.74
WALTLOO	8878	3	CENTRAL	VILLIERIA	02:16:00	02:16:00	00:01:00			CAPITALPARK						00:20:00	0	2.37
WALTLOO	8878	3	CENTRAL	DEERNESS	02:17:00	02:17:00	00:01:00			CAPITALPARK						00:20:00	0	1.34
WALTLOO	8878	3	CENTRAL	GEZINA	02:18:00	02:18:00	00:01:00			CAPITALPARK						00:20:00	0	1.07
WALTLOO	8878	3	CENTRAL	PIERNEEFSRUS	02:19:00	02:19:00	00:01:00			CAPITALPARK						00:20:00	0	3.5
WALTLOO	8878	3	CENTRAL	CAPITALPARK	02:20:00	00:00:00	00:01:00			CAPITALPARK						00:20:00	0	5.07
WALTLOO	1390	1	CENTRAL	WALTLOO		12:06:00				WELGEDAG	12:06:00	13:46:00	2	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:40:00	0	
WALTLOO	1390	1	CENTRAL	DENNEBOOM	12:12:00	12:12:00	00:06:00		B	WELGEDAG						01:40:00	0	1.6
WALTLOO	1390	1	CENTRAL	EERSTEFABRIEK	12:17:00	12:17:00	00:05:00			WELGEDAG						01:40:00	0	2.39
WALTLOO	1390	2	CENTRAL	LUD(STQLYN)	12:19:00	12:19:00	00:02:00			WELGEDAG						01:40:00	0	12.67
WALTLOO	1390	3	CENTRAL	DONKERHOEK	12:22:00	12:22:00	00:03:00			WELGEDAG						01:40:00	0	4.95
WALTLOO	1390	3	CENTRAL	TWEEDRAG	12:34:00	12:34:00	00:12:00			WELGEDAG						01:40:00	0	8.76
WALTLOO	1390	3	CENTRAL	KLEINSONDERHOUT	12:41:00	12:41:00	00:07:00			WELGEDAG						01:40:00	0	5.5
WALTLOO	1390	3	CENTRAL	ROODEKNOPPIES	12:49:00	12:49:00	00:08:00			WELGEDAG						01:40:00	0	6.91
WALTLOO	1390	3	CENTRAL	KNOPPIESFONTE	13:03:00	13:03:00	00:14:00			WELGEDAG						01:40:00	0	12.66
WALTLOO	1390	3	CENTRAL	YSTERVARKFONT	13:07:00	13:07:00	00:04:00			WELGEDAG						01:40:00	0	3.43
WALTLOO	1390	4	CENTRAL	STQ-KATBOSFONTEIN	13:11:00	13:11:00	00:04:00			WELGEDAG						01:40:00	0	7.62
WALTLOO	1390	5	CENTRAL	ZESFONTEIN	13:20:00	13:20:00	00:09:00			WELGEDAG						01:40:00	0	6.05
WALTLOO	1390	6	CENTRAL	COWLESDAM	13:30:17	13:30:17	00:10:17			WELGEDAG						01:40:00	0	9.59
WALTLOO	1390	7	NORTH	WELGEDAG	13:46:00	00:00:00	00:15:43		RT	WELGEDAG						01:40:00	0	5.83
WALTLOO	1392	1	CENTRAL	WALTLOO		19:24:00				WELGEDAG	19:24:00	21:01:00	2	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:37:00	0	
WALTLOO	1392	1	CENTRAL	DENNEBOOM	19:29:00	19:29:00	00:05:00		B	WELGEDAG						01:37:00	0	1.6
WALTLOO	1392	1	CENTRAL	EERSTEFABRIEK	19:33:00	19:33:00	00:04:00			WELGEDAG						01:37:00	0	2.39
WALTLOO	1392	2	CENTRAL	LUD(STQLYN)	19:35:00	19:35:00	00:02:00			WELGEDAG						01:37:00	0	12.67
WALTLOO	1392	3	CENTRAL	DONKERHOEK	19:40:00	19:40:00	00:05:00			WELGEDAG						01:37:00	0	4.95
WALTLOO	1392	3	CENTRAL	TWEEDRAG	19:51:00	19:51:00	00:11:00			WELGEDAG						01:37:00	0	8.76
WALTLOO	1392	3	CENTRAL	KLEINSONDERHOUT	19:57:00	19:57:00	00:06:00			WELGEDAG						01:37:00	0	5.5
WALTLOO	1392	3	CENTRAL	ROODEKNOPPIES	20:04:00	20:04:00	00:07:00			WELGEDAG						01:37:00	0	6.91
WALTLOO	1392	3	CENTRAL	KNOPPIESFONTE	20:18:00	20:18:00	00:14:00			WELGEDAG						01:37:00	0	12.66
WALTLOO	1392	3	CENTRAL	YSTERVARKFONT	20:22:00	20:22:00	00:04:00			WELGEDAG						01:37:00	0	3.43
WALTLOO	1392	4	CENTRAL	STQ-KATBOSFONTEIN	20:26:00	20:26:00	00:04:00			WELGEDAG						01:37:00	0	7.62
WALTLOO	1392	5	CENTRAL	ZESFONTEIN	20:35:00	20:35:00	00:09:00			WELGEDAG						01:37:00	0	6.05
WALTLOO	1392	6	CENTRAL	SLIMESDAM	20:47:00	20:47:00	00:12:00			WELGEDAG						01:37:00	0	10.9
WALTLOO	1392	7	NORTH	WELGEDAG	21:01:00	00:00:00	00:14:00		RT	WELGEDAG						01:37:00	0	4
WALTLOO	1396	1	CENTRAL	WALTLOO		08:06:00				WELGEDAG	08:06:00	09:46:00	2	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:40:00	0	
WALTLOO	1396	1	CENTRAL	DENNEBOOM	08:12:00	08:12:00	00:06:00		B	WELGEDAG						01:40:00	0	1.6
WALTLOO	1396	1	CENTRAL	EERSTEFABRIEK	08:17:00	08:17:00	00:05:00			WELGEDAG						01:40:00	0	2.39
WALTLOO	1396	2	CENTRAL	LUD(STQLYN)	08:19:00	08:19:00	00:02:00			WELGEDAG						01:40:00	0	12.67
WALTLOO	1396	3	CENTRAL	DONKERHOEK	08:22:00	08:22:00	00:03:00			WELGEDAG						01:40:00	0	4.95
WALTLOO	1396	3	CENTRAL	TWEEDRAG	08:34:00	08:34:00	00:12:00			WELGEDAG						01:40:00	0	8.76
WALTLOO	1396	3	CENTRAL	KLEINSONDERHOUT	08:41:00	08:41:00	00:07:00			WELGEDAG						01:40:00	0	5.5
WALTLOO	1396	3	CENTRAL	ROODEKNOPPIES	08:49:00	08:49:00	00:08:00			WELGEDAG						01:40:00	0	6.91
WALTLOO	1396	3	CENTRAL	KNOPPIESFONTE	09:03:00	09:03:00	00:14:00			WELGEDAG						01:40:00	0	12.66
WALTLOO	1396	3	CENTRAL	YSTERVARKFONT	09:07:00	09:07:00	00:04:00			WELGEDAG						01:40:00	0	3.43
WALTLOO	1396	4	CENTRAL	STQ-KATBOSFONTEIN	09:11:00	09:11:00	00:04:00			WELGEDAG						01:40:00	0	7.62
WALTLOO	1396	5	CENTRAL	ZESFONTEIN	09:20:00	09:20:00	00:09:00			WELGEDAG						01:40:00	0	6.05
WALTLOO	1396	6	CENTRAL	COWLESDAM	09:30:17	09:30:17	00:10:17			WELGEDAG						01:40:00	0	9.59
WALTLOO	1396	7	NORTH	WELGEDAG	09:46:00	00:00:00	00:15:43		RT	WELGEDAG						01:40:00	0	5.83
WALTLOO	4707	1	CENTRAL	WALTLOO		15:00:00				ROSSLYN	15:00:00	16:11:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:11:00	0	
WALTLOO	4707	1	CENTRAL	EERSTERUS	15:02:00	15:02:00	00:02:00		B	ROSSLYN						01:11:00	0	1.55
WALTLOO	4707	1	CENTRAL	EFN-SILVERTON	15:04:00	15:04:00	00:02:00			ROSSLYN						01:11:00	0	1.31
WALTLOO	4707	1	CENTRAL	KOEDOESPOORT	15:06:00	15:06:00	00:02:00			ROSSLYN						01:11:00	0	1.81
WALTLOO	4707	2	CENTRAL	QUEENSWOOD	15:09:00	15:09:00	00:03:00			ROSSLYN						01:11:00	0	2.74
WALTLOO	4707	3	CENTRAL	VILLIERIA	15:11:00	15:11:00	00:02:00			ROSSLYN						01:11:00	0	2.37
WALTLOO	4707	3	CENTRAL	DEERNESS	15:13:00	15:13:00	00:02:00			ROSSLYN						01:11:00	0	1.34
WALTLOO	4707	3	CENTRAL	GEZINA	15:15:00	15:15:00	00:02:00			ROSSLYN						01:11:00	0	1.07
WALTLOO	4707	3	CENTRAL	PIERNEEFSRUS	15:17:00	15:17:00	00:02:00			ROSSLYN						01:11:00	0	3.5
WALTLOO	4707	3	CENTRAL	CAPITALPARK	15:21:00	15:21:00	00:04:00			ROSSLYN						01:11:00	0	5.07
WALTLOO	4707	4	CENTRAL	CPK-WES	15:25:00	15:25:00	00:04:00			ROSSLYN						01:11:00	0	0.8
WALTLOO	4707	5	CENTRAL	DASPOORT	15:34:00	15:34:00	00:09:00			ROSSLYN						01:11:00	0	2.02
WALTLOO	4707	6	CENTRAL	MOUNTAINVIEW	15:36:00	15:36:00	00:02:00			ROSSLYN						01:11:00	0	1.63
WALTLOO	4707	6	CENTRAL	WONDERBOOM	15:38:00	15:38:00	00:02:00			ROSSLYN						01:11:00	0	3.31
WALTLOO	4707	6	CENTRAL	PRETORIANOORD	15:45:00	15:45:00	00:07:00			ROSSLYN						01:11:00	0	1.05
WALTLOO	4707	7	CENTRAL	WOLMERTON	15:56:00	15:56:00	00:11:00			ROSSLYN						01:11:00	0	2.45
WALTLOO	4707	8	CENTRAL	WINTERSNEST	16:02:00	16:02:00	00:06:00			ROSSLYN						01:11:00	0	3.95
WALTLOO	4707	9	CENTRAL	ROSSLYN	16:11:00	00:00:00	00:09:00			ROSSLYN						01:11:00	0	3.45
WALTLOO	8709	1	CENTRAL	WALTLOO		15:00:00				ROSSLYN	15:00:00	16:11:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	01:11:00	0	
WALTLOO	8709	1	CENTRAL	EERSTERUS	15:02:00	15:02:00	00:02:00		B	ROSSLYN						01:11:00	0	1.55
WALTLOO	8709	1	CENTRAL	EFN-SILVERTON	15:04:00	15:04:00	00:02:00			ROSSLYN						01:11:00	0	1.31
WALTLOO	8709	1	CENTRAL	KOEDOESPOORT	15:06:00	15:06:00	00:02:00			ROSSLYN						01:11:00	0	1.81
WALTLOO	8709	2	CENTRAL	QUEENSWOOD	15:09:00	15:09:00	00:03:00			ROSSLYN						01:11:00	0	2.74
WALTLOO	8709	3	CENTRAL	VILLIERIA	15:11:00	15:11:00	00:02:00			ROSSLYN						01:11:00	0	2.37
WALTLOO	8709	3	CENTRAL	DEERNESS	15:13:00	15:13:00	00:02:00			ROSSLYN						01:11:00	0	1.34
WALTLOO	8709	3	CENTRAL	GEZINA	15:15:00	15:15:00	00:02:00			ROSSLYN						01:11:00	0	1.07
WALTLOO	8709	3	CENTRAL	PIERNEEFSRUS	15:17:00	15:17:00	00:02:00			ROSSLYN						01:11:00	0	3.5
WALTLOO	8709	3	CENTRAL	CAPITALPARK	15:21:00	15:21:00	00:04:00			ROSSLYN						01:11:00	0	5.07
WALTLOO	8709	4	CENTRAL	CPK-WES	15:25:00	15:25:00	00:04:00			ROSSLYN						01:11:00	0	0.8
WALTLOO	8709	5	CENTRAL	DASPOORT	15:34:00	15:34:00	00:09:00			ROSSLYN						01:11:00	0	2.02
WALTLOO	8709	6	CENTRAL	MOUNTAINVIEW	15:36:00	15:36:00	00:02:00			ROSSLYN						01:11:00	0	1.63
WALTLOO	8709	6	CENTRAL	WONDERBOOM	15:38:00	15:38:00	00:02:00			ROSSLYN						01:11:00	0	3.31
WALTLOO	8709	6	CENTRAL	PRETORIANOORD	15:45:00	15:45:00	00:07:00			ROSSLYN						01:11:00	0	1.05
WALTLOO	8709	7	CENTRAL	WOLMERTON	15:56:00	15:56:00	00:11:00			ROSSLYN						01:11:00	0	2.45
WALTLOO	8709	8	CENTRAL	WINTERSNEST	16:02:00	16:02:00	00:06:00			ROSSLYN						01:11:00	0	3.95
WALTLOO	8709	9	CENTRAL	ROSSLYN	16:11:00	00:00:00	00:09:00			ROSSLYN						01:11:00	0	3.45
WALTLOO	4912	1	CENTRAL	WALTLOO		16:20:00				SENTRARAND	16:20:00	17:57:00	2	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:37:00	0	
WALTLOO	4912	1	CENTRAL	DENNEBOOM	16:26:00	16:26:00	00:06:00		B	SENTRARAND						01:37:00	0	1.6
WALTLOO	4912	1	CENTRAL	EERSTEFABRIEK	16:34:00	16:34:00	00:08:00			SENTRARAND						01:37:00	0	2.39
WALTLOO	4912	2	CENTRAL	LUD(STQLYN)	16:36:00	16:36:00	00:02:00			SENTRARAND						01:37:00	0	12.67
WALTLOO	4912	3	CENTRAL	DONKERHOEK	16:39:00	16:39:00	00:03:00			SENTRARAND						01:37:00	0	4.95
WALTLOO	4912	3	CENTRAL	TWEEDRAG	16:51:00	16:51:00	00:12:00			SENTRARAND						01:37:00	0	8.76
WALTLOO	4912	3	CENTRAL	KLEINSONDERHOUT	16:58:00	16:58:00	00:07:00			SENTRARAND						01:37:00	0	5.5
WALTLOO	4912	3	CENTRAL	ROODEKNOPPIES	17:06:00	17:06:00	00:08:00			SENTRARAND						01:37:00	0	6.91
WALTLOO	4912	3	CENTRAL	KNOPPIESFONTE	17:20:00	17:20:00	00:14:00			SENTRARAND						01:37:00	0	12.66
WALTLOO	4912	3	CENTRAL	YSTERVARKFONT	17:24:00	17:24:00	00:04:00			SENTRARAND						01:37:00	0	3.43
WALTLOO	4912	4	CENTRAL	STQ-KATBOSFONTEIN	17:28:00	17:28:00	00:04:00			SENTRARAND						01:37:00	0	7.62
WALTLOO	4912	5	CENTRAL	STQ-VARKFONTEIN	17:34:00	17:34:00	00:06:00			SENTRARAND						01:37:00	0	15
WALTLOO	4912	6	CENTRAL	SENTRARAND	17:57:00	00:00:00	00:23:00		RT	SENTRARAND						01:37:00	0	4.83
WALTLOO	4994	1	CENTRAL	WALTLOO		20:45:00				SENTRARAND	20:45:00	22:22:00	2	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:37:00	0	
WALTLOO	4994	1	CENTRAL	DENNEBOOM	20:51:00	20:51:00	00:06:00		B	SENTRARAND						01:37:00	0	1.6
WALTLOO	4994	1	CENTRAL	EERSTEFABRIEK	20:59:00	20:59:00	00:08:00			SENTRARAND						01:37:00	0	2.39
WALTLOO	4994	2	CENTRAL	LUD(STQLYN)	21:01:00	21:01:00	00:02:00			SENTRARAND						01:37:00	0	12.67
WALTLOO	4994	3	CENTRAL	DONKERHOEK	21:04:00	21:04:00	00:03:00			SENTRARAND						01:37:00	0	4.95
WALTLOO	4994	3	CENTRAL	TWEEDRAG	21:16:00	21:16:00	00:12:00			SENTRARAND						01:37:00	0	8.76
WALTLOO	4994	3	CENTRAL	KLEINSONDERHOUT	21:23:00	21:23:00	00:07:00			SENTRARAND						01:37:00	0	5.5
WALTLOO	4994	3	CENTRAL	ROODEKNOPPIES	21:31:00	21:31:00	00:08:00			SENTRARAND						01:37:00	0	6.91
WALTLOO	4994	3	CENTRAL	KNOPPIESFONTE	21:45:00	21:45:00	00:14:00			SENTRARAND						01:37:00	0	12.66
WALTLOO	4994	3	CENTRAL	YSTERVARKFONT	21:49:00	21:49:00	00:04:00			SENTRARAND						01:37:00	0	3.43
WALTLOO	4994	4	CENTRAL	STQ-KATBOSFONTEIN	21:53:00	21:53:00	00:04:00			SENTRARAND						01:37:00	0	7.62
WALTLOO	4994	5	CENTRAL	STQ-VARKFONTEIN	21:59:00	21:59:00	00:06:00			SENTRARAND						01:37:00	0	15
WALTLOO	4994	6	CENTRAL	SENTRARAND	22:22:00	00:00:00	00:23:00		RT	SENTRARAND						01:37:00	0	4.83
WALTLOO	8995	1	CENTRAL	WALTLOO		20:45:00				SENTRARAND	20:45:00	22:22:00	2	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	01:37:00	0	
WALTLOO	8995	1	CENTRAL	DENNEBOOM	20:51:00	20:51:00	00:06:00		B	SENTRARAND						01:37:00	0	1.6
WALTLOO	8995	1	CENTRAL	EERSTEFABRIEK	20:59:00	20:59:00	00:08:00			SENTRARAND						01:37:00	0	2.39
WALTLOO	8995	2	CENTRAL	LUD(STQLYN)	21:01:00	21:01:00	00:02:00			SENTRARAND						01:37:00	0	12.67
WALTLOO	8995	3	CENTRAL	DONKERHOEK	21:04:00	21:04:00	00:03:00			SENTRARAND						01:37:00	0	4.95
WALTLOO	8995	3	CENTRAL	TWEEDRAG	21:16:00	21:16:00	00:12:00			SENTRARAND						01:37:00	0	8.76
WALTLOO	8995	3	CENTRAL	KLEINSONDERHOUT	21:23:00	21:23:00	00:07:00			SENTRARAND						01:37:00	0	5.5
WALTLOO	8995	3	CENTRAL	ROODEKNOPPIES	21:31:00	21:31:00	00:08:00			SENTRARAND						01:37:00	0	6.91
WALTLOO	8995	3	CENTRAL	KNOPPIESFONTE	21:45:00	21:45:00	00:14:00			SENTRARAND						01:37:00	0	12.66
WALTLOO	8995	3	CENTRAL	YSTERVARKFONT	21:49:00	21:49:00	00:04:00			SENTRARAND						01:37:00	0	3.43
WALTLOO	8995	4	CENTRAL	STQ-KATBOSFONTEIN	21:53:00	21:53:00	00:04:00			SENTRARAND						01:37:00	0	7.62
WALTLOO	8995	5	CENTRAL	STQ-VARKFONTEIN	21:59:00	21:59:00	00:06:00			SENTRARAND						01:37:00	0	15
WALTLOO	8995	6	CENTRAL	SENTRARAND	22:22:00	00:00:00	00:23:00		RT	SENTRARAND						01:37:00	0	4.83
WALTLOO	7746	1	CENTRAL	WALTLOO		04:00:00				SENTRARAND	04:00:00	05:37:00	2	YYYYYYY	VACUUM TRAINS/LIGHT LOCO	01:37:00	0	
WALTLOO	7746	1	CENTRAL	DENNEBOOM	04:06:00	04:06:00	00:06:00		B	SENTRARAND						01:37:00	0	1.6
WALTLOO	7746	1	CENTRAL	EERSTEFABRIEK	04:14:00	04:14:00	00:08:00			SENTRARAND						01:37:00	0	2.39
WALTLOO	7746	2	CENTRAL	LUD(STQLYN)	04:16:00	04:16:00	00:02:00			SENTRARAND						01:37:00	0	12.67
WALTLOO	7746	3	CENTRAL	DONKERHOEK	04:19:00	04:19:00	00:03:00			SENTRARAND						01:37:00	0	4.95
WALTLOO	7746	3	CENTRAL	TWEEDRAG	04:31:00	04:31:00	00:12:00			SENTRARAND						01:37:00	0	8.76
WALTLOO	7746	3	CENTRAL	KLEINSONDERHOUT	04:38:00	04:38:00	00:07:00			SENTRARAND						01:37:00	0	5.5
WALTLOO	7746	3	CENTRAL	ROODEKNOPPIES	04:46:00	04:46:00	00:08:00			SENTRARAND						01:37:00	0	6.91
WALTLOO	7746	3	CENTRAL	KNOPPIESFONTE	05:00:00	05:00:00	00:14:00			SENTRARAND						01:37:00	0	12.66
WALTLOO	7746	3	CENTRAL	YSTERVARKFONT	05:04:00	05:04:00	00:04:00			SENTRARAND						01:37:00	0	3.43
WALTLOO	7746	4	CENTRAL	STQ-KATBOSFONTEIN	05:08:00	05:08:00	00:04:00			SENTRARAND						01:37:00	0	7.62
WALTLOO	7746	5	CENTRAL	STQ-VARKFONTEIN	05:14:00	05:14:00	00:06:00			SENTRARAND						01:37:00	0	15
WALTLOO	7746	6	CENTRAL	SENTRARAND	05:37:00	00:00:00	00:23:00		RT	SENTRARAND						01:37:00	0	4.83
WALTLOO	5733	1	CENTRAL	WALTLOO		02:30:00				PYRAMID	02:30:00	03:30:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:00:00	0	
WALTLOO	5733	1	CENTRAL	EERSTERUS	02:34:00	02:34:00	00:04:00			PYRAMID						01:00:00	0	1.55
WALTLOO	5733	1	CENTRAL	EFN-SILVERTON	02:37:00	02:37:00	00:03:00			PYRAMID						01:00:00	0	1.31
WALTLOO	5733	1	CENTRAL	KOEDOESPOORT	02:40:00	02:40:00	00:03:00			PYRAMID						01:00:00	0	1.81
WALTLOO	5733	2	CENTRAL	QUEENSWOOD	02:45:00	02:45:00	00:05:00			PYRAMID						01:00:00	0	2.74
WALTLOO	5733	3	CENTRAL	VILLIERIA	02:46:00	02:46:00	00:01:00			PYRAMID						01:00:00	0	2.37
WALTLOO	5733	3	CENTRAL	DEERNESS	02:47:00	02:47:00	00:01:00			PYRAMID						01:00:00	0	1.34
WALTLOO	5733	3	CENTRAL	GEZINA	02:48:00	02:48:00	00:01:00			PYRAMID						01:00:00	0	1.07
WALTLOO	5733	3	CENTRAL	PIERNEEFSRUS	02:49:00	02:49:00	00:01:00			PYRAMID						01:00:00	0	3.5
WALTLOO	5733	3	CENTRAL	CAPITALPARK	02:50:00	02:50:00	00:01:00			PYRAMID						01:00:00	0	5.07
WALTLOO	5733	4	CENTRAL	CPK-WES	02:52:00	02:52:00	00:02:00			PYRAMID						01:00:00	0	0.8
WALTLOO	5733	5	CENTRAL	DASPOORT	02:58:00	02:58:00	00:06:00			PYRAMID						01:00:00	0	2.02
WALTLOO	5733	6	CENTRAL	MOUNTAINVIEW	03:02:00	03:02:00	00:04:00			PYRAMID						01:00:00	0	1.63
WALTLOO	5733	6	CENTRAL	WONDERBOOM	03:05:00	03:05:00	00:03:00			PYRAMID						01:00:00	0	3.31
WALTLOO	5733	6	CENTRAL	PRETORIANOORD	03:08:00	03:08:00	00:03:00			PYRAMID						01:00:00	0	1.05
WALTLOO	5733	7	CENTRAL	MEERSIG	03:11:00	03:11:00	00:03:00			PYRAMID						01:00:00	0	3.54
WALTLOO	5733	7	CENTRAL	BONACCORD	03:15:00	03:15:00	00:04:00			PYRAMID						01:00:00	0	1.86
WALTLOO	5733	8	NORTH	SPHINX	03:21:00	03:21:00	00:06:00			PYRAMID						01:00:00	0	3.35
WALTLOO	5733	8	NORTH	PYRAMID	03:30:00	00:00:00	00:09:00			PYRAMID						01:00:00	0	2.64
WALTLOO	5921	1	CENTRAL	WALTLOO		00:30:00				PYRAMIDSUID	00:30:00	01:59:00	1	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:29:00	0	
WALTLOO	5921	1	CENTRAL	EERSTERUS	00:32:00	00:32:00	00:02:00		C	PYRAMIDSUID						01:29:00	0	1.55
WALTLOO	5921	1	CENTRAL	EFN-SILVERTON	00:35:00	00:35:00	00:03:00			PYRAMIDSUID						01:29:00	0	1.31
WALTLOO	5921	1	CENTRAL	KOEDOESPOORT	00:37:00	00:37:00	00:02:00			PYRAMIDSUID						01:29:00	0	1.81
WALTLOO	5921	2	CENTRAL	QUEENSWOOD	00:40:00	00:40:00	00:03:00			PYRAMIDSUID						01:29:00	0	2.74
WALTLOO	5921	3	CENTRAL	VILLIERIA	00:44:00	00:44:00	00:04:00			PYRAMIDSUID						01:29:00	0	2.37
WALTLOO	5921	3	CENTRAL	DEERNESS	00:48:00	00:48:00	00:04:00			PYRAMIDSUID						01:29:00	0	1.34
WALTLOO	5921	3	CENTRAL	GEZINA	00:52:00	00:52:00	00:04:00			PYRAMIDSUID						01:29:00	0	1.07
WALTLOO	5921	3	CENTRAL	PIERNEEFSRUS	00:56:00	00:56:00	00:04:00			PYRAMIDSUID						01:29:00	0	3.5
WALTLOO	5921	3	CENTRAL	CAPITALPARK	01:00:00	01:00:00	00:04:00			PYRAMIDSUID						01:29:00	0	5.07
WALTLOO	5921	4	CENTRAL	CPK-WES	01:01:00	01:01:00	00:01:00			PYRAMIDSUID						01:29:00	0	0.8
WALTLOO	5921	5	CENTRAL	DASPOORT	01:15:00	01:15:00	00:14:00			PYRAMIDSUID						01:29:00	0	2.02
WALTLOO	5921	6	CENTRAL	MOUNTAINVIEW	01:17:00	01:17:00	00:02:00			PYRAMIDSUID						01:29:00	0	1.63
WALTLOO	5921	6	CENTRAL	WONDERBOOM	01:19:00	01:19:00	00:02:00			PYRAMIDSUID						01:29:00	0	3.31
WALTLOO	5921	6	CENTRAL	PRETORIANOORD	01:26:00	01:26:00	00:07:00			PYRAMIDSUID						01:29:00	0	1.05
WALTLOO	5921	7	CENTRAL	MEERSIG	01:29:00	01:29:00	00:03:00			PYRAMIDSUID						01:29:00	0	3.54
WALTLOO	5921	7	CENTRAL	BONACCORD	01:36:00	01:36:00	00:07:00			PYRAMIDSUID						01:29:00	0	1.86
WALTLOO	5921	8	NORTH	SPHINX	01:38:00	01:38:00	00:02:00			PYRAMIDSUID						01:29:00	0	3.35
WALTLOO	5921	8	NORTH	PYRAMID	01:41:00	01:42:00	00:03:00	00:01:00		PYRAMIDSUID						01:29:00	0	2.64
WALTLOO	5921	9	NORTH	PYRAMIDSUID	01:59:00	00:00:00	00:17:00		RT	PYRAMIDSUID						01:29:00	0	5
WALTLOO	8217	1	CENTRAL	WALTLOO		14:00:00				PYRAMIDSUID	14:00:00	15:29:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:29:00	0	
WALTLOO	8217	1	CENTRAL	EERSTERUS	14:02:00	14:02:00	00:02:00		B	PYRAMIDSUID						01:29:00	0	1.55
WALTLOO	8217	1	CENTRAL	EFN-SILVERTON	14:05:00	14:05:00	00:03:00			PYRAMIDSUID						01:29:00	0	1.31
WALTLOO	8217	1	CENTRAL	KOEDOESPOORT	14:07:00	14:07:00	00:02:00			PYRAMIDSUID						01:29:00	0	1.81
WALTLOO	8217	2	CENTRAL	QUEENSWOOD	14:10:00	14:10:00	00:03:00			PYRAMIDSUID						01:29:00	0	2.74
WALTLOO	8217	3	CENTRAL	VILLIERIA	14:14:00	14:14:00	00:04:00			PYRAMIDSUID						01:29:00	0	2.37
WALTLOO	8217	3	CENTRAL	DEERNESS	14:18:00	14:18:00	00:04:00			PYRAMIDSUID						01:29:00	0	1.34
WALTLOO	8217	3	CENTRAL	GEZINA	14:22:00	14:22:00	00:04:00			PYRAMIDSUID						01:29:00	0	1.07
WALTLOO	8217	3	CENTRAL	PIERNEEFSRUS	14:26:00	14:26:00	00:04:00			PYRAMIDSUID						01:29:00	0	3.5
WALTLOO	8217	3	CENTRAL	CAPITALPARK	14:30:00	14:30:00	00:04:00			PYRAMIDSUID						01:29:00	0	5.07
WALTLOO	8217	4	CENTRAL	CPK-WES	14:31:00	14:31:00	00:01:00			PYRAMIDSUID						01:29:00	0	0.8
WALTLOO	8217	5	CENTRAL	DASPOORT	14:45:00	14:45:00	00:14:00			PYRAMIDSUID						01:29:00	0	2.02
WALTLOO	8217	6	CENTRAL	MOUNTAINVIEW	14:47:00	14:47:00	00:02:00			PYRAMIDSUID						01:29:00	0	1.63
WALTLOO	8217	6	CENTRAL	WONDERBOOM	14:49:00	14:49:00	00:02:00			PYRAMIDSUID						01:29:00	0	3.31
WALTLOO	8217	6	CENTRAL	PRETORIANOORD	14:56:00	14:56:00	00:07:00			PYRAMIDSUID						01:29:00	0	1.05
WALTLOO	8217	7	CENTRAL	MEERSIG	14:59:00	14:59:00	00:03:00			PYRAMIDSUID						01:29:00	0	3.54
WALTLOO	8217	7	CENTRAL	BONACCORD	15:06:00	15:06:00	00:07:00			PYRAMIDSUID						01:29:00	0	1.86
WALTLOO	8217	8	NORTH	SPHINX	15:08:00	15:08:00	00:02:00			PYRAMIDSUID						01:29:00	0	3.35
WALTLOO	8217	8	NORTH	PYRAMID	15:12:00	15:12:00	00:04:00			PYRAMIDSUID						01:29:00	0	2.64
WALTLOO	8217	9	NORTH	PYRAMIDSUID	15:29:00	00:00:00	00:17:00		RT	PYRAMIDSUID						01:29:00	0	5
WALTLOO	8961	1	CENTRAL	WALTLOO		19:05:00				KAALFONTEIN	19:05:00	20:21:30	3	YYYYYYY	LIGHTAIRBRAKE/LIGHTAIRBRAKE	01:16:00	0	
WALTLOO	8961	1	CENTRAL	EERSTERUS	19:11:30	19:11:30	00:06:30		C	KAALFONTEIN						01:16:00	0	1.55
WALTLOO	8961	1	CENTRAL	EFN-SILVERTON	19:14:30	19:14:30	00:03:00			KAALFONTEIN						01:16:00	0	1.31
WALTLOO	8961	1	CENTRAL	KOEDOESPOORT	19:17:30	19:17:30	00:03:00			KAALFONTEIN						01:16:00	0	1.81
WALTLOO	8961	2	CENTRAL	RISSIK	19:27:30	19:27:30	00:10:00			KAALFONTEIN						01:16:00	0	5.48
WALTLOO	8961	3	CENTRAL	LOFTUSVERSFEL	19:29:30	19:29:30	00:02:00			KAALFONTEIN						01:16:00	0	0.98
WALTLOO	8961	3	CENTRAL	WALKERSTREET	19:31:30	19:31:30	00:02:00			KAALFONTEIN						01:16:00	0	1.47
WALTLOO	8961	3	CENTRAL	DEVENISHSTREE	19:33:30	19:33:30	00:02:00			KAALFONTEIN						01:16:00	0	0.79
WALTLOO	8961	3	CENTRAL	MEARSSTREET	19:35:30	19:35:30	00:02:00			KAALFONTEIN						01:16:00	0	0.77
WALTLOO	8961	3	CENTRAL	PRETORIA	19:37:30	19:37:30	00:02:00			KAALFONTEIN						01:16:00	0	1.34
WALTLOO	8961	4	CENTRAL	FONTEINE	19:38:30	19:38:30	00:01:00			KAALFONTEIN						01:16:00	0	2.99
WALTLOO	8961	4	CENTRAL	KLOOFSIG	19:39:30	19:39:30	00:01:00			KAALFONTEIN						01:16:00	0	3.37
WALTLOO	8961	4	CENTRAL	SPORTPARK	19:40:30	19:40:30	00:01:00			KAALFONTEIN						01:16:00	0	1.32
WALTLOO	8961	4	CENTRAL	VERWOERDBURG	19:52:30	19:52:30	00:12:00			KAALFONTEIN						01:16:00	0	1.31
WALTLOO	8961	5	CENTRAL	IRENE	19:53:30	19:53:30	00:01:00			KAALFONTEIN						01:16:00	0	4.79
WALTLOO	8961	5	CENTRAL	PINEDENE	20:04:30	20:04:30	00:11:00			KAALFONTEIN						01:16:00	0	4.29
WALTLOO	8961	5	CENTRAL	OLIFANTSFONTEIN	20:11:30	20:11:30	00:07:00			KAALFONTEIN						01:16:00	0	5.75
WALTLOO	8961	6	CENTRAL	OAKMOOR	20:16:30	20:16:30	00:05:00			KAALFONTEIN						01:16:00	0	4.9
WALTLOO	8961	7	CENTRAL	KAALFONTEIN	20:21:30	00:00:00	00:05:00		RT	KAALFONTEIN						01:16:00	0	3.39
`;

describe('a twelfth extract: VYD-STASIE, WAKEFIELD, WARDEN and part of WALTLOO', () => {
  const all = parseRunningTimes(B12);
  const byId = (id: string) => all.find((t) => t.train === id)!;
  type Sched = ReturnType<typeof byId>;
  const flagOf = (t: Sched): 'B' | 'C' | null => {
    const r = t.rows.find((x) => (x.standingReason ?? '') !== '')?.standingReason ?? '';
    if (r === 'B' || r.startsWith('B ')) return 'B';
    if (r === 'C' || r.startsWith('C ')) return 'C';
    return null;
  };
  const brake = (t: Sched) => t.trainType.split('/')[0];

  /**
   * VYD-STASIE, WAKEFIELD and WARDEN are complete. WALTLOO is PARTIAL: its
   * seven long-distance workings (3604, 7513, 7929, 8916, 8945, 8955, 18927)
   * were not transcribed, and neither was any of WARRENTON. Nothing here is a
   * statement about those.
   */
  it('reads seventy-three trains across four origins', () => {
    expect(all).toHaveLength(73);
    expect(new Set(all.map((t) => t.origin))).toEqual(
      new Set(['VYD-STASIE', 'WAKEFIELD', 'WARDEN', 'WALTLOO']),
    );
    expect(all.reduce((n, t) => n + t.rows.length, 0)).toBe(591 - 73);
    expect(all.every(hasSummary)).toBe(true);
  });

  it('ties seventy-two of seventy-three on the clock', () => {
    const adrift = all
      .filter((t) => {
        const v = validateSchedule(t);
        return !v.elapsedIdentityHolds || !v.throughputTies;
      })
      .map((t) => t.train);
    expect(adrift).toEqual(['8961']);
  });

  /**
   * The B/C flag is not a day code. It tracks the train type.
   *
   * VYD-STASIE is as close to a controlled experiment as this corpus offers.
   * Twenty-three trains, one origin, two destinations, and ten of them running
   * node-for-node identical paths. Across all twenty-three the flag on the
   * first reason-bearing row is predicted EXACTLY by the first component of
   * the train type: every VACUUM TRAINS working carries B, every MEDIUM HEAVY
   * working carries C. Fifteen and eight, no exceptions.
   *
   * The cleanest pair is 1844 and 2844. Both leave VYD-STASIE at 16:10, both
   * reach VRYHEIDOOS at 16:20, both run 7.09 km in ten minutes, both read RT.
   * 1844 is a vacuum train and reads "B RT"; 2844 is medium heavy and reads
   * "C RT". The flag is the only thing that moves with the type.
   */
  it('predicts the VYD-STASIE flag exactly from the train type', () => {
    const vyd = all.filter((t) => t.origin === 'VYD-STASIE');
    expect(vyd).toHaveLength(23);
    for (const t of vyd) {
      const expected = brake(t) === 'VACUUM TRAINS' ? 'B' : 'C';
      expect([t.train, brake(t), flagOf(t)]).toEqual([t.train, brake(t), expected]);
    }
    const counts = vyd.reduce<Record<string, number>>((m, t) => {
      const k = `${brake(t)}/${flagOf(t)}`;
      m[k] = (m[k] ?? 0) + 1;
      return m;
    }, {});
    expect(counts).toEqual({ 'VACUUM TRAINS/B': 8, 'MEDIUM HEAVY/C': 15 });
  });

  /** 1844 and 2844: the same ten-minute hop, separated only by type and flag. */
  it('separates 1844 from 2844 by nothing but the train type and the flag', () => {
    const a = byId('1844');
    const b = byId('2844');
    expect(a.originDeparture).toBe(b.originDeparture);
    expect(a.destinationArrival).toBe(b.destinationArrival);
    expect(a.destination).toBe(b.destination);
    expect(a.rows.map((r) => [r.station, r.arrival, r.distanceKm]))
      .toEqual(b.rows.map((r) => [r.station, r.arrival, r.distanceKm]));
    expect([a.trainType, a.rows[0].standingReason]).toEqual([
      'VACUUM TRAINS/VACUUM TRAIN', 'B RT',
    ]);
    expect([b.trainType, b.rows[0].standingReason]).toEqual([
      'MEDIUM HEAVY/MEDIUM HEAVY', 'C RT',
    ]);
  });

  /**
   * Across the whole extract the rule is strong but NOT exact — four exceptions.
   *
   * Thirty-seven trains here carry a flag. Thirty-three follow the VYD-STASIE
   * rule. Four do not, and they are named rather than waved away:
   *
   *   8598, 8709, 8995 — MEDIUM HEAVY carrying B
   *   5921             — VACUUM TRAINS carrying C
   *
   * So the flag is ASSOCIATED with the train type and is not determined by it.
   * That is still the first substantive thing known about this column, and it
   * rules out the reading that it is a day-of-week code: a day code would not
   * track the brake class at all, let alone at 33 of 37.
   */
  it('finds the type-to-flag rule holds 33 of 37 times, with four named exceptions', () => {
    const flagged = all.filter((t) => flagOf(t) !== null);
    expect(flagged).toHaveLength(37);
    const breaks = flagged.filter(
      (t) => flagOf(t) !== (brake(t) === 'VACUUM TRAINS' ? 'B' : 'C'),
    );
    expect(breaks.map((t) => `${t.train}:${brake(t)}/${flagOf(t)}`).sort()).toEqual([
      '5921:VACUUM TRAINS/C',
      '8598:MEDIUM HEAVY/B',
      '8709:MEDIUM HEAVY/B',
      '8995:MEDIUM HEAVY/B',
    ]);
    expect(flagged.length - breaks.length).toBe(33);
  });

  /**
   * Ten trains to GLENCOE over one path, to the second.
   *
   * 1845, 1847, 2408, 2414, 2841, 2845, 2849, 6406, 6408 and 6491 share every
   * node, every point-to-point runtime and every standing time — the ten-minute
   * shunt at TALANA included. They leave at six distinct times, carry seven
   * different frequency strings, and 6406 is the only IMPORT COKE working.
   *
   * The largest identity group in the corpus so far: the previous best was the
   * four-way WELGEDAG 8205/8215/8219/8407.
   */
  it('runs ten trains to GLENCOE over one identical path', () => {
    const fam = all.filter((t) => t.origin === 'VYD-STASIE' && t.destination === 'GLENCOE');
    expect(fam.map((t) => t.train)).toEqual([
      '1845', '1847', '2408', '2414', '2841', '2845', '2849', '6406', '6408', '6491',
    ]);
    const shape = (t: Sched) =>
      t.rows.map((r) => [r.nodeSeq, r.station, r.pointToPointRuntime, r.standingTime, r.distanceKm]);
    for (const t of fam) {
      expect([t.train, shape(t)]).toEqual([t.train, shape(fam[0])]);
      expect([t.train, t.throughputRuntime]).toEqual([t.train, 173]);
    }
    expect(new Set(fam.map((t) => t.originDeparture)).size).toBe(5);
    expect(new Set(fam.map((t) => t.frequency)).size).toBe(4);
    expect(fam.filter((t) => t.trainType === 'MEDIUM HEAVY/IMPORT COKE').map((t) => t.train))
      .toEqual(['6406']);
  });

  /**
   * 8961 truncates its stated runtime to the whole minute — the second case.
   *
   * It arrives KAALFONTEIN at 20:21:30 and the summary says 01:16:00. Elapsed
   * is 76 minutes 30 seconds; stated is 76. Identical in form to WELGEDAG 1268
   * (§48.2), which arrived at 08:07:30 against a stated 01:02:00.
   *
   * Two instances in two different extracts, at two different origins, makes
   * this a rule of the export rather than a one-off: where the destination
   * arrival carries a half minute, the stated throughput drops it.
   */
  it('truncates the 8961 stated runtime, exactly as it truncated 1268', () => {
    const t = byId('8961');
    expect(t.destinationArrival).toBe(20 * 60 + 21.5);
    expect(elapsedMinutes(t)).toBe(76.5);
    expect(t.throughputRuntime).toBe(76);
    expect(elapsedMinutes(t)! - t.throughputRuntime).toBe(0.5);
    expect(validateSchedule(t).elapsedIdentityHolds).toBe(true);
    expect(validateSchedule(t).throughputTies).toBe(false);

    // The same shape, in the previous extract, at a different origin.
    const prior = parseRunningTimes(B10).find((s) => s.train === '1268')!;
    expect(elapsedMinutes(prior)! - prior.throughputRuntime).toBe(0.5);
    expect(prior.origin).not.toBe(t.origin);
  });

  /**
   * WARDEN 5598 and 8598 are one path booked twice — and 8598 is an exception.
   *
   * Identical nodes and clocks through fourteen shunting moves to HARRISMITH.
   * 5598 is a vacuum train whose first reason is a bare "SHUNT"; 8598 is medium
   * heavy and reads "B SHUNT" — the B flag on a medium-heavy working, which is
   * one of the four cases that breaks the VYD-STASIE rule.
   */
  it('books WARDEN 5598 and 8598 over one path, and flags the heavier one B', () => {
    const a = byId('5598');
    const b = byId('8598');
    expect(a.rows.map((r) => [r.station, r.arrival, r.departure]))
      .toEqual(b.rows.map((r) => [r.station, r.arrival, r.departure]));
    expect([a.trainType, a.rows[0].standingReason]).toEqual([
      'VACUUM TRAINS/VACUUM TRAIN', 'SHUNT',
    ]);
    expect([b.trainType, b.rows[0].standingReason]).toEqual([
      'MEDIUM HEAVY/MEDIUM HEAVY', 'B SHUNT',
    ]);
    expect(flagOf(a)).toBeNull();
    expect(flagOf(b)).toBe('B');
  });

  /** WAKEFIELD: a new origin, two trains, and one of them crosses midnight. */
  it('adds WAKEFIELD, whose 5005 arrives on the following day', () => {
    const wake = all.filter((t) => t.origin === 'WAKEFIELD');
    expect(wake.map((t) => t.train)).toEqual(['5005', '5007']);
    expect(byId('5005').rows[0].departDay).toBe(1);
    expect(byId('5007').rows[0].departDay).toBe(0);
    for (const t of wake) {
      expect([t.train, t.throughputRuntime, validateSchedule(t).elapsedIdentityHolds])
        .toEqual([t.train, 15, true]);
    }
  });

  /**
   * The WALTLOO yard pool: nineteen shunt workings over six sidings.
   *
   * Every one of them starts and finishes at WALTLOO and moves only among
   * WAO/S847917, WAO/S847941, WAO/S847933, WAO/S848743, WAO/S847984,
   * WAO/S840785, WAO/S847968 and WAO/S847844. Three pairs run the identical
   * move under two numbers — 3801/8801, 3813/8813, 3825/8825 — differing only
   * in train type, with no flag on either.
   */
  it('works the WALTLOO yard pool, three of them booked twice', () => {
    const pool = all.filter((t) => t.origin === 'WALTLOO' && t.destination === 'WALTLOO');
    expect(pool).toHaveLength(19);
    expect(pool.every((t) => t.rows.every((r) => r.station === 'WALTLOO' || r.station.startsWith('WAO/')))).toBe(true);
    const move = (t: Sched) => t.rows.map((r) => [r.station, r.arrival, r.departure]);
    for (const [a, b] of [['3801', '8801'], ['3813', '8813'], ['3825', '8825']]) {
      expect([a, move(byId(a))]).toEqual([a, move(byId(b))]);
      expect(byId(a).trainType).not.toBe(byId(b).trainType);
      expect([flagOf(byId(a)), flagOf(byId(b))]).toEqual([null, null]);
    }
  });
});

describe('the B/C flag tracks the train type across every extract read so far', () => {
  /**
   * Measured over B9, B10, B11 and B12 together rather than asserted from one
   * page. The association is strong and imperfect, and the exact figures are
   * pinned so that a later extract moving them is visible rather than silent.
   */
  it('measures the association over the whole corpus', () => {
    let flagged = 0;
    let agree = 0;
    const exceptions: string[] = [];
    for (const tsv of [B9, B10, B11, B12]) {
      for (const t of parseRunningTimes(tsv)) {
        const raw = t.rows.find((x) => (x.standingReason ?? '') !== '')?.standingReason ?? '';
        const flag = raw === 'B' || raw.startsWith('B ') ? 'B'
          : raw === 'C' || raw.startsWith('C ') ? 'C' : null;
        if (!flag) continue;
        flagged += 1;
        const expected = t.trainType.split('/')[0] === 'VACUUM TRAINS' ? 'B' : 'C';
        if (flag === expected) agree += 1;
        else exceptions.push(`${t.origin}/${t.train}:${t.trainType.split('/')[0]}/${flag}`);
      }
    }
    expect(flagged).toBe(106);
    expect(agree).toBe(90);
    expect(exceptions.sort()).toEqual([
      'KGR-WATERVAL/7224:VACUUM TRAINS/C',
      'KGR-WATERVAL/7426:MEDIUM HEAVY/B',
      'KGR-WATERVAL/7428:MEDIUM HEAVY/B',
      'KGR-WATERVAL/7429:MEDIUM HEAVY/B',
      'KGR-WATERVAL/8633:VACUUM TRAINS/C',
      'KGR-WATERVAL/8977:VACUUM TRAINS/C',
      'WALTLOO/5921:VACUUM TRAINS/C',
      'WALTLOO/8709:MEDIUM HEAVY/B',
      'WALTLOO/8995:MEDIUM HEAVY/B',
      'WARDEN/8598:MEDIUM HEAVY/B',
      'WELGEDAG/48894:MEDIUM HEAVY/B',
      'WELGEDAG/8407:MEDIUM HEAVY/B',
      'WELGEDAG/8870:MEDIUM HEAVY/B',
      'WELGEDAG/9471:MEDIUM HEAVY/B',
      'WINBURG/8906:MEDIUM HEAVY/B',
      'WOLSELEY/1418:LIGHTAIRBRAKE/B',
    ]);
    // 90 of 106 — far better than chance, and not a rule.
    expect(Math.round((agree / flagged) * 1000) / 1000).toBe(0.849);
  });
});

const B13 = `
Origin	Train	NODE_Seq	ENROUTE_Corridor	ENRTE_Station/siding number	ENROUTE_Arrival time	ENROUTE_Departure Time	Point to Point Runtime	Standingtime	StandingReason	Destination	Origin Departure Time	Destination Arrival Time	Sched	Frequency	Train Type	Train Throughput Runtime (from Origin to Destination)	Depart_Day	Distance
VANDYKSDRIF	100	1	NORTH	VANDYKSDRIF		01:00:00				VANDYKSDRIF	01:00:00	01:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	100	1	NORTH	VYF/S754293	01:05:00	01:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	100	1	NORTH	VYF/S754307	01:15:00	01:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	100	1	NORTH	VYF/S754331	01:25:00	01:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	100	2	NORTH	VYF/S754307	01:35:00	01:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	100	2	NORTH	VYF/S754293	01:45:00	01:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	100	2	NORTH	VANDYKSDRIF	01:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	300	1	NORTH	VANDYKSDRIF		03:00:00				VANDYKSDRIF	03:00:00	03:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	300	1	NORTH	VYF/S754293	03:05:00	03:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	300	1	NORTH	VYF/S754307	03:15:00	03:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	300	1	NORTH	VYF/S754331	03:25:00	03:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	300	2	NORTH	VYF/S754307	03:35:00	03:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	300	2	NORTH	VYF/S754293	03:45:00	03:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	300	2	NORTH	VANDYKSDRIF	03:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	400	1	NORTH	VANDYKSDRIF		04:00:00				VANDYKSDRIF	04:00:00	04:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	400	1	NORTH	VYF/S754293	04:05:00	04:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	400	1	NORTH	VYF/S754307	04:15:00	04:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	400	1	NORTH	VYF/S754331	04:25:00	04:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	400	2	NORTH	VYF/S754307	04:35:00	04:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	400	2	NORTH	VYF/S754293	04:45:00	04:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	400	2	NORTH	VANDYKSDRIF	04:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	500	1	NORTH	VANDYKSDRIF		05:00:00				VANDYKSDRIF	05:00:00	05:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	500	1	NORTH	VYF/S754293	05:05:00	05:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	500	1	NORTH	VYF/S754307	05:15:00	05:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	500	1	NORTH	VYF/S754331	05:25:00	05:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	500	2	NORTH	VYF/S754307	05:35:00	05:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	500	2	NORTH	VYF/S754293	05:45:00	05:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	500	2	NORTH	VANDYKSDRIF	05:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	600	1	NORTH	VANDYKSDRIF		06:00:00				VANDYKSDRIF	06:00:00	06:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	600	1	NORTH	VYF/S754293	06:05:00	06:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	600	1	NORTH	VYF/S754307	06:15:00	06:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	600	1	NORTH	VYF/S754331	06:25:00	06:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	600	2	NORTH	VYF/S754307	06:35:00	06:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	600	2	NORTH	VYF/S754293	06:45:00	06:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	600	2	NORTH	VANDYKSDRIF	06:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	700	1	NORTH	VANDYKSDRIF		07:00:00				VANDYKSDRIF	07:00:00	07:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	700	1	NORTH	VYF/S754293	07:05:00	07:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	700	1	NORTH	VYF/S754307	07:15:00	07:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	700	1	NORTH	VYF/S754331	07:25:00	07:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	700	2	NORTH	VYF/S754307	07:35:00	07:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	700	2	NORTH	VYF/S754293	07:45:00	07:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	700	2	NORTH	VANDYKSDRIF	07:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	800	1	NORTH	VANDYKSDRIF		08:00:00				VANDYKSDRIF	08:00:00	08:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	800	1	NORTH	VYF/S754293	08:05:00	08:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	800	1	NORTH	VYF/S754307	08:15:00	08:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	800	1	NORTH	VYF/S754331	08:25:00	08:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	800	2	NORTH	VYF/S754307	08:35:00	08:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	800	2	NORTH	VYF/S754293	08:45:00	08:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	800	2	NORTH	VANDYKSDRIF	08:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	900	1	NORTH	VANDYKSDRIF		09:00:00				VANDYKSDRIF	09:00:00	09:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	900	1	NORTH	VYF/S754293	09:05:00	09:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	900	1	NORTH	VYF/S754307	09:15:00	09:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	900	1	NORTH	VYF/S754331	09:25:00	09:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	900	2	NORTH	VYF/S754307	09:35:00	09:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	900	2	NORTH	VYF/S754293	09:45:00	09:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	900	2	NORTH	VANDYKSDRIF	09:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1000	1	NORTH	VANDYKSDRIF		10:00:00				VANDYKSDRIF	10:00:00	10:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	1000	1	NORTH	VYF/S754293	10:05:00	10:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1000	1	NORTH	VYF/S754307	10:15:00	10:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1000	1	NORTH	VYF/S754331	10:25:00	10:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1000	2	NORTH	VYF/S754307	10:35:00	10:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1000	2	NORTH	VYF/S754293	10:45:00	10:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1000	2	NORTH	VANDYKSDRIF	10:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1100	1	NORTH	VANDYKSDRIF		11:00:00				VANDYKSDRIF	11:00:00	11:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	1100	1	NORTH	VYF/S754293	11:05:00	11:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1100	1	NORTH	VYF/S754307	11:15:00	11:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1100	1	NORTH	VYF/S754331	11:25:00	11:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1100	2	NORTH	VYF/S754307	11:35:00	11:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1100	2	NORTH	VYF/S754293	11:45:00	11:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1100	2	NORTH	VANDYKSDRIF	11:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1200	1	NORTH	VANDYKSDRIF		12:00:00				VANDYKSDRIF	12:00:00	12:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	1200	1	NORTH	VYF/S754293	12:05:00	12:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1200	1	NORTH	VYF/S754307	12:15:00	12:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1200	1	NORTH	VYF/S754331	12:25:00	12:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1200	2	NORTH	VYF/S754307	12:35:00	12:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1200	2	NORTH	VYF/S754293	12:45:00	12:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1200	2	NORTH	VANDYKSDRIF	12:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1300	1	NORTH	VANDYKSDRIF		13:00:00				VANDYKSDRIF	13:00:00	13:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	1300	1	NORTH	VYF/S754293	13:05:00	13:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1300	1	NORTH	VYF/S754307	13:15:00	13:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1300	1	NORTH	VYF/S754331	13:25:00	13:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1300	2	NORTH	VYF/S754307	13:35:00	13:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1300	2	NORTH	VYF/S754293	13:45:00	13:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1300	2	NORTH	VANDYKSDRIF	13:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1400	1	NORTH	VANDYKSDRIF		14:00:00				VANDYKSDRIF	14:00:00	14:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	1400	1	NORTH	VYF/S754293	14:05:00	14:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1400	1	NORTH	VYF/S754307	14:15:00	14:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1400	1	NORTH	VYF/S754331	14:25:00	14:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1400	2	NORTH	VYF/S754307	14:35:00	14:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1400	2	NORTH	VYF/S754293	14:45:00	14:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1400	2	NORTH	VANDYKSDRIF	14:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1500	1	NORTH	VANDYKSDRIF		15:00:00				VANDYKSDRIF	15:00:00	15:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	1500	1	NORTH	VYF/S754293	15:05:00	15:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1500	1	NORTH	VYF/S754307	15:15:00	15:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1500	1	NORTH	VYF/S754331	15:25:00	15:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1500	2	NORTH	VYF/S754307	15:35:00	15:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1500	2	NORTH	VYF/S754293	15:45:00	15:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1500	2	NORTH	VANDYKSDRIF	15:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1600	1	NORTH	VANDYKSDRIF		16:00:00				VANDYKSDRIF	16:00:00	16:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	1600	1	NORTH	VYF/S754293	16:05:00	16:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1600	1	NORTH	VYF/S754307	16:15:00	16:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1600	1	NORTH	VYF/S754331	16:25:00	16:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1600	2	NORTH	VYF/S754307	16:35:00	16:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1600	2	NORTH	VYF/S754293	16:45:00	16:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1600	2	NORTH	VANDYKSDRIF	16:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1700	1	NORTH	VANDYKSDRIF		17:00:00				VANDYKSDRIF	17:00:00	17:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	1700	1	NORTH	VYF/S754293	17:05:00	17:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1700	1	NORTH	VYF/S754307	17:15:00	17:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1700	1	NORTH	VYF/S754331	17:25:00	17:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1700	2	NORTH	VYF/S754307	17:35:00	17:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1700	2	NORTH	VYF/S754293	17:45:00	17:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1700	2	NORTH	VANDYKSDRIF	17:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1800	1	NORTH	VANDYKSDRIF		18:00:00				VANDYKSDRIF	18:00:00	18:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	1800	1	NORTH	VYF/S754293	18:05:00	18:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1800	1	NORTH	VYF/S754307	18:15:00	18:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1800	1	NORTH	VYF/S754331	18:25:00	18:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1800	2	NORTH	VYF/S754307	18:35:00	18:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1800	2	NORTH	VYF/S754293	18:45:00	18:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1800	2	NORTH	VANDYKSDRIF	18:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1900	1	NORTH	VANDYKSDRIF		19:00:00				VANDYKSDRIF	19:00:00	19:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	1900	1	NORTH	VYF/S754293	19:05:00	19:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	1900	1	NORTH	VYF/S754307	19:15:00	19:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1900	1	NORTH	VYF/S754331	19:25:00	19:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1900	2	NORTH	VYF/S754307	19:35:00	19:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1900	2	NORTH	VYF/S754293	19:45:00	19:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	1900	2	NORTH	VANDYKSDRIF	19:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	2000	1	NORTH	VANDYKSDRIF		20:00:00				VANDYKSDRIF	20:00:00	20:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	2000	1	NORTH	VYF/S754293	20:05:00	20:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	2000	1	NORTH	VYF/S754307	20:15:00	20:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2000	1	NORTH	VYF/S754331	20:25:00	20:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2000	2	NORTH	VYF/S754307	20:35:00	20:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2000	2	NORTH	VYF/S754293	20:45:00	20:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2000	2	NORTH	VANDYKSDRIF	20:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	2100	1	NORTH	VANDYKSDRIF		21:00:00				VANDYKSDRIF	21:00:00	21:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	2100	1	NORTH	VYF/S754293	21:05:00	21:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	2100	1	NORTH	VYF/S754307	21:15:00	21:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2100	1	NORTH	VYF/S754331	21:25:00	21:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2100	2	NORTH	VYF/S754307	21:35:00	21:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2100	2	NORTH	VYF/S754293	21:45:00	21:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2100	2	NORTH	VANDYKSDRIF	21:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	2200	1	NORTH	VANDYKSDRIF		22:00:00				VANDYKSDRIF	22:00:00	22:55:00	3	YCYYCCY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	2200	1	NORTH	VYF/S754293	22:05:00	22:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	2200	1	NORTH	VYF/S754307	22:15:00	22:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2200	1	NORTH	VYF/S754331	22:25:00	22:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2200	2	NORTH	VYF/S754307	22:35:00	22:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2200	2	NORTH	VYF/S754293	22:45:00	22:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2200	2	NORTH	VANDYKSDRIF	22:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	2300	1	NORTH	VANDYKSDRIF		23:00:00				VANDYKSDRIF	23:00:00	23:55:00	3	YYYYYYY	VACUUM TRAINS/SHUNT CAR	00:55:00	0	
VANDYKSDRIF	2300	1	NORTH	VYF/S754293	23:05:00	23:10:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	2300	1	NORTH	VYF/S754307	23:15:00	23:20:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2300	1	NORTH	VYF/S754331	23:25:00	23:30:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2300	2	NORTH	VYF/S754307	23:35:00	23:40:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2300	2	NORTH	VYF/S754293	23:45:00	23:50:00	00:05:00	00:05:00	RANGEER	VANDYKSDRIF						00:55:00	0	0.97
VANDYKSDRIF	2300	2	NORTH	VANDYKSDRIF	23:55:00	00:00:00	00:05:00			VANDYKSDRIF						00:55:00	0	0.1
VANDYKSDRIF	2073	1	NORTH	VANDYKSDRIF		06:00:00				BLINKPAN	06:00:00	06:17:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:17:00	0	
VANDYKSDRIF	2073	1	NORTH	BLINKPAN	06:17:00	00:00:00	00:17:00			BLINKPAN						00:17:00	0	10.3
VANDYKSDRIF	2075	1	NORTH	VANDYKSDRIF		12:00:00				BLINKPAN	12:00:00	12:17:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:17:00	0	
VANDYKSDRIF	2075	1	NORTH	BLINKPAN	12:17:00	00:00:00	00:17:00			BLINKPAN						00:17:00	0	10.3
VANDYKSDRIF	2077	1	NORTH	VANDYKSDRIF		18:00:00				BLINKPAN	18:00:00	18:17:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:17:00	0	
VANDYKSDRIF	2077	1	NORTH	BLINKPAN	18:17:00	00:00:00	00:17:00			BLINKPAN						00:17:00	0	10.3
VANDYKSDRIF	2079	1	NORTH	VANDYKSDRIF		00:01:00				BLINKPAN	00:01:00	00:18:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:17:00	0	
VANDYKSDRIF	2079	1	NORTH	BLINKPAN	00:18:00	00:00:00	00:17:00			BLINKPAN						00:17:00	0	10.3
VANDYKSDRIF	2081	1	NORTH	VANDYKSDRIF		06:00:00				BROODSNYERSPL	06:00:00	06:32:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:32:00	0	
VANDYKSDRIF	2081	1	NORTH	BLINKPAN	06:17:00	06:17:00	00:17:00			BROODSNYERSPL						00:32:00	0	10.3
VANDYKSDRIF	2081	2	NORTH	BROODSNYERSPL	06:32:00	00:00:00	00:15:00			BROODSNYERSPL						00:32:00	0	8.76
VANDYKSDRIF	2083	1	NORTH	VANDYKSDRIF		12:00:00				BROODSNYERSPL	12:00:00	12:32:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:32:00	0	
VANDYKSDRIF	2083	1	NORTH	BLINKPAN	12:17:00	12:17:00	00:17:00			BROODSNYERSPL						00:32:00	0	10.3
VANDYKSDRIF	2083	2	NORTH	BROODSNYERSPL	12:32:00	00:00:00	00:15:00			BROODSNYERSPL						00:32:00	0	8.76
VANDYKSDRIF	2085	1	NORTH	VANDYKSDRIF		18:00:00				BROODSNYERSPL	18:00:00	18:32:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:32:00	0	
VANDYKSDRIF	2085	1	NORTH	BLINKPAN	18:17:00	18:17:00	00:17:00			BROODSNYERSPL						00:32:00	0	10.3
VANDYKSDRIF	2085	2	NORTH	BROODSNYERSPL	18:32:00	00:00:00	00:15:00			BROODSNYERSPL						00:32:00	0	8.76
VANDYKSDRIF	2087	1	NORTH	VANDYKSDRIF		00:01:00				BROODSNYERSPL	00:01:00	00:33:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:32:00	0	
VANDYKSDRIF	2087	1	NORTH	BLINKPAN	00:18:00	00:18:00	00:17:00			BROODSNYERSPL						00:32:00	0	10.3
VANDYKSDRIF	2087	2	NORTH	BROODSNYERSPL	00:33:00	00:00:00	00:15:00			BROODSNYERSPL						00:32:00	0	8.76
VANDYKSDRIF	2089	1	NORTH	VANDYKSDRIF		06:00:00				BSX-PULLENSHO	06:00:00	06:57:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:57:00	0	
VANDYKSDRIF	2089	1	NORTH	BLINKPAN	06:17:00	06:17:00	00:17:00			BSX-PULLENSHO						00:57:00	0	10.3
VANDYKSDRIF	2089	2	NORTH	BROODSNYERSPL	06:32:00	06:32:00	00:15:00			BSX-PULLENSHO						00:57:00	0	8.76
VANDYKSDRIF	2089	3	NORTH	GELUKSPLAAS	06:45:00	06:45:00	00:13:00			BSX-PULLENSHO						00:57:00	0	2.1
VANDYKSDRIF	2089	4	NORTH	BSX-PULLENSHO	06:57:00	00:00:00	00:12:00			BSX-PULLENSHO						00:57:00	0	9.07
VANDYKSDRIF	2091	1	NORTH	VANDYKSDRIF		12:00:00				BSX-PULLENSHO	12:00:00	12:57:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:57:00	0	
VANDYKSDRIF	2091	1	NORTH	BLINKPAN	12:17:00	12:17:00	00:17:00			BSX-PULLENSHO						00:57:00	0	10.3
VANDYKSDRIF	2091	2	NORTH	BROODSNYERSPL	12:32:00	12:32:00	00:15:00			BSX-PULLENSHO						00:57:00	0	8.76
VANDYKSDRIF	2091	3	NORTH	GELUKSPLAAS	12:45:00	12:45:00	00:13:00			BSX-PULLENSHO						00:57:00	0	2.1
VANDYKSDRIF	2091	4	NORTH	BSX-PULLENSHO	12:57:00	00:00:00	00:12:00			BSX-PULLENSHO						00:57:00	0	9.07
VANDYKSDRIF	2093	1	NORTH	VANDYKSDRIF		18:00:00				BSX-PULLENSHO	18:00:00	18:57:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:57:00	0	
VANDYKSDRIF	2093	1	NORTH	BLINKPAN	18:17:00	18:17:00	00:17:00			BSX-PULLENSHO						00:57:00	0	10.3
VANDYKSDRIF	2093	2	NORTH	BROODSNYERSPL	18:32:00	18:32:00	00:15:00			BSX-PULLENSHO						00:57:00	0	8.76
VANDYKSDRIF	2093	3	NORTH	GELUKSPLAAS	18:45:00	18:45:00	00:13:00			BSX-PULLENSHO						00:57:00	0	2.1
VANDYKSDRIF	2093	4	NORTH	BSX-PULLENSHO	18:57:00	00:00:00	00:12:00			BSX-PULLENSHO						00:57:00	0	9.07
VANDYKSDRIF	2095	1	NORTH	VANDYKSDRIF		00:01:00				BSX-PULLENSHO	00:01:00	00:58:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:57:00	0	
VANDYKSDRIF	2095	1	NORTH	BLINKPAN	00:18:00	00:18:00	00:17:00			BSX-PULLENSHO						00:57:00	0	10.3
VANDYKSDRIF	2095	2	NORTH	BROODSNYERSPL	00:33:00	00:33:00	00:15:00			BSX-PULLENSHO						00:57:00	0	8.76
VANDYKSDRIF	2095	3	NORTH	GELUKSPLAAS	00:46:00	00:46:00	00:13:00			BSX-PULLENSHO						00:57:00	0	2.1
VANDYKSDRIF	2095	4	NORTH	BSX-PULLENSHO	00:58:00	00:00:00	00:12:00			BSX-PULLENSHO						00:57:00	0	9.07
VANDYKSDRIF	2097	1	NORTH	VANDYKSDRIF		00:01:00				PSH/S741051	00:01:00	01:00:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:59:00	0	
VANDYKSDRIF	2097	1	NORTH	BLINKPAN	00:18:00	00:18:00	00:17:00			PSH/S741051						00:59:00	0	10.3
VANDYKSDRIF	2097	2	NORTH	BROODSNYERSPL	00:33:00	00:33:00	00:15:00			PSH/S741051						00:59:00	0	8.76
VANDYKSDRIF	2097	3	NORTH	GELUKSPLAAS	00:46:00	00:46:00	00:13:00			PSH/S741051						00:59:00	0	2.1
VANDYKSDRIF	2097	4	NORTH	BSX-PULLENSHO	00:58:00	00:59:00	00:12:00	00:01:00	RANGEER	PSH/S741051						00:59:00	0	9.07
VANDYKSDRIF	2097	5	NORTH	PSH/S741051	01:00:00	00:00:00	00:01:00			PSH/S741051						00:59:00	0	0.97
VANDYKSDRIF	2099	1	NORTH	VANDYKSDRIF		06:00:00				PSH/S741051	06:00:00	06:59:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:59:00	0	
VANDYKSDRIF	2099	1	NORTH	BLINKPAN	06:17:00	06:17:00	00:17:00			PSH/S741051						00:59:00	0	10.3
VANDYKSDRIF	2099	2	NORTH	BROODSNYERSPL	06:32:00	06:32:00	00:15:00			PSH/S741051						00:59:00	0	8.76
VANDYKSDRIF	2099	3	NORTH	GELUKSPLAAS	06:45:00	06:45:00	00:13:00			PSH/S741051						00:59:00	0	2.1
VANDYKSDRIF	2099	4	NORTH	BSX-PULLENSHO	06:57:00	06:58:00	00:12:00	00:01:00	RANGEER	PSH/S741051						00:59:00	0	9.07
VANDYKSDRIF	2099	5	NORTH	PSH/S741051	06:59:00	00:00:00	00:01:00			PSH/S741051						00:59:00	0	0.97
VANDYKSDRIF	2101	1	NORTH	VANDYKSDRIF		12:00:00				PSH/S741051	12:00:00	12:59:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:59:00	0	
VANDYKSDRIF	2101	1	NORTH	BLINKPAN	12:17:00	12:17:00	00:17:00			PSH/S741051						00:59:00	0	10.3
VANDYKSDRIF	2101	2	NORTH	BROODSNYERSPL	12:32:00	12:32:00	00:15:00			PSH/S741051						00:59:00	0	8.76
VANDYKSDRIF	2101	3	NORTH	GELUKSPLAAS	12:45:00	12:45:00	00:13:00			PSH/S741051						00:59:00	0	2.1
VANDYKSDRIF	2101	4	NORTH	BSX-PULLENSHO	12:57:00	12:58:00	00:12:00	00:01:00	RANGEER	PSH/S741051						00:59:00	0	9.07
VANDYKSDRIF	2101	5	NORTH	PSH/S741051	12:59:00	00:00:00	00:01:00			PSH/S741051						00:59:00	0	0.97
VANDYKSDRIF	2103	1	NORTH	VANDYKSDRIF		18:00:00				PSH/S741051	18:00:00	18:59:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:59:00	0	
VANDYKSDRIF	2103	1	NORTH	BLINKPAN	18:17:00	18:17:00	00:17:00			PSH/S741051						00:59:00	0	10.3
VANDYKSDRIF	2103	2	NORTH	BROODSNYERSPL	18:32:00	18:32:00	00:15:00			PSH/S741051						00:59:00	0	8.76
VANDYKSDRIF	2103	3	NORTH	GELUKSPLAAS	18:45:00	18:45:00	00:13:00			PSH/S741051						00:59:00	0	2.1
VANDYKSDRIF	2103	4	NORTH	BSX-PULLENSHO	18:57:00	18:58:00	00:12:00	00:01:00	RANGEER	PSH/S741051						00:59:00	0	9.07
VANDYKSDRIF	2103	5	NORTH	PSH/S741051	18:59:00	00:00:00	00:01:00			PSH/S741051						00:59:00	0	0.97
VANDYKSDRIF	2105	1	NORTH	VANDYKSDRIF		03:00:00				BSX/S751472	03:00:00	03:33:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:33:00	0	
VANDYKSDRIF	2105	1	NORTH	BLINKPAN	03:17:00	03:17:00	00:17:00			BSX/S751472						00:33:00	0	10.3
VANDYKSDRIF	2105	2	NORTH	BROODSNYERSPL	03:32:00	03:32:00	00:15:00			BSX/S751472						00:33:00	0	8.76
VANDYKSDRIF	2105	3	NORTH	BSX/S751472	03:33:00	00:00:00	00:01:00			BSX/S751472						00:33:00	0	0.1
VANDYKSDRIF	2106	1	NORTH	VANDYKSDRIF		06:00:00				BZR/S751553	06:00:00	06:12:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:12:00	0	
VANDYKSDRIF	2106	1	NORTH	SRW-BEZUIDENHOUTS	06:11:00	06:11:00	00:11:00			BZR/S751553						00:12:00	0	9.07
VANDYKSDRIF	2106	2	NORTH	BZR/S751553	06:12:00	00:00:00	00:01:00			BZR/S751553						00:12:00	0	0.97
VANDYKSDRIF	2107	1	NORTH	VANDYKSDRIF		09:00:00				BSX/S751472	09:00:00	09:33:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:33:00	0	
VANDYKSDRIF	2107	1	NORTH	BLINKPAN	09:17:00	09:17:00	00:17:00			BSX/S751472						00:33:00	0	10.3
VANDYKSDRIF	2107	2	NORTH	BROODSNYERSPL	09:32:00	09:32:00	00:15:00			BSX/S751472						00:33:00	0	8.76
VANDYKSDRIF	2107	3	NORTH	BSX/S751472	09:33:00	00:00:00	00:01:00			BSX/S751472						00:33:00	0	0.1
VANDYKSDRIF	2108	1	NORTH	VANDYKSDRIF		12:00:00				BZR/S751553	12:00:00	12:12:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:12:00	0	
VANDYKSDRIF	2108	1	NORTH	SRW-BEZUIDENHOUTS	12:11:00	12:11:00	00:11:00			BZR/S751553						00:12:00	0	9.07
VANDYKSDRIF	2108	2	NORTH	BZR/S751553	12:12:00	00:00:00	00:01:00			BZR/S751553						00:12:00	0	0.97
VANDYKSDRIF	2110	1	NORTH	VANDYKSDRIF		18:00:00				BZR/S751553	18:00:00	18:12:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:12:00	0	
VANDYKSDRIF	2110	1	NORTH	SRW-BEZUIDENHOUTS	18:11:00	18:11:00	00:11:00			BZR/S751553						00:12:00	0	9.07
VANDYKSDRIF	2110	2	NORTH	BZR/S751553	18:12:00	00:00:00	00:01:00			BZR/S751553						00:12:00	0	0.97
VANDYKSDRIF	2111	1	NORTH	VANDYKSDRIF		22:00:00				BSX/S751472	22:00:00	22:33:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:33:00	0	
VANDYKSDRIF	2111	1	NORTH	BLINKPAN	22:17:00	22:17:00	00:17:00			BSX/S751472						00:33:00	0	10.3
VANDYKSDRIF	2111	2	NORTH	BROODSNYERSPL	22:32:00	22:32:00	00:15:00			BSX/S751472						00:33:00	0	8.76
VANDYKSDRIF	2111	3	NORTH	BSX/S751472	22:33:00	00:00:00	00:01:00			BSX/S751472						00:33:00	0	0.1
VANDYKSDRIF	2112	1	NORTH	VANDYKSDRIF		00:01:00				BZR/S751553	00:01:00	00:13:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:12:00	0	
VANDYKSDRIF	2112	1	NORTH	SRW-BEZUIDENHOUTS	00:12:00	00:12:00	00:11:00			BZR/S751553						00:12:00	0	9.07
VANDYKSDRIF	2112	2	NORTH	BZR/S751553	00:13:00	00:00:00	00:01:00			BZR/S751553						00:12:00	0	0.97
VANDYKSDRIF	2113	1	NORTH	VANDYKSDRIF		03:00:00				BSX/S751405	03:00:00	03:33:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:33:00	0	
VANDYKSDRIF	2113	1	NORTH	BLINKPAN	03:17:00	03:17:00	00:17:00			BSX/S751405						00:33:00	0	10.3
VANDYKSDRIF	2113	2	NORTH	BROODSNYERSPL	03:32:00	03:32:00	00:15:00			BSX/S751405						00:33:00	0	8.76
VANDYKSDRIF	2113	3	NORTH	BSX/S751405	03:33:00	00:00:00	00:01:00			BSX/S751405						00:33:00	0	0.97
VANDYKSDRIF	2114	1	NORTH	VANDYKSDRIF		06:00:00				SAAIWATER	06:00:00	06:28:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:28:00	0	
VANDYKSDRIF	2114	1	NORTH	SRW-BEZUIDENHOUTS	06:11:00	06:11:00	00:11:00			SAAIWATER						00:28:00	0	9.07
VANDYKSDRIF	2114	2	NORTH	KROMKLIP	06:21:00	06:21:00	00:10:00			SAAIWATER						00:28:00	0	7.59
VANDYKSDRIF	2114	3	NORTH	SAAIWATER	06:28:00	00:00:00	00:07:00			SAAIWATER						00:28:00	0	5.83
VANDYKSDRIF	2115	1	NORTH	VANDYKSDRIF		09:00:00				BSX/S751405	09:00:00	09:33:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:33:00	0	
VANDYKSDRIF	2115	1	NORTH	BLINKPAN	09:17:00	09:17:00	00:17:00			BSX/S751405						00:33:00	0	10.3
VANDYKSDRIF	2115	2	NORTH	BROODSNYERSPL	09:32:00	09:32:00	00:15:00			BSX/S751405						00:33:00	0	8.76
VANDYKSDRIF	2115	3	NORTH	BSX/S751405	09:33:00	00:00:00	00:01:00			BSX/S751405						00:33:00	0	0.97
VANDYKSDRIF	2116	1	NORTH	VANDYKSDRIF		12:00:00				SAAIWATER	12:00:00	12:28:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:28:00	0	
VANDYKSDRIF	2116	1	NORTH	SRW-BEZUIDENHOUTS	12:11:00	12:11:00	00:11:00			SAAIWATER						00:28:00	0	9.07
VANDYKSDRIF	2116	2	NORTH	KROMKLIP	12:21:00	12:21:00	00:10:00			SAAIWATER						00:28:00	0	7.59
VANDYKSDRIF	2116	3	NORTH	SAAIWATER	12:28:00	00:00:00	00:07:00			SAAIWATER						00:28:00	0	5.83
VANDYKSDRIF	2117	1	NORTH	VANDYKSDRIF		15:00:00				BSX/S751405	15:00:00	15:33:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:33:00	0	
VANDYKSDRIF	2117	1	NORTH	BLINKPAN	15:17:00	15:17:00	00:17:00			BSX/S751405						00:33:00	0	10.3
VANDYKSDRIF	2117	2	NORTH	BROODSNYERSPL	15:32:00	15:32:00	00:15:00			BSX/S751405						00:33:00	0	8.76
VANDYKSDRIF	2117	3	NORTH	BSX/S751405	15:33:00	00:00:00	00:01:00			BSX/S751405						00:33:00	0	0.97
VANDYKSDRIF	2118	1	NORTH	VANDYKSDRIF		18:00:00				SAAIWATER	18:00:00	18:28:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:28:00	0	
VANDYKSDRIF	2118	1	NORTH	SRW-BEZUIDENHOUTS	18:11:00	18:11:00	00:11:00			SAAIWATER						00:28:00	0	9.07
VANDYKSDRIF	2118	2	NORTH	KROMKLIP	18:21:00	18:21:00	00:10:00			SAAIWATER						00:28:00	0	7.59
VANDYKSDRIF	2118	3	NORTH	SAAIWATER	18:28:00	00:00:00	00:07:00			SAAIWATER						00:28:00	0	5.83
VANDYKSDRIF	2119	1	NORTH	VANDYKSDRIF		21:00:00				BSX/S751405	21:00:00	21:33:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:33:00	0	
VANDYKSDRIF	2119	1	NORTH	BLINKPAN	21:17:00	21:17:00	00:17:00			BSX/S751405						00:33:00	0	10.3
VANDYKSDRIF	2119	2	NORTH	BROODSNYERSPL	21:32:00	21:32:00	00:15:00			BSX/S751405						00:33:00	0	8.76
VANDYKSDRIF	2119	3	NORTH	BSX/S751405	21:33:00	00:00:00	00:01:00			BSX/S751405						00:33:00	0	0.97
VANDYKSDRIF	2120	1	NORTH	VANDYKSDRIF		00:01:00				SAAIWATER	00:01:00	00:29:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:28:00	0	
VANDYKSDRIF	2120	1	NORTH	SRW-BEZUIDENHOUTS	00:12:00	00:12:00	00:11:00			SAAIWATER						00:28:00	0	9.07
VANDYKSDRIF	2120	2	NORTH	KROMKLIP	00:22:00	00:22:00	00:10:00			SAAIWATER						00:28:00	0	7.59
VANDYKSDRIF	2120	3	NORTH	SAAIWATER	00:29:00	00:00:00	00:07:00			SAAIWATER						00:28:00	0	5.83
VANDYKSDRIF	2148	1	NORTH	VANDYKSDRIF		11:00:00				OGIES	11:00:00	11:38:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	00:38:00	0	
VANDYKSDRIF	2148	1	NORTH	SRW-BEZUIDENHOUTS	11:11:00	11:11:00	00:11:00			OGIES						00:38:00	0	9.07
VANDYKSDRIF	2148	2	NORTH	KROMKLIP	11:21:00	11:21:00	00:10:00			OGIES						00:38:00	0	7.59
VANDYKSDRIF	2148	3	NORTH	SAAIWATER	11:28:00	11:28:00	00:07:00			OGIES						00:38:00	0	5.83
VANDYKSDRIF	2148	4	NORTH	OGIES	11:38:00	00:00:00	00:10:00			OGIES						00:38:00	0	11.98
VANDYKSDRIF	2213	1	NORTH	VANDYKSDRIF		15:00:00				BSX/S751472	15:00:00	15:33:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	00:33:00	0	
VANDYKSDRIF	2213	1	NORTH	BLINKPAN	15:17:00	15:17:00	00:17:00			BSX/S751472						00:33:00	0	10.3
VANDYKSDRIF	2213	2	NORTH	BROODSNYERSPL	15:32:00	15:32:00	00:15:00			BSX/S751472						00:33:00	0	8.76
VANDYKSDRIF	2213	3	NORTH	BSX/S751472	15:33:00	00:00:00	00:01:00			BSX/S751472						00:33:00	0	0.1
VANDYKSDRIF	8915	1	NORTH	VANDYKSDRIF		15:00:00				BSX/S751405	15:00:00	15:33:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:33:00	0	
VANDYKSDRIF	8915	1	NORTH	BLINKPAN	15:17:00	15:17:00	00:17:00			BSX/S751405						00:33:00	0	10.3
VANDYKSDRIF	8915	2	NORTH	BROODSNYERSPL	15:32:00	15:32:00	00:15:00			BSX/S751405						00:33:00	0	8.76
VANDYKSDRIF	8915	3	NORTH	BSX/S751405	15:33:00	00:00:00	00:01:00			BSX/S751405						00:33:00	0	0.97
VANDYKSDRIF	8919	1	NORTH	VANDYKSDRIF		15:00:00				BSX/S751472	15:00:00	15:33:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:33:00	0	
VANDYKSDRIF	8919	1	NORTH	BLINKPAN	15:17:00	15:17:00	00:17:00			BSX/S751472						00:33:00	0	10.3
VANDYKSDRIF	8919	2	NORTH	BROODSNYERSPL	15:32:00	15:32:00	00:15:00			BSX/S751472						00:33:00	0	8.76
VANDYKSDRIF	8919	3	NORTH	BSX/S751472	15:33:00	00:00:00	00:01:00			BSX/S751472						00:33:00	0	0.1
VANDYKSDRIF	2122	1	NORTH	VANDYKSDRIF		06:00:00				MNR/S752622	06:00:00	07:05:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:05:00	0	
VANDYKSDRIF	2122	1	NORTH	SRW-BEZUIDENHOUTS	06:11:00	06:11:00	00:11:00			MNR/S752622						01:05:00	0	9.07
VANDYKSDRIF	2122	2	NORTH	KROMKLIP	06:21:00	06:21:00	00:10:00			MNR/S752622						01:05:00	0	7.59
VANDYKSDRIF	2122	3	NORTH	SAAIWATER	06:28:00	06:28:00	00:07:00			MNR/S752622						01:05:00	0	5.83
VANDYKSDRIF	2122	4	NORTH	OGIES	06:45:00	06:45:00	00:17:00			MNR/S752622						01:05:00	0	11.98
VANDYKSDRIF	2122	5	NORTH	MINNAAR	06:54:00	06:54:00	00:09:00			MNR/S752622						01:05:00	0	6.86
VANDYKSDRIF	2122	6	NORTH	MNR/S752622	07:05:00	00:00:00	00:11:00			MNR/S752622						01:05:00	0	3.81
VANDYKSDRIF	2124	1	NORTH	VANDYKSDRIF		12:00:00				MNR/S752622	12:00:00	13:05:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:05:00	0	
VANDYKSDRIF	2124	1	NORTH	SRW-BEZUIDENHOUTS	12:11:00	12:11:00	00:11:00			MNR/S752622						01:05:00	0	9.07
VANDYKSDRIF	2124	2	NORTH	KROMKLIP	12:21:00	12:21:00	00:10:00			MNR/S752622						01:05:00	0	7.59
VANDYKSDRIF	2124	3	NORTH	SAAIWATER	12:28:00	12:28:00	00:07:00			MNR/S752622						01:05:00	0	5.83
VANDYKSDRIF	2124	4	NORTH	OGIES	12:45:00	12:45:00	00:17:00			MNR/S752622						01:05:00	0	11.98
VANDYKSDRIF	2124	5	NORTH	MINNAAR	12:54:00	12:54:00	00:09:00			MNR/S752622						01:05:00	0	6.86
VANDYKSDRIF	2124	6	NORTH	MNR/S752622	13:05:00	00:00:00	00:11:00			MNR/S752622						01:05:00	0	3.81
VANDYKSDRIF	2126	1	NORTH	VANDYKSDRIF		18:00:00				MNR/S752622	18:00:00	19:05:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:05:00	0	
VANDYKSDRIF	2126	1	NORTH	SRW-BEZUIDENHOUTS	18:11:00	18:11:00	00:11:00			MNR/S752622						01:05:00	0	9.07
VANDYKSDRIF	2126	2	NORTH	KROMKLIP	18:21:00	18:21:00	00:10:00			MNR/S752622						01:05:00	0	7.59
VANDYKSDRIF	2126	3	NORTH	SAAIWATER	18:28:00	18:28:00	00:07:00			MNR/S752622						01:05:00	0	5.83
VANDYKSDRIF	2126	4	NORTH	OGIES	18:45:00	18:45:00	00:17:00			MNR/S752622						01:05:00	0	11.98
VANDYKSDRIF	2126	5	NORTH	MINNAAR	18:54:00	18:54:00	00:09:00			MNR/S752622						01:05:00	0	6.86
VANDYKSDRIF	2126	6	NORTH	MNR/S752622	19:05:00	00:00:00	00:11:00			MNR/S752622						01:05:00	0	3.81
VANDYKSDRIF	2128	1	NORTH	VANDYKSDRIF		00:01:00				MNR/S752622	00:01:00	01:06:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:05:00	0	
VANDYKSDRIF	2128	1	NORTH	SRW-BEZUIDENHOUTS	00:12:00	00:12:00	00:11:00			MNR/S752622						01:05:00	0	9.07
VANDYKSDRIF	2128	2	NORTH	KROMKLIP	00:22:00	00:22:00	00:10:00			MNR/S752622						01:05:00	0	7.59
VANDYKSDRIF	2128	3	NORTH	SAAIWATER	00:29:00	00:29:00	00:07:00			MNR/S752622						01:05:00	0	5.83
VANDYKSDRIF	2128	4	NORTH	OGIES	00:46:00	00:46:00	00:17:00			MNR/S752622						01:05:00	0	11.98
VANDYKSDRIF	2128	5	NORTH	MINNAAR	00:55:00	00:55:00	00:09:00			MNR/S752622						01:05:00	0	6.86
VANDYKSDRIF	2128	6	NORTH	MNR/S752622	01:06:00	00:00:00	00:11:00			MNR/S752622						01:05:00	0	3.81
VANDYKSDRIF	2130	1	NORTH	VANDYKSDRIF		06:00:00				BJL/S750735	06:00:00	07:15:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:15:00	0	
VANDYKSDRIF	2130	1	NORTH	SRW-BEZUIDENHOUTS	06:11:00	06:11:00	00:11:00			BJL/S750735						01:15:00	0	9.07
VANDYKSDRIF	2130	2	NORTH	KROMKLIP	06:21:00	06:21:00	00:10:00			BJL/S750735						01:15:00	0	7.59
VANDYKSDRIF	2130	3	NORTH	SAAIWATER	06:28:00	06:28:00	00:07:00			BJL/S750735						01:15:00	0	5.83
VANDYKSDRIF	2130	4	NORTH	OGIES	06:45:00	06:45:00	00:17:00			BJL/S750735						01:15:00	0	11.98
VANDYKSDRIF	2130	5	NORTH	MINNAAR	06:54:00	06:54:00	00:09:00			BJL/S750735						01:15:00	0	6.86
VANDYKSDRIF	2130	6	NORTH	BLACKHILL	07:04:00	07:05:00	00:10:00	00:01:00	SHUNT	BJL/S750735						01:15:00	0	8.82
VANDYKSDRIF	2130	7	NORTH	BJL/S750735	07:15:00	00:00:00	00:10:00			BJL/S750735						01:15:00	0	0.96
VANDYKSDRIF	2132	1	NORTH	VANDYKSDRIF		12:00:00				BJL/S750735	12:00:00	13:15:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:15:00	0	
VANDYKSDRIF	2132	1	NORTH	SRW-BEZUIDENHOUTS	12:11:00	12:11:00	00:11:00			BJL/S750735						01:15:00	0	9.07
VANDYKSDRIF	2132	2	NORTH	KROMKLIP	12:21:00	12:21:00	00:10:00			BJL/S750735						01:15:00	0	7.59
VANDYKSDRIF	2132	3	NORTH	SAAIWATER	12:28:00	12:28:00	00:07:00			BJL/S750735						01:15:00	0	5.83
VANDYKSDRIF	2132	4	NORTH	OGIES	12:45:00	12:45:00	00:17:00			BJL/S750735						01:15:00	0	11.98
VANDYKSDRIF	2132	5	NORTH	MINNAAR	12:54:00	12:54:00	00:09:00			BJL/S750735						01:15:00	0	6.86
VANDYKSDRIF	2132	6	NORTH	BLACKHILL	13:04:00	13:05:00	00:10:00	00:01:00	SHUNT	BJL/S750735						01:15:00	0	8.82
VANDYKSDRIF	2132	7	NORTH	BJL/S750735	13:15:00	00:00:00	00:10:00			BJL/S750735						01:15:00	0	0.96
VANDYKSDRIF	2134	1	NORTH	VANDYKSDRIF		18:00:00				BJL/S750735	18:00:00	19:15:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:15:00	0	
VANDYKSDRIF	2134	1	NORTH	SRW-BEZUIDENHOUTS	18:11:00	18:11:00	00:11:00			BJL/S750735						01:15:00	0	9.07
VANDYKSDRIF	2134	2	NORTH	KROMKLIP	18:21:00	18:21:00	00:10:00			BJL/S750735						01:15:00	0	7.59
VANDYKSDRIF	2134	3	NORTH	SAAIWATER	18:28:00	18:28:00	00:07:00			BJL/S750735						01:15:00	0	5.83
VANDYKSDRIF	2134	4	NORTH	OGIES	18:45:00	18:45:00	00:17:00			BJL/S750735						01:15:00	0	11.98
VANDYKSDRIF	2134	5	NORTH	MINNAAR	18:54:00	18:54:00	00:09:00			BJL/S750735						01:15:00	0	6.86
VANDYKSDRIF	2134	6	NORTH	BLACKHILL	19:04:00	19:05:00	00:10:00	00:01:00	SHUNT	BJL/S750735						01:15:00	0	8.82
VANDYKSDRIF	2134	7	NORTH	BJL/S750735	19:15:00	00:00:00	00:10:00			BJL/S750735						01:15:00	0	0.96
VANDYKSDRIF	2136	1	NORTH	VANDYKSDRIF		00:01:00				BJL/S750735	00:01:00	01:16:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	01:15:00	0	
VANDYKSDRIF	2136	1	NORTH	SRW-BEZUIDENHOUTS	00:12:00	00:12:00	00:11:00			BJL/S750735						01:15:00	0	9.07
VANDYKSDRIF	2136	2	NORTH	KROMKLIP	00:22:00	00:22:00	00:10:00			BJL/S750735						01:15:00	0	7.59
VANDYKSDRIF	2136	3	NORTH	SAAIWATER	00:29:00	00:29:00	00:07:00			BJL/S750735						01:15:00	0	5.83
VANDYKSDRIF	2136	4	NORTH	OGIES	00:46:00	00:46:00	00:17:00			BJL/S750735						01:15:00	0	11.98
VANDYKSDRIF	2136	5	NORTH	MINNAAR	00:55:00	00:55:00	00:09:00			BJL/S750735						01:15:00	0	6.86
VANDYKSDRIF	2136	6	NORTH	BLACKHILL	01:05:00	01:06:00	00:10:00	00:01:00	SHUNT	BJL/S750735						01:15:00	0	8.82
VANDYKSDRIF	2136	7	NORTH	BJL/S750735	01:16:00	00:00:00	00:10:00			BJL/S750735						01:15:00	0	0.96
VANDYKSDRIF	2138	1	NORTH	VANDYKSDRIF		06:00:00				BLACKHILL	06:00:00	07:04:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:04:00	0	
VANDYKSDRIF	2138	1	NORTH	SRW-BEZUIDENHOUTS	06:11:00	06:11:00	00:11:00			BLACKHILL						01:04:00	0	9.07
VANDYKSDRIF	2138	2	NORTH	KROMKLIP	06:21:00	06:21:00	00:10:00			BLACKHILL						01:04:00	0	7.59
VANDYKSDRIF	2138	3	NORTH	SAAIWATER	06:28:00	06:28:00	00:07:00			BLACKHILL						01:04:00	0	5.83
VANDYKSDRIF	2138	4	NORTH	OGIES	06:45:00	06:45:00	00:17:00			BLACKHILL						01:04:00	0	11.98
VANDYKSDRIF	2138	5	NORTH	MINNAAR	06:54:00	06:54:00	00:09:00			BLACKHILL						01:04:00	0	6.86
VANDYKSDRIF	2138	6	NORTH	BLACKHILL	07:04:00	00:00:00	00:10:00			BLACKHILL						01:04:00	0	8.82
VANDYKSDRIF	2140	1	NORTH	VANDYKSDRIF		12:00:00				BLACKHILL	12:00:00	13:04:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:04:00	0	
VANDYKSDRIF	2140	1	NORTH	SRW-BEZUIDENHOUTS	12:11:00	12:11:00	00:11:00			BLACKHILL						01:04:00	0	9.07
VANDYKSDRIF	2140	2	NORTH	KROMKLIP	12:21:00	12:21:00	00:10:00			BLACKHILL						01:04:00	0	7.59
VANDYKSDRIF	2140	3	NORTH	SAAIWATER	12:28:00	12:28:00	00:07:00			BLACKHILL						01:04:00	0	5.83
VANDYKSDRIF	2140	4	NORTH	OGIES	12:45:00	12:45:00	00:17:00			BLACKHILL						01:04:00	0	11.98
VANDYKSDRIF	2140	5	NORTH	MINNAAR	12:54:00	12:54:00	00:09:00			BLACKHILL						01:04:00	0	6.86
VANDYKSDRIF	2140	6	NORTH	BLACKHILL	13:04:00	00:00:00	00:10:00			BLACKHILL						01:04:00	0	8.82
VANDYKSDRIF	2142	1	NORTH	VANDYKSDRIF		18:00:00				BLACKHILL	18:00:00	19:04:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:04:00	0	
VANDYKSDRIF	2142	1	NORTH	SRW-BEZUIDENHOUTS	18:11:00	18:11:00	00:11:00			BLACKHILL						01:04:00	0	9.07
VANDYKSDRIF	2142	2	NORTH	KROMKLIP	18:21:00	18:21:00	00:10:00			BLACKHILL						01:04:00	0	7.59
VANDYKSDRIF	2142	3	NORTH	SAAIWATER	18:28:00	18:28:00	00:07:00			BLACKHILL						01:04:00	0	5.83
VANDYKSDRIF	2142	4	NORTH	OGIES	18:45:00	18:45:00	00:17:00			BLACKHILL						01:04:00	0	11.98
VANDYKSDRIF	2142	5	NORTH	MINNAAR	18:54:00	18:54:00	00:09:00			BLACKHILL						01:04:00	0	6.86
VANDYKSDRIF	2142	6	NORTH	BLACKHILL	19:04:00	00:00:00	00:10:00			BLACKHILL						01:04:00	0	8.82
VANDYKSDRIF	2144	1	NORTH	VANDYKSDRIF		00:01:00				BLACKHILL	00:01:00	01:05:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:04:00	0	
VANDYKSDRIF	2144	1	NORTH	SRW-BEZUIDENHOUTS	00:12:00	00:12:00	00:11:00			BLACKHILL						01:04:00	0	9.07
VANDYKSDRIF	2144	2	NORTH	KROMKLIP	00:22:00	00:22:00	00:10:00			BLACKHILL						01:04:00	0	7.59
VANDYKSDRIF	2144	3	NORTH	SAAIWATER	00:29:00	00:29:00	00:07:00			BLACKHILL						01:04:00	0	5.83
VANDYKSDRIF	2144	4	NORTH	OGIES	00:46:00	00:46:00	00:17:00			BLACKHILL						01:04:00	0	11.98
VANDYKSDRIF	2144	5	NORTH	MINNAAR	00:55:00	00:55:00	00:09:00			BLACKHILL						01:04:00	0	6.86
VANDYKSDRIF	2144	6	NORTH	BLACKHILL	01:05:00	00:00:00	00:10:00			BLACKHILL						01:04:00	0	8.82
VANDYKSDRIF	2251	1	NORTH	VANDYKSDRIF		06:00:00				RTI/S765198	06:00:00	07:36:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:36:00	0	
VANDYKSDRIF	2251	1	NORTH	BLINKPAN	06:18:00	06:18:00	00:18:00			RTI/S765198						01:36:00	0	10.3
VANDYKSDRIF	2251	2	NORTH	BROODSNYERSPL	06:32:00	06:32:00	00:14:00			RTI/S765198						01:36:00	0	8.76
VANDYKSDRIF	2251	3	NORTH	GELUKSPLAAS	06:45:00	06:45:00	00:13:00			RTI/S765198						01:36:00	0	2.1
VANDYKSDRIF	2251	4	NORTH	BSX-PULLENSHO	06:57:00	06:57:00	00:12:00			RTI/S765198						01:36:00	0	9.07
VANDYKSDRIF	2251	5	NORTH	BSX-RIETKUIL	07:26:00	07:31:00	00:29:00	00:05:00	SHUNT	RTI/S765198						01:36:00	0	28.28
VANDYKSDRIF	2251	6	NORTH	RTI/S765198	07:36:00	00:00:00	00:05:00			RTI/S765198						01:36:00	0	0.1
VANDYKSDRIF	2253	1	NORTH	VANDYKSDRIF		12:00:00				RTI/S765198	12:00:00	13:36:00	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:36:00	0	
VANDYKSDRIF	2253	1	NORTH	BLINKPAN	12:18:00	12:18:00	00:18:00			RTI/S765198						01:36:00	0	10.3
VANDYKSDRIF	2253	2	NORTH	BROODSNYERSPL	12:32:00	12:32:00	00:14:00			RTI/S765198						01:36:00	0	8.76
VANDYKSDRIF	2253	3	NORTH	GELUKSPLAAS	12:45:00	12:45:00	00:13:00			RTI/S765198						01:36:00	0	2.1
VANDYKSDRIF	2253	4	NORTH	BSX-PULLENSHO	12:57:00	12:57:00	00:12:00			RTI/S765198						01:36:00	0	9.07
VANDYKSDRIF	2253	5	NORTH	BSX-RIETKUIL	13:26:00	13:31:00	00:29:00	00:05:00	SHUNT	RTI/S765198						01:36:00	0	28.28
VANDYKSDRIF	2253	6	NORTH	RTI/S765198	13:36:00	00:00:00	00:05:00			RTI/S765198						01:36:00	0	0.1
VANDYKSDRIF	2255	1	NORTH	VANDYKSDRIF		18:00:00				RTI/S765198	18:00:00	19:31:59	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:31:00	0	
VANDYKSDRIF	2255	1	NORTH	BLINKPAN	18:18:00	18:18:00	00:18:00			RTI/S765198						01:31:00	0	10.3
VANDYKSDRIF	2255	2	NORTH	BROODSNYERSPL	18:32:00	18:32:00	00:14:00			RTI/S765198						01:31:00	0	8.76
VANDYKSDRIF	2255	3	NORTH	GELUKSPLAAS	18:45:00	18:45:00	00:13:00			RTI/S765198						01:31:00	0	2.1
VANDYKSDRIF	2255	4	NORTH	BSX-PULLENSHO	18:57:00	18:57:00	00:12:00			RTI/S765198						01:31:00	0	9.07
VANDYKSDRIF	2255	5	NORTH	BSX-RIETKUIL	19:26:00	19:31:00	00:29:00	00:05:00	SHUNT	RTI/S765198						01:31:00	0	28.28
VANDYKSDRIF	2255	6	NORTH	RTI/S765198	19:31:59	00:00:00	00:00:59			RTI/S765198						01:31:00	0	0.1
VANDYKSDRIF	2257	1	NORTH	VANDYKSDRIF		00:01:00				RTI/S765198	00:01:00	01:32:59	3	YYYYYYY	VACUUM TRAINS/VACUUM TRAIN	01:31:00	0	
VANDYKSDRIF	2257	1	NORTH	BLINKPAN	00:19:00	00:19:00	00:18:00			RTI/S765198						01:31:00	0	10.3
VANDYKSDRIF	2257	2	NORTH	BROODSNYERSPL	00:33:00	00:33:00	00:14:00			RTI/S765198						01:31:00	0	8.76
VANDYKSDRIF	2257	3	NORTH	GELUKSPLAAS	00:46:00	00:46:00	00:13:00			RTI/S765198						01:31:00	0	2.1
VANDYKSDRIF	2257	4	NORTH	BSX-PULLENSHO	00:58:00	00:58:00	00:12:00			RTI/S765198						01:31:00	0	9.07
VANDYKSDRIF	2257	5	NORTH	BSX-RIETKUIL	01:27:00	01:32:00	00:29:00	00:05:00	SHUNT	RTI/S765198						01:31:00	0	28.28
VANDYKSDRIF	2257	6	NORTH	RTI/S765198	01:32:59	00:00:00	00:00:59			RTI/S765198						01:31:00	0	0.1
VANDYKSDRIF	8911	1	NORTH	VANDYKSDRIF		21:00:00				RTI/S765198	21:00:00	22:36:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	01:36:00	0	
VANDYKSDRIF	8911	1	NORTH	BLINKPAN	21:18:00	21:18:00	00:18:00			RTI/S765198						01:36:00	0	10.3
VANDYKSDRIF	8911	2	NORTH	BROODSNYERSPL	21:32:00	21:32:00	00:14:00			RTI/S765198						01:36:00	0	8.76
VANDYKSDRIF	8911	3	NORTH	GELUKSPLAAS	21:45:00	21:45:00	00:13:00			RTI/S765198						01:36:00	0	2.1
VANDYKSDRIF	8911	4	NORTH	BSX-PULLENSHO	21:57:00	21:57:00	00:12:00			RTI/S765198						01:36:00	0	9.07
VANDYKSDRIF	8911	5	NORTH	BSX-RIETKUIL	22:26:00	22:31:00	00:29:00	00:05:00	SHUNT	RTI/S765198						01:36:00	0	28.28
VANDYKSDRIF	8911	6	NORTH	RTI/S765198	22:36:00	00:00:00	00:05:00			RTI/S765198						01:36:00	0	0.1
VANDYKSDRIF	8913	1	NORTH	VANDYKSDRIF		09:00:00				RTI/S765198	09:00:00	10:36:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	01:36:00	0	
VANDYKSDRIF	8913	1	NORTH	BLINKPAN	09:18:00	09:18:00	00:18:00			RTI/S765198						01:36:00	0	10.3
VANDYKSDRIF	8913	2	NORTH	BROODSNYERSPL	09:32:00	09:32:00	00:14:00			RTI/S765198						01:36:00	0	8.76
VANDYKSDRIF	8913	3	NORTH	GELUKSPLAAS	09:45:00	09:45:00	00:13:00			RTI/S765198						01:36:00	0	2.1
VANDYKSDRIF	8913	4	NORTH	BSX-PULLENSHO	09:57:00	09:57:00	00:12:00			RTI/S765198						01:36:00	0	9.07
VANDYKSDRIF	8913	5	NORTH	BSX-RIETKUIL	10:26:00	10:31:00	00:29:00	00:05:00	SHUNT	RTI/S765198						01:36:00	0	28.28
VANDYKSDRIF	8913	6	NORTH	RTI/S765198	10:36:00	00:00:00	00:05:00			RTI/S765198						01:36:00	0	0.1
VANDYKSDRIF	8089	1	NORTH	VANDYKSDRIF		06:00:00				PSH/S742902	06:00:00	07:10:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	01:10:00	0	
VANDYKSDRIF	8089	1	NORTH	BLINKPAN	06:17:00	06:17:00	00:17:00			PSH/S742902						01:10:00	0	10.3
VANDYKSDRIF	8089	2	NORTH	BROODSNYERSPL	06:32:00	06:32:00	00:15:00			PSH/S742902						01:10:00	0	8.76
VANDYKSDRIF	8089	3	NORTH	GELUKSPLAAS	06:45:00	06:45:00	00:13:00			PSH/S742902						01:10:00	0	2.1
VANDYKSDRIF	8089	4	NORTH	BSX-PULLENSHO	06:57:00	07:00:00	00:12:00	00:03:00	SHUNT	PSH/S742902						01:10:00	0	9.07
VANDYKSDRIF	8089	5	NORTH	PSH/S742902	07:10:00	00:00:00	00:10:00			PSH/S742902						01:10:00	0	0.97
VANDYKSDRIF	8977	1	NORTH	VANDYKSDRIF		09:00:00				PSH/S741051	09:00:00	09:59:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:59:00	0	
VANDYKSDRIF	8977	1	NORTH	BLINKPAN	09:17:00	09:17:00	00:17:00			PSH/S741051						00:59:00	0	10.3
VANDYKSDRIF	8977	2	NORTH	BROODSNYERSPL	09:32:00	09:32:00	00:15:00			PSH/S741051						00:59:00	0	8.76
VANDYKSDRIF	8977	3	NORTH	GELUKSPLAAS	09:45:00	09:45:00	00:13:00			PSH/S741051						00:59:00	0	2.1
VANDYKSDRIF	8977	4	NORTH	BSX-PULLENSHO	09:57:00	09:58:00	00:12:00	00:01:00	RANGEER	PSH/S741051						00:59:00	0	9.07
VANDYKSDRIF	8977	5	NORTH	PSH/S741051	09:59:00	00:00:00	00:01:00			PSH/S741051						00:59:00	0	0.97
VANDYKSDRIF	8979	1	NORTH	VANDYKSDRIF		21:00:00				PSH/S741051	21:00:00	21:59:00	3	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	00:59:00	0	
VANDYKSDRIF	8979	1	NORTH	BLINKPAN	21:17:00	21:17:00	00:17:00			PSH/S741051						00:59:00	0	10.3
VANDYKSDRIF	8979	2	NORTH	BROODSNYERSPL	21:32:00	21:32:00	00:15:00			PSH/S741051						00:59:00	0	8.76
VANDYKSDRIF	8979	3	NORTH	GELUKSPLAAS	21:45:00	21:45:00	00:13:00			PSH/S741051						00:59:00	0	2.1
VANDYKSDRIF	8979	4	NORTH	BSX-PULLENSHO	21:57:00	21:58:00	00:12:00	00:01:00	RANGEER	PSH/S741051						00:59:00	0	9.07
VANDYKSDRIF	8979	5	NORTH	PSH/S741051	21:59:00	00:00:00	00:01:00			PSH/S741051						00:59:00	0	0.97
VANDYKSDRIF	3202	1	NORTH	VANDYKSDRIF		18:01:00				GEDULD	18:01:00	20:33:00	3	YYYYYYY	VACUUM TRAINS/FEEDER TRAIN	02:32:00	0	
VANDYKSDRIF	3202	1	NORTH	SRW-BEZUIDENHOUTS	18:12:00	18:12:00	00:11:00			GEDULD						02:32:00	0	9.07
VANDYKSDRIF	3202	2	NORTH	KROMKLIP	18:22:00	18:22:00	00:10:00			GEDULD						02:32:00	0	7.59
VANDYKSDRIF	3202	3	NORTH	SAAIWATER	18:29:00	18:29:00	00:07:00			GEDULD						02:32:00	0	5.83
VANDYKSDRIF	3202	4	NORTH	OGIES	18:46:00	18:46:00	00:17:00			GEDULD						02:32:00	0	11.98
VANDYKSDRIF	3202	5	NORTH	KENDAL	18:57:00	18:57:00	00:11:00			GEDULD						02:32:00	0	10.14
VANDYKSDRIF	3202	6	NORTH	ARBOR	19:06:00	19:06:00	00:09:00			GEDULD						02:32:00	0	7.45
VANDYKSDRIF	3202	7	NORTH	ARGENT	19:17:00	19:17:00	00:11:00			GEDULD						02:32:00	0	8.01
VANDYKSDRIF	3202	8	NORTH	DRYDEN	19:29:00	19:29:00	00:12:00			GEDULD						02:32:00	0	9.68
VANDYKSDRIF	3202	9	NORTH	DELMAS	19:42:00	19:42:00	00:13:00			GEDULD						02:32:00	0	10.66
VANDYKSDRIF	3202	10	NORTH	ELOFF	19:54:00	19:54:00	00:12:00			GEDULD						02:32:00	0	8.59
VANDYKSDRIF	3202	11	NORTH	ELF/S766011	19:54:15	19:56:45	00:00:15	00:02:30	WEIGHBRIDGE	GEDULD						02:32:00	0	0.1
VANDYKSDRIF	3202	11	NORTH	SUNDRA	20:03:00	20:03:00	00:06:15			GEDULD						02:32:00	0	5.29
VANDYKSDRIF	3202	12	NORTH	WELGEDAG	20:16:00	20:16:00	00:13:00			GEDULD						02:32:00	0	8.55
VANDYKSDRIF	3202	13	NORTH	GEDULD	20:33:00	00:00:00	00:17:00			GEDULD						02:32:00	0	5.8
VANDYKSDRIF	8748	1	NORTH	VANDYKSDRIF		05:55:00				WELGEDAG	05:55:00	08:07:00	2	YYYYYYY	MEDIUM HEAVY/MEDIUM HEAVY	02:12:00	0	
VANDYKSDRIF	8748	1	NORTH	SRW-BEZUIDENHOUTS	06:08:00	06:08:00	00:13:00		B	WELGEDAG						02:12:00	0	9.07
VANDYKSDRIF	8748	2	NORTH	KROMKLIP	06:18:00	06:18:00	00:10:00			WELGEDAG						02:12:00	0	7.59
VANDYKSDRIF	8748	3	NORTH	SAAIWATER	06:25:00	06:25:00	00:07:00			WELGEDAG						02:12:00	0	5.83
VANDYKSDRIF	8748	4	NORTH	OGIES	06:42:00	06:42:00	00:17:00			WELGEDAG						02:12:00	0	11.98
VANDYKSDRIF	8748	5	NORTH	KENDAL	06:53:00	06:53:00	00:11:00			WELGEDAG						02:12:00	0	10.14
VANDYKSDRIF	8748	6	NORTH	ARBOR	07:02:00	07:02:00	00:09:00			WELGEDAG						02:12:00	0	7.45
VANDYKSDRIF	8748	7	NORTH	ARGENT	07:13:00	07:13:00	00:11:00			WELGEDAG						02:12:00	0	8.01
VANDYKSDRIF	8748	8	NORTH	DRYDEN	07:25:00	07:25:00	00:12:00			WELGEDAG						02:12:00	0	9.68
VANDYKSDRIF	8748	9	NORTH	DELMAS	07:38:00	07:38:00	00:13:00			WELGEDAG						02:12:00	0	10.66
VANDYKSDRIF	8748	10	NORTH	ELOFF	07:50:00	07:50:00	00:12:00			WELGEDAG						02:12:00	0	8.59
VANDYKSDRIF	8748	11	NORTH	ELF/S766011	07:50:15	07:52:45	00:00:15	00:02:30	WEIGHBRIDGE	WELGEDAG						02:12:00	0	0.1
VANDYKSDRIF	8748	11	NORTH	SUNDRA	07:59:00	07:59:00	00:06:15			WELGEDAG						02:12:00	0	5.29
VANDYKSDRIF	8748	12	NORTH	WELGEDAG	08:07:00	00:00:00	00:08:00		RT	WELGEDAG						02:12:00	0	8.55
`;

describe('a thirteenth extract: VANDYKSDRIF complete', () => {
  const all = parseRunningTimes(B13);
  const byId = (id: string) => all.find((t) => t.train === id)!;
  type Sched = ReturnType<typeof byId>;
  const flagOf = (t: Sched) => {
    const r = t.rows.find((x) => (x.standingReason ?? '') !== '')?.standingReason ?? '';
    return r === 'B' || r.startsWith('B ') ? 'B' : r === 'C' || r.startsWith('C ') ? 'C' : null;
  };

  /** One origin, captured in full — eighty trains, nothing left behind. */
  it('reads eighty trains, all at VANDYKSDRIF', () => {
    expect(all).toHaveLength(80);
    expect(new Set(all.map((t) => t.origin))).toEqual(new Set(['VANDYKSDRIF']));
    expect(all.reduce((n, t) => n + t.rows.length, 0)).toBe(468 - 80);
    expect(all.every(hasSummary)).toBe(true);
  });

  it('ties seventy-eight of eighty on the clock', () => {
    const adrift = all
      .filter((t) => {
        const v = validateSchedule(t);
        return !v.elapsedIdentityHolds || !v.throughputTies;
      })
      .map((t) => t.train)
      .sort();
    expect(adrift).toEqual(['2255', '2257']);
  });

  /**
   * 2200 REFUTES the implication asserted in §49.4.
   *
   * Last extract established, on four KGR-WATERVAL trains, that every train
   * whose Frequency string contains a C also carries a C flag on its first
   * reason-bearing row. It was recorded as an implication on a small sample,
   * asserted precisely so that a later extract breaking it would say so.
   *
   * It broke. VANDYKSDRIF 2200 runs frequency YCYYCCY — three Cs — and carries
   * no flag at all: its first reason-bearing row reads RANGEER, and not one of
   * its six node rows has a B or a C. It is otherwise an ordinary member of the
   * hourly shunt pool, clock-identical to the other twenty-one.
   *
   * So the Frequency C and the reason-column C are NOT linked. The two columns
   * were always different fields; the apparent connection was four trains'
   * worth of coincidence. What survives is §50.1 — the reason-column flag
   * tracks the train type — which this extract does not disturb.
   */
  it('refutes the frequency-C implication: 2200 has three Cs and no flag', () => {
    const t = byId('2200');
    expect(t.frequency).toBe('YCYYCCY');
    expect([...t.frequency].filter((c) => c === 'C')).toHaveLength(3);
    expect(flagOf(t)).toBeNull();
    expect(t.rows.map((r) => r.standingReason)).toEqual([
      'RANGEER', 'RANGEER', 'RANGEER', 'RANGEER', 'RANGEER', null,
    ]);
    // And it is otherwise an ordinary member of the pool.
    const peer = byId('2100');
    expect(t.rows.map((r) => [r.station, r.pointToPointRuntime, r.standingTime]))
      .toEqual(peer.rows.map((r) => [r.station, r.pointToPointRuntime, r.standingTime]));
    expect(peer.frequency).toBe('YYYYYYY');
  });

  /**
   * Twenty-two trains, one yard move, once an hour.
   *
   * 100, 300 through 2000 on the hour, then 2100, 2200, 2300: every one a
   * fifty-five minute sweep out to VYF/S754331 and back, five RANGEER moves of
   * five minutes each, identical to the second. They differ only in departure
   * hour — and 2200 in its frequency.
   *
   * The largest identity group in the corpus: twenty-two, against the ten at
   * VYD-STASIE (§50.2) and the four at WELGEDAG (§48.3). There is no 200.
   */
  it('runs twenty-two identical hourly yard sweeps', () => {
    const pool = all.filter((t) => t.destination === 'VANDYKSDRIF');
    expect(pool).toHaveLength(22);
    const shape = (t: Sched) =>
      t.rows.map((r) => [r.station, r.pointToPointRuntime, r.standingTime, r.standingReason]);
    for (const t of pool) {
      expect([t.train, shape(t)]).toEqual([t.train, shape(pool[0])]);
      expect([t.train, t.throughputRuntime]).toEqual([t.train, 55]);
      expect([t.train, t.trainType]).toEqual([t.train, 'VACUUM TRAINS/SHUNT CAR']);
    }
    // Hourly, on the hour, with 02:00 absent.
    const hours = pool.map((t) => t.originDeparture / 60).sort((a, b) => a - b);
    expect(hours).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    expect(new Set(pool.map((t) => t.frequency))).toEqual(new Set(['YYYYYYY', 'YCYYCCY']));
  });

  /**
   * The stated runtime is TRUNCATED, not rounded — 2255 and 2257 settle it.
   *
   * Both arrive at 59 seconds past the minute (19:31:59 and 01:32:59) against a
   * stated 01:31:00. Elapsed is 91 minutes 59 seconds; stated is 91.
   *
   * The two earlier cases — WELGEDAG 1268 and WALTLOO 8961 (§48.2, §50.3) —
   * both carried a half minute, which rounding-to-nearest would also have
   * explained by dropping it. 59 seconds would round UP. It does not. Four
   * instances across three extracts, and the rule is truncation toward zero.
   */
  it('truncates rather than rounds: 2255 and 2257 lose fifty-nine seconds', () => {
    for (const id of ['2255', '2257']) {
      const t = byId(id);
      const elapsed = elapsedMinutes(t)!;
      expect([id, Math.round(elapsed * 60)]).toEqual([id, 91 * 60 + 59]);
      expect([id, t.throughputRuntime]).toEqual([id, 91]);
      expect([id, validateSchedule(t).elapsedIdentityHolds]).toEqual([id, true]);
      expect([id, validateSchedule(t).throughputTies]).toEqual([id, false]);
    }
    // Rounding to nearest would have given 92; truncation gives 91.
    expect(Math.round(91 + 59 / 60)).toBe(92);
    expect(byId('2255').throughputRuntime).toBe(91);
  });

  /** Eighty trains and exactly one flag — and it is an exception to §50.1. */
  it('carries a single flag in eighty trains, on a medium-heavy working', () => {
    const flagged = all.filter((t) => flagOf(t) !== null);
    expect(flagged.map((t) => t.train)).toEqual(['8748']);
    expect(byId('8748').trainType).toBe('MEDIUM HEAVY/MEDIUM HEAVY');
    expect(flagOf(byId('8748'))).toBe('B');
    // MEDIUM HEAVY would predict C under the VYD-STASIE rule.
    expect(flagOf(byId('8748'))).not.toBe('C');
  });

  /**
   * 2097/2099/2101/2103 and 8977/8979 work one path to PSH/S741051.
   *
   * Six trains, the same five nodes, the same fifty-nine minutes, the same
   * one-minute RANGEER at BSX-PULLENSHO. Four are VACUUM TRAINS/FEEDER TRAIN
   * and two are MEDIUM HEAVY, and none of the six carries a flag.
   */
  it('works one path to PSH/S741051 under six numbers and two train types', () => {
    const fam = all.filter((t) => t.destination === 'PSH/S741051');
    expect(fam.map((t) => t.train).sort()).toEqual(['2097', '2099', '2101', '2103', '8977', '8979']);
    const shape = (t: Sched) => t.rows.map((r) => [r.station, r.pointToPointRuntime, r.standingTime]);
    for (const t of fam) {
      expect([t.train, shape(t)]).toEqual([t.train, shape(fam[0])]);
      expect([t.train, t.throughputRuntime]).toEqual([t.train, 59]);
      expect([t.train, flagOf(t)]).toEqual([t.train, null]);
    }
    expect(new Set(fam.map((t) => t.trainType))).toEqual(
      new Set(['VACUUM TRAINS/FEEDER TRAIN', 'MEDIUM HEAVY/MEDIUM HEAVY']),
    );
  });
});

describe('the frequency-C implication, measured across every extract', () => {
  /**
   * §49.4 claimed Frequency-contains-C implies a C flag. Measured over all
   * five fixtures the claim is false, and the counter-examples are named.
   */
  it('finds trains with a C frequency and no C flag', () => {
    const withFreqC: string[] = [];
    const violating: string[] = [];
    for (const tsv of [B9, B10, B11, B12, B13]) {
      for (const t of parseRunningTimes(tsv)) {
        if (!t.frequency.includes('C')) continue;
        withFreqC.push(`${t.origin}/${t.train}`);
        const r = t.rows.find((x) => (x.standingReason ?? '') !== '')?.standingReason ?? '';
        if (!(r === 'C' || r.startsWith('C '))) violating.push(`${t.origin}/${t.train}:${t.frequency}`);
      }
    }
    expect(withFreqC.length).toBeGreaterThan(4);
    expect(violating).toContain('VANDYKSDRIF/2200:YCYYCCY');
    expect(violating.length).toBeGreaterThan(0);
  });
});
