/**
 * Money arithmetic utility — FlowOps™
 *
 * Money is stored as `Float` (ZAR) across the schema. Floating-point addition
 * and multiplication accumulate tiny errors (0.1 + 0.2 !== 0.3), which for a
 * cash/billing system show up as 1-cent drift in totals, VAT, wallet balances
 * and reconciliation. This module performs all money math via INTEGER CENTS so
 * results are exact to the cent, then returns a plain `number` rounded to 2
 * decimals — so there is ZERO change to how values are stored or serialized
 * (no Decimal objects leaking into API responses).
 *
 * Rules:
 *  - Use these helpers for every calculation that produces a stored/returned
 *    money amount (line totals, subtotals, VAT, discrepancies, commissions).
 *  - Inputs may be number | string | null | undefined — coerced safely to 0.
 *  - Everything returns a plain JS number rounded to 2 decimals (rands).
 */

/** Coerce any value to a finite number (invalid/blank → 0). */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Convert rands → integer cents (half-away-from-zero rounding). */
function toCents(v: unknown): number {
  const n = num(v);
  // Add a tiny epsilon in the value's own direction before rounding so that
  // e.g. 1.005 → 101 cents rather than 100 due to binary representation.
  return Math.round((n + (n >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100);
}

/** Convert integer cents → rands (plain number, 2dp). */
function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export const Money = {
  /** Round a money value to 2 decimals (rands), exactly. */
  round(v: unknown): number {
    return fromCents(toCents(v));
  },

  /** a + b, exact to the cent. */
  add(a: unknown, b: unknown): number {
    return fromCents(toCents(a) + toCents(b));
  },

  /** a - b, exact to the cent. */
  subtract(a: unknown, b: unknown): number {
    return fromCents(toCents(a) - toCents(b));
  },

  /** Sum a list of money values, exact to the cent. */
  sum(values: Array<unknown>): number {
    let cents = 0;
    for (const v of values) cents += toCents(v);
    return fromCents(cents);
  },

  /**
   * amount × quantity where quantity is a (possibly fractional) count, not
   * money. Computed in cents then rounded once. e.g. line total = unit × qty.
   */
  multiply(amount: unknown, quantity: unknown): number {
    return fromCents(Math.round(toCents(amount) * num(quantity)));
  },

  /**
   * Apply a percentage to a money base (e.g. VAT, commission).
   * percentToApply is a percent value like 15 for 15%.
   */
  percent(base: unknown, percentToApply: unknown): number {
    return fromCents(Math.round((toCents(base) * num(percentToApply)) / 100));
  },

  /** Cents integer for external systems that need the smallest unit (Paystack). */
  toCents(v: unknown): number {
    return toCents(v);
  },

  /** Exact money equality (to the cent). */
  isEqual(a: unknown, b: unknown): boolean {
    return toCents(a) === toCents(b);
  },

  /** True if |a - b| <= toleranceRands (default exact-to-cent). */
  isClose(a: unknown, b: unknown, toleranceRands = 0): boolean {
    return Math.abs(toCents(a) - toCents(b)) <= toCents(toleranceRands);
  },

  /** a > b comparison at cent precision. */
  isGreater(a: unknown, b: unknown): boolean {
    return toCents(a) > toCents(b);
  },
};
