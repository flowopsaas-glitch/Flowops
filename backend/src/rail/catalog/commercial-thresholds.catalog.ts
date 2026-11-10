/**
 * Network Statement V4 Chapter 5 §5.2 — the commercial and operational thresholds.
 *
 * Everything here was "NOT SUPPLIED" in the pricing register (P-07 … P-14) until Chapter 5 of
 * the Network Statement (18 September 2026) was supplied. Pages 157–166 carry the tables.
 *
 * TWO OF THESE ARE SAFETY LIMITS, not commercial ones, and they are the reason this file is
 * code rather than documentation:
 *
 *   §5.2.11 — "Wagons that are overloaded by more than 3 tons shall not be allowed to proceed
 *              to its destination due to safety considerations."
 *   §5.2.11 — "Underloading can be a safety hazard depending on the load profile. It can cause
 *              derailments on the line. Rail wagons that are underloaded by 10 tons and more
 *              should be carded off."
 *
 * A wagon can therefore be inside its corridor axle limit and still be forbidden to move. The
 * corridor envelope answers "does this fit the line?"; these answer "is this wagon safe to run
 * at all?". They are different questions and both must be asked.
 *
 * WHAT IS NOT A NUMBER. Where the document gives a mechanism rather than a figure, `value` is
 * null and `valueLabel` says what the mechanism is. The brief's 8.5% infrastructure escalation
 * is the clearest case: §5.2.13 escalates additional charges by PPI and §5.2.12 has access fees
 * approved by IRERC, but no percentage is published. Recording 8.5% here would turn a brief's
 * guess into something that looks sourced.
 */

export interface CommercialThreshold {
  /** Stable key, UPPER_SNAKE. */
  key: string;
  /** Plain-language statement of the rule. */
  label: string;
  /** null = the document states a mechanism, not a figure. */
  value: number | null;
  /** Human form when value is null (e.g. 'PPI (Producer Price Index)'). */
  valueLabel: string;
  unit: string;
  /** The Network Statement section this came from. */
  source: string;
  notes?: string;
}

export const COMMERCIAL_THRESHOLD_SOURCE =
  'Network Statement V4 (18 Sep 2026) Chapter 5 §5.2.3–§5.2.14 (pp 157–166).';

const NS = 'Network Statement V4 (18 Sep 2026)';

export const COMMERCIAL_THRESHOLDS: readonly CommercialThreshold[] = [
  // ── Safety limits ───────────────────────────────────────────────────────────
  {
    key: 'overload_must_not_proceed_tonnes',
    label: 'A rail wagon overloaded by more than this must not proceed to its destination.',
    value: 3,
    valueLabel: '3 t',
    unit: 'tonnes',
    source: `${NS} §5.2.11 — Overloading of a Rail Wagon in excess of its Maximum Carrying Capacity`,
    notes: '"Wagons that are overloaded by more than 3 tons shall not be allowed to proceed to its destination due to safety considerations." A hard safety stop, independent of the corridor axle limit.',
  },
  {
    key: 'underload_card_off_tonnes',
    label: 'A rail wagon underloaded by this much or more must be carded off.',
    value: 10,
    valueLabel: '10 t',
    unit: 'tonnes',
    source: `${NS} §5.2.11 — Underloading bulk and break-bulk rail wagons`,
    notes: '"Underloading can be a safety hazard depending on the load profile. It can cause derailments on the line. Rail wagons that are underloaded by 10 tons and more should be carded off." The Access Seeker still pays the full Train Path fee, and TRIM may reallocate the path after a trend of under-loading is seen in quarterly reviews.',
  },

  // ── Cancellation and yard ───────────────────────────────────────────────────
  {
    key: 'cancellation_forfeit_hours',
    label: 'A full cancellation within this many hours of departure forfeits the access fees paid in advance.',
    value: 72,
    valueLabel: '72 hours',
    unit: 'hours before departure',
    source: `${NS} §5.2.10.9 Table 22 — Access Seeker Penalties`,
    notes: 'Only where the cancellation is not due to a Force Majeure Event. Cancelled earlier than the weekly Do-ability, or more than 72 h out, TRIM passes credit if it can reallocate the Train Path.',
  },
  {
    key: 'yard_usage_deemed_cancelled_minutes',
    label: 'Exceeding the Yard Usage Time by more than this deems the train cancelled by the Access Seeker.',
    value: 30,
    valueLabel: '30 minutes',
    unit: 'minutes',
    source: `${NS} §5.2.11 — Yard Usage Time in Yard Exceeded`,
    notes: 'At TRIM\'s reasonable discretion. The Access Seeker is liable for the lost revenue of the cancelled Train Path, plus a charge for every minute the Yard Usage Time was exceeded. Charge = (Total Dwell time – Designed Dwell time in yard).',
  },
  {
    key: 'trim_penalty_assessment_business_days',
    label: "TRIM's liability for penalties is assessed within this many business days of contract-year end.",
    value: 20,
    valueLabel: '20 business days',
    unit: 'business days',
    source: `${NS} §5.2.10.8.2 — Penalties applicable to the TRIM`,
    notes: 'Table 21: for deviation on contractual Train Path allocation, and for Train Path cancellations caused by TRIM, the full Train Path fee is refunded where the Access Seeker does not accept a replacement path — subject to the limitation of liability clause.',
  },

  // ── Fees and billing ────────────────────────────────────────────────────────
  {
    key: 'application_fee_freight_zar',
    label: 'Application admin fee per Train Path where the capacity is intended for freight transport.',
    value: 125_000,
    valueLabel: 'R125 000',
    unit: 'ZAR per Train Path',
    source: `${NS} §5.2.9 — Application Admin Fee`,
    notes: 'Subject to annual escalation. The application fee is not refundable. Covers site visits and inspections, technological integration, specialised due diligence, regulatory compliance and office overheads, up to the capacity allocation stage.',
  },
  {
    key: 'application_fee_passenger_zar',
    label: 'Application admin fee per Train Path for passenger transport (long distance, metropolitan, tourism).',
    value: 42_000,
    valueLabel: 'R42 000',
    unit: 'ZAR per Train Path',
    source: `${NS} §5.2.9 — Application Admin Fee`,
    notes: 'Subject to annual escalation. The application fee is not refundable.',
  },
  {
    key: 'guarantee_pct_of_annual_access_fees',
    label: 'Guarantee an Access Seeker must provide, as a share of the annual aggregate of Access Fees.',
    value: 10,
    valueLabel: '10%',
    unit: 'percent',
    source: `${NS} §5.2.5.1 — Financial Arrangements`,
    notes: "Calculated on the GTKs comprising the Train Paths allocated to the Access Seeker for the Contract Year.",
  },
  {
    key: 'invoice_day_of_month',
    label: 'TRIM generates the invoice on or before this day of each calendar month.',
    value: 26,
    valueLabel: '26th',
    unit: 'day of month',
    source: `${NS} §5.2.4.3 — Invoicing and Payment`,
    notes: 'Two components: rail access services to be executed from ~30 days after the invoice date, and penalties / occurrence management / pass-through electricity incurred in the preceding month. Ancillary services are also charged in advance once offered.',
  },
  {
    key: 'payment_due_days',
    label: 'Invoice payment is due within this many days of receipt.',
    value: 5,
    valueLabel: '5 days',
    unit: 'days',
    source: `${NS} §5.2.4.5 — Invoicing and Payment`,
    notes: 'Unpaid amounts bear interest at the Default Interest Rate, calculated daily and compounded monthly in arrears. VAT is levied where applicable.',
  },

  // ── Escalation: mechanism, not a figure ─────────────────────────────────────
  {
    key: 'additional_charges_escalation',
    label: 'Additional Charges (including Occurrence Management Services Charges) escalate annually by this index.',
    value: null,
    valueLabel: 'PPI (Producer Price Index) — no percentage published',
    unit: 'index',
    source: `${NS} §5.2.13 — Escalation of Additional Charges`,
    notes: 'Escalated annually by a percentage equal to PPI, from the first day of the second Contract Year and each Contract Year after. §5.2.12: Access Fees are applied for annually to IRERC and approved by IRERC — no escalation percentage is published for them either. The brief\'s 8.5% infrastructure escalation is therefore NOT corroborated by Chapter 5 and stays tagged [BRIEF, unverified].',
  },
  {
    key: 'penalty_framework_status',
    label: 'Whether financial penalties are currently imposed.',
    value: null,
    valueLabel: 'Not yet implemented — framework pending approval',
    unit: 'status',
    source: `${NS} §5.2.10.2–§5.2.10.10 — Penalty Framework`,
    notes: '"No financial penalties, other than those expressly provided for in the Rail Access Agreement, shall be imposed until the Penalty Framework has been approved and implemented." TRIM must give not less than 3 months\' written notice before implementing any new penalty. The cancellation rules in Table 22 are the part applicable in 2026/27.',
  },
];

/** Lookup by key. */
export function commercialThreshold(key: string): CommercialThreshold | null {
  return COMMERCIAL_THRESHOLDS.find((t) => t.key === key) ?? null;
}

export interface WagonLoadGate {
  /** false when the wagon must not move, or when the excess was never measured. */
  mayProceed: boolean;
  /** true when the underload rule requires the wagon to be carded off. */
  cardedOff: boolean;
  /** Why the wagon is stopped, or null when it may proceed. */
  reason: string | null;
}

const OVERLOAD_LIMIT_T =
  COMMERCIAL_THRESHOLDS.find((t) => t.key === 'overload_must_not_proceed_tonnes')!.value!;
const UNDERLOAD_LIMIT_T =
  COMMERCIAL_THRESHOLDS.find((t) => t.key === 'underload_card_off_tonnes')!.value!;

/**
 * Does this wagon pass Chapter 5's two safety gates?
 *
 * Note what this is NOT: it is not the corridor axle check. A wagon can be well inside its
 * corridor limit and still be stopped here, because §5.2.11 measures the excess against the
 * wagon's own Maximum Carrying Capacity, not against the line.
 *
 * An unmeasured excess is not a pass. If the caller does not know how far out the wagon is,
 * the gate cannot be satisfied — returning `mayProceed: true` there would let an unweighed
 * wagon through on the strength of nobody having checked it.
 */
export function evaluateWagonLoadGate(input: {
  overloadTonnes?: number | null;
  underloadTonnes?: number | null;
}): WagonLoadGate {
  const { overloadTonnes, underloadTonnes } = input;
  const measured = typeof overloadTonnes === 'number' || typeof underloadTonnes === 'number';
  if (!measured) {
    return {
      mayProceed: false,
      cardedOff: false,
      reason: 'The load was not measured, so neither safety gate can be satisfied (§5.2.11 overload > 3 t, underload >= 10 t).',
    };
  }
  if (typeof underloadTonnes === 'number' && underloadTonnes >= UNDERLOAD_LIMIT_T) {
    return {
      mayProceed: false,
      cardedOff: true,
      reason: `Underloaded by ${underloadTonnes} t, at or beyond the ${UNDERLOAD_LIMIT_T} t card-off limit (§5.2.11): underloading can cause derailments and the wagon must be carded off.`,
    };
  }
  if (typeof overloadTonnes === 'number' && overloadTonnes > OVERLOAD_LIMIT_T) {
    return {
      mayProceed: false,
      cardedOff: false,
      reason: `Overloaded by ${overloadTonnes} t, beyond the ${OVERLOAD_LIMIT_T} t limit (§5.2.11): the wagon shall not be allowed to proceed to its destination due to safety considerations.`,
    };
  }
  return { mayProceed: true, cardedOff: false, reason: null };
}
