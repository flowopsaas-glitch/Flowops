import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthContextValue } from '../contexts/AuthContext';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  report: null as Record<string, unknown> | null,
  detail: null as Record<string, unknown> | null,
  calls: [] as string[],
}));

vi.mock('../api/client', () => {
  const get = vi.fn(async (url: string) => {
    h.calls.push(url);
    if (url === '/compliance/drivers') return h.report;
    return h.detail;
  });
  return { api: { get, patch: vi.fn(async () => ({ driverId: 'd1', changed: [], compliance: {} })) } };
});

import { AuthContext } from '../contexts/auth-context';
import DriverCompliancePage from './DriverCompliance';

const authFor = (role: string): AuthContextValue =>
  ({
    booting: false,
    user: { id: 'u1', email: 'ops@example.co.za', role },
    isAuthenticated: true,
    login: async () => {},
    logout: () => {},
  }) as unknown as AuthContextValue;

function baseRow(overrides: Row): Row {
  return {
    driverId: 'd1',
    name: 'Sam Driver',
    status: 'AVAILABLE',
    isActive: true,
    compliant: true,
    dispatchable: true,
    blockerCodes: [],
    blockers: [],
    warnings: [],
    unverifiedDocuments: [],
    documents: { licenseExpiry: '2027-06-30T00:00:00.000Z', insuranceExpiry: '2027-01-31T00:00:00.000Z', backgroundCheckExpiry: '2027-03-31T00:00:00.000Z' },
    service: { nextServiceDate: '2027-02-01T00:00:00.000Z', currentKm: 120000, nextServiceKm: 130000 },
    complianceHold: false,
    ...overrides,
  };
}

function report(overrides: Row = {}) {
  return {
    generatedAt: '2026-11-04T08:00:00.000Z',
    policy: { requireDocuments: false, warningWindowDays: 14, availableStatuses: ['AVAILABLE'] },
    summary: {
      drivers: 2,
      dispatchable: 1,
      blocked: 1,
      withWarnings: 0,
      documented: 1,
      undocumented: 1,
      documentCoveragePercentage: 50,
    },
    readyToRequireDocuments: false,
    drivers: [baseRow({}), baseRow({ driverId: 'd2', name: 'Pat Ndlovu', dispatchable: false, compliant: false })],
    ...overrides,
  };
}

function renderPage(role = 'MANAGER') {
  return render(
    <AuthContext.Provider value={authFor(role)}>
      <DriverCompliancePage />
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  h.calls = [];
  h.report = report();
  h.detail = {
    snapshot: {
      driverId: 'd1',
      name: 'Sam Driver',
      status: 'AVAILABLE',
      licenseExpiry: '2027-06-30T00:00:00.000Z',
      insuranceExpiry: null,
      backgroundCheckExpiry: '2027-03-31T00:00:00.000Z',
      nextServiceDate: null,
      currentKm: 120000,
      nextServiceKm: 130000,
      complianceHold: false,
      complianceHoldReason: null,
    },
    compliance: {
      driverId: 'd1',
      companyId: 'A',
      compliant: true,
      dispatchable: true,
      blockers: [],
      warnings: [],
      issues: [],
      unverifiedDocuments: ['insuranceExpiry'],
      checkedAt: '2026-11-04T08:00:00.000Z',
    },
    policy: { requireDocuments: false, warningWindowDays: 14, availableStatuses: ['AVAILABLE'] },
  };
});

describe('Driver compliance — allowed is not the same as compliant', () => {
  it('reports a driver with a missing document as "allowed, but …", never as a clean pass', async () => {
    h.report = report({
      drivers: [baseRow({ unverifiedDocuments: ['insuranceExpiry'] }), baseRow({ driverId: 'd2', name: 'Pat Ndlovu' })],
    });
    renderPage();

    const heading = await screen.findByText('Sam Driver');
    const row = heading.closest('tr') as HTMLElement;
    expect(within(row).getByText('Dispatchable')).toBeTruthy();
    expect(within(row).getByText(/1 document not on file/i)).toBeTruthy();
    expect(within(row).queryByText(/no blocking conditions/i)).toBeNull();
  });

  it('shows why a blocked driver cannot be dispatched', async () => {
    h.report = report({
      drivers: [
        baseRow({
          dispatchable: false,
          compliant: false,
          blockerCodes: ['COMPLIANCE_HOLD'],
          blockers: ['Driver is on a compliance hold'],
        }),
      ],
    });
    renderPage();

    const heading = await screen.findByText('Sam Driver');
    const row = heading.closest('tr') as HTMLElement;
    expect(within(row).getByText('Blocked')).toBeTruthy();
  });

  it('states the policy, including that the requirement switch is not available here', async () => {
    renderPage();
    const note = await screen.findByTestId('policy-note');
    expect(note.textContent).toMatch(/not required/i);
    expect(note.textContent).toMatch(/would block/i);
    expect(note.textContent).toMatch(/warning window/i);
  });
});

describe('Driver compliance — the detail view', () => {
  it('separates a missing document from an expired one', async () => {
    renderPage();
    await userEvent.click(await screen.findByText('Sam Driver'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Not on file')).toBeTruthy();
    expect(within(dialog).queryByText(/Expired/i)).toBeNull();
    expect(within(dialog).getByText(/not required for dispatch yet/i)).toBeTruthy();
  });

  it('lets a dispatcher record evidence but not suspend a colleague', async () => {
    renderPage('DISPATCH');
    await userEvent.click(await screen.findByText('Sam Driver'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Record evidence')).toBeTruthy();
    expect(within(dialog).queryByText('Place compliance hold')).toBeNull();
  });

  it('gives a manager the hold control, and refuses a hold without a reason', async () => {
    renderPage('MANAGER');
    await userEvent.click(await screen.findByText('Sam Driver'));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByText('Place compliance hold'));
    await userEvent.click(within(dialog).getByText('Place hold'));

    expect(within(dialog).getByText(/needs a reason/i)).toBeTruthy();
  });

  it('keeps a viewer read-only', async () => {
    renderPage('VIEWER');
    await userEvent.click(await screen.findByText('Sam Driver'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Record evidence')).toBeNull();
    expect(within(dialog).queryByText('Place compliance hold')).toBeNull();
    expect(within(dialog).getByText(/can read this report but not change/i)).toBeTruthy();
  });
});
