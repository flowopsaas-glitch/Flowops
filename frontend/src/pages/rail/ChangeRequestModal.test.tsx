import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => {
  const code = (n: number, reason: string, responsibleParty: string, possibleParties: string[] = []) => ({
    code: `CNX-${String(n).padStart(3, '0')}`, sourceRow: n, reason, responsibleParty, possibleParties, sourceText: `Source text of row ${n}`, fromCatalog: false,
  });
  const codes = [
    code(1, 'Crew not available', 'RAIL_OPERATIONS'),
    code(2, 'Track defect', 'INFRASTRUCTURE_MANAGER'),
    code(3, 'Flood', 'FORCE_MAJEURE'),
    code(4, 'Derailment ahead', 'ALLOCATION_REQUIRED', ['RAIL_OPERATIONS', 'INFRASTRUCTURE_MANAGER']),
  ];
  const preview = (over: Record<string, unknown> = {}) => ({
    code: { code: 'CNX-001', reason: 'Crew not available', sourceText: 'Rail Operations', responsibleParty: 'RAIL_OPERATIONS', possibleParties: [] },
    attribution: 'TOC', isForceMajeure: false,
    notice: { hoursBeforeDeparture: 10, noticeBand: 'SHORT_NOTICE', commercialWindow: 'INSIDE_72H', itpRoute: 'EMERGENCY_DYNAMIC_ITP', itpVersionsNamed: [], note: '' },
    noticeLateMinutes: null,
    consequence: { consequence: 'FORFEIT_FEES_PAID_IN_ADVANCE', penaltyApplicable: true, penaltyAgainst: 'TOC', basis: 'TOC-attributed cancellation 10 h before departure.', evidence: [], caveats: [] },
    warnings: [], needsClearinghouseAllocation: false, ...over,
  });
  const state = { preview: preview() as Record<string, unknown>, previewError: null as string | null, createError: null as string | null, codesError: null as string | null };
  const created = { request: { id: 'cr1', requestNumber: 'CR-2026-00001' }, warnings: [], consequence: {}, notice: {} };
  return { codes, preview, state, created };
});

const toast = vi.fn();
vi.mock('../../components/toast-context', () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock('../../api/railChangeApi', () => ({
  getCancellationCodes: vi.fn(async () => { if (h.state.codesError) throw new Error(h.state.codesError); return h.codes; }),
  getChangeWindows: vi.fn(async () => ({ windows: { noticeWithinMinutes: 15, acknowledgeWithinHours: 1, shortNoticeThresholdHours: 48, commercialWindowHours: 72, itpPlanningVersions: [], clearinghouse: { disputeWindowHours: 24, closedToDisputeAfterHours: 48 } }, initiators: [], processSteps: [] })),
  previewChange: vi.fn(async () => { if (h.state.previewError) throw new Error(h.state.previewError); return h.state.preview; }),
  createChange: vi.fn(async () => { if (h.state.createError) throw new Error(h.state.createError); return h.created; }),
}));

import { createChange, getCancellationCodes, previewChange } from '../../api/railChangeApi';
import ChangeRequestModal from './ChangeRequestModal';

const preview = vi.mocked(previewChange);
const create = vi.mocked(createChange);

const reason = () => screen.getByLabelText('Cancellation reason (Annexure 20b)') as HTMLSelectElement;
const train = () => screen.getByLabelText(/Train \/ slot reference/) as HTMLInputElement;
const submitBtn = () => screen.getByRole('button', { name: /^Log (cancel|reschedule|re-plan) request/i }) as HTMLButtonElement;

async function mount(props: Partial<React.ComponentProps<typeof ChangeRequestModal>> = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(<ChangeRequestModal onClose={onClose} onCreated={onCreated} {...props} />);
  await waitFor(() => expect(reason().disabled).toBe(false));
  return { onClose, onCreated };
}
async function choose(code = 'CNX-001', trainRef = 'T-100') {
  fireEvent.change(reason(), { target: { value: code } });
  fireEvent.change(train(), { target: { value: trainRef } });
  await screen.findByTestId('change-preview');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.preview = h.preview();
  h.state.previewError = null;
  h.state.createError = null;
  h.state.codesError = null;
});

describe('reasons (Annexure 20b)', () => {
  it('lists every reason grouped by who it is allocated to', async () => {
    await mount();
    const groups = Array.from(reason().querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).toEqual(['Rail Operations (TOC side)', 'Infrastructure Manager (TRIM)', 'Force Majeure', 'Could be … — allocated at the Clearinghouse']);
    expect(within(reason()).getByRole('option', { name: 'CNX-004 — Derailment ahead' })).toBeTruthy();
  });

  it('typing narrows the list but never drops the reason that is already chosen', async () => {
    await mount();
    fireEvent.change(reason(), { target: { value: 'CNX-002' } });
    fireEvent.change(screen.getByLabelText('Find a reason (Annexure 20b)'), { target: { value: 'flood' } });
    const labels = Array.from(reason().querySelectorAll('option')).map((o) => o.textContent);
    expect(labels).toContain('CNX-003 — Flood');
    expect(labels).toContain('CNX-002 — Track defect'); // still selected, so still present
    expect(labels).not.toContain('CNX-001 — Crew not available');
    expect(reason().value).toBe('CNX-002');
  });

  it('shows the annexure\'s own wording for the chosen reason', async () => {
    await mount();
    fireEvent.change(reason(), { target: { value: 'CNX-001' } });
    expect(screen.getByText(/Annexure 20b allocation: Source text of row 1/)).toBeTruthy();
  });

  it('if the reasons cannot be loaded it says so and Retry loads them', async () => {
    h.state.codesError = 'boom';
    render(<ChangeRequestModal onClose={vi.fn()} onCreated={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/boom/);
    expect(reason().disabled).toBe(true);
    h.state.codesError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(reason().disabled).toBe(false));
    expect(vi.mocked(getCancellationCodes)).toHaveBeenCalledTimes(2);
  });
});

describe('the consequence comes from the server — the modal never works it out', () => {
  it('does not ask until the reason AND the train are known', async () => {
    await mount();
    expect(screen.getByText(/Choose a reason and name the train/)).toBeTruthy();
    fireEvent.change(reason(), { target: { value: 'CNX-001' } });
    await new Promise((r) => setTimeout(r, 350));
    expect(preview).not.toHaveBeenCalled();
    expect(screen.queryByTestId('change-preview')).toBeNull();
    expect(submitBtn().disabled).toBe(true);
  });

  it('asks the server with exactly what the user chose and what the modal was opened for', async () => {
    await mount({ context: { consignmentId: 'c1', trainSlotRef: 'T-100', originalDeparture: '2026-10-05T04:00:00.000Z' } });
    fireEvent.change(reason(), { target: { value: 'CNX-001' } });
    await screen.findByTestId('change-preview');
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview.mock.calls[0][0]).toEqual({
      kind: 'CANCEL', initiatedBy: 'TOC', cancellationCode: 'CNX-001', trainSlotRef: 'T-100', consignmentId: 'c1',
      originalDeparture: '2026-10-05T04:00:00.000Z', isPlannedOccupation: false, requiresStaging: false,
    });
    for (const k of ['attribution', 'consequence', 'penaltyApplicable', 'noticeBand', 'commercialWindow']) expect(preview.mock.calls[0][0]).not.toHaveProperty(k);
  });

  it('shows the server\'s answer VERBATIM even when it disagrees with what a client would compute', async () => {
    // A TOC reason 10 h before departure would be a forfeit if the client worked it out. The server says otherwise; the UI shows the server.
    h.state.preview = h.preview({ consequence: { consequence: 'CREDIT_IF_REALLOCATED', penaltyApplicable: false, penaltyAgainst: null, basis: 'Server basis: a credit applies.', evidence: [], caveats: ['A caveat from the server.'] } });
    await mount();
    await choose();
    const box = within(screen.getByTestId('change-preview'));
    expect(box.getByText('Credit applies if the train path is reallocated')).toBeTruthy();
    expect(box.queryByText(/forfeited/)).toBeNull();
    expect(box.getByText('No penalty applies yet')).toBeTruthy();
    expect(box.getByText('Server basis: a credit applies.')).toBeTruthy();
    expect(box.getByText('A caveat from the server.')).toBeTruthy();
  });

  it('shows who bears it, the notice window, the 72-hour window and the penalty', async () => {
    await mount();
    await choose();
    const box = within(screen.getByTestId('change-preview'));
    expect(box.getByText('Consequence — calculated by the server')).toBeTruthy();
    expect(box.getByText('TOC (Rail Operations)')).toBeTruthy();
    expect(box.getByText(/Short notice \(48 h or less\) — emergency dynamic ITP \(10 h before departure\)/)).toBeTruthy();
    expect(box.getByText('Inside 72 h of departure')).toBeTruthy();
    expect(box.getByText('Access fees paid in advance are forfeited')).toBeTruthy();
    expect(box.getByText('Penalty applies against TOC')).toBeTruthy();
  });

  it('lists the server\'s warnings, and explains a "could be …" reason that needs the Clearinghouse', async () => {
    h.state.preview = h.preview({
      attribution: 'UNDETERMINED', needsClearinghouseAllocation: true, warnings: ['No departure time was given.'],
      consequence: { consequence: 'PENDING_ALLOCATION', penaltyApplicable: false, penaltyAgainst: null, basis: 'Decided at the Clearinghouse.', evidence: [], caveats: [] },
    });
    await mount();
    await choose('CNX-004');
    expect(within(screen.getByTestId('change-warnings')).getByText('No departure time was given.')).toBeTruthy();
    expect(screen.getByText(/could be …” in Annexure 20b/)).toBeTruthy();
    expect(screen.getByText('To be allocated at the Clearinghouse')).toBeTruthy();
    expect(screen.getByText('Pending — the responsible party is decided at the Clearinghouse')).toBeTruthy();
  });

  it('asks again whenever an input that matters changes', async () => {
    await mount();
    await choose();
    expect(preview).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText(/This is a planned occupation/));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(preview.mock.calls[1][0]).toMatchObject({ isPlannedOccupation: true });
    fireEvent.change(reason(), { target: { value: 'CNX-002' } });
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(3));
    expect(preview.mock.calls[2][0]).toMatchObject({ cancellationCode: 'CNX-002' });
  });

  it('a server error replaces the answer, shows why, and blocks submission', async () => {
    h.state.previewError = 'Unknown cancellation code "CNX-001" (Annexure 20b).';
    await mount();
    fireEvent.change(reason(), { target: { value: 'CNX-001' } });
    fireEvent.change(train(), { target: { value: 'T-100' } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/Unknown cancellation code/);
    expect(screen.queryByTestId('change-preview')).toBeNull();
    expect(submitBtn().disabled).toBe(true);
  });
});

describe('proposing a new departure', () => {
  it('is only asked for on a reschedule / re-plan, and is only sent then', async () => {
    await mount();
    expect(screen.queryByLabelText('Proposed new departure')).toBeNull();
    fireEvent.change(screen.getByLabelText('What is being requested'), { target: { value: 'RESCHEDULE' } });
    fireEvent.change(screen.getByLabelText('Proposed new departure'), { target: { value: '2026-10-06T06:00' } });
    await choose();
    expect(preview.mock.calls.at(-1)![0]).toMatchObject({ kind: 'RESCHEDULE', proposedDeparture: new Date('2026-10-06T06:00').toISOString() });
    expect(submitBtn().textContent).toMatch(/Log reschedule request/);
    fireEvent.change(screen.getByLabelText('What is being requested'), { target: { value: 'CANCEL' } });
    await waitFor(() => expect(preview.mock.calls.at(-1)![0]).not.toHaveProperty('proposedDeparture'));
  });
});

describe('submitting', () => {
  it('cannot submit until the server has answered for the current inputs', async () => {
    await mount();
    expect(submitBtn().disabled).toBe(true);
    fireEvent.change(reason(), { target: { value: 'CNX-001' } });
    fireEvent.change(train(), { target: { value: 'T-100' } });
    expect(submitBtn().disabled).toBe(true); // preview in flight
    await screen.findByTestId('change-preview');
    expect(submitBtn().disabled).toBe(false);
    fireEvent.change(train(), { target: { value: 'T-101' } }); // input changed → the old answer no longer counts
    expect(submitBtn().disabled).toBe(true);
    await waitFor(() => expect(submitBtn().disabled).toBe(false));
  });

  it('creates with the same body as the preview and reports the result', async () => {
    const { onCreated } = await mount({ context: { consignmentId: 'c1', slotApplicationId: 's1' } });
    await choose('CNX-001', 'T-100');
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: '  crew sick  ' } });
    await waitFor(() => expect(preview.mock.calls.at(-1)![0]).toMatchObject({ note: 'crew sick' }));
    await screen.findByTestId('change-preview');
    fireEvent.click(submitBtn());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(h.created));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual(preview.mock.calls.at(-1)![0]);
    expect(create.mock.calls[0][0]).toMatchObject({ consignmentId: 'c1', slotApplicationId: 's1', cancellationCode: 'CNX-001', trainSlotRef: 'T-100', note: 'crew sick' });
    expect(toast).toHaveBeenCalledWith('CR-2026-00001 logged', 'success');
  });

  it('opened from a Daily Handshake report: says so, offers that report\'s trains, and creates with handshakeReportId', async () => {
    const { onCreated } = await mount({ context: { handshakeReportId: 'h1' }, trainSlotRefSuggestions: ['T-100', 'T-200'] });
    expect(screen.getByText('Will also be logged in the open Daily Handshake report')).toBeTruthy();
    expect(Array.from(document.querySelectorAll('#change-slot-refs option')).map((o) => o.getAttribute('value'))).toEqual(['T-100', 'T-200']);
    await choose();
    fireEvent.click(submitBtn());
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({ handshakeReportId: 'h1' });
    expect(toast).toHaveBeenCalledWith('CR-2026-00001 logged and added to the Daily Handshake report', 'success');
  });

  it('without a handshake report there is no handshake banner and no handshakeReportId', async () => {
    await mount({ context: { consignmentId: 'c1' } });
    expect(screen.queryByText(/Daily Handshake/)).toBeNull();
    await choose();
    fireEvent.click(submitBtn());
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).not.toHaveProperty('handshakeReportId');
  });

  it('a failed create shows the reason inline, keeps the modal open and does not report success', async () => {
    h.state.createError = 'A deviation cannot be logged while the handshake report is SIGNED_OFF.';
    const { onCreated, onClose } = await mount({ context: { handshakeReportId: 'h1' } });
    await choose();
    fireEvent.click(submitBtn());
    expect((await screen.findByText(/cannot be logged while the handshake report is SIGNED_OFF/)).getAttribute('role')).toBe('alert');
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/SIGNED_OFF/), 'error');
    expect(submitBtn().disabled).toBe(false); // can retry
  });

  it('both close controls (the header X and the footer button) close without creating anything', async () => {
    const { onClose } = await mount();
    const closers = screen.getAllByRole('button', { name: 'Close' });
    expect(closers).toHaveLength(2);
    closers.forEach((b) => fireEvent.click(b));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(create).not.toHaveBeenCalled();
  });
});
