import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { getHandshakeReport, listHandshakeReports } from '../api/railHandshakeApi';
// Type-only imports are erased, so they are safe alongside vi.hoisted.
import type {
  HandshakeReport,
  HandshakeDeviation,
  HandshakeReportStatus,
  DeviationCategory,
  ResponsibleParty,
} from '../api/railHandshakeApi';

// ── Fixtures (hoisted: vi.mock factories run before module-level consts) ──────
const h = vi.hoisted(() => {
  const deviation: HandshakeDeviation = {
    id: 'd1', reportId: 'r1', trainSlotRef: 'NS-0412', orderNumber: 'ORD-9', consignmentId: null,
    category: 'DELAY' as DeviationCategory, reason: 'Late release from yard', rootCause: null, location: 'Ermelo', occurredAt: '2026-10-01T06:30:00.000Z',
    delayMinutes: 90, responsibleParty: 'IM' as ResponsibleParty, slotImpact: 'DELAYED', costZar: 12500, costRecovered: false,
    status: 'LOGGED', escalationStage: 'NONE', disputeReason: null, resolutionNote: null, resolvedAt: null, escalatedAt: null,
    createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z',
  };
  const report: HandshakeReport = {
    id: 'r1', reportNumber: 'HS-2026-00042', status: 'PENDING_TOC' as HandshakeReportStatus, reportDate: '2026-10-01T00:00:00.000Z',
    windowStart: '2026-10-01T00:00:00.000Z', windowEnd: '2026-10-02T00:00:00.000Z', railOperator: 'TRIM', corridor: 'Ore',
    signedOffAt: null, signedOffBy: null, imReference: 'TOL-7781', notes: null,
    createdAt: '2026-10-02T08:00:00.000Z', updatedAt: '2026-10-02T08:00:00.000Z', deviations: [deviation], openItems: 0,
  };
  return {
    report,
    auth: { user: { role: 'MANAGER', email: 'mia@toc.co.za', name: 'Mia Manager' } as Record<string, unknown> },
    downloadTextFile: vi.fn(),
    printHtmlDocument: vi.fn(),
  };
});

vi.mock('../lib/railHandshakeExport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/railHandshakeExport')>()),
  downloadTextFile: h.downloadTextFile,
  printHtmlDocument: h.printHtmlDocument,
}));
// The real modal is tested in rail/ChangeRequestModal.test.tsx; here we only check how the page opens it.
vi.mock('./rail/ChangeRequestModal', () => ({
  default: ({ context, trainSlotRefSuggestions, onClose, onCreated }: { context: unknown; trainSlotRefSuggestions?: string[]; onClose: () => void; onCreated: (r: unknown) => void }) => (
    <div role="dialog" aria-label="change-modal-stub">
      <pre data-testid="change-context">{JSON.stringify({ context, trainSlotRefSuggestions })}</pre>
      <button onClick={() => onCreated({})}>stub-created</button>
      <button onClick={onClose}>stub-close</button>
    </div>
  ),
}));
vi.mock('../contexts/auth-context', () => ({ useAuth: () => h.auth }));
vi.mock('../components/toast-context', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../api/railHandshakeApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/railHandshakeApi')>()),
  getHandshakeOverview: vi.fn().mockResolvedValue({
    totalReports: 1, openItems: 0, disputes: 0, atRegulator: 0, recoverableExposureZar: 0, byResponsibleParty: [],
  }),
  listHandshakeReports: vi.fn().mockResolvedValue([h.report]),
  getHandshakeReport: vi.fn().mockImplementation(async () => h.report),
}));

import RailHandshake from './RailHandshake';

async function openReport(role: string, status: HandshakeReportStatus = 'PENDING_TOC') {
  h.auth.user = { role, email: 'u@toc.co.za', name: 'Test User' };
  h.report.status = status;
  render(<RailHandshake />);
  fireEvent.click(await screen.findByText('HS-2026-00042'));
  await screen.findByRole('button', { name: /Export CSV/i }); // the drawer is open
}
const has = (name: RegExp) => screen.queryByRole('button', { name }) !== null;

beforeEach(() => {
  h.downloadTextFile.mockClear();
  h.printHtmlDocument.mockClear();
});

describe('RailHandshake — ReportDrawer evidence export', () => {
  it('Export CSV downloads a dated, named CSV of the report', async () => {
    await openReport('MANAGER');
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));

    expect(h.downloadTextFile).toHaveBeenCalledTimes(1);
    const [filename, text] = h.downloadTextFile.mock.calls[0];
    expect(filename).toMatch(/^HS-2026-00042-handshake-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('HS-2026-00042');
    expect(text).toContain('NS-0412');
    expect(text).toContain('Late release from yard');
  });

  it('Print / PDF dossier hands a complete HTML dossier to the printer', async () => {
    await openReport('MANAGER');
    fireEvent.click(screen.getByRole('button', { name: /Print \/ PDF dossier/i }));

    expect(h.printHtmlDocument).toHaveBeenCalledTimes(1);
    const html = h.printHtmlDocument.mock.calls[0][0] as string;
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Evidence Dossier');
    expect(html).toContain('HS-2026-00042');
    expect(html).toContain('NS-0412');
    expect(html).toContain('Generated by FlowOps');
    expect(html).toContain('for Test User'); // generatedBy = the signed-in user's name
  });

  it('exports are offered to a read-only VIEWER too (they change nothing)', async () => {
    await openReport('VIEWER');
    expect(has(/Export CSV/i)).toBe(true);
    expect(has(/Print \/ PDF dossier/i)).toBe(true);
  });
});

describe('RailHandshake — role gating of mutating controls', () => {
  it('MANAGER (authorised signatory) gets the full set on a pending report', async () => {
    await openReport('MANAGER');
    expect(has(/New daily report/i)).toBe(true);
    expect(has(/Log deviation/i)).toBe(true);
    expect(has(/Run escalation ladder/i)).toBe(true);
    expect(has(/Sign off/i)).toBe(true);
    expect(has(/^Agree$/i)).toBe(true);
    expect(has(/Flag OPEN/i)).toBe(true);
  });

  it('VIEWER is strictly read-only: no create, log, review, escalate or sign controls', async () => {
    await openReport('VIEWER');
    for (const name of [/New daily report/i, /Log deviation/i, /Run escalation ladder/i, /Sign off/i, /^Agree$/i, /Flag OPEN/i, /Issue for review/i]) {
      expect(has(name)).toBe(false);
    }
  });

  it('DISPATCH can work the report but is not a signatory: no sign-off', async () => {
    await openReport('DISPATCH');
    expect(has(/Log deviation/i)).toBe(true);
    expect(has(/^Agree$/i)).toBe(true);
    expect(has(/Sign off/i)).toBe(false);
  });

  it('a DRAFT report offers "Issue for review" to writers only', async () => {
    await openReport('DISPATCH', 'DRAFT');
    expect(has(/Issue for review/i)).toBe(true);
  });

  it('the Regulator-dispute and resolve controls are signatory-only', async () => {
    h.report.deviations = [{ ...h.report.deviations[0], status: 'OPEN', escalationStage: 'ROUTE_LOGISTICS_FORUM' } as never];
    try {
      await openReport('DISPATCH', 'SIGNED_OFF');
      expect(has(/Resolve/i)).toBe(false);
      expect(has(/Lodge dispute/i)).toBe(false);
    } finally {
      h.report.deviations = [h.report.deviations[0]];
    }
  });

  it('the dossier is built from what the drawer shows (a smoke check that opening does not throw)', async () => {
    await openReport('MANAGER');
    await waitFor(() => expect(screen.getByText('NS-0412')).toBeTruthy());
  });
});

describe('RailHandshake — Cancel / reschedule (Annexure 20a · 20b) from a report', () => {
  const CANCEL = /Cancel \/ reschedule \(20a · 20b\)/;

  it.each<[string, HandshakeReportStatus]>([['MANAGER', 'PENDING_TOC'], ['MANAGER', 'DRAFT'], ['DISPATCH', 'PENDING_TOC'], ['DISPATCH', 'DRAFT']])('%s sees it on a %s report', async (role, status) => {
    await openReport(role, status);
    expect(has(CANCEL)).toBe(true);
  });

  it('a read-only VIEWER never sees it', async () => {
    await openReport('VIEWER', 'PENDING_TOC');
    expect(has(CANCEL)).toBe(false);
  });

  it.each<HandshakeReportStatus>(['SIGNED_OFF', 'DISPUTED'])('it is not offered once the report is %s — a signed report takes no new deviations, even from a signatory', async (status) => {
    await openReport('MANAGER', status);
    expect(has(CANCEL)).toBe(false);
  });

  it('opens the modal for THIS report (so the request is also logged here as a deviation), offering the report\'s trains', async () => {
    await openReport('MANAGER');
    expect(screen.queryByRole('dialog', { name: 'change-modal-stub' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: CANCEL }));
    const ctx = JSON.parse(screen.getByTestId('change-context').textContent!);
    expect(ctx).toEqual({ context: { handshakeReportId: 'r1' }, trainSlotRefSuggestions: ['NS-0412'] });
  });

  it('closing the modal leaves the report untouched; creating a request closes it and re-reads the report', async () => {
    await openReport('MANAGER');
    fireEvent.click(screen.getByRole('button', { name: CANCEL }));
    fireEvent.click(screen.getByRole('button', { name: 'stub-close' }));
    expect(screen.queryByRole('dialog', { name: 'change-modal-stub' })).toBeNull();
    const reads = vi.mocked(getHandshakeReport).mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: CANCEL }));
    fireEvent.click(screen.getByRole('button', { name: 'stub-created' }));
    expect(screen.queryByRole('dialog', { name: 'change-modal-stub' })).toBeNull();
    await waitFor(() => expect(vi.mocked(getHandshakeReport).mock.calls.length).toBeGreaterThan(reads)); // the new deviation shows up
  });
});

describe('the daily reports list', () => {
  beforeEach(() => {
    vi.mocked(listHandshakeReports).mockResolvedValue([h.report]);
  });

  it('surfaces a failed load instead of claiming there are no reports', async () => {
    vi.mocked(listHandshakeReports).mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    h.auth.user = { role: 'MANAGER', email: 'u@toc.co.za', name: 'Test User' };
    render(<RailHandshake />);

    // The previous implementation swallowed the failure with
    // .catch(() => []), rendering the empty state. For an operator mid-dispute
    // that is the worst possible message: it invites them to create a second
    // report for an operating day that already has one.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByText(/No handshake reports yet/i)).toBeNull();
    expect(screen.getByText(/technical details/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('offers to create the first report only when the list is genuinely empty', async () => {
    vi.mocked(listHandshakeReports).mockResolvedValueOnce([]);
    h.auth.user = { role: 'MANAGER', email: 'u@toc.co.za', name: 'Test User' };
    render(<RailHandshake />);

    await waitFor(() => expect(screen.getByText(/No handshake reports yet/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /create daily report/i })).toBeTruthy();
  });

  it('makes a report row reachable and operable from the keyboard', async () => {
    h.auth.user = { role: 'MANAGER', email: 'u@toc.co.za', name: 'Test User' };
    render(<RailHandshake />);

    // The row used to be a <tr onClick>, reachable by mouse only.
    const row = await screen.findByRole('row', { name: /HS-2026-00042/ });
    expect(row.getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(row, { key: 'Enter' });
    await waitFor(() => expect(getHandshakeReport).toHaveBeenCalledWith('r1'));
  });

  it('sorts the operating day chronologically, not by its formatted string', async () => {
    vi.mocked(listHandshakeReports).mockResolvedValueOnce([
      { ...h.report, id: 'r2', reportNumber: 'HS-2026-00009', reportDate: '2026-09-30T00:00:00.000Z' },
      { ...h.report, id: 'r1', reportNumber: 'HS-2026-00042', reportDate: '2026-10-01T00:00:00.000Z' },
    ]);
    h.auth.user = { role: 'MANAGER', email: 'u@toc.co.za', name: 'Test User' };
    render(<RailHandshake />);

    await screen.findByText('HS-2026-00042');
    fireEvent.click(screen.getByText('Operating day'));

    const numbers = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    // 30 Sep precedes 1 Oct even though "…00009" sorts after "…00042">
    expect(numbers[0]).toContain('HS-2026-00009');
  });
});
