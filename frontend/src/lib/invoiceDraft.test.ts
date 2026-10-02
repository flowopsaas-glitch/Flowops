import { describe, it, expect } from 'vitest';
import { describeDraft } from './invoiceDraft';

// the exact shape the rail tariff service writes (rail-tariff.service.ts generateInvoiceDraft)
const railDraft = (over: Record<string, unknown> = {}) => ({
  id: 'rail-draft-tc1', companyId: 'A', title: 'Rail charges RAIL-2026-00007 (TC-2026-00001)', finalized: false,
  draftData: {
    clientName: 'Seriti Resources', notes: 'Rail charges — consignment RAIL-2026-00007',
    items: [{ description: 'Infrastructure access', quantity: 1, unitPrice: 10625 }, { description: 'Weighbridge overload penalty', quantity: 1, unitPrice: 1234.56 }],
  },
  aiAnalysis: { source: 'RAIL_TARIFF', lineCount: 2 }, ...over,
});

describe('describeDraft', () => {
  it('derives the client, the title, the status, the line count and the value from a raw rail draft', () => {
    expect(describeDraft(railDraft())).toEqual({
      clientName: 'Seriti Resources', periodKey: 'Rail charges RAIL-2026-00007 (TC-2026-00001)', status: 'DRAFT', total: 11859.56, lineCount: 2,
    });
  });

  it('a finalized row is FINALIZED', () => {
    expect(describeDraft(railDraft({ finalized: true })).status).toBe('FINALIZED');
  });

  it('values are summed to the cent, line by line, as finalising does', () => {
    const d = railDraft({ draftData: { clientName: 'X', items: [{ quantity: 3, unitPrice: 0.1 }, { quantity: 3, unitPrice: 0.2 }] } });
    expect(describeDraft(d).total).toBe(0.9); // 0.30 + 0.60, not 0.8999999…
  });

  it('flat fields that are already present win (so a future flattened API keeps working)', () => {
    expect(describeDraft({ ...railDraft(), clientName: 'Flat Co', periodKey: '2026-09', status: 'SENT', total: 500, lineCount: 9 })).toEqual({
      clientName: 'Flat Co', periodKey: '2026-09', status: 'SENT', total: 500, lineCount: 9,
    });
  });

  it('missing or malformed JSON never throws and never invents a client or an amount', () => {
    for (const d of [null, undefined, {}, { draftData: null }, { draftData: 'text' }, { draftData: { items: 'nope' } }, { draftData: { items: [null, 7, {}] } }]) {
      const v = describeDraft(d as never);
      expect(v.clientName).toBeNull();
      expect(v.total).toBe(0);
      expect(v.status).toBe('DRAFT');
    }
    expect(describeDraft({ draftData: { items: [null, 7, {}] } }).lineCount).toBe(3);
  });

  it('a negative quantity or price counts as zero — the same clamp InvoicesService.create applies', () => {
    expect(describeDraft({ draftData: { items: [{ quantity: -2, unitPrice: 100 }, { quantity: 2, unitPrice: -100 }, { quantity: 1, unitPrice: 50 }] } }).total).toBe(50);
  });

  it('numeric strings are read as numbers; junk is zero', () => {
    expect(describeDraft({ draftData: { items: [{ quantity: '2', unitPrice: '10.5' }, { quantity: 'x', unitPrice: 99 }] } }).total).toBe(21);
  });

  it('a blank client name is no client name', () => {
    expect(describeDraft({ draftData: { clientName: '   ' } }).clientName).toBeNull();
    expect(describeDraft({ clientName: '  ', draftData: { clientName: 'Real Co' } }).clientName).toBe('Real Co');
  });

  it('a title is used as the period label only when there is no period key', () => {
    expect(describeDraft({ title: 'T' }).periodKey).toBe('T');
    expect(describeDraft({ title: 'T', periodKey: 'P' }).periodKey).toBe('P');
    expect(describeDraft({}).periodKey).toBe('');
  });
});
