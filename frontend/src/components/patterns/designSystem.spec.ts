import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guards for the design system.
 *
 * These exist because the defects below are invisible in review. Nobody
 * approves a commit that says "adds 3 keyboard-inaccessible buttons"; they
 * approve a commit that adds a feature, and the inaccessible button arrives
 * inside it. A guard is the only thing that reliably notices.
 *
 * The baselines were measured on 2026-10-04, not chosen. They are the starting
 * point for a migration, not a target — every one of them is a count that
 * should go DOWN. Each is a ceiling: the suite fails if the number rises, and
 * passes as the migration improves it. Lower the ceiling when you fix a case.
 */

// __dirname is src/components/patterns, so this resolves to src/
const SRC = join(__dirname, '../..');
const PAGES = join(SRC, 'pages');
const COMPONENTS = join(SRC, 'components');
const UI = join(COMPONENTS, 'ui');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = [...walk(PAGES), ...walk(COMPONENTS)];
const read = (f: string) => readFileSync(f, 'utf8');

/** Count files matching a regex, returning the paths so failures name names. */
function matching(re: RegExp): string[] {
  return files.filter((f) => re.test(read(f)));
}

describe('design system — the barrel stays a barrel', () => {
  it('every primitive file is re-exported, and nothing is defined inline', () => {
    const index = read(join(UI, 'index.tsx'));

    // The previous version of this file ignored all 27 primitives and defined
    // two light-theme stubs instead. A barrel that defines anything is how that
    // happens again.
    expect(index).not.toMatch(/^\s*export (const|function|class|default)\s/m);
    expect(index).not.toMatch(/className=/);
  });

  it('re-exports every primitives file except sidebar, which is excluded on purpose', () => {
    const index = read(join(UI, 'index.tsx'));
    const primitives = readdirSync(UI).filter(
      (f) => /\.tsx?$/.test(f) && f !== 'index.tsx' && f !== 'sidebar.tsx',
    );
    const missing = primitives.filter((f) => !index.includes(`./${f.replace(/\.tsx?$/, '')}`));
    expect(missing).toEqual([]);
  });

  it('sidebar stays excluded, with the reason recorded in the file', () => {
    const index = read(join(UI, 'index.tsx'));
    expect(index).not.toMatch(/from '\.\/sidebar'/);
    // If someone re-exports it, they must first read why it was left out.
    expect(index).toMatch(/Deliberately NOT re-exported/);
  });
});

describe('design system — accessibility ceilings', () => {
  /**
   * A click handler on a div/span/list row is invisible to a keyboard and
   * unannounced by a screen reader. `role` and `tabIndex` make one acceptable;
   * without both there is no way to reach or operate it.
   */
  it('no file adds a clickable element with no keyboard path (ceiling: 44)', () => {
    const offenders = files.filter((f) => {
      const src = read(f);
      const clicks = src.match(/<(div|span|li|tr|td)\b[^>]*onClick/g) ?? [];
      return clicks.some((tag) => !/role=/.test(tag) && !/tabIndex/.test(tag));
    });
    expect(offenders.length).toBeLessThanOrEqual(44);
  });

  it('the pattern components themselves set the example (zero offenders)', () => {
    const patterns = walk(join(COMPONENTS, 'patterns')).filter((f) => !f.includes('index.ts'));
    const offenders = patterns.filter((f) => {
      const src = read(f);
      const clicks = src.match(/<(div|span|li|tr|td)\b[^>]*onClick/g) ?? [];
      return clicks.some((tag) => !/role=/.test(tag) && !/tabIndex/.test(tag));
    });
    expect(offenders).toEqual([]);
  });
});

describe('design system — adoption ceilings', () => {
  /**
   * These are floors, not ceilings: once a page adopts a pattern it may not
   * stop. Each number starts at 0 because the layer was introduced today.
   * Raise the floor as pages migrate; never lower it.
   */
  const adopted = (name: string) =>
    matching(new RegExp(`\\b${name}\\b`)).filter((f) => !f.includes('/patterns/')).length;

  it('records adoption so a migration cannot quietly reverse', () => {
    const baseline: Record<string, number> = {
      EmptyState: 0,
      AsyncState: 0,
      DataTable: 0,
      PageHeader: 0,
      Pagination: 0,
      ConfirmDialog: 0,
    };
    for (const [name, floor] of Object.entries(baseline)) {
      expect(adopted(name), `${name} adoption fell below ${floor}`).toBeGreaterThanOrEqual(floor);
    }
  });
});

describe('design system — the primitives are not duplicated', () => {
  /**
   * If a page defines its own button or table wrapper, it is not using the
   * library. This is a smoke test for the migration rather than a hard rule:
   * it counts only the clearest cases (a local component named after a
   * primitive that already exists).
   */
  it('no page or component re-declares a Button or Table that shadows the library', () => {
    const offenders = files.filter((f) => {
      if (f.includes('/ui/')) return false;
      const src = read(f);
      return /^\s*(export )?const (Button|Table)\s*[:=]/m.test(src);
    });
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });
});

describe('design system — the layer is importable as one thing', () => {
  it('exposes every pattern from a single barrel', () => {
    const barrel = join(COMPONENTS, 'patterns', 'index.ts');
    expect(existsSync(barrel)).toBe(true);
    const src = read(barrel);
    for (const name of [
      'AsyncState',
      'EmptyState',
      'ErrorState',
      'PageHeader',
      'StatCard',
      'StatusBadge',
      'Pagination',
      'DataTable',
      'ConfirmDialog',
    ]) {
      expect(src, `${name} is missing from the patterns barrel`).toContain(name);
    }
  });
});
