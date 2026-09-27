#!/usr/bin/env node
/**
 * Re-emit a failing Jest run as GitHub Actions annotations.
 *
 * Why this exists: job logs and artifacts are served from blob storage that is
 * not reachable from every network this project is worked from, but check-run
 * annotations *are* reachable through the GitHub API. So when the integration
 * suite fails, its failure messages are turned into `::error::` annotations
 * (and, separately, the raw log is published to a scratch branch), which makes
 * the real failure readable without the log blob.
 *
 * Usage:
 *   node scripts/ci-annotate-failures.mjs [integration-report.json]
 *
 * Never throws: this is best-effort reporting, and the calling step still
 * exits with Jest's own exit code.
 */

import { readFileSync } from 'node:fs';

/**
 * GitHub truncates annotations beyond a small per-step limit; staying under it
 * keeps the messages that matter from being dropped.
 */
const MAX_ANNOTATIONS = 10;
const MAX_MESSAGE_CHARS = 1200;
const LINES_PER_MESSAGE = 5;

/** Escape the characters that would break a workflow command. */
function escapeData(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function condense(text) {
  const clipped = String(text ?? '')
    .trim()
    .split('\n')
    .slice(0, LINES_PER_MESSAGE)
    .join('\n');
  return clipped.length > MAX_MESSAGE_CHARS ? `${clipped.slice(0, MAX_MESSAGE_CHARS - 1)}…` : clipped;
}

function collectFailures(report) {
  const failures = [];
  const seen = new Set();

  const push = (where, detail) => {
    const message = condense(detail);
    if (!message) return;
    // One misconfiguration can fail every case with the same text; show it once.
    const key = message.slice(0, 400);
    if (seen.has(key)) return;
    seen.add(key);
    failures.push(`${where}\n${message}`);
  };

  for (const suite of report.testResults ?? []) {
    const assertions = suite.assertionResults ?? [];
    for (const assertion of assertions) {
      if (assertion.status !== 'failed') continue;
      push(
        assertion.fullName ?? assertion.title,
        (assertion.failureMessages ?? []).join('\n'),
      );
    }
    if (suite.status === 'failed' && !assertions.some((a) => a.status === 'failed')) {
      push(suite.name, suite.message ?? 'the suite failed to run');
    }
  }

  return failures;
}

const reportPath = process.argv[2] ?? 'integration-report.json';

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.log(
    `::error::The integration suite failed before writing ${reportPath} (${error.message}). ` +
      'The full output is on the ci/integration-log branch.',
  );
  process.exit(0);
}

const summary =
  `Integration suite: ${report.numFailedTests ?? '?'} of ${report.numTotalTests ?? '?'} tests failed, ` +
  `${report.numFailedTestSuites ?? '?'} of ${report.numTotalTestSuites ?? '?'} suites failed`;

const failures = collectFailures(report);
const shown = failures.slice(0, MAX_ANNOTATIONS - 1);

console.log(`::error::${escapeData(summary)}`);
for (const failure of shown) {
  console.log(`::error::${escapeData(failure)}`);
}

if (failures.length === 0) {
  console.log(
    `::error::${escapeData('Jest reported a failure without per-test messages. The full output is on the ci/integration-log branch.')}`,
  );
} else if (failures.length > shown.length) {
  console.log(
    `::notice::${escapeData(
      `${failures.length - shown.length} further distinct failure message(s) were omitted; ` +
        'the full output is on the ci/integration-log branch.',
    )}`,
  );
}
