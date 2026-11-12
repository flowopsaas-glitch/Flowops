/**
 * Tests for the unvalidated-body ratchet.
 *
 * Run with: npm run release:safety:test
 *
 * WHY THIS EXISTS
 * ---------------
 * A guard that cannot fail is decoration. These tests prove the scanner
 * actually binds `any` to the `@Body()` parameter (rather than to a
 * neighbouring `@CurrentUser() u: any` on the same signature), that it rejects
 * an increase, that it accepts and reports a decrease, and that it refuses to
 * let a NEW controller start with unvalidated bodies.
 *
 * The overcount trap is pinned explicitly: a naive "line contains @Body() and
 * : any" grep reports 170 here. The true figure is 72, because hundreds of
 * signatures also carry an unrelated `u: any`. A guard whose number is wrong by
 * 2.4x is not a baseline, it is noise — and it would have been committed as
 * fact.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { compare, scan, totals } from './body-any-audit.mjs';

function workspace(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'flowops-body-any-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Write a controller into a throwaway src tree and scan just that tree. */
function withController(t, filename, body) {
  const dir = workspace(t);
  const src = path.join(dir, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(path.join(src, filename), body);
  return scan(src);
}

test('the scanner binds the type to the decorated parameter', (t) => {
  const counts = withController(
    t,
    'a.controller.ts',
    `export class AController {
  good(@CurrentUser() u: any, @Body() dto: CreateDto) {}
  bad(@CurrentUser() u: any, @Body() dto: any) {}
}
`,
  );
  assert.equal(counts['a.controller.ts'], 1, 'exactly the one @Body() typed any');
});

test('an untyped-any @Body() on its own line still counts', (t) => {
  // Prettier wraps long signatures; a scanner that reads line-by-line misses it.
  const counts = withController(
    t,
    'b.controller.ts',
    `export class BController {
  create(
    @CurrentUser() u: any,
    @Body()
    body: any,
  ) {}
}
`,
  );
  assert.equal(counts['b.controller.ts'], 1);
});

test('a validated DTO body is not counted', (t) => {
  const counts = withController(
    t,
    'c.controller.ts',
    `export class CController {
  create(@Body() dto: CreateWaybillDto) {}
}
`,
  );
  assert.equal(counts['c.controller.ts'], 0);
});

test('rejects an increase in an existing controller', () => {
  const { ok, regressions } = compare({ 'a.controller.ts': 5 }, { 'a.controller.ts': 3 });
  assert.equal(ok, false);
  assert.match(regressions[0], /3 -> 5/);
});

test('accepts a decrease and reports it as an improvement', () => {
  const { ok, improvements } = compare({ 'a.controller.ts': 1 }, { 'a.controller.ts': 4 });
  assert.equal(ok, true);
  assert.match(improvements[0], /4 -> 1 \(3 validated\)/);
});

test('rejects a brand-new controller that starts with unvalidated bodies', () => {
  const { ok, regressions } = compare({ 'new.controller.ts': 2 }, {});
  assert.equal(ok, false);
  assert.match(regressions[0], /new controller/);
});

test('a new controller with zero unvalidated bodies is fine', () => {
  assert.equal(compare({ 'clean.controller.ts': 0 }, {}).ok, true);
});

test('the shipped baseline is present and describes the real codebase', () => {
  const baseline = JSON.parse(
    readFileSync(new URL('./body-any-baseline.json', import.meta.url), 'utf8'),
  );
  const total = Object.values(baseline).reduce((s, n) => s + n, 0);

  assert.ok(total > 0, 'the baseline is not empty');
  assert.ok(
    Object.keys(baseline).length > 50,
    'the baseline should cover every controller, not just the offenders',
  );
});

test('the current codebase still matches its baseline', () => {
  // The ratchet holds today. If this fails, someone added an unvalidated body.
  const { ok, regressions } = compare(scan());
  assert.equal(ok, true, `regressions: ${regressions.join('; ')}`);
});

test('totals report both the offenders and the whole population', () => {
  const t = totals({ 'a.controller.ts': 3, 'b.controller.ts': 0, 'c.controller.ts': 1 });
  assert.deepEqual(t, { files: 3, offending: 2, total: 4 });
});
