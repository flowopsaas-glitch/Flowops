/**
 * Rate shopping — money correctness.
 *
 * A carrier quote is shown to a customer as parts (base, fuel surcharge, VAT) that add up
 * to a total. If the parts do not sum to the total, the customer is looking at a quote
 * that does not add up, and the VAT on it is wrong. That is the invariant below.
 *
 * Both defects this file pins down were real:
 *
 *  1. `vat = Math.round(total - net) * 100 / 100` — operator precedence. This parses as
 *     `(Math.round(total - net) * 100) / 100`, which is just `Math.round(total - net)`:
 *     VAT was rounded to the WHOLE RAND, not to the cent. On a R115.43 quote the VAT came
 *     out R15.00 instead of R15.06, and the parts summed to R115.37, not R115.43.
 *
 *  2. Every money figure was rounded with an inline `Math.round(n * 100) / 100` rather than
 *     the platform's `Money` primitive, which rounds half-away-from-zero in integer cents.
 *     The inline form disagrees at exact half-cents — see money-consistency.spec.ts.
 */
import { Money } from '../common/money.util';
import { calculateTableRate, fetchAramexRate } from './rate-shopping.service';

const cfg = { username: 'u', password: 'p', accountNumber: 'a', accountPin: 'pin' };
const log = { warn: jest.fn(), log: jest.fn(), error: jest.fn(), debug: jest.fn(), verbose: jest.fn() } as any;

/** The Aramex live path returns one gross total; the service splits it into net + VAT. */
async function aramexQuoteFor(grossTotal: number) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ HasErrors: false, TotalAmount: { Value: grossTotal } }),
  });
  const rates = await fetchAramexRate(cfg, '1 Main Rd, Johannesburg', '2 Long St, Cape Town', 5, log);
  return rates?.[0];
}

/** A money figure must already be rounded to whole cents — no float dust. */
const isCleanMoney = (v: number): boolean => Number.isFinite(v) && Math.abs(v - Money.round(v)) < 1e-9;

describe('a quoted rate adds up', () => {
  it('splits a gross Aramex total into net + VAT that sum back to the total', async () => {
    // R115.43 gross at 15% VAT: net R100.37, VAT R15.06.
    const r = await aramexQuoteFor(115.43);
    expect(r).toBeDefined();

    expect(r!.total).toBe(115.43);   // the gross the carrier quoted is preserved
    expect(r!.vat).toBe(15.06);      // NOT 15.00 — VAT is charged to the cent
    expect(Money.round((r!.base ?? 0) + (r!.fuelSurcharge ?? 0) + (r!.vat ?? 0))).toBe(r!.total);
  });

  it('does not discard the cents from VAT', async () => {
    // The precedence bug made every VAT figure a whole number of rands.
    for (const gross of [115.43, 231.07, 89.99, 1042.61, 57.5, 340.19]) {
      const r = await aramexQuoteFor(gross);
      expect(r).toBeDefined();
      // The split must be exact to the cent, not merely close.
      expect(Money.round((r!.base ?? 0) + (r!.fuelSurcharge ?? 0) + (r!.vat ?? 0))).toBe(r!.total);
      // And the VAT must carry its cents: gross minus net, to the cent.
      expect(r!.vat).toBe(Money.round(r!.total - r!.base));
    }
  });

  it('keeps the table-based quote internally consistent and free of float dust', () => {
    const entry = {
      carrier: 'PostNet', service: 'Standard', serviceCode: 'PN-STANDARD',
      base: 42, perKg: 6.5, transitDays: '3–5 days',
    } as any;
    const r = calculateTableRate(entry, 3.7, 1, 1);

    expect(Money.round(r.base + r.fuelSurcharge + r.vat)).toBe(r.total);
    for (const v of [r.base, r.fuelSurcharge, r.vat, r.total]) expect(isCleanMoney(v)).toBe(true);
  });
});
