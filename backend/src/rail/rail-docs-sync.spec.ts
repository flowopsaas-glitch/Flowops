/**
 * The two Rail documents carry generated copies of the annexure catalogs. This fails if either document
 * drifts from backend/src/rail/catalog/*.ts — fix by running
 *   cd backend && npx ts-node -P tsconfig.json --transpile-only ../docs/tools/render-annexure-captures.ts
 *
 * It proves document ↔ code agreement only. Agreement with the ORIGINAL annexures cannot be proven from
 * here (the source register says so, §13) — that remains the independent reviewer's job.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MARKERS, extractBetweenMarkers, renderCodeIndex, renderFullCapture,
} from '../../test/support/render-annexure-markdown';
import { ANCILLARY_SERVICE_CATALOG } from './catalog/ancillary-services.catalog';
import { CANCELLATION_CODE_CATALOG } from './catalog/cancellation-codes.catalog';

const docs = join(__dirname, '..', '..', '..', 'docs');
const normalizeNewlines = (text: string) => text.replace(/\r\n/g, '\n');
const register = normalizeNewlines(readFileSync(join(docs, 'RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md'), 'utf8'));
const audit = normalizeNewlines(readFileSync(join(docs, 'RAIL-RASA-AUDIT-2026-10-02.md'), 'utf8'));

describe('rail documents stay in sync with the typed catalogs', () => {
  it('source register §13 equals the generated full capture', () => {
    expect(extractBetweenMarkers(register, MARKERS.full)).toBe(renderFullCapture());
  });
  it('audit Appendix A equals the generated code index', () => {
    expect(extractBetweenMarkers(audit, MARKERS.index)).toBe(renderCodeIndex());
  });
  it('every Annexure 20b code and every Annexure 40 code appears in BOTH documents', () => {
    for (const c of CANCELLATION_CODE_CATALOG) {
      expect(register).toContain(`| ${c.code} |`);
      expect(audit).toContain(`| ${c.code} |`);
    }
    for (const l of ANCILLARY_SERVICE_CATALOG) {
      expect(register).toContain(`| ${l.code} |`);
      expect(audit).toContain(`| ${l.code} |`);
    }
  });
  it('the documents state the headline counts the catalogs have', () => {
    expect(register).toContain(`${CANCELLATION_CODE_CATALOG.length} rows, in source order`);
    expect(register).toContain(`flattened to ${ANCILLARY_SERVICE_CATALOG.length} priced lines`);
  });
  it('neither document carries the withheld personal data (roles only) or the internal server path', () => {
    for (const doc of [register, audit]) {
      expect(doc).not.toMatch(/Process_Management|Process_Repository|\\\\A00/);
    }
  });
});
