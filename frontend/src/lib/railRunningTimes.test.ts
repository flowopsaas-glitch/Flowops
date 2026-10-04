import { describe, it, expect } from 'vitest';
import {
  CORRIDOR_TAXONOMY_NOTE,
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
