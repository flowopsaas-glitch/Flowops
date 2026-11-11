import { FINANCIAL_YEAR_PATTERN, parseFinancialYear } from '../rail-tariff.rules';

/**
 * Tariff schedules (c/GTK and the related rates), one entry per corridor and financial year.
 *
 * THIS CATALOGUE IS EMPTY, AND THAT IS CORRECT — but the reason changed on 2026-11-11.
 *
 * It is NOT that no tariff was supplied. Network Statement V4 Chapter 5 WAS supplied and its
 * Table 17 rates are live (see `access-tariffs.catalog.ts` and `tariff-rate-cards.ts`). The
 * reason this catalogue is empty is granularity: Table 17 publishes rates by COMMODITY, and
 * only two of its ten categories name a corridor. A per-CORRIDOR rate would need a
 * commodity-to-corridor mapping that no supplied document gives, and that mapping is never
 * inferred — guessing it would put a wrong access fee on a real invoice.
 *
 * Transnet traffic therefore prices from the commodity rate card. This catalogue remains for
 * networks that DO publish per-route rates (most European infrastructure managers do), and it
 * takes precedence when it is populated, because a corridor rate is more specific than a
 * commodity rate.
 *
 * To load a rate: add an entry below, citing the published tariff in `sourceRef`, set `dataStatus: 'VERIFIED'`, get it
 * code-reviewed, then run the gated seeder (`node prisma/seed-rail-reference.js --plan`, then `--apply`). The validator
 * refuses a VERIFIED entry without a source and a loaded rate, and the seeder never downgrades a VERIFIED row.
 */

export interface TariffScheduleEntry {
  corridorCode: string;
  /** "2026/27" */
  financialYear: string;
  /** cents per gross tonne-kilometre, loaded train */
  loadedCentsPerGtk?: number;
  /** cents per GTK, empty return */
  emptyCentsPerGtk?: number;
  dieselLitresPer1000Gtk?: number;
  electricKwhPer1000Gtk?: number;
  dieselPricePerLitreZar?: number;
  electricityPricePerKwhZar?: number;
  overloadPenaltyPerTonneZar?: number;
  dataStatus: 'SOURCE_PENDING' | 'VERIFIED';
  /** The published tariff the rates came from. Required for VERIFIED. */
  sourceRef?: string;
  notes?: string;
}

export const TARIFF_SCHEDULE_CATALOG: readonly TariffScheduleEntry[] = [];

const RATE_FIELDS = [
  'loadedCentsPerGtk', 'emptyCentsPerGtk', 'dieselLitresPer1000Gtk', 'electricKwhPer1000Gtk', 'dieselPricePerLitreZar', 'electricityPricePerKwhZar', 'overloadPenaltyPerTonneZar',
] as const;
export type TariffRateField = (typeof RATE_FIELDS)[number];
export const TARIFF_RATE_FIELDS: readonly TariffRateField[] = RATE_FIELDS;

/** Returns a list of problems; empty means the entry may be seeded. */
export function validateTariffScheduleEntry(e: TariffScheduleEntry, knownCorridorCodes: readonly string[]): string[] {
  const p: string[] = [];
  if (!knownCorridorCodes.includes(e.corridorCode)) p.push(`corridorCode "${e.corridorCode}" is not a catalogue corridor (${knownCorridorCodes.join(', ')})`);
  if (!FINANCIAL_YEAR_PATTERN.test(e.financialYear ?? '') || parseFinancialYear(e.financialYear) === null) p.push(`financialYear "${e.financialYear}" must look like 2026/27 (the second year follows the first)`);
  for (const f of RATE_FIELDS) {
    const v = e[f];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) p.push(`${f} must be a positive, finite number when given (leave it out when it is not published)`);
  }
  if (!['SOURCE_PENDING', 'VERIFIED'].includes(e.dataStatus)) p.push(`dataStatus "${e.dataStatus}" must be SOURCE_PENDING or VERIFIED`);
  if (e.dataStatus === 'VERIFIED') {
    if (!e.sourceRef?.trim()) p.push('a VERIFIED schedule needs sourceRef (the published tariff its rates came from)');
    if (e.loadedCentsPerGtk === undefined) p.push('a VERIFIED schedule needs a loadedCentsPerGtk — without it nothing can be priced');
  }
  return p;
}
