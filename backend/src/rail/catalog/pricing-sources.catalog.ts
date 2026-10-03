/**
 * Controlled pricing-source register (Phase A) — typed equivalent of
 * `docs/RAIL-PRICING-SOURCE-MATRIX-2026-10-02.md` §2.
 *
 * EVERY ROW IS UNVERIFIED. No verified c/GTK rate, corridor length, consumption factor,
 * traction-electricity price, overload-penalty rate or ancillary price has been supplied.
 * Unknown values are `value: null` (UNKNOWN) — never 0, never estimated, never inferred.
 * The brief's three constants (8.50 %, 4.42 %, R24.64/L) are present and explicitly UNVERIFIED.
 *
 * A row may move to APPROVED_FOR_PILOT / APPROVED_FOR_PRODUCTION only with owner +
 * independent reviewer sign-off recorded here and in the matrix doc. No sign-offs recorded.
 */

export type PricingVerificationStatus =
  | 'UNVERIFIED'
  | 'DRAFT'
  | 'APPROVED_FOR_PILOT'
  | 'APPROVED_FOR_PRODUCTION'
  | 'SUPERSEDED';

export const PRICING_VERIFICATION_STATUSES: readonly PricingVerificationStatus[] = [
  'UNVERIFIED',
  'DRAFT',
  'APPROVED_FOR_PILOT',
  'APPROVED_FOR_PRODUCTION',
  'SUPERSEDED',
];

export interface PricingSourceEntry {
  /** P-01 … P-20, matching the matrix doc. */
  id: string;
  priceComponent: string;
  /** null = UNKNOWN (never 0 for unknown). */
  value: number | null;
  /** Human form when value is null (e.g. 'UNKNOWN', 'UNKNOWN — existence unconfirmed'). */
  valueLabel: string;
  unit: string;
  currency: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  timetablePeriod: string | null;
  sourceDocument: string;
  sourceSection: string;
  formula: string;
  verificationStatus: PricingVerificationStatus;
  owner: string | null;
  independentReviewer: string | null;
  notes: string;
}

const U = (priceComponent: string, unit: string, extra: Partial<PricingSourceEntry> & { id: string }): PricingSourceEntry => {
  const { value, ...rest } = extra;
  return {
    priceComponent,
    value: value ?? null,
    valueLabel: 'UNKNOWN',
    unit,
    currency: 'ZAR',
    effectiveFrom: null,
    effectiveTo: null,
    timetablePeriod: null,
    sourceDocument: 'UNKNOWN — not supplied',
    sourceSection: 'UNKNOWN',
    formula: 'UNKNOWN — do not infer',
    verificationStatus: 'UNVERIFIED',
    owner: null,
    independentReviewer: null,
    notes: '',
    ...rest,
  };
};

export const PRICING_SOURCE_CATALOG: readonly PricingSourceEntry[] = [
  U('Infrastructure access — loaded rate (c/GTK), per corridor per FY', 'c/GTK', {
    id: 'P-01', currency: 'ZAR (cents)',
    sourceDocument: 'Network Statement Vol 4, Section 5 tariff tables — NOT SUPPLIED',
    sourceSection: 'Table 17 access tariffs; Ch 5 §5.2 — NOT SUPPLIED',
    formula: 'amount = rate(c/GTK)/100 × GTK; GTK = gross t × km; rounded once to cent',
    notes: 'Audit §6 row 9. TARIFF_SCHEDULE_CATALOG empty by design. Calculator BLOCKED without VERIFIED loaded rate.',
  }),
  U('Infrastructure access — empty-return rate (c/GTK), per corridor per FY', 'c/GTK', {
    id: 'P-02', currency: 'ZAR (cents)',
    sourceDocument: 'Network Statement Vol 4, Section 5 tariff tables — NOT SUPPLIED',
    sourceSection: 'Ch 5 §5.2 — NOT SUPPLIED',
    formula: 'Same as P-01 on tare weight',
    notes: 'Empty return opt-in; unpriced line when no rate.',
  }),
  U('Infrastructure access — train-kilometre component (if any)', 'UNKNOWN', {
    id: 'P-03', valueLabel: 'UNKNOWN — existence unconfirmed',
    sourceDocument: 'Network Statement Vol 4 Ch 5 §5.2 — NOT SUPPLIED',
    sourceSection: 'Train-km vs GTK charging definitions — NOT SUPPLIED',
    formula: 'UNKNOWN — do not assume GTK-only or train-km+GTK',
    notes: 'Calculator models GTK only (gap C-05). Train-km needs source definitions first.',
  }),
  U('Corridor length / section distances for GTK', 'km', {
    id: 'P-04', currency: 'n/a (quantity)',
    sourceDocument: 'Network Statement Ch 2; Annexure 33a — NOT SUPPLIED',
    sourceSection: 'Approved route/section distances — NOT SUPPLIED',
    formula: 'GTK = gross t × distanceKm (distance typed in; never guessed)',
    notes: 'Audit §6 row 10. distanceKm is a required explicit input. No default per corridor.',
  }),
  U('Traction consumption factor — diesel', 'L / 1000 GTK', {
    id: 'P-05', currency: 'n/a (factor)',
    sourceDocument: 'Network Statement Section 5 / traction schedule — NOT SUPPLIED',
    sourceSection: 'Consumption-factor table — NOT SUPPLIED',
    formula: 'litres = factor × GTK / 1000 when litres not entered',
    notes: 'Line unpriced when neither litres nor factor known.',
  }),
  U('Traction consumption factor — electric', 'kWh / 1000 GTK', {
    id: 'P-06', currency: 'n/a (factor)',
    sourceDocument: 'Network Statement Section 5 / traction schedule — NOT SUPPLIED',
    sourceSection: 'Consumption-factor table — NOT SUPPLIED',
    formula: 'kWh = factor × GTK / 1000 when kWh not entered',
    notes: 'Electric traction unpriced without factor+price.',
  }),
  U('Traction electricity price / pass-through rate', 'ZAR/kWh', {
    id: 'P-07',
    sourceDocument: 'Official traction-electricity pricing source — NOT SUPPLIED',
    sourceSection: 'Tariff / pass-through methodology / billing unit / effective period — NOT SUPPLIED',
    formula: 'Pass-through: amount = kWh × price; methodology UNKNOWN',
    notes: 'Separate pass-through cost (gap C-06). Never defaulted.',
  }),
  U('Diesel price (contracted/pump)', 'ZAR/L', {
    id: 'P-08',
    sourceDocument: 'Contracted fuel schedule — NOT SUPPLIED',
    sourceSection: 'Price table — NOT SUPPLIED',
    formula: 'amount = litres × price; fallback base P-17 only with warning',
    notes: 'Calculator uses entered > loaded > base P-17. Base use warns.',
  }),
  U('Overload penalty rate', 'ZAR / tonne over limit', {
    id: 'P-09',
    sourceDocument: 'Network Statement / RAA — NOT SUPPLIED',
    sourceSection: 'Penalty rule/rate — NOT SUPPLIED',
    formula: 'penalty = total excess t × rate (one line, latest readings only); rate NOT escalated',
    notes: 'Audit §6 row 12. Corrected-before-departure chargeability UNDECIDED (D23).',
  }),
  U('Underload / under-utilisation charge (if any)', 'UNKNOWN', {
    id: 'P-10', valueLabel: 'UNKNOWN — existence unconfirmed',
    sourceDocument: 'Network Statement / RAA — NOT SUPPLIED',
    sourceSection: 'Underload rule — NOT SUPPLIED',
    notes: 'Overload/underload only when approved (C-08). Underload not modelled.',
  }),
  U('Annexure 40 ancillary services (113 lines)', 'Per annexure unit of measure (verbatim)', {
    id: 'P-11', timetablePeriod: '2026/27 (annexure cover; effective tariff period UNCONFIRMED)',
    sourceDocument: 'Annexure 40 — Ancillary Services Catalogue 2026/27 — SUPPLIED AS TEXT (no prices)',
    sourceSection: '40 services → 113 priced lines; 8× TBD, 105× no price',
    formula: 'amount = quantity × unitRate only when PUBLISHED with rate',
    notes: 'TBD ≠ free. unitRateZar null on all lines.',
  }),
  U('Yard services (shunting/marshalling, staging)', 'Per wagon movement / TBD', {
    id: 'P-12',
    sourceDocument: 'Annexure 40 item 1 (List of Yards.xlsx — NOT SUPPLIED); item 40 Staging = TBD',
    sourceSection: 'Yard list + staging price — NOT SUPPLIED',
    notes: '0 of 11 transfer yards supplied (EXC-030). Staging is TBD.',
  }),
  U('Occurrence / cancellation charges', 'UNKNOWN', {
    id: 'P-13',
    sourceDocument: 'Annexure 18; 20a/20b; 21; charge schedule — 18 + schedule NOT SUPPLIED',
    sourceSection: 'Charge schedule — NOT SUPPLIED',
    formula: 'Consequence type only (forfeit/credit/refund); amounts never computed',
    notes: 'Wave 3 models consequence type, never amounts. No charge schedule supplied.',
  }),
  U('VAT / tax treatment of rail charges', '%', {
    id: 'P-14', valueLabel: 'UNKNOWN — rate undecided',
    sourceDocument: 'Authoritative tax/commercial source — NOT SUPPLIED',
    sourceSection: 'VAT applicability + rate — NOT SUPPLIED',
    formula: 'Rail module sets no tax rate; platform default 15% applies on finalisation (D25)',
    notes: 'Confirm standard / zero-rated / exempt with tax adviser / SARS.',
  }),
  {
    id: 'P-15', priceComponent: 'Infrastructure escalation [BRIEF, UNVERIFIED]', value: 8.5, valueLabel: '8.50% [BRIEF, UNVERIFIED]',
    unit: '% p.a.', currency: 'n/a', effectiveFrom: null, effectiveTo: null, timetablePeriod: null,
    sourceDocument: 'Brief only — no corroborating document', sourceSection: 'n/a',
    formula: 'rate × (1+8.50/100)^years, opt-in, earlier-year only, recorded on line',
    verificationStatus: 'UNVERIFIED', owner: null, independentReviewer: null,
    notes: 'Must remain explicitly UNVERIFIED. Never applied to overload penalty.',
  },
  {
    id: 'P-16', priceComponent: 'Electricity escalation [BRIEF, UNVERIFIED]', value: 4.42, valueLabel: '4.42% [BRIEF, UNVERIFIED]',
    unit: '% p.a.', currency: 'n/a', effectiveFrom: null, effectiveTo: null, timetablePeriod: null,
    sourceDocument: 'Brief only — no corroborating document', sourceSection: 'n/a',
    formula: 'price × (1+4.42/100)^years, opt-in, earlier-year only',
    verificationStatus: 'UNVERIFIED', owner: null, independentReviewer: null,
    notes: 'Must remain explicitly UNVERIFIED.',
  },
  {
    id: 'P-17', priceComponent: 'Diesel base price [BRIEF, UNVERIFIED — a base, not a pump price]', value: 24.64, valueLabel: 'R24.64/L [BRIEF, UNVERIFIED]',
    unit: 'ZAR/L', currency: 'ZAR', effectiveFrom: null, effectiveTo: null, timetablePeriod: null,
    sourceDocument: 'Brief only — no corroborating document', sourceSection: 'n/a',
    formula: 'Fallback when no price loaded/entered; result carries warning',
    verificationStatus: 'UNVERIFIED', owner: null, independentReviewer: null,
    notes: 'Must remain explicitly UNVERIFIED. Warns on every use.',
  },
  U('Financial year / timetable period authority', 'n/a', {
    id: 'P-18', currency: 'n/a', valueLabel: 'UNKNOWN — period unconfirmed',
    sourceDocument: 'NS §1.7 (2026/27+2027/28, 1 Apr–31 Mar — attested text); Section 5 year-start NOT SUPPLIED',
    sourceSection: 'Timetable period 1 Apr–31 Mar; NS Section 5 year-start — NOT SUPPLIED',
    formula: 'Calculator assumes 1 Apr–31 Mar (SAST) with caller override (D20); workbook FYs never substituted',
    notes: 'Never silently substitute one period for another. Audit §6 row 15.',
  }),
  U('Performance guarantee (10% of annual Access Fee)', '% of annual Access Fee', {
    id: 'P-19', valueLabel: '10% (rule, not a price)',
    sourceDocument: 'Network Statement §3.3.4.1, §5.2.5.1 (via source register §4, attested text)',
    sourceSection: 'Guarantee rule',
    formula: 'guarantee = 10% × annual Access Fee',
    notes: 'Rule from attested text; effective period + independent review outstanding. Not priced by calculator.',
  }),
  U('Access fees / additional charges / guarantees / penalties / payment terms (RAA)', 'Various', {
    id: 'P-20',
    sourceDocument: 'Rail Access Agreement Annexure 15 — NOT SUPPLIED',
    sourceSection: 'Access fees, charges, guarantees, penalties, payment terms, tax/VAT, effective dates — NOT SUPPLIED',
    notes: 'Phase B item 2.',
  }),
];

/** Returns a list of problems; empty means the entry may be recorded. */
export function validatePricingSourceEntry(e: PricingSourceEntry): string[] {
  const p: string[] = [];
  if (!/^P-\d{2}$/.test(e.id)) p.push(`id "${e.id}" must look like P-01`);
  if (!e.priceComponent?.trim()) p.push(`${e.id}: priceComponent is required`);
  if (!PRICING_VERIFICATION_STATUSES.includes(e.verificationStatus)) {
    p.push(`${e.id}: verificationStatus "${e.verificationStatus}" must be one of ${PRICING_VERIFICATION_STATUSES.join(', ')}`);
  }
  if (e.value !== null && (typeof e.value !== 'number' || !Number.isFinite(e.value) || e.value < 0)) {
    p.push(`${e.id}: value must be a non-negative finite number or null (UNKNOWN) — never 0 for unknown`);
  }
  // The three brief constants are the only entries allowed a value while UNVERIFIED.
  const briefIds = ['P-15', 'P-16', 'P-17'];
  if (e.value !== null && e.verificationStatus === 'UNVERIFIED' && !briefIds.includes(e.id)) {
    p.push(`${e.id}: an UNVERIFIED row must not carry a value (record UNKNOWN, never an estimate)`);
  }
  if ((e.verificationStatus === 'APPROVED_FOR_PILOT' || e.verificationStatus === 'APPROVED_FOR_PRODUCTION') && (!e.owner || !e.independentReviewer)) {
    p.push(`${e.id}: ${e.verificationStatus} needs both owner and independent reviewer sign-off`);
  }
  if (e.verificationStatus === 'APPROVED_FOR_PRODUCTION' && (!e.effectiveFrom || !e.effectiveTo)) {
    p.push(`${e.id}: APPROVED_FOR_PRODUCTION needs effectiveFrom + effectiveTo`);
  }
  if (!e.sourceDocument?.trim() || !e.sourceSection?.trim() || !e.formula?.trim()) {
    p.push(`${e.id}: sourceDocument + sourceSection + formula are required (UNKNOWN when not supplied)`);
  }
  return p;
}

/** True only for production-approved rows with both sign-offs and an effective period. Today: none. */
export function isApprovedForProduction(e: PricingSourceEntry): boolean {
  return e.verificationStatus === 'APPROVED_FOR_PRODUCTION' && !!e.owner && !!e.independentReviewer && !!e.effectiveFrom && !!e.effectiveTo;
}
