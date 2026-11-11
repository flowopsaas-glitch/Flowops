/**
 * Compose env-allowlist guard.
 *
 * WHY THIS EXISTS
 * ---------------
 * The `api` service in docker-compose.yml declares an explicit `environment:`
 * allowlist and NO `env_file:`. Compose does not hand a container the whole
 * .env in that shape — only the keys listed under `environment:` are passed
 * through. So a variable that the backend reads but that is missing from the
 * allowlist is silently dropped: it is set in .env, it looks configured, and
 * the container never sees it.
 *
 * That is exactly what happened with RBAC_STRICT. The route inventory was
 * driven to zero undecided, CI was forced strict, and production still ran
 * NON-strict because nothing carried the value into the api container. It was
 * only enabled on 2026-10-25 by an operator hand-editing
 * deploy/docker-compose.vps.yml on the host — a change that lives nowhere in
 * this repository and would be lost on the next clean checkout.
 *
 * This script is the permanent repo-side fix's regression guard. It asserts,
 * without needing Docker, that:
 *
 *   1. every key in REQUIRED_API_ENV is present in the base file's api
 *      `environment:` allowlist (the only route into the container),
 *   2. the value interpolates to the intended rendering for unset / empty /
 *      false / true (a `${VAR:-false}` default that silently rendered to ""
 *      would be a different bug with the same symptom),
 *   3. no overlay hardcodes or replaces that entry — a plain `environment:`
 *      map merges key-by-key, but `!reset` / `!override` on the api
 *      environment would DISCARD the base allowlist and drop the key again,
 *   4. the key is documented as a real assignment in the env templates, and
 *   5. the backend actually reads the value the way the compose default
 *      assumes (RolesGuard compares to the literal string 'true'), so the
 *      compose side and the code side cannot drift apart silently.
 *
 * When Docker IS available, `docker compose config` is the better oracle — the
 * CI "Compose Config" job runs the same three renderings through the real
 * interpolator. This script is the no-Docker equivalent so the Backend job and
 * a laptop without Docker are covered too.
 *
 * Usage:
 *   node scripts/compose-env-allowlist.mjs            # human-readable report
 *   node scripts/compose-env-allowlist.mjs --check    # exit 1 on any gap
 *   node scripts/compose-env-allowlist.mjs --format json
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** backend/scripts -> backend -> repo root */
export const REPO_ROOT = join(HERE, '..', '..');

export const BASE_COMPOSE = 'docker-compose.yml';
export const OVERLAY_COMPOSES = [
  'docker-compose.prod.yml',
  'docker-compose.otel.yml',
  'deploy/docker-compose.vps.yml',
];

/**
 * Keys the backend reads for its security posture and that therefore MUST be
 * in the api `environment:` allowlist. Add to this list whenever a new
 * security-relevant env var is introduced — the whole point is that "I set it
 * in .env" is never again sufficient evidence that the container sees it.
 */
export const REQUIRED_API_ENV = [
  {
    key: 'RBAC_STRICT',
    /** Raw compose expression the allowlist entry must use. */
    raw: '${RBAC_STRICT:-false}',
    /** What the expression must render to for each host env state. */
    renders: {
      unset: 'false',
      empty: 'false',
      false: 'false',
      true: 'true',
    },
    /** Env templates that must carry a real (uncommented) assignment. */
    documentedIn: ['.env.example', '.env.production.example'],
    /**
     * Source-of-truth check: the code that consumes the variable must compare
     * against the literal the compose default assumes. If RolesGuard ever
     * switched to a truthy parse ("1"/"yes"), a rendered "false" would still
     * be non-strict but the two files would disagree about what strict means.
     */
    consumedBy: {
      file: 'backend/src/common/guards/roles.guard.ts',
      pattern: /process\.env\.RBAC_STRICT === 'true'/,
    },
  },
  {
    // Same failure mode as RBAC_STRICT, different variable. The api service
    // allowlists `environment:` and declares no env_file, so a key set in the
    // host .env but missing here never reaches the container — and the symptom
    // is not "wrong value", it is "feature silently refuses to store secrets".
    //
    // Only the unset and empty states are asserted: this is a secret, so there
    // is no meaningful 'true'/'false' rendering to check. The point is that an
    // unset or blank host value stays blank rather than rendering to something
    // that looks like a key.
    key: 'INTEGRATIONS_ENC_KEY',
    raw: '${INTEGRATIONS_ENC_KEY:-}',
    renders: { unset: '', empty: '' },
    documentedIn: ['.env.example', '.env.production.example'],
    consumedBy: {
      file: 'backend/src/integrations/integration-crypto.service.ts',
      pattern: /loadKey\('INTEGRATIONS_ENC_KEY'\)/,
    },
  },
];

// ── Compose interpolation (the subset this repo uses) ────────────────────────

/**
 * Resolve compose variable syntax in one scalar value.
 *
 *   ${VAR:-default}  VAR unset OR empty -> default
 *   ${VAR-default}   VAR unset          -> default (an explicit empty is kept)
 *   ${VAR:?message}  VAR unset OR empty -> throws (compose aborts)
 *   ${VAR?message}   VAR unset          -> throws
 *   ${VAR:+alt}      VAR set AND non-empty -> alt, otherwise empty
 *   ${VAR+alt}       VAR set            -> alt, otherwise empty
 *   ${VAR}           VAR unset          -> empty string
 *
 * The operator capture MUST include the leading colon: `:-` and `-` are
 * different operators (empty-is-unset vs empty-is-a-value), and treating them
 * as one silently renders `${RBAC_STRICT:-false}` to "" when the host sets
 * RBAC_STRICT= — which RolesGuard reads as non-strict.
 *
 * Nested defaults (`${IMAGE_TAG:-latest}` inside another expression) are
 * resolved inside-out, which is what Compose itself does.
 */
export function interpolate(value, env) {
  if (typeof value !== 'string') return value;
  let out = value;
  // Resolve innermost ${...} first so nested defaults fall out naturally.
  for (let guard = 0; guard < 10 && out.includes('${'); guard += 1) {
    const next = out.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?+])([^}]*))?\}/g,
      (_match, name, op, arg) => {
        const set = Object.prototype.hasOwnProperty.call(env, name);
        const raw = set ? String(env[name]) : undefined;
        const empty = !set || raw === '';
        switch (op) {
          case ':-': return empty ? arg : raw;
          case '-':  return set ? raw : arg;
          case ':?':
            if (empty) throw new Error(`required variable ${name} is missing or empty: ${arg}`);
            return raw;
          case '?':
            if (!set) throw new Error(`required variable ${name} is missing: ${arg}`);
            return raw;
          case ':+': return empty ? '' : arg;
          case '+':  return set ? arg : '';
          default:   return empty ? '' : raw;
        }
      },
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

// ── Minimal compose service reader ───────────────────────────────────────────

/**
 * Read one service's `environment:` block out of a compose file as an ordered
 * list of { key, raw } plus the flags that would change how Compose merges it.
 *
 * Deliberately NOT a YAML parser: Compose overlays in this repo use the
 * `!reset` / `!override` custom tags, which a stock parser rejects, and the
 * only thing this guard needs is the api service's env mapping and whether an
 * overlay tried to replace it. Indentation-based scanning is exact enough for
 * the two-space style every file here is written in, and it fails loudly
 * (rather than silently returning nothing) when the shape changes.
 */
export function readServiceEnvironment(text, service) {
  const lines = text.split('\n');

  // Locate `services:` at column 0, then the service key two spaces in.
  const servicesIdx = lines.findIndex((l) => /^services:\s*(#.*)?$/.test(l));
  if (servicesIdx === -1) return { found: false, reason: 'no top-level services: block' };

  const serviceRe = new RegExp(`^  ${service}:\\s*(#.*)?$`);
  let start = -1;
  for (let i = servicesIdx + 1; i < lines.length; i += 1) {
    if (serviceRe.test(lines[i])) { start = i; break; }
    // Another top-level key ends the services block.
    if (/^[A-Za-z]/.test(lines[i])) break;
  }
  if (start === -1) return { found: false, reason: `service "${service}" not present` };

  // The service block runs until the next two-space (or column-0) key.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {0,2}\S/.test(lines[i]) && !/^ {2}#/.test(lines[i])) { end = i; break; }
  }

  // `environment:` may be a block map, an inline list, or tagged for replace.
  const envIdx = lines
    .slice(start + 1, end)
    .findIndex((l) => /^ {4}environment:\s*/.test(l));
  if (envIdx === -1) {
    return { found: true, hasEnvironment: false, entries: [], replaceTag: null, hasEnvFile: false };
  }
  const envLine = lines[start + 1 + envIdx];
  const afterColon = envLine.replace(/^ {4}environment:\s*/, '').trim();
  const replaceTag = /!(reset|override)\b/.test(afterColon) ? afterColon.match(/!(reset|override)/)[1] : null;

  const hasEnvFile = lines
    .slice(start + 1, end)
    .some((l) => /^ {4}env_file:\s*/.test(l));

  const entries = [];
  for (let i = start + 2 + envIdx; i < end; i += 1) {
    const line = lines[i];
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    // A dedent to <= 4 spaces leaves the environment block.
    if (!/^ {6,}/.test(line)) break;
    const m = line.match(/^ {6}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    entries.push({ key: m[1], raw: m[2].trim().replace(/^["']|["']$/g, '') });
  }

  return { found: true, hasEnvironment: true, entries, replaceTag, hasEnvFile };
}

// ── The check ────────────────────────────────────────────────────────────────

/** Run every assertion. Pure: takes a repo root, returns gaps + evidence. */
export function checkComposeEnvAllowlist(root = REPO_ROOT) {
  const gaps = [];
  const evidence = [];
  const read = (rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return null;
    return readFileSync(abs, 'utf8');
  };

  const baseText = read(BASE_COMPOSE);
  if (baseText === null) {
    return { ok: false, gaps: [`${BASE_COMPOSE} not found at ${root}`], evidence: [] };
  }
  const base = readServiceEnvironment(baseText, 'api');
  if (!base.found) {
    return { ok: false, gaps: [`api service: ${base.reason} in ${BASE_COMPOSE}`], evidence: [] };
  }
  if (!base.hasEnvironment) {
    gaps.push(`api service in ${BASE_COMPOSE} has no environment: block — nothing reaches the container`);
  }
  evidence.push({
    file: BASE_COMPOSE,
    service: 'api',
    allowlistKeys: base.entries.length,
    hasEnvFile: base.hasEnvFile,
    replaceTag: base.replaceTag,
  });

  for (const spec of REQUIRED_API_ENV) {
    const entry = base.entries.find((e) => e.key === spec.key);

    // (1) present in the allowlist — unless an env_file makes it reachable.
    if (!entry) {
      if (base.hasEnvFile) {
        evidence.push({ key: spec.key, reachableVia: 'env_file' });
      } else {
        gaps.push(
          `${spec.key} is missing from the api environment: allowlist in ${BASE_COMPOSE} and the service declares no env_file: — ` +
            'a value set in .env can never reach the container (this is the RBAC_STRICT production bug).',
        );
      }
      continue;
    }

    // (2) exact expression + rendered values for each host env state.
    if (entry.raw !== spec.raw) {
      gaps.push(`${spec.key} in ${BASE_COMPOSE} is \`${entry.raw}\`, expected \`${spec.raw}\``);
    }
    for (const [state, expected] of Object.entries(spec.renders)) {
      const env =
        state === 'unset' ? {}
        : state === 'empty' ? { [spec.key]: '' }
        : state === 'false' ? { [spec.key]: 'false' }
        : { [spec.key]: 'true' };
      let actual;
      try {
        actual = interpolate(entry.raw, env);
      } catch (err) {
        gaps.push(`${spec.key} interpolation threw for ${state}: ${err.message}`);
        continue;
      }
      evidence.push({ key: spec.key, hostEnv: state, rendersTo: actual });
      if (actual !== expected) {
        gaps.push(`${spec.key} with host env ${state} renders to ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
      }
    }

    // (3) overlays must not hardcode or replace the entry.
    for (const rel of OVERLAY_COMPOSES) {
      const text = read(rel);
      if (text === null) {
        evidence.push({ file: rel, note: 'not present in this tree' });
        continue;
      }
      const overlay = readServiceEnvironment(text, 'api');
      if (!overlay.found || !overlay.hasEnvironment) {
        evidence.push({ file: rel, api: overlay.found ? 'no environment block' : overlay.reason });
        continue;
      }
      evidence.push({ file: rel, replaceTag: overlay.replaceTag, hasEnvFile: overlay.hasEnvFile });
      const hard = overlay.entries.find((e) => e.key === spec.key);
      if (hard) {
        gaps.push(
          `${rel} hardcodes ${spec.key}: ${hard.raw} for the api service — the base allowlist must stay the single source of truth ` +
            '(a host-side overlay value is invisible to a clean checkout).',
        );
      }
      if (overlay.replaceTag) {
        gaps.push(
          `${rel} uses !${overlay.replaceTag} on the api environment block, which DISCARDS the base allowlist — ` +
            `${spec.key} (and every other allowlisted key) would stop reaching the container.`,
        );
      }
      if (overlay.hasEnvFile) {
        evidence.push({ file: rel, note: 'api declares env_file — merge order with the base allowlist needs review' });
      }
    }

    // (4) documented as a real assignment in the env templates.
    for (const rel of spec.documentedIn ?? []) {
      const text = read(rel);
      if (text === null) {
        evidence.push({ file: rel, note: 'template not present' });
        continue;
      }
      const assigned = text
        .split('\n')
        .some((l) => new RegExp(`^\\s*${spec.key}\\s*=`).test(l));
      evidence.push({ file: rel, documentsKey: assigned });
      if (!assigned) {
        gaps.push(`${rel} does not document ${spec.key} as an assignment an operator can edit`);
      }
    }

    // (5) the consuming code agrees about what the value means.
    if (spec.consumedBy) {
      const text = read(spec.consumedBy.file);
      if (text === null) {
        gaps.push(`${spec.consumedBy.file} not found — cannot confirm how ${spec.key} is consumed`);
      } else if (!spec.consumedBy.pattern.test(text)) {
        gaps.push(
          `${spec.consumedBy.file} no longer reads ${spec.key} the way the compose default assumes ` +
            `(${spec.consumedBy.pattern}) — the allowlist entry and the code have drifted apart.`,
        );
      } else {
        evidence.push({ file: spec.consumedBy.file, readsKeyAs: String(spec.consumedBy.pattern) });
      }
    }
  }

  return { ok: gaps.length === 0, gaps, evidence };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const check = process.argv.includes('--check');
  const json = process.argv.includes('--format=json') || process.argv.includes('--json');
  const result = checkComposeEnvAllowlist();

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    for (const e of result.evidence) {
      if (e.key && e.hostEnv) {
        process.stdout.write(`  ${e.key} (host env ${e.hostEnv}) -> ${JSON.stringify(e.rendersTo)}\n`);
      } else if (e.file && e.allowlistKeys !== undefined) {
        process.stdout.write(
          `  ${e.file}: api environment allowlist has ${e.allowlistKeys} keys; env_file=${e.hasEnvFile ? 'yes' : 'no'}\n`,
        );
      } else if (e.file) {
        process.stdout.write(`  ${e.file}: ${JSON.stringify({ ...e, file: undefined })}\n`);
      }
    }
    if (result.ok) {
      process.stdout.write(
        `compose-env-allowlist: OK — ${REQUIRED_API_ENV.map((s) => s.key).join(', ')} are carried into the api container by the base allowlist.\n`,
      );
    } else {
      process.stdout.write(`compose-env-allowlist: ${result.gaps.length} gap(s):\n`);
      for (const g of result.gaps) process.stdout.write(`  - ${g}\n`);
    }
    process.stdout.write(
      '  note: static assertion (no Docker in this environment). CI also renders the merged config with `docker compose config`.\n',
    );
  }

  if (check) process.exit(result.ok ? 0 : 1);
}
