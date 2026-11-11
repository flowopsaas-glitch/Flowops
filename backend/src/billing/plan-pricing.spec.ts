/**
 * The Enterprise list price is written in three places, and all three touch real money:
 *
 *   - plan-entitlements.ts `priceZar`    → what the owner console reports as MRR/ARPA
 *   - owner.service.ts `PLAN_PRICE_ZAR`  → the analytics fallback for a tenant
 *   - paystack.service.ts `amountZar`    → the amount actually sent to Paystack
 *
 * They drifted apart once already. This is the guard: change one, change all three, or the
 * build fails. It deliberately does NOT assert WHAT the price is — that is a commercial
 * decision and it moves. It asserts only that the copies agree.
 *
 * The two non-importable copies are read from source rather than imported on purpose:
 * importing owner.service.ts drags in bcrypt, which couples a pricing assertion to a native
 * build. Reading the literal keeps this test hermetic and runnable anywhere.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAN_ENTITLEMENTS } from './plan-entitlements';

const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

/** owner.service.ts: private static readonly PLAN_PRICE_ZAR = { starter: 0, ... } */
function ownerPrices(): Record<string, number> {
  const body = src('../owner/owner.service.ts').match(/PLAN_PRICE_ZAR[^=]*=\s*\{([\s\S]*?)\n {4}\};/)?.[1] ?? '';
  return Object.fromEntries(
    [...body.replace(/\/\/.*$/gm, '').matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]),
  );
}

/** paystack.service.ts: const planMap = { 'PLN_x': { name: 'professional', amountZar: 19999 }, ... } */
function paystackAmounts(): Record<string, { name: string; amountZar: number }> {
  // There are three `planMap` objects in the file; only one carries an amount, so the
  // signature is part of the pattern — a loose match would silently read the wrong block.
  const body = src('../paystack/paystack.service.ts')
    .match(/const planMap: Record<string, \{ name: string; amountZar: number \}> = \{([\s\S]*?)\n {4}\};/)?.[1] ?? '';
  return Object.fromEntries(
    [...body.replace(/\/\/.*$/gm, '').matchAll(/'(\w+)':\s*\{\s*name:\s*'(\w+)',\s*amountZar:\s*(\d+)\s*\}/g)]
      .map((m) => [m[1], { name: m[2], amountZar: Number(m[3]) }]),
  );
}

// The only plan codes that carry a live Paystack subscription object.
const PLAN_CODES: Record<string, string> = {
  professional_25: 'PLN_l3kobthzahnkpf3',
  enterprise: 'PLN_9at9kn2ra8jtae0',
};

describe('plan pricing does not drift between the three places it is written', () => {
  const owner = ownerPrices();
  const paystack = paystackAmounts();

  it('found all three copies to compare', () => {
    // A guard that silently reads nothing is worse than no guard.
    expect(Object.keys(owner).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(paystack).length).toBeGreaterThanOrEqual(2);
  });

  it('Paystack charges what the entitlement says the plan costs', () => {
    for (const [planId, code] of Object.entries(PLAN_CODES)) {
      const list = PLAN_ENTITLEMENTS[planId as keyof typeof PLAN_ENTITLEMENTS].priceZar;
      const charged = paystack[code]?.amountZar;
      expect(`${code}: entitlement ${list} vs charged ${charged}`).toBe(`${code}: entitlement ${list} vs charged ${list}`);
    }
  });

  it('the owner console analytics agree with the entitlement list price', () => {
    expect(`enterprise: ${owner.enterprise}`).toBe(`enterprise: ${PLAN_ENTITLEMENTS.enterprise.priceZar}`);
    expect(`starter: ${owner.starter}`).toBe('starter: 0');
    expect(`professional: ${owner.professional}`).toBe(`professional: ${PLAN_ENTITLEMENTS.professional_25.priceZar}`);
  });

  it('the published ladder still ascends, so no tier is cheaper than the one below it', () => {
    const ladder = [
      PLAN_ENTITLEMENTS.starter.priceZar,
      PLAN_ENTITLEMENTS.professional.priceZar,
      PLAN_ENTITLEMENTS.professional_10.priceZar,
      PLAN_ENTITLEMENTS.professional_25.priceZar,
      PLAN_ENTITLEMENTS.professional_50.priceZar,
      PLAN_ENTITLEMENTS.enterprise.priceZar,
    ];
    expect(ladder).toEqual([...ladder].sort((a, b) => a - b));
    expect(new Set(ladder).size).toBe(ladder.length);
  });
});
