/**
 * Money consistency — one primitive, enforced.
 *
 * WHY. FlowOps invoices people. `src/common/money.util.ts` rounds money half-away-from-zero
 * in integer cents, and it is the only place that should. In the audit that produced this
 * file, NINE modules had re-implemented rounding inline, in three mutually incompatible
 * ways:
 *
 *   • `Math.round((n + Number.EPSILON) * 100) / 100` — adds the epsilon in a fixed
 *     direction, so NEGATIVE amounts (credit notes, reversals, loss-making margins)
 *     rounded toward zero instead of half-away-from-zero. -1.005 gave -1.00, not -1.01.
 *   • `Math.round(n * 100) / 100` — no epsilon at all, so exact half-cents went the
 *     wrong way in both directions. 1.005 gave 1.00, not 1.01.
 *   • a correct delegation to `Money.round`, in one file.
 *
 * A one-cent disagreement between a quote, an invoice and an accounting export is a
 * reconciliation break that costs days to find. So: one primitive, and a guard.
 *
 * WHAT THIS GUARDS. Not that every `Math.round(x * 100) / 100` is gone — plenty of those are
 * kilometres, kilograms and probabilities, and rounding those is fine. It guards the thing
 * that actually causes the damage: a NAMED rounding helper re-implementing money rounding
 * outside money.util, which is how all nine copies started.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Money } from './money.util';
import { roundMoney as claimsRoundMoney } from '../claims/claims.rules';
import { roundMoney as maintenanceRoundMoney } from '../maintenance/maintenance.rules';

const SRC = join(__dirname, '..');

// ── the primitive's own contract ─────────────────────────────────────────────

describe('Money', () => {
  it('rounds half away from zero, in BOTH directions', () => {
    expect(Money.round(1.005)).toBe(1.01);
    expect(Money.round(-1.005)).toBe(-1.01);
    expect(Money.round(0.615)).toBe(0.62);
    expect(Money.round(-0.615)).toBe(-0.62);
    expect(Money.round(1.115)).toBe(1.12);
    expect(Money.round(-1.115)).toBe(-1.12);
  });

  it('is symmetric: rounding -x is exactly the negative of rounding x', () => {
    for (const v of [1.005, 2.675, 8.165, 0.615, 1.115, 0.005, 12.345, 99.995]) {
      expect(Money.round(-v)).toBe(-Money.round(v));
    }
  });

  it('never loses the cent: 0.1 + 0.2 is exactly 0.3', () => {
    expect(Money.round(0.1 + 0.2)).toBe(0.3);
    expect(Money.sum([0.1, 0.2, 0.3])).toBe(0.6);
  });
});

// ── every exported money helper must BE the primitive ────────────────────────

describe('exported money helpers agree with the primitive', () => {
  const VALUES = [1.005, -1.005, 0.615, -0.615, 1.115, -1.115, -0.005, 0.005, 2.675, -2.675, 8.165, -8.165, 0, 4250, -4250];

  it.each([
    ['claims.roundMoney', claimsRoundMoney],
    ['maintenance.roundMoney', maintenanceRoundMoney],
  ])('%s is identical to Money.round, including negatives', (_name, fn) => {
    for (const v of VALUES) expect(fn(v)).toBe(Money.round(v));
  });
});

// ── the drift guard ─────────────────────────────────────────────────────────

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) tsFiles(p, out);
    else if (e.endsWith('.ts') && !e.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

/** A named helper that re-implements money rounding, e.g. `const round2 = (n) => Math.round(n*100)/100`. */
const DUPLICATE_HELPER =
  /(?:const|let|function)\s+(round2|roundMoney|roundAmount|roundTo2|r2|roundCents)\b[^=;]*[=(][^;]*Math\.round\s*\(/;

/**
 * Named rounding helpers that are NOT money, and are allowed to stay.
 *
 * Each entry must say what it rounds. The point of the list is not to excuse them — it is
 * to make anyone who later uses one of them on an amount trip over this comment first.
 */
const ALLOWED_NON_MONEY: Record<string, string> = {
  'src/rail/rail-envelope.ts': 'axle load in TONNES, not currency — verified 2026-11-11',
};

describe('no module re-implements money rounding', () => {
  it('finds no named rounding helper outside money.util', () => {
    const offenders = tsFiles(SRC)
      .filter((f) => !f.endsWith(join('common', 'money.util.ts')))
      .map((f) => ({ f, src: readFileSync(f, 'utf8') }))
      .flatMap(({ f, src }) =>
        src.split('\n').map((line, i) => ({ f, i: i + 1, line }))
          .filter(({ line }) => DUPLICATE_HELPER.test(line))
          .map(({ i, line }) => ({ rel: f.replace(SRC + '/', 'src/'), i, line })),
      )
      .filter(({ rel }) => !(rel in ALLOWED_NON_MONEY))
      .map(({ rel, i, line }) => `${rel}:${i}  ${line.trim().slice(0, 90)}`);

    expect(offenders).toEqual([]);
  });

  it('the allowlist still describes real lines — an entry for a line that moved is a failure', () => {
    // An allowlist entry that no longer matches anything is dead weight that hides a
    // future offender. Every entry must still be doing something.
    for (const rel of Object.keys(ALLOWED_NON_MONEY)) {
      const src = readFileSync(join(SRC, rel.replace(/^src\//, '')), 'utf8');
      expect(src.split('\n').some((l) => DUPLICATE_HELPER.test(l))).toBe(true);
    }
  });

  it('is actually looking — the detector must catch a known-bad helper', () => {
    // A guard that matches nothing is worse than no guard: it passes forever on silence.
    const samples = [
      'const round2 = (n: number) => Math.round(n * 100) / 100;',
      'const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;',
      'export function roundMoney(value: number): number {\n  return Math.round((value + Number.EPSILON) * 100) / 100;\n}',
      'function round2(value: number): number {\n  return Math.round(value * 100) / 100;\n}',
    ];
    for (const s of samples) expect(DUPLICATE_HELPER.test(s)).toBe(true);
  });

  it('does not fire on ordinary non-money rounding', () => {
    // Kilometres, kilograms and probabilities may round inline; only named helpers are policed.
    for (const s of [
      'const km = Math.round(distanceKm * 100) / 100;',
      '      totalCo2Kg: Math.round(totalCo2 * 100) / 100,',
      'const score = Math.round(score * 100) / 100;',
    ]) expect(DUPLICATE_HELPER.test(s)).toBe(false);
  });
});
