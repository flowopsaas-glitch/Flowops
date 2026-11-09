import { describe, it, expect } from 'vitest';
import {
  canManageHold,
  canRecordEvidence,
  dispatchableReason,
  documentStatus,
  policyNote,
  serviceStatus,
} from './driverCompliance';

const NOW = Date.parse('2026-11-04T00:00:00Z');
const days = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

describe('documentStatus', () => {
  it('treats an absent date as "not on file", never as expired', () => {
    const state = documentStatus(null, 14, NOW);
    expect(state.state).toBe('missing');
    expect(state.label).toBe('Not on file');
    expect(state.daysUntilExpiry).toBeNull();
  });

  it('flags an expired document with how long ago', () => {
    const state = documentStatus(days(-10), 14, NOW);
    expect(state.state).toBe('expired');
    expect(state.label).toMatch(/10 days ago/);
  });

  it('uses the server-supplied warning window rather than a constant', () => {
    expect(documentStatus(days(10), 14, NOW).state).toBe('expiring');
    expect(documentStatus(days(10), 7, NOW).state).toBe('valid');
    expect(documentStatus(days(3), 7, NOW).state).toBe('expiring');
  });

  it('says "expires today" rather than "in 0 days"', () => {
    expect(documentStatus(days(0), 14, NOW).label).toMatch(/today/i);
  });

  it('reports a comfortably valid document by its date', () => {
    const state = documentStatus(days(200), 14, NOW);
    expect(state.state).toBe('valid');
    expect(state.label).toMatch(/^Valid to /);
  });
});

describe('serviceStatus', () => {
  it('judges by odometer when both readings exist', () => {
    expect(serviceStatus({ nextServiceDate: null, currentKm: 1000, nextServiceKm: 20_000 }).state).toBe('ok');
    expect(serviceStatus({ nextServiceDate: null, currentKm: 19_700, nextServiceKm: 20_000 }).state).toBe('due');
    expect(serviceStatus({ nextServiceDate: null, currentKm: 20_100, nextServiceKm: 20_000 }).state).toBe('overdue');
  });

  // `now` is passed explicitly. These dates are built relative to the hardcoded NOW
  // above, but serviceStatus defaults its clock to Date.now() — so without this the
  // assertions silently depend on what day the suite happens to run, and the days(5)
  // case flips from 'due' to 'overdue' the moment real time passes it.
  it('falls back to the calendar when there is no odometer', () => {
    expect(serviceStatus({ nextServiceDate: days(60), currentKm: null, nextServiceKm: null }, 14, NOW).state).toBe('ok');
    expect(serviceStatus({ nextServiceDate: days(5), currentKm: null, nextServiceKm: null }, 14, NOW).state).toBe('due');
    expect(serviceStatus({ nextServiceDate: days(-5), currentKm: null, nextServiceKm: null }, 14, NOW).state).toBe('overdue');
  });

  it('is unknown, not OK, when nothing is recorded', () => {
    const state = serviceStatus({ nextServiceDate: null, currentKm: null, nextServiceKm: null }, 14, NOW);
    expect(state.state).toBe('unknown');
    expect(state.label).toMatch(/no service date/i);
  });
});

describe('dispatchableReason — allowed is not the same as compliant', () => {
  it('says plainly that documents are missing when they are not required', () => {
    const reason = dispatchableReason(
      { dispatchable: true, unverifiedDocuments: ['licenseExpiry'], warnings: [] },
      false,
    );
    expect(reason).toMatch(/1 document not on file/i);
    expect(reason).not.toMatch(/compliant/i);
  });

  it('raises the count when several are missing', () => {
    expect(
      dispatchableReason({ dispatchable: true, unverifiedDocuments: ['a', 'b'], warnings: [] }, false),
    ).toMatch(/2 documents not on file/i);
  });

  it('does not mention missing documents once they are required — the driver is blocked', () => {
    const reason = dispatchableReason(
      { dispatchable: false, unverifiedDocuments: ['licenseExpiry'], warnings: [] },
      true,
    );
    expect(reason).toMatch(/blocked/i);
  });

  it('separates warnings from a clean pass', () => {
    expect(
      dispatchableReason({ dispatchable: true, unverifiedDocuments: [], warnings: ['licence expiring'] }, false),
    ).toMatch(/with warnings/i);
    expect(
      dispatchableReason({ dispatchable: true, unverifiedDocuments: [], warnings: [] }, false),
    ).toMatch(/no blocking conditions/i);
  });
});

describe('policyNote', () => {
  const policy = (requireDocuments: boolean) => ({ requireDocuments, warningWindowDays: 14, availableStatuses: ['AVAILABLE'] });

  it('says when the requirement is on and coverage is complete', () => {
    const note = policyNote(
      policy(true),
      { drivers: 4, documented: 4, undocumented: 0, documentCoveragePercentage: 100 },
      true,
    );
    expect(note).toMatch(/required for dispatch/i);
    expect(note).toMatch(/every driver/i);
  });

  it('counts who would be blocked when the requirement is on', () => {
    const note = policyNote(
      policy(true),
      { drivers: 4, documented: 1, undocumented: 3, documentCoveragePercentage: 25 },
      false,
    );
    expect(note).toMatch(/3 of 4/);
  });

  it('reports readiness when the switch is off but coverage is complete', () => {
    const note = policyNote(
      policy(false),
      { drivers: 2, documented: 2, undocumented: 0, documentCoveragePercentage: 100 },
      true,
    );
    expect(note).toMatch(/not (yet )?required/i);
    expect(note).toMatch(/ready to require/i);
  });

  it('says what turning it on now would do, without pretending to offer it', () => {
    const note = policyNote(
      policy(false),
      { drivers: 10, documented: 6, undocumented: 4, documentCoveragePercentage: 60 },
      false,
    );
    expect(note).toMatch(/6 of 10/);
    expect(note).toMatch(/60%/);
    expect(note).toMatch(/would block/i);
  });

  it('does not report a coverage figure for an empty fleet', () => {
    const note = policyNote(
      policy(false),
      { drivers: 0, documented: 0, undocumented: 0, documentCoveragePercentage: null },
      false,
    );
    expect(note).toMatch(/no drivers/i);
  });
});

describe('who may do what — mirrors the controller', () => {
  it('lets operational roles record evidence', () => {
    for (const role of ['ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'DISPATCH', 'dispatch', ' manager ']) {
      expect(canRecordEvidence(role)).toBe(true);
    }
  });

  it('keeps viewers and drivers read-only', () => {
    expect(canRecordEvidence('VIEWER')).toBe(false);
    expect(canRecordEvidence('DRIVER')).toBe(false);
    expect(canRecordEvidence(null)).toBe(false);
    expect(canRecordEvidence(undefined)).toBe(false);
  });

  it('restricts a compliance hold to supervisors', () => {
    expect(canManageHold('MANAGER')).toBe(true);
    expect(canManageHold('COMPANY_ADMIN')).toBe(true);
    // A dispatcher can record a licence but cannot suspend a colleague.
    expect(canManageHold('DISPATCH')).toBe(false);
    expect(canManageHold('VIEWER')).toBe(false);
  });
});
