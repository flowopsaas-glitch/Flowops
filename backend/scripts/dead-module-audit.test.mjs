/**
 * Tests for the dead-module ratchet.
 *
 * Run with: npm run release:safety:test
 *
 * WHY THIS EXISTS
 * ---------------
 * A guard that cannot fail is decoration. These tests prove the scanner
 * actually resolves imports (rather than silently dropping them), that it
 * reports a genuinely unreachable file, that it accepts a decrease, and that
 * it refuses to let a NEW module start life unwired.
 *
 * Two bugs in the scanner are pinned here because both produced a confident
 * wrong answer rather than an error, which is the dangerous kind:
 *
 *   1. Dotted filenames. Asking for the `.ts` form of `redis.module` by
 *      substituting the suffix yields `redis.ts` and loses the file. The
 *      symptom was the entire backend reported as dead — main.ts appeared to
 *      reach 3 files instead of 521.
 *   2. Aliases. `@/*` -> `src/*` failed to parse, so every `@/` import was
 *      treated as an external package. The symptom was a number that looked
 *      merely high, which is much harder to notice.
 *
 * Both are asserted at the unit level, because a scanner that silently
 * mis-resolves reports a plausible number and gets believed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  MIN_REASON,
  PROJECTS,
  compare,
  resolveSpec,
  scanProject,
  specifiersOf,
} from './dead-module-audit.mjs';

function workspace(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'flowops-dead-mod-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const srcDir = path.join(dir, 'src');
  mkdirSync(srcDir, { recursive: true });
  return {
    dir,
    srcDir,
    write(rel, contents) {
      const full = path.join(dir, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, contents);
      return full;
    },
    project(extra = {}) {
      return {
        id: 'probe',
        root: dir,
        srcDir,
        entry: ['src/main.ts'],
        alias: { '@': 'src' },
        testRe: /\.(test|spec)\.ts$/,
        extraRoots: [],
        ...extra,
      };
    },
  };
}

// ── resolution ──────────────────────────────────────────────────────────────

test('resolves a dotted filename instead of truncating it at the dot', (t) => {
  const w = workspace(t);
  const from = w.write('src/app.module.ts', '');
  const target = w.write('src/redis/redis.module.ts', 'export const M = 1;');
  const p = w.project();

  // The bug: replacing the suffix turns redis.module into redis.ts.
  const resolved = resolveSpec('./redis/redis.module', from, p);
  assert.equal(resolved, target, 'dotted module names must resolve to their real file');
});

test('resolves the @/ alias instead of treating it as an external package', (t) => {
  const w = workspace(t);
  const from = w.write('src/main.ts', '');
  const target = w.write('src/lib/foo.ts', 'export const F = 1;');
  const p = w.project();

  assert.equal(resolveSpec('@/lib/foo', from, p), target);
  assert.equal(resolveSpec('@nestjs/core', from, p), null, 'real packages stay unresolved');
});

test('reads specifiers out of every import form', (t) => {
  const src = [
    "import { A } from './a';",
    "import B from '@/lib/b';",
    "import './side-effect';",
    "export { C } from './c';",
    "const d = await import('./d');",
    "const e = require('./e');",
  ].join('\n');
  const found = specifiersOf(src);
  for (const spec of ['./a', '@/lib/b', './side-effect', './c', './d', './e']) {
    assert.ok(found.includes(spec), `missed ${spec}`);
  }
});

// ── reachability ────────────────────────────────────────────────────────────

test('a module imported only by another dead module is still reported dead', (t) => {
  const w = workspace(t);
  w.write('src/main.ts', "import './live';");
  w.write('src/live.ts', 'export const L = 1;');
  // orphan imports orphan2; neither is reachable from main
  w.write('src/orphan.ts', "import './orphan2';\nexport const O = 1;");
  w.write('src/orphan2.ts', 'export const O2 = 1;');

  const scan = scanProject(w.project());
  const dead = scan.unreachable.filter((u) => !u.isTest).map((u) => u.file).sort();

  assert.deepEqual(dead, ['src/orphan.ts', 'src/orphan2.ts']);
  assert.equal(
    scan.unreachable.filter((u) => u.isTest).length,
    0,
    'a spec is its own root and is never counted as dead code',
  );
});

test('reachability is transitive: a barrel does not launder its contents', (t) => {
  const w = workspace(t);
  w.write('src/main.ts', "import './live';");
  w.write('src/live.ts', 'export const L = 1;');
  w.write('src/barrel.ts', "export * from './hidden';");
  w.write('src/hidden.ts', 'export const H = 1;');

  const scan = scanProject(w.project());
  const dead = scan.unreachable.filter((u) => !u.isTest).map((u) => u.file).sort();
  assert.deepEqual(dead, ['src/barrel.ts', 'src/hidden.ts']);
});

test('ambient .d.ts files are roots, not dead code', (t) => {
  const w = workspace(t);
  w.write('src/main.ts', "import T from 'tesseract.js';");
  // A type shim is included by tsconfig and imported by nothing.
  w.write('src/types/tesseract.d.ts', "declare module 'tesseract.js';");

  const scan = scanProject(w.project());
  const dead = scan.unreachable.filter((u) => !u.isTest).map((u) => u.file);
  assert.deepEqual(dead, [], 'a .d.ts is ambient; flagging it would flag every type shim');
});

// ── the ratchet ─────────────────────────────────────────────────────────────

test('an unreachable module with no exemption is unresolved', (t) => {
  const w = workspace(t);
  w.write('src/main.ts', "import './live';");
  w.write('src/live.ts', 'export const L = 1;');
  w.write('src/new-thing.ts', 'export const N = 1;');

  const scan = scanProject(w.project());
  const { unresolved, exempted } = compare(scan, {});
  assert.equal(exempted.length, 0);
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].file, 'src/new-thing.ts');
});

test('a decision requires a reason long enough to argue with', (t) => {
  const w = workspace(t);
  w.write('src/main.ts', "import './live';");
  w.write('src/live.ts', 'export const L = 1;');
  w.write('src/orphan.ts', 'export const O = 1;');

  const scan = scanProject(w.project());
  const short = 'legacy';
  assert.ok(short.length < MIN_REASON);

  const { unresolved } = compare(scan, { 'probe:src/orphan.ts': short });
  assert.equal(unresolved.length, 1, 'a one-word exemption is not a decision');
  assert.match(unresolved[0].problem, /too short/);

  const { unresolved: ok } = compare(scan, {
    'probe:src/orphan.ts':
      'Typed encoding of a supplied source document that no feature consumes yet, and deleting it would discard the transcription.',
  });
  assert.equal(ok.length, 0);
});

test('an exemption for a file that no longer exists is stale and fails', (t) => {
  const w = workspace(t);
  w.write('src/main.ts', "import './live';");
  w.write('src/live.ts', 'export const L = 1;');

  const scan = scanProject(w.project());
  const { stale, unresolved } = compare(scan, {
    'probe:src/gone.ts': 'This module was deleted last sprint and the exemption outlived it.',
  });
  assert.equal(unresolved.length, 0);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].key, 'probe:src/gone.ts');
});

test('wiring a module up makes its exemption stale, so the list cannot become a junk drawer', (t) => {
  const w = workspace(t);
  w.write('src/main.ts', "import './live';\nimport './was-dead';");
  w.write('src/live.ts', 'export const L = 1;');
  w.write('src/was-dead.ts', 'export const W = 1;');

  const scan = scanProject(w.project());
  const { stale, exempted, unresolved } = compare(scan, {
    'probe:src/was-dead.ts': 'Nothing imported this yet; it was waiting on the feature that now landed.',
  });
  assert.equal(unresolved.length, 0);
  assert.equal(exempted.length, 0);
  assert.equal(stale.length, 1, 'a wired-up module must have its exemption removed');
});

// ── the real repo ───────────────────────────────────────────────────────────

test('the configured projects actually resolve their entry points', (t) => {
  for (const p of PROJECTS) {
    const scan = scanProject(p);
    assert.deepEqual(scan.missingEntries, [], `${p.id} entry point must exist`);
    assert.deepEqual(scan.missingExtraRoots, [], `${p.id} declared extra roots must exist`);
    assert.ok(scan.prodReachable > 50, `${p.id} reached only ${scan.prodReachable} files — resolution is probably broken`);
  }
});
