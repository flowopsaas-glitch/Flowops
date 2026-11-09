#!/usr/bin/env node
/**
 * Tenant-context coverage — how much of the tenant data path would actually be
 * protected if RLS Phase 2 were switched on.
 *
 * WHY THIS EXISTS
 *
 * `prisma/prisma.service.ts` has `withTenant(companyId, fn)`, which wraps work
 * in a transaction and sets `app.company_id` for its duration
 * (`set_config(..., true)` — transaction-local, so it cannot leak). While that
 * setting is present, Postgres row-level security does the isolating, and a
 * forgotten `where: { companyId }` fails closed instead of leaking.
 *
 * But the RLS migration (20261012210000_rls_tenant_isolation) ships in PHASE 1:
 *
 *   app.company_id unset + rls_strict off  -> the policy steps aside
 *   app.company_id unset + rls_strict 'on' -> rows are refused outright
 *
 * Phase 2 is a manual `ALTER DATABASE flowops SET app.rls_strict = 'on'` that
 * appears in no deploy script, no compose file and no env template. It is off.
 * So today isolation rests entirely on application code remembering to filter.
 *
 * Flipping Phase 2 on without knowing the coverage would refuse rows for every
 * call site that has no context — seeds, outbox drains, cron sweeps — and take
 * production down. So coverage has to be measured first, then grown, and only
 * then can the flag be flipped. This scanner is that measurement.
 *
 * WHAT IT MEASURES
 *
 * Every database operation on a tenant-scoped table (one with a companyId
 * column, read from schema.prisma — not hand-listed, so it cannot drift) is
 * classified as:
 *
 *   contextualised — inside a `withTenant(...)` callback: RLS is active
 *   bare           — no tenant context: the database is not isolating this row
 *   exempt         — the file is platform-scoped by design, recorded with a
 *                    reason in tenant-scope-policy.mjs
 *
 * A bare operation is not automatically a bug. Under Phase 1 it is the normal
 * state, and most of these calls do filter by companyId in application code —
 * that is what the tenant-scope audit already checks. What bare means is:
 * there is no SECOND line of defence. One forgotten filter here is a silent
 * cross-tenant read, with nothing underneath to catch it.
 *
 * THE RATCHET
 *
 * `bare` may never increase. That is the whole invariant. New tenant queries
 * must be written inside `withTenant`; existing ones may be migrated at whatever
 * pace you like, and each improvement is banked by re-running with
 * `--update-baseline`. The baseline is per-module so a regression names the
 * module that caused it rather than just a total.
 *
 * Usage: node scripts/tenant-context-coverage.mjs [--format table|json|summary]
 *        [--root src] [--check] [--update-baseline] [--baseline <path>]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_SCOPE } from './tenant-scope-policy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(HERE, '..');
const arg = (flag, fallback) =>
  process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : fallback;
// Overridable so tests can ratchet against a throwaway baseline.
const BASELINE_PATH = arg('--baseline', join(HERE, 'tenant-context-baseline.json'));

const ROOT = arg('--root', 'src');

// Every delegate operation that touches rows. Deliberately includes reads:
// a cross-tenant read is the leak, and count/aggregate group data too.
const OPS = [
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'create', 'createMany', 'createManyAndReturn',
  'update', 'updateMany', 'updateManyAndReturn', 'upsert',
  'delete', 'deleteMany',
  'count', 'aggregate', 'groupBy',
];
// `tx`/`trx` are the transaction clients handed to a withTenant callback.
const CLIENT = String.raw`(?:this\.)?(?:prisma|tx|trx|db)\.(\w+)\.(?:${OPS.join('|')})\s*\(`;
const CALL = new RegExp(CLIENT, 'g');

// ── Tenant tables, derived from the schema ──────────────────────────────────
// Read rather than listed, so a new tenant model shows up here automatically
// instead of being quietly absent from the audit.

/** Prisma client delegate name for a model (`CargoLine` -> `cargoLine`). */
const delegate = (model) => model.charAt(0).toLowerCase() + model.slice(1);

function tenantDelegates() {
  const schema = readFileSync(join(BACKEND, 'prisma', 'schema.prisma'), 'utf8');
  const out = new Set();
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, model, body] = m;
    // A real column declaration, not `companyId` appearing in a relation name
    // or an @@index. Relation fields end in a type; columns start with one.
    if (/^\s*companyId\s+\w/m.test(body)) out.add(delegate(model));
  }
  return out;
}

// ── Walking ────────────────────────────────────────────────────────────────

function walk(dir) {
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return /\.ts$/.test(dir) && !/\.(spec|test)\.ts$/.test(dir) ? [dir] : [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'generated') continue;
    out.push(...walk(join(dir, entry)));
  }
  return out;
}

/**
 * The character span of a `withTenant(...)` call: from its open paren to the
 * matching close. Using the call's own parens (rather than the callback's
 * braces) covers both body shapes —
 *   withTenant(id, async (tx) => { ... })   block body
 *   withTenant(id, (tx) => tx.a.update())   expression body
 * — because in both the call's closing paren comes after the callback ends.
 * Anything inside the span runs with `app.company_id` set.
 */
function withTenantSpans(source) {
  const spans = [];
  const re = /\.withTenant\s*\(/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const open = m.index + m[0].length - 1; // m[0] ends at the call's '('
    let depth = 0;
    let close = -1;
    for (let i = open; i < source.length; i++) {
      const ch = source[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close > open) spans.push([open, close]);
  }
  return spans;
}

// ── Scan ───────────────────────────────────────────────────────────────────

const tenants = tenantDelegates();
const platformByFile = new Map(PLATFORM_SCOPE.map((p) => [p.file, p.reason]));
const files = walk(ROOT);

const findings = [];
for (const file of files) {
  const rel = relative(process.cwd(), file).replace(/\\/g, '/');
  const source = readFileSync(file, 'utf8');
  const spans = withTenantSpans(source);
  const exemptReason = platformByFile.get(rel);

  for (const match of source.matchAll(CALL)) {
    const model = match[1];
    if (!tenants.has(model)) continue; // not a tenant table: RLS does not apply
    const op = match[0].match(/\.(\w+)\s*\($/)?.[1] ?? '?';
    const line = source.slice(0, match.index).split('\n').length;
    const inSpan = spans.some(([a, b]) => match.index >= a && match.index <= b);

    let cls;
    let detail;
    if (inSpan) {
      cls = 'contextualised';
      detail = 'inside withTenant(): app.company_id is set, RLS is active';
    } else if (exemptReason) {
      cls = 'exempt';
      detail = exemptReason;
    } else {
      cls = 'bare';
      detail = 'no tenant context: isolation depends on the application filter alone';
    }

    findings.push({
      file: rel,
      line,
      module: moduleOf(rel),
      model,
      op,
      class: cls,
      detail,
      snippet: (source.split('\n')[line - 1] || '').trim().slice(0, 100),
    });
  }
}

function moduleOf(rel) {
  const parts = rel.replace(/^src\//, '').split('/');
  return parts.length > 1 ? parts[0] : '(root)';
}

// ── Aggregate ──────────────────────────────────────────────────────────────

const byClass = (c) => findings.filter((f) => f.class === c).length;

/** Per-module roll-up, worst coverage first (most bare ops at the top). */
function byModule() {
  const map = new Map();
  for (const f of findings) {
    if (!map.has(f.module)) {
      map.set(f.module, { module: f.module, contextualised: 0, bare: 0, exempt: 0, total: 0 });
    }
    const row = map.get(f.module);
    row[f.class]++;
    row.total++;
  }
  const rows = [...map.values()].map((r) => ({
    ...r,
    coverage: r.total ? (r.contextualised / r.total) * 100 : 0,
  }));
  rows.sort((a, b) => b.bare - a.bare || b.total - a.total);
  return rows;
}

/** Tenant tables with the most unprotected reads — the wrapping priority. */
function riskiestTables(n = 12) {
  const map = new Map();
  for (const f of findings) {
    if (f.class !== 'bare') continue;
    map.set(f.model, (map.get(f.model) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([model, bare]) => ({ model, bare }))
    .sort((a, b) => b.bare - a.bare)
    .slice(0, n);
}

const summary = {
  tenantTables: tenants.size,
  filesScanned: files.length,
  operations: findings.length,
  contextualised: byClass('contextualised'),
  bare: byClass('bare'),
  exempt: byClass('exempt'),
  coveragePct: findings.length ? +((byClass('contextualised') / findings.length) * 100).toFixed(1) : 0,
};

/** Bare ops per module — the ratchet's unit. Only `bare` is banked. */
function bareByModule() {
  const map = {};
  for (const f of findings) if (f.class === 'bare') map[f.module] = (map[f.module] ?? 0) + 1;
  return map;
}

// ── Baseline ───────────────────────────────────────────────────────────────

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

// ── Output ─────────────────────────────────────────────────────────────────

const format = arg('--format', 'table');
const checking = process.argv.includes('--check');

if (format === 'json') {
  console.log(
    JSON.stringify(
      { summary, modules: byModule(), riskiestTables: riskiestTables(), findings },
      null,
      2,
    ),
  );
} else if (format === 'summary') {
  console.log({ ...summary, modules: byModule() });
} else if (!checking) {
  const rows = byModule();
  console.log('Tenant-context coverage — RLS Phase 2 readiness\n');
  console.log(
    'Module'.padEnd(24) +
      'Ops'.padStart(6) +
      'Context'.padStart(9) +
      'Bare'.padStart(7) +
      'Exempt'.padStart(8) +
      'Coverage'.padStart(10),
  );
  console.log('─'.repeat(64));
  for (const r of rows) {
    console.log(
      r.module.padEnd(24) +
        String(r.total).padStart(6) +
        String(r.contextualised).padStart(9) +
        String(r.bare).padStart(7) +
        String(r.exempt).padStart(8) +
        `${r.coverage.toFixed(1)}%`.padStart(10),
    );
  }
  console.log('─'.repeat(64));
  console.log(
    'TOTAL'.padEnd(24) +
      String(summary.operations).padStart(6) +
      String(summary.contextualised).padStart(9) +
      String(summary.bare).padStart(7) +
      String(summary.exempt).padStart(8) +
      `${summary.coveragePct}%`.padStart(10),
  );

  const risky = riskiestTables();
  if (risky.length) {
    console.log('\nWrapping priority — tenant tables with the most unprotected operations:');
    for (const r of risky) console.log(`  ${r.bare.toString().padStart(4)}  ${r.model}`);
  }

  console.log(
    `\n${summary.tenantTables} tenant tables, ${summary.filesScanned} files, ` +
      `${summary.operations} operations. ` +
      `${summary.contextualised} would be protected by RLS today; ${summary.bare} would not.`,
  );
  console.log(
    'Phase 2 (app.rls_strict = on) is OFF. Until coverage is high, isolation rests on\n' +
      'application filters alone — see tenant-scope-audit for that layer.',
  );
}

// ── Gate ───────────────────────────────────────────────────────────────────

if (process.argv.includes('--update-baseline')) {
  const baseline = {
    _why:
      'Bare tenant operations per module, at the time this was recorded. ' +
      'The invariant enforced by --check is that the TOTAL may never rise. ' +
      'Re-record only when coverage has genuinely improved, and say how in the commit.',
    recorded: new Date().toISOString().slice(0, 10),
    total: summary.bare,
    byModule: bareByModule(),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Baseline recorded: ${summary.bare} bare operations across ${files.length} files.`);
}

if (checking) {
  const baseline = readBaseline();
  if (!baseline) {
    console.error(
      'No baseline at scripts/tenant-context-baseline.json.\n' +
        'Run: node scripts/tenant-context-coverage.mjs --update-baseline',
    );
    process.exit(1);
  }

  const current = bareByModule();
  const regressions = [];
  const appeared = [];
  for (const [mod, count] of Object.entries(current)) {
    const known = Object.prototype.hasOwnProperty.call(baseline.byModule ?? {}, mod);
    const was = baseline.byModule?.[mod] ?? 0;
    if (count > was) {
      (known ? regressions : appeared).push(`  ${mod}: ${was} -> ${count} (+${count - was})`);
    }
  }

  const problems = [];
  if (summary.bare > baseline.total) {
    problems.push(
      `bare tenant operations rose from ${baseline.total} (recorded ${baseline.recorded}) ` +
        `to ${summary.bare}. New tenant queries must run inside prisma.withTenant(). ` +
        'If coverage genuinely improved, re-record with --update-baseline.',
    );
    if (regressions.length) problems.push(`regressed modules:\n${regressions.join('\n')}`);
    if (appeared.length) problems.push(`new modules (no baseline entry):\n${appeared.join('\n')}`);

    // Only the modules that actually moved. Dumping all ~1,300 would be a
    // wall nobody reads; what the author needs is the delta they just caused.
    const toBlame = new Set(
      [...regressions, ...appeared].map((l) => l.trim().split(':')[0]),
    );
    console.error('\nBare operations introduced by this change:');
    for (const f of findings.filter((x) => x.class === 'bare' && toBlame.has(x.module))) {
      console.error(`  ${f.file}:${f.line}  ${f.model}.${f.op}`);
      console.error(`      ${f.snippet}`);
    }
  }

  if (problems.length) {
    console.error(`\nTenant-context coverage check failed:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }

  console.log(
    `Tenant-context coverage: ${summary.operations} tenant operations, ` +
      `${summary.contextualised} contextualised (${summary.coveragePct}%), ` +
      `${summary.bare} bare (baseline ${baseline.total}, recorded ${baseline.recorded}), ` +
      `${summary.exempt} exempt.`,
  );
}
