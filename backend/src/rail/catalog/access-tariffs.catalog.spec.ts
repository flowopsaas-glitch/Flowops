/**
 * Network Statement V4 Chapter 5 §5.2.3 — Table 17, "Rail Access Fees applicable for 2026/27".
 *
 * This is a GOLDEN TABLE transcribed from the document. Every figure is checked against the
 * published table, and the two-part structure matters: the TRIM charges BOTH a rand-per-train-km
 * component and a cents-per-GTK component (§5.2.3: "a two-part tariff where one tariff is based
 * on train kms and the other on GTKs").
 *
 * What is deliberately NOT here: a corridor mapping for the categories the document does not
 * tie to a corridor. Table 17 names two corridors in its own labels — OreCor and NorthCor. The
 * other eight are commodity groups. Inventing a corridor for "Grain & Tankers" would be guessing
 * at a rate, and a wrong access fee is money, not just a display bug.
 */
import { ACCESS_TARIFF_CATALOG, ACCESS_TARIFF_SOURCE, findAccessTariff, validateAccessTariffEntry } from './access-tariffs.catalog';

const byCat = (c: string) => ACCESS_TARIFF_CATALOG.find((r) => r.category === c)!;

describe('Network Statement V4 Chapter 5 — Table 17 access fees (2026/27)', () => {
  it('has all ten published categories, in the document\'s order', () => {
    expect(ACCESS_TARIFF_CATALOG).toHaveLength(10);
    expect(ACCESS_TARIFF_CATALOG.map((r) => r.category)).toEqual([
      'OreCor (Iron Ore)',
      'OreCor (Manganese Ore)',
      'Coal Exports NorthCor',
      'Intermodal & Motor Vehicles',
      'Mineral Exports',
      'Grain & Tankers',
      'Other General Traffic',
      'Metro Trains & Passenger < 12 Wagons',
      'Passenger Trains > 12 Wagons',
      'Loose Locomotives',
    ]);
    expect(new Set(ACCESS_TARIFF_CATALOG.map((r) => r.category)).size).toBe(10);
  });

  it('transcribes both halves of the two-part tariff exactly', () => {
    // R per train-km | cents per GTK — straight from Table 17.
    const table: Array<[string, number, number]> = [
      ['OreCor (Iron Ore)', 680, 3.54],
      ['OreCor (Manganese Ore)', 680, 5.53],
      ['Coal Exports NorthCor', 260, 6.03],
      ['Intermodal & Motor Vehicles', 30, 4.41],
      ['Mineral Exports', 30.75, 9.0],
      ['Grain & Tankers', 30, 6.96],
      ['Other General Traffic', 30, 9.5],
      ['Metro Trains & Passenger < 12 Wagons', 50, 0],
      ['Passenger Trains > 12 Wagons', 60, 0],
      ['Loose Locomotives', 12, 0],
    ];
    for (const [cat, km, gtk] of table) {
      expect(`${cat}: ${byCat(cat).zarPerTrainKm}/${byCat(cat).centsPerGtk}`).toBe(`${cat}: ${km}/${gtk}`);
    }
  });

  it('is effective 1 August 2026, which is why it lands in FY 2026/27', () => {
    for (const r of ACCESS_TARIFF_CATALOG) {
      expect(`${r.category} ${r.effectiveFrom}`).toBe(`${r.category} 2026-08-01`);
      expect(r.financialYear).toBe('2026/27');
    }
    expect(ACCESS_TARIFF_SOURCE).toMatch(/Table 17/);
    expect(ACCESS_TARIFF_SOURCE).toMatch(/§5\.2\.3/);
  });

  it('records that traction electricity is EXCLUDED — it is a pass-through', () => {
    // "Tariff's Excludes Traction Electricity - Traction Electricity will be a pass-through
    //  cost to users of Traction Electricity" (§5.2.3 note).
    for (const r of ACCESS_TARIFF_CATALOG) expect(r.tractionElectricityIncluded).toBe(false);
  });

  it('ties a corridor only where the document itself names one', () => {
    // The two category labels that carry a corridor in the published table.
    expect(byCat('OreCor (Iron Ore)').corridorCode).toBe('COR-ORE');
    expect(byCat('OreCor (Manganese Ore)').corridorCode).toBe('COR-ORE');
    expect(byCat('Coal Exports NorthCor').corridorCode).toBe('COR-NORTH');
    // The commodity groups are NOT mapped, because the document does not map them.
    for (const cat of ['Intermodal & Motor Vehicles', 'Mineral Exports', 'Grain & Tankers', 'Other General Traffic']) {
      expect(`${cat}: ${byCat(cat).corridorCode}`).toBe(`${cat}: null`);
    }
  });

  it('passenger and loose-locomotive categories carry no GTK charge', () => {
    // Table 17 shows 0.0 c/GTK for these three — they are moved on the train-km component alone.
    for (const cat of ['Metro Trains & Passenger < 12 Wagons', 'Passenger Trains > 12 Wagons', 'Loose Locomotives']) {
      expect(`${cat}: ${byCat(cat).centsPerGtk}`).toBe(`${cat}: 0`);
      expect(byCat(cat).zarPerTrainKm).toBeGreaterThan(0);
    }
  });

  it('resolves a category case- and punctuation-insensitively, and null when unknown', () => {
    expect(findAccessTariff('orecor (iron ore)')?.zarPerTrainKm).toBe(680);
    expect(findAccessTariff('  COAL EXPORTS NORTHCOR ')?.centsPerGtk).toBe(6.03);
    expect(findAccessTariff('Grain &amp; Tankers')?.centsPerGtk).toBe(6.96);
    expect(findAccessTariff('Something not in the table')).toBeNull();
  });

  it('rejects a row with a negative rate, an unknown corridor, or a bad effective date', () => {
    const base = byCat('OreCor (Iron Ore)');
    const bad = [
      { ...base, zarPerTrainKm: -1 },
      { ...base, centsPerGtk: -0.01 },
      { ...base, corridorCode: 'COR-NOT-A-CORRIDOR' },
      { ...base, effectiveFrom: '2026/27' },
      { ...base, category: '' },
    ];
    for (const e of bad) {
      const problems = validateAccessTariffEntry(e);
      expect(`${JSON.stringify(e).slice(0, 60)} -> ${problems.length}`).toMatch(/-> [1-9]/);
    }
  });

  it('accepts every published row', () => {
    for (const r of ACCESS_TARIFF_CATALOG) {
      const problems = validateAccessTariffEntry(r);
      expect(`${r.category}: ${problems.join('; ')}`).toBe(`${r.category}: `);
    }
  });
});
