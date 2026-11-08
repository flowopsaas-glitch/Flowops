import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TenantCommercialPanel from './TenantCommercialPanel';

/**
 * The owner console showed what a tenant was DOING but never where the
 * relationship STOOD. This panel is that surface, so these tests are mostly
 * about the READ path: the standing has to actually be on screen, because a
 * status that is saved but never displayed is still lost knowledge.
 */

const {
  mockGetSummary,
  mockAddNote,
  mockUpdateStatus,
  mockUpdateOverride,
  mockCreateQuote,
  mockCreateInvoice,
} = vi.hoisted(() => ({
  mockGetSummary: vi.fn(),
  mockAddNote: vi.fn(),
  mockUpdateStatus: vi.fn(),
  mockUpdateOverride: vi.fn(),
  mockCreateQuote: vi.fn(),
  mockCreateInvoice: vi.fn(),
}));

vi.mock('../../lib/ownerCommercial', async () => {
  const actual = await vi.importActual<typeof import('../../lib/ownerCommercial')>(
    '../../lib/ownerCommercial',
  );
  return {
    ...actual,
    getOwnerTenantCommercialSummary: mockGetSummary,
    addOwnerCommercialNote: mockAddNote,
    updateOwnerCommercialStatus: mockUpdateStatus,
    updateOwnerSubscriptionOverride: mockUpdateOverride,
    createOwnerQuote: mockCreateQuote,
    createOwnerInvoice: mockCreateInvoice,
  };
});

const summary = (over: Record<string, unknown> = {}) => ({
  tenantId: 'cmp-1',
  tenantName: 'Mokoena Freight',
  commercialStatus: 'AT_RISK' as const,
  commercialStatusReason: 'Missed two check-ins',
  statusChangedAt: '2026-11-01T09:00:00.000Z',
  subscriptionOverride: { featureOverrides: { railSlots: true }, priceOverrideZar: 4500 },
  subscriptionOverrideSummary: { features: ['railSlots'], priceOverrideZar: 4500 },
  latestQuote: { id: 'q-1', fromAddress: 'Johannesburg', toAddress: 'Durban', price: 8400 },
  latestInvoice: { id: 'inv-1', invoiceNumber: 'INV-2026-0009', clientName: 'Mokoena Freight', total: 5750 },
  latestCommercialNote: {
    id: 'note-1',
    companyId: 'cmp-1',
    note: 'Called the MD; renewal likely.',
    tags: ['renewal'],
    createdByEmail: 'owner@flowops.co.za',
    createdAt: '2026-11-05T09:00:00.000Z',
  },
  counts: { notes: 3, quotes: 2, invoices: 5 },
  updatedAt: '2026-11-05T09:00:00.000Z',
  ...over,
});

describe('TenantCommercialPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSummary.mockResolvedValue(summary());
    mockAddNote.mockResolvedValue({ id: 'note-2' });
    mockUpdateStatus.mockResolvedValue(summary({ commercialStatus: 'CHURNING' }));
    mockUpdateOverride.mockResolvedValue(summary());
    mockCreateQuote.mockResolvedValue({ id: 'q-2' });
    mockCreateInvoice.mockResolvedValue({ id: 'inv-2' });
  });

  it('displays the standing and the reason it was set — the read path', async () => {
    render(<TenantCommercialPanel tenantId="cmp-1" />);

    await waitFor(() => expect(screen.getByTestId('commercial-status-chip').textContent).toBe('At risk'));
    expect(screen.getByText('Missed two check-ins')).toBeTruthy();
    // The counts and the most recent note are on screen too, not just fetchable.
    expect(screen.getByText('Called the MD; renewal likely.')).toBeTruthy();
    expect(screen.getByText(/3 on file/)).toBeTruthy();
  });

  it('says so plainly when nobody has recorded a standing yet', async () => {
    mockGetSummary.mockResolvedValue(
      summary({
        commercialStatus: null,
        commercialStatusReason: null,
        statusChangedAt: null,
        latestCommercialNote: null,
      }),
    );
    render(<TenantCommercialPanel tenantId="cmp-1" />);

    await waitFor(() => expect(screen.getByTestId('commercial-status-chip').textContent).toBe('Not set'));
    expect(screen.getByText(/No commercial status recorded yet/)).toBeTruthy();
    expect(screen.getByText(/No notes yet/)).toBeTruthy();
  });

  it('will not let you save a standing without a reason', async () => {
    render(<TenantCommercialPanel tenantId="cmp-1" />);
    await waitFor(() => expect(screen.getByTestId('commercial-status-chip').textContent).toBe('At risk'));

    // A status is already selected, so the only thing missing is a reason.
    const reason = screen.getByLabelText(/Reason \(required\)/) as HTMLInputElement;
    fireEvent.change(reason, { target: { value: '   ' } });
    expect((screen.getByText('Save') as HTMLButtonElement).closest('button')?.disabled).toBe(true);

    fireEvent.change(reason, { target: { value: 'Signed with a competitor' } });
    const save = screen.getByText('Save').closest('button') as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    fireEvent.click(save);
    await waitFor(() =>
      expect(mockUpdateStatus).toHaveBeenCalledWith('cmp-1', 'AT_RISK', 'Signed with a competitor'),
    );
  });

  it('posts a note with its tags split out of the comma-separated field', async () => {
    render(<TenantCommercialPanel tenantId="cmp-1" />);
    await waitFor(() => expect(screen.getByTestId('commercial-status-chip').textContent).toBe('At risk'));

    const note = screen.getByLabelText(/What happened\?/);
    expect((screen.getByText('Add note') as HTMLElement).closest('button')?.disabled).toBe(true);

    fireEvent.change(note, { target: { value: 'Agreed a 60-day transition' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'renewal, pricing' } });
    fireEvent.click(screen.getByText('Add note'));

    await waitFor(() =>
      expect(mockAddNote).toHaveBeenCalledWith('cmp-1', 'Agreed a 60-day transition', [
        'renewal',
        'pricing',
      ]),
    );
  });

  it('clears the note field after it is saved', async () => {
    render(<TenantCommercialPanel tenantId="cmp-1" />);
    await waitFor(() => expect(screen.getByTestId('commercial-status-chip').textContent).toBe('At risk'));

    const note = screen.getByLabelText(/What happened\?/) as HTMLInputElement;
    fireEvent.change(note, { target: { value: 'Left a voicemail' } });
    fireEvent.click(screen.getByText('Add note'));

    await waitFor(() => expect(mockAddNote).toHaveBeenCalled());
    await waitFor(() => expect(note.value).toBe(''));
  });

  it('shows the negotiated override and can clear it', async () => {
    render(<TenantCommercialPanel tenantId="cmp-1" />);

    // The price and the overridden features sit in one line; assert on the line.
    // en-ZA groups thousands with a (possibly non-breaking) space, not a comma.
    await waitFor(() =>
      expect(
        screen.getByText('Subscription override').parentElement?.textContent?.replace(/\s/g, ' '),
      ).toContain('ZAR 4 500'),
    );
    fireEvent.click(screen.getByText('Clear override'));
    await waitFor(() =>
      expect(mockUpdateOverride).toHaveBeenCalledWith('cmp-1', {
        featureOverrides: null,
        priceOverrideZar: null,
      }),
    );
  });

  it('says "billed at list price" when there is no override', async () => {
    mockGetSummary.mockResolvedValue(
      summary({
        subscriptionOverride: { featureOverrides: null, priceOverrideZar: null },
        subscriptionOverrideSummary: null,
      }),
    );
    render(<TenantCommercialPanel tenantId="cmp-1" />);

    await waitFor(() => expect(screen.getByText('Billed at list price')).toBeTruthy());
  });

  it('surfaces the latest quote and invoice, not just their counts', async () => {
    render(<TenantCommercialPanel tenantId="cmp-1" />);

    await waitFor(() => expect(screen.getByText(/Johannesburg · Durban/)).toBeTruthy());
    expect(screen.getByText(/2 raised/)).toBeTruthy();
    expect(screen.getByText(/INV-2026-0009 · Mokoena Freight/)).toBeTruthy();
    expect(screen.getByText(/5 raised/)).toBeTruthy();
  });

  it('raises a quote against this tenant with numbers, not strings', async () => {
    render(<TenantCommercialPanel tenantId="cmp-1" />);
    await waitFor(() => expect(screen.getByTestId('commercial-status-chip').textContent).toBe('At risk'));

    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'Johannesburg' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'Durban' } });
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '1200' } });
    fireEvent.change(screen.getByLabelText('Price (ZAR)'), { target: { value: '8400' } });
    fireEvent.click(screen.getByText('Create quote'));

    await waitFor(() =>
      expect(mockCreateQuote).toHaveBeenCalledWith('cmp-1', {
        fromAddress: 'Johannesburg',
        toAddress: 'Durban',
        weight: 1200,
        price: 8400,
        clientName: 'Mokoena Freight',
      }),
    );
  });

  it('sends an invoice as a real line item so the billing service can total it', async () => {
    render(<TenantCommercialPanel tenantId="cmp-1" />);
    await waitFor(() => expect(screen.getByTestId('commercial-status-chip').textContent).toBe('At risk'));

    fireEvent.change(screen.getByLabelText('Line item'), { target: { value: 'Onboarding & setup' } });
    fireEvent.change(screen.getByLabelText('Unit price (ZAR)'), { target: { value: '5000' } });
    fireEvent.click(screen.getByText('Create invoice'));

    await waitFor(() =>
      expect(mockCreateInvoice).toHaveBeenCalledWith('cmp-1', {
        clientName: 'Mokoena Freight',
        items: [{ description: 'Onboarding & setup', quantity: 1, unitPrice: 5000 }],
      }),
    );
  });

  it('reports a load failure instead of showing an empty standing', async () => {
    mockGetSummary.mockRejectedValue(new Error('Tenant not found'));
    render(<TenantCommercialPanel tenantId="cmp-1" />);

    await waitFor(() => expect(screen.getByText('Tenant not found')).toBeTruthy());
  });
});
