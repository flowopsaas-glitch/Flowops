import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { audit } from './state-transition-audit.mjs';

/**
 * Guards over the state-transition audit.
 *
 * A claim settled twice raises two credit notes: the client is paid twice for
 * one agreed payout. That bug is invisible in review because the code reads
 * correct — it reads the status, refuses the illegal cases, and writes. It is
 * only wrong when two callers overlap, which is exactly the shape no test
 * catches by accident and no reviewer sees in a diff.
 *
 * So the module that money moves through is held at zero, and the rest of the
 * codebase is held to a number that may fall but never rise.
 */

const BASELINE = join(process.cwd(), 'scripts', 'state-transition-baseline.json');

/**
 * Modules held at ZERO.
 *
 * These are done: every status write in them is a compare-and-set. Adding one
 * to this list is a claim that the module is finished, so it should only ever
 * grow after the work is actually done — never to make a failure go away.
 */
const MUST_BE_CLEAN = ['claims', 'accounting'];

const findings = audit();
const countFor = (module) => findings.filter((f) => f.module === module).length;
const here = (f) => `${f.file}:${f.line}`;

test('NO ROT — modules that transition atomically stay atomic', () => {
  const regressed = MUST_BE_CLEAN.filter((m) => countFor(m) > 0);
  assert.deepEqual(
    regressed,
    [],
    regressed.length
      ? `these modules claim every status write, but no longer do:\n` +
          regressed
            .map((m) => `  ${m}\n` + findings.filter((f) => f.module === m).map((f) => `    ${here(f)}`).join('\n'))
            .join('\n') +
          `\n\nMake the expectation part of the write — see src/common/state-transition.ts.\n` +
          `Removing a module from MUST_BE_CLEAN to silence this is undoing the fix, not fixing it.`
      : '',
  );
});

test('RATCHET — the number of unguarded status writes never rises', () => {
  if (!existsSync(BASELINE)) {
    assert.fail(
      `No baseline at ${BASELINE}.\n` +
        `Record the honest current count with:\n` +
        `  node scripts/state-transition-audit.test.mjs --update-baseline\n` +
        `Only do that after the count went DOWN.`,
    );
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  assert.ok(
    findings.length <= baseline.total,
    `unguarded status writes rose from ${baseline.total} to ${findings.length}.\n` +
      `New ones:\n` +
      findings
        .filter((f) => !baseline.files.includes(here(f)))
        .map((f) => `  ${here(f)}`)
        .join('\n') +
      `\n\nA status write should be a compare-and-set: constrain the WHERE to the\n` +
      `status the caller believes the row holds. See src/common/state-transition.ts.`,
  );
});

test('the audit still finds the bug it exists to find', () => {
  // A scanner that matches nothing is worse than no scanner: it reports the
  // codebase as clean while looking at nothing. Two independent checks that
  // the detector itself works.
  assert.ok(findings.length > 0, 'the audit found nothing at all — has the source tree moved?');
  const shapes = findings.filter((f) => /\.update\(/.test(readFileSync(f.file, 'utf8').split('\n')[f.line - 1] ?? ''));
  assert.ok(shapes.length > 0, 'no finding points at a real .update( call — the line numbers may be wrong');
});

// Re-record the baseline: node scripts/state-transition-audit.test.mjs --update-baseline
// Only after the count genuinely fell. Recording a higher number lets rot through.
if (process.argv.includes('--update-baseline')) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _why:
          'Status writes that still read-then-write instead of compare-and-set. ' +
          'NO ROT holds the listed modules at zero; RATCHET holds the total to ' +
          'this number or lower. A hit is a place for a human to look, not a ' +
          'proven bug — some are guarded by an enclosing row lock. Re-record ' +
          'only after the count fell, and say how in the commit.',
        recorded: new Date().toISOString().slice(0, 10),
        total: findings.length,
        cleanModules: MUST_BE_CLEAN,
        files: findings.map(here),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`baseline recorded: ${findings.length} unguarded status writes`);
}
