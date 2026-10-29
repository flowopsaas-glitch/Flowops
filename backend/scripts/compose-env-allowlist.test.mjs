/**
 * Tests for the Compose env-allowlist guard.
 *
 * Run with: npm run compose-env:test   (also part of release:safety:test)
 *
 * The guard exists because of a real production incident: RBAC_STRICT was set
 * on the host and in CI, the route inventory was at zero undecided, and the
 * api container still ran NON-strict because docker-compose.yml passes only an
 * explicit `environment:` allowlist and no `env_file:`. These tests pin both
 * the guard's mechanics and the fact that the real repository satisfies it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import {
  BASE_COMPOSE,
  REPO_ROOT,
  REQUIRED_API_ENV,
  checkComposeEnvAllowlist,
  interpolate,
  readServiceEnvironment,
} from './compose-env-allowlist.mjs';

// ── Compose interpolation semantics ──────────────────────────────────────────

test('interpolate: ${VAR:-default} falls back when unset OR empty', () => {
  assert.equal(interpolate('${RBAC_STRICT:-false}', {}), 'false');
  assert.equal(interpolate('${RBAC_STRICT:-false}', { RBAC_STRICT: '' }), 'false');
  assert.equal(interpolate('${RBAC_STRICT:-false}', { RBAC_STRICT: 'false' }), 'false');
  assert.equal(interpolate('${RBAC_STRICT:-false}', { RBAC_STRICT: 'true' }), 'true');
});

test('interpolate: ${VAR-default} keeps an explicitly empty value', () => {
  assert.equal(interpolate('${RBAC_STRICT-false}', {}), 'false');
  assert.equal(interpolate('${RBAC_STRICT-false}', { RBAC_STRICT: '' }), '');
  assert.equal(interpolate('${RBAC_STRICT-false}', { RBAC_STRICT: 'true' }), 'true');
});

test('interpolate: ${VAR:?msg} aborts when unset or empty, as Compose does', () => {
  assert.throws(() => interpolate('${JWT_SECRET:?set it}', {}), /missing or empty/);
  assert.throws(() => interpolate('${JWT_SECRET:?set it}', { JWT_SECRET: '' }), /missing or empty/);
  assert.equal(interpolate('${JWT_SECRET:?set it}', { JWT_SECRET: 'abc' }), 'abc');
});

test('interpolate: ${VAR?msg} aborts only when unset — an explicit empty is allowed', () => {
  assert.throws(() => interpolate('${OTP_HMAC_SECRET?set it}', {}), /is missing/);
  assert.equal(interpolate('${OTP_HMAC_SECRET?set it}', { OTP_HMAC_SECRET: '' }), '');
  assert.equal(interpolate('${OTP_HMAC_SECRET?set it}', { OTP_HMAC_SECRET: 'k' }), 'k');
});

test('interpolate: ${VAR:+alt} / ${VAR+alt} substitute only when the value is present', () => {
  assert.equal(interpolate('${DEBUG:+--verbose}', {}), '');
  assert.equal(interpolate('${DEBUG:+--verbose}', { DEBUG: '' }), '');
  assert.equal(interpolate('${DEBUG:+--verbose}', { DEBUG: '1' }), '--verbose');
  assert.equal(interpolate('${DEBUG+--verbose}', { DEBUG: '' }), '--verbose');
  assert.equal(interpolate('${DEBUG+--verbose}', {}), '');
});

test('interpolate: the :- vs - distinction is preserved for the guarded key', () => {
  // The exact regression this guard exists for: RBAC_STRICT= (present but empty)
  // on the host must still land on the safe default, never on "".
  assert.equal(interpolate('${RBAC_STRICT:-false}', { RBAC_STRICT: '' }), 'false');
  assert.equal(interpolate('${RBAC_STRICT-false}', { RBAC_STRICT: '' }), '');
});

test('interpolate: bare ${VAR} renders empty when unset, and resolves nested defaults', () => {
  assert.equal(interpolate('${NOPE}', {}), '');
  assert.equal(interpolate('${IMAGE_TAG:-latest}', {}), 'latest');
  assert.equal(
    interpolate('flowops/backend:${IMAGE_TAG:-latest}', { IMAGE_TAG: 'sha-abc123' }),
    'flowops/backend:sha-abc123',
  );
  // Nested: the inner default resolves first, then the outer expression.
  assert.equal(interpolate('${BACKEND_IMAGE:-flowops/backend:${IMAGE_TAG:-latest}}', {}), 'flowops/backend:latest');
});

test('interpolate leaves non-interpolated scalars untouched', () => {
  assert.equal(interpolate('production', {}), 'production');
  assert.equal(interpolate('', {}), '');
  assert.equal(interpolate(undefined, {}), undefined);
});

// ── Service environment reader ───────────────────────────────────────────────

const BASE_FIXTURE = `name: flowops

services:
  frontend:
    environment:
      NGINX_PORT: 80

  api:
    build:
      context: ./backend
    environment:
      # ── Core ────────────────────────────────
      NODE_ENV: \${NODE_ENV:-production}
      PORT: \${API_PORT:-3000}

      # ── Security posture ────────────────────
      RBAC_STRICT: \${RBAC_STRICT:-false}
      DATABASE_URL: postgresql://u:\${POSTGRES_PASSWORD:?set it}@postgres:5432/db
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine

volumes:
  postgres-data:
`;

function fixture({ base = BASE_FIXTURE, overlays = {}, templates = {}, guard = null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'flowops-compose-env-'));
  writeFileSync(path.join(root, BASE_COMPOSE), base);
  for (const [rel, text] of Object.entries(overlays)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  for (const [rel, text] of Object.entries(templates)) {
    writeFileSync(path.join(root, rel), text);
  }
  const guardRel = 'backend/src/common/guards/roles.guard.ts';
  const guardAbs = path.join(root, guardRel);
  mkdirSync(path.dirname(guardAbs), { recursive: true });
  writeFileSync(
    guardAbs,
    guard ?? "if (process.env.RBAC_STRICT === 'true') { throw new ForbiddenException(); }\n",
  );
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const GOOD_TEMPLATES = {
  '.env.example': 'JWT_SECRET=x\nRBAC_STRICT=false\n',
  '.env.production.example': 'JWT_SECRET=x\nRBAC_STRICT=true\n',
};

test('readServiceEnvironment finds the api allowlist and ignores comment/blank lines', () => {
  const env = readServiceEnvironment(BASE_FIXTURE, 'api');
  assert.equal(env.found, true);
  assert.equal(env.hasEnvironment, true);
  assert.equal(env.hasEnvFile, false);
  assert.equal(env.replaceTag, null);
  assert.deepEqual(
    env.entries.map((e) => e.key),
    ['NODE_ENV', 'PORT', 'RBAC_STRICT', 'DATABASE_URL'],
  );
  assert.equal(env.entries.find((e) => e.key === 'RBAC_STRICT').raw, '${RBAC_STRICT:-false}');
});

test('readServiceEnvironment does not leak another service into the api block', () => {
  // `frontend` also has an environment block; scanning must stop at the next service.
  const env = readServiceEnvironment(BASE_FIXTURE, 'frontend');
  assert.deepEqual(env.entries.map((e) => e.key), ['NGINX_PORT']);
  const api = readServiceEnvironment(BASE_FIXTURE, 'api');
  assert.ok(!api.entries.some((e) => e.key === 'NGINX_PORT'));
});

test('readServiceEnvironment reports a missing service rather than passing silently', () => {
  const env = readServiceEnvironment(BASE_FIXTURE, 'does-not-exist');
  assert.equal(env.found, false);
  assert.match(env.reason, /not present/);
});

test('readServiceEnvironment reports a file with no services: block', () => {
  const env = readServiceEnvironment('name: flowops\n', 'api');
  assert.equal(env.found, false);
  assert.match(env.reason, /no top-level services/);
});

// ── The guard, on fixtures ───────────────────────────────────────────────────

test('a correctly-allowlisted key passes with renderings recorded as evidence', () => {
  const f = fixture({ templates: GOOD_TEMPLATES });
  const result = checkComposeEnvAllowlist(f.root);
  assert.equal(result.ok, true, JSON.stringify(result.gaps));
  assert.deepEqual(result.gaps, []);

  const renders = result.evidence.filter((e) => e.key === 'RBAC_STRICT' && e.hostEnv);
  assert.deepEqual(
    renders.map((r) => [r.hostEnv, r.rendersTo]),
    [['unset', 'false'], ['empty', 'false'], ['false', 'false'], ['true', 'true']],
  );
  f.cleanup();
});

test('GAP: the key missing from the allowlist (the real RBAC_STRICT production bug)', () => {
  const f = fixture({
    base: BASE_FIXTURE.replace('      RBAC_STRICT: ${RBAC_STRICT:-false}\n', ''),
    templates: GOOD_TEMPLATES,
  });
  const result = checkComposeEnvAllowlist(f.root);
  assert.equal(result.ok, false);
  assert.match(result.gaps.join('\n'), /RBAC_STRICT is missing from the api environment: allowlist/);
  assert.match(result.gaps.join('\n'), /never reach the container/);
  f.cleanup();
});

test('an env_file makes the key reachable, so a missing allowlist entry is evidence not a gap', () => {
  const f = fixture({
    base: BASE_FIXTURE.replace(
      '      RBAC_STRICT: ${RBAC_STRICT:-false}\n',
      '',
    ).replace('    environment:\n      # ── Core', '    env_file: .env\n    environment:\n      # ── Core'),
    templates: GOOD_TEMPLATES,
  });
  const result = checkComposeEnvAllowlist(f.root);
  assert.equal(result.ok, true, JSON.stringify(result.gaps));
  assert.ok(result.evidence.some((e) => e.key === 'RBAC_STRICT' && e.reachableVia === 'env_file'));
  f.cleanup();
});

test('GAP: a hardcoded overlay value (the hand-edited host file)', () => {
  const f = fixture({
    templates: GOOD_TEMPLATES,
    overlays: {
      'deploy/docker-compose.vps.yml': `services:
  api:
    restart: always
    environment:
      NODE_ENV: production
      RBAC_STRICT: "true"
`,
    },
  });
  const result = checkComposeEnvAllowlist(f.root);
  assert.equal(result.ok, false);
  assert.match(result.gaps.join('\n'), /hardcodes RBAC_STRICT/);
  assert.match(result.gaps.join('\n'), /single source of truth/);
  f.cleanup();
});

test('GAP: !reset on the overlay api environment discards the base allowlist', () => {
  for (const tag of ['!reset', '!override']) {
    const f = fixture({
      templates: GOOD_TEMPLATES,
      overlays: {
        'docker-compose.prod.yml': `services:
  api:
    environment: ${tag}
      NODE_ENV: production
`,
      },
    });
    const result = checkComposeEnvAllowlist(f.root);
    assert.equal(result.ok, false, `${tag} should discard the allowlist entry`);
    assert.match(result.gaps.join('\n'), new RegExp(`uses ${tag} on the api environment block`));
    f.cleanup();
  }
});

test('a plain overlay environment map MERGES, so it is not a gap', () => {
  const f = fixture({
    templates: GOOD_TEMPLATES,
    overlays: {
      'docker-compose.prod.yml': `services:
  api:
    restart: always
    environment:
      NODE_ENV: production
      APP_URL: https://app.flowop.work
`,
    },
  });
  const result = checkComposeEnvAllowlist(f.root);
  assert.equal(result.ok, true, JSON.stringify(result.gaps));
  f.cleanup();
});

test('GAP: a wrong default (renders empty instead of false)', () => {
  const f = fixture({
    base: BASE_FIXTURE.replace('${RBAC_STRICT:-false}', '${RBAC_STRICT}'),
    templates: GOOD_TEMPLATES,
  });
  const result = checkComposeEnvAllowlist(f.root);
  assert.equal(result.ok, false);
  assert.match(result.gaps.join('\n'), /renders to ""/);
  f.cleanup();
});

test('GAP: an env template that never mentions the key', () => {
  const f = fixture({
    templates: { '.env.example': 'JWT_SECRET=x\n', '.env.production.example': 'RBAC_STRICT=true\n' },
  });
  const result = checkComposeEnvAllowlist(f.root);
  assert.equal(result.ok, false);
  assert.match(result.gaps.join('\n'), /\.env\.example does not document RBAC_STRICT/);
  f.cleanup();
});

test('a commented-out template line does not count as documented', () => {
  const f = fixture({
    templates: {
      '.env.example': '# RBAC_STRICT=true\n',
      '.env.production.example': 'RBAC_STRICT=true\n',
    },
  });
  const result = checkComposeEnvAllowlist(f.root);
  assert.equal(result.ok, false);
  assert.match(result.gaps.join('\n'), /does not document RBAC_STRICT/);
  f.cleanup();
});

test('GAP: the consuming code drifts from the compose default', () => {
  const f = fixture({
    templates: GOOD_TEMPLATES,
    guard: "if (['1', 'yes', 'true'].includes(String(process.env.RBAC_STRICT).toLowerCase())) {}\n",
  });
  const result = checkComposeEnvAllowlist(f.root);
  assert.equal(result.ok, false);
  assert.match(result.gaps.join('\n'), /drifted apart/);
  f.cleanup();
});

test('GAP: a missing base compose file or api service fails loudly, never passes', () => {
  const empty = mkdtempSync(path.join(tmpdir(), 'flowops-compose-empty-'));
  const noFile = checkComposeEnvAllowlist(empty);
  assert.equal(noFile.ok, false);
  assert.match(noFile.gaps.join('\n'), /docker-compose\.yml not found/);

  writeFileSync(path.join(empty, BASE_COMPOSE), 'name: flowops\n\nservices:\n  postgres:\n    image: postgres:16\n');
  const noApi = checkComposeEnvAllowlist(empty);
  assert.equal(noApi.ok, false);
  assert.match(noApi.gaps.join('\n'), /service "api" not present/);

  writeFileSync(
    path.join(empty, BASE_COMPOSE),
    'name: flowops\n\nservices:\n  api:\n    image: flowops/backend\n',
  );
  const noEnv = checkComposeEnvAllowlist(empty);
  assert.equal(noEnv.ok, false);
  assert.match(noEnv.gaps.join('\n'), /has no environment: block/);
  rmSync(empty, { recursive: true, force: true });
});

// ── The real repository ──────────────────────────────────────────────────────

test('the real repository passes the allowlist guard', () => {
  const result = checkComposeEnvAllowlist(REPO_ROOT);
  assert.equal(result.ok, true, `gaps:\n${result.gaps.join('\n')}`);
});

test('RBAC_STRICT is the guarded key and its base entry is ${RBAC_STRICT:-false}', () => {
  const spec = REQUIRED_API_ENV.find((s) => s.key === 'RBAC_STRICT');
  assert.ok(spec, 'RBAC_STRICT must stay in REQUIRED_API_ENV');
  assert.equal(spec.raw, '${RBAC_STRICT:-false}');
  assert.deepEqual(spec.renders, { unset: 'false', empty: 'false', false: 'false', true: 'true' });

  const text = repoFile(BASE_COMPOSE);
  assert.match(text, /^\s{6}RBAC_STRICT: \$\{RBAC_STRICT:-false\}\s*$/m);
});

test('no committed overlay hardcodes RBAC_STRICT for the api service', () => {
  let checked = 0;
  for (const rel of [
    'docker-compose.prod.yml',
    'docker-compose.otel.yml',
    'deploy/docker-compose.vps.yml',
  ]) {
    if (!existsSync(path.join(REPO_ROOT, rel))) continue; // overlay not in this tree
    checked += 1;
    assert.doesNotMatch(repoFile(rel), /^\s*RBAC_STRICT:/m, `${rel} must not set RBAC_STRICT`);
  }
  assert.ok(checked >= 2, `expected the prod + VPS overlays to exist, saw ${checked}`);
});

test('the real RolesGuard treats only the literal string "true" as strict', () => {
  const guard = repoFile('backend/src/common/guards/roles.guard.ts');
  assert.match(guard, /process\.env\.RBAC_STRICT === 'true'/);
  // The strict branch must reject undecided routes, and must stay above the
  // user check so @Public routes (no authenticated user) are not 403ed.
  const strictIdx = guard.indexOf("process.env.RBAC_STRICT === 'true'");
  const userCheckIdx = guard.indexOf('const { user } = context.switchToHttp().getRequest();');
  assert.ok(strictIdx > -1 && userCheckIdx > -1);
  assert.ok(strictIdx < userCheckIdx, 'strict rejection must precede the tenant-user check');
});

function repoFile(rel) {
  return readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
