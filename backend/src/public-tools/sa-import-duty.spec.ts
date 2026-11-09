import { estimateImportDuty, SA_IMPORT_UPLIFTMENT, SA_VAT_RATE } from './sa-import-duty';
import { findHsCode, HS_CODES, HS_DISCLAIMER, searchHsCodes } from './hs-codes.data';

/**
 * The arithmetic behind the public landed-cost calculator.
 *
 * These are the tests that matter most in this module. The calculator is
 * public, unauthenticated and aimed at people who will check the answer
 * against their own broker's figure — so a wrong formula is not a bug, it is
 * a credibility problem that reaches people who were never clients.
 *
 * The 10% ATV upliftment is the thing most likely to be "simplified" away by
 * a future edit, so it is pinned directly and by worked example.
 */

describe('estimateImportDuty', () => {
  it('uses the SA Added Tax Value, not the bare customs value', () => {
    // R10,000 value, no duty. Naive would be VAT on 10,000 = 1,500.
    // Correct: ATV = 10,000 x 1.10 = 11,000, VAT = 1,650.
    const r = estimateImportDuty([{ customsValue: 10_000, dutyRatePct: 0 }]);

    expect(r.lines[0].atv).toBe(11_000);
    expect(r.lines[0].vat).toBe(1_650);
    expect(r.lines[0].duty).toBe(0);
    expect(r.lines[0].totalPayable).toBe(1_650);
  });

  it('charges VAT on value plus duty', () => {
    // 10,000 value at 20% duty:
    //   duty = 2,000
    //   ATV  = (10,000 x 1.10) + 2,000 = 13,000
    //   VAT  = 13,000 x 0.15 = 1,950
    //   payable = 2,000 + 1,950 = 3,950
    const r = estimateImportDuty([{ customsValue: 10_000, dutyRatePct: 20 }]);

    expect(r.lines[0].duty).toBe(2_000);
    expect(r.lines[0].atv).toBe(13_000);
    expect(r.lines[0].vat).toBe(1_950);
    expect(r.lines[0].totalPayable).toBe(3_950);
  });

  it('exposes the constants the UI labels itself with', () => {
    expect(SA_VAT_RATE).toBe(0.15);
    expect(SA_IMPORT_UPLIFTMENT).toBe(0.1);
    const r = estimateImportDuty([{ customsValue: 100, dutyRatePct: 0 }]);
    expect(r.vatRatePct).toBe(15);
    expect(r.upliftmentPct).toBe(10);
    expect(r.currency).toBe('ZAR');
  });

  it('sums multiple lines and keeps totals consistent with them', () => {
    const r = estimateImportDuty([
      { customsValue: 10_000, dutyRatePct: 0 },
      { customsValue: 5_000, dutyRatePct: 20 },
    ]);

    expect(r.totals.customsValue).toBe(15_000);
    expect(r.totals.duty).toBe(1_000); // 0 + (5,000 x 20%)
    // line 1: ATV 11,000 -> VAT 1,650
    // line 2: ATV (5,000 x 1.10) + 1,000 = 6,500 -> VAT 975
    expect(r.totals.vat).toBe(2_625);
    expect(r.totals.totalPayable).toBe(3_625);

    // Totals must be the sum of the lines, not a second calculation that
    // could round differently and disagree with the table above it.
    expect(r.totals.duty).toBe(r.lines[0].duty + r.lines[1].duty);
    expect(r.totals.vat).toBe(r.lines[0].vat + r.lines[1].vat);
  });

  it('never returns NaN for blank or nonsense input', () => {
    // A public form submits empty strings. NaN in a money figure is worse
    // than zero because it propagates silently into a total.
    const r = estimateImportDuty([
      { customsValue: NaN, dutyRatePct: NaN },
      { customsValue: undefined as any, dutyRatePct: undefined as any },
      { customsValue: 'abc' as any, dutyRatePct: 'x' as any },
    ]);

    for (const line of r.lines) {
      expect(Number.isFinite(line.duty)).toBe(true);
      expect(Number.isFinite(line.vat)).toBe(true);
      expect(Number.isFinite(line.totalPayable)).toBe(true);
      expect(line.duty).toBe(0);
      expect(line.vat).toBe(0);
    }
    expect(Number.isFinite(r.totals.totalPayable)).toBe(true);
  });

  it('rounds to cents rather than leaking float error', () => {
    // ATV = 333.33 x 1.10 = 366.663 -> 366.66; VAT = 366.66 x 0.15 = 54.999
    // which must land on 55.00, not 54.99900000000001.
    const r = estimateImportDuty([{ customsValue: 333.33, dutyRatePct: 0 }]);

    expect(r.lines[0].atv).toBe(366.66);
    expect(r.lines[0].vat).toBe(55);
    expect(r.lines[0].vat).toBe(Number(r.lines[0].vat.toFixed(2)));
  });

  it('is deterministic — the same input always gives the same output', () => {
    const input = [{ customsValue: 12_345.67, dutyRatePct: 18.5 }];
    expect(estimateImportDuty(input)).toEqual(estimateImportDuty(input));
  });
});

describe('HS code reference data', () => {
  it('every entry has the fields a user needs to judge it', () => {
    for (const e of HS_CODES) {
      expect(e.code).toMatch(/^\d{4}\.\d{2}$/);
      expect(e.description.length).toBeGreaterThan(3);
      expect(e.category.length).toBeGreaterThan(0);
      expect(Number.isFinite(e.indicativeRatePct)).toBe(true);
      expect(e.indicativeRatePct).toBeGreaterThanOrEqual(0);
      expect(e.indicativeRatePct).toBeLessThanOrEqual(100);
    }
  });

  it('finds a code with or without the dot', () => {
    expect(findHsCode('8517.12')?.description).toContain('smartphones');
    expect(findHsCode('851712')?.description).toContain('smartphones');
  });

  it('searches by description as well as by code', () => {
    expect(searchHsCodes('laptop').length).toBeGreaterThan(0);
    expect(searchHsCodes('8517').length).toBeGreaterThan(0);
    expect(searchHsCodes('trousers').length).toBeGreaterThan(0);
  });

  it('returns the full set for an empty query rather than nothing', () => {
    expect(searchHsCodes('').length).toBe(HS_CODES.length);
  });

  it('always carries the disclaimer — it is the honest part', () => {
    expect(HS_DISCLAIMER).toContain('Indicative only');
    expect(HS_DISCLAIMER).toContain('SARS');
  });
});
