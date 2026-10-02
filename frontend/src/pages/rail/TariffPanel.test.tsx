import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => {
  const line = (over: Record<string, unknown> = {}) => ({
    kind: 'GTK_LOADED', description: 'Infrastructure access — loaded train (COR-ORE)', quantity: 85000, unit: 'GTK', rate: 12.5, rateUnit: 'c/GTK', amountZar: 10625,
    basis: '100 gross t × 850 km = 85000 GTK × 12.5 c/GTK', evidence: [], ...over,
  });
  const result = (over: Record<string, unknown> = {}) => ({
    status: 'PRICED', corridorCode: 'COR-ORE', financialYear: '2026/27', scheduleId: 's1', scheduleFinancialYear: '2026/27', escalationYears: 0, grossTonnesLoaded: 100, grossTonnesEmpty: null,
    gtkLoaded: 85000, gtkEmpty: null, lines: [line()], subtotalZar: 10625, currency: 'ZAR', blockers: [], warnings: [], hold: { held: false, wagons: [], totalExcessTonnes: 0, reason: null },
    weightSources: [{ wagonNumber: 'MNR-000001', source: 'NOMINAL', grossTonnes: 100, tareTonnes: 20 }], ...over,
  });
  const preview = (r = result()) => ({
    consignment: { id: 'c1', consignmentNumber: 'RAIL-2026-00007', corridor: 'Ore', clientName: 'Seriti', wagons: 1 }, corridor: { code: 'COR-ORE', name: 'Ore' }, financialYear: '2026/27', result: r,
    constants: { infrastructureEscalationPct: 8.5, electricityEscalationPct: 4.42, dieselBasePricePerLitreZar: 24.64, source: '[BRIEF] — not corroborated by any supplied document; unverified' },
  });
  const svc = (code: string, serviceNumber: number, serviceName: string, name: string, priceStatus = 'NOT_PUBLISHED') => ({
    code, name, serviceName, unitOfMeasure: 'per wagon', priceStatus, unitRateZar: null, serviceNumber, tier: 1, tierName: 'Tier 1', group: 'RAIL', isCompulsory: false,
    description: null, section: null, sourceLabel: null, rateSourceRef: null, fromCatalog: true,
  });
  const calc = (over: Record<string, unknown> = {}) => ({
    id: 'tc1', calculationNumber: 'TC-2026-00001', consignmentId: 'c1', consignmentNumber: 'RAIL-2026-00007', corridorCode: 'COR-ORE', financialYear: '2026/27', status: 'PRICED',
    lines: [line()], blockers: [], warnings: [], gtkLoaded: 85000, gtkEmpty: null, subtotalZar: 10625, currency: 'ZAR', holdTriggered: false, invoiceDraftId: null, invoiceDraftedAt: null,
    createdAt: '2026-10-02T08:00:00Z', ...over,
  });
  const status = (over: Record<string, unknown> = {}) => ({
    constants: preview().constants,
    corridors: [], summary: { corridors: 6, withVerifiedRate: 0, ancillaryLines: 113, ancillaryPublished: 0, ancillaryTbd: 8, ancillaryNotPublished: 105 }, fromCatalogFallback: true,
    message: 'No corridor has a VERIFIED c/GTK rate loaded. The tariff tables were not supplied, so every calculation is refused rather than priced with an invented rate.', ...over,
  });
  return {
    line, result, preview, svc, calc, status, toast: vi.fn(),
    state: { status: status() as Record<string, unknown>, calcs: [] as unknown[], consignments: [{ id: 'c1', consignmentNumber: 'RAIL-2026-00007', commodity: 'Manganese', corridor: 'Ore', clientName: 'Seriti', status: 'LOADING' }] as unknown[] },
    ancillary: [
      svc('ANX40-01', 1, 'Track access', 'Access', 'NOT_PUBLISHED'), svc('ANX40-04-01', 4, 'Shunting', 'Per wagon', 'TBD'), svc('ANX40-04-02', 4, 'Shunting', 'Per hour', 'NOT_PUBLISHED'),
      svc('ANX40-05', 5, 'Weighbridge', 'Weighing', 'PUBLISHED'),
    ],
  };
});

vi.mock('../../components/ToastProvider', () => ({ useToast: () => ({ showToast: h.toast }) }));
vi.mock('../../api/railApi', () => ({ listConsignments: vi.fn(async () => h.state.consignments) }));
vi.mock('../../api/railTariffApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/railTariffApi')>()),
  getTariffStatus: vi.fn(async () => h.state.status),
  getAncillaryServices: vi.fn(async () => h.ancillary),
  listCalculations: vi.fn(async () => h.state.calcs),
  previewTariff: vi.fn(),
  calculateTariff: vi.fn(),
  generateInvoiceDraft: vi.fn(),
}));

import TariffPanel from './TariffPanel';
import * as api from '../../api/railTariffApi';
import { formatMoney } from '../../lib/currency';

const A = vi.mocked(api);
const money = (n: number) => formatMoney(n, 'ZAR');
const mount = async (canWrite = true) => {
  render(<TariffPanel canWrite={canWrite} />);
  await screen.findByTestId('tariff-panel');
};
const fill = (consignment = 'c1', km = '850') => {
  fireEvent.change(screen.getByLabelText('Consignment'), { target: { value: consignment } });
  fireEvent.change(screen.getByLabelText('Distance in km'), { target: { value: km } });
};
const calculate = () => fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));
const btn = (name: RegExp | string) => screen.queryByRole('button', { name });

beforeEach(() => {
  h.toast.mockClear();
  for (const fn of [A.previewTariff, A.calculateTariff, A.generateInvoiceDraft, A.listCalculations, A.getTariffStatus]) fn.mockClear();
  h.state.status = h.status();
  h.state.calcs = [];
  h.state.consignments = [{ id: 'c1', consignmentNumber: 'RAIL-2026-00007', commodity: 'Manganese', corridor: 'Ore', clientName: 'Seriti', status: 'LOADING' }];
  A.previewTariff.mockResolvedValue(h.preview() as never);
  A.calculateTariff.mockImplementation((async () => ({ calculation: h.calc(), ...h.preview() })) as never);
  A.generateInvoiceDraft.mockResolvedValue({ created: true, draft: { id: 'rail-draft-tc1' } } as never);
});

describe('what can be priced today', () => {
  it('says plainly that nothing can be priced while no corridor has a VERIFIED rate — in red, with the server\'s explanation', async () => {
    await mount();
    const banner = screen.getAllByRole('status')[0];
    expect(banner.className).toMatch(/rose/);
    expect(banner.textContent).toContain('No corridor has a VERIFIED c/GTK rate loaded — nothing can be priced yet');
    expect(banner.textContent).toContain('refused rather than priced with an invented rate');
  });

  it('shows the counts: corridors with a verified rate, and the Annexure 40 lines by price status', async () => {
    await mount();
    const text = screen.getByTestId('tariff-panel').textContent ?? '';
    expect(text).toMatch(/Corridors with a verified rate\s*0\s*\/\s*6/);
    expect(text).toContain('113');
    expect(text).toContain('0 published · 8 TBD · 105 with no price published');
  });

  it('labels the brief\'s three constants as UNVERIFIED and says escalation is opt-in', async () => {
    await mount();
    const card = screen.getByTestId('tariff-constants');
    expect(card.textContent).toContain('(unverified)');
    expect(card.textContent).toContain('8.50%');
    expect(card.textContent).toContain('4.42%');
    expect(card.textContent).toContain('R24.64/L');
    expect(card.textContent).toContain('Escalation is applied only when you tick it');
  });

  it('with some corridors priced it warns (amber), not red', async () => {
    h.state.status = h.status({ summary: { corridors: 6, withVerifiedRate: 2, ancillaryLines: 113, ancillaryPublished: 0, ancillaryTbd: 8, ancillaryNotPublished: 105 }, message: '2 of 6 corridors have a VERIFIED loaded rate; the others cannot be priced.' });
    await mount();
    const banner = screen.getAllByRole('status')[0];
    expect(banner.className).toMatch(/amber/);
    expect(banner.textContent).toContain('2 of 6 corridors have a VERIFIED loaded rate');
  });
});

describe('the calculator form', () => {
  it('asks for a consignment and a distance — and does not call the server until they are given', async () => {
    await mount();
    calculate();
    expect((await screen.findAllByRole('alert')).map((a) => a.textContent)).toEqual(expect.arrayContaining(['Choose a consignment.', 'Distance is required.']));
    expect(A.previewTariff).not.toHaveBeenCalled();
  });

  it('explains why the distance is typed (corridor lengths were not supplied)', async () => {
    await mount();
    expect(screen.getByText(/Corridor lengths were not supplied, so the distance is entered by hand/)).toBeTruthy();
  });

  it.each([['1e3'], ['abc'], ['-5'], ['0'], ['10001']])('a distance of %p is flagged as you type', async (km) => {
    await mount();
    fireEvent.change(screen.getByLabelText('Distance in km'), { target: { value: km } });
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('a malformed financial year is flagged', async () => {
    await mount();
    fireEvent.change(screen.getByLabelText('Financial year'), { target: { value: '2026-27' } });
    expect(screen.getByRole('alert').textContent).toMatch(/2026\/27/);
  });

  it('lists consignments for choice but not a cancelled one', async () => {
    h.state.consignments = [
      { id: 'c1', consignmentNumber: 'RAIL-OK', commodity: 'Manganese', corridor: 'Ore', status: 'LOADING' },
      { id: 'c2', consignmentNumber: 'RAIL-GONE', commodity: 'Coal', corridor: null, status: 'CANCELLED' },
    ];
    await mount();
    const options = Array.from((screen.getByLabelText('Consignment') as HTMLSelectElement).options).map((o) => o.textContent);
    expect(options.join('|')).toContain('RAIL-OK');
    expect(options.join('|')).not.toContain('RAIL-GONE');
  });

  it('traction inputs follow the choice: litres for diesel, kWh for electric, none for "not included"', async () => {
    await mount();
    expect(screen.queryByLabelText('Litres')).toBeNull();
    fireEvent.change(screen.getByLabelText('Traction energy'), { target: { value: 'DIESEL' } });
    expect(screen.getByLabelText('Litres')).toBeTruthy();
    expect(screen.getByLabelText('Price per unit')).toBeTruthy();
    expect(screen.queryByLabelText('kWh')).toBeNull();
    fireEvent.change(screen.getByLabelText('Traction energy'), { target: { value: 'ELECTRIC' } });
    expect(screen.getByLabelText('kWh')).toBeTruthy();
    expect(screen.queryByLabelText('Litres')).toBeNull();
    fireEvent.change(screen.getByLabelText('Traction energy'), { target: { value: 'NONE' } });
    expect(screen.queryByLabelText('Price per unit')).toBeNull();
  });
});

describe('calculating — the SERVER does the pricing', () => {
  it('sends only what the user knows: the consignment, the distance and the options — never a rate or an amount', async () => {
    await mount();
    fill();
    fireEvent.click(screen.getByLabelText(/Include the empty return/));
    fireEvent.change(screen.getByLabelText('Traction energy'), { target: { value: 'DIESEL' } });
    fireEvent.change(screen.getByLabelText('Litres'), { target: { value: '1200' } });
    calculate();
    await waitFor(() => expect(A.previewTariff).toHaveBeenCalledTimes(1));
    expect(A.previewTariff).toHaveBeenCalledWith({ consignmentId: 'c1', distanceKm: 850, includeEmptyReturn: true, traction: { type: 'DIESEL', litres: 1200 } });
  });

  it('PRICED: shows each line with its basis and amount, and the total — excluding VAT, which is applied at finalisation', async () => {
    await mount();
    fill();
    calculate();
    const result = await screen.findByTestId('tariff-result');
    expect(result.textContent).toContain('RAIL-2026-00007 · Ore (COR-ORE) · financial year 2026/27');
    expect(result.textContent).toContain('Fully priced');
    expect(result.textContent).toContain('100 gross t × 850 km = 85000 GTK × 12.5 c/GTK');
    const lines = within(result).getByRole('table', { name: 'Tariff lines' });
    expect(lines.textContent).toContain(money(10625));
    expect(lines.textContent).toContain('Total (excluding VAT, which is applied when the draft is finalised)');
    expect(within(result).queryByText(/not an invoice total/)).toBeNull();
  });

  it('BLOCKED: the server\'s reasons are shown verbatim, nothing is priced, nothing can be saved', async () => {
    A.previewTariff.mockResolvedValue(h.preview(h.result({
      status: 'BLOCKED', lines: [], subtotalZar: 0, gtkLoaded: null, scheduleId: null, scheduleFinancialYear: null,
      blockers: ['No loaded c/GTK rate exists for COR-ORE. The tariff tables were not supplied and a rate is never defaulted, so this corridor cannot be priced.'],
    })) as never);
    await mount();
    fill();
    calculate();
    const result = await screen.findByTestId('tariff-result');
    expect(result.textContent).toContain('Cannot be priced');
    expect(result.textContent).toContain('No loaded c/GTK rate exists for COR-ORE');
    expect(result.textContent).toContain('a rate is never defaulted');
    expect(result.textContent).toContain('Nothing was priced, and nothing is saved from a refusal');
    expect(within(result).queryByRole('table', { name: 'Tariff lines' })).toBeNull(); // no figures at all
    expect((btn('Save calculation') as HTMLButtonElement).disabled).toBe(true);
  });

  it('INCOMPLETE: a line with no rate says "Not priced" — it is NEVER shown as R0 — and the total is only the priced lines', async () => {
    A.previewTariff.mockResolvedValue(h.preview(h.result({
      status: 'INCOMPLETE',
      lines: [h.line(), h.line({ kind: 'ANCILLARY', code: 'ANX40-04-01', description: 'Shunting — Per wagon', quantity: 3, unit: 'per wagon', rate: null, rateUnit: null, amountZar: null, basis: 'Annexure 40 says "TBD" for this service: that is not zero and not free, so it is not priced.' })],
      blockers: ['Shunting — Per wagon (ANX40-04-01): Annexure 40 says "TBD" for this service: that is not zero and not free, so it is not priced.'],
    })) as never);
    await mount();
    fill();
    calculate();
    const result = await screen.findByTestId('tariff-result');
    const rows = within(result).getAllByRole('row');
    const ancillaryRow = rows.find((r) => r.textContent?.includes('Shunting — Per wagon') && r.querySelector('td'))!;
    const cells = ancillaryRow.querySelectorAll('td');
    expect(cells[cells.length - 1].textContent).toBe('Not priced');
    expect(cells[cells.length - 1].textContent).not.toMatch(/R\s?0/);
    expect(ancillaryRow.textContent).toContain('no rate loaded');
    expect(result.textContent).toContain('1 line(s) have no rate — this is not an invoice total');
    expect(result.textContent).toContain('Subtotal of the priced lines only');
    expect(result.textContent).toContain('no invoice draft can be made until every line is priced');
  });

  it('shows the overload hold, with the server\'s reason, and the warnings', async () => {
    A.previewTariff.mockResolvedValue(h.preview(h.result({
      hold: { held: true, wagons: [{ wagonNumber: 'MNR-000001', excessTonnes: 4 }], totalExcessTonnes: 4, reason: 'Overloaded: MNR-000001 (4 t over). Reduce the load and re-weigh the wagon within its limit.' },
      warnings: ['Diesel is priced at the brief\'s BASE of R24.64/L, not a contracted or pump price. Enter the price to replace it.'],
    })) as never);
    await mount();
    fill();
    calculate();
    const result = await screen.findByTestId('tariff-result');
    expect(result.textContent).toContain('Overload — the consignment is held for load adjustment');
    expect(result.textContent).toContain('Overloaded: MNR-000001 (4 t over)');
    expect(result.textContent).toContain('Diesel is priced at the brief\'s BASE of R24.64/L');
  });

  it('says where each wagon\'s mass came from, and where the rates came from when they were escalated', async () => {
    A.previewTariff.mockResolvedValue(h.preview(h.result({ scheduleFinancialYear: '2025/26', escalationYears: 1, weightSources: [{ wagonNumber: 'MNR-000001', source: 'WEIGHBRIDGE', grossTonnes: 104, tareTonnes: 20 }, { wagonNumber: 'MNR-000002', source: 'UNKNOWN', grossTonnes: null, tareTonnes: null }] })) as never);
    await mount();
    fill();
    calculate();
    const result = await screen.findByTestId('tariff-result');
    expect(result.textContent).toContain('rates from 2025/26, escalated 1 year(s)');
    expect(result.textContent).toContain('MNR-000001 — weighbridge');
    expect(result.textContent).toContain('MNR-000002 — unknown');
  });

  it('a failed calculation is reported', async () => {
    A.previewTariff.mockRejectedValue(new Error('Rail consignment not found'));
    await mount();
    fill();
    calculate();
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Rail consignment not found', 'error'));
  });

  it('a read-only user can calculate (it saves nothing) but has no Save button', async () => {
    await mount(false);
    fill();
    calculate();
    await screen.findByTestId('tariff-result');
    expect(btn('Save calculation')).toBeNull();
  });
});

describe('saving a calculation', () => {
  it('is possible after a priced result, sends the SAME request, and refreshes the saved list', async () => {
    await mount();
    fill();
    calculate();
    await screen.findByTestId('tariff-result');
    A.listCalculations.mockClear();
    fireEvent.click(btn('Save calculation')!);
    await waitFor(() => expect(A.calculateTariff).toHaveBeenCalledWith({ consignmentId: 'c1', distanceKm: 850 }));
    await waitFor(() => expect(A.listCalculations).toHaveBeenCalledTimes(1));
    expect(h.toast).toHaveBeenCalledWith('TC-2026-00001 saved — Fully priced', 'success');
  });

  it('cannot be clicked before calculating', async () => {
    await mount();
    expect((btn('Save calculation') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a result goes STALE when any input changes: it is dimmed, Save is disabled, and the user is told to recalculate', async () => {
    await mount();
    fill();
    calculate();
    await screen.findByTestId('tariff-result');
    expect((btn('Save calculation') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Distance in km'), { target: { value: '900' } });
    expect(screen.getByText(/The inputs changed after this result — calculate again/)).toBeTruthy();
    expect((btn('Save calculation') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('tariff-result').className).toMatch(/opacity/);
    calculate();
    await waitFor(() => expect(screen.queryByText(/The inputs changed/)).toBeNull());
    expect((btn('Save calculation') as HTMLButtonElement).disabled).toBe(false);
  });

  it('an INCOMPLETE calculation can be saved (it is a working record), a BLOCKED one cannot', async () => {
    A.previewTariff.mockResolvedValue(h.preview(h.result({ status: 'INCOMPLETE', lines: [h.line({ amountZar: null })], blockers: ['x'] })) as never);
    await mount();
    fill();
    calculate();
    await screen.findByTestId('tariff-result');
    expect((btn('Save calculation') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a failed save is reported', async () => {
    A.calculateTariff.mockRejectedValue(new Error('This consignment cannot be priced: …'));
    await mount();
    fill();
    calculate();
    await screen.findByTestId('tariff-result');
    fireEvent.click(btn('Save calculation')!);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('This consignment cannot be priced: …', 'error'));
  });
});

describe('Annexure 40 ancillary services', () => {
  const list = () => screen.getByTestId('ancillary-list');

  it('lists the lines under their services, each with its price status — TBD is spelt out as "not zero, not free"', async () => {
    await mount();
    expect(list().textContent).toContain('1. Track access');
    expect(list().textContent).toContain('4. Shunting');
    expect(list().textContent).toContain('TBD — not zero, not free');
    expect(list().textContent).toContain('No price published');
    expect(list().textContent).toContain('Published');
  });

  it('filters the lines', async () => {
    await mount();
    fireEvent.change(screen.getByLabelText('Filter ancillary services'), { target: { value: 'weigh' } });
    expect(list().textContent).toContain('ANX40-05');
    expect(list().textContent).not.toContain('ANX40-04-01');
    fireEvent.change(screen.getByLabelText('Filter ancillary services'), { target: { value: 'zzz' } });
    expect(list().textContent).toContain('No line matches that filter.');
  });

  it('adds a line with a quantity, can edit and remove it, and sends it with the request', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add ANX40-04-01' }));
    expect((screen.getByRole('button', { name: 'Add ANX40-04-01' }) as HTMLButtonElement).disabled).toBe(true); // "Added"
    const selected = screen.getByRole('list', { name: 'Selected ancillary services' });
    expect(selected.textContent).toContain('ANX40-04-01');
    fireEvent.change(screen.getByLabelText('Quantity for ANX40-04-01'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add ANX40-05' }));
    fill();
    calculate();
    await waitFor(() => expect(A.previewTariff).toHaveBeenCalled());
    expect(A.previewTariff).toHaveBeenCalledWith({ consignmentId: 'c1', distanceKm: 850, ancillary: [{ code: 'ANX40-04-01', quantity: 3 }, { code: 'ANX40-05', quantity: 1 }] });

    fireEvent.click(screen.getByRole('button', { name: 'Remove ANX40-04-01' }));
    expect(screen.getByRole('list', { name: 'Selected ancillary services' }).textContent).not.toContain('ANX40-04-01');
    expect((screen.getByRole('button', { name: 'Add ANX40-04-01' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a line with no quantity stops the calculation and says which', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add ANX40-01' }));
    fireEvent.change(screen.getByLabelText('Quantity for ANX40-01'), { target: { value: '' } });
    fill();
    calculate();
    expect((await screen.findAllByRole('alert')).map((a) => a.textContent).join(' ')).toContain('Quantity for ANX40-01 is required');
    expect(A.previewTariff).not.toHaveBeenCalled();
  });
});

describe('saved calculations and the invoice draft', () => {
  const priced = () => h.calc();
  const incomplete = () => h.calc({ id: 'tc2', calculationNumber: 'TC-2026-00002', status: 'INCOMPLETE', lines: [h.line(), h.line({ amountZar: null })], blockers: ['x'] });
  const drafted = () => h.calc({ id: 'tc3', calculationNumber: 'TC-2026-00003', invoiceDraftId: 'rail-draft-tc3', invoiceDraftedAt: '2026-10-03T09:00:00Z' });
  const row = (n: string) => screen.getByText(n).closest('tr') as HTMLElement;

  it('lists each calculation with its status, its priced total, and how many lines are NOT priced', async () => {
    h.state.calcs = [priced(), incomplete()];
    await mount();
    const t = screen.getByRole('table', { name: 'Saved calculations' });
    expect(within(t).getByText('TC-2026-00001').closest('tr')!.textContent).toContain('Fully priced');
    const inc = within(t).getByText('TC-2026-00002').closest('tr')!;
    expect(inc.textContent).toContain('Incomplete — some lines have no rate');
    expect(inc.textContent).toContain('+ 1 not priced');
  });

  it('"Generate Invoice Draft" is offered only for a fully priced calculation that has no draft yet, to a writer', async () => {
    h.state.calcs = [priced(), incomplete(), drafted()];
    await mount();
    expect(btn('Generate invoice draft for TC-2026-00001')).toBeTruthy();
    expect(btn('Generate invoice draft for TC-2026-00002')).toBeNull(); // incomplete
    expect(btn('Generate invoice draft for TC-2026-00003')).toBeNull(); // already drafted
    expect(row('TC-2026-00003').textContent).toContain('Draft created');
  });

  it('a read-only user is never offered it', async () => {
    h.state.calcs = [priced()];
    await mount(false);
    expect(btn(/Generate invoice draft/)).toBeNull();
    expect(btn('View TC-2026-00001')).toBeTruthy();
  });

  it('one click creates one draft and points the user to where to review it', async () => {
    h.state.calcs = [priced()];
    await mount();
    fireEvent.click(btn('Generate invoice draft for TC-2026-00001')!);
    await waitFor(() => expect(A.generateInvoiceDraft).toHaveBeenCalledTimes(1));
    expect(A.generateInvoiceDraft).toHaveBeenCalledWith('tc1', {});
    expect(h.toast).toHaveBeenCalledWith('Invoice draft created — review it under Billing → Invoice Drafts', 'success');
  });

  it('a second draft is never created: the server returns the existing one and the user is told nothing new was made', async () => {
    A.generateInvoiceDraft.mockResolvedValue({ created: false, draft: { id: 'rail-draft-tc1' } } as never);
    h.state.calcs = [priced()];
    await mount();
    fireEvent.click(btn('Generate invoice draft for TC-2026-00001')!);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('A draft already existed for this calculation — nothing new was created', 'success'));
  });

  it('a double-click sends ONE request (the button is disabled while it is in flight)', async () => {
    let release!: (v: unknown) => void;
    A.generateInvoiceDraft.mockImplementation(() => new Promise((res) => { release = res; }) as never);
    h.state.calcs = [priced()];
    await mount();
    const b = btn('Generate invoice draft for TC-2026-00001')!;
    fireEvent.click(b);
    await waitFor(() => expect((btn('Generate invoice draft for TC-2026-00001') as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(btn('Generate invoice draft for TC-2026-00001')!);
    expect(A.generateInvoiceDraft).toHaveBeenCalledTimes(1);
    release({ created: true, draft: { id: 'd' } });
    await waitFor(() => expect(h.toast).toHaveBeenCalled());
  });

  it('a consignment we KNOW has no client name asks for one first — and sends it', async () => {
    h.state.consignments = [{ id: 'c1', consignmentNumber: 'RAIL-2026-00007', commodity: 'Manganese', corridor: 'Ore', clientName: null, status: 'LOADING' }];
    h.state.calcs = [priced()];
    await mount();
    fireEvent.click(btn('Generate invoice draft for TC-2026-00001')!);
    expect(A.generateInvoiceDraft).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('has no client name');
    const create = within(dialog).getByRole('button', { name: 'Create the draft' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Client name'), { target: { value: '  Acme Mining  ' } });
    fireEvent.click(create);
    await waitFor(() => expect(A.generateInvoiceDraft).toHaveBeenCalledWith('tc1', { clientName: 'Acme Mining' }));
  });

  it('when the consignment is not in the list we try first WITHOUT a name (an entered one would override the stored one), and ask only if the server insists', async () => {
    h.state.consignments = [];
    h.state.calcs = [priced()];
    A.generateInvoiceDraft.mockRejectedValueOnce(new Error('A client name is required for an invoice: set it on the consignment, or pass clientName.'));
    await mount();
    fireEvent.click(btn('Generate invoice draft for TC-2026-00001')!);
    await waitFor(() => expect(A.generateInvoiceDraft).toHaveBeenCalledWith('tc1', {}));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(h.toast).not.toHaveBeenCalledWith(expect.stringMatching(/client name is required/), 'error');
  });

  it('any other refusal is shown as an error', async () => {
    A.generateInvoiceDraft.mockRejectedValue(new Error('TC-2026-00001 still has unpriced lines (1), so it cannot become an invoice draft.'));
    h.state.calcs = [priced()];
    await mount();
    fireEvent.click(btn('Generate invoice draft for TC-2026-00001')!);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.stringMatching(/still has unpriced lines/), 'error'));
  });

  describe('viewing a saved calculation', () => {
    it('shows its lines and says why there is no invoice button for an incomplete one', async () => {
      h.state.calcs = [incomplete()];
      await mount();
      fireEvent.click(btn('View TC-2026-00002')!);
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('table', { name: 'Tariff lines' })).toBeTruthy();
      expect(within(dialog).getByText('Not priced')).toBeTruthy();
      expect(within(dialog).getByTestId('invoice-note').textContent).toMatch(/1 line\(s\) have no rate, so no invoice draft can be made/);
      expect(within(dialog).queryByRole('button', { name: 'Generate Invoice Draft' })).toBeNull();
    });

    it('offers the invoice draft for a priced one, and records an existing draft', async () => {
      h.state.calcs = [priced(), drafted()];
      await mount();
      fireEvent.click(btn('View TC-2026-00001')!);
      let dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByTestId('invoice-note').textContent).toBe('Ready to become an invoice draft.');
      expect(within(dialog).getByRole('button', { name: 'Generate Invoice Draft' })).toBeTruthy();
      fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]); // the dialog's X (the footer has a second "Close")
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      fireEvent.click(btn('View TC-2026-00003')!);
      dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByTestId('invoice-note').textContent).toBe('Invoice draft created 2026-10-03.');
      expect(within(dialog).queryByRole('button', { name: 'Generate Invoice Draft' })).toBeNull();
    });

    it('flags a calculation that carried an overload penalty', async () => {
      h.state.calcs = [h.calc({ holdTriggered: true })];
      await mount();
      expect(row('TC-2026-00001').textContent).toContain('overload');
      fireEvent.click(btn('View TC-2026-00001')!);
      expect((await screen.findByRole('dialog')).textContent).toContain('An overloaded wagon was on this consignment when it was calculated');
    });
  });
});
