import { CORRIDOR_CATALOG } from './catalog/corridors.catalog';
import {
  ConsignmentLike, PossessionLike, consignmentInterval, detectPossessionConflicts, isEffectivelyLocked, possessionLockedFrom,
} from './rail-possession.rules';

const DAY = 86_400_000;
const NOW = new Date('2026-10-02T10:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const win = (over: Partial<PossessionLike> = {}): PossessionLike => ({
  id: 'w1', corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN', status: 'PLANNED', title: 'Track renewal', startsAt: at(10), endsAt: at(11), ...over,
});
const con = (over: Partial<ConsignmentLike> = {}): ConsignmentLike => ({
  id: 'c1', consignmentNumber: 'RAIL-1', status: 'PLANNED', corridor: 'Ore', plannedDeparture: at(10.2), plannedArrival: at(12), ...over,
});
const scan = (windows: PossessionLike[], cons: ConsignmentLike[]) => detectPossessionConflicts(windows, cons, CORRIDOR_CATALOG, NOW);

describe('the 60-day lock', () => {
  it('an ANNUAL_PLAN window locks 60 days before it starts', () => {
    const w = win({ startsAt: at(100) });
    expect(possessionLockedFrom(w).toISOString()).toBe(at(40).toISOString());
    expect(isEffectivelyLocked(w, at(39.99))).toBe(false);
    expect(isEffectivelyLocked(w, at(40))).toBe(true);
  });
  it('LOCKED_60_DAY and AD_HOC_EMERGENCY windows are always locked', () => {
    expect(isEffectivelyLocked(win({ kind: 'LOCKED_60_DAY', startsAt: at(500) }), NOW)).toBe(true);
    expect(isEffectivelyLocked(win({ kind: 'AD_HOC_EMERGENCY', startsAt: at(500) }), NOW)).toBe(true);
  });
});

describe('consignmentInterval', () => {
  it('uses planned departure → planned arrival', () => {
    expect(consignmentInterval(con())).toEqual({ start: at(10.2), end: at(12) });
  });
  it('prefers the ACTUAL departure once it has left', () => {
    expect(consignmentInterval(con({ actualDeparture: at(10.5) }))!.start).toEqual(at(10.5));
  });
  it('falls back to departure + SLA hours when no arrival is planned', () => {
    expect(consignmentInterval(con({ plannedArrival: null, slaHours: 48 }))!.end.getTime()).toBe(at(10.2).getTime() + 48 * 3_600_000);
  });
  it.each([
    ['no departure', { plannedDeparture: null }], ['no arrival and no SLA', { plannedArrival: null, slaHours: null }], ['arrival before departure', { plannedArrival: at(9) }],
  ])('cannot be worked out with %s', (_l, over) => expect(consignmentInterval(con(over as never))).toBeNull());
});

describe('detectPossessionConflicts', () => {
  it('finds an overlap on the same corridor and states the overlap', () => {
    const r = scan([win()], [con()]); // window d10..d11, consignment d10.2..d12 → overlap d10.2..d11 = 19.2 h
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ windowId: 'w1', consignmentNumber: 'RAIL-1', overlapHours: 19.2, windowKind: 'ANNUAL_PLAN' });
    expect(r.consignmentsChecked).toBe(1);
  });
  it('touching ends are not a conflict (strict overlap)', () => {
    expect(scan([win({ startsAt: at(12), endsAt: at(13) })], [con()]).conflicts).toEqual([]);
    expect(scan([win({ startsAt: at(9), endsAt: at(10.2) })], [con()]).conflicts).toEqual([]);
  });
  it('a different corridor is never a conflict', () => {
    expect(scan([win({ corridorCode: 'COR-CAPE' })], [con()]).conflicts).toEqual([]);
  });
  it('severity: HARD when locked / emergency, PLANNED for an unlocked annual-plan window', () => {
    expect(scan([win({ kind: 'AD_HOC_EMERGENCY' })], [con()]).conflicts[0].severity).toBe('HARD');
    expect(scan([win({ kind: 'LOCKED_60_DAY' })], [con()]).conflicts[0].severity).toBe('HARD');
    expect(scan([win({ kind: 'ANNUAL_PLAN', startsAt: at(200), endsAt: at(201) })], [con({ plannedDeparture: at(200.1), plannedArrival: at(202) })]).conflicts[0].severity).toBe('PLANNED');
    expect(scan([win({ kind: 'ANNUAL_PLAN' })], [con()]).conflicts[0].severity).toBe('HARD'); // d10 is inside the 60-day lock
  });
  it('only PLANNED and ACTIVE windows count; completed / cancelled ones never do', () => {
    for (const status of ['COMPLETED', 'CANCELLED'] as const) expect(scan([win({ status })], [con()]).conflicts).toEqual([]);
    expect(scan([win({ status: 'ACTIVE' })], [con()]).conflicts).toHaveLength(1);
  });
  it('only ACTIVE consignments count — finished or cancelled ones are ignored', () => {
    for (const status of ['ARRIVED', 'OFFLOADED', 'COMPLETED', 'CANCELLED']) {
      const r = scan([win()], [con({ status })]);
      expect(r.conflicts).toEqual([]);
      expect(r.consignmentsChecked).toBe(0);
    }
    for (const status of ['PLANNED', 'WAGONS_ALLOCATED', 'LOADING', 'DEPARTED', 'IN_TRANSIT', 'AT_INTERCHANGE']) expect(scan([win()], [con({ status })]).conflicts).toHaveLength(1);
  });
  it('lists — never silently clears — consignments it cannot check', () => {
    const r = scan([win()], [
      con({ id: 'a', consignmentNumber: 'NO-SCHEDULE', plannedDeparture: null }),
      con({ id: 'b', consignmentNumber: 'WRONG-NAME', corridor: 'Coal Line' }),
      con({ id: 'c', consignmentNumber: 'NO-CORRIDOR', corridor: null }),
    ]);
    expect(r.conflicts).toEqual([]);
    expect(r.unscheduled).toEqual(['NO-SCHEDULE']);
    expect(r.unresolved.sort()).toEqual(['NO-CORRIDOR', 'WRONG-NAME']);
  });
  it('resolves the consignment corridor by pre-V4 alias or route name', () => {
    expect(scan([win()], [con({ corridor: 'Cape 2' })]).conflicts).toHaveLength(1);
  });
  it('reports every window × consignment pair', () => {
    const r = scan([win({ id: 'w1' }), win({ id: 'w2', startsAt: at(11.5), endsAt: at(11.9) })], [con({ id: 'c1' }), con({ id: 'c2', consignmentNumber: 'RAIL-2', plannedDeparture: at(10.5), plannedArrival: at(11.7) })]);
    expect(r.conflicts.map((c) => `${c.windowId}/${c.consignmentId}`).sort()).toEqual(['w1/c1', 'w1/c2', 'w2/c1', 'w2/c2']);
  });
});
