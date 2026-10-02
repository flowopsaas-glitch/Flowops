import { describe, it, expect } from 'vitest';
import type { HandshakeDeviation, HandshakeReport } from '../api/railHandshakeApi';
import {
  HANDSHAKE_CSV_COLUMNS,
  buildHandshakeCsv,
  buildHandshakeDossierHtml,
  csvCell,
  escapeHtml,
  handshakeCsvFilename,
  neutraliseSpreadsheetFormula,
  summariseHandshake,
} from './railHandshakeExport';

const dev = (over: Partial<HandshakeDeviation> = {}): HandshakeDeviation => ({
  id: 'd1', reportId: 'r1', trainSlotRef: 'NS-0412', orderNumber: 'ORD-9', consignmentId: null,
  category: 'DELAY', reason: 'Late release from yard', rootCause: null, location: 'Ermelo', occurredAt: '2026-10-01T06:30:00.000Z',
  delayMinutes: 90, responsibleParty: 'IM', slotImpact: 'DELAYED', costZar: 12500, costRecovered: false,
  status: 'OPEN', escalationStage: 'HEAD_LIAISON_48H', disputeReason: 'IM released the path late', resolutionNote: null,
  resolvedAt: null, escalatedAt: null, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', ...over,
});

const report = (over: Partial<HandshakeReport> = {}): HandshakeReport => ({
  id: 'r1', reportNumber: 'HS-2026-00042', status: 'SIGNED_OFF', reportDate: '2026-10-01T00:00:00.000Z',
  windowStart: '2026-10-01T00:00:00.000Z', windowEnd: '2026-10-02T00:00:00.000Z', railOperator: 'TRIM', corridor: 'Ore',
  signedOffAt: '2026-10-02T09:15:00.000Z',
  signedOffBy: 'Mia M. [verified: Mia Manager <mia@toc.co.za> (MANAGER)]',
  imReference: 'TOL-7781', notes: null, createdAt: '2026-10-02T08:00:00.000Z', updatedAt: '2026-10-02T08:00:00.000Z',
  deviations: [dev()], ...over,
});

/** Minimal RFC-4180 parser, so the tests check the CSV as a spreadsheet would read it. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r' && src[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

describe('csvCell / formula injection', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tTAB', '\rCR'])('defuses a cell that starts a formula: %j', (text) => {
    expect(neutraliseSpreadsheetFormula(text)).toBe(`'${text}`);
    expect(csvCell(text).replace(/^"|"$/g, '').startsWith("'")).toBe(true);
  });

  it('leaves ordinary text and mid-string symbols alone', () => {
    expect(csvCell('Late release')).toBe('Late release');
    expect(csvCell('a=b+c')).toBe('a=b+c');
    expect(csvCell('Ermelo - Richards Bay')).toBe('Ermelo - Richards Bay');
  });

  it('quotes cells with commas, quotes and line breaks, doubling embedded quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('writes numbers as numbers (a negative number is not a formula) and booleans as Yes/No', () => {
    expect(csvCell(-90)).toBe('-90');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(NaN)).toBe('');
    expect(csvCell(true)).toBe('Yes');
    expect(csvCell(false)).toBe('No');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('buildHandshakeCsv', () => {
  it('starts with a UTF-8 BOM, uses CRLF, and has one header + one row per deviation', () => {
    const csv = buildHandshakeCsv(report({ deviations: [dev({ id: 'a' }), dev({ id: 'b', trainSlotRef: 'NS-0500' })] }));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith('\r\n')).toBe(true);
    const rows = parseCsv(csv).filter((r) => r.length > 1);
    expect(rows).toHaveLength(3);
  });

  it('every row has exactly as many cells as there are columns', () => {
    const rows = parseCsv(buildHandshakeCsv(report({ deviations: [dev(), dev({ reason: 'a, "tricky"\nvalue' })] })));
    for (const r of rows.filter((x) => x.length > 1)) expect(r).toHaveLength(HANDSHAKE_CSV_COLUMNS.length);
  });

  it('carries the report-level columns on every row, including the verified signatory', () => {
    const [header, row] = parseCsv(buildHandshakeCsv(report()));
    const at = (label: string) => row[header.indexOf(label)];
    expect(at('Report No')).toBe('HS-2026-00042');
    expect(at('Report Status')).toBe('SIGNED_OFF');
    expect(at('Operating Day')).toBe('2026-10-01');
    expect(at('Corridor')).toBe('Ore');
    expect(at('IM Reference (TOL)')).toBe('TOL-7781');
    expect(at('Signed Off By (verified)')).toBe('Mia M. [verified: Mia Manager <mia@toc.co.za> (MANAGER)]');
    expect(at('Signed Off At (UTC)')).toBe('2026-10-02T09:15:00.000Z');
  });

  it('writes human labels for category, party and escalation stage, and raw numbers for delay and cost', () => {
    const [header, row] = parseCsv(buildHandshakeCsv(report()));
    const at = (label: string) => row[header.indexOf(label)];
    expect(at('Category')).toBe('Delay');
    expect(at('Responsible Party')).toBe('Infrastructure Manager');
    expect(at('Escalation Stage')).toBe('48h · IM Head of Liaison');
    expect(at('Delay (min)')).toBe('90');
    expect(at('Cost (ZAR)')).toBe('12500');
    expect(at('Cost Recovered')).toBe('No');
    expect(at('Dispute Reason')).toBe('IM released the path late');
  });

  it('a report with no deviations still exports a header and a report-level row', () => {
    const rows = parseCsv(buildHandshakeCsv(report({ deviations: [] }))).filter((r) => r.length > 1);
    expect(rows).toHaveLength(2);
    const [header, row] = rows;
    expect(row[header.indexOf('Report No')]).toBe('HS-2026-00042');
    expect(row[header.indexOf('Train/Slot Ref')]).toBe('');
  });

  it('defuses formulas that a user typed into a deviation, and they survive a round trip as text', () => {
    const csv = buildHandshakeCsv(report({
      deviations: [dev({ reason: '=HYPERLINK("http://evil","click")', rootCause: '+1+1', location: '@SUM(A1:A9)', trainSlotRef: '-cmd' })],
    }));
    const [header, row] = parseCsv(csv);
    for (const label of ['Reason', 'Root Cause', 'Location', 'Train/Slot Ref']) {
      expect(row[header.indexOf(label)].startsWith("'")).toBe(true);
    }
    expect(row[header.indexOf('Reason')]).toBe(`'=HYPERLINK("http://evil","click")`);
  });

  it('defuses a formula typed into the signatory field too', () => {
    const [header, row] = parseCsv(buildHandshakeCsv(report({ signedOffBy: '=cmd|calc' })));
    expect(row[header.indexOf('Signed Off By (verified)')]).toBe("'=cmd|calc");
  });
});

describe('handshakeCsvFilename', () => {
  it('is dated and made of safe characters only', () => {
    expect(handshakeCsvFilename(report(), new Date('2026-10-02T10:00:00Z'))).toBe('HS-2026-00042-handshake-2026-10-02.csv');
    expect(handshakeCsvFilename(report({ reportNumber: '../../etc/passwd' }), new Date('2026-10-02T10:00:00Z')))
      .toBe('etc_passwd-handshake-2026-10-02.csv');
    expect(handshakeCsvFilename(report({ reportNumber: '' }), new Date('2026-10-02T10:00:00Z'))).toBe('report-handshake-2026-10-02.csv');
  });
});

describe('summariseHandshake', () => {
  it('rolls up counts, delay, cost and the recoverable exposure', () => {
    const s = summariseHandshake(report({
      deviations: [
        dev({ id: '1', status: 'OPEN', delayMinutes: 90, costZar: 1000, responsibleParty: 'IM', costRecovered: false }), // recoverable
        dev({ id: '2', status: 'AGREED', delayMinutes: 30, costZar: 500, responsibleParty: 'IM', costRecovered: true }), // already recovered
        dev({ id: '3', status: 'AGREED', delayMinutes: null, costZar: null, responsibleParty: 'THIS_TOC' }), // ours
        dev({ id: '4', status: 'OPEN', delayMinutes: 10, costZar: 200, responsibleParty: 'EXTERNAL', costRecovered: false }), // recoverable
      ],
    }));
    expect(s).toEqual({
      total: 4, byStatus: { OPEN: 2, AGREED: 2 }, totalDelayMinutes: 130, totalCostZar: 1700, recoverableZar: 1200,
    });
  });
});

describe('buildHandshakeDossierHtml', () => {
  const html = (r = report()) => buildHandshakeDossierHtml(r, { generatedAt: new Date('2026-10-02T10:00:00Z'), generatedBy: 'Mia Manager' });

  it('is a complete, print-ready document', () => {
    const out = html();
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('@page { size: A4');
    expect(out).toContain('Evidence Dossier');
    expect(out).toContain('Annexure 28');
  });

  it('shows the report, the verified signatory and every deviation field', () => {
    const out = html();
    expect(out).toContain('HS-2026-00042');
    expect(out).toContain('TOL-7781');
    expect(out).toContain('Mia M. [verified: Mia Manager &lt;mia@toc.co.za&gt; (MANAGER)]');
    expect(out).toContain('NS-0412');
    expect(out).toContain('Order ORD-9');
    expect(out).toContain('Late release from yard');
    expect(out).toContain('Infrastructure Manager');
    expect(out).toContain('48h · IM Head of Liaison');
    expect(out).toContain('IM released the path late');
    expect(out).toContain('90 min');
    expect(out).toContain('R12');
  });

  it('shows the summary roll-up and a generation stamp', () => {
    const out = html();
    expect(out).toContain('Recoverable');
    expect(out).toContain('Generated by FlowOps on 2026-10-02T10:00:00.000Z for Mia Manager');
  });

  it('says so when nothing has been signed or logged', () => {
    const out = html(report({ signedOffBy: null, signedOffAt: null, deviations: [] }));
    expect(out).toContain('Not yet signed off');
    expect(out).toContain('No deviations were logged');
  });

  it('HTML-escapes everything a user can type, so the dossier cannot carry script', () => {
    const out = html(report({
      corridor: '<img src=x onerror=alert(1)>',
      notes: '</td><script>alert("n")</script>',
      signedOffBy: '"><script>alert(1)</script>',
      deviations: [dev({ trainSlotRef: '<b>x</b>', reason: '<script>alert(1)</script>', rootCause: "'; DROP TABLE x;--", disputeReason: '<svg onload=alert(1)>' })],
    }));
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain('<img src=x');
    expect(out).not.toContain('<svg onload');
    expect(out).not.toContain('<b>x</b>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('&#39;; DROP TABLE x;--');
  });
});

describe('escapeHtml', () => {
  it('escapes the five dangerous characters and tolerates null / undefined', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});
