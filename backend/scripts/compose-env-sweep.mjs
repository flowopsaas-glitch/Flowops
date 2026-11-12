#!/usr/bin/env node
/**
 * Compose env sweep — every environment variable the backend reads must
 * actually reach the api container.
 *
 * WHY THIS EXISTS
 * ---------------
 * `compose-env-allowlist.mjs` guards two keys in depth: RBAC_STRICT and
 * INTEGRATIONS_ENC_KEY. Each entry carries bespoke semantics — the exact
 * compose expression, how it renders for unset/empty/false/true, and the
 * source line that consumes it. That depth is the point, and it is also why
 * the list is hand-maintained: you cannot write those entries mechanically.
 *
 * But depth on two keys leaves the rest of the surface unguarded, and the
 * failure mode is identical for all of them. The api service declares an
 * explicit `environment:` allowlist and no `env_file:`, so compose passes
 * through ONLY the keys listed there. A variable that the backend reads but
 * the allowlist omits is set in .env, looks configured, and never reaches the
 * container — where the code falls back to its compiled-in default.
 *
 * That is how production ran RBAC non-strict until someone hand-edited
 * deploy/docker-compose.vps.yml on the box, and how INTEGRATIONS_ENC_KEY
 * stayed unconfigured. Both were found by accident. This script finds the
 * rest on purpose, by deriving the required set from the code instead of
 * asking anyone to remember it.
 *
 * It found seven:
 *
 *   APP_VERSION                    Sentry release was always undefined
 *   DRIVER_REQUIRE_DOCUMENTS       compliance gate silently OFF
 *   GROQ_MODEL                     model could not be pinned
 *   MANIFEST_REQUIRE_HUB_RECEIVE   could not be disabled
 *   OSRM_BASE_URL                  could not point at a private router
 *   WAYBILL_STRICT_TRANSITIONS     legacy mode flag ignored
 *   WAYBILL_TRANSITION_MODE        enforcement mode could not be relaxed
 *
 * driver-compliance.service.ts states the intent outright — "Operational
 * policy switches come from the environment, read per call so a rollout
 * decision does not need a redeploy on every node." None of them could be
 * changed without a rebuild, because none of them were in the allowlist.
 *
 * WHAT IT CHECKS
 * --------------
 *   1. every env key read by NON-TEST backend source appears in the api
 *      `environment:` allowlist of the base compose file (the only route
 *      into the container),
 *   2. no key is exempt without a written reason (an empty EXEMPT list is
 *      the healthy state — an exemption is a decision, not a default), and
 *   3. an allowlisted key whose value contains no `${...}` is reported as
 *      hardcoded: it is present, but a host .env still cannot change it,
 *      which is the same symptom by a different route.
 *
 * Test files are excluded deliberately. *.spec.ts reads env keys to exercise
 * the switch, and those knobs (ALLOW_AI_CHAOS_SIMULATION, PROCESS_CONTROL_*,
 * PRODUCT_MASTER_ENABLED) are meant to exist only inside the test harness.
 * Including them here would assert that the container needs seven variables
 * it must never receive.
 *
 * Usage:
 *   node scripts/compose-env-sweep.mjs            # human-readable report
 *   node scripts/compose-env-sweep.mjs --check    # exit 1 on any gap
 *   node scripts/compose-env-sweep.mjs --format json
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = resolve(HERE, '..');
export const REPO_ROOT = resolve(BACKEND_ROOT, '..');

/** Compose files whose api `environment:` block feeds the container. */
export const COMPOSE_FILES = [
  join(REPO_ROOT, 'docker-compose.yml'),
  join(REPO_ROOT, 'deploy', 'docker-compose.vps.yml'),
  join(REPO_ROOT, 'docker-compose.prod.yml'),
];

/**
 * Keys deliberately kept out of the allowlist, each with the reason.
 *
 * This is empty, and it should stay empty. An entry here is a claim that a
 * variable the code reads is correctly unreachable in production, which is
 * almost never true — the usual reason for wanting one is that the key is
 * awkward to pass through, which is the problem, not a reason to skip it.
 */
export const EXEMPT = [];

const ENV_READ = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
/** Also catch the bracketed form: process.env['KEY'] / process.env["KEY"]. */
const ENV_READ_BRACKET = /process\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g;

/** Walk a directory tree, collecting files that pass `accept`. */
function walk(dir, accept, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, accept, acc);
    else if (accept(full)) acc.push(full);
  }
  return acc;
}

/**
 * Collect every env key the backend reads, split by whether the reading file
 * is a test. Returns `{ production:Set, test:Set, byKey:Map }`.
 *
 * A key read by both lands in both sets; `production` is the one that matters,
 * because a test-only read is a harness knob and must never reach production.
 */
export function collectEnvReads(srcDir = join(BACKEND_ROOT, 'src')) {
  const production = new Set();
  const test = new Set();
  const byKey = new Map();

  const files = walk(srcDir, (f) => f.endsWith('.ts'));
  for (const file of files) {
    const isTest = /(^|\/)[^/]*\.spec\.ts$/.test(file) || file.includes('/test/');
    const text = readFileSync(file, 'utf8');
    const found = new Set();
    for (const re of [ENV_READ, ENV_READ_BRACKET]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) found.add(m[1]);
    }
    for (const key of found) {
      (isTest ? test : production).add(key);
      const rel = file.slice(BACKEND_ROOT.length + 1);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(rel);
    }
  }
  return { production, test, byKey };
}

/**
 * Parse the api service's `environment:` keys out of a compose file.
 *
 * Compose overlays use !reset and !override, which a plain YAML parser
 * rejects — so they are registered before loading. Without this the VPS
 * overlay, which is the file production actually runs, silently fails to
 * parse and the sweep would report a false clean.
 */
export function parseComposeApiEnv(file) {
  if (!existsSync(file)) return null;
  // Lazy require: js-yaml is a devDependency and this script is also imported
  // by its own test, which runs in the same environment.
  const yaml = requireJsYaml();
  // Plain option objects, reused for both tags. js-yaml's Type constructor
  // reads these; they must not be functions, or `kind` resolves to null.
  const mapping = { kind: 'mapping', construct: (d) => d ?? {} };
  const seq = { kind: 'sequence', construct: (d) => d ?? [] };
  const schema = yaml.DEFAULT_SCHEMA.extend(
    ['reset', 'override'].flatMap((n) => [
      new yaml.Type(`!${n}`, mapping),
      new yaml.Type(`!${n}`, seq),
    ]),
  );
  const doc = yaml.load(readFileSync(file, 'utf8'), { schema });
  const api = doc?.services?.api;
  if (!api) return null;
  let env = api.environment;
  const entries = new Map();
  if (Array.isArray(env)) {
    for (const line of env) {
      const eq = String(line).indexOf('=');
      const key = eq === -1 ? String(line) : String(line).slice(0, eq);
      const value = eq === -1 ? '' : String(line).slice(eq + 1);
      entries.set(key.trim(), value);
    }
  } else if (env && typeof env === 'object') {
    for (const [key, value] of Object.entries(env)) entries.set(key, String(value ?? ''));
  }
  return { entries, envFile: api.env_file ?? null };
}

function requireJsYaml() {
  try {
    return require('js-yaml');
  } catch {
    throw new Error(
      'compose-env-sweep needs js-yaml. Install dev dependencies (npm ci) before running it.',
    );
  }
}

/** Merge the api environment maps of every compose file, base last-wins. */
export function collectComposeApiEnv(files = COMPOSE_FILES) {
  const merged = new Map();
  const perFile = [];
  for (const file of files) {
    const parsed = parseComposeApiEnv(file);
    if (!parsed) continue;
    perFile.push({ file, count: parsed.entries.size, envFile: parsed.envFile });
    for (const [k, v] of parsed.entries) merged.set(k, v);
  }
  return { merged, perFile };
}

/**
 * Compare reads against the allowlist.
 *
 * A key is a gap when production code reads it and no compose file passes it.
 * Exemptions must carry a reason; an exemption without one is itself a gap,
 * so the list cannot be used to wave things through silently.
 */
export function analyse({ production, compose }) {
  const allowlisted = new Set(compose.merged.keys());
  const exemptKeys = new Set(EXEMPT.filter((e) => e.reason).map((e) => e.key));

  const gaps = [...production]
    .filter((k) => !allowlisted.has(k) && !exemptKeys.has(k))
    .sort()
    .map((key) => ({ key, reason: 'read by production code, absent from every compose allowlist' }));

  const undocumentedExemptions = EXEMPT.filter((e) => !e.reason).map((e) => e.key);

  // Present in the allowlist, but not interpolated — a host .env cannot
  // change it, so it is the same dead-knob symptom by another route.
  const hardcoded = [...allowlisted]
    .filter((k) => production.has(k))
    .filter((k) => !String(compose.merged.get(k) ?? '').includes('${'))
    .sort();

  return { gaps, undocumentedExemptions, hardcoded, allowlisted: [...allowlisted].sort() };
}

function report(result, reads, compose) {
  const lines = [];
  lines.push('Compose env sweep — does every variable the backend read reach the container?');
  lines.push('─'.repeat(78));
  for (const f of compose.perFile) {
    const rel = f.file.slice(REPO_ROOT.length + 1);
    lines.push(
      `  ${rel.padEnd(34)} api environment: ${String(f.count).padStart(3)} keys` +
        (f.envFile ? `  env_file: ${JSON.stringify(f.envFile)}` : ''),
    );
  }
  lines.push('');
  lines.push(`  production env keys read by src : ${reads.production.size}`);
  lines.push(`  test-only keys (correctly absent): ${[...reads.test].filter((k) => !reads.production.has(k)).length}`);
  lines.push(`  keys in the api allowlist        : ${result.allowlisted.length}`);
  lines.push('');

  if (result.gaps.length === 0) {
    lines.push('  PASS  every production env key reaches the api container.');
  } else {
    lines.push(`  FAIL  ${result.gaps.length} key(s) never reach the api container:`);
    for (const g of result.gaps) {
      lines.push(`        ${g.key}`);
      const where = reads.byKey.get(g.key) ?? [];
      for (const w of where.slice(0, 3)) lines.push(`          read at ${w}`);
    }
  }
  if (result.hardcoded.length) {
    lines.push('');
    lines.push(`  WARN  ${result.hardcoded.length} allowlisted key(s) are hardcoded, so .env cannot change them:`);
    for (const k of result.hardcoded) lines.push(`        ${k} = ${compose.merged.get(k)}`);
  }
  if (result.undocumentedExemptions.length) {
    lines.push('');
    lines.push('  FAIL  exemption(s) with no written reason (an exemption is a decision):');
    for (const k of result.undocumentedExemptions) lines.push(`        ${k}`);
  }
  lines.push('─'.repeat(78));
  return lines.join('\n');
}

export function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const json = argv.includes('--format') && argv[argv.indexOf('--format') + 1] === 'json';

  const reads = collectEnvReads();
  const compose = collectComposeApiEnv();
  const result = analyse({ production: reads.production, compose });

  if (json) {
    console.log(
      JSON.stringify(
        {
          production: [...reads.production].sort(),
          testOnly: [...reads.test].filter((k) => !reads.production.has(k)).sort(),
          allowlisted: result.allowlisted,
          gaps: result.gaps,
          hardcoded: result.hardcoded,
          undocumentedExemptions: result.undocumentedExemptions,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(report(result, reads, compose));
  }

  const failed = result.gaps.length > 0 || result.undocumentedExemptions.length > 0;
  if (check && failed) process.exitCode = 1;
  return { failed, result, reads, compose };
}

if (import.meta.url === `file://${process.argv[1]}`) main();
