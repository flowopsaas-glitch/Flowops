/**
 * Tests that every shell script that is meant to be run, can be.
 *
 * Run with: npm run release:safety:test
 *
 * WHY THIS EXISTS
 * ---------------
 * A shell script committed without the executable bit is a script that fails
 * with `Permission denied` the first time anyone follows the runbook — and
 * only the first time, because after that everyone runs it their own way and
 * nobody notices the documented invocation is broken.
 *
 * That is exactly what happened on 2026-11-14. `deploy/vps-deploy.sh` ran the
 * #529–#543 deploy, and the backup step immediately before it failed with:
 *
 *     -bash: ./deploy/backup-to-r2.sh: Permission denied
 *
 * The script is mode 100644 in the index while carrying `#!/usr/bin/env bash`
 * on its first line. Because the two commands were run together, a deploy
 * against a live database proceeded with **no backup taken**. It succeeded, so
 * nothing was lost — but the safety net was absent for the one run that
 * mattered, and nothing in the pipeline said so.
 *
 * Twelve scripts were affected. The two that make this more than cosmetics:
 *
 *   - `deploy/backup-to-r2.sh` — the off-box backup;
 *   - `deploy/restore-verify.sh` — the restore path. A backup whose restore
 *     script cannot be executed is the same trap as having no backup, and it
 *     is discovered at the worst possible moment.
 *
 * THE PREDICATE
 * -------------
 * The test is deliberately not "every .sh is executable". Some shell files are
 * meant to be sourced, and marking those executable is noise. The rule is the
 * one a human would apply: **a file that declares an interpreter on its first
 * line is asking to be run**, so it must be executable. `#!/usr/bin/env bash`
 * and `#!/bin/bash` both count; a file with no shebang is left alone.
 *
 * Modes are read from the git index (`git ls-files -s`) rather than the
 * filesystem, because the index is what propagates to a fresh clone — a file
 * that is executable locally but 100644 in the index still arrives broken on
 * the next box.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

const EXECUTABLE = '100755';

/**
 * Tracked `*.sh` files with their git index mode.
 *
 * The index, not the filesystem: the mode in the index is what a fresh clone
 * gets, and that is the mode that has to be right.
 */
function trackedShellScripts() {
  const out = execFileSync('git', ['ls-files', '-s', '--', '*.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split('\t');
      return { mode: meta.split(' ')[0], path };
    });
}

/** True when the file declares an interpreter, i.e. is asking to be run. */
function asksToBeRun(relPath) {
  try {
    return readFileSync(resolve(REPO_ROOT, relPath), 'utf8').slice(0, 2) === '#!';
  } catch {
    // A tracked file that cannot be read is not this test's problem; the
    // mode test below would only produce a confusing failure for it.
    return false;
  }
}

test('every shell script with a shebang is executable in the index', () => {
  const offenders = trackedShellScripts()
    .filter((f) => f.mode !== EXECUTABLE && asksToBeRun(f.path))
    .map((f) => `  ${f.path} (mode ${f.mode}, expected ${EXECUTABLE})`);

  assert.equal(
    offenders.length,
    0,
    `Shell scripts declare an interpreter but are not executable, so ` +
      `"./script.sh" fails with Permission denied:\n${offenders.join('\n')}\n` +
      `Fix with: chmod +x <path>  (and stage it — the mode lives in the index).`,
  );
});

test('the glob actually matched something', () => {
  // Guards against the test silently passing because `git ls-files` returned
  // nothing — e.g. a pathspec change, or running outside a checkout. A ratchet
  // that cannot fail is worse than no ratchet, because it reads as protection.
  const scripts = trackedShellScripts();
  assert.ok(
    scripts.length > 0,
    'git ls-files found no *.sh files — the executable-bit check is vacuous.',
  );
  assert.ok(
    scripts.some((f) => f.mode === EXECUTABLE && asksToBeRun(f.path)),
    'Found no executable shell scripts — the check above could pass on an ' +
      'empty or mis-scoped result.',
  );
});
