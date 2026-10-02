/**
 * Tariff / overload / hold rules (pure).
 *
 * ALL RATES IN THIS FILE ARE SYNTHETIC TEST FIXTURES. No real c/GTK rate was supplied (Network Statement Section 5 was
 * never provided) and none is encoded anywhere in the product; what these tests prove is that the calculator does the
 * arithmetic exactly and — above all — that it REFUSES to price, or leaves a line unpriced, rather than invent a number.
 */
import {
  AncillaryLike, RAIL_TARIFF_CONSTANTS, ScheduleLike, TARIFF_CONSTANT_SOURCE, TariffContext, TariffRequest, calculateTariff, deriveHold, escalate, evaluateOverload,
  financialYearOf, financialYearsBetween, formatFinancialYear, latestReadingPerWagon, parseFinancialYear,
} from './rail-tariff.rules';
import { ANCILLARY_SERVICE_CATALOG } from './catalog/ancillary-services.catalog';

// ── fixtures (synthetic) ─────────────────────────────────────────────────────
const sched = (over: Partial<ScheduleLike> = {}): ScheduleLike => ({
  id: 's1', corridorCode: 'COR-ORE', financialYear: '2026/27', loadedCentsPerGtk: 5, emptyCentsPerGtk: 2, dataStatus: 'VERIFIED', sourceRef: 'SYNTHETIC test tariff', ...over,
});
const wagons = [
  { wagonNumber: 'W1', tareTonnes: 22, loadedTonnes: 60 }, // 82 t gross
  { wagonNumber: 'W2', tareTonnes: 22, loadedTonnes: 58 }, // 80 t gross
];
const anc = (over: Partial<AncillaryLike> = {}): AncillaryLike => ({ code: 'ANX40-01', name: 'Shunting', serviceName: 'Shunting', unitOfMeasure: 'Per wagon movement', priceStatus: 'TBD', unitRateZar: null, ...over });
const ctx = (over: Partial<TariffContext> = {}): TariffContext => ({ wagons, latestReadings: [], schedules: [sched()], ancillaryCatalog: [anc()], ...over });
const req = (over: Partial<TariffRequest> = {}): TariffRequest => ({ corridorCode: 'COR-ORE', financialYear: '2026/27', distanceKm: 100, ...over });
const reading = (wagonNumber: string, actualTonnes: number, over: Record<string, unknown> = {}) => ({
  wagonNumber, actualTonnes, status: 'WITHIN_LIMIT' as const, excessTonnes: null, createdAt: '2026-10-02T08:00:00.000Z', ...over,
});
const line = (r: ReturnType<typeof calculateTariff>, kind: string) => r.lines.find((l) => l.kind === kind)!;

// ═══════════════════════════════════════════════════════════════════════════════
describe('the brief\'s constants', () => {
  it('are exactly the three the brief gave, and are labelled as unverified', () => {
    expect(RAIL_TARIFF_CONSTANTS).toEqual({ infrastructureEscalationPct: 8.5, electricityEscalationPct: 4.42, dieselBasePricePerLitreZar: 24.64 });
    expect(TARIFF_CONSTANT_SOURCE).toMatch(/\[BRIEF\].*unverified/);
  });
});

describe('financial year', () => {
  it.each([['2026/27', 2026], ['2025/26', 2025], ['2099/00', 2099], [' 2026/27 ', 2026]])('parses %s → %s', (fy, start) => expect(parseFinancialYear(fy)).toBe(start));
  it.each([['2026/28'], ['26/27'], ['2026-27'], ['2026/2027'], [''], ['abc'], ['2026/26']])('rejects "%s"', (fy) => expect(parseFinancialYear(fy)).toBeNull());
  it('rejects null / undefined', () => { expect(parseFinancialYear(null)).toBeNull(); expect(parseFinancialYear(undefined)).toBeNull(); });
  it('formats, including the century rollover', () => {
    expect(formatFinancialYear(2026)).toBe('2026/27');
    expect(formatFinancialYear(2009)).toBe('2009/10');
    expect(formatFinancialYear(2099)).toBe('2099/00');
  });
  it.each([
    ['2026-03-31T21:59:59Z', '2025/26'], // 23:59:59 SAST on 31 March
    ['2026-03-31T22:00:00Z', '2026/27'], // midnight SAST: 1 April
    ['2026-10-02T10:00:00Z', '2026/27'],
    ['2027-03-31T10:00:00Z', '2026/27'],
    ['2027-03-31T22:00:00Z', '2027/28'],
    ['2026-01-15T00:00:00Z', '2025/26'],
    ['2026-12-31T23:00:00Z', '2026/27'],
  ])('%s falls in %s (1 April – 31 March on the South African calendar)', (iso, fy) => expect(financialYearOf(new Date(iso))).toBe(fy));
  it('counts whole years between two labels', () => {
    expect(financialYearsBetween('2025/26', '2026/27')).toBe(1);
    expect(financialYearsBetween('2024/25', '2026/27')).toBe(2);
    expect(financialYearsBetween('2026/27', '2026/27')).toBe(0);
    expect(financialYearsBetween('2026/27', '2025/26')).toBe(-1);
    expect(financialYearsBetween('nope', '2026/27')).toBeNull();
  });
});

describe('escalate', () => {
  it('is the rate unchanged for zero years', () => expect(escalate(5, 8.5, 0)).toBe(5));
  it('compounds annually', () => {
    expect(escalate(100, 8.5, 1)).toBeCloseTo(108.5, 10);
    expect(escalate(100, 8.5, 2)).toBeCloseTo(117.7225, 10);
    expect(escalate(100, 4.42, 3)).toBeCloseTo(100 * 1.0442 ** 3, 10);
  });
  it.each([[-1, 8.5, 1], [NaN, 8.5, 1], [100, NaN, 1], [100, 8.5, -1], [100, 8.5, 1.5]])('rejects rate=%s pct=%s years=%s', (rate, pct, years) => {
    expect(() => escalate(rate, pct, years)).toThrow(RangeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('THE OVERLOAD RULE: actualTonnes > maxAxleLoadTonnes × axles', () => {
  it.each([
    [80, 4, 20, 'WITHIN_LIMIT', null], // exactly at the limit is within it
    [79.999, 4, 20, 'WITHIN_LIMIT', null],
    [80.001, 4, 20, 'OVERLOADED', 0.001],
    [100, 4, 20, 'OVERLOADED', 20],
    [104, 4, 26, 'WITHIN_LIMIT', null],
    [104.5, 4, 26, 'OVERLOADED', 0.5],
    [60.3, 3, 20.1, 'WITHIN_LIMIT', null], // 20.1 × 3 = 60.300000000000004 in floating point — not an overload
    [60.301, 3, 20.1, 'OVERLOADED', 0.001],
    [30, 2, 15, 'WITHIN_LIMIT', null],
  ])('%s t on %s axles with a %s t limit → %s', (actual, axles, max, status, excess) => {
    const r = evaluateOverload({ actualTonnes: actual, axles, maxAxleLoadTonnes: max });
    expect(r.status).toBe(status);
    expect(r.excessTonnes).toBe(excess);
    expect(r.allowedTonnes).toBeCloseTo(axles * max, 9);
  });

  it('says what it compared', () => {
    expect(evaluateOverload({ actualTonnes: 100, axles: 4, maxAxleLoadTonnes: 20 }).reason).toBe('100 t on 4 axle(s) exceeds the 80 t allowed (20 t per axle) by 20 t.');
    expect(evaluateOverload({ actualTonnes: 70, axles: 4, maxAxleLoadTonnes: 20 }).reason).toMatch(/within the 80 t allowed/);
  });

  it.each([
    ['no actual mass', { actualTonnes: undefined, axles: 4, maxAxleLoadTonnes: 20 }, /No actual mass/],
    ['a zero mass', { actualTonnes: 0, axles: 4, maxAxleLoadTonnes: 20 }, /No actual mass/],
    ['a negative mass', { actualTonnes: -5, axles: 4, maxAxleLoadTonnes: 20 }, /No actual mass/],
    ['NaN mass', { actualTonnes: NaN, axles: 4, maxAxleLoadTonnes: 20 }, /No actual mass/],
    ['no axle count', { actualTonnes: 100, axles: null, maxAxleLoadTonnes: 20 }, /axle count/],
    ['a fractional axle count', { actualTonnes: 100, axles: 3.5, maxAxleLoadTonnes: 20 }, /axle count/],
    ['zero axles', { actualTonnes: 100, axles: 0, maxAxleLoadTonnes: 20 }, /axle count/],
    ['no limit', { actualTonnes: 100, axles: 4, maxAxleLoadTonnes: null }, /No maximum axle load/],
    ['a zero limit', { actualTonnes: 100, axles: 4, maxAxleLoadTonnes: 0 }, /No maximum axle load/],
  ])('%s → UNVERIFIED (never a pass, never a hold)', (_l, input, reason) => {
    const r = evaluateOverload(input as never);
    expect(r).toMatchObject({ status: 'UNVERIFIED', allowedTonnes: null, excessTonnes: null });
    expect(r.reason).toMatch(reason);
  });
});

describe('the hold', () => {
  const r = (wagonNumber: string, status: 'WITHIN_LIMIT' | 'OVERLOADED' | 'UNVERIFIED', createdAt: string, excessTonnes: number | null = null) => ({ wagonNumber, status, excessTonnes, createdAt });

  it('the most recently RECORDED reading of a wagon is the one that counts', () => {
    const rows = [r('W1', 'OVERLOADED', '2026-10-02T08:00:00Z', 3), r('W1', 'WITHIN_LIMIT', '2026-10-02T09:00:00Z'), r('W2', 'WITHIN_LIMIT', '2026-10-02T08:30:00Z')];
    expect(latestReadingPerWagon(rows).map((x) => `${x.wagonNumber}:${x.status}`).sort()).toEqual(['W1:WITHIN_LIMIT', 'W2:WITHIN_LIMIT']);
  });
  it('is independent of the order the rows arrive in', () => {
    const rows = [r('W1', 'WITHIN_LIMIT', '2026-10-02T09:00:00Z'), r('W1', 'OVERLOADED', '2026-10-02T08:00:00Z', 3)];
    expect(latestReadingPerWagon(rows)).toEqual([rows[0]]);
    expect(latestReadingPerWagon([...rows].reverse())).toEqual([rows[0]]);
  });
  it('on an identical timestamp the later entry wins', () => {
    const rows = [r('W1', 'OVERLOADED', '2026-10-02T08:00:00Z', 3), r('W1', 'WITHIN_LIMIT', '2026-10-02T08:00:00Z')];
    expect(latestReadingPerWagon(rows)[0].status).toBe('WITHIN_LIMIT');
  });

  it('is not held with no readings, or while every wagon is within its limit', () => {
    expect(deriveHold([])).toEqual({ held: false, wagons: [], totalExcessTonnes: 0, reason: null });
    expect(deriveHold([r('W1', 'WITHIN_LIMIT', '2026-10-02T08:00:00Z')]).held).toBe(false);
  });
  it('an UNVERIFIED reading never holds a consignment (the limit was unknown)', () => {
    expect(deriveHold([r('W1', 'UNVERIFIED', '2026-10-02T08:00:00Z')]).held).toBe(false);
  });
  it('is held while ANY wagon is overloaded, and says which and by how much', () => {
    const h = deriveHold([r('W2', 'OVERLOADED', '2026-10-02T08:00:00Z', 0.5), r('W1', 'OVERLOADED', '2026-10-02T08:05:00Z', 3.2), r('W3', 'WITHIN_LIMIT', '2026-10-02T08:10:00Z')]);
    expect(h.held).toBe(true);
    expect(h.wagons).toEqual([{ wagonNumber: 'W1', excessTonnes: 3.2 }, { wagonNumber: 'W2', excessTonnes: 0.5 }]);
    expect(h.totalExcessTonnes).toBe(3.7);
    expect(h.reason).toBe('Overloaded: W1 (3.2 t over), W2 (0.5 t over). Reduce the load and re-weigh each wagon within its limit.');
  });
  it('re-weighing the only overloaded wagon within its limit lifts the hold', () => {
    expect(deriveHold([r('W1', 'OVERLOADED', '2026-10-02T08:00:00Z', 3), r('W1', 'WITHIN_LIMIT', '2026-10-02T09:00:00Z')]).held).toBe(false);
  });
  it('re-weighing ONE of two overloaded wagons leaves the hold on the other', () => {
    const h = deriveHold([r('W1', 'OVERLOADED', '2026-10-02T08:00:00Z', 3), r('W2', 'OVERLOADED', '2026-10-02T08:01:00Z', 1), r('W1', 'WITHIN_LIMIT', '2026-10-02T09:00:00Z')]);
    expect(h.held).toBe(true);
    expect(h.wagons.map((w) => w.wagonNumber)).toEqual(['W2']);
    expect(h.reason).toMatch(/re-weigh the wagon within its limit/);
  });
  it('a later overloaded reading re-imposes a hold', () => {
    expect(deriveHold([r('W1', 'WITHIN_LIMIT', '2026-10-02T08:00:00Z'), r('W1', 'OVERLOADED', '2026-10-02T09:00:00Z', 2)]).held).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('calculateTariff — it REFUSES rather than invents', () => {
  it('a corridor with no loaded rate at all is BLOCKED: nothing is priced and the reason says rates are never defaulted', () => {
    const r = calculateTariff(req(), ctx({ schedules: [] }));
    expect(r.status).toBe('BLOCKED');
    expect(r.lines).toEqual([]);
    expect(r.subtotalZar).toBe(0);
    expect(r.blockers.join(' ')).toMatch(/No loaded c\/GTK rate exists for COR-ORE.*never defaulted/);
  });

  it('a SOURCE_PENDING rate is not used', () => {
    const r = calculateTariff(req(), ctx({ schedules: [sched({ dataStatus: 'SOURCE_PENDING' })] }));
    expect(r.status).toBe('BLOCKED');
    expect(r.blockers.join(' ')).toMatch(/not VERIFIED against a cited source/);
  });

  it('a VERIFIED row that has no loaded rate is not a rate', () => {
    for (const loadedCentsPerGtk of [null, 0, -1, NaN]) {
      expect(calculateTariff(req(), ctx({ schedules: [sched({ loadedCentsPerGtk })] })).status).toBe('BLOCKED');
    }
  });

  it('a rate for a different corridor is not used', () => {
    expect(calculateTariff(req(), ctx({ schedules: [sched({ corridorCode: 'COR-COAL' })] })).status).toBe('BLOCKED');
  });

  it('a rate for a LATER year is not used for an earlier one (and never "de-escalated")', () => {
    const r = calculateTariff(req({ allowEscalation: true }), ctx({ schedules: [sched({ financialYear: '2027/28' })] }));
    expect(r.status).toBe('BLOCKED');
  });

  it('PROPERTY: with no VERIFIED loaded rate, no input can produce a priced line', () => {
    const noRate: ScheduleLike[][] = [[], [sched({ loadedCentsPerGtk: null })], [sched({ dataStatus: 'SOURCE_PENDING' })]];
    for (const schedules of noRate) {
      for (const extra of [{}, { includeEmptyReturn: true }, { allowEscalation: true }, { traction: { type: 'DIESEL' as const, litres: 100, pricePerUnitZar: 30 } }, { ancillary: [{ code: 'ANX40-01', quantity: 2 }] }]) {
        const r = calculateTariff(req(extra), ctx({ schedules, ancillaryCatalog: [anc({ priceStatus: 'PUBLISHED', unitRateZar: 10 })] }));
        expect(r.status).toBe('BLOCKED');
        expect(r.lines.filter((l) => l.amountZar !== null)).toEqual([]);
        expect(r.subtotalZar).toBe(0);
      }
    }
  });

  it.each([
    ['no corridor in the catalogue', { corridorCode: null }, /does not match a corridor in the catalogue/],
    ['no distance', { distanceKm: undefined as unknown as number }, /distance in km is required/],
    ['a zero distance', { distanceKm: 0 }, /distance in km is required/],
    ['a negative distance', { distanceKm: -5 }, /distance in km is required/],
    ['NaN distance', { distanceKm: NaN }, /distance in km is required/],
    ['a malformed financial year', { financialYear: '2026-27' }, /is not a financial year/],
  ])('%s → BLOCKED', (_l, over, reason) => {
    const r = calculateTariff(req(over as Partial<TariffRequest>), ctx());
    expect(r.status).toBe('BLOCKED');
    expect(r.blockers.join(' ')).toMatch(reason);
    expect(r.lines).toEqual([]);
  });

  it('a consignment with no wagons is BLOCKED (the weight of the train is unknown)', () => {
    const r = calculateTariff(req(), ctx({ wagons: [] }));
    expect(r.status).toBe('BLOCKED');
    expect(r.blockers.join(' ')).toMatch(/no wagons registered/);
  });

  it('a wagon whose weight is unknown is named, and blocks — a partial weight would under-bill', () => {
    const r = calculateTariff(req(), ctx({ wagons: [wagons[0], { wagonNumber: 'W9', tareTonnes: 22 }, { wagonNumber: 'W8' }] }));
    expect(r.status).toBe('BLOCKED');
    expect(r.blockers.join(' ')).toMatch(/Weight unknown for wagon\(s\) W9, W8/);
    expect(r.weightSources.map((w) => w.source)).toEqual(['NOMINAL', 'UNKNOWN', 'UNKNOWN']);
  });

  it('a weighbridge reading supplies the weight of a wagon that has no registered weights', () => {
    const r = calculateTariff(req(), ctx({ wagons: [{ wagonNumber: 'W9' }], latestReadings: [reading('W9', 80)] }));
    expect(r.status).toBe('PRICED');
    expect(r.weightSources[0]).toMatchObject({ source: 'WEIGHBRIDGE', grossTonnes: 80 });
  });

  it('every blocker is reported at once, not one at a time', () => {
    const r = calculateTariff(req({ corridorCode: null, distanceKm: 0 }), ctx({ wagons: [] }));
    expect(r.blockers.length).toBeGreaterThanOrEqual(3);
  });
});

describe('calculateTariff — the infrastructure (GTK) charge', () => {
  it('prices a loaded train exactly: GTK = gross tonnes × km; amount = GTK × c/GTK ÷ 100', () => {
    const r = calculateTariff(req(), ctx());
    expect(r.status).toBe('PRICED');
    expect(r.grossTonnesLoaded).toBe(162);
    expect(r.gtkLoaded).toBe(16_200);
    expect(r.escalationYears).toBe(0);
    expect(r.scheduleId).toBe('s1');
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ kind: 'GTK_LOADED', quantity: 16_200, unit: 'GTK', rate: 5, rateUnit: 'c/GTK', amountZar: 810 });
    expect(r.subtotalZar).toBe(810);
    expect(r.blockers).toEqual([]);
    expect(r.currency).toBe('ZAR');
  });

  it('shows its working and its evidence', () => {
    const l = calculateTariff(req(), ctx()).lines[0];
    expect(l.basis).toBe('162 gross t (registered tare + loaded masses) × 100 km = 16200 GTK × 5 c/GTK');
    expect(l.evidence).toEqual(['schedule COR-ORE 2026/27 (SYNTHETIC test tariff)']);
  });

  it('rounds the AMOUNT once, to the cent (not the rate, not the GTK)', () => {
    const r = calculateTariff(req({ distanceKm: 123.456 }), ctx({ schedules: [sched({ loadedCentsPerGtk: 6.8437 })] }));
    // 162 t × 123.456 km = 19999.872 GTK; × 6.8437 c = 136,873.124 c → R1,368.73 (rounded once, at the end)
    expect(r.gtkLoaded).toBe(19_999.872);
    expect(r.lines[0].amountZar).toBe(1368.73);
    expect(r.subtotalZar).toBe(1368.73);
  });

  it('is exact where floating point would drift', () => {
    const r = calculateTariff(req({ distanceKm: 1 }), ctx({ wagons: [{ wagonNumber: 'W1', tareTonnes: 0.1, loadedTonnes: 0.2 }], schedules: [sched({ loadedCentsPerGtk: 100 })] }));
    expect(r.gtkLoaded).toBe(0.3);
    expect(r.lines[0].amountZar).toBe(0.3); // 0.3 GTK × 100 c = 30 c
  });

  it('a weighbridge reading beats the registered weights', () => {
    const r = calculateTariff(req(), ctx({ latestReadings: [reading('W1', 90), reading('W2', 80)] }));
    expect(r.grossTonnesLoaded).toBe(170);
    expect(r.weightSources.map((w) => w.source)).toEqual(['WEIGHBRIDGE', 'WEIGHBRIDGE']);
    expect(r.lines[0].basis).toMatch(/weighbridge masses/);
  });

  it('mixing sources is allowed, and says so', () => {
    const r = calculateTariff(req(), ctx({ latestReadings: [reading('W1', 90)] }));
    expect(r.grossTonnesLoaded).toBe(170);
    expect(r.warnings.join(' ')).toMatch(/1 of 2 wagon\(s\) use a weighbridge mass/);
    expect(r.lines[0].basis).toMatch(/weighbridge and registered masses/);
  });

  it('is deterministic', () => {
    expect(calculateTariff(req(), ctx())).toEqual(calculateTariff(req(), ctx()));
  });
});

describe('calculateTariff — escalation is opt-in and says so', () => {
  const old = (financialYear: string, rate = 5) => sched({ id: `s-${financialYear}`, financialYear, loadedCentsPerGtk: rate, emptyCentsPerGtk: rate / 2 });

  it('without opt-in, an earlier-year rate is NOT used: it is refused with an instruction', () => {
    const r = calculateTariff(req(), ctx({ schedules: [old('2025/26')] }));
    expect(r.status).toBe('BLOCKED');
    expect(r.blockers.join(' ')).toMatch(/latest loaded year is 2025\/26.*apply escalation.*8\.50% a year \[BRIEF\]/);
  });

  it('with opt-in, one year: 5 c/GTK × 1.085 = 5.425 → R878.85, recorded as escalated', () => {
    const r = calculateTariff(req({ allowEscalation: true }), ctx({ schedules: [old('2025/26')] }));
    expect(r.status).toBe('PRICED');
    expect(r.escalationYears).toBe(1);
    expect(r.scheduleFinancialYear).toBe('2025/26');
    expect(r.lines[0].rate).toBeCloseTo(5.425, 10);
    expect(r.lines[0].amountZar).toBe(878.85);
    expect(r.lines[0].evidence.join(' ')).toMatch(/escalated 1 year\(s\) from 2025\/26 at 8\.50% a year \[BRIEF\]/);
    expect(r.warnings.join(' ')).toMatch(/escalated 1 year\(s\) by 8\.50% a year/);
  });

  it('two years compound: 5 × 1.085² = 5.886125 → R953.55', () => {
    const r = calculateTariff(req({ allowEscalation: true }), ctx({ schedules: [old('2024/25')] }));
    expect(r.escalationYears).toBe(2);
    expect(r.lines[0].amountZar).toBe(953.55);
  });

  it('the exact year is always preferred, and is never escalated, even with opt-in', () => {
    const r = calculateTariff(req({ allowEscalation: true }), ctx({ schedules: [old('2025/26', 4), old('2026/27', 5)] }));
    expect(r.escalationYears).toBe(0);
    expect(r.scheduleId).toBe('s-2026/27');
    expect(r.lines[0].amountZar).toBe(810);
    expect(r.warnings.join(' ')).not.toMatch(/escalated/);
  });

  it('with several earlier years it escalates from the NEAREST one', () => {
    const r = calculateTariff(req({ allowEscalation: true }), ctx({ schedules: [old('2023/24', 1), old('2025/26', 5)] }));
    expect(r.scheduleFinancialYear).toBe('2025/26');
    expect(r.escalationYears).toBe(1);
  });

  it('an earlier year that is not VERIFIED is not a basis for escalation', () => {
    const r = calculateTariff(req({ allowEscalation: true }), ctx({ schedules: [{ ...old('2025/26'), dataStatus: 'SOURCE_PENDING' }] }));
    expect(r.status).toBe('BLOCKED');
  });
});

describe('calculateTariff — empty return', () => {
  it('is not charged unless asked for', () => {
    expect(calculateTariff(req(), ctx()).lines.map((l) => l.kind)).toEqual(['GTK_LOADED']);
  });

  it('is priced from tare alone: 44 t × 100 km = 4400 GTK × 2 c/GTK = R88.00', () => {
    const r = calculateTariff(req({ includeEmptyReturn: true }), ctx());
    expect(r.status).toBe('PRICED');
    expect(r.grossTonnesEmpty).toBe(44);
    expect(r.gtkEmpty).toBe(4_400);
    expect(line(r, 'GTK_EMPTY')).toMatchObject({ quantity: 4_400, rate: 2, amountZar: 88 });
    expect(r.subtotalZar).toBe(898);
  });

  it('without a loaded empty rate the line is UNPRICED — and the calculation is INCOMPLETE, never a silent R0', () => {
    const r = calculateTariff(req({ includeEmptyReturn: true }), ctx({ schedules: [sched({ emptyCentsPerGtk: null })] }));
    expect(r.status).toBe('INCOMPLETE');
    expect(line(r, 'GTK_EMPTY')).toMatchObject({ quantity: 4_400, rate: null, amountZar: null });
    expect(r.subtotalZar).toBe(810); // the loaded leg only
    expect(r.blockers.join(' ')).toMatch(/no empty-return rate is loaded for COR-ORE 2026\/27/);
  });

  it('a wagon with no registered tare makes the empty weight unknowable: unpriced', () => {
    const r = calculateTariff(req({ includeEmptyReturn: true }), ctx({ wagons: [wagons[0], { wagonNumber: 'W2', loadedTonnes: 58 }], latestReadings: [reading('W2', 80)] }));
    expect(r.status).toBe('INCOMPLETE');
    expect(line(r, 'GTK_EMPTY')).toMatchObject({ quantity: null, amountZar: null });
  });

  it('is escalated with the loaded rate when escalation applies', () => {
    const r = calculateTariff(req({ includeEmptyReturn: true, allowEscalation: true }), ctx({ schedules: [sched({ financialYear: '2025/26' })] }));
    expect(line(r, 'GTK_EMPTY').rate).toBeCloseTo(2 * 1.085, 10);
    expect(line(r, 'GTK_EMPTY').amountZar).toBe(95.48); // 4400 × 2.17 c = 9548 c
  });
});

describe('calculateTariff — traction energy', () => {
  const diesel = (over: Record<string, unknown> = {}) => ({ type: 'DIESEL' as const, litres: 1000, ...over });

  it('is not charged unless asked for', () => {
    expect(calculateTariff(req(), ctx()).lines.some((l) => l.kind === 'TRACTION_ENERGY')).toBe(false);
  });

  it('diesel with nothing else given uses the brief\'s BASE price, flags it, and never calls it a pump price', () => {
    const r = calculateTariff(req({ traction: diesel() }), ctx());
    expect(line(r, 'TRACTION_ENERGY')).toMatchObject({ quantity: 1000, unit: 'L', rate: 24.64, rateUnit: 'ZAR/L', amountZar: 24_640 });
    expect(line(r, 'TRACTION_ENERGY').evidence.join(' ')).toMatch(/diesel BASE price R24\.64\/L \[BRIEF\].*not today's pump price/);
    expect(r.warnings.join(' ')).toMatch(/BASE of R24\.64\/L, not a contracted or pump price/);
    expect(r.status).toBe('PRICED');
  });

  it('a price on the schedule replaces the base; a price entered with the request replaces both', () => {
    const onSchedule = calculateTariff(req({ traction: diesel() }), ctx({ schedules: [sched({ dieselPricePerLitreZar: 22.5 })] }));
    expect(line(onSchedule, 'TRACTION_ENERGY')).toMatchObject({ rate: 22.5, amountZar: 22_500 });
    expect(onSchedule.warnings.join(' ')).not.toMatch(/BASE/);
    const explicit = calculateTariff(req({ traction: diesel({ pricePerUnitZar: 26.1 }) }), ctx({ schedules: [sched({ dieselPricePerLitreZar: 22.5 })] }));
    expect(line(explicit, 'TRACTION_ENERGY')).toMatchObject({ rate: 26.1, amountZar: 26_100 });
    expect(line(explicit, 'TRACTION_ENERGY').evidence).toEqual(['price entered with the request']);
  });

  it('does not round the PRICE to cents before multiplying (R24.6431/L × 1000 L)', () => {
    const r = calculateTariff(req({ traction: diesel({ pricePerUnitZar: 24.6431 }) }), ctx());
    expect(line(r, 'TRACTION_ENERGY').amountZar).toBe(24_643.1);
  });

  it('derives litres from a loaded consumption factor: 40 L per 1000 GTK × 16200 GTK = 648 L', () => {
    const r = calculateTariff(req({ traction: { type: 'DIESEL' } }), ctx({ schedules: [sched({ dieselLitresPer1000Gtk: 40 })] }));
    expect(line(r, 'TRACTION_ENERGY')).toMatchObject({ quantity: 648, amountZar: 15_966.72 });
    expect(line(r, 'TRACTION_ENERGY').basis).toMatch(/40 L per 1000 GTK × 16200 GTK = 648 L/);
  });

  it('litres entered beat a loaded factor', () => {
    const r = calculateTariff(req({ traction: diesel({ litres: 500 }) }), ctx({ schedules: [sched({ dieselLitresPer1000Gtk: 40 })] }));
    expect(line(r, 'TRACTION_ENERGY').quantity).toBe(500);
  });

  it('with no litres and no factor the quantity is unknown: UNPRICED, INCOMPLETE — not zero', () => {
    const r = calculateTariff(req({ traction: { type: 'DIESEL' } }), ctx());
    expect(line(r, 'TRACTION_ENERGY')).toMatchObject({ quantity: null, amountZar: null });
    expect(r.status).toBe('INCOMPLETE');
    expect(r.subtotalZar).toBe(810);
  });

  it('diesel is NOT escalated (the brief gives a base price, not an escalator, for diesel)', () => {
    const r = calculateTariff(req({ traction: diesel(), allowEscalation: true }), ctx({ schedules: [sched({ financialYear: '2025/26' })] }));
    expect(line(r, 'TRACTION_ENERGY').rate).toBe(24.64);
  });

  it('electric traction has NO default price (the brief gives only an escalator): unpriced unless a price is loaded or entered', () => {
    const none = calculateTariff(req({ traction: { type: 'ELECTRIC', kWh: 1000 } }), ctx());
    expect(line(none, 'TRACTION_ENERGY')).toMatchObject({ quantity: 1000, unit: 'kWh', rate: null, amountZar: null });
    expect(none.status).toBe('INCOMPLETE');
    expect(line(none, 'TRACTION_ENERGY').basis).toMatch(/no electricity price is loaded.*4\.42% escalation, not a price/);
    const loaded = calculateTariff(req({ traction: { type: 'ELECTRIC', kWh: 1000 } }), ctx({ schedules: [sched({ electricityPricePerKwhZar: 1.5 })] }));
    expect(line(loaded, 'TRACTION_ENERGY')).toMatchObject({ rate: 1.5, amountZar: 1500 });
    const entered = calculateTariff(req({ traction: { type: 'ELECTRIC', kWh: 1000, pricePerUnitZar: 1.8 } }), ctx());
    expect(line(entered, 'TRACTION_ENERGY')).toMatchObject({ rate: 1.8, amountZar: 1800 });
  });

  it('a loaded electricity price is escalated by 4.42% a year when escalation applies — an entered price is not', () => {
    const base = ctx({ schedules: [sched({ financialYear: '2025/26', electricityPricePerKwhZar: 1.5 })] });
    const esc = calculateTariff(req({ traction: { type: 'ELECTRIC', kWh: 1000 }, allowEscalation: true }), base);
    expect(line(esc, 'TRACTION_ENERGY').rate).toBeCloseTo(1.5 * 1.0442, 10);
    expect(line(esc, 'TRACTION_ENERGY').amountZar).toBe(1566.3);
    expect(esc.warnings.join(' ')).toMatch(/electricity price is from the 2025\/26 schedule, escalated 1 year\(s\) by 4\.42% a year/);
    const entered = calculateTariff(req({ traction: { type: 'ELECTRIC', kWh: 1000, pricePerUnitZar: 1.5 }, allowEscalation: true }), base);
    expect(line(entered, 'TRACTION_ENERGY').amountZar).toBe(1500);
  });

  it('electric kWh can come from a loaded factor', () => {
    const r = calculateTariff(req({ traction: { type: 'ELECTRIC', pricePerUnitZar: 2 } }), ctx({ schedules: [sched({ electricKwhPer1000Gtk: 30 })] }));
    expect(line(r, 'TRACTION_ENERGY')).toMatchObject({ quantity: 486, amountZar: 972 });
  });
});

describe('calculateTariff — Annexure 40 ancillary services', () => {
  const catalog = [
    anc({ code: 'ANX40-01', priceStatus: 'PUBLISHED', unitRateZar: 12.5, name: 'Shunting', serviceName: 'Shunting' }),
    anc({ code: 'ANX40-02', priceStatus: 'TBD', name: 'Staging', serviceName: 'Staging' }),
    anc({ code: 'ANX40-03', priceStatus: 'NOT_PUBLISHED', name: 'Handling', serviceName: 'Handling' }),
  ];

  it('a PUBLISHED rate is multiplied by the quantity: 3 × R12.50 = R37.50', () => {
    const r = calculateTariff(req({ ancillary: [{ code: 'ANX40-01', quantity: 3 }] }), ctx({ ancillaryCatalog: catalog }));
    expect(line(r, 'ANCILLARY')).toMatchObject({ code: 'ANX40-01', quantity: 3, rate: 12.5, amountZar: 37.5, unit: 'Per wagon movement' });
    expect(r.subtotalZar).toBe(847.5);
    expect(r.status).toBe('PRICED');
  });

  it('"TBD" is not zero and not free: the line is UNPRICED and the calculation INCOMPLETE', () => {
    const r = calculateTariff(req({ ancillary: [{ code: 'ANX40-02', quantity: 1 }] }), ctx({ ancillaryCatalog: catalog }));
    expect(line(r, 'ANCILLARY')).toMatchObject({ code: 'ANX40-02', amountZar: null, rate: null });
    expect(line(r, 'ANCILLARY').basis).toMatch(/says "TBD".*not zero and not free/);
    expect(r.status).toBe('INCOMPLETE');
    expect(r.subtotalZar).toBe(810);
    expect(r.blockers[0]).toMatch(/ANX40-02/);
  });

  it('a service the annexure lists without a price is unpriced too', () => {
    const r = calculateTariff(req({ ancillary: [{ code: 'ANX40-03', quantity: 1 }] }), ctx({ ancillaryCatalog: catalog }));
    expect(line(r, 'ANCILLARY').basis).toMatch(/publishes no price/);
    expect(r.status).toBe('INCOMPLETE');
  });

  it('a PUBLISHED line with no rate is still unpriced (the status alone is not a price)', () => {
    const r = calculateTariff(req({ ancillary: [{ code: 'ANX40-09', quantity: 1 }] }), ctx({ ancillaryCatalog: [anc({ code: 'ANX40-09', priceStatus: 'PUBLISHED', unitRateZar: null })] }));
    expect(line(r, 'ANCILLARY').amountZar).toBeNull();
  });

  it('an unknown code or a non-positive quantity is a mistake in the request: BLOCKED', () => {
    expect(calculateTariff(req({ ancillary: [{ code: 'ANX40-99', quantity: 1 }] }), ctx({ ancillaryCatalog: catalog })).blockers.join(' ')).toMatch(/"ANX40-99" is not an Annexure 40 service code/);
    for (const quantity of [0, -1, NaN]) {
      const r = calculateTariff(req({ ancillary: [{ code: 'ANX40-01', quantity }] }), ctx({ ancillaryCatalog: catalog }));
      expect(r.status).toBe('BLOCKED');
      expect(r.blockers.join(' ')).toMatch(/quantity for ANX40-01 must be greater than zero/);
    }
  });

  it('prices several lines together', () => {
    const r = calculateTariff(req({ ancillary: [{ code: 'ANX40-01', quantity: 2 }, { code: 'ANX40-01', quantity: 1 }] }), ctx({ ancillaryCatalog: catalog }));
    expect(r.lines.filter((l) => l.kind === 'ANCILLARY').map((l) => l.amountZar)).toEqual([25, 12.5]);
    expect(r.subtotalZar).toBe(847.5);
  });

  it('works against the REAL Annexure 40 catalogue: 113 lines, none priced, so any of them is unpriced', () => {
    expect(ANCILLARY_SERVICE_CATALOG).toHaveLength(113);
    const real = ANCILLARY_SERVICE_CATALOG[0];
    const r = calculateTariff(req({ ancillary: [{ code: real.code, quantity: 1 }] }), ctx({ ancillaryCatalog: ANCILLARY_SERVICE_CATALOG as never }));
    expect(line(r, 'ANCILLARY').amountZar).toBeNull();
    expect(r.status).toBe('INCOMPLETE');
  });
});

describe('calculateTariff — the weighbridge overload penalty line', () => {
  const over = (wagonNumber: string, excessTonnes: number, createdAt = '2026-10-02T08:00:00Z') => reading(wagonNumber, 100, { status: 'OVERLOADED', excessTonnes, createdAt });

  it('an overloaded wagon adds a penalty line and the hold; with no penalty rate loaded it is UNPRICED', () => {
    const r = calculateTariff(req(), ctx({ latestReadings: [over('W1', 3.2)] }));
    expect(r.hold).toMatchObject({ held: true, totalExcessTonnes: 3.2 });
    expect(line(r, 'OVERLOAD_PENALTY')).toMatchObject({ quantity: 3.2, unit: 't over the limit', rate: null, amountZar: null });
    expect(line(r, 'OVERLOAD_PENALTY').basis).toMatch(/3\.2 t over the limit \(W1 3\.2 t\); no overload penalty rate is loaded/);
    expect(r.status).toBe('INCOMPLETE');
  });

  it('with a loaded rate it is priced: 3.7 t × R100/t = R370.00', () => {
    const r = calculateTariff(req(), ctx({ latestReadings: [over('W1', 3.2), over('W2', 0.5)], schedules: [sched({ overloadPenaltyPerTonneZar: 100 })] }));
    expect(line(r, 'OVERLOAD_PENALTY')).toMatchObject({ quantity: 3.7, rate: 100, amountZar: 370 });
    expect(r.status).toBe('PRICED');
    // both wagons were weighed at 100 t (the fixture), so the GTK charge is 200 t × 100 km × 5 c = R1,000.00; plus R370.00
    expect(line(r, 'GTK_LOADED').amountZar).toBe(1000);
    expect(r.subtotalZar).toBe(1370);
    expect(line(r, 'OVERLOAD_PENALTY').evidence[0]).toMatch(/actual tonnes > max axle load × axles/);
  });

  it('the overloaded wagon\'s weighbridge mass is what the GTK charge uses', () => {
    const r = calculateTariff(req(), ctx({ latestReadings: [over('W1', 3.2)] })); // reading() above weighs 100 t
    expect(r.weightSources[0]).toMatchObject({ source: 'WEIGHBRIDGE', grossTonnes: 100 });
  });

  it('no penalty line once every wagon is back within its limit — but the earlier overload is surfaced for a decision', () => {
    const r = calculateTariff(req(), ctx({ latestReadings: [reading('W1', 80)], correctedOverloads: [{ wagonNumber: 'W1', excessTonnes: 3.2 }] }));
    expect(r.lines.some((l) => l.kind === 'OVERLOAD_PENALTY')).toBe(false);
    expect(r.hold.held).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/W1 was recorded 3\.2 t over its limit and later re-weighed within it.*Confirm whether the tariff charges an overload that was corrected/);
  });

  it('the penalty rate is NOT escalated, and the warning says so', () => {
    const r = calculateTariff(req({ allowEscalation: true }), ctx({ latestReadings: [over('W1', 2)], schedules: [sched({ financialYear: '2025/26', overloadPenaltyPerTonneZar: 50 })] }));
    expect(line(r, 'OVERLOAD_PENALTY').amountZar).toBe(100);
    expect(r.warnings.join(' ')).toMatch(/overload penalty rate is from the 2025\/26 schedule and was NOT escalated/);
  });

  it('is not reached at all when the corridor cannot be priced (BLOCKED has no lines)', () => {
    const r = calculateTariff(req(), ctx({ schedules: [], latestReadings: [over('W1', 3.2)] }));
    expect(r.status).toBe('BLOCKED');
    expect(r.lines).toEqual([]);
    expect(r.hold.held).toBe(true); // the hold itself does not depend on a tariff
  });
});

describe('calculateTariff — status', () => {
  it('PRICED only when every requested line has an amount; INCOMPLETE otherwise, with a reason per unpriced line', () => {
    const r = calculateTariff(
      req({ includeEmptyReturn: true, traction: { type: 'ELECTRIC', kWh: 10 }, ancillary: [{ code: 'ANX40-02', quantity: 1 }] }),
      ctx({ schedules: [sched({ emptyCentsPerGtk: null })], ancillaryCatalog: [anc({ code: 'ANX40-02', priceStatus: 'TBD' })] }),
    );
    expect(r.status).toBe('INCOMPLETE');
    expect(r.blockers).toHaveLength(3);
    expect(r.lines.filter((l) => l.amountZar === null)).toHaveLength(3);
    expect(r.subtotalZar).toBe(810);
  });

  it('the subtotal is the sum of the PRICED lines only, exact to the cent', () => {
    const r = calculateTariff(req({ includeEmptyReturn: true, traction: { type: 'DIESEL', litres: 3, pricePerUnitZar: 0.1 } }), ctx());
    expect(r.subtotalZar).toBe(898.3);
  });
});
