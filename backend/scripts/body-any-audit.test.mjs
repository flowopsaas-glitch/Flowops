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
  return scan(src).counts;
}

/** scan() with exemptions supplied, for the exemption tests below. */
function scanWith(src, exemptions) {
  return scan(src, exemptions);
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

  // This used to assert `total > 0` — "the baseline is not empty" — which was a
  // reasonable sanity check when the baseline recorded a large backlog: an empty
  // one would have meant the scanner had gone blind.
  //
  // The backlog is now cleared, so that assertion inverted: it started demanding
  // the presence of the very thing the ratchet exists to remove, and it now fails
  // on success. Kept here, rewritten, because the failure is informative — a
  // guard that has to be deleted once it works was only ever half a guard.
  //
  // What still holds as a health signal: the baseline must cover EVERY
  // controller, not just the offenders. A scanner that silently stopped seeing
  // files would shrink this map, and that is still the going-blind failure.
  assert.ok(
    Object.keys(baseline).length > 50,
    'the baseline should cover every controller, not just the offenders',
  );
  for (const [file, count] of Object.entries(baseline)) {
    assert.equal(typeof count, 'number', `${file}: baseline entry must be a count`);
    assert.ok(count >= 0, `${file}: baseline count must not be negative`);
  }
});

test('the unvalidated-body backlog is cleared and stays cleared', () => {
  // The number this ratchet was built to drive down. It reached zero on
  // 2026-11-12 (72 -> 0 across 101 controllers); the four remaining unvalidated
  // bodies are webhook receivers, exempt with reasons in
  // body-any-exemptions.json rather than counted here.
  //
  // Asserting zero rather than "no worse than the baseline" is the point: the
  // baseline only ever had to hold still, so it would happily have accepted 72
  // forever. This is the assertion that makes a regression visible even when the
  // ratchet would have waved it through.
  const { counts, exempt } = scan();
  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  assert.equal(
    total,
    0,
    `unvalidated @Body() is back: ${Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([f, n]) => `${f} (${n})`)
      .join(', ')}`,
  );

  // Guard the exemptions too: if every webhook handler vanished, an empty
  // exemption list would make the line above vacuous rather than true.
  assert.ok(exempt.length > 0, 'expected the signed-webhook exemptions to still be in use');
});

test('the current codebase still matches its baseline', () => {
  // The ratchet holds today. If this fails, someone added an unvalidated body.
  const { counts, stale } = scan();
  const { ok, regressions } = compare(counts, undefined, stale);
  assert.equal(ok, true, `regressions: ${regressions.join('; ')}`);
});

test('totals report both the offenders and the whole population', () => {
  const t = totals({ 'a.controller.ts': 3, 'b.controller.ts': 0, 'c.controller.ts': 1 });
  assert.deepEqual(t, { files: 3, offending: 2, total: 4 });
});

// ── Exemptions ──────────────────────────────────────────────────────────────
//
// Added with the exemption mechanism itself, 2026-11-12. The ratchet could not
// reach zero until it could record a body that is deliberately unvalidated, and
// a mechanism for saying "this one is fine" is exactly the kind of thing that
// rots if nothing tests it: an entry that outlives its reason is a permanent,
// quiet hole with a justification attached.

test('an exempted handler is not counted as unvalidated', (t) => {
  const dir = workspace(t);
  const src = path.join(dir, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(
    path.join(src, 'webhook.controller.ts'),
    `export class WebhookController {
  async handleWebhook(@Req() req: RawBodyRequest<Request>, @Body() body: any) {
    return verify(req.rawBody) && body;
  }
  async create(@CurrentUser() u: any, @Body() body: any) {
    return body;
  }
}
`,
  );

  const unexempted = scanWith(src, {}).counts['webhook.controller.ts'];
  assert.equal(unexempted, 2, 'both handlers are unvalidated without an exemption');

  const exempted = scanWith(src, {
    'webhook.controller.ts': { handleWebhook: 'HMAC over raw body' },
  });
  assert.equal(exempted.counts['webhook.controller.ts'], 1, 'only the exempt one is excused');
  assert.ok(exempted.exempt.includes('webhook.controller.ts#handleWebhook'));
});

test('an exemption is matched by its handler, not by file or parameter name', (t) => {
  // Both handlers name their parameter `body`, so a file-level or
  // parameter-level exemption could not tell the webhook from the CRUD route.
  const dir = workspace(t);
  const src = path.join(dir, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(
    path.join(src, 'w.controller.ts'),
    `export class WController {
  async signed(@Body() body: any) { return body; }
  async notSigned(@Body() body: any) { return body; }
}
`,
  );

  const r = scanWith(src, { 'w.controller.ts': { signed: 'a reason' } });
  assert.equal(r.counts['w.controller.ts'], 1, 'the unexempted handler still counts');
  assert.deepEqual(r.exempt, ['w.controller.ts#signed']);
  assert.deepEqual(r.stale, []);
});

test('an exemption that matches nothing fails the run', (t) => {
  const dir = workspace(t);
  const src = path.join(dir, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(
    path.join(src, 'w.controller.ts'),
    `export class WController {
  async renamed(@Body() body: any) { return body; }
}
`,
  );

  // A handler renamed out from under its exemption, and a controller that does
  // not exist at all. Both are maintenance bugs in a file that reads as policy.
  const r = scanWith(src, {
    'w.controller.ts': { handleWebhook: 'the old name' },
    'gone.controller.ts': { handleWebhook: 'deleted file' },
  });
  assert.equal(r.counts['w.controller.ts'], 1, 'the rename is no longer exempt');
  assert.deepEqual(r.stale.sort(), [
    'gone.controller.ts#handleWebhook',
    'w.controller.ts#handleWebhook',
  ]);

  // Baseline knows the file already, so the only regressions are the two stale
  // exemptions — otherwise the "new controller" check fires as well and muddies
  // what this test is isolating.
  const { ok, regressions } = compare(r.counts, { 'w.controller.ts': 1 }, r.stale);
  assert.equal(ok, false, 'a stale exemption must fail, like any other regression');
  assert.equal(regressions.length, 2, `unexpected: ${regressions.join('; ')}`);
  assert.match(regressions[0], /exemption matches no @Body\(\): any/);
});

test('the shipped exemption list describes real handlers and nothing else', () => {
  const { exempt, stale } = scan();
  // Catches both directions: an entry pointing at a handler that no longer
  // exists (stale), and a mechanism that quietly stopped matching (exempt empty
  // while the handlers are still there).
  assert.deepEqual(stale, [], `stale exemptions: ${stale.join(', ')}`);
  assert.ok(exempt.length > 0, 'the signed-webhook exemptions should match something');
});

test('every shipped exemption carries a written reason', () => {
  const raw = JSON.parse(
    readFileSync(new URL('./body-any-exemptions.json', import.meta.url), 'utf8'),
  );
  for (const [file, methods] of Object.entries(raw)) {
    if (file.startsWith('_')) continue; // documentation key
    for (const [method, reason] of Object.entries(methods)) {
      assert.ok(
        typeof reason === 'string' && reason.length > 40,
        `${file}#${method}: an exemption needs a real reason, not a label`,
      );
    }
  }
});
