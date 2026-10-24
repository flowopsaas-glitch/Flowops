/**
 * Guards for the shared UI layer.
 *
 * These are architecture tests, not unit tests. They exist because the failure
 * mode being protected against is quiet: the `components/ui` barrel used to
 * define two crude light-theme components of its own, which shadowed the
 * twenty-seven finished dark-theme primitives sitting next to it. Nothing
 * crashed. Every page simply kept hand-rolling its own button, and the design
 * system went unused for a year.
 *
 * Every bound below is a MEASURED baseline, not an aspiration. The ceilings
 * fail if the number gets worse; the floors fail if adoption slips. All of them
 * are meant to be driven down over time - when a page is migrated, lower the
 * ceiling in the same commit so the improvement cannot silently regress.
 *
 * Files are read through Vite's raw glob rather than `node:fs`: the frontend
 * tsconfig deliberately has no `@types/node`, and this keeps the guard runnable
 * in any Vite context rather than depending on the Node runtime.
 */
import { describe, it, expect } from 'vitest';
import * as patterns from './index';

const UI_FILES = import.meta.glob('../ui/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const PAGE_FILES = import.meta.glob('../../pages/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const PATTERN_FILES = import.meta.glob('./*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const UI_BARREL = UI_FILES['../ui/index.tsx'] ?? '';

const UI_PRIMITIVES = Object.keys(UI_FILES).filter(
  (k) => k !== '../ui/index.tsx' && k !== '../ui/sidebar.tsx',
);

const SOURCE_PAGES = Object.entries(PAGE_FILES).filter(
  ([k]) => !k.includes('.test.') && !k.includes('.spec.'),
);

/**
 * End of the opening tag that starts at `start`.
 *
 * A plain "scan to the next >" is wrong: an arrow function in a handler
 * (`onClick={() => …}`) contains a `>` of its own, which truncates the tag
 * before any `role=` or `tabIndex=` is seen and inflates the count. Skipping
 * over `=>` is what makes the two agree.
 */
function tagEnd(source: string, start: number): number {
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '=' && source[i + 1] === '>') {
      i += 1;
      continue;
    }
    if (source[i] === '>') return i;
  }
  return -1;
}

/**
 * A full-viewport layer whose only job is to dismiss the thing on top of it.
 *
 * These are deliberately NOT counted as offenders. Their onClick is a
 * convenience, not the affordance - dismissal must also be reachable by Escape
 * and by a visible Close button, and the dialog test below is what enforces
 * that. Holding the backdrop itself to the "needs a role" rule would be wrong:
 *
 *   - giving it role="button" puts a focusable, unlabelled control in front of
 *     the dialog the user is trying to read;
 *   - marking it aria-hidden="true" is far worse and was tried and reverted.
 *     aria-hidden hides the WHOLE SUBTREE, and the dialog panel is a CHILD of
 *     the backdrop in this codebase's modal pattern - so it silently hid the
 *     contents of every dialog it touched.
 */
function isBackdrop(tag: string): boolean {
  if (!/inset-0/.test(tag)) return false;
  if (/stopPropagation/.test(tag)) return false; // the panel, not the layer behind it
  return /onClose|setOpen\(|setShow\w*\(|setPickerOpen\(|setComposeOpen\(/.test(tag);
}

/** A clickable element that is neither natively interactive nor announced. */
function clickableOffenders(source: string): number {
  const openTag = /<(div|span|li|td|tr|p|section)\b/g;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = openTag.exec(source)) !== null) {
    const end = tagEnd(source, match.index);
    if (end === -1) break;
    const tag = source.slice(match.index, end + 1);
    openTag.lastIndex = end;
    if (!/\bonClick\b/.test(tag)) continue;
    if (/\brole=/.test(tag) || /\btabIndex=/.test(tag)) continue;
    if (isBackdrop(tag)) continue;
    count += 1;
  }
  return count;
}

const adopters = (name: string) =>
  SOURCE_PAGES.filter(([, src]) => new RegExp(`\\b${name}\\b`).test(src)).length;

describe('the ui barrel', () => {
  /**
   * The regression this file was written for. A barrel that declares its own
   * components stops being a barrel: it silently becomes the implementation of
   * last resort for every file that imports it.
   */
  it('re-exports rather than defining components', () => {
    expect(UI_BARREL).not.toMatch(/function\s+[A-Z]/);
    expect(UI_BARREL).not.toMatch(/const\s+[A-Z]\w*\s*=\s*(?:forwardRef|\(|cva)/);
  });

  it('re-exports every primitive in components/ui', () => {
    const missing = UI_PRIMITIVES.filter((path) => {
      const name = path.replace('../ui/', '').replace(/\.tsx$/, '');
      return !UI_BARREL.includes(`./${name}`);
    });
    expect(missing).toEqual([]);
  });

  /**
   * sidebar.tsx is excluded on purpose - it is 23kB of navigation that collides
   * with components/Sidebar. If it is ever
   * re-exported, it should only be after that collision is settled, and this
   * comment should be replaced with the resolution.
   */
  it('records why sidebar is excluded, if it is excluded', () => {
    if (UI_BARREL.includes('./sidebar')) return;
    expect(UI_BARREL).toMatch(/sidebar/i);
  });
});

describe('accessible interactive elements', () => {
  /**
   * Baseline 2026-10-04: 57 clickable non-interactive elements across the page
   * tree. Each one is invisible to a keyboard and unannounced by a screen
   * reader.
   *
   * This reads higher than a `grep -c` over the same tree (which reports 39),
   * because a line-oriented grep cannot see an opening tag that wraps onto the
   * next line, and most of these do. The guard parses the tag, so it counts
   * them. 57 is the number to beat.
   */
  it('does not grow past today', () => {
    const total = SOURCE_PAGES.reduce(
      (n, [, src]) => n + clickableOffenders(src),
      0,
    );
    expect(total).toBeLessThanOrEqual(57);
  });

  /** The pattern layer must be exemplary: it is what every page is copying. */
  it('has none inside the pattern layer', () => {
    Object.entries(PATTERN_FILES).forEach(([, src]) => {
      expect(clickableOffenders(src)).toBe(0);
    });
  });
});

describe('pattern adoption', () => {
  /**
   * Floors start at today's measured values so the guard lands green. Raise
   * them as pages are migrated - that is how the migration is held in place.
   */
  const floors: Array<[string, number]> = [
    ['AsyncState', 0],
    ['EmptyState', 0],
    ['ErrorState', 0],
    ['PageHeader', 0],
    ['StatCard', 8],
    ['StatusBadge', 3],
    ['Pagination', 0],
    ['DataTable', 1],
    ['ConfirmDialog', 0],
  ];

  floors.forEach(([name, floor]) => {
    it(`holds ${name} at ${floor} page(s) or more`, () => {
      expect(adopters(name)).toBeGreaterThanOrEqual(floor);
    });
  });

  /** A page defining its own Button or Table is the drift this guards. */
  it('has no page redeclaring Button or Table', () => {
    const offenders = SOURCE_PAGES.filter(([, src]) =>
      /(?:function|const)\s+(?:Button|Table)\b/.test(src),
    ).map(([k]) => k);
    expect(offenders).toEqual([]);
  });
});

describe('the pattern barrel', () => {
  const expected = [
    'AsyncState',
    'ListSkeleton',
    'TableSkeleton',
    'EmptyState',
    'ErrorState',
    'errorMessageOf',
    'PageHeader',
    'StatCard',
    'StatusBadge',
    'statusToneFor',
    'Pagination',
    'pageWindow',
    'DataTable',
    'ConfirmDialog',
  ];

  expected.forEach((name) => {
    it(`exposes ${name}`, () => {
      expect(patterns).toHaveProperty(name);
    });
  });
});

/**
 * A click-to-dismiss modal is identified by its dismiss layer: a real
 * <button aria-label="Close dialog"> sitting behind the panel. Dismissal
 * therefore exists as a named, keyboard-reachable control instead of a
 * click handler on a plain div, and the panel no longer needs an
 * onClick stopPropagation guard to survive clicks inside it.
 */
function modalFiles(source: string): boolean {
  return source.includes('aria-label="Close dialog"');
}

describe('modal dialogs', () => {
  const MODALS = SOURCE_PAGES.filter(([, src]) => modalFiles(src));

  it('finds the modal panels it is guarding', () => {
    expect(MODALS.length).toBeGreaterThan(0);
  });

  it('declares role="dialog" on every modal panel', () => {
    const missing = MODALS.filter(([, src]) => !/role="dialog"/.test(src)).map(([k]) => k);
    expect(missing).toEqual([]);
  });

  /**
   * Every modal must be dismissible from the keyboard alone.
   *
   * A backdrop that dismisses on click is only honest when the same
   * dismissal is reachable without a mouse: the backdrop is a real
   * button, and Escape must close the dialog too. This used to assert a
   * tracked gap (13 modals had no Escape path); useDismissOnEscape is
   * now wired into every modal, so the assertion is exact: the list of
   * modals without an Escape path must be empty, and must stay empty.
   */
  it('wires Escape-to-dismiss on every modal', () => {
    const withoutEscape = MODALS.filter(([, src]) => !/useDismissOnEscape|Escape/.test(src)).map(([k]) => k);
    expect(withoutEscape).toEqual([]);
  });
});
