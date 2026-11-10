/**
 * Network Statement V4 Chapter 5 §5.2.3 — Table 17, "Rail Access Fees applicable for 2026/27".
 *
 * For two years the pricing register recorded these tariffs as "NOT SUPPLIED", and the tariff
 * schedule catalogue was left empty on that basis. Chapter 5 of the Network Statement (18
 * September 2026) has since been supplied, and Table 17 is on page 157. These are the real
 * published access fees.
 *
 * TWO-PART TARIFF. §5.2.3: "the differentiated tariff will be a two-part tariff where one
 * tariff is based on train kms and the other on GTKs." Both components are charged, so a
 * calculator that prices on GTK alone undercharges every one of these categories. That is why
 * both figures are recorded here rather than just the c/GTK the rest of the module knows about.
 *
 * TRACTION ELECTRICITY IS EXCLUDED. The table's own note: "Tariff's Excludes Traction
 * Electricity - Traction Electricity will be a pass-through cost to users of Traction
 * Electricity". §5.2.9 adds the mechanism: traction electricity is aggregated at corridor level
 * and allocated on electric-locomotive GTKs. The rate itself is not published in Chapter 5 —
 * it is a pass-through of cost, not a tariff — so it stays UNKNOWN in the pricing register.
 *
 * WHAT IS NOT ASSERTED: a corridor for every category. Table 17 is a commodity table, not a
 * corridor table. Two of its labels name a corridor in the published text (OreCor, NorthCor)
 * and those are mapped. The other eight are commodity groups the document never ties to a
 * corridor, and guessing that mapping would put a wrong access fee on a real invoice.
 */
import { CORRIDOR_CATALOG } from './corridors.catalog';

export interface AccessTariffEntry {
  /** The category exactly as Table 17 prints it (the footnote marker is dropped). */
  category: string;
  /** Rand per train-km. */
  zarPerTrainKm: number;
  /** Cents per gross tonne-kilometre. */
  centsPerGtk: number;
  /**
   * The corridor, ONLY where the published category label itself names one (OreCor, NorthCor).
   * null = the document does not tie this category to a corridor.
   */
  corridorCode: string | null;
  /** Table 17 "applies from 1 August 2026". */
  effectiveFrom: string;
  /** The TRIM's financial reporting cycle is 1 April – 31 March, so 1 Aug 2026 falls in 2026/27. */
  financialYear: string;
  /** Table 17's note excludes traction electricity; it is billed as a pass-through. */
  tractionElectricityIncluded: boolean;
  notes?: string;
}

export const ACCESS_TARIFF_SOURCE =
  'Network Statement V4 (18 Sep 2026) §5.2.3 Table 17 — Rail Access Fees applicable for 2026/27 (p157). ' +
  'Effective 1 August 2026; to be amended to the TRIM financial cycle (1 Apr – 31 Mar) or as determined by IRERC or TER.';

const EFFECTIVE_FROM = '2026-08-01';
const FY = '2026/27';

/** One row per published category, in the document's own order. */
export const ACCESS_TARIFF_CATALOG: readonly AccessTariffEntry[] = [
  { category: 'OreCor (Iron Ore)', zarPerTrainKm: 680, centsPerGtk: 3.54, corridorCode: 'COR-ORE',
    effectiveFrom: EFFECTIVE_FROM, financialYear: FY, tractionElectricityIncluded: false,
    notes: 'The heavy-haul Sishen–Saldanha flow. The label names the Ore corridor.' },
  { category: 'OreCor (Manganese Ore)', zarPerTrainKm: 680, centsPerGtk: 5.53, corridorCode: 'COR-ORE',
    effectiveFrom: EFFECTIVE_FROM, financialYear: FY, tractionElectricityIncluded: false,
    notes: 'Same train-km rate as iron ore, higher GTK rate — manganese is denser per wagon but moves on the same line.' },
  { category: 'Coal Exports NorthCor', zarPerTrainKm: 260, centsPerGtk: 6.03, corridorCode: 'COR-NORTH',
    effectiveFrom: EFFECTIVE_FROM, financialYear: FY, tractionElectricityIncluded: false,
    notes: 'The Richards Bay coal export flow. The label names the North corridor.' },
  { category: 'Intermodal & Motor Vehicles', zarPerTrainKm: 30, centsPerGtk: 4.41, corridorCode: null,
    effectiveFrom: EFFECTIVE_FROM, financialYear: FY, tractionElectricityIncluded: false,
    notes: "Table 17 footnote: \"This includes empty wagon movements to and from workshops.\" Not tied to a corridor by the document." },
  { category: 'Mineral Exports', zarPerTrainKm: 30.75, centsPerGtk: 9.0, corridorCode: null,
    effectiveFrom: EFFECTIVE_FROM, financialYear: FY, tractionElectricityIncluded: false,
    notes: 'Not tied to a corridor by the document.' },
  { category: 'Grain & Tankers', zarPerTrainKm: 30, centsPerGtk: 6.96, corridorCode: null,
    effectiveFrom: EFFECTIVE_FROM, financialYear: FY, tractionElectricityIncluded: false,
    notes: 'Not tied to a corridor by the document.' },
  { category: 'Other General Traffic', zarPerTrainKm: 30, centsPerGtk: 9.5, corridorCode: null,
    effectiveFrom: EFFECTIVE_FROM, financialYear: FY, tractionElectricityIncluded: false,
    notes: 'The residual category. Not tied to a corridor by the document.' },
  { category: 'Metro Trains & Passenger < 12 Wagons', zarPerTrainKm: 50, centsPerGtk: 0, corridorCode: null,
    effectiveFrom: EFFECTIVE_FROM, financialYear: FY, tractionElectricityIncluded: false,
    notes: 'Table 17 prints 0.0 c/GTK — priced on the train-km component alone.' },
  { category: 'Passenger Trains > 12 Wagons', zarPerTrainKm: 60, centsPerGtk: 0, corridorCode: null,
    effectiveFrom: EFFECTIVE_FROM, financialYear: FY, tractionElectricityIncluded: false,
    notes: 'Table 17 prints 0.0 c/GTK — priced on the train-km component alone.' },
  { category: 'Loose Locomotives', zarPerTrainKm: 12, centsPerGtk: 0, corridorCode: null,
    effectiveFrom: EFFECTIVE_FROM, financialYear: FY, tractionElectricityIncluded: false,
    notes: 'Table 17 prints 0.0 c/GTK — priced on the train-km component alone.' },
];

const KNOWN_CORRIDOR_CODES: readonly string[] = CORRIDOR_CATALOG.map((c) => c.code);

/** Normalises a free-text category for lookup: case, HTML entities, whitespace and punctuation. */
const key = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Case- and punctuation-insensitive lookup. Returns null when the category is not published. */
export function findAccessTariff(category: string | null | undefined): AccessTariffEntry | null {
  if (!category) return null;
  const k = key(category);
  if (!k) return null;
  return ACCESS_TARIFF_CATALOG.find((r) => key(r.category) === k) ?? null;
}

/** Returns a list of problems; empty means the entry may be seeded. */
export function validateAccessTariffEntry(e: AccessTariffEntry): string[] {
  const p: string[] = [];
  if (!String(e?.category ?? '').trim()) p.push('category is required');
  for (const [f, v] of [['zarPerTrainKm', e?.zarPerTrainKm], ['centsPerGtk', e?.centsPerGtk]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) p.push(`${f} must be a non-negative, finite number`);
  }
  // A zero GTK rate is legitimate (Table 17 prints 0.0 for passenger and loose locomotives),
  // but a row with BOTH components zero is not a tariff.
  if (e?.zarPerTrainKm === 0 && e?.centsPerGtk === 0) p.push('a tariff needs at least one non-zero component');
  if (e?.corridorCode != null && !KNOWN_CORRIDOR_CODES.includes(e.corridorCode)) {
    p.push(`corridorCode "${e.corridorCode}" is not a catalogue corridor (${KNOWN_CORRIDOR_CODES.join(', ')})`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e?.effectiveFrom ?? ''))) p.push('effectiveFrom must be an ISO date (YYYY-MM-DD)');
  if (!/^\d{4}\/\d{2}$/.test(String(e?.financialYear ?? ''))) p.push('financialYear must look like 2026/27');
  return p;
}
