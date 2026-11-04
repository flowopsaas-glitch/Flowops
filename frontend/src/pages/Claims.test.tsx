import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  claims: [] as Record<string, unknown>[],
  detail: null as Record<string, unknown> | null,
  summary: {
    total: 0,
    open: 0,
    byStatus: {},
    byType: {},
    claimedOpen: 0,
    approvedPayable: 0,
    overdue: 0,
  },
}));

vi.mock('../api/client', () => {
  const get = vi.fn(async (url: string) => {
    if (url === '/claims/summary') return h.summary;
    if (url.startsWith('/claims/')) return h.detail;
    return h.claims;
  });
  return { api: { get, post: vi.fn() } };
});

import ClaimsPage from './Claims';

function baseClaim(overrides: Row): Row {
  return {
    id: 'claim-1',
    number: 'CLM-2026-0001',
    status: 'OPEN',
    type: 'DAMAGE',
    liability: 'UNASSESSED',
    liabilityBasis: null,
    liabilityCap: null,
    claimedAmount: 4250,
    approvedAmount: null,
    currency: 'ZAR',
    summary: 'Pallet 3 crushed on unloading',
    description: null,
    clientName: 'Acme Ltd',
    clientEmail: null,
    waybillId: 'wb-1',
    waybillNumber: 'WB-1001',
    invoiceId: null,
    creditNoteId: null,
    creditNoteNumber: null,
    rejectionReason: null,
    incidentAt: null,
    respondBy: null,
    settledAt: null,
    closedAt: null,
    evidence: null,
    raisedByName: 'Thandi Mokoena',
    createdAt: '2026-11-02T09:00:00.000Z',
    updatedAt: '2026-11-02T09:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  h.claims = [];
  h.detail = null;
  h.summary = { total: 0, open: 0, byStatus: {}, byType: {}, claimedOpen: 0, approvedPayable: 0, overdue: 0 };
});

describe('Claims — liability is reported, never assumed', () => {
  it('shows an unassessed claim as "Not assessed", not as the carrier', async () => {
    h.claims = [baseClaim({})];
    h.detail = { ...baseClaim({}), events: [] };
    render(<ClaimsPage />);

    expect(await screen.findByText('CLM-2026-0001')).toBeTruthy();
    const row = screen.getByText('CLM-2026-0001').closest('tr') as HTMLElement;
    expect(within(row).getByText('Not assessed')).toBeTruthy();
    expect(within(row).queryByText('Carrier (us)')).toBeNull();
  });

  it('shows the assessed party and its basis in the detail history', async () => {
    h.claims = [baseClaim({ status: 'UNDER_REVIEW', liability: 'INSURER', liabilityBasis: 'Transnet policy 4.2' })];
    h.detail = {
      ...h.claims[0],
      events: [
        {
          id: 'ev-1',
          type: 'CREATED',
          fromStatus: null,
          toStatus: 'OPEN',
          actorName: 'Thandi Mokoena',
          actorId: 'u1',
          description: 'DAMAGE claim raised for waybill WB-1001.',
          metadata: null,
          createdAt: '2026-11-02T09:00:00.000Z',
        },
        {
          id: 'ev-2',
          type: 'STATUS_CHANGED',
          fromStatus: 'OPEN',
          toStatus: 'UNDER_REVIEW',
          actorName: 'Thandi Mokoena',
          actorId: 'u1',
          description: 'Liability assessed as INSURER — Transnet policy 4.2.',
          metadata: null,
          createdAt: '2026-11-02T10:00:00.000Z',
        },
      ],
    };
    render(<ClaimsPage />);

    await userEvent.click(await screen.findByText('CLM-2026-0001'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Insurer')).toBeTruthy();
    expect(within(dialog).getByText('Transnet policy 4.2')).toBeTruthy();
    expect(within(dialog).getByText(/Open → Under review/)).toBeTruthy();
  });
});

describe('Claims — settlement is a draft, not a credit', () => {
  it('says the credit note is a draft that finance still has to issue', async () => {
    h.claims = [baseClaim({ status: 'SETTLED', approvedAmount: 3000, creditNoteNumber: 'CN-2026-0007' })];
    h.detail = { ...h.claims[0], events: [] };
    render(<ClaimsPage />);

    await userEvent.click(await screen.findByText('CLM-2026-0001'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('CN-2026-0007')).toBeTruthy();
    expect(within(dialog).getByText(/draft/i, { selector: 'div, span, p' })).toBeTruthy();
    // A settled claim offers no further decision.
    expect(within(dialog).queryByText('Settle & raise draft credit note')).toBeNull();
  });
});

describe('Claims — approval cannot exceed what was claimed', () => {
  it('blocks an amount above the claim before the request is sent', async () => {
    h.claims = [
      baseClaim({ status: 'UNDER_REVIEW', liability: 'CARRIER', liabilityBasis: 'Trading terms cl 12.2' }),
    ];
    h.detail = { ...h.claims[0], events: [] };
    render(<ClaimsPage />);

    await userEvent.click(await screen.findByText('CLM-2026-0001'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByText('Approve an amount'));

    const amount = within(dialog).getByLabelText(/Amount to approve/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, '9000');

    expect(within(dialog).getByText(/Cannot exceed the claimed amount/i)).toBeTruthy();
    const submit = within(dialog).getByRole('button', { name: 'Approve' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});

describe('Claims — terminal states explain themselves', () => {
  it('tells the operator a rejected claim cannot change again', async () => {
    h.claims = [baseClaim({ status: 'REJECTED', rejectionReason: 'Damage occurred after a clean, signed POD.' })];
    h.detail = { ...h.claims[0], events: [] };
    render(<ClaimsPage />);

    await userEvent.click(await screen.findByText('CLM-2026-0001'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/cannot change again/i)).toBeTruthy();
    expect(within(dialog).getByText('Damage occurred after a clean, signed POD.')).toBeTruthy();
  });
});
