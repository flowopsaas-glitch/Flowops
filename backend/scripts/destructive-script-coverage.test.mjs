/**
 * Tests that no operational script can destroy production data untested.
 *
 * Run with: npm run release:safety:test
 *
 * WHY THIS EXISTS
 * ---------------
 * The two worst defects found in this repository in one week both lived in
 * `deploy/`, and both meant the same thing in production: *you have no backup.*
 *
 *   1. `backup-to-r2.sh` shipped without the executable bit, so it had never
 *      run — not once, in the entire life of the script.
 *   2. Its header check then rejected a healthy 376KB dump and blamed the
 *      dump, because `set -o pipefail` turned `zcat`'s SIGPIPE into a verdict.
 *
 * Neither was visible from `src/`, and neither was visible from CI. What they
 * had in common was simpler than either defect: **code that never runs has no
 * failures to show.** A script executed once a year during an incident has, in
 * effect, never been executed at all — and its first run is the one that
 * matters most.
 *
 * Then a review found a third, worse: `restore-verify.sh --restore-live` dropped
 * the live schema *before* proving the dump would load, and loaded it without
 * `ON_ERROR_STOP`, so psql reported success over a half-restored database. The
 * disaster path was the one path guaranteed to fail on the day it was needed.
 *
 * THE SHAPE OF THE GUARD
 * ----------------------
 * Not "every script needs tests". That is unachievable here, and a rule that
 * cannot be met is a rule that gets ignored. This pins the narrow, defensible
 * claim:
 *
 *   **a script that can destroy production data must have a sibling test.**
 *
 * It works like the other ratchets in this repo (tenant-context-coverage,
 * state-transition-audit): an explicit list of what is known-uncovered, which
 * may only shrink.
 *
 *   - a NEW destructive script fails the build until it is triaged;
 *   - fixing one of the known gaps fails the build until the list is updated,
 *     so the number ratchets down and the record stays honest.
 *
 * That second property is the point. A list that can only grow is a backlog
 * nobody reads; a list that breaks when you improve something is a ratchet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

/**
 * Statements that can destroy production data.
 *
 * Deliberately narrow. `DROP DATABASE` alone is NOT enough — `item2-r2-runner.sh`
 * drops throwaway `flowops_verify_*` databases, which is the safe use of the
 * same verb, and flagging it would bury the signal. What matters is a
 * destructive statement whose target is the live database or the migration
 * ledger.
 */
const DESTRUCTIVE = [
  { pattern: /DROP\s+SCHEMA/i, why: 'drops a live schema' },
  {
    pattern: /DELETE\s+FROM\s+_prisma_migrations/i,
    why: 'rewrites the Prisma migration ledger',
  },
  { pattern: /pg_restore/i, why: 'restores over an existing database' },
  // Anchored to the SQL form on purpose. `TRUNCATE` alone matches the SHELL
  // utility in `disk-guard.sh` (`truncate -s 0` empties container LOG files to
  // reclaim disk — the opposite of destroying data) and the word "truncated"
  // inside an error message in `post-deploy-check.sh`. Both were flagged on the
  // first run. A guard that cries wolf is a guard people learn to ignore, which
  // is worse than no guard, so the pattern names the SQL keyword precisely.
  { pattern: /TRUNCATE\s+(TABLE|ONLY|")/i, why: 'empties tables' },
];

/** Directories holding operational scripts — the code that runs on the box. */
const SCRIPT_DIRS = ['deploy'];

/**
 * Scripts known to be destructive WITHOUT a test.
 *
 * This list may only shrink. Each entry carries the reason it is here, so the
 * next person can see whether the gap is still acceptable rather than having to
 * re-derive the judgement.
 */
const KNOWN_UNCOVERED = [
  {
    path: 'deploy/live-migration-adoption.sh',
    why:
      'Runs `DELETE FROM _prisma_migrations` to adopt a migration baseline — ' +
      'it rewrites the ledger that decides which migrations Prisma considers ' +
      'applied. One-shot, run by hand, untested. It is the last destructive ' +
      'script in deploy/ without coverage.',
  },
];

function trackedShellScripts() {
  const out = execFileSync('git', ['ls-files', '-s', '--', '*.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')[1]);
}

function isOperational(path) {
  return SCRIPT_DIRS.some((d) => path.startsWith(`${d}/`)) && !path.endsWith('.test.sh');
}

function destructiveScripts() {
  return trackedShellScripts()
    .filter(isOperational)
    .map((path) => {
      let contents = '';
      try {
        contents = readFileSync(resolve(REPO_ROOT, path), 'utf8');
      } catch {
        return null;
      }
      const hits = DESTRUCTIVE.filter((d) => d.pattern.test(contents));
      return hits.length ? { path, reasons: hits.map((h) => h.why) } : null;
    })
    .filter(Boolean);
}

function hasTest(path) {
  return existsSync(resolve(REPO_ROOT, path.replace(/\.sh$/, '.test.sh')));
}

test('no destructive operational script is untested without being recorded', () => {
  const unrecorded = destructiveScripts()
    .filter((s) => !hasTest(s.path))
    .filter((s) => !KNOWN_UNCOVERED.some((k) => k.path === s.path))
    .map((s) => `  ${s.path} — ${s.reasons.join(', ')}`);

  assert.equal(
    unrecorded.length,
    0,
    `These scripts can destroy production data and have no test. Add one, or ` +
      `add them to KNOWN_UNCOVERED in ` +
      `backend/scripts/destructive-script-coverage.test.mjs with a reason:\n` +
      `${unrecorded.join('\n')}`,
  );
});

test('the known-uncovered list only shrinks', () => {
  // If a gap is fixed, this fails until the list is updated — so the number
  // ratchets down and the record cannot silently drift back up.
  const nowCovered = KNOWN_UNCOVERED.filter((k) => hasTest(k.path)).map((k) => k.path);

  assert.equal(
    nowCovered.length,
    0,
    `These are listed as untested but now have a test. Remove them from ` +
      `KNOWN_UNCOVERED — the ratchet only works if it moves one way:\n` +
      `${nowCovered.map((p) => `  ${p}`).join('\n')}`,
  );
});

test('the known-uncovered list still points at real scripts', () => {
  const missing = KNOWN_UNCOVERED.filter(
    (k) => !existsSync(resolve(REPO_ROOT, k.path)),
  ).map((k) => k.path);

  assert.equal(
    missing.length,
    0,
    `KNOWN_UNCOVERED names scripts that no longer exist:\n` +
      `${missing.map((p) => `  ${p}`).join('\n')}`,
  );
});

test('the scan is not vacuous', () => {
  const found = destructiveScripts();
  assert.ok(
    found.length > 0,
    'No destructive scripts found in deploy/ — the guard is checking nothing.',
  );
  assert.ok(
    found.some((s) => hasTest(s.path)),
    'No destructive script has a test — the guard would pass on a repo with ' +
      'no coverage at all.',
  );
});
