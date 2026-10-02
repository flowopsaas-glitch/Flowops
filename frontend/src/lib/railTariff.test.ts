import { describe, it, expect } from 'vitest';
import { formatMoney } from './currency';
import {
  LIMIT_SOURCE_LABEL, LINE_KIND_LABEL, OVERLOAD_LABEL, PRICE_STATUS_LABEL, TARIFF_STATUS_LABEL, buildTariffRequest, buildWeighbridgeDraft,
  canGenerateInvoiceDraft, currentReadingIds, describeLimit, emptyTariffForm, emptyWeighbridgeForm, fmtNum, fmtQuantity, fmtRate, groupAncillary,
  invoiceDraftNote, isOnHold, lineAmountText, overloadTone, priceStatusTone, tariffFormErrors, tariffFormKey, tariffStatusTone, unpricedLineCount,
  weighbridgeFormErrors, zar, type TariffFormState,
} from './railTariff';
import type { AncillaryService, SavedCalculation, TariffLine } from '../api/railTariffApi';

const line = (over: Partial<TariffLine> = {}): TariffLine => ({
  kind: 'GTK_LOADED', description: 'Infrastructure access', quantity: 100, unit: 'GTK', rate: 12.5, rateUnit: 'c/GTK', amountZar: 12.5, basis: 'b', evidence: [], ...over,
});

describe('an unpriced line is NEVER shown as zero', () => {
  it('the shared formatter would print a missing amount as zero — which is exactly why lineAmountText exists', () => {
    expect(formatMoney(null, 'ZAR')).toMatch(/0/); // the trap
  });
  it('null ⇒ "Not priced"', () => {
    expect(lineAmountText({ amountZar: null })).toBe('Not priced');
    expect(lineAmountText({ amountZar: null })).not.toMatch(/\d/);
  });
  it.each([[undefined], [Number.NaN], [Number.POSITIVE_INFINITY]])('%p ⇒ "Not priced"', (v) => {
    expect(lineAmountText({ amountZar: v as unknown as number })).toBe('Not priced');
  });
  it('a real amount is money — including a genuine R0, which is a price, not an absence of one', () => {
    expect(lineAmountText({ amountZar: 1234.5 })).toBe(formatMoney(1234.5, 'ZAR'));
    expect(lineAmountText({ amountZar: 0 })).toBe(formatMoney(0, 'ZAR'));
    expect(lineAmountText({ amountZar: 0 })).not.toBe('Not priced');
  });
  it('counts the unpriced lines', () => {
    expect(unpricedLineCount([line(), line({ amountZar: null }), line({ amountZar: null }), line({ amountZar: 0 })])).toBe(2);
    expect(unpricedLineCount([])).toBe(0);
  });
  it('zar is the platform formatter in rand', () => expect(zar(10)).toBe(formatMoney(10, 'ZAR')));
});

describe('number formatting', () => {
  it('fmtNum: up to the given decimals, "—" for nothing', () => {
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(undefined)).toBe('—');
    expect(fmtNum(Number.NaN)).toBe('—');
    expect(fmtNum(12.34567)).toBe(fmtNum(12.346));
    expect(fmtNum(12.34567, 4)).not.toBe(fmtNum(12.34567, 1));
    expect(fmtNum(5)).toBe('5');
  });
  it('quantity and rate read naturally, and say so when there is no rate or quantity', () => {
    expect(fmtQuantity({ quantity: 5, unit: 'GTK' })).toBe('5 GTK');
    expect(fmtQuantity({ quantity: null, unit: 'L' })).toBe('—');
    expect(fmtRate({ rate: 12.5, rateUnit: 'c/GTK' })).toBe('12,5 c/GTK'.replace(',', fmtNum(1.5).includes(',') ? ',' : '.'));
    expect(fmtRate({ rate: null, rateUnit: null })).toBe('no rate loaded');
  });
});

describe('labels are complete', () => {
  it('every status, line kind, price status, overload status and limit source has wording and a tone', () => {
    for (const s of ['PRICED', 'INCOMPLETE', 'BLOCKED'] as const) { expect(TARIFF_STATUS_LABEL[s]).toBeTruthy(); expect(tariffStatusTone(s)).toBeTruthy(); }
    for (const k of ['GTK_LOADED', 'GTK_EMPTY', 'TRACTION_ENERGY', 'ANCILLARY', 'OVERLOAD_PENALTY'] as const) expect(LINE_KIND_LABEL[k]).toBeTruthy();
    for (const p of ['NOT_PUBLISHED', 'TBD', 'PUBLISHED'] as const) { expect(PRICE_STATUS_LABEL[p]).toBeTruthy(); expect(priceStatusTone(p)).toBeTruthy(); }
    for (const o of ['WITHIN_LIMIT', 'OVERLOADED', 'UNVERIFIED'] as const) { expect(OVERLOAD_LABEL[o]).toBeTruthy(); expect(overloadTone(o)).toBeTruthy(); }
    for (const l of ['CORRIDOR', 'MANUAL', 'NONE'] as const) expect(LIMIT_SOURCE_LABEL[l]).toBeTruthy();
  });
  it('colours mean what they say: blocked is red, incomplete amber, priced green; overloaded red; unverified amber — never green', () => {
    expect(tariffStatusTone('BLOCKED')).toBe('danger');
    expect(tariffStatusTone('INCOMPLETE')).toBe('warn');
    expect(tariffStatusTone('PRICED')).toBe('ok');
    expect(overloadTone('OVERLOADED')).toBe('danger');
    expect(overloadTone('UNVERIFIED')).toBe('warn');
    expect(overloadTone('UNVERIFIED')).not.toBe('ok');
  });
  it('TBD is spelt out as "not zero, not free"', () => {
    expect(PRICE_STATUS_LABEL.TBD).toMatch(/not zero, not free/);
    expect(priceStatusTone('TBD')).toBe('warn');
  });
  it('isOnHold is true only for the hold status', () => {
    expect(isOnHold({ holdStatus: 'HOLD_FOR_LOAD_ADJUSTMENT' })).toBe(true);
    expect(isOnHold({ holdStatus: 'NONE' })).toBe(false);
    expect(isOnHold({})).toBe(false);
    expect(isOnHold({ holdStatus: null })).toBe(false);
  });
});

describe('invoice draft eligibility', () => {
  const calc = (over: Partial<SavedCalculation> = {}): SavedCalculation => ({
    id: 'tc1', calculationNumber: 'TC-2026-00001', consignmentId: 'c1', consignmentNumber: 'RAIL-1', corridorCode: 'COR-ORE', financialYear: '2026/27', status: 'PRICED',
    lines: [line()], blockers: [], warnings: [], gtkLoaded: 1, gtkEmpty: null, subtotalZar: 12.5, currency: 'ZAR', holdTriggered: false, invoiceDraftId: null, invoiceDraftedAt: null,
    createdAt: '2026-10-02T00:00:00Z', ...over,
  });

  it('offered for a fully priced calculation with no draft yet, to a writer', () => {
    expect(canGenerateInvoiceDraft(calc(), true)).toBe(true);
  });
  it('never to a read-only user', () => expect(canGenerateInvoiceDraft(calc(), false)).toBe(false));
  it('never for an INCOMPLETE calculation', () => {
    expect(canGenerateInvoiceDraft(calc({ status: 'INCOMPLETE' }), true)).toBe(false);
  });
  it('never while any line is unpriced — even if the status field said PRICED', () => {
    expect(canGenerateInvoiceDraft(calc({ lines: [line(), line({ amountZar: null })] }), true)).toBe(false);
  });
  it('not again once a draft exists (idempotent: one click, one draft)', () => {
    expect(canGenerateInvoiceDraft(calc({ invoiceDraftId: 'rail-draft-tc1' }), true)).toBe(false);
  });
  it('explains an existing draft, an incomplete calculation, and says nothing when the button is on offer', () => {
    expect(invoiceDraftNote(calc({ invoiceDraftId: 'd', invoiceDraftedAt: '2026-10-03T08:00:00Z' }))).toBe('Invoice draft created 2026-10-03.');
    expect(invoiceDraftNote(calc({ invoiceDraftId: 'd' }))).toBe('Invoice draft created.');
    expect(invoiceDraftNote(calc({ status: 'INCOMPLETE', lines: [line({ amountZar: null }), line({ amountZar: null })], blockers: ['x', 'y'] }))).toMatch(/^2 line\(s\) have no rate, so no invoice draft can be made/);
    expect(invoiceDraftNote(calc())).toBeNull();
  });
});

describe('tariff form', () => {
  const valid = (over: Partial<TariffFormState> = {}): TariffFormState => ({ ...emptyTariffForm(), consignmentId: 'c1', distanceKm: '850', ...over });

  it('a consignment and a distance are the minimum', () => {
    expect(tariffFormErrors(valid())).toEqual({});
    expect(tariffFormErrors(emptyTariffForm())).toEqual({ consignmentId: 'Choose a consignment.', distanceKm: 'Distance is required.' });
  });

  it.each([
    ['0', /between 0.1 and 10000/], ['0.05', /between 0.1 and 10000/], ['10001', /between 0.1 and 10000/],
    ['abc', /digits and a decimal point only/], ['1e3', /digits and a decimal point only/], ['-5', /digits and a decimal point only/],
    ['1,5', /digits and a decimal point only/], ['Infinity', /digits and a decimal point only/], ['  ', /required/],
  ])('rejects the distance %p', (d, msg) => {
    expect(tariffFormErrors(valid({ distanceKm: d })).distanceKm).toMatch(msg);
  });
  it.each(['0.1', '850', '850.5', '10000'])('accepts the distance %s', (d) => expect(tariffFormErrors(valid({ distanceKm: d })).distanceKm).toBeUndefined());

  it('the financial year is optional, but when given must look like 2026/27', () => {
    expect(tariffFormErrors(valid({ financialYear: '' })).financialYear).toBeUndefined();
    expect(tariffFormErrors(valid({ financialYear: '2026/27' })).financialYear).toBeUndefined();
    for (const bad of ['2026', '26/27', '2026-27', '2026/2027']) expect(tariffFormErrors(valid({ financialYear: bad })).financialYear).toMatch(/2026\/27/);
  });

  it('traction quantities and the price are optional, but must be sane numbers when given', () => {
    expect(tariffFormErrors(valid({ traction: 'DIESEL' }))).toEqual({});
    expect(tariffFormErrors(valid({ traction: 'DIESEL', litres: '0' })).litres).toMatch(/between 0.001/);
    expect(tariffFormErrors(valid({ traction: 'ELECTRIC', kWh: 'lots' })).kWh).toMatch(/digits/);
    expect(tariffFormErrors(valid({ traction: 'DIESEL', pricePerUnit: '0' })).pricePerUnit).toMatch(/between 0.0001/);
    // a stale value in a field that no longer applies is not validated
    expect(tariffFormErrors(valid({ traction: 'NONE', litres: 'junk', pricePerUnit: 'junk' }))).toEqual({});
    expect(tariffFormErrors(valid({ traction: 'ELECTRIC', litres: 'junk' }))).toEqual({});
  });

  it('every ancillary service needs a quantity above zero, and there are at most 50', () => {
    expect(tariffFormErrors(valid({ ancillary: [{ code: 'ANX40-04', quantity: '2' }] }))).toEqual({});
    expect(tariffFormErrors(valid({ ancillary: [{ code: 'ANX40-04', quantity: '' }] })).ancillary).toMatch(/Quantity for ANX40-04 is required/);
    expect(tariffFormErrors(valid({ ancillary: [{ code: 'ANX40-04', quantity: '0' }] })).ancillary).toMatch(/between 0.001/);
    expect(tariffFormErrors(valid({ ancillary: Array.from({ length: 51 }, (_, i) => ({ code: `ANX40-${String(i).padStart(2, '0')}`, quantity: '1' })) })).ancillary).toMatch(/At most 50/);
  });

  describe('buildTariffRequest', () => {
    it('the minimum request is just the consignment and the distance — no zeros, no defaults', () => {
      expect(buildTariffRequest(valid())).toEqual({ consignmentId: 'c1', distanceKm: 850 });
    });
    it('options are sent only when switched on', () => {
      const r = buildTariffRequest(valid({ includeEmptyReturn: true, allowEscalation: true, financialYear: ' 2027/28 ' }));
      expect(r).toEqual({ consignmentId: 'c1', distanceKm: 850, financialYear: '2027/28', includeEmptyReturn: true, allowEscalation: true });
      const off = buildTariffRequest(valid({ includeEmptyReturn: false, allowEscalation: false }));
      expect(off).not.toHaveProperty('includeEmptyReturn');
      expect(off).not.toHaveProperty('allowEscalation');
    });
    it('diesel: litres and price only when entered (otherwise the server uses the loaded factor / the brief\'s base and says so)', () => {
      expect(buildTariffRequest(valid({ traction: 'DIESEL' })).traction).toEqual({ type: 'DIESEL' });
      expect(buildTariffRequest(valid({ traction: 'DIESEL', litres: '1200', pricePerUnit: '24.64' })).traction).toEqual({ type: 'DIESEL', litres: 1200, pricePerUnitZar: 24.64 });
    });
    it('electric: kWh and price only when entered; litres never leak across', () => {
      expect(buildTariffRequest(valid({ traction: 'ELECTRIC', kWh: '5000', litres: '999' })).traction).toEqual({ type: 'ELECTRIC', kWh: 5000 });
      expect(buildTariffRequest(valid({ traction: 'NONE', litres: '999' }))).not.toHaveProperty('traction');
    });
    it('ancillary services carry their quantity as a number', () => {
      expect(buildTariffRequest(valid({ ancillary: [{ code: 'ANX40-04-02', quantity: '3.5' }, { code: 'ANX40-01', quantity: '1' }] })).ancillary).toEqual([
        { code: 'ANX40-04-02', quantity: 3.5 }, { code: 'ANX40-01', quantity: 1 },
      ]);
    });
    it('a rate is NEVER part of the request — the browser cannot name a price', () => {
      const json = JSON.stringify(buildTariffRequest(valid({ traction: 'DIESEL', litres: '10', includeEmptyReturn: true, ancillary: [{ code: 'ANX40-01', quantity: '1' }] })));
      for (const k of ['centsPerGtk', 'rate', 'amount', 'subtotal', 'loadedCentsPerGtk', 'unitRate']) expect(json).not.toContain(k);
    });
  });

  it('the form key changes with every input, so a stale preview is always detected', () => {
    const base = valid();
    const k = tariffFormKey(base);
    const variants: Partial<TariffFormState>[] = [
      { consignmentId: 'c2' }, { distanceKm: '851' }, { financialYear: '2027/28' }, { includeEmptyReturn: true }, { allowEscalation: true }, { traction: 'DIESEL' },
      { litres: '1' }, { kWh: '1' }, { pricePerUnit: '1' }, { ancillary: [{ code: 'ANX40-01', quantity: '1' }] },
    ];
    for (const v of variants) expect(tariffFormKey({ ...base, ...v })).not.toBe(k);
    expect(tariffFormKey(valid())).toBe(k);
  });
});

describe('groupAncillary — the 113 lines under their 40 services', () => {
  const svc = (code: string, serviceNumber: number, serviceName: string, name: string, over: Partial<AncillaryService> = {}): AncillaryService => ({
    code, name, serviceName, unitOfMeasure: 'each', priceStatus: 'NOT_PUBLISHED', unitRateZar: null, serviceNumber, tier: 1, tierName: 'Tier 1', group: 'RAIL', isCompulsory: false,
    description: null, section: null, sourceLabel: null, rateSourceRef: null, fromCatalog: true, ...over,
  });
  const all = [
    svc('ANX40-04-02', 4, 'Shunting', 'Hourly shunt'), svc('ANX40-01', 1, 'Track access', 'Access'), svc('ANX40-04-01', 4, 'Shunting', 'Per wagon'),
    svc('ANX40-02', 2, 'Weighbridge', 'Weighing', { section: 'Section 7' }),
  ];

  it('groups by service, in service order, with the lines in code order', () => {
    const g = groupAncillary(all);
    expect(g.map((x) => x.serviceNumber)).toEqual([1, 2, 4]);
    expect(g[2].lines.map((l) => l.code)).toEqual(['ANX40-04-01', 'ANX40-04-02']);
    expect(g[2]).toMatchObject({ serviceName: 'Shunting', tierName: 'Tier 1' });
  });
  it('filters on code, name, service name and section, ignoring case', () => {
    expect(groupAncillary(all, 'shunt').flatMap((g) => g.lines.map((l) => l.code))).toEqual(['ANX40-04-01', 'ANX40-04-02']);
    expect(groupAncillary(all, 'ANX40-02').map((g) => g.serviceNumber)).toEqual([2]);
    expect(groupAncillary(all, 'section 7').map((g) => g.serviceNumber)).toEqual([2]);
    expect(groupAncillary(all, 'HOURLY').flatMap((g) => g.lines.map((l) => l.code))).toEqual(['ANX40-04-02']);
  });
  it('no match is an empty list; a blank query shows everything; the input is not mutated', () => {
    expect(groupAncillary(all, 'zzz')).toEqual([]);
    expect(groupAncillary(all, '   ')).toHaveLength(3);
    expect(all.map((a) => a.code)).toEqual(['ANX40-04-02', 'ANX40-01', 'ANX40-04-01', 'ANX40-02']);
  });
});

describe('weighbridge form', () => {
  const ok = (over: Record<string, string> = {}) => ({ ...emptyWeighbridgeForm(), wagonNumber: 'MNR-000001', actualTonnes: '104', ...over });

  it('a wagon and a gross mass are the minimum', () => {
    expect(weighbridgeFormErrors(ok())).toEqual({});
    expect(weighbridgeFormErrors(emptyWeighbridgeForm())).toEqual({ wagonNumber: 'Choose a wagon.', actualTonnes: 'Gross mass is required.' });
  });
  it.each([['0', /between 0.001 and 1000/], ['1001', /between 0.001 and 1000/], ['heavy', /digits/], ['-1', /digits/]])('rejects the mass %p', (m, msg) => {
    expect(weighbridgeFormErrors(ok({ actualTonnes: m })).actualTonnes).toMatch(msg);
  });
  it('axles: optional, a whole number 1–12', () => {
    expect(weighbridgeFormErrors(ok({ axles: '4' })).axles).toBeUndefined();
    for (const bad of ['0', '13', '2.5', 'four', '-1']) expect(weighbridgeFormErrors(ok({ axles: bad })).axles).toMatch(/whole number from 1 to 12/);
  });
  it('an entered axle limit is optional, 0.1–60', () => {
    expect(weighbridgeFormErrors(ok({ maxAxleLoadTonnes: '26' })).maxAxleLoadTonnes).toBeUndefined();
    expect(weighbridgeFormErrors(ok({ maxAxleLoadTonnes: '61' })).maxAxleLoadTonnes).toMatch(/between 0.1 and 60/);
    expect(weighbridgeFormErrors(ok({ maxAxleLoadTonnes: '0' })).maxAxleLoadTonnes).toMatch(/between 0.1 and 60/);
  });
  it('text lengths are bounded', () => {
    expect(weighbridgeFormErrors(ok({ weighbridge: 'x'.repeat(121) })).weighbridge).toMatch(/120/);
    expect(weighbridgeFormErrors(ok({ note: 'x'.repeat(1001) })).note).toMatch(/1000/);
  });
  it('the draft carries the mass as a number and omits what was left blank — it never sends a verdict', () => {
    expect(buildWeighbridgeDraft('c1', ok())).toEqual({ consignmentId: 'c1', wagonNumber: 'MNR-000001', actualTonnes: 104 });
    expect(buildWeighbridgeDraft('c1', ok({ axles: '4', maxAxleLoadTonnes: '26', weighbridge: ' Hotazel WB1 ', note: ' re-weigh ' }))).toEqual({
      consignmentId: 'c1', wagonNumber: 'MNR-000001', actualTonnes: 104, axles: 4, maxAxleLoadTonnes: 26, weighbridge: 'Hotazel WB1', note: 're-weigh',
    });
    const json = JSON.stringify(buildWeighbridgeDraft('c1', ok({ axles: '4' })));
    for (const k of ['status', 'OVERLOADED', 'excess', 'hold', 'allowed']) expect(json).not.toContain(k);
  });
});

describe('weighbridge display helpers', () => {
  it('describeLimit: the arithmetic and where the limit came from — or why the reading was not judged', () => {
    expect(describeLimit({ maxAxleLoadTonnes: 26, axles: 4, allowedTonnes: 104, limitSource: 'CORRIDOR' })).toBe(`${fmtNum(26)} t × 4 axles = ${fmtNum(104)} t (verified corridor limit)`);
    expect(describeLimit({ maxAxleLoadTonnes: 20, axles: 1, allowedTonnes: 20, limitSource: 'MANUAL' })).toContain('1 axle =');
    expect(describeLimit({ maxAxleLoadTonnes: 20, axles: 1, allowedTonnes: 20, limitSource: 'MANUAL' })).toContain('limit entered with the reading');
    expect(describeLimit({ maxAxleLoadTonnes: null, axles: 4, allowedTonnes: null, limitSource: 'NONE' })).toBe('no limit known — not judged');
    expect(describeLimit({ maxAxleLoadTonnes: 26, axles: null, allowedTonnes: null, limitSource: 'CORRIDOR' })).toBe('axle count unknown — not judged');
  });

  it('currentReadingIds: the most recently RECORDED reading of each wagon', () => {
    const r = (id: string, wagonNumber: string, createdAt: string) => ({ id, wagonNumber, createdAt });
    const ids = currentReadingIds([
      r('b2', 'W-B', '2026-10-02T10:00:00Z'), r('a2', 'W-A', '2026-10-02T09:00:00Z'), r('a1', 'W-A', '2026-10-02T08:00:00Z'), r('b1', 'W-B', '2026-10-02T07:00:00Z'),
    ]);
    expect([...ids].sort()).toEqual(['a2', 'b2']);
  });
  it('currentReadingIds does not depend on the order of the list', () => {
    const r = (id: string, wagonNumber: string, createdAt: string) => ({ id, wagonNumber, createdAt });
    const ids = currentReadingIds([r('a1', 'W-A', '2026-10-02T08:00:00Z'), r('a2', 'W-A', '2026-10-02T09:00:00Z')]);
    expect([...ids]).toEqual(['a2']);
  });
  it('a tie goes to the reading listed first (the API lists newest first)', () => {
    const r = (id: string, wagonNumber: string, createdAt: string) => ({ id, wagonNumber, createdAt });
    expect([...currentReadingIds([r('first', 'W-A', '2026-10-02T08:00:00Z'), r('second', 'W-A', '2026-10-02T08:00:00Z')])]).toEqual(['first']);
    expect(currentReadingIds([]).size).toBe(0);
  });
});
