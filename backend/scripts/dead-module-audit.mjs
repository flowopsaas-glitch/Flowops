#!/usr/bin/env node
/**
 * Ratchet for unreachable modules — FlowOps™
 *
 * WHY THIS EXISTS
 * ---------------
 * A file that no import can reach is not neutral. It compiles, it is linted,
 * it is read during code review, and it is edited by people who reasonably
 * assume it runs. In this repo it also produced real damage: a second
 * `Collections` screen (1,536 lines) existed beside the one `App.tsx` actually
 * lazy-loads, and four separate api modules existed beside the one with 108
 * importers. Someone adding a page to the wrong one would have changed nothing
 * and had no way to notice.
 *
 * This script walks the real import graph from the application entry point and
 * reports every source file the walk cannot touch. Like the body-any ratchet,
 * it freezes the present and makes it impossible to grow:
 *
 *   - a file may become reachable (that is a fix, and it is reported);
 *   - a NEW file may not be unreachable at all;
 *   - everything currently unreachable needs an exemption WITH A REASON.
 *
 * The reason is the point. An exemption is a decision, not a shrug, so it must
 * be a sentence a reviewer can argue with, and an exemption that stops matching
 * anything fails the run. That last rule runs both ways: if someone finally
 * wires up a module, its exemption becomes stale and must be removed, so the
 * list cannot quietly become a junk drawer.
 *
 * WHY REACHABILITY AND NOT "NO IMPORTERS"
 * ---------------------------------------
 * Reachability is transitive. A module imported only by another dead module is
 * still dead, and a per-file importer count misses that entirely. It also
 * means a barrel file that nothing imports does not launder its contents.
 *
 * TWO WAYS THIS SCANNER WAS WRONG, NOW PINNED IN TESTS
 * ----------------------------------------------------
 * 1. Aliases. `@/*` -> `src/*` lives in tsconfig/vite config. A first pass
 *    failed to parse it and silently treated all 89 `@/` imports as external
 *    packages, inflating the dead list by 24 files. The only symptom was a
 *    number that looked slightly high.
 * 2. Dotted filenames. `Path.with_suffix()` (and its JS equivalents) read
 *    `redis.module` as having the suffix `.module`, so asking for the `.ts`
 *    form yields `redis.ts`. Every dotted NestJS filename failed to resolve
 *    and `main.ts` appeared to reach 3 files instead of 521 — i.e. the
 *    scanner reported the entire backend as dead. Always append the
 *    extension; never replace a suffix.
 *
 * A KNOWN BLIND SPOT, STATED HONESTLY
 * -----------------------------------
 * Static analysis cannot follow a runtime `require(path.join(__dirname, '..',
 * 'dist', ...))`. There is exactly one in the tree (prisma/seed-rail-
 * reference.js) and it is declared explicitly below as an extra entry root, so
 * the scanner is right. A future one will be reported as dead and must be
 * either exempted with a reason or added here. The graph is evidence, not
 * proof: check before deleting.
 *
 * USAGE
 *   node scripts/dead-module-audit.mjs                 # report
 *   node scripts/dead-module-audit.mjs --check         # CI: fail on regressions
 *   node scripts/dead-module-audit.mjs --format json
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(HERE, '..');
export const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

const EXEMPTIONS_FILE = path.join(HERE, 'dead-module-exemptions.json');

const SOURCE_EXT = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs'];

/**
 * Projects, with the entry point each is reached from.
 *
 * `extraRoots` are files reached by means the graph cannot see (a runtime
 * require of a compiled path, an html script tag, a config-referenced setup
 * file). Each carries the reason it is a root, because an unexplained root is
 * how a ratchet acquires a hole.
 */
export const PROJECTS = [
  {
    id: 'backend',
    root: BACKEND_ROOT,
    srcDir: path.join(BACKEND_ROOT, 'src'),
    entry: ['src/main.ts'],
    alias: { '@': 'src' },
    testRe: /\.(test|spec)\.ts$/,
    extraRoots: [
      {
        file: 'src/rail/catalog/seed-rail-reference.ts',
        because:
          'required at runtime by prisma/seed-rail-reference.js via path.join(__dirname, "..", "dist", ...) — a static graph cannot see it',
      },
    ],
  },
  {
    id: 'frontend',
    root: path.join(REPO_ROOT, 'frontend'),
    srcDir: path.join(REPO_ROOT, 'frontend', 'src'),
    entry: ['src/main.tsx'],
    alias: { '@': 'src' },
    testRe: /\.(test|spec)\.(ts|tsx)$/,
    extraRoots: [
      {
        file: 'src/test/setup.ts',
        because: 'vitest setupFiles, referenced from vitest.config.ts',
      },
      {
        file: 'src/vite-env.d.ts',
        because: 'ambient type declarations pulled in by tsconfig include, never imported',
      },
    ],
  },
];

/** Minimum length of an exemption reason. Short enough to be writable, long enough to mean something. */
export const MIN_REASON = 40;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile() && SOURCE_EXT.includes(path.extname(name))) out.push(full);
  }
  return out;
}

// Matches: import x from '...' | export ... from '...' | import '...' | import('...') | require('...')
const STATIC_RE = /(?:^|[;\s])(?:import|export)\s+(?:type\s+)?(?:[\w*\s{},$]+?\s*from\s*)?['"]([^'"]+)['"]/gm;
const DYNAMIC_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const BARE_RE = /^\s*import\s+['"]([^'"]+)['"]/gm;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** @param {string} text */
export function specifiersOf(text) {
  const found = new Set();
  for (const re of [STATIC_RE, DYNAMIC_RE, BARE_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) found.add(m[1]);
  }
  return [...found];
}

/**
 * Resolve an import specifier to a file on disk.
 *
 * Extensions are APPENDED, never substituted: `redis.module` + `.ts` is
 * `redis.module.ts`, and any `replaceSuffix`-style helper turns it into
 * `redis.ts` and silently loses the file. See the header.
 */
export function resolveSpec(spec, fromFile, project) {
  let base;
  if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    const keys = Object.keys(project.alias).sort((a, b) => b.length - a.length);
    const hit = keys.find((k) => spec === k || spec.startsWith(k + '/'));
    if (!hit) return null; // external package — not our concern
    const rest = spec.slice(hit.length).replace(/^\//, '');
    base = path.resolve(project.root, project.alias[hit], rest);
  }
  const candidates = [base];
  for (const ext of SOURCE_EXT) candidates.push(base + ext);
  for (const idx of ['index.ts', 'index.tsx', 'index.js']) {
    candidates.push(path.join(base, idx));
  }
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** Build file -> Set(file) for one project. */
export function buildGraph(project) {
  const files = walk(project.srcDir).map((f) => path.resolve(f));
  const set = new Set(files);
  const graph = new Map();
  for (const f of files) graph.set(f, new Set());
  for (const f of files) {
    let text = '';
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const deps = graph.get(f);
    for (const spec of specifiersOf(text)) {
      const r = resolveSpec(spec, f, project);
      if (r && set.has(r)) deps.add(r);
    }
  }
  return { files, graph };
}

function reach(graph, roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const n = queue.pop();
    if (!n || seen.has(n) || !graph.has(n)) continue;
    seen.add(n);
    for (const d of graph.get(n)) if (!seen.has(d)) queue.push(d);
  }
  return seen;
}

/** @param {object} project */
export function scanProject(project) {
  const { files, graph } = buildGraph(project);
  const entryRoots = project.entry
    .map((e) => path.resolve(project.root, e))
    .filter((f) => existsSync(f));
  const extraRootFiles = project.extraRoots
    .map((e) => path.resolve(project.root, e.file))
    .filter((f) => existsSync(f));

  // Ambient declarations (*.d.ts) are included by tsconfig, never imported.
  // They are roots by nature — treating them as unreachable would flag every
  // type shim in the repo, including ones a live page depends on.
  const ambient = files.filter((f) => f.endsWith('.d.ts'));

  const prod = reach(graph, [...entryRoots, ...extraRootFiles, ...ambient]);

  const testFiles = files.filter((f) => project.testRe.test(f));
  const viaTests = reach(graph, testFiles);

  const rel = (f) => path.relative(project.root, f).split(path.sep).join('/');
  const missingEntries = project.entry.filter((e) => !existsSync(path.resolve(project.root, e)));

  const unreachable = files
    .filter((f) => !prod.has(f))
    .map((f) => ({
      file: rel(f),
      project: project.id,
      // reachable from a spec but not from the app: tested, never executed
      specOnly: viaTests.has(f) && !project.testRe.test(f),
      isTest: project.testRe.test(f),
    }));

  return {
    id: project.id,
    totalFiles: files.length,
    prodReachable: prod.size,
    unreachable,
    missingEntries,
    missingExtraRoots: project.extraRoots
      .filter((e) => !existsSync(path.resolve(project.root, e.file)))
      .map((e) => e.file),
  };
}

export function loadExemptions(file = EXEMPTIONS_FILE) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Compare a scan against the exemptions and report regressions.
 *
 * A file is DECIDED if it is prod-reachable, or exempt with a real reason.
 * Everything else is unresolved and fails. Exemptions that no longer match a
 * real unreachable file are stale and also fail — including the case where a
 * module finally got wired up, which is the good outcome and should be
 * celebrated by deleting the exemption.
 */
export function compare(scan, exemptions = loadExemptions()) {
  const unresolved = [];
  const exempted = [];
  const used = new Set();

  for (const entry of scan.unreachable) {
    if (entry.isTest) continue; // a spec is its own root; not "dead code"
    const key = `${scan.id}:${entry.file}`;
    const reason = exemptions[key];
    if (typeof reason === 'string' && reason.trim().length >= MIN_REASON) {
      exempted.push({ ...entry, reason });
      used.add(key);
    } else if (reason !== undefined) {
      unresolved.push({ ...entry, reason, problem: 'exemption reason too short to be a decision' });
    } else {
      unresolved.push({ ...entry, problem: 'unreachable from the entry point and not exempted' });
    }
  }

  const stale = Object.keys(exemptions)
    .filter((k) => k.startsWith(`${scan.id}:`))
    .filter((k) => !used.has(k))
    .map((k) => ({ key: k, reason: exemptions[k] }));

  return { unresolved, exempted, stale };
}

/** @param {object[]} scans */
export function totals(scans) {
  return scans.reduce(
    (acc, s) => ({
      files: acc.files + s.totalFiles,
      prodReachable: acc.prodReachable + s.prodReachable,
      unreachable: acc.unreachable + s.unreachable.filter((u) => !u.isTest).length,
    }),
    { files: 0, prodReachable: 0, unreachable: 0 },
  );
}

export function run({ exemptions } = {}) {
  const scans = PROJECTS.filter((p) => existsSync(p.srcDir)).map(scanProject);
  const ex = exemptions ?? loadExemptions();
  const results = scans.map((s) => ({ scan: s, ...compare(s, ex) }));
  return { scans, results, totals: totals(scans) };
}

export function formatReport(report) {
  const lines = [];
  lines.push('Dead-module audit — reachability from the application entry point');
  lines.push('='.repeat(72));
  for (const { scan, unresolved, exempted, stale } of report.results) {
    lines.push('');
    lines.push(`${scan.id}: ${scan.prodReachable}/${scan.totalFiles} files reachable from the entry point`);
    if (scan.missingEntries.length) {
      lines.push(`  !! entry point missing: ${scan.missingEntries.join(', ')}`);
    }
    if (scan.missingExtraRoots.length) {
      lines.push(`  !! declared extra root missing: ${scan.missingExtraRoots.join(', ')}`);
    }
    if (exempted.length) {
      lines.push(`  exempt with a written reason (${exempted.length}):`);
      for (const e of exempted.sort((a, b) => a.file.localeCompare(b.file))) {
        lines.push(`    ${e.specOnly ? 'spec-only' : 'orphan  '}  ${e.file}`);
        lines.push(`              ${e.reason}`);
      }
    }
    if (unresolved.length) {
      lines.push(`  UNRESOLVED (${unresolved.length}) — each needs wiring or an exemption:`);
      for (const u of unresolved.sort((a, b) => a.file.localeCompare(b.file))) {
        lines.push(`    ${u.specOnly ? 'spec-only' : 'orphan  '}  ${u.file}  [${u.problem}]`);
      }
    }
    if (stale.length) {
      lines.push(`  STALE EXEMPTIONS (${stale.length}) — matched nothing, delete them:`);
      for (const s of stale) lines.push(`    ${s.key}`);
    }
  }
  lines.push('');
  lines.push(
    `totals: ${report.totals.prodReachable} reachable, ${report.totals.unreachable} unreachable, of ${report.totals.files} files`,
  );
  return lines.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const report = run();
  const bad = report.results.some((r) => r.unresolved.length || r.stale.length);
  if (args.includes('--format json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }
  if (args.includes('--check') && bad) {
    console.error('\ndead-module audit FAILED: unresolved or stale entries above');
    process.exit(1);
  }
}
