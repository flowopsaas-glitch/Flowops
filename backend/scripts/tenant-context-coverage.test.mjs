/**
 * Tests for the tenant-context coverage scanner.
 *
 * Same hazard as the tenant-scope audit: the dangerous failure is not a false
 * positive, it is going blind. A scanner that reported everything as
 * contextualised would keep --check green while coverage was actually zero —
 * and then someone would flip app.rls_strict = 'on' on the strength of it and
 * take production down.
 *
 * So these pin both directions: real patterns are recognised as protected,
 * and genuine gaps are still counted as bare.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = new URL('./tenant-context-coverage.mjs', import.meta.url).pathname;
const REPO_ROOT = new URL('..', import.meta.url).pathname;
const BASELINE = join(REPO_ROOT, 'scripts', 'tenant-context-baseline.json');

function run(args, opts = {}) {
  return execFileSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

/** Audit a synthetic source string in a throwaway tree. */
function scan(source, name = 'sample.service.ts') {
  const dir = mkdtempSync(join(tmpdir(), 'tenant-ctx-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', name), source);
  try {
    return JSON.parse(run(['--root', join(dir, 'src'), '--format', 'json']));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const classesOf = (result) => result.findings.map((f) => f.class);

// ── Recognition ────────────────────────────────────────────────────────────

test('an operation inside a withTenant callback is contextualised', () => {
  const r = scan(`
    async get(companyId: string) {
      return this.prisma.withTenant(companyId, async (tx) => {
        return tx.driver.findMany({ where: { companyId } });
      });
    }
  `);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].class, 'contextualised');
  assert.equal(r.summary.contextualised, 1);
  assert.equal(r.summary.bare, 0);
});

test('an operation outside any withTenant callback is bare', () => {
  const r = scan(`
    async get(companyId: string) {
      return this.prisma.driver.findMany({ where: { companyId } });
    }
  `);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].class, 'bare');
  assert.equal(r.summary.bare, 1);
});

test('a read before the callback stays bare even if the write is protected', () => {
  // The real shape this catches: a scoped read feeding a scoped write, where
  // only the write is inside the transaction. Under Phase 2 the read is refused.
  const r = scan(`
    async end(companyId: string) {
      const active = await this.prisma.driverDuty.findFirst({ where: { driverId } });
      return this.prisma.withTenant(companyId, async (tx) => {
        return tx.driverDuty.update({ where: { id: active.id }, data: {} });
      });
    }
  `);
  assert.deepEqual(classesOf(r), ['bare', 'contextualised']);
});

test('an expression-body callback is contextualised, not just a block body', () => {
  // withTenant(id, (tx) => tx.driver.findMany()) has no braces; span detection
  // keys off the call's own parens so both shapes are covered.
  const r = scan(`
    async get(companyId: string) {
      return this.prisma.withTenant(companyId, (tx) => tx.driver.findMany({}));
    }
  `);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].class, 'contextualised');
});

test('nested calls inside a callback are all contextualised', () => {
  const r = scan(`
    async get(companyId: string) {
      return this.prisma.withTenant(companyId, async (tx) => {
        const a = await tx.driver.findMany({});
        const b = await tx.waybill.count({});
        return { a, b };
      });
    }
  `);
  assert.deepEqual(classesOf(r), ['contextualised', 'contextualised']);
});

test('operations on non-tenant tables are not counted', () => {
  // company has no companyId column of its own, so RLS does not apply to it.
  const r = scan(`
    async get() {
      return this.prisma.company.findMany({});
    }
  `);
  assert.equal(r.findings.length, 0);
});

test('prisma.$transaction without withTenant leaves operations bare', () => {
  // A plain transaction sets no app.company_id. Counting these as protected
  // would be the single most dangerous false positive this scanner could make.
  const r = scan(`
    async get(companyId: string) {
      return this.prisma.$transaction(async (tx) => {
        return tx.driver.findMany({});
      });
    }
  `);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].class, 'bare');
});

test('reads are counted, not just writes', () => {
  // count/aggregate/groupBy leak too, and are the easiest to forget.
  const r = scan(`
    async get() {
      await this.prisma.driver.count({});
      await this.prisma.waybill.aggregate({ _sum: { totalAmount: true } });
      await this.prisma.invoice.groupBy({ by: ['status'], _count: true });
      return null;
    }
  `);
  assert.equal(r.findings.length, 3);
  assert.equal(r.summary.bare, 3);
});

// ── The real tree ──────────────────────────────────────────────────────────

test('the real tree: tenant tables come from the schema, and the scan is sane', () => {
  const r = JSON.parse(run(['--format', 'json'], { cwd: REPO_ROOT }));
  // Derived from schema.prisma, so this only moves when the schema does. It is
  // the anchor: if it collapses, the scanner stopped seeing tenant tables.
  // 135 -> 137 on 2026-11-10: the General Average migration added two tenant
  // models (GeneralAverageEvent, GeneralAverageContributor).
  // 137 -> 138 on 2026-11-10: the rail network migration added one tenant model
  // (RailNetwork). Raise this only when models were genuinely added; a DROP
  // here means detection broke.
  // 138 -> 140 on 2026-11-14: the field-records migration added two tenant
  // models (SafetyIncident, TripDocument).
  // 140 -> 141 on 2026-11-15: booking_requests gained a companyId column
  // (migration 20261115090000) and so became a tenant model. It had shipped
  // carrying only linkId, which is why the 20261012210000 RLS sweep could not
  // cover it and why any lookup by id would have resolved for every company.
  assert.equal(r.summary.tenantTables, 141);
  assert.ok(r.summary.operations > 1000, `expected a large tree, got ${r.summary.operations}`);
  assert.equal(
    r.summary.contextualised + r.summary.bare + r.summary.exempt,
    r.summary.operations,
    'every operation must land in exactly one class',
  );
  assert.ok(
    r.summary.contextualised > 0,
    'withTenant is in use; finding zero contextualised ops means detection broke',
  );
});

test('the real tree passes the ratchet against the committed baseline', () => {
  assert.doesNotThrow(
    () => run(['--check'], { cwd: REPO_ROOT }),
    'bare tenant operations increased; see the BARE lines above',
  );
});

test('the committed baseline records a total that matches the tree', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const r = JSON.parse(run(['--format', 'json'], { cwd: REPO_ROOT }));
  // Not equal — better is fine. But it must never be understated: a baseline
  // below the real number would let regressions through silently.
  assert.ok(
    baseline.total >= r.summary.bare,
    `baseline total ${baseline.total} is below the current ${r.summary.bare}; ` +
      'the baseline must never understate the gap',
  );
  assert.ok(baseline._why, 'baseline must carry its own explanation');
  assert.ok(baseline.byModule, 'baseline must be per-module so regressions are attributable');
});

// ── The ratchet ────────────────────────────────────────────────────────────

test('the ratchet rejects a newly added bare operation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tenant-ctx-ratchet-'));
  const src = join(dir, 'src');
  mkdirSync(src, { recursive: true });
  const base = join(dir, 'baseline.json');
  try {
    writeFileSync(
      join(src, 'a.service.ts'),
      `async f(id: string) { return this.prisma.driver.findMany({}); }`,
    );
    run(['--root', src, '--update-baseline', '--baseline', base]);

    // Adding a SECOND bare query must fail: the gap may not widen.
    writeFileSync(
      join(src, 'b.service.ts'),
      `async g(id: string) { return this.prisma.waybill.findMany({}); }`,
    );
    assert.throws(
      () => run(['--root', src, '--check', '--baseline', base]),
      /bare tenant operations rose/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the ratchet accepts wrapping an existing bare operation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tenant-ctx-improve-'));
  const src = join(dir, 'src');
  mkdirSync(src, { recursive: true });
  const base = join(dir, 'baseline.json');
  try {
    writeFileSync(
      join(src, 'a.service.ts'),
      `async f(id: string) { return this.prisma.driver.findMany({}); }`,
    );
    run(['--root', src, '--update-baseline', '--baseline', base]);

    // Wrapping it does NOT lower the bare count below baseline, so the gate
    // stays green — and re-recording banks the improvement.
    writeFileSync(
      join(src, 'a.service.ts'),
      `async f(id: string) {
         return this.prisma.withTenant(id, (tx) => tx.driver.findMany({}));
       }`,
    );
    assert.doesNotThrow(() => run(['--root', src, '--check', '--baseline', base]));
    run(['--root', src, '--update-baseline', '--baseline', base]);
    const after = JSON.parse(readFileSync(base, 'utf8'));
    assert.equal(after.total, 0, 'improvement should be banked at zero');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing baseline fails loudly rather than passing vacuously', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tenant-ctx-nobase-'));
  const src = join(dir, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'a.service.ts'), `async f() { return this.prisma.driver.findMany({}); }`);
  try {
    assert.throws(
      () => run(['--root', src, '--check', '--baseline', join(dir, 'nope.json')]),
      /No baseline/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Blind-spot regressions found during the 2026-11-11 audit ────────────────

test('a code example inside a comment is not counted as an operation', () => {
  // src/waybills/waybill-status.machine.ts documents the anti-pattern the module
  // exists to prevent — "* `prisma.waybill.update({ data: { status }})` jumps." —
  // and that line was reported as a genuine unguarded status write. Phantom
  // findings inflate the counts and move the ratchet when someone edits prose.
  const documented = scan(`
/**
 * The codebase stops doing arbitrary
 * \`prisma.waybill.update({ data: { status }})\` jumps.
 */
export class SampleService {
  async ok(id: string, companyId: string) {
    return this.prisma.waybill.findFirst({ where: { id, companyId } });
  }
}
`);
  const withCode = scan(`
export class SampleService {
  async ok(id: string, companyId: string) {
    return this.prisma.waybill.findFirst({ where: { id, companyId } });
  }
}
`);

  assert.equal(
    documented.findings.length,
    withCode.findings.length,
    'the commented-out example was counted as a real database operation',
  );
  assert.ok(!documented.findings.some((f) => f.op === 'update'), 'phantom update found');
});

test('the ratchet fails on a per-module regression even with headroom in the baseline', () => {
  // The original gate only failed when the TOTAL rose above the baseline. Because
  // the baseline is a historical high-water mark and coverage improves over time,
  // that left slack — 19 operations at the time this was fixed — so a new
  // unwrapped tenant query was invisible, and every improvement silently banked
  // MORE room for future regressions. Plant a baseline with deliberate headroom
  // and prove a single new bare operation is still caught.
  const dir = mkdtempSync(join(tmpdir(), 'tenant-ctx-ratchet-'));
  mkdirSync(join(dir, 'src', 'alpha'), { recursive: true });
  writeFileSync(
    join(dir, 'src', 'alpha', 'alpha.service.ts'),
    `export class A { async f(id: string, companyId: string) {
       return this.prisma.waybill.findFirst({ where: { id, companyId } });
     } }`,
  );
  const baselinePath = join(dir, 'baseline.json');
  try {
    // Record a baseline for the EXISTING tree, then artificially lower the module
    // count to manufacture headroom: 3 bare ops recorded, real count is 1.
    run(['--root', join(dir, 'src'), '--baseline', baselinePath, '--update-baseline']);
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const realTotal = baseline.total;
    baseline.total = realTotal + 10; // headroom, as the stale baseline had
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));

    // Add one more bare operation. Total is still well under the padded baseline.
    writeFileSync(
      join(dir, 'src', 'alpha', 'beta.service.ts'),
      `export class B { async g(id: string) {
         return this.prisma.waybill.findFirst({ where: { id } });
       } }`,
    );

    let failed = false;
    try {
      run(['--root', join(dir, 'src'), '--baseline', baselinePath, '--check']);
    } catch {
      failed = true;
    }
    assert.ok(
      failed,
      'the ratchet passed despite a new bare tenant operation — headroom is being ' +
        'absorbed instead of failing',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the committed baseline leaves no headroom', () => {
  // Recorded 2026-11-09 at 1348 while the real count was 1329: 19 unprotected
  // queries could be added before CI noticed. Re-recording is legitimate when
  // coverage genuinely improves, but the baseline must be re-recorded to the
  // CURRENT number, not a padded one.
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const current = JSON.parse(run(['--format', 'json']));
  assert.ok(
    current.summary.bare <= baseline.total,
    `bare operations (${current.summary.bare}) exceed the baseline (${baseline.total})`,
  );
  assert.equal(
    baseline.total,
    current.summary.bare,
    `baseline total ${baseline.total} is padded above the real count ${current.summary.bare}; ` +
      'that gap is silent headroom for regressions. Re-record with --update-baseline.',
  );
});
