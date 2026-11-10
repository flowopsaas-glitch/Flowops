import { Money } from '../common/money.util';

/**
 * Tariff, weighbridge-overload and hold rules — pure (no I/O), so every rule is unit-tested.
 *
 * WHAT WAS SUPPLIED, AND WHAT WAS NOT. The brief gives three constants (8.50 % infrastructure escalation, 4.42 %
 * electricity escalation, a R24.64/L diesel BASE price) and the overload rule. It does NOT give any c/GTK rate (the
 * Network Statement Section 5 tariff tables were never supplied), any corridor length, any traction consumption
 * factor, any electricity price or any overload penalty rate. Annexure 40 lists 113 priced lines and publishes no
 * price at all. Therefore:
 *
 *   • no rate is ever defaulted — a corridor without a VERIFIED loaded rate is REFUSED (status BLOCKED);
 *   • a line whose rate is not loaded is emitted UNPRICED (amount null), and the calculation is INCOMPLETE — it can
 *     be saved but never turned into an invoice draft;
 *   • distance is an explicit input (corridor lengths were not supplied);
 *   • escalation is OPT-IN and recorded on the line (the constants are [BRIEF, unverified]).
 */

import { commercialThreshold } from './catalog/commercial-thresholds.catalog';

// ── constants ────────────────────────────────────────────────────────────────

/**
 * §5.2.11 of the Network Statement: a wagon overloaded by MORE than this many tonnes "shall
 * not be allowed to proceed to its destination due to safety considerations". Sourced, not
 * from the brief — see `commercial-thresholds.catalog.ts`.
 */
const OVERLOAD_MUST_NOT_PROCEED_T = commercialThreshold('overload_must_not_proceed_tonnes')!.value!;


export const RAIL_TARIFF_CONSTANTS = {
  /** [BRIEF, unverified] annual escalation of infrastructure (c/GTK) rates, in percent. */
  infrastructureEscalationPct: 8.5,
  /** [BRIEF, unverified] annual escalation of the electricity price, in percent. */
  electricityEscalationPct: 4.42,
  /** [BRIEF, unverified] diesel BASE price in ZAR per litre — a base, not today's pump price. */
  dieselBasePricePerLitreZar: 24.64,
} as const;

export const TARIFF_CONSTANT_SOURCE = '[BRIEF] — not corroborated by any supplied document; unverified';

/**
 * Formula version for every tariff calculation (Phase C, C-02).
 * Bump when the calculator's arithmetic changes; persisted in TariffResult + calculation inputs + audit.
 * `1.0.0-wave4` = PR #441 (GTK-only, no train-km, no effective dates).
 * `1.1.0` = pass-through flags + formula version stamping (no arithmetic change).
 */
export const TARIFF_FORMULA_VERSION = 'rail-tariff/1.1.0' as const;

// ── financial year ───────────────────────────────────────────────────────────

/** "2026/27" — the label Annexure 40 uses ("2026/27"). */
export const FINANCIAL_YEAR_PATTERN = /^(\d{4})\/(\d{2})$/;

/** South Africa Standard Time: UTC+2, no daylight saving. */
const SAST_OFFSET_MS = 2 * 3_600_000;

/** Start year of "2026/27" → 2026. Null when the label is malformed, or its second half is not start + 1. */
export function parseFinancialYear(fy: string | null | undefined): number | null {
  const m = FINANCIAL_YEAR_PATTERN.exec((fy ?? '').trim());
  if (!m) return null;
  const start = Number(m[1]);
  return Number(m[2]) === (start + 1) % 100 ? start : null;
}

export const formatFinancialYear = (startYear: number): string => `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;

/**
 * The financial year a date falls in, judged on the South African calendar date. The year is taken to run
 * 1 April – 31 March. [unverified: the supplied annexures label years ("2026/27") but never state where one starts;
 * the caller may always override it.]
 */
export function financialYearOf(date: Date): string {
  const d = new Date(date.getTime() + SAST_OFFSET_MS);
  const year = d.getUTCFullYear();
  return formatFinancialYear(d.getUTCMonth() >= 3 ? year : year - 1);
}

/** Whole financial years from `from` to `to` (positive when `to` is later). Null when either label is malformed. */
export function financialYearsBetween(from: string, to: string): number | null {
  const a = parseFinancialYear(from);
  const b = parseFinancialYear(to);
  return a === null || b === null ? null : b - a;
}

// ── escalation ───────────────────────────────────────────────────────────────

/** rate × (1 + pct/100)^years, compounded annually. Full precision; round only where an amount is produced. */
export function escalate(rate: number, pctPerYear: number, years: number): number {
  if (!Number.isFinite(rate) || rate < 0) throw new RangeError('rate must be a non-negative number');
  if (!Number.isFinite(pctPerYear)) throw new RangeError('pctPerYear must be a number');
  if (!Number.isInteger(years) || years < 0) throw new RangeError('years must be a non-negative whole number');
  return rate * Math.pow(1 + pctPerYear / 100, years);
}

// ── weighbridge: overload ────────────────────────────────────────────────────

export type OverloadStatus = 'WITHIN_LIMIT' | 'OVERLOADED' | 'UNVERIFIED';

export interface OverloadEvaluation {
  status: OverloadStatus;
  /** maxAxleLoadTonnes × axles, when both are known. */
  allowedTonnes: number | null;
  /** actualTonnes − allowedTonnes when overloaded, otherwise null. */
  excessTonnes: number | null;
  reason: string;
}

const kg = (tonnes: number): number => Math.round(tonnes * 1000);

/**
 * THE OVERLOAD RULE [BRIEF]: a wagon is overloaded when `actualTonnes > maxAxleLoadTonnes × axles`.
 * Strictly greater: exactly at the limit is within it. Compared in whole kilograms so that 20.1 × 3 is not
 * "overloaded" by a floating-point crumb. When the limit or the axle count is unknown the answer is UNVERIFIED —
 * never a pass.
 */
export function evaluateOverload(input: { actualTonnes: number | null | undefined; axles: number | null | undefined; maxAxleLoadTonnes: number | null | undefined }): OverloadEvaluation {
  const { actualTonnes, axles, maxAxleLoadTonnes } = input;
  if (typeof actualTonnes !== 'number' || !Number.isFinite(actualTonnes) || actualTonnes <= 0) {
    return { status: 'UNVERIFIED', allowedTonnes: null, excessTonnes: null, reason: 'No actual mass was recorded.' };
  }
  if (typeof axles !== 'number' || !Number.isInteger(axles) || axles <= 0) {
    return { status: 'UNVERIFIED', allowedTonnes: null, excessTonnes: null, reason: 'The axle count of the wagon is not known, so the limit cannot be worked out.' };
  }
  if (typeof maxAxleLoadTonnes !== 'number' || !Number.isFinite(maxAxleLoadTonnes) || maxAxleLoadTonnes <= 0) {
    return { status: 'UNVERIFIED', allowedTonnes: null, excessTonnes: null, reason: 'No maximum axle load is known for this corridor, so the reading cannot be judged.' };
  }
  const allowedKg = kg(maxAxleLoadTonnes * axles);
  const actualKg = kg(actualTonnes);
  const allowedTonnes = allowedKg / 1000;
  if (actualKg > allowedKg) {
    const excessTonnes = (actualKg - allowedKg) / 1000;
    return { status: 'OVERLOADED', allowedTonnes, excessTonnes, reason: `${actualTonnes} t on ${axles} axle(s) exceeds the ${allowedTonnes} t allowed (${maxAxleLoadTonnes} t per axle) by ${excessTonnes} t.` };
  }
  return { status: 'WITHIN_LIMIT', allowedTonnes, excessTonnes: null, reason: `${actualTonnes} t is within the ${allowedTonnes} t allowed (${maxAxleLoadTonnes} t per axle × ${axles}).` };
}

// ── weighbridge: the hold ────────────────────────────────────────────────────

export interface ReadingLike {
  wagonNumber: string;
  status: OverloadStatus;
  excessTonnes?: number | null;
  actualTonnes?: number | null;
  createdAt: Date | string;
}

/**
 * The most recently RECORDED reading of each wagon. `createdAt` (system time) decides, not the time the user typed
 * for the weighing, so a corrective re-weigh can never be hidden by a back-dated entry. Ties go to the later entry.
 */
export function latestReadingPerWagon<T extends ReadingLike>(readings: readonly T[]): T[] {
  const best = new Map<string, { row: T; at: number; order: number }>();
  readings.forEach((row, order) => {
    const at = new Date(row.createdAt).getTime();
    const cur = best.get(row.wagonNumber);
    if (!cur || at > cur.at || (at === cur.at && order > cur.order)) best.set(row.wagonNumber, { row, at, order });
  });
  return Array.from(best.values()).map((b) => b.row);
}

export interface HoldDecision {
  held: boolean;
  wagons: { wagonNumber: string; excessTonnes: number; mustNotProceed: boolean }[];
  totalExcessTonnes: number;
  reason: string | null;
  /**
   * True when at least one wagon is overloaded beyond the point the Network Statement says it
   * must not be moved at all (§5.2.11: more than 3 t over).
   *
   * This is a different decision from `held`. An ordinary overload is a commercial and
   * operational problem: reduce the load and re-weigh. A safety stop is a prohibition — the
   * wagon "shall not be allowed to proceed to its destination due to safety considerations",
   * so re-weighing is not enough, the wagon has to be taken off the train.
   */
  safetyStop: boolean;
}

/**
 * A consignment is held while ANY wagon's latest reading is OVERLOADED; re-weighing it within
 * its limit lifts that wagon's share.
 *
 * §5.2.11 draws a line inside "overloaded" that this function now reports separately: past
 * OVERLOAD_MUST_NOT_PROCEED_T the wagon is not merely overweight, it is forbidden to move.
 */
export function deriveHold(readings: readonly ReadingLike[]): HoldDecision {
  const wagons = latestReadingPerWagon(readings)
    .filter((r) => r.status === 'OVERLOADED')
    .map((r) => {
      const excessTonnes = r.excessTonnes ?? 0;
      return { wagonNumber: r.wagonNumber, excessTonnes, mustNotProceed: excessTonnes > OVERLOAD_MUST_NOT_PROCEED_T };
    })
    .sort((a, b) => a.wagonNumber.localeCompare(b.wagonNumber));
  const totalExcessTonnes = Math.round(wagons.reduce((n, w) => n + w.excessTonnes, 0) * 1000) / 1000;
  const stopped = wagons.filter((w) => w.mustNotProceed);
  const reason = !wagons.length
    ? null
    : stopped.length
      ? `Safety stop (§5.2.11): ${stopped.map((w) => `${w.wagonNumber} (${w.excessTonnes} t over)`).join(', ')} ${stopped.length === 1 ? 'is' : 'are'} more than ${OVERLOAD_MUST_NOT_PROCEED_T} t over and shall not be allowed to proceed to ${stopped.length === 1 ? 'its' : 'their'} destination due to safety considerations. Remove ${stopped.length === 1 ? 'the wagon' : 'these wagons'} from the train.`
      : `Overloaded: ${wagons.map((w) => `${w.wagonNumber} (${w.excessTonnes} t over)`).join(', ')}. Reduce the load and re-weigh ${wagons.length === 1 ? 'the wagon' : 'each wagon'} within its limit.`;
  return {
    held: wagons.length > 0,
    wagons,
    totalExcessTonnes,
    reason,
    safetyStop: stopped.length > 0,
  };
}

// ── the calculator ───────────────────────────────────────────────────────────

export type TariffLineKind = 'GTK_LOADED' | 'GTK_EMPTY' | 'TRACTION_ENERGY' | 'ANCILLARY' | 'OVERLOAD_PENALTY';
export type TariffStatus = 'PRICED' | 'INCOMPLETE' | 'BLOCKED';

export interface TariffLine {
  kind: TariffLineKind;
  code?: string;
  description: string;
  /** null when it cannot be worked out (the line is then unpriced). */
  quantity: number | null;
  unit: string;
  /** null when no rate is loaded. */
  rate: number | null;
  rateUnit: string | null;
  /** null = UNPRICED. Never 0 for "unknown": TBD is not free. */
  amountZar: number | null;
  /** How the amount was derived, in words. */
  basis: string;
  evidence: string[];
  /**
   * True when this line is a pass-through cost (Phase C, C-06): the operator recovers a third-party
   * charge rather than pricing its own access. Electric traction is always a pass-through; diesel is
   * a pass-through only when priced from a contracted schedule price (the brief's base is not).
   * Methodology stays UNKNOWN until matrix P-07 is sourced.
   */
  passThrough?: boolean;
  /** Pass-through methodology in words, or null when unknown. */
  methodology?: string | null;
}

export interface WagonWeight { wagonNumber: string; tareTonnes?: number | null; loadedTonnes?: number | null }

export interface ScheduleLike {
  id: string;
  corridorCode: string;
  financialYear: string;
  loadedCentsPerGtk?: number | null;
  emptyCentsPerGtk?: number | null;
  dieselLitresPer1000Gtk?: number | null;
  electricKwhPer1000Gtk?: number | null;
  dieselPricePerLitreZar?: number | null;
  electricityPricePerKwhZar?: number | null;
  overloadPenaltyPerTonneZar?: number | null;
  dataStatus: 'SOURCE_PENDING' | 'VERIFIED';
  sourceRef?: string | null;
}

export interface AncillaryLike {
  code: string;
  name: string;
  serviceName: string;
  unitOfMeasure: string;
  priceStatus: 'NOT_PUBLISHED' | 'TBD' | 'PUBLISHED';
  unitRateZar?: number | null;
}

export interface TariffRequest {
  /** The catalog corridor the consignment resolves to, or null when it resolves to none. */
  corridorCode: string | null;
  financialYear: string;
  distanceKm: number;
  includeEmptyReturn?: boolean;
  /** Opt in to escalating the latest earlier VERIFIED year's rates by the brief's percentages. */
  allowEscalation?: boolean;
  traction?: { type: 'DIESEL' | 'ELECTRIC'; litres?: number | null; kWh?: number | null; pricePerUnitZar?: number | null } | null;
  ancillary?: { code: string; quantity: number }[];
}

export interface TariffContext {
  wagons: readonly WagonWeight[];
  /** The latest reading of each wagon (see latestReadingPerWagon). */
  latestReadings: readonly (ReadingLike & { wagonNumber: string; actualTonnes: number })[];
  /** Wagons whose EARLIER reading was overloaded but whose latest is not — for the "was it corrected?" warning. */
  correctedOverloads?: readonly { wagonNumber: string; excessTonnes: number }[];
  schedules: readonly ScheduleLike[];
  ancillaryCatalog: readonly AncillaryLike[];
}

export interface TariffResult {
  status: TariffStatus;
  /** Formula version that produced this result (C-02). Persisted with the calculation. */
  formulaVersion: typeof TARIFF_FORMULA_VERSION;
  corridorCode: string | null;
  financialYear: string;
  scheduleId: string | null;
  scheduleFinancialYear: string | null;
  /** Whole years the rates were escalated by (0 = used as loaded). */
  escalationYears: number;
  grossTonnesLoaded: number | null;
  grossTonnesEmpty: number | null;
  gtkLoaded: number | null;
  gtkEmpty: number | null;
  lines: TariffLine[];
  /** Sum of the PRICED lines only. Not an invoice total unless status is PRICED. */
  subtotalZar: number;
  currency: 'ZAR';
  /** What stops this being a priced total: the reasons nothing could be priced (BLOCKED) or the unpriced lines (INCOMPLETE). */
  blockers: string[];
  warnings: string[];
  hold: HoldDecision;
  /** Where each wagon's weight came from, for the audit record. */
  weightSources: { wagonNumber: string; source: 'WEIGHBRIDGE' | 'NOMINAL' | 'UNKNOWN'; grossTonnes: number | null; tareTonnes: number | null }[];
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isNonNeg = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
/** amount = rate × quantity, rounded once to the cent. (Not Money.multiply: that rounds the RATE to cents first.) */
const amount = (rate: number, quantity: number): number => Money.round(rate * quantity);

/** The VERIFIED schedule with a loaded rate to price from, and how far it must be escalated. */
function pickSchedule(
  schedules: readonly ScheduleLike[], corridorCode: string, financialYear: string, allowEscalation: boolean,
): { schedule: ScheduleLike | null; years: number; blocker: string | null } {
  const mine = schedules.filter((s) => s.corridorCode === corridorCode);
  const usable = mine.filter((s) => s.dataStatus === 'VERIFIED' && isPos(s.loadedCentsPerGtk));
  const exact = usable.find((s) => s.financialYear === financialYear);
  if (exact) return { schedule: exact, years: 0, blocker: null };

  const earlier = usable
    .map((s) => ({ s, gap: financialYearsBetween(s.financialYear, financialYear) }))
    .filter((x): x is { s: ScheduleLike; gap: number } => x.gap !== null && x.gap > 0)
    .sort((a, b) => a.gap - b.gap)[0];
  if (earlier && allowEscalation) return { schedule: earlier.s, years: earlier.gap, blocker: null };
  if (earlier) {
    return {
      schedule: null, years: 0,
      blocker: `No VERIFIED loaded rate for ${corridorCode} in ${financialYear}. The latest loaded year is ${earlier.s.financialYear}: tick "apply escalation" to escalate it by ${RAIL_TARIFF_CONSTANTS.infrastructureEscalationPct.toFixed(2)}% a year ${TARIFF_CONSTANT_SOURCE}.`,
    };
  }
  const pending = mine.filter((s) => s.dataStatus !== 'VERIFIED' && isPos(s.loadedCentsPerGtk));
  if (pending.length) {
    return { schedule: null, years: 0, blocker: `The rate loaded for ${corridorCode} (${pending.map((p) => p.financialYear).join(', ')}) is not VERIFIED against a cited source, so it is not used.` };
  }
  return { schedule: null, years: 0, blocker: `No loaded c/GTK rate exists for ${corridorCode}. The tariff tables were not supplied and a rate is never defaulted, so this corridor cannot be priced.` };
}

export function calculateTariff(req: TariffRequest, ctx: TariffContext): TariffResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const lines: TariffLine[] = [];
  const hold = deriveHold(ctx.latestReadings);
  const base = {
    formulaVersion: TARIFF_FORMULA_VERSION, corridorCode: req.corridorCode, financialYear: req.financialYear, currency: 'ZAR' as const, hold,
  };

  // ── weights: a weighbridge reading beats the nominal tare + loaded ─────────
  const latestByWagon = new Map(ctx.latestReadings.map((r) => [r.wagonNumber, r]));
  const weightSources: TariffResult['weightSources'] = ctx.wagons.map((w) => {
    const tare = isNonNeg(w.tareTonnes) ? w.tareTonnes : null;
    const reading = latestByWagon.get(w.wagonNumber);
    if (reading && isPos(reading.actualTonnes)) return { wagonNumber: w.wagonNumber, source: 'WEIGHBRIDGE' as const, grossTonnes: reading.actualTonnes, tareTonnes: tare };
    if (tare !== null && isNonNeg(w.loadedTonnes)) return { wagonNumber: w.wagonNumber, source: 'NOMINAL' as const, grossTonnes: round3(tare + w.loadedTonnes), tareTonnes: tare };
    return { wagonNumber: w.wagonNumber, source: 'UNKNOWN' as const, grossTonnes: null, tareTonnes: tare };
  });

  // ── core inputs: without these nothing can be priced ───────────────────────
  if (!req.corridorCode) blockers.push('The consignment\'s corridor does not match a corridor in the catalogue, so no rate can be selected. Set it to a catalogue corridor.');
  if (!isPos(req.distanceKm)) blockers.push('A distance in km is required: corridor lengths were not supplied, so GTK cannot be worked out without it.');
  if (parseFinancialYear(req.financialYear) === null) blockers.push(`"${req.financialYear}" is not a financial year (expected e.g. 2026/27).`);
  if (ctx.wagons.length === 0) blockers.push('The consignment has no wagons registered, so the weight of the train is unknown.');
  const unknown = weightSources.filter((w) => w.source === 'UNKNOWN').map((w) => w.wagonNumber);
  if (unknown.length) blockers.push(`Weight unknown for wagon(s) ${unknown.join(', ')}: register tare and loaded tonnes, or record a weighbridge reading.`);

  let schedule: ScheduleLike | null = null;
  let years = 0;
  if (req.corridorCode && parseFinancialYear(req.financialYear) !== null) {
    const picked = pickSchedule(ctx.schedules, req.corridorCode, req.financialYear, !!req.allowEscalation);
    schedule = picked.schedule;
    years = picked.years;
    if (picked.blocker) blockers.push(picked.blocker);
  }

  // Ancillary codes are validated up front: an unknown code is a mistake in the request, not a missing price.
  const catalogByCode = new Map(ctx.ancillaryCatalog.map((a) => [a.code, a]));
  const requestedAncillary = req.ancillary ?? [];
  for (const a of requestedAncillary) {
    if (!catalogByCode.has(a.code)) blockers.push(`"${a.code}" is not an Annexure 40 service code.`);
    if (!isPos(a.quantity)) blockers.push(`The quantity for ${a.code} must be greater than zero.`);
  }

  const blocked: TariffResult = {
    ...base, status: 'BLOCKED', scheduleId: schedule?.id ?? null, scheduleFinancialYear: schedule?.financialYear ?? null, escalationYears: years,
    grossTonnesLoaded: null, grossTonnesEmpty: null, gtkLoaded: null, gtkEmpty: null, lines: [], subtotalZar: 0, blockers, warnings, weightSources,
  };
  if (blockers.length || !schedule) return blocked;

  // ── weights → GTK ──────────────────────────────────────────────────────────
  const grossTonnesLoaded = round3(weightSources.reduce((n, w) => n + (w.grossTonnes ?? 0), 0));
  const gtkLoaded = round3(grossTonnesLoaded * req.distanceKm);
  const weighed = weightSources.filter((w) => w.source === 'WEIGHBRIDGE').length;
  const massSource = weighed === weightSources.length ? 'weighbridge' : weighed === 0 ? 'registered tare + loaded' : 'weighbridge and registered';
  const scheduleEvidence = `schedule ${schedule.corridorCode} ${schedule.financialYear}${schedule.sourceRef ? ` (${schedule.sourceRef})` : ''}`;

  const infraPct = RAIL_TARIFF_CONSTANTS.infrastructureEscalationPct;
  const escEvidence = years > 0 ? [`escalated ${years} year(s) from ${schedule.financialYear} at ${infraPct.toFixed(2)}% a year ${TARIFF_CONSTANT_SOURCE}`] : [];
  if (years > 0) warnings.push(`Rates are from the ${schedule.financialYear} schedule, escalated ${years} year(s) by ${infraPct.toFixed(2)}% a year ${TARIFF_CONSTANT_SOURCE}.`);
  if (weighed > 0 && weighed < weightSources.length) warnings.push(`${weighed} of ${weightSources.length} wagon(s) use a weighbridge mass; the rest use tare + loaded as registered.`);

  const loadedRate = escalate(schedule.loadedCentsPerGtk as number, infraPct, years);
  lines.push({
    kind: 'GTK_LOADED', description: `Infrastructure access — loaded train (${req.corridorCode})`, quantity: gtkLoaded, unit: 'GTK', rate: loadedRate, rateUnit: 'c/GTK',
    amountZar: amount(loadedRate / 100, gtkLoaded),
    basis: `${grossTonnesLoaded} gross t (${massSource} masses) × ${req.distanceKm} km = ${gtkLoaded} GTK × ${round3(loadedRate)} c/GTK`,
    evidence: [scheduleEvidence, ...escEvidence],
  });

  // ── empty return (opt-in) ──────────────────────────────────────────────────
  let grossTonnesEmpty: number | null = null;
  let gtkEmpty: number | null = null;
  if (req.includeEmptyReturn) {
    const tares = weightSources.map((w) => w.tareTonnes);
    if (tares.some((t) => t === null)) {
      lines.push({
        kind: 'GTK_EMPTY', description: `Infrastructure access — empty return (${req.corridorCode})`, quantity: null, unit: 'GTK', rate: null, rateUnit: 'c/GTK', amountZar: null,
        basis: 'The tare of at least one wagon is not registered, so the empty-return weight cannot be worked out.', evidence: [],
      });
    } else {
      grossTonnesEmpty = round3((tares as number[]).reduce((n, t) => n + t, 0));
      gtkEmpty = round3(grossTonnesEmpty * req.distanceKm);
      const emptyRate = isPos(schedule.emptyCentsPerGtk) ? escalate(schedule.emptyCentsPerGtk, infraPct, years) : null;
      lines.push({
        kind: 'GTK_EMPTY', description: `Infrastructure access — empty return (${req.corridorCode})`, quantity: gtkEmpty, unit: 'GTK', rate: emptyRate, rateUnit: 'c/GTK',
        amountZar: emptyRate === null ? null : amount(emptyRate / 100, gtkEmpty),
        basis: emptyRate === null
          ? `${grossTonnesEmpty} t tare × ${req.distanceKm} km = ${gtkEmpty} GTK; no empty-return rate is loaded for ${schedule.corridorCode} ${schedule.financialYear}, so it is not priced.`
          : `${grossTonnesEmpty} t tare × ${req.distanceKm} km = ${gtkEmpty} GTK × ${round3(emptyRate)} c/GTK`,
        evidence: emptyRate === null ? [] : [scheduleEvidence, ...escEvidence],
      });
    }
  }

  // ── traction energy (opt-in) ───────────────────────────────────────────────
  const t = req.traction;
  if (t) {
    if (t.type === 'DIESEL') {
      const given = isPos(t.litres) ? t.litres : null;
      const factor = isPos(schedule.dieselLitresPer1000Gtk) ? schedule.dieselLitresPer1000Gtk : null;
      const litres = given ?? (factor !== null ? round3((factor * gtkLoaded) / 1000) : null);
      const explicitPrice = isPos(t.pricePerUnitZar) ? t.pricePerUnitZar : null;
      const schedulePrice = isPos(schedule.dieselPricePerLitreZar) ? schedule.dieselPricePerLitreZar : null;
      const price = explicitPrice ?? schedulePrice ?? RAIL_TARIFF_CONSTANTS.dieselBasePricePerLitreZar;
      const priceEvidence = explicitPrice !== null ? ['price entered with the request'] : schedulePrice !== null ? [scheduleEvidence]
        : [`diesel BASE price R${RAIL_TARIFF_CONSTANTS.dieselBasePricePerLitreZar.toFixed(2)}/L ${TARIFF_CONSTANT_SOURCE}; a base price, not today's pump price`];
      if (explicitPrice === null && schedulePrice === null) warnings.push(`Diesel is priced at the brief's BASE of R${RAIL_TARIFF_CONSTANTS.dieselBasePricePerLitreZar.toFixed(2)}/L, not a contracted or pump price. Enter the price to replace it.`);
      lines.push({
        kind: 'TRACTION_ENERGY', description: 'Traction energy — diesel', quantity: litres, unit: 'L', rate: price, rateUnit: 'ZAR/L',
        amountZar: litres === null ? null : amount(price, litres),
        basis: litres === null
          ? 'No litres were given and no consumption factor is loaded for this corridor, so the quantity is unknown and the line is not priced.'
          : given !== null ? `${litres} L entered × R${price}/L` : `${factor} L per 1000 GTK × ${gtkLoaded} GTK = ${litres} L × R${price}/L`,
        evidence: priceEvidence,
        passThrough: schedulePrice !== null && explicitPrice === null,
        methodology: schedulePrice !== null && explicitPrice === null ? 'Contracted schedule price (pass-through methodology UNKNOWN — matrix P-08)' : null,
      });
    } else {
      const given = isPos(t.kWh) ? t.kWh : null;
      const factor = isPos(schedule.electricKwhPer1000Gtk) ? schedule.electricKwhPer1000Gtk : null;
      const kWh = given ?? (factor !== null ? round3((factor * gtkLoaded) / 1000) : null);
      const explicitPrice = isPos(t.pricePerUnitZar) ? t.pricePerUnitZar : null;
      const elecPct = RAIL_TARIFF_CONSTANTS.electricityEscalationPct;
      const schedulePrice = isPos(schedule.electricityPricePerKwhZar) ? escalate(schedule.electricityPricePerKwhZar, elecPct, years) : null;
      const price = explicitPrice ?? schedulePrice;
      if (schedulePrice !== null && explicitPrice === null && years > 0) warnings.push(`The electricity price is from the ${schedule.financialYear} schedule, escalated ${years} year(s) by ${elecPct.toFixed(2)}% a year ${TARIFF_CONSTANT_SOURCE}.`);
      lines.push({
        kind: 'TRACTION_ENERGY', description: 'Traction energy — electric', quantity: kWh, unit: 'kWh', rate: price, rateUnit: 'ZAR/kWh',
        amountZar: kWh === null || price === null ? null : amount(price, kWh),
        basis: kWh === null ? 'No kWh were given and no consumption factor is loaded for this corridor, so the quantity is unknown and the line is not priced.'
          : price === null ? `${kWh} kWh; no electricity price is loaded and none was entered (the brief gives only the ${elecPct.toFixed(2)}% escalation, not a price), so it is not priced.`
          : given !== null ? `${kWh} kWh entered × R${round3(price)}/kWh` : `${factor} kWh per 1000 GTK × ${gtkLoaded} GTK = ${kWh} kWh × R${round3(price)}/kWh`,
        evidence: explicitPrice !== null ? ['price entered with the request'] : schedulePrice !== null ? [scheduleEvidence, ...(years > 0 ? [`escalated ${years} year(s) at ${elecPct.toFixed(2)}% a year ${TARIFF_CONSTANT_SOURCE}`] : [])] : [],
        passThrough: true,
        methodology: 'Electric traction is a pass-through cost (methodology UNKNOWN until matrix P-07 is sourced)',
      });
    }
  }

  // ── Annexure 40 ancillary services ─────────────────────────────────────────
  for (const a of requestedAncillary) {
    const svc = catalogByCode.get(a.code) as AncillaryLike;
    const priced = svc.priceStatus === 'PUBLISHED' && isNonNeg(svc.unitRateZar);
    lines.push({
      kind: 'ANCILLARY', code: svc.code, description: `${svc.serviceName}${svc.name !== svc.serviceName ? ` — ${svc.name}` : ''}`, quantity: a.quantity, unit: svc.unitOfMeasure,
      rate: priced ? (svc.unitRateZar as number) : null, rateUnit: priced ? `ZAR / ${svc.unitOfMeasure}` : null,
      amountZar: priced ? amount(svc.unitRateZar as number, a.quantity) : null,
      basis: priced ? `${a.quantity} × R${svc.unitRateZar} (${svc.unitOfMeasure})`
        : svc.priceStatus === 'TBD' ? 'Annexure 40 says "TBD" for this service: that is not zero and not free, so it is not priced.'
          : 'Annexure 40 publishes no price for this service, so it is not priced.',
      evidence: [`Annexure 40 ${svc.code}`],
    });
  }

  // ── weighbridge overload: a penalty line for every wagon that is STILL overloaded ──
  if (hold.held) {
    const rate = isNonNeg(schedule.overloadPenaltyPerTonneZar) ? schedule.overloadPenaltyPerTonneZar : null;
    lines.push({
      kind: 'OVERLOAD_PENALTY', description: 'Weighbridge overload penalty', quantity: hold.totalExcessTonnes, unit: 't over the limit', rate, rateUnit: rate === null ? null : 'ZAR/t',
      amountZar: rate === null ? null : amount(rate, hold.totalExcessTonnes),
      basis: rate === null
        ? `${hold.totalExcessTonnes} t over the limit (${hold.wagons.map((w) => `${w.wagonNumber} ${w.excessTonnes} t`).join(', ')}); no overload penalty rate is loaded, so it is not priced.`
        : `${hold.totalExcessTonnes} t over the limit × R${rate}/t (${hold.wagons.map((w) => w.wagonNumber).join(', ')})`,
      evidence: ['weighbridge overload rule [BRIEF]: actual tonnes > max axle load × axles', ...(rate === null ? [] : [scheduleEvidence])],
    });
    if (years > 0 && rate !== null) warnings.push(`The overload penalty rate is from the ${schedule.financialYear} schedule and was NOT escalated.`);
  }
  for (const c of ctx.correctedOverloads ?? []) {
    warnings.push(`${c.wagonNumber} was recorded ${c.excessTonnes} t over its limit and later re-weighed within it, so no penalty line was added. Confirm whether the tariff charges an overload that was corrected before departure.`);
  }

  const subtotalZar = Money.sum(lines.map((l) => l.amountZar ?? 0));
  const pending = lines.filter((l) => l.amountZar === null).map((l) => `${l.description}${l.code ? ` (${l.code})` : ''}: ${l.basis}`);
  return {
    ...base, status: pending.length ? 'INCOMPLETE' : 'PRICED', scheduleId: schedule.id, scheduleFinancialYear: schedule.financialYear, escalationYears: years,
    grossTonnesLoaded, grossTonnesEmpty, gtkLoaded, gtkEmpty, lines, subtotalZar, blockers: pending, warnings, weightSources,
  };
}
