/**
 * Tests for scripts/compose-env-sweep.mjs.
 *
 * The trap this suite exists to pin is the same one that made the first
 * sweep wrong: counting reads without asking WHO reads them. Seven of the
 * fourteen keys an early version reported as production gaps were read only
 * inside *.spec.ts — harness knobs that must never reach a container. A
 * sweep that demanded those be allowlisted would have "fixed" production by
 * shipping test switches to it.
 *
 * The second trap is the compose overlays. deploy/docker-compose.vps.yml uses
 * !reset and !override, which a plain YAML parser throws on. If that throws
 * are swallowed, the overlay production actually runs contributes nothing and
 * the sweep reports a clean result it never checked.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectEnvReads,
  collectComposeApiEnv,
  parseComposeApiEnv,
  analyse,
  EXEMPT,
  COMPOSE_FILES,
} from './compose-env-sweep.mjs';

/** Build a compose-shaped object from a plain map of key -> value. */
function composeOf(entries) {
  return { merged: new Map(Object.entries(entries)), perFile: [] };
}

describe('analyse — gap detection', () => {
  test('a production read with no allowlist entry is a gap', () => {
    const r = analyse({
      production: new Set(['DRIVER_REQUIRE_DOCUMENTS']),
      compose: composeOf({ NODE_ENV: '${NODE_ENV:-production}' }),
    });
    assert.equal(r.gaps.length, 1);
    assert.equal(r.gaps[0].key, 'DRIVER_REQUIRE_DOCUMENTS');
  });

  test('an allowlisted key is not a gap', () => {
    const r = analyse({
      production: new Set(['RBAC_STRICT']),
      compose: composeOf({ RBAC_STRICT: '${RBAC_STRICT:-false}' }),
    });
    assert.deepEqual(r.gaps, []);
  });

  test('a key read only by tests is not required to be allowlisted', () => {
    // analyse() only ever sees the production set — the exclusion happens in
    // collectEnvReads. This pins that contract: passing a test-only key in
    // would break it, so the split must happen upstream.
    const r = analyse({
      production: new Set(),
      compose: composeOf({}),
    });
    assert.deepEqual(r.gaps, []);
  });

  test('every exemption must carry a written reason', () => {
    // The exported list is the one that ships; an entry without a reason is
    // a gap too, so the list cannot be used to wave things through silently.
    for (const entry of EXEMPT) {
      assert.ok(entry.key, 'exemption needs a key');
      assert.ok(
        typeof entry.reason === 'string' && entry.reason.trim().length > 0,
        `exemption ${entry.key} has no reason — an exemption is a decision, not a default`,
      );
    }
  });
});

describe('analyse — hardcoded values', () => {
  test('an allowlisted key with no interpolation is flagged', () => {
    const r = analyse({
      production: new Set(['APP_URL']),
      compose: composeOf({ APP_URL: 'https://app.flowop.work' }),
    });
    assert.deepEqual(r.gaps, []);
    assert.deepEqual(r.hardcoded, ['APP_URL']);
  });

  test('an interpolated key is not flagged', () => {
    const r = analyse({
      production: new Set(['APP_URL']),
      compose: composeOf({ APP_URL: '${APP_URL:-http://localhost:8080}' }),
    });
    assert.deepEqual(r.hardcoded, []);
  });

  test('a hardcoded key that no production code reads is not flagged', () => {
    const r = analyse({
      production: new Set(),
      compose: composeOf({ SOMETHING_ELSE: 'literal' }),
    });
    assert.deepEqual(r.hardcoded, []);
  });
});

describe('collectEnvReads — the spec-file trap', () => {
  const reads = collectEnvReads();

  test('test-only knobs are excluded from the production set', () => {
    for (const key of [
      'ALLOW_AI_CHAOS_SIMULATION',
      'ALLOW_AI_SELF_REPAIR',
      'PROCESS_CONTROL_ENABLED',
      'PRODUCT_MASTER_ENABLED',
    ]) {
      assert.ok(reads.test.has(key), `${key} should be seen as test-read`);
      assert.ok(
        !reads.production.has(key),
        `${key} is read only by tests and must NOT be required in the container`,
      );
    }
  });

  test('keys read by production source are in the production set', () => {
    for (const key of ['DRIVER_REQUIRE_DOCUMENTS', 'OSRM_BASE_URL', 'GROQ_MODEL']) {
      assert.ok(reads.production.has(key), `${key} is read by production code`);
    }
  });

  test('RBAC_STRICT is read by production source (the guard has work to do)', () => {
    assert.ok(reads.production.has('RBAC_STRICT'));
  });
});

describe('compose parsing', () => {
  test('the base compose file parses and exposes the api allowlist', () => {
    const parsed = parseComposeApiEnv(COMPOSE_FILES[0]);
    assert.ok(parsed, 'docker-compose.yml must parse');
    assert.ok(parsed.entries.size > 50, `expected a large allowlist, got ${parsed.entries.size}`);
    assert.equal(parsed.envFile, null, 'api must not use env_file');
  });

  test('the VPS overlay parses despite !reset / !override', () => {
    // This is the file production actually runs. If the custom tags are not
    // registered it throws, and a caller that swallows the throw would see a
    // clean sweep that never looked at production.
    const vps = COMPOSE_FILES.find((f) => f.includes('vps'));
    const parsed = parseComposeApiEnv(vps);
    assert.ok(parsed, 'deploy/docker-compose.vps.yml must parse');
    assert.ok(parsed.entries.size > 0, 'the overlay contributes environment entries');
  });

  test('collectComposeApiEnv reports every file it managed to read', () => {
    const { perFile, merged } = collectComposeApiEnv();
    assert.equal(perFile.length, 3, 'all three compose files should parse');
    assert.ok(merged.size > 50);
  });
});

describe('the shipped tree', () => {
  test('no production env key is missing from the allowlist', () => {
    const reads = collectEnvReads();
    const compose = collectComposeApiEnv();
    const r = analyse({ production: reads.production, compose });
    assert.deepEqual(
      r.gaps,
      [],
      `these keys are read by production code but never reach the container: ${r.gaps
        .map((g) => g.key)
        .join(', ')}`,
    );
  });

  test('every key that was added has an interpolated default', () => {
    // Adding a key fixes nothing if the value is a literal — the host .env
    // still cannot change it.
    const compose = collectComposeApiEnv();
    for (const key of [
      'APP_VERSION',
      'DRIVER_REQUIRE_DOCUMENTS',
      'GROQ_MODEL',
      'MANIFEST_REQUIRE_HUB_RECEIVE',
      'OSRM_BASE_URL',
      'WAYBILL_STRICT_TRANSITIONS',
      'WAYBILL_TRANSITION_MODE',
    ]) {
      const raw = compose.merged.get(key);
      assert.ok(raw !== undefined, `${key} must be in the allowlist`);
      assert.ok(
        raw.includes('${'),
        `${key} is hardcoded to "${raw}" — a host .env still cannot change it`,
      );
    }
  });
});
