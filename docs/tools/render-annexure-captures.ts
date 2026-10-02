/**
 * Regenerates the annexure captures in the two Rail documents from the typed catalogs.
 *
 *   cd backend && npx ts-node -P tsconfig.json --transpile-only ../docs/tools/render-annexure-captures.ts
 *
 * Writes between the BEGIN/END markers in:
 *   docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md   (§13, full tables)
 *   docs/RAIL-RASA-AUDIT-2026-10-02.md                              (Appendix A, code index)
 * Idempotent. backend/src/rail/rail-docs-sync.spec.ts fails if either file drifts from the catalogs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MARKERS, renderCodeIndex, renderFullCapture, replaceBetweenMarkers } from '../../backend/test/support/render-annexure-markdown';

const docs = join(__dirname, '..');
const targets: Array<[string, typeof MARKERS.full, string]> = [
  [join(docs, 'RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md'), MARKERS.full, renderFullCapture()],
  [join(docs, 'RAIL-RASA-AUDIT-2026-10-02.md'), MARKERS.index, renderCodeIndex()],
];
for (const [file, markers, block] of targets) {
  const before = readFileSync(file, 'utf8');
  const after = replaceBetweenMarkers(before, markers, block);
  if (after !== before) writeFileSync(file, after);
  console.log(`${after === before ? 'unchanged' : 'updated  '} ${file}`);
}
