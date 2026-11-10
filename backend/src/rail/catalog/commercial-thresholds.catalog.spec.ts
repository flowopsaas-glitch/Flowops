/**
 * Network Statement V4 Chapter 5 §5.2 — the commercial and operational thresholds.
 *
 * These are the numbers that decide money and, in two cases, whether a wagon is allowed to move
 * at all. They were all "NOT SUPPLIED" in the pricing register until Chapter 5 arrived.
 *
 * The two safety rules are the reason this file exists as code rather than prose:
 *   - a wagon overloaded by MORE THAN 3 t must not proceed to its destination (§5.2.11);
 *   - a wagon underloaded by 10 t OR MORE must be carded off (§5.2.11).
 * Both are hard stops the document states outright, and both are currently invisible to the
 * weighbridge, which only ever compares against a corridor axle limit.
 */
import {
  COMMERCIAL_THRESHOLDS, evaluateWagonLoadGate, COMMERCIAL_THRESHOLD_SOURCE,
} from './commercial-thresholds.catalog';

describe('Network Statement V4 Chapter 5 — commercial thresholds', () => {
  it('every threshold is cited to the section it came from', () => {
    for (const t of COMMERCIAL_THRESHOLDS) {
      expect(`${t.key} cites: ${/§5\.\d/.test(t.source)}`).toBe(`${t.key} cites: true`);
      expect(`${t.key} has a label`).toMatch(/has a label/);
      expect(t.label.length).toBeGreaterThan(10);
    }
    expect(COMMERCIAL_THRESHOLD_SOURCE).toMatch(/Chapter 5/);
  });

  it('has unique keys', () => {
    expect(new Set(COMMERCIAL_THRESHOLDS.map((t) => t.key)).size).toBe(COMMERCIAL_THRESHOLDS.length);
  });
});

describe('the two safety gates (§5.2.11)', () => {
  it('an overload of more than 3 t must NOT proceed — "due to safety considerations"', () => {
    // "Wagons that are overloaded by more than 3 tons shall not be allowed to proceed to its
    //  destination due to safety considerations."
    expect(evaluateWagonLoadGate({ overloadTonnes: 3.0 }).mayProceed).toBe(true);
    expect(evaluateWagonLoadGate({ overloadTonnes: 3.01 }).mayProceed).toBe(false);
    expect(evaluateWagonLoadGate({ overloadTonnes: 12 }).mayProceed).toBe(false);
    expect(evaluateWagonLoadGate({ overloadTonnes: 3.01 }).reason).toMatch(/3 t/);
  });

  it('an underload of 10 t or more must be CARDED OFF — it can cause derailments', () => {
    // "Underloading can be a safety hazard depending on the load profile. It can cause
    //  derailments on the line. Rail wagons that are underloaded by 10 tons and more should be
    //  carded off."
    expect(evaluateWagonLoadGate({ underloadTonnes: 9.99 }).cardedOff).toBe(false);
    expect(evaluateWagonLoadGate({ underloadTonnes: 10 }).cardedOff).toBe(true);
    expect(evaluateWagonLoadGate({ underloadTonnes: 10 }).mayProceed).toBe(false);
    expect(evaluateWagonLoadGate({ underloadTonnes: 10 }).reason).toMatch(/10 t/);
  });

  it('a wagon within both limits proceeds with no action', () => {
    const g = evaluateWagonLoadGate({ overloadTonnes: 1.2, underloadTonnes: 4 });
    expect(g).toMatchObject({ mayProceed: true, cardedOff: false, reason: null });
  });

  it('an unknown load is not a pass — the gate is UNKNOWN, never "proceed"', () => {
    // FlowOps never claims a wagon is fit when the excess was never measured.
    expect(evaluateWagonLoadGate({}).mayProceed).toBe(false);
    expect(evaluateWagonLoadGate({ overloadTonnes: null }).mayProceed).toBe(false);
    expect(evaluateWagonLoadGate({}).reason).toMatch(/not measured|UNKNOWN/i);
  });
});

describe('cancellation, yard and billing rules', () => {
  const t = (key: string) => COMMERCIAL_THRESHOLDS.find((x) => x.key === key)!;

  it('cancelling inside 72 hours forfeits the access fees paid in advance', () => {
    // Table 22: full cancellation within 72 hours up to scheduled departure, not Force Majeure,
    // the Access Seeker will forfeit the access fees paid in advance.
    expect(t('cancellation_forfeit_hours').value).toBe(72);
    expect(t('cancellation_forfeit_hours').unit).toBe('hours before departure');
  });

  it('exceeding yard usage by more than 30 minutes deems the train cancelled', () => {
    expect(t('yard_usage_deemed_cancelled_minutes').value).toBe(30);
  });

  it('the application fee is R125 000 per train path for freight, R42 000 for passenger', () => {
    expect(t('application_fee_freight_zar').value).toBe(125_000);
    expect(t('application_fee_passenger_zar').value).toBe(42_000);
    // "The application fee is not refundable."
    expect(t('application_fee_freight_zar').notes).toMatch(/not refundable/i);
  });

  it('the guarantee is 10% of the annual aggregate of access fees', () => {
    expect(t('guarantee_pct_of_annual_access_fees').value).toBe(10);
  });

  it('invoices are issued by the 26th and are due within 5 days', () => {
    // §5.2.4.3: on or before the 26th the TRIM generates the invoice. §5.2.4.5: payment is due
    // within 5 days of receipt.
    expect(t('invoice_day_of_month').value).toBe(26);
    expect(t('payment_due_days').value).toBe(5);
  });

  it('TRIM penalty liability is assessed within 20 business days of contract-year end', () => {
    expect(t('trim_penalty_assessment_business_days').value).toBe(20);
  });
});

describe('escalation — the brief\'s 8.5% is NOT what the document says', () => {
  it('additional charges escalate by PPI; access fees are approved by IRERC', () => {
    const esc = COMMERCIAL_THRESHOLDS.find((x) => x.key === 'additional_charges_escalation')!;
    // §5.2.13: additional charges escalate annually by a percentage equal to PPI.
    // §5.2.12: the TRIM applies to IRERC annually; final tariffs are approved by IRERC.
    expect(esc.valueLabel).toMatch(/PPI/);
    expect(esc.notes).toMatch(/IRERC/);
    // No number is asserted: the document gives a mechanism, not a figure.
    expect(esc.value).toBeNull();
  });

  it('records that no corroborating percentage for access-fee escalation was published', () => {
    const esc = COMMERCIAL_THRESHOLDS.find((x) => x.key === 'additional_charges_escalation')!;
    // The brief says 8.5%. Chapter 5 does not publish a figure, so 8.5% stays [BRIEF, unverified]
    // rather than being dressed up as sourced.
    expect(esc.notes).toMatch(/8\.5|unverified|not published/i);
  });
});
