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

/** Chapter 5 of the Network Statement (18 Sep 2026) supplied §5.2; cited per row below. */
const CH5 = 'Network Statement V4 (18 Sep 2026)';

export const PRICING_SOURCE_CATALOG: readonly PricingSourceEntry[] = [
  U('Infrastructure access — loaded rate (c/GTK), per corridor per FY', 'c/GTK', {
    id: 'P-01', currency: 'ZAR (cents)',
    sourceDocument: `${CH5} §5.2.3 Table 17 — SUPPLIED`,
    sourceSection: 'Table 17: Rail Access Fees applicable for 2026/27 (p157), effective 1 Aug 2026',
    formula: 'amount = rate(c/GTK)/100 × GTK; GTK = gross t × km; rounded once to cent',
    notes: 'SUPPLIED at CATEGORY level, not per corridor. Table 17 is a commodity table: 3.54 c/GTK iron ore, 5.53 manganese, 6.03 coal, 4.41 intermodal, 9.00 mineral exports, 6.96 grain & tankers, 9.50 other general traffic (0.0 for the three passenger/loose-loco categories). Only two labels name a corridor (OreCor, NorthCor); see access-tariffs.catalog.ts. A per-corridor rate still needs the commodity→corridor mapping the document does not give, so TARIFF_SCHEDULE_CATALOG stays empty rather than being filled by inference. The commodity-level Table 17 rates are now live via catalog/tariff-rate-cards.ts, which resolves CORRIDOR -> COMMODITY -> NETWORK.',
  }),
  U('Infrastructure access — empty-return rate (c/GTK), per corridor per FY', 'c/GTK', {
    id: 'P-02', currency: 'ZAR (cents)',
    sourceDocument: `${CH5} §5.2.3 Table 17 — SUPPLIED, but no separate empty rate published`,
    sourceSection: 'Table 17 footnote: "This includes empty wagon movements to and from workshops" (attached to Intermodal & Motor Vehicles)',
    formula: 'Same as P-01 on tare weight',
    notes: 'Chapter 5 publishes ONE rate per category, not a loaded/empty pair. The footnote says empty workshop movements are already inside the intermodal rate. A distinct empty-return rate is still NOT published. Empty return opt-in; unpriced line when no rate.'
  }),
  U('Infrastructure access — train-kilometre component (if any)', 'UNKNOWN', {
    id: 'P-03', valueLabel: 'CONFIRMED to exist — R/train-km published, not yet modelled',
    sourceDocument: `${CH5} §5.2.3 — SUPPLIED`,
    sourceSection: 'Table 17 "Tariff per Trainkm (Rand)"; §5.2.3: "a two-part tariff where one tariff is based on train kms and the other on GTKs"',
    formula: 'amount = R/train-km × train-km, charged IN ADDITION to the GTK component (not instead of it)',
    notes: 'EXISTENCE NOW CONFIRMED — it is not GTK-only. R/train-km: 680 iron ore & manganese, 260 coal, 30 intermodal/grain/other general, 30.75 mineral exports, 50 metro & passenger <12 wagons, 60 passenger >12 wagons, 12 loose locomotives. CLOSED 2026-11-11: the calculator now charges both components (see catalog/tariff-rate-cards.ts). Both figures are live rates, not reference data.'
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
    sourceDocument: `${CH5} §5.2.9 Additional Charges — METHODOLOGY SUPPLIED, rate NOT published`,
    sourceSection: 'Table 17 note (traction excluded, pass-through); §5.2.9 — aggregated at corridor level, allocated on electric-locomotive GTKs',
    formula: 'Pass-through: amount = kWh × price; allocation driver = electric GTK. Rate never defaulted.',
    notes: 'MECHANISM NOW KNOWN: "the costs of electricity traction shall be recovered from those Access Seekers that utilise electrical traction only, therefore this charge shall be excluded from the costs that are shared among all Access Seekers". Aggregated per corridor and allocated by service design per flow using electric locomotive GTKs. The PRICE per kWh is still not published — it is a pass-through of cost, not a tariff. Never defaulted.'
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
    sourceDocument: `${CH5} §5.2.11 — RULE SUPPLIED, rate NOT published`,
    sourceSection: 'Overloading of a Rail Wagon in excess of its Maximum Carrying Capacity',
    formula: 'penalty = excess t × rate, tiered by level of overloading (higher rate for larger excess); rate NOT published and NOT escalated',
    notes: 'RULE NOW KNOWN: charges are levied on the actual mass conveyed, on top of the normal rate, at different rates for different levels of overloading (higher for larger). SAFETY: "Wagons that are overloaded by more than 3 tons shall not be allowed to proceed to its destination due to safety considerations" — enforced in commercial-thresholds.catalog.ts. The RATE itself is still not published. Corrected-before-departure chargeability UNDECIDED (D23).'
  }),
  U('Underload / under-utilisation charge (if any)', 'UNKNOWN', {
    id: 'P-10', valueLabel: 'CONFIRMED to exist — rule supplied, no separate charge published',
    sourceDocument: `${CH5} §5.2.11 — SUPPLIED`,
    sourceSection: 'Underloading bulk and break-bulk rail wagons',
    notes: 'EXISTENCE NOW CONFIRMED. Rule: the Access Seeker pays the FULL Train Path fee regardless, and TRIM may reallocate the path to another operator after identifying a trend of under-loading in its quarterly reviews. SAFETY: "Underloading can be a safety hazard depending on the load profile. It can cause derailments on the line. Rail wagons that are underloaded by 10 tons and more should be carded off." The wagon-level gate is implemented in commercial-thresholds.catalog.ts; the corridor-level under-utilisation charge is still not modelled (C-08).'
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
    sourceDocument: `${CH5} §5.2.10.8–§5.2.10.9 Tables 21 & 22 — RULES SUPPLIED, amounts are the fee itself`,
    sourceSection: 'Table 21 TRIM Penalties; Table 22 Access Seeker Penalties; §5.2.11 Additional Charges',
    formula: 'Consequence type only (forfeit/credit/refund); amounts never computed',
    notes: 'RULES NOW KNOWN. Access Seeker: full cancellation within 72 h of departure (not Force Majeure) forfeits the access fees paid in advance; cancelled earlier, TRIM passes credit if it can reallocate the path. TRIM: full Train Path fee refunded where the Access Seeker declines a replacement path, assessed within 20 business days of contract-year end. Financial penalties beyond the Rail Access Agreement are NOT yet imposed — "no financial penalties ... shall be imposed until the Penalty Framework has been approved and implemented", with 3 months written notice required.'
  }),
  U('VAT / tax treatment of rail charges', '%', {
    id: 'P-14', valueLabel: 'Applicability CONFIRMED — rate not stated in Chapter 5',
    sourceDocument: `${CH5} §5.2.4.4 — applicability SUPPLIED; rate not stated`,
    sourceSection: '"VAT will be levied where applicable." (§5.2.4.4); §5.2.10.8.2 refers to penalties "together with any VAT thereon if applicable"',
    formula: 'Rail module sets no tax rate; platform default 15% applies on finalisation (D25)',
    notes: 'APPLICABILITY NOW CONFIRMED by the document — VAT is levied. Chapter 5 does not state the rate, so the platform default stands. Confirm standard / zero-rated / exempt with tax adviser / SARS.'
  }),
  {
    id: 'P-15', priceComponent: 'Infrastructure escalation [BRIEF, UNVERIFIED]', value: 8.5, valueLabel: '8.50% [BRIEF, UNVERIFIED]',
    unit: '% p.a.', currency: 'n/a', effectiveFrom: null, effectiveTo: null, timetablePeriod: null,
    sourceDocument: 'Brief only — no corroborating document', sourceSection: 'n/a',
    formula: 'rate × (1+8.50/100)^years, opt-in, earlier-year only, recorded on line',
    verificationStatus: 'UNVERIFIED', owner: null, independentReviewer: null,
    notes: 'Must remain explicitly UNVERIFIED — Chapter 5 does NOT corroborate it: §5.2.13 escalates Additional Charges by PPI and §5.2.12 has Access Fees approved annually by IRERC, and neither publishes a percentage. Never applied to overload penalty.',
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
