#!/usr/bin/env node
/**
 * Ratchet for unvalidated request bodies — FlowOps™
 *
 * WHY THIS EXISTS
 * ---------------
 * A `@Body()` parameter typed `any` erases at runtime, so Nest's
 * ValidationPipe has nothing to validate and every field a client chooses to
 * send arrives as-is. On its own that is a mass-assignment risk; combined with
 * `data: { ...dto }` it lets a client set columns it should never control.
 *
 * Rewriting every call site in one change is how you ship a regression, so this
 * script does what the compose allowlist guard does for env vars: it freezes the
 * current number and makes it impossible to grow.
 *
 *   - a file may DECREASE its count (that is a fix, and it is reported);
 *   - a file may not INCREASE it;
 *   - a NEW controller may not introduce any at all.
 *
 * Every decrease lowers the baseline permanently. The number only goes down.
 *
 * THE COUNT IS ZERO
 * -----------------
 * As of the 2026-11 cleanup it is 0 across 101 controllers, down from 72. What
 * remains is four webhook receivers, deliberately exempt in
 * body-any-exemptions.json: their trust boundary is an HMAC signature over the
 * raw body, verified before the payload is read, and putting a validating DTO
 * in front of one would break the integration the first time the provider adds
 * a field.
 *
 * So the invariant this script now guards is not "no unvalidated bodies" but
 * "no unvalidated bodies that are not on the exemption list, and no exemption
 * that no longer matches anything". A stale exemption is reported as a
 * regression and fails the run, exactly like an increase would.
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
const EXEMPTIONS_FILE = path.join(HERE, 'body-any-exemptions.json');

/**
 * A `@Body()` decorator whose parameter is typed `any`.
 * Handles the multi-line form used by prettier-wrapped signatures.
 */
const BODY_ANY = /@Body\([^)]*\)\s*([A-Za-z0-9_$]+)\s*:\s*any\b/g;

/** A handler declaration at the two-space indent a controller method sits at. */
const METHOD = /^ {2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/;

/**
 * The controller method a match falls inside, found by walking backwards for
 * the nearest two-space-indented declaration. Prettier wraps long parameter
 * lists, so the method name is often several lines above the `@Body()` it owns.
 */
function enclosingMethod(src, index) {
  const lines = src.slice(0, index).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = METHOD.exec(lines[i]);
    if (m) return m[1];
  }
  return null;
}

/**
 * Bodies that are deliberately unvalidated — see body-any-exemptions.json.
 *
 * Only webhook receivers belong there: their gate is an HMAC over the raw
 * body, verified before the payload is read, and a validating DTO would reject
 * whatever the provider adds to its schema next.
 */
export function loadExemptions(file = EXEMPTIONS_FILE) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!k.startsWith('_')) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function controllers(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) controllers(full, out);
    else if (entry.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

/**
 * @returns {{counts: Record<string, number>, exempt: string[], stale: string[]}}
 *   counts  — `@Body(): any` that still needs a DTO, per controller
 *   exempt  — `file#method` entries that are exempted and actually match
 *   stale   — exempted entries that match nothing, which is a maintenance bug
 */
export function scan(root = SRC, exemptions = loadExemptions()) {
  const counts = {};
  const exempt = [];
  const matched = new Set();

  for (const file of controllers(root).sort()) {
    const src = readFileSync(file, 'utf8');
    const rel = path.relative(root, file).split(path.sep).join('/');
    const allowed = exemptions[rel] ?? {};
    let unexempted = 0;

    for (const hit of src.matchAll(BODY_ANY)) {
      const method = enclosingMethod(src, hit.index);
      if (method && Object.prototype.hasOwnProperty.call(allowed, method)) {
        matched.add(`${rel}#${method}`);
        exempt.push(`${rel}#${method}`);
      } else {
        unexempted += 1;
      }
    }

    counts[rel] = unexempted;
  }

  const stale = [];
  for (const [file, methods] of Object.entries(exemptions)) {
    for (const method of Object.keys(methods)) {
      if (!matched.has(`${file}#${method}`)) stale.push(`${file}#${method}`);
    }
  }

  return { counts, exempt, stale };
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
export function compare(counts, baseline = loadBaseline(), stale = []) {
  const regressions = [];
  const improvements = [];

  // An exemption that matches nothing is either a renamed handler or a body
  // that got a DTO after all. Either way the file is wrong and must be fixed.
  for (const entry of stale) {
    regressions.push(`${entry}: exemption matches no @Body(): any — remove it from body-any-exemptions.json`);
  }

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

  const { counts, exempt, stale } = scan();
  // --init seeds the ratchet deliberately. Without it a missing baseline would
  // re-freeze whatever the count happened to be, which is how a guard quietly
  // certifies the very thing it was built to prevent.
  const { ok, regressions, improvements } = compare(
    counts,
    init ? counts : loadBaseline(),
    stale,
  );
  const t = totals(counts);

  if (json) {
    process.stdout.write(`${JSON.stringify({ ...t, ok, regressions, improvements }, null, 2)}\n`);
  } else {
    process.stdout.write(
      `unvalidated @Body(): ${t.total} across ${t.offending}/${t.files} controllers\n`,
    );
    for (const i of improvements) process.stdout.write(`  improved  ${i}\n`);
    for (const e of exempt) process.stdout.write(`  exempt    ${e} (signed webhook body)\n`);
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
