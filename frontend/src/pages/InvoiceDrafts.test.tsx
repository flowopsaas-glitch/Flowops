import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  // the raw rows GET /invoice-drafts returns: the client, lines and amounts are inside draftData
  rows: [{
    id: 'rail-draft-tc1', companyId: 'A', title: 'Rail charges RAIL-2026-00007 (TC-2026-00001)', finalized: false,
    draftData: { clientName: 'Seriti Resources', items: [{ description: 'Infrastructure access', quantity: 1, unitPrice: 10625 }, { description: 'Overload penalty', quantity: 1, unitPrice: 1234.56 }] },
    aiAnalysis: { source: 'RAIL_TARIFF' },
  }] as unknown[],
}));

vi.mock('../api/client', () => ({ api: { get: vi.fn(async () => h.rows), post: vi.fn() } }));

import InvoiceDrafts from './InvoiceDrafts';

describe('InvoiceDrafts — a raw draft row (e.g. from the rail tariff) is displayed with its real client, label and value', () => {
  it('shows the client from draftData, not "FlowOps Client", and the title as the label', async () => {
    render(<InvoiceDrafts />);
    const heading = await screen.findByText('Seriti Resources');
    const card = heading.closest('div.group') as HTMLElement;
    expect(card.textContent).toContain('Rail charges RAIL-2026-00007 (TC-2026-00001)');
    expect(card.textContent).toContain('DRAFT');
    expect(screen.queryByText('FlowOps Client')).toBeNull();
  });

  it('shows the real value (before VAT) instead of R0.00, and counts the draft and its lines', async () => {
    render(<InvoiceDrafts />);
    const heading = await screen.findByText('Seriti Resources');
    const card = heading.closest('div.group') as HTMLElement;
    expect(card.textContent).toMatch(/Draft Value \(before VAT\)/);
    expect(card.textContent).toMatch(/R\s?11,?\s?859[.,]56/);
    expect(card.textContent).not.toMatch(/R\s?0[.,]00/);
    const stats = screen.getByText('Drafts').closest('div') as HTMLElement;
    expect(within(stats.parentElement as HTMLElement).getAllByText('1').length).toBeGreaterThan(0);
  });
});
