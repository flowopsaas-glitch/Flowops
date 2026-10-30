/** Emit observed Jest counts into GitHub annotations, including the WP2 suite. */
import { readFileSync } from 'node:fs';

const [file, label] = process.argv.slice(2);
try {
  if (!file || !['unit', 'integration'].includes(label)) throw new Error('expected a report and unit/integration label');
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const fields = ['numPassedTests', 'numFailedTests', 'numPendingTests', 'numTotalTests', 'numPassedTestSuites', 'numTotalTestSuites'];
  if (!fields.every((key) => Number.isInteger(report[key]))) throw new Error('missing Jest count');
  console.log(`::notice::${label}: ${report.numPassedTests} passed, ${report.numFailedTests} failed, ${report.numPendingTests} pending, ${report.numTotalTests} total; suites ${report.numPassedTestSuites}/${report.numTotalTestSuites} passed`);
  if (label === 'integration') {
    const suite = report.testResults?.find((result) => result.name.endsWith('/truck-window-change.integration.spec.ts'));
    if (!suite || !Array.isArray(suite.assertionResults)) throw new Error('WP2 integration suite missing from Jest report');
    const tests = suite.assertionResults;
    const count = (status) => tests.filter((test) => test.status === status).length;
    console.log(`::notice::WP2 truck-window integration: ${count('passed')} passed, ${count('failed')} failed, ${count('pending') + count('todo')} pending, ${tests.length} total`);
  }
} catch (err) {
  console.error(`Could not publish ${label ?? 'Jest'} test counts: ${err.message}`);
  process.exitCode = 1;
}
