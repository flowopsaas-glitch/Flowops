/**
 * Tests for the deploy-time RBAC_STRICT assertions.
 *
 * Run with: npm run release:safety:test   (also via npm run deploy-guard:test)
 *
 * WHY THIS EXISTS
 * ---------------
 * `RBAC_STRICT` is the only thing standing between production and a RolesGuard
 * that silently 403s nothing: with it false, a route that carries no access
 * decision is served rather than rejected. The base allowlist defaults it to
 * false so a laptop can run loose, which means production is strict only when
 * the host `.env` says so.
 *
 * On 2026-10-25 it was made strict by hand-editing `deploy/docker-compose.vps.yml`
 * on the box — a change that lives nowhere in this repository, dies on
 * `git checkout --`, and cannot be committed because `compose-env-allowlist.mjs`
 * (correctly) rejects an overlay hardcoding it. On 2026-11-04 that drift was
 * cleared and the value moved into `.env`, and two assertions were added to
 * `deploy/vps-deploy.sh` so the state can never quietly regress:
 *
 *   - pre-flight, before the stack moves: `.env` must say `true`;
 *   - post-start: `printenv` INSIDE the api container must return `true`,
 *     because a value in `.env` that never reaches the process is exactly how
 *     the original incident happened.
 *
 * These tests pin both assertions and prove the predicate actually separates
 * `true` from the shapes that look like it (`TRUE`, `1`, `"true"`, `truex`,
 * commented out, absent). A guard that passes on `1` is not a guard.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..', '..');
const DEPLOY_SCRIPT = path.join(REPO_ROOT, 'deploy', 'vps-deploy.sh');

const script = readFileSync(DEPLOY_SCRIPT, 'utf8');

/** The predicate the pre-flight uses, extracted so it is tested, not described. */
const PREFLIGHT_PREDICATE = "grep -q '^RBAC_STRICT=true$' .env";

function workspace(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'flowops-deploy-guard-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** True when the predicate accepts this .env content. */
function preflightAccepts(dir, envBody) {
  writeFileSync(path.join(dir, '.env'), envBody);
  try {
    execFileSync('sh', ['-c', PREFLIGHT_PREDICATE], { cwd: dir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ── The predicate ────────────────────────────────────────────────────────────

test('pre-flight accepts exactly RBAC_STRICT=true', (t) => {
  const dir = workspace(t);
  assert.equal(preflightAccepts(dir, 'POSTGRES_PASSWORD=x\nRBAC_STRICT=true\n'), true);
});

test('pre-flight rejects false, unset, and commented-out values', (t) => {
  const dir = workspace(t);
  const rejected = [
    'RBAC_STRICT=false\n',
    '# RBAC_STRICT=true\n',
    'POSTGRES_PASSWORD=x\n',
    '',
  ];
  for (const body of rejected) {
    assert.equal(preflightAccepts(dir, body), false, `accepted: ${JSON.stringify(body)}`);
  }
});

test('pre-flight rejects near-misses that a looser grep would wave through', (t) => {
  const dir = workspace(t);
  const rejected = [
    'RBAC_STRICT=TRUE\n', // RolesGuard compares to the literal 'true'
    'RBAC_STRICT=1\n',
    'RBAC_STRICT="true"\n', // quotes survive into the value in a .env line
    'RBAC_STRICT=truex\n',
    'RBAC_STRICT= true\n',
    'XRBAC_STRICT=true\n', // the ^ anchor is the point
    // CRLF from a Windows-side edit. RolesGuard compares to the literal
    // 'true', so a trailing \r makes the container non-strict while the file
    // looks correct — the $ anchor is what catches it.
    'RBAC_STRICT=true\r\n',
  ];
  for (const body of rejected) {
    assert.equal(preflightAccepts(dir, body), false, `accepted: ${JSON.stringify(body)}`);
  }
});

// ── The wiring ───────────────────────────────────────────────────────────────

test('vps-deploy.sh runs the pre-flight check before it pulls or builds', () => {
  const preflight = script.indexOf(PREFLIGHT_PREDICATE);
  assert.notEqual(preflight, -1, 'pre-flight RBAC_STRICT assertion is missing');

  // Failing AFTER the stack moved defeats the purpose of a pre-flight.
  const firstPull = script.indexOf('git pull --ff-only');
  const firstBuild = script.indexOf('Building images');
  assert.ok(firstPull > 0 && firstBuild > 0, 'expected pull/build markers in the deploy script');
  assert.ok(
    preflight < firstPull && preflight < firstBuild,
    'RBAC_STRICT must be asserted BEFORE the pull and the build',
  );
});

test('vps-deploy.sh proves the container, not just the config', () => {
  // The original incident: .env said one thing, the process saw another.
  assert.match(
    script,
    /exec -T api printenv RBAC_STRICT/,
    'the deploy must read RBAC_STRICT from inside the api container',
  );
  assert.match(
    script,
    /RBAC_LIVE.*!=.*"true"/s,
    'the deploy must FAIL when the container does not report true',
  );
});

test('the post-start check runs after the api is started', () => {
  const started = script.indexOf('Starting stack');
  const printenv = script.indexOf('exec -T api printenv RBAC_STRICT');
  assert.ok(started > 0 && printenv > 0);
  assert.ok(printenv > started, 'printenv must come after the stack is up');
});

// ── The file itself ──────────────────────────────────────────────────────────

test('vps-deploy.sh parses as shell', () => {
  // GitHub validates workflow YAML but not the bash inside it; this script is
  // not a workflow at all, so nothing but this test looks at its syntax.
  execFileSync('bash', ['-n', DEPLOY_SCRIPT], { stdio: 'pipe' });
});

test('no overlay hardcodes RBAC_STRICT — .env plus the base allowlist is the only route', () => {
  for (const overlay of ['deploy/docker-compose.vps.yml', 'docker-compose.prod.yml']) {
    const body = readFileSync(path.join(REPO_ROOT, overlay), 'utf8');
    assert.doesNotMatch(
      body,
      /^\s*RBAC_STRICT\s*:/m,
      `${overlay} hardcodes RBAC_STRICT; set it in .env instead`,
    );
  }
  const base = readFileSync(path.join(REPO_ROOT, 'docker-compose.yml'), 'utf8');
  assert.match(base, /RBAC_STRICT:\s*\$\{RBAC_STRICT:-false\}/);
});
