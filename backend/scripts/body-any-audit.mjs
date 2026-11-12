#!/usr/bin/env node
/**
 * Ratchet for unvalidated request bodies — FlowOps™
 *
 * WHY THIS EXISTS
 * ---------------
 * 170 `@Body()` parameters across the controllers are typed `any`. A TypeScript
 * `any` erases at runtime, so Nest's ValidationPipe has nothing to validate and
 * every field the client chooses to send arrives as-is. On its own that is a
 * mass-assignment risk; combined with `data: { ...dto }` it lets a client set
 * columns it should never control.
 *
 * `src/common/pick-allowed.util.ts` was written for exactly this — its own
 * header says so — and is used by exactly one service. A utility that exists
 * and is not adopted is worse than no utility, because it reads as protection.
 *
 * Rewriting 170 call sites in one change is how you ship a regression. So this
 * script does what the compose allowlist guard does for env vars: it freezes
 * the current number and makes it impossible to grow.
 *
 *   - a file may DECREASE its count (that is a fix, and it is reported);
 *   - a file may not INCREASE it;
 *   - a NEW controller may not introduce any at all.
 *
 * Every decrease lowers the baseline permanently. The number only goes down.
 *
 * USAGE
 *   node scripts/body-any-audit.mjs            # report + rewrite the baseline
 *   node scripts/body-any-audit.mjs --init     # seed the baseline on purpose
 *   node scripts/body-any-audit.mjs --check    # CI: fail on any increase
 *   node scripts/body-any-audit.mjs --format json
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.join(HERE, '..', '..');
const SRC = path.join(REPO_ROOT, 'backend', 'src');
const BASELINE_FILE = path.join(HERE, 'body-any-baseline.json');

/**
 * A `@Body()` decorator whose parameter is typed `any`.
 * Handles the multi-line form used by prettier-wrapped signatures.
 */
const BODY_ANY = /@Body\([^)]*\)\s*([A-Za-z0-9_$]+)\s*:\s*any\b/g;

function controllers(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) controllers(full, out);
    else if (entry.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

/** @returns {Record<string, number>} relative path -> count of `@Body(): any` */
export function scan(root = SRC) {
  const counts = {};
  for (const file of controllers(root).sort()) {
    const src = readFileSync(file, 'utf8');
    const hits = [...src.matchAll(BODY_ANY)];
    counts[path.relative(root, file).split(path.sep).join('/')] = hits.length;
  }
  return counts;
}

export function loadBaseline(file = BASELINE_FILE) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Compare a scan against the baseline.
 * @returns {{ok: boolean, regressions: string[], improvements: string[]}}
 */
export function compare(counts, baseline = loadBaseline()) {
  const regressions = [];
  const improvements = [];

  for (const [file, count] of Object.entries(counts)) {
    const before = baseline[file];
    if (before === undefined) {
      if (count > 0) {
        regressions.push(
          `${file}: ${count} unvalidated @Body() — a new controller must not introduce any`,
        );
      }
    } else if (count > before) {
      regressions.push(`${file}: ${before} -> ${count} unvalidated @Body() (increase)`);
    } else if (count < before) {
      improvements.push(`${file}: ${before} -> ${count} (${before - count} validated)`);
    }
  }

  return { ok: regressions.length === 0, regressions, improvements };
}

export function totals(counts) {
  return {
    files: Object.keys(counts).length,
    offending: Object.values(counts).filter((n) => n > 0).length,
    total: Object.values(counts).reduce((s, n) => s + n, 0),
  };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const init = args.includes('--init');
  const json = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';

  const counts = scan();
  // --init seeds the ratchet deliberately. Without it a missing baseline would
  // re-freeze whatever the count happened to be, which is how a guard quietly
  // certifies the very thing it was built to prevent.
  const { ok, regressions, improvements } = compare(counts, init ? counts : loadBaseline());
  const t = totals(counts);

  if (json) {
    process.stdout.write(`${JSON.stringify({ ...t, ok, regressions, improvements }, null, 2)}\n`);
  } else {
    process.stdout.write(
      `unvalidated @Body(): ${t.total} across ${t.offending}/${t.files} controllers\n`,
    );
    for (const i of improvements) process.stdout.write(`  improved  ${i}\n`);
    for (const r of regressions) process.stdout.write(`  REGRESSION  ${r}\n`);
    process.stdout.write(
      ok
        ? 'body-any-audit: OK — no new unvalidated request bodies.\n'
        : 'body-any-audit: FAILED — the unvalidated-body count may only go down.\n',
    );
  }

  // Rewrite the baseline only on a passing run, so every accepted decrease
  // becomes the new ceiling.
  if (!check && (ok || init)) {
    writeFileSync(BASELINE_FILE, `${JSON.stringify(counts, null, 2)}\n`);
    if (!json) process.stdout.write(`baseline updated: ${path.relative(REPO_ROOT, BASELINE_FILE)}\n`);
  }

  if (check && !ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
