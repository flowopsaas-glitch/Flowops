import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => {
  const reading = (over: Record<string, unknown> = {}) => ({
    id: 'r1', consignmentId: 'c1', wagonId: 'w1', wagonNumber: 'MNR-000001', weighbridge: 'Hotazel WB1', weighedAt: '2026-10-02T08:00:00Z', actualTonnes: 100, axles: 4,
    maxAxleLoadTonnes: 26, limitSource: 'CORRIDOR', corridorCode: 'COR-ORE', allowedTonnes: 104, excessTonnes: null, status: 'WITHIN_LIMIT', note: null, createdAt: '2026-10-02T08:00:00Z', ...over,
  });
  const consignment = (over: Record<string, unknown> = {}) => ({
    id: 'c1', consignmentNumber: 'RAIL-2026-00007', status: 'LOADING', commodity: 'Manganese', createdAt: '', holdStatus: 'NONE', holdReason: null,
    wagons: [{ id: 'w1', wagonNumber: 'MNR-000001', type: 'HOPPER', axles: 4 }, { id: 'w2', wagonNumber: 'MNR-000002', type: 'HOPPER', axles: null }], ...over,
  });
  const verdict = (over: Record<string, unknown> = {}) => ({
    reading: reading(), evaluation: { status: 'WITHIN_LIMIT', allowedTonnes: 104, excessTonnes: null, reason: '100 t is within the 104 t allowed (26 t per axle × 4).' },
    hold: { held: false, status: 'NONE', reason: null, wagons: [], totalExcessTonnes: 0, changed: false }, ...over,
  });
  return { reading, consignment, verdict, toast: vi.fn(), state: { readings: [] as unknown[] } };
});

vi.mock('../../components/ToastProvider', () => ({ useToast: () => ({ showToast: h.toast }) }));
vi.mock('../../api/railTariffApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/railTariffApi')>()),
  listWeighbridgeReadings: vi.fn(async () => h.state.readings),
  recordWeighbridgeReading: vi.fn(),
}));

import WeighbridgeSection from './WeighbridgeSection';
import * as api from '../../api/railTariffApi';

const A = vi.mocked(api);
const mount = async (consignment = h.consignment(), canWrite = true) => {
  const onChanged = vi.fn();
  render(<WeighbridgeSection consignment={consignment as never} canWrite={canWrite} onChanged={onChanged} />);
  await screen.findByTestId('weighbridge-section');
  await waitFor(() => expect(A.listWeighbridgeReadings).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 10));
  return { onChanged };
};
const btn = (name: RegExp | string) => screen.queryByRole('button', { name });

beforeEach(() => {
  h.toast.mockClear();
  h.state.readings = [];
  A.listWeighbridgeReadings.mockClear();
  A.recordWeighbridgeReading.mockReset();
  A.recordWeighbridgeReading.mockResolvedValue(h.verdict() as never);
});

describe('the readings', () => {
  it('says so when there are none, and what is used instead', async () => {
    await mount();
    expect(screen.getByText(/No weighbridge readings yet/).textContent).toContain('tare + loaded tonnes registered');
  });

  it('lists each reading with its mass, the limit arithmetic, the server\'s verdict and where it was weighed', async () => {
    h.state.readings = [
      h.reading({ id: 'r2', wagonNumber: 'MNR-000002', actualTonnes: 110, axles: 4, allowedTonnes: 104, excessTonnes: 6, status: 'OVERLOADED' }),
      h.reading({ id: 'r3', wagonNumber: 'MNR-000003', actualTonnes: 90, axles: null, maxAxleLoadTonnes: null, allowedTonnes: null, limitSource: 'NONE', status: 'UNVERIFIED', weighbridge: null }),
    ];
    await mount();
    const t = screen.getByRole('table', { name: 'Weighbridge readings' });
    const over = within(t).getByText('MNR-000002').closest('tr')!;
    expect(over.textContent).toContain('110 t');
    expect(over.textContent).toContain('26 t × 4 axles = 104 t (verified corridor limit)');
    expect(over.textContent).toContain('OVERLOADED · 6 t over');
    expect(over.textContent).toContain('Hotazel WB1');
    expect(within(over).getByText(/OVERLOADED/).className).toMatch(/rose/);
    const unknown = within(t).getByText('MNR-000003').closest('tr')!;
    expect(unknown.textContent).toContain('axle count unknown — not judged');
    expect(within(unknown).getByText('Unverified — not judged').className).toMatch(/amber/); // never green
  });

  it('marks only each wagon\'s LATEST reading as "current" and dims the older ones — the one the hold follows', async () => {
    h.state.readings = [
      h.reading({ id: 'new', wagonNumber: 'MNR-000001', actualTonnes: 100, createdAt: '2026-10-02T10:00:00Z' }),
      h.reading({ id: 'old', wagonNumber: 'MNR-000001', actualTonnes: 110, status: 'OVERLOADED', excessTonnes: 6, createdAt: '2026-10-02T08:00:00Z' }),
    ];
    await mount();
    const rows = within(screen.getByRole('table', { name: 'Weighbridge readings' })).getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('current');
    expect(rows[0].className).not.toMatch(/opacity/);
    expect(rows[1].textContent).not.toContain('current');
    expect(rows[1].className).toMatch(/opacity/);
  });

  it('a failure to load is shown, not hidden', async () => {
    A.listWeighbridgeReadings.mockRejectedValueOnce(new Error('403'));
    await mount();
    expect(await screen.findByText(/Readings could not be loaded: 403/)).toBeTruthy();
  });
});

describe('the hold', () => {
  const held = () => h.consignment({ holdStatus: 'HOLD_FOR_LOAD_ADJUSTMENT', holdReason: 'Overloaded: MNR-000001 (6 t over). Reduce the load and re-weigh the wagon within its limit.' });

  it('a held consignment shows a red banner with the SERVER\'s reason, and says there is no manual override', async () => {
    await mount(held());
    const banner = screen.getByRole('status');
    expect(banner.className).toMatch(/rose/);
    expect(banner.textContent).toContain('On hold for load adjustment — dispatch is blocked');
    expect(banner.textContent).toContain('Overloaded: MNR-000001 (6 t over)');
    expect(banner.textContent).toContain('There is no manual override');
  });

  it('and offers NO control to release it — the only way out is to weigh the wagon again', async () => {
    await mount(held());
    for (const name of [/release/i, /override/i, /clear (the )?hold/i, /lift/i, /unhold/i]) expect(btn(name)).toBeNull();
  });

  it('no banner when the consignment is not held', async () => {
    await mount(h.consignment());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('falls back to a plain sentence when the hold carries no reason', async () => {
    await mount(h.consignment({ holdStatus: 'HOLD_FOR_LOAD_ADJUSTMENT', holdReason: null }));
    expect(screen.getByRole('status').textContent).toContain('A wagon has not been re-weighed within its limit.');
  });
});

describe('who can record a reading', () => {
  it('a writer on a live consignment can', async () => {
    await mount();
    expect(btn(/Record reading/)).toBeTruthy();
  });
  it('a read-only user cannot', async () => {
    await mount(h.consignment(), false);
    expect(btn(/Record reading/)).toBeNull();
  });
  it('nobody can on a cancelled consignment', async () => {
    await mount(h.consignment({ status: 'CANCELLED' }));
    expect(btn(/Record reading/)).toBeNull();
  });
});

describe('recording a reading', () => {
  async function openModal(consignment = h.consignment()) {
    const r = await mount(consignment);
    fireEvent.click(btn(/Record reading/)!);
    return { ...r, dialog: await screen.findByRole('dialog') };
  }
  const submit = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: 'Record reading' }));

  it('needs a wagon and a mass, and tells the user what is missing', async () => {
    const { dialog } = await openModal();
    submit(dialog);
    expect(within(dialog).getAllByRole('alert').map((a) => a.textContent)).toEqual(expect.arrayContaining(['Choose a wagon.', 'Gross mass is required.']));
    expect(A.recordWeighbridgeReading).not.toHaveBeenCalled();
  });

  it('choosing a wagon fills in its registered axle count', async () => {
    const { dialog } = await openModal();
    fireEvent.change(within(dialog).getByLabelText('Wagon'), { target: { value: 'MNR-000001' } });
    expect((within(dialog).getByLabelText('Axles') as HTMLInputElement).value).toBe('4');
    fireEvent.change(within(dialog).getByLabelText('Wagon'), { target: { value: 'MNR-000002' } }); // no axles registered
    expect((within(dialog).getByLabelText('Axles') as HTMLInputElement).value).toBe('');
    expect(within(dialog).getByText(/needed to check the limit/)).toBeTruthy();
  });

  it('tells the user that a different axle count can only tighten the check (the smaller of the registered and entered count applies)', async () => {
    const { dialog } = await openModal();
    expect(within(dialog).queryByText(/Registered with/)).toBeNull(); // no wagon chosen yet
    fireEvent.change(within(dialog).getByLabelText('Wagon'), { target: { value: 'MNR-000001' } });
    expect(within(dialog).getByText(/Registered with 4 axles\. If you enter a different number the smaller one is used/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Wagon'), { target: { value: 'MNR-000002' } }); // none registered
    expect(within(dialog).queryByText(/Registered with/)).toBeNull();
  });

  it('shows the server\'s note when it ignored a larger axle count', async () => {
    A.recordWeighbridgeReading.mockResolvedValue(h.verdict({
      evaluation: { status: 'OVERLOADED', allowedTonnes: 80, excessTonnes: 10, reason: '90 t on 4 axle(s) exceeds the 80 t allowed (20 t per axle) by 10 t. The 8 axles entered exceed the 4 registered for MNR-000001, so the registered count was used — correct the wagon register if it is wrong.' },
    }) as never);
    const { dialog } = await openModal();
    fireEvent.change(within(dialog).getByLabelText('Wagon'), { target: { value: 'MNR-000001' } });
    fireEvent.change(within(dialog).getByLabelText('Gross mass'), { target: { value: '90' } });
    fireEvent.change(within(dialog).getByLabelText('Axles'), { target: { value: '8' } });
    submit(dialog);
    expect((await screen.findByTestId('weighbridge-verdict')).textContent).toContain('so the registered count was used');
  });

  it('sends the mass and what was entered — blanks omitted — and NEVER a verdict', async () => {
    const { dialog } = await openModal();
    fireEvent.change(within(dialog).getByLabelText('Wagon'), { target: { value: 'MNR-000001' } });
    fireEvent.change(within(dialog).getByLabelText('Gross mass'), { target: { value: '104.5' } });
    fireEvent.change(within(dialog).getByLabelText('Weighbridge'), { target: { value: ' Hotazel WB1 ' } });
    submit(dialog);
    await waitFor(() => expect(A.recordWeighbridgeReading).toHaveBeenCalledTimes(1));
    expect(A.recordWeighbridgeReading).toHaveBeenCalledWith({ consignmentId: 'c1', wagonNumber: 'MNR-000001', actualTonnes: 104.5, axles: 4, weighbridge: 'Hotazel WB1' });
    const json = JSON.stringify(A.recordWeighbridgeReading.mock.calls[0][0]);
    for (const k of ['status', 'excess', 'OVERLOADED', 'hold', 'allowed']) expect(json).not.toContain(k);
  });

  it('explains that an entered axle limit can only tighten a verified corridor limit', async () => {
    const { dialog } = await openModal();
    expect(within(dialog).getByText(/the stricter of the two wins — this can tighten the check, never relax it/)).toBeTruthy();
  });

  it('shows the SERVER\'s verdict: OVERLOADED, the reason, and that the consignment is now on hold', async () => {
    A.recordWeighbridgeReading.mockResolvedValue(h.verdict({
      reading: h.reading({ status: 'OVERLOADED', excessTonnes: 6 }),
      evaluation: { status: 'OVERLOADED', allowedTonnes: 104, excessTonnes: 6, reason: '110 t on 4 axle(s) exceeds the 104 t allowed (26 t per axle) by 6 t.' },
      hold: { held: true, status: 'HOLD_FOR_LOAD_ADJUSTMENT', reason: 'Overloaded: MNR-000001 (6 t over). Reduce the load and re-weigh the wagon within its limit.', wagons: [{ wagonNumber: 'MNR-000001', excessTonnes: 6 }], totalExcessTonnes: 6, changed: true },
    }) as never);
    const { dialog } = await openModal();
    fireEvent.change(within(dialog).getByLabelText('Wagon'), { target: { value: 'MNR-000001' } });
    fireEvent.change(within(dialog).getByLabelText('Gross mass'), { target: { value: '110' } });
    submit(dialog);
    const verdict = await screen.findByTestId('weighbridge-verdict');
    expect(verdict.textContent).toContain('OVERLOADED');
    expect(verdict.textContent).toContain('110 t on 4 axle(s) exceeds the 104 t allowed (26 t per axle) by 6 t.');
    expect(verdict.textContent).toContain('The consignment is now on hold for load adjustment');
    expect(verdict.textContent).toContain('Reduce the load and re-weigh');
    expect(h.toast).toHaveBeenCalledWith('Reading recorded — the consignment is now on hold', 'error');
  });

  it('shows when a re-weigh LIFTS the hold', async () => {
    A.recordWeighbridgeReading.mockResolvedValue(h.verdict({ hold: { held: false, status: 'NONE', reason: null, wagons: [], totalExcessTonnes: 0, changed: true } }) as never);
    const { dialog } = await openModal(h.consignment({ holdStatus: 'HOLD_FOR_LOAD_ADJUSTMENT', holdReason: 'x' }));
    fireEvent.change(within(dialog).getByLabelText('Wagon'), { target: { value: 'MNR-000001' } });
    fireEvent.change(within(dialog).getByLabelText('Gross mass'), { target: { value: '100' } });
    submit(dialog);
    const verdict = await screen.findByTestId('weighbridge-verdict');
    expect(verdict.textContent).toContain('The hold is lifted');
    expect(h.toast).toHaveBeenCalledWith('Reading recorded — the hold is lifted', 'success');
  });

  it('an UNVERIFIED reading is said to be neither a pass nor a hold, and the user is told how to get it checked', async () => {
    A.recordWeighbridgeReading.mockResolvedValue(h.verdict({
      evaluation: { status: 'UNVERIFIED', allowedTonnes: null, excessTonnes: null, reason: 'No maximum axle load is known for this corridor, so the reading cannot be judged.' },
    }) as never);
    const { dialog } = await openModal();
    fireEvent.change(within(dialog).getByLabelText('Wagon'), { target: { value: 'MNR-000001' } });
    fireEvent.change(within(dialog).getByLabelText('Gross mass'), { target: { value: '100' } });
    submit(dialog);
    const verdict = await screen.findByTestId('weighbridge-verdict');
    expect(verdict.textContent).toContain('Unverified — not judged');
    expect(verdict.textContent).toContain('neither a pass nor a hold');
    expect(verdict.textContent).toContain("Enter the wagon's own rating");
    expect(verdict.textContent).not.toMatch(/within limit/i);
  });

  it('"Done" closes the verdict, reloads the readings and tells the parent (so the hold chip follows the server)', async () => {
    const { dialog, onChanged } = await openModal();
    fireEvent.change(within(dialog).getByLabelText('Wagon'), { target: { value: 'MNR-000001' } });
    fireEvent.change(within(dialog).getByLabelText('Gross mass'), { target: { value: '100' } });
    submit(dialog);
    await screen.findByTestId('weighbridge-verdict');
    A.listWeighbridgeReadings.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(A.listWeighbridgeReadings).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a refusal from the server is shown and the form stays open for another try', async () => {
    A.recordWeighbridgeReading.mockRejectedValue(new Error('Wagon "MNR-000009" is not registered on RAIL-2026-00007.'));
    const { dialog, onChanged } = await openModal();
    fireEvent.change(within(dialog).getByLabelText('Wagon'), { target: { value: 'MNR-000001' } });
    fireEvent.change(within(dialog).getByLabelText('Gross mass'), { target: { value: '100' } });
    submit(dialog);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Wagon "MNR-000009" is not registered on RAIL-2026-00007.', 'error'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('with no wagons registered there is nothing to weigh, and it says so', async () => {
    const { dialog } = await openModal(h.consignment({ wagons: [] }));
    expect(dialog.textContent).toContain('has no wagons registered, so there is nothing to weigh');
    expect(within(dialog).queryByRole('button', { name: 'Record reading' })).toBeNull();
  });
});
