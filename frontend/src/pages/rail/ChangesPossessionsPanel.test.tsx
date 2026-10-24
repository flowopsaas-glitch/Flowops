import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => {
  const change = (over: Record<string, unknown> = {}) => ({
    id: 'cr1', requestNumber: 'CR-2026-00001', kind: 'CANCEL', status: 'SUBMITTED', initiatedBy: 'TOC', cancellationCode: 'CNX-001', cancellationReason: 'Crew not available',
    codeResponsibleParty: 'RAIL_OPERATIONS', attribution: 'TOC', isForceMajeure: false, isPlannedOccupation: false, trainSlotRef: 'T-100',
    requestedAt: '2026-10-02T08:00:00.000Z', noticeBand: 'SHORT_NOTICE', commercialWindow: 'INSIDE_72H', consequence: 'FORFEIT_FEES_PAID_IN_ADVANCE', penaltyApplicable: true,
    penaltyAgainst: 'TOC', penaltyBasis: 'TOC-attributed cancellation 10 h before departure.', requiresStaging: false, createdAt: '2026-10-02T08:00:00.000Z', acknowledgement: 'WAITING', ...over,
  });
  const possession = (over: Record<string, unknown> = {}) => ({
    id: 'p1', corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN', status: 'PLANNED', title: 'Ore line re-sleepering', location: 'Km 120', startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2026-12-03T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z', locked: false, lockedFrom: '2026-10-02T00:00:00.000Z', ...over,
  });
  const occurrence = (over: Record<string, unknown> = {}) => ({
    id: 'o1', occurrenceNumber: 'OR-2026-00001', type: 'DERAILMENT', level: 'LEVEL_2_CODE_ORANGE', status: 'REPORTED', occurredAt: '2026-10-02T06:00:00.000Z', description: 'Three wagons derailed at km 120',
    responsibleParty: 'UNDETERMINED', fatalities: false, hazmatInvolved: false, reportedToTcoAt: null, reportedToRsrAt: null, preliminaryReportDueAt: '2026-10-04T06:00:00.000Z',
    preliminaryReportFiledAt: null, createdAt: '2026-10-02T06:30:00.000Z', preliminaryReportOverdue: false, ...over,
  });
  const state = {
    changes: [change()] as unknown[], possessions: [possession()] as unknown[], occurrences: [occurrence()] as unknown[],
    scan: { conflicts: [], unscheduled: [], unresolved: [], consignmentsChecked: 0 } as unknown,
    codes: [
      { code: 'CNX-001', sourceRow: 1, reason: 'Crew not available', responsibleParty: 'RAIL_OPERATIONS', possibleParties: [], sourceText: 'Rail Operations', fromCatalog: false },
      { code: 'CNX-004', sourceRow: 4, reason: 'Derailment ahead', responsibleParty: 'ALLOCATION_REQUIRED', possibleParties: ['RAIL_OPERATIONS', 'INFRASTRUCTURE_MANAGER'], sourceText: 'Could be Rail Operations / IM', fromCatalog: false },
    ] as unknown[],
  };
  return { change, possession, occurrence, state };
});

const toast = vi.fn();
vi.mock('../../components/toast-context', () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock('../../api/railSlotApi', () => ({
  getCorridors: vi.fn(async () => [{ code: 'COR-ORE', name: 'Ore corridor', aliases: [], workbookRoutes: [], gauge: null, electrification: [], maxAxleLoadTonnes: null, vehicleProfile: null, maxTrainLengthM: null, dataStatus: 'SOURCE_PENDING', sourceRef: null, notes: null, fromCatalog: true }]),
}));
vi.mock('../../api/railChangeApi', () => ({
  listChanges: vi.fn(async () => h.state.changes), getCancellationCodes: vi.fn(async () => h.state.codes), getChangeWindows: vi.fn(async () => null),
  previewChange: vi.fn(), createChange: vi.fn(),
  changeAction: vi.fn(async () => ({})), proposeAlternative: vi.fn(async () => ({})), allocateParty: vi.fn(async () => ({})),
  listPossessions: vi.fn(async () => h.state.possessions), getPossessionConflicts: vi.fn(async () => h.state.scan),
  createPossession: vi.fn(async () => ({ window: {}, conflicts: [], unscheduled: [], unresolved: [] })), cancelPossession: vi.fn(async () => ({})), completePossession: vi.fn(async () => ({})),
  listOccurrences: vi.fn(async () => h.state.occurrences), createOccurrence: vi.fn(async () => ({ occurrenceNumber: 'OR-2026-00002' })),
  notifyOccurrence: vi.fn(async () => ({})), startInvestigation: vi.fn(async () => ({})), filePreliminaryReport: vi.fn(async () => ({})), closeOccurrence: vi.fn(async () => ({})),
}));

import * as api from '../../api/railChangeApi';
import ChangesPossessionsPanel from './ChangesPossessionsPanel';

const m = vi.mocked(api);
const mount = async (canWrite = true, canSign = false) => {
  render(<ChangesPossessionsPanel canWrite={canWrite} canSign={canSign} />);
  await screen.findByText('CR-2026-00001');
  await screen.findByText('OR-2026-00001');
};
const btn = (name: string | RegExp) => screen.queryByRole('button', { name });
const inChanges = () => within(screen.getByTestId('change-requests'));
const inPossessions = () => within(screen.getByTestId('possession-windows'));
const inOccurrences = () => within(screen.getByTestId('occurrence-reports'));

beforeEach(() => {
  vi.clearAllMocks();
  h.state.changes = [h.change()];
  h.state.possessions = [h.possession()];
  h.state.occurrences = [h.occurrence()];
  h.state.scan = { conflicts: [], unscheduled: [], unresolved: [], consignmentsChecked: 0 };
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('what each role is offered', () => {
  it('a VIEWER sees all three registers and NO control that changes anything', async () => {
    await mount(false, false);
    expect(inChanges().getByText('Crew not available')).toBeTruthy();
    expect(inPossessions().getByText('Ore line re-sleepering')).toBeTruthy();
    expect(inOccurrences().getByText('Derailment')).toBeTruthy();
    for (const name of [/New cancel \/ reschedule/, /Record possession window/, /Report an occurrence/, 'IM acknowledged', 'Mark completed', 'Notified TCO', 'Start investigation', 'Allocate party', 'Close']) {
      expect(btn(name)).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /^Cancel$/ })).toBeNull();
  });

  it('DISPATCH (a writer, not a signatory) can log and progress work but is never offered the signatory acts', async () => {
    h.state.changes = [h.change({ codeResponsibleParty: 'ALLOCATION_REQUIRED', attribution: 'UNDETERMINED', cancellationCode: 'CNX-004', cancellationReason: 'Derailment ahead' })];
    h.state.occurrences = [h.occurrence({ status: 'PRELIMINARY_REPORT_FILED', reportedToTcoAt: 'x', reportedToRsrAt: 'y', preliminaryReportFiledAt: 'z' })];
    await mount(true, false);
    expect(btn(/New cancel \/ reschedule/)).toBeTruthy();
    expect(btn(/Record possession window/)).toBeTruthy();
    expect(btn(/Report an occurrence/)).toBeTruthy();
    expect(btn('IM acknowledged')).toBeTruthy();
    expect(btn('Allocate party')).toBeNull(); // decides who pays → signatory only
    expect(btn('Close')).toBeNull(); // closing an occurrence is a formal act → signatory only
  });

  it('a signatory (MANAGER) also gets Allocate party and Close', async () => {
    h.state.changes = [h.change({ codeResponsibleParty: 'ALLOCATION_REQUIRED', attribution: 'UNDETERMINED', cancellationCode: 'CNX-004', cancellationReason: 'Derailment ahead' })];
    h.state.occurrences = [h.occurrence({ status: 'PRELIMINARY_REPORT_FILED', reportedToTcoAt: 'x', reportedToRsrAt: 'y', preliminaryReportFiledAt: 'z' })];
    await mount(true, true);
    expect(btn('Allocate party')).toBeTruthy();
    expect(btn('Close')).toBeTruthy();
  });
});

describe('cancellations & reschedules', () => {
  it('shows the server-derived consequence, who bears it and the IM acknowledgement clock — as sent', async () => {
    h.state.changes = [h.change({ acknowledgement: 'OVERDUE', consequence: 'CREDIT_IF_REALLOCATED', penaltyApplicable: false, penaltyBasis: 'Server says: credit.' })];
    await mount();
    const row = inChanges();
    expect(row.getByText('Credit applies if the train path is reallocated')).toBeTruthy();
    expect(row.getByText('Server says: credit.')).toBeTruthy();
    expect(row.getByText('IM acknowledgement overdue')).toBeTruthy();
    expect(row.getByText('TOC (Rail Operations)')).toBeTruthy();
    expect(row.getByText(/Short notice \(48 h or less\)/)).toBeTruthy();
    expect(row.getByText('Inside 72 h of departure')).toBeTruthy();
  });

  it('shows an empty state', async () => {
    h.state.changes = [];
    render(<ChangesPossessionsPanel canWrite canSign />);
    expect(await screen.findByText('No cancellations or reschedules logged.')).toBeTruthy();
  });

  it('IM acknowledged → calls the server and reloads', async () => {
    await mount();
    fireEvent.click(btn('IM acknowledged')!);
    await waitFor(() => expect(m.changeAction).toHaveBeenCalledWith('cr1', 'acknowledge'));
    await waitFor(() => expect(m.listChanges).toHaveBeenCalledTimes(2));
    expect(toast).toHaveBeenCalledWith('CR-2026-00001: acknowledged by the IM', 'success');
  });

  it('Confirm cancellation asks first; declining sends nothing', async () => {
    h.state.changes = [h.change({ status: 'ACKNOWLEDGED' })];
    await mount();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(btn('Confirm cancellation')!);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/cancellation stands/));
    expect(m.changeAction).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(btn('Confirm cancellation')!);
    await waitFor(() => expect(m.changeAction).toHaveBeenCalledWith('cr1', 'confirm-cancellation'));
  });

  it('a server refusal is shown, not swallowed', async () => {
    m.changeAction.mockRejectedValueOnce(new Error('A change request cannot move from SUBMITTED to ACCEPTED.'));
    await mount();
    fireEvent.click(btn('IM acknowledged')!);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('A change request cannot move from SUBMITTED to ACCEPTED.', 'error'));
  });

  it('Propose alternative needs a date, then sends it as an ISO instant with the note', async () => {
    h.state.changes = [h.change({ status: 'ACKNOWLEDGED' })];
    await mount();
    fireEvent.click(btn('Propose alternative')!);
    const dlg = within(screen.getByRole('dialog'));
    const send = dlg.getByRole('button', { name: 'Propose' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(dlg.getByLabelText('Replacement departure'), { target: { value: '2026-10-06T08:00' } });
    fireEvent.change(dlg.getByLabelText('Note (optional)'), { target: { value: '  Path at 08:00  ' } });
    fireEvent.click(send);
    await waitFor(() => expect(m.proposeAlternative).toHaveBeenCalledWith('cr1', { proposedDeparture: new Date('2026-10-06T08:00').toISOString(), note: 'Path at 08:00' }));
  });

  describe('Clearinghouse allocation (signatory)', () => {
    beforeEach(() => {
      h.state.changes = [h.change({ codeResponsibleParty: 'ALLOCATION_REQUIRED', attribution: 'UNDETERMINED', cancellationCode: 'CNX-004', cancellationReason: 'Derailment ahead' })];
    });

    it('offers only the parties the annexure names for that reason, and needs a reference', async () => {
      await mount(true, true);
      fireEvent.click(btn('Allocate party')!);
      const dlg = within(await screen.findByRole('dialog'));
      await waitFor(() => expect(Array.from((dlg.getByLabelText('Allocated to') as HTMLSelectElement).options).map((o) => o.textContent)).toEqual([
        'Select a party…', 'TOC (Rail Operations)', 'TRIM (Infrastructure Manager)',
      ]));
      expect(dlg.getByText(/“could be …” reason in Annexure 20b/)).toBeTruthy();
      expect((dlg.getByRole('button', { name: 'Record allocation' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('records the allocation with the chosen party and the reference', async () => {
      await mount(true, true);
      fireEvent.click(btn('Allocate party')!);
      const dlg = within(await screen.findByRole('dialog'));
      await waitFor(() => expect((dlg.getByLabelText('Allocated to') as HTMLSelectElement).options.length).toBe(3));
      fireEvent.change(dlg.getByLabelText('Allocated to'), { target: { value: 'TRIM' } });
      fireEvent.change(dlg.getByLabelText('Clearinghouse reference / decision'), { target: { value: 'CH-2026-114' } });
      fireEvent.click(dlg.getByRole('button', { name: 'Record allocation' }));
      await waitFor(() => expect(m.allocateParty).toHaveBeenCalledWith('cr1', { attribution: 'TRIM', note: 'CH-2026-114' }));
    });

    it('will not submit without choosing a party', async () => {
      await mount(true, true);
      fireEvent.click(btn('Allocate party')!);
      const dlg = within(await screen.findByRole('dialog'));
      fireEvent.change(dlg.getByLabelText('Clearinghouse reference / decision'), { target: { value: 'CH-1' } });
      fireEvent.click(dlg.getByRole('button', { name: 'Record allocation' }));
      await waitFor(() => expect(toast).toHaveBeenCalledWith('Choose the party the Clearinghouse allocated.', 'error'));
      expect(m.allocateParty).not.toHaveBeenCalled();
    });

    it('an already-allocated request offers "Change allocation" instead', async () => {
      h.state.changes = [h.change({ codeResponsibleParty: 'ALLOCATION_REQUIRED', attribution: 'TRIM', cancellationCode: 'CNX-004' })];
      await mount(true, true);
      expect(btn('Change allocation')).toBeTruthy();
      expect(btn('Allocate party')).toBeNull();
    });
  });

  it('"New cancel / reschedule" opens the Annexure 20a / 20b modal', async () => {
    await mount();
    fireEvent.click(btn(/New cancel \/ reschedule/)!);
    expect(await screen.findByRole('dialog', { name: /Cancel \/ reschedule a train/ })).toBeTruthy();
    expect(m.getCancellationCodes).toHaveBeenCalled();
  });
});

describe('possession windows', () => {
  it('lists windows with the corridor name, kind, lock and status', async () => {
    h.state.possessions = [h.possession({ kind: 'AD_HOC_EMERGENCY', locked: true, status: 'ACTIVE' })];
    await mount();
    const row = inPossessions();
    expect(row.getByText('Ore line re-sleepering')).toBeTruthy();
    expect(row.getByText('Ore corridor')).toBeTruthy();
    expect(row.getByText('Ad hoc / emergency')).toBeTruthy();
    expect(row.getByText('Locked')).toBeTruthy();
    expect(row.getByText('Active')).toBeTruthy();
  });

  it('shows the conflict banner from the server\'s scan', async () => {
    h.state.scan = {
      conflicts: [{ windowId: 'p1', windowTitle: 'Ore line re-sleepering', windowKind: 'AD_HOC_EMERGENCY', corridorCode: 'COR-ORE', consignmentId: 'c1', consignmentNumber: 'RAIL-2026-00007', overlapStart: '2026-12-01T00:00:00Z', overlapEnd: '2026-12-02T00:00:00Z', overlapHours: 24, severity: 'HARD' }],
      unscheduled: [], unresolved: [], consignmentsChecked: 1,
    };
    await mount();
    expect(within(await screen.findByTestId('possession-banner')).getByText(/RAIL-2026-00007/)).toBeTruthy();
  });

  it('Mark completed / Cancel call the server; Cancel asks first', async () => {
    await mount();
    fireEvent.click(inPossessions().getByRole('button', { name: 'Mark completed' }));
    await waitFor(() => expect(m.completePossession).toHaveBeenCalledWith('p1'));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(inPossessions().getByRole('button', { name: 'Cancel' }));
    expect(m.cancelPossession).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(inPossessions().getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(m.cancelPossession).toHaveBeenCalledWith('p1'));
  });

  it('a finished window offers no actions', async () => {
    h.state.possessions = [h.possession({ status: 'COMPLETED' }), h.possession({ id: 'p2', status: 'CANCELLED', title: 'Other' })];
    await mount();
    expect(inPossessions().queryByRole('button')).toBeNull();
  });

  describe('recording one', () => {
    const open = async () => {
      await mount();
      fireEvent.click(btn(/Record possession window/)!);
      return within(await screen.findByRole('dialog', { name: 'Record a possession window' }));
    };
    const fill = async (dlg: ReturnType<typeof within>, over: { title?: string; starts?: string; ends?: string } = {}) => {
      await waitFor(() => expect((dlg.getByLabelText('Corridor') as HTMLSelectElement).options.length).toBeGreaterThan(1));
      fireEvent.change(dlg.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });
      fireEvent.change(dlg.getByLabelText('Title'), { target: { value: over.title ?? 'Re-sleepering km 120' } });
      fireEvent.change(dlg.getByLabelText('Starts'), { target: { value: over.starts ?? '2026-12-01T00:00' } });
      fireEvent.change(dlg.getByLabelText('Ends'), { target: { value: over.ends ?? '2026-12-03T00:00' } });
    };

    it('needs a corridor, a title and a window that ends after it starts', async () => {
      const dlg = await open();
      const save = dlg.getByRole('button', { name: 'Record window' }) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      await fill(dlg, { starts: '2026-12-03T00:00', ends: '2026-12-01T00:00' });
      expect(save.disabled).toBe(true);
      expect(dlg.getByRole('alert').textContent).toMatch(/must end after it starts/);
      fireEvent.change(dlg.getByLabelText('Ends'), { target: { value: '2026-12-05T00:00' } });
      expect(save.disabled).toBe(false);
    });

    it('sends ISO times and only the optional fields that were filled in', async () => {
      const dlg = await open();
      await fill(dlg);
      fireEvent.change(dlg.getByLabelText('Location (optional)'), { target: { value: ' Km 120 ' } });
      fireEvent.click(dlg.getByRole('button', { name: 'Record window' }));
      await waitFor(() => expect(m.createPossession).toHaveBeenCalledTimes(1));
      expect(m.createPossession.mock.calls[0][0]).toEqual({
        corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN', title: 'Re-sleepering km 120', startsAt: new Date('2026-12-01T00:00').toISOString(), endsAt: new Date('2026-12-03T00:00').toISOString(), location: 'Km 120',
      });
      expect(toast).toHaveBeenCalledWith('Possession window recorded', 'success');
    });

    it('tells the user straight away when the new window overlaps booked consignments', async () => {
      m.createPossession.mockResolvedValueOnce({ window: {} as never, conflicts: [{}, {}] as never, unscheduled: [], unresolved: [] });
      const dlg = await open();
      await fill(dlg);
      fireEvent.click(dlg.getByRole('button', { name: 'Record window' }));
      await waitFor(() => expect(toast).toHaveBeenCalledWith('Possession window recorded — it overlaps 2 consignments', 'info'));
    });

    it('a server refusal keeps the dialog open and says why', async () => {
      m.createPossession.mockRejectedValueOnce(new Error('Unknown corridor "COR-X".'));
      const dlg = await open();
      await fill(dlg);
      fireEvent.click(dlg.getByRole('button', { name: 'Record window' }));
      await waitFor(() => expect(toast).toHaveBeenCalledWith('Unknown corridor "COR-X".', 'error'));
      expect(screen.getByRole('dialog', { name: 'Record a possession window' })).toBeTruthy();
    });
  });
});

describe('occurrence reports', () => {
  it('shows what happened, the level, who has been notified and the 48-hour clock', async () => {
    h.state.occurrences = [h.occurrence({ fatalities: true, hazmatInvolved: true, corridorCode: 'COR-ORE', reportedToTcoAt: '2026-10-02T06:10:00.000Z' })];
    await mount();
    const row = inOccurrences();
    expect(row.getByText('Derailment')).toBeTruthy();
    expect(row.getByText('Fatalities')).toBeTruthy();
    expect(row.getByText('Hazmat')).toBeTruthy();
    expect(row.getByText('Level 2 — Code Orange (major)')).toBeTruthy();
    expect(row.getByText(/Due 2026-10-0[34]/)).toBeTruthy();
    expect(row.getByText(/TCO: 2026-10-02/)).toBeTruthy();
    expect(row.getByText('not yet')).toBeTruthy(); // the Regulator
  });

  it('a report past the 48-hour deadline is flagged on the row and in a summary line', async () => {
    h.state.occurrences = [h.occurrence({ preliminaryReportOverdue: true })];
    await mount();
    expect(inOccurrences().getByText(/OVERDUE — was due/)).toBeTruthy();
    expect(screen.getByTestId('occurrence-overdue').textContent).toMatch(/1 occurrence past the 48-hour preliminary-report deadline/);
  });

  it('no summary line when nothing is overdue', async () => {
    await mount();
    expect(screen.queryByTestId('occurrence-overdue')).toBeNull();
  });

  it('Notified TCO / Regulator record the notification immediately', async () => {
    await mount();
    fireEvent.click(btn('Notified TCO')!);
    await waitFor(() => expect(m.notifyOccurrence).toHaveBeenCalledWith('o1', 'TCO'));
    fireEvent.click(btn('Notified Regulator')!);
    await waitFor(() => expect(m.notifyOccurrence).toHaveBeenCalledWith('o1', 'RSR'));
  });

  it.each([
    ['Start investigation', 'startInvestigation', /Start an investigation/],
    ['File preliminary report', 'filePreliminaryReport', /File the preliminary report/],
  ] as const)('%s asks for a note (3+ characters) and sends it', async (button, fn, title) => {
    await mount();
    fireEvent.click(btn(button)!);
    const dlg = within(await screen.findByRole('dialog', { name: title }));
    const submit = dlg.getAllByRole('button').find((b) => /investigation$|report$/i.test(b.textContent ?? '') && b.textContent !== 'Cancel') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(dlg.getByRole('textbox'), { target: { value: 'ab' } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(dlg.getByRole('textbox'), { target: { value: '  RSR inspector on site  ' } });
    fireEvent.click(submit);
    await waitFor(() => expect(m[fn]).toHaveBeenCalledWith('o1', 'RSR inspector on site'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(`OR-2026-00001: ${fn === 'startInvestigation' ? 'investigation started' : 'preliminary report filed'}`, 'success'));
  });

  it('Close (signatory) sends the closing note', async () => {
    h.state.occurrences = [h.occurrence({ status: 'PRELIMINARY_REPORT_FILED', reportedToTcoAt: 'x', reportedToRsrAt: 'y', preliminaryReportFiledAt: '2026-10-03T00:00:00Z' })];
    await mount(true, true);
    fireEvent.click(btn('Close')!);
    const dlg = within(await screen.findByRole('dialog', { name: /Close the occurrence/ }));
    fireEvent.change(dlg.getByRole('textbox'), { target: { value: 'All actions complete' } });
    fireEvent.click(dlg.getByRole('button', { name: 'Close occurrence' }));
    await waitFor(() => expect(m.closeOccurrence).toHaveBeenCalledWith('o1', 'All actions complete'));
  });

  describe('reporting one', () => {
    const open = async () => {
      await mount();
      fireEvent.click(btn(/Report an occurrence/)!);
      return within(await screen.findByRole('dialog', { name: 'Report an occurrence' }));
    };

    it('needs a time and a description of at least five characters', async () => {
      const dlg = await open();
      const send = dlg.getByRole('button', { name: 'Report occurrence' }) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
      fireEvent.change(dlg.getByLabelText('When it happened'), { target: { value: '2026-10-02T06:00' } });
      fireEvent.change(dlg.getByLabelText('What happened'), { target: { value: 'oops' } });
      expect(send.disabled).toBe(true);
      fireEvent.change(dlg.getByLabelText('What happened'), { target: { value: 'Three wagons derailed' } });
      expect(send.disabled).toBe(false);
    });

    it('a hazmat spill is always a hazmat occurrence — the box is ticked and locked', async () => {
      const dlg = await open();
      const box = dlg.getByLabelText('Hazardous material involved') as HTMLInputElement;
      expect(box.checked).toBe(false);
      fireEvent.change(dlg.getByLabelText('Type'), { target: { value: 'HAZMAT_SPILL' } });
      expect(box.checked).toBe(true);
      expect(box.disabled).toBe(true);
    });

    it('rejects a malformed corridor code before sending', async () => {
      const dlg = await open();
      fireEvent.change(dlg.getByLabelText('Corridor code (optional)'), { target: { value: 'cor ore' } });
      fireEvent.change(dlg.getByLabelText('When it happened'), { target: { value: '2026-10-02T06:00' } });
      fireEvent.change(dlg.getByLabelText('What happened'), { target: { value: 'Three wagons derailed' } });
      expect(dlg.getByRole('alert').textContent).toMatch(/capitals, digits and hyphens/);
      expect((dlg.getByRole('button', { name: 'Report occurrence' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('sends the report (ISO time, trimmed text, only what was filled in) and reminds the user to notify the TCO', async () => {
      const dlg = await open();
      fireEvent.change(dlg.getByLabelText('Type'), { target: { value: 'COLLISION' } });
      fireEvent.change(dlg.getByLabelText('Level'), { target: { value: 'LEVEL_3_CODE_RED' } });
      fireEvent.change(dlg.getByLabelText('When it happened'), { target: { value: '2026-10-02T06:00' } });
      fireEvent.change(dlg.getByLabelText('What happened'), { target: { value: '  Two trains collided at km 12  ' } });
      fireEvent.change(dlg.getByLabelText('Corridor code (optional)'), { target: { value: 'cor-ore' } });
      fireEvent.click(dlg.getByLabelText('Fatalities'));
      fireEvent.click(dlg.getByRole('button', { name: 'Report occurrence' }));
      await waitFor(() => expect(m.createOccurrence).toHaveBeenCalledTimes(1));
      expect(m.createOccurrence.mock.calls[0][0]).toEqual({
        type: 'COLLISION', level: 'LEVEL_3_CODE_RED', occurredAt: new Date('2026-10-02T06:00').toISOString(), description: 'Two trains collided at km 12',
        fatalities: true, hazmatInvolved: false, corridorCode: 'COR-ORE',
      });
      expect(toast).toHaveBeenCalledWith('OR-2026-00002 reported. Notify the Train Control Officer straight away.', 'success');
    });
  });
});
