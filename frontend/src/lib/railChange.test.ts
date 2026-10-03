import { describe, it, expect } from 'vitest';
import type { ChangeRequest, ConflictScan, OccurrenceReport } from '../api/railChangeApi';
import {
  CONSEQUENCE_LABEL, ACK_LABEL, ATTRIBUTION_LABEL, CHANGE_ACTION_DONE, CHANGE_ACTION_LABEL, CHANGE_STATUS_LABEL, COMMERCIAL_WINDOW_LABEL, NOTICE_BAND_LABEL, OCCURRENCE_LEVEL_LABEL, OCCURRENCE_STATUS_LABEL, OCCURRENCE_TYPE_LABEL,
  POSSESSION_KIND_LABEL, allowedAttributions, ackTone, attributionTone, availableChangeActions, buildChangeBody, changeStatusTone, consequenceTone, formatDateTime,
  initialChangeForm, isChangeFormReady, isoToLocalInput, localInputToIso, occurrenceActions, occurrenceLevelTone, occurrenceStatusTone, possessionActions, preliminaryClock,
  severityLabel, severityTone, summariseConflicts,
} from './railChange';

describe('date helpers', () => {
  it('round-trips a local datetime through ISO without drifting (whatever the machine time zone)', () => {
    for (const local of ['2026-10-05T06:00', '2026-12-31T23:59', '2027-03-01T00:00']) {
      const iso = localInputToIso(local)!;
      expect(iso).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      expect(isoToLocalInput(iso)).toBe(local);
    }
  });
  it('blank or invalid input is "nothing", never a crash or an Invalid Date string', () => {
    expect(localInputToIso('')).toBeUndefined();
    expect(localInputToIso(undefined)).toBeUndefined();
    expect(localInputToIso('not a date')).toBeUndefined();
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('garbage')).toBe('');
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('garbage')).toBe('—');
    expect(formatDateTime('2026-10-05T06:00:00.000Z')).toMatch(/^2026-10-0[45] \d\d:\d\d$/);
  });
});

describe('the cancel / reschedule form', () => {
  it('starts from where the modal was opened, never from a guess', () => {
    const f = initialChangeForm({ trainSlotRef: 'T-100', originalDeparture: '2026-10-05T04:00:00.000Z', kind: 'RESCHEDULE', initiatedBy: 'YARD_OPERATOR' });
    expect(f).toMatchObject({ kind: 'RESCHEDULE', initiatedBy: 'YARD_OPERATOR', trainSlotRef: 'T-100', cancellationCode: '', isPlannedOccupation: false, requiresStaging: false, note: '' });
    expect(isoToLocalInput('2026-10-05T04:00:00.000Z')).toBe(f.originalDeparture);
    expect(initialChangeForm()).toMatchObject({ kind: 'CANCEL', initiatedBy: 'TOC', trainSlotRef: '', originalDeparture: '' });
  });

  it('is ready only once the server knows the reason and the train', () => {
    expect(isChangeFormReady(initialChangeForm())).toBe(false);
    expect(isChangeFormReady({ ...initialChangeForm(), cancellationCode: 'CNX-001' })).toBe(false);
    expect(isChangeFormReady({ ...initialChangeForm({ trainSlotRef: '  ' }), cancellationCode: 'CNX-001' })).toBe(false);
    expect(isChangeFormReady({ ...initialChangeForm({ trainSlotRef: 'T-1' }), cancellationCode: 'CNX-001' })).toBe(true);
  });

  it('the body carries the choices and the context — and NEVER a consequence, attribution or penalty', () => {
    const body = buildChangeBody(
      { ...initialChangeForm({ trainSlotRef: '  T-100  ' }), cancellationCode: 'CNX-010', originalDeparture: '2026-10-05T06:00', note: '  hello  ', isPlannedOccupation: true },
      { consignmentId: 'c1', slotApplicationId: 's1', handshakeReportId: 'h1' },
    );
    expect(body).toEqual({
      kind: 'CANCEL', initiatedBy: 'TOC', cancellationCode: 'CNX-010', trainSlotRef: 'T-100', consignmentId: 'c1', slotApplicationId: 's1', handshakeReportId: 'h1',
      originalDeparture: localInputToIso('2026-10-05T06:00'), isPlannedOccupation: true, requiresStaging: false, note: 'hello',
    });
    for (const forbidden of ['attribution', 'isForceMajeure', 'consequence', 'penaltyApplicable', 'penaltyAgainst', 'noticeBand', 'commercialWindow', 'status']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it('omits what was left blank, and a proposed departure only counts for a reschedule / re-plan', () => {
    const cancel = buildChangeBody({ ...initialChangeForm({ trainSlotRef: 'T' }), cancellationCode: 'CNX-001', proposedDeparture: '2026-10-06T06:00' });
    expect(cancel).not.toHaveProperty('proposedDeparture');
    expect(cancel).not.toHaveProperty('originalDeparture');
    expect(cancel).not.toHaveProperty('eventOccurredAt');
    expect(cancel).not.toHaveProperty('note');
    expect(cancel).not.toHaveProperty('consignmentId');
    const resched = buildChangeBody({ ...initialChangeForm({ trainSlotRef: 'T' }), kind: 'RESCHEDULE', cancellationCode: 'CNX-001', proposedDeparture: '2026-10-06T06:00' });
    expect(resched.proposedDeparture).toBe(localInputToIso('2026-10-06T06:00'));
  });
});

describe('labels and tones cover every value the API can send', () => {
  it('every consequence has a label and a tone; "pending" ones are amber, a forfeit is red', () => {
    for (const c of Object.keys(CONSEQUENCE_LABEL) as (keyof typeof CONSEQUENCE_LABEL)[]) {
      expect(CONSEQUENCE_LABEL[c]).toMatch(/\S/);
      expect(consequenceTone(c)).toMatch(/^(ok|info|warn|danger|muted)$/);
    }
    expect(Object.keys(CONSEQUENCE_LABEL)).toHaveLength(9);
    expect(consequenceTone('FORFEIT_FEES_PAID_IN_ADVANCE')).toBe('danger');
    expect(consequenceTone('PENDING_ALLOCATION')).toBe('warn');
    expect(consequenceTone('NONE_FORCE_MAJEURE')).toBe('info');
  });
  it('every attribution, notice band, window, ack state and status has wording', () => {
    expect(Object.keys(ATTRIBUTION_LABEL).sort()).toEqual(['FORCE_MAJEURE', 'TOC', 'TRIM', 'UNDETERMINED']);
    expect(Object.keys(NOTICE_BAND_LABEL).sort()).toEqual(['AFTER_DEPARTURE', 'PLANNING_VERSION', 'SHORT_NOTICE', 'UNKNOWN']);
    expect(Object.keys(COMMERCIAL_WINDOW_LABEL).sort()).toEqual(['INSIDE_72H', 'OUTSIDE_72H', 'UNKNOWN']);
    expect(Object.keys(ACK_LABEL).sort()).toEqual(['ACKNOWLEDGED_IN_TIME', 'ACKNOWLEDGED_LATE', 'OVERDUE', 'WAITING']);
    expect(Object.keys(CHANGE_STATUS_LABEL)).toHaveLength(6);
    expect(Object.keys(POSSESSION_KIND_LABEL)).toHaveLength(3);
    expect(Object.keys(OCCURRENCE_TYPE_LABEL)).toHaveLength(6);
    expect(Object.keys(OCCURRENCE_LEVEL_LABEL)).toHaveLength(3);
    expect(Object.keys(OCCURRENCE_STATUS_LABEL)).toHaveLength(4);
    expect(ackTone('OVERDUE')).toBe('danger');
    expect(ackTone('ACKNOWLEDGED_IN_TIME')).toBe('ok');
    expect(attributionTone('UNDETERMINED')).toBe('warn');
    expect(changeStatusTone('CANCELLED_CONFIRMED')).toBe('danger');
    expect(changeStatusTone('CLOSED')).toBe('muted');
    expect(occurrenceLevelTone('LEVEL_3_CODE_RED')).toBe('danger');
    expect(occurrenceLevelTone('LEVEL_1_CODE_GREEN')).toBe('ok');
    expect(occurrenceStatusTone('REPORTED')).toBe('warn');
  });
});

describe('action wording', () => {
  it('every action has a button label and a readable past-tense confirmation (not a lower-cased label)', () => {
    expect(Object.keys(CHANGE_ACTION_DONE).sort()).toEqual(Object.keys(CHANGE_ACTION_LABEL).sort());
    for (const [action, text] of Object.entries(CHANGE_ACTION_DONE)) {
      expect(text).toMatch(/^[a-z][A-Za-z ]+$/); // a short phrase, ready to follow "CR-2026-00001: "
      expect(text.toLowerCase()).not.toBe(CHANGE_ACTION_LABEL[action as keyof typeof CHANGE_ACTION_LABEL].toLowerCase()); // not just the button text, lower-cased
    }
    expect(CHANGE_ACTION_DONE.acknowledge).toBe('acknowledged by the IM'); // keeps "IM" upper-case
  });
});

describe('allowedAttributions — maps the annexure\'s "could be …" list; the server enforces it', () => {
  it('maps parties to attributions and ignores anything unknown', () => {
    expect(allowedAttributions(['RAIL_OPERATIONS', 'INFRASTRUCTURE_MANAGER'])).toEqual(['TOC', 'TRIM']);
    expect(allowedAttributions(['FORCE_MAJEURE'])).toEqual(['FORCE_MAJEURE']);
    expect(allowedAttributions(['SOMEONE_ELSE'])).toEqual([]);
    expect(allowedAttributions([])).toEqual([]);
  });
});

describe('availableChangeActions — mirrors the server state machine; the server still enforces it', () => {
  const req = (status: ChangeRequest['status'], party: ChangeRequest['codeResponsibleParty'] = 'RAIL_OPERATIONS', attribution: ChangeRequest['attribution'] = 'TOC') => ({ status, codeResponsibleParty: party, attribution });
  const W = { canWrite: true, canSign: false };
  const S = { canWrite: true, canSign: true };
  it.each([
    ['SUBMITTED', ['acknowledge']],
    ['ACKNOWLEDGED', ['propose-alternative', 'confirm-cancellation']],
    ['ALTERNATIVE_PROPOSED', ['accept', 'confirm-cancellation']],
    ['ACCEPTED', ['close']],
    ['CANCELLED_CONFIRMED', ['close']],
    ['CLOSED', []],
  ] as const)('%s offers %j to a writer', (status, expected) => {
    expect(availableChangeActions(req(status), W)).toEqual(expected);
  });
  it('a viewer is offered nothing at all', () => {
    for (const s of ['SUBMITTED', 'ACKNOWLEDGED', 'ALTERNATIVE_PROPOSED', 'ACCEPTED', 'CANCELLED_CONFIRMED', 'CLOSED'] as const) {
      expect(availableChangeActions(req(s, 'ALLOCATION_REQUIRED', 'UNDETERMINED'), { canWrite: false, canSign: false })).toEqual([]);
    }
  });
  it('allocating a "could be …" party is for signatories only, only for that kind of reason, and never once closed', () => {
    expect(availableChangeActions(req('SUBMITTED', 'ALLOCATION_REQUIRED', 'UNDETERMINED'), W)).toEqual(['acknowledge']);
    expect(availableChangeActions(req('SUBMITTED', 'ALLOCATION_REQUIRED', 'UNDETERMINED'), S)).toEqual(['acknowledge', 'allocate-party']);
    expect(availableChangeActions(req('SUBMITTED', 'RAIL_OPERATIONS'), S)).toEqual(['acknowledge']);
    expect(availableChangeActions(req('CLOSED', 'ALLOCATION_REQUIRED', 'UNDETERMINED'), S)).toEqual([]);
    // a signatory who cannot write may still allocate (the API gives signatories write access too, but the UI does not assume it)
    expect(availableChangeActions(req('ACKNOWLEDGED', 'ALLOCATION_REQUIRED', 'TOC'), { canWrite: false, canSign: true })).toEqual(['allocate-party']);
  });
});

describe('possession helpers', () => {
  const conflict = (windowId: string, consignmentId: string, severity: 'HARD' | 'PLANNED') => ({
    windowId, windowTitle: `W ${windowId}`, windowKind: 'AD_HOC_EMERGENCY' as const, corridorCode: 'COR-ORE', consignmentId, consignmentNumber: `RAIL-${consignmentId}`,
    overlapStart: '2026-10-05T00:00:00Z', overlapEnd: '2026-10-05T12:00:00Z', overlapHours: 12, severity,
  });
  const scan: ConflictScan = {
    conflicts: [conflict('w1', 'c1', 'HARD'), conflict('w2', 'c1', 'PLANNED'), conflict('w2', 'c2', 'PLANNED')],
    unscheduled: ['c3', 'c4'], unresolved: ['c4', 'c5'], consignmentsChecked: 5,
  };
  it('summarises the whole scan', () => {
    expect(summariseConflicts(scan)).toEqual({ total: 3, hard: 1, planned: 2, consignments: 2, windows: 2, unchecked: 3 });
  });
  it('narrows to one consignment, and says whether THAT consignment could not be checked', () => {
    expect(summariseConflicts(scan, 'c1')).toEqual({ total: 2, hard: 1, planned: 1, consignments: 1, windows: 2, unchecked: 0 });
    expect(summariseConflicts(scan, 'c2')).toMatchObject({ total: 1, unchecked: 0 });
    expect(summariseConflicts(scan, 'c3')).toMatchObject({ total: 0, unchecked: 1 });
    expect(summariseConflicts(scan, 'c4')).toMatchObject({ total: 0, unchecked: 2 });
  });
  it('treats a missing scan as "no information", not as a clean result with zero checked', () => {
    expect(summariseConflicts(null)).toEqual({ total: 0, hard: 0, planned: 0, consignments: 0, windows: 0, unchecked: 0 });
  });
  it('a locked clash is red, an annual-plan clash amber', () => {
    expect(severityTone('HARD')).toBe('danger');
    expect(severityTone('PLANNED')).toBe('warn');
    expect(severityLabel('HARD')).toMatch(/cannot be moved/);
  });
  it('only a live window offers complete / cancel, and only to a writer', () => {
    expect(possessionActions({ status: 'PLANNED' }, true)).toEqual(['complete', 'cancel']);
    expect(possessionActions({ status: 'ACTIVE' }, true)).toEqual(['complete', 'cancel']);
    expect(possessionActions({ status: 'COMPLETED' }, true)).toEqual([]);
    expect(possessionActions({ status: 'CANCELLED' }, true)).toEqual([]);
    expect(possessionActions({ status: 'PLANNED' }, false)).toEqual([]);
  });
});

describe('occurrence helpers', () => {
  const o = (over: Partial<OccurrenceReport> = {}) => ({ status: 'REPORTED', reportedToTcoAt: null, reportedToRsrAt: null, ...over }) as Pick<OccurrenceReport, 'status' | 'reportedToTcoAt' | 'reportedToRsrAt'>;
  const W = { canWrite: true, canSign: false };
  const S = { canWrite: true, canSign: true };
  it('a fresh report offers both notifications, an investigation or the preliminary report — but not close', () => {
    expect(occurrenceActions(o(), W)).toEqual(['notify-tco', 'notify-rsr', 'investigate', 'preliminary']);
  });
  it('a party already notified is not offered again (the first record stands)', () => {
    expect(occurrenceActions(o({ reportedToTcoAt: 'x' }), W)).toEqual(['notify-rsr', 'investigate', 'preliminary']);
    expect(occurrenceActions(o({ reportedToTcoAt: 'x', reportedToRsrAt: 'y' }), W)).toEqual(['investigate', 'preliminary']);
  });
  it('an investigation can only start from REPORTED; the preliminary report from REPORTED / UNDER_INVESTIGATION', () => {
    expect(occurrenceActions(o({ status: 'UNDER_INVESTIGATION', reportedToTcoAt: 'x', reportedToRsrAt: 'y' }), W)).toEqual(['preliminary']);
    expect(occurrenceActions(o({ status: 'PRELIMINARY_REPORT_FILED', reportedToTcoAt: 'x', reportedToRsrAt: 'y' }), W)).toEqual([]);
  });
  it('closing needs the preliminary report AND a signatory', () => {
    const filed = o({ status: 'PRELIMINARY_REPORT_FILED', reportedToTcoAt: 'x', reportedToRsrAt: 'y' });
    expect(occurrenceActions(filed, W)).toEqual([]);
    expect(occurrenceActions(filed, S)).toEqual(['close']);
    expect(occurrenceActions(o({ status: 'UNDER_INVESTIGATION' }), S)).not.toContain('close');
  });
  it('a closed report offers nothing; a viewer is offered nothing', () => {
    expect(occurrenceActions(o({ status: 'CLOSED' }), S)).toEqual([]);
    expect(occurrenceActions(o(), { canWrite: false, canSign: false })).toEqual([]);
  });
  it('the 48-hour clock line comes from the server\'s deadline and overdue flag', () => {
    const base = { status: 'REPORTED' as const, preliminaryReportDueAt: '2026-10-04T10:00:00Z', preliminaryReportFiledAt: null, preliminaryReportOverdue: false };
    expect(preliminaryClock(base)).toMatchObject({ tone: 'info', text: expect.stringMatching(/^Due 2026-10-0[34]/) });
    expect(preliminaryClock({ ...base, preliminaryReportOverdue: true })).toMatchObject({ tone: 'danger', text: expect.stringMatching(/^OVERDUE — was due/) });
    expect(preliminaryClock({ ...base, preliminaryReportFiledAt: '2026-10-03T09:00:00Z', status: 'PRELIMINARY_REPORT_FILED' })).toMatchObject({ tone: 'ok', text: expect.stringMatching(/^Filed/) });
    expect(preliminaryClock({ ...base, preliminaryReportOverdue: true, status: 'CLOSED' })).toEqual({ tone: 'muted', text: '—' });
    expect(preliminaryClock({ ...base, preliminaryReportDueAt: null })).toEqual({ tone: 'muted', text: '—' });
  });
});
