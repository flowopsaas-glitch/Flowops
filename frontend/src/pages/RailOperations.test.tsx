import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => {
  // ToastProvider's real showToast is a stable useCallback. A mock that returns a NEW function on every render would make
  // RailOperations.load (which depends on it) change identity each render and reload forever — so keep it stable.
  const showToast = vi.fn();
  const consignment = (over: Record<string, unknown> = {}) => ({
    id: 'c1', consignmentNumber: 'RAIL-2026-00007', status: 'LOADING', commodity: 'Petrol', corridor: 'Ore', serviceRef: 'SVC-77', plannedDeparture: '2026-10-05T04:00:00.000Z',
    createdAt: '2026-10-01T00:00:00Z', tonnage: 1200, ...over,
  });
  return {
    showToast,
    getRailOverview: vi.fn(),
    listConsignments: vi.fn(),
    getConsignmentApi: vi.fn(),
    auth: { user: { role: 'MANAGER', email: 'm@x.co' } as Record<string, unknown> },
    consignment,
    state: {
      rows: [] as unknown[], full: consignment() as Record<string, unknown>,
      scan: null as unknown,
      readiness: { required: true, ready: false, dgWagons: 1, missing: [], invalid: [], summary: 'consignment: missing Placard reference', blocksDeparture: true, consignmentNumber: 'RAIL-2026-00007' } as Record<string, unknown>,
    },
  };
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: unknown }) => <div data-testid="map">{children as never}</div>,
  TileLayer: () => null, Polyline: () => null, CircleMarker: () => null, Tooltip: () => null,
}));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('../contexts/auth-context', () => ({ useAuth: () => h.auth }));
vi.mock('../components/toast-context', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('../api/railApi', () => ({
  getRailOverview: h.getRailOverview,
  listConsignments: h.listConsignments,
  getConsignment: h.getConsignmentApi,
  advanceConsignment: vi.fn(), updateConsignment: vi.fn(),
}));
vi.mock('../api/railChangeApi', () => ({
  getPossessionConflicts: vi.fn(async () => { if (h.state.scan === 'fail') throw new Error('not entitled'); return h.state.scan; }),
  getDangerousGoods: vi.fn(async () => h.state.readiness),
}));
vi.mock('./rail/SlotCompliancePanel', () => ({
  default: ({ canWrite, canSign }: { canWrite: boolean; canSign: boolean }) => <div data-testid="slots-panel">{`write=${canWrite} sign=${canSign}`}</div>,
}));
vi.mock('./rail/SlotOptimizerPanel', () => ({
  default: ({ canWrite }: { canWrite: boolean }) => <div data-testid="optimizer-panel">{`write=${canWrite}`}</div>,
}));
vi.mock('./rail/TrainManifestPanel', () => ({
  default: ({ canWrite, canSign }: { canWrite: boolean; canSign: boolean }) => <div data-testid="manifests-panel">{`write=${canWrite} sign=${canSign}`}</div>,
}));
vi.mock('./rail/LiveTrackingPanel', () => ({
  default: ({ canWrite }: { canWrite: boolean }) => <div data-testid="tracking-panel">{`write=${canWrite}`}</div>,
}));
vi.mock('./rail/ChangesPossessionsPanel', () => ({
  default: ({ canWrite, canSign }: { canWrite: boolean; canSign: boolean }) => <div data-testid="changes-panel">{`write=${canWrite} sign=${canSign}`}</div>,
}));
vi.mock('./rail/TariffPanel', () => ({
  default: ({ canWrite }: { canWrite: boolean }) => <div data-testid="tariffs-panel">{`write=${canWrite}`}</div>,
}));
// The real section is tested in rail/WeighbridgeSection.test.tsx; here we only check how the drawer hosts it.
vi.mock('./rail/WeighbridgeSection', () => ({
  default: ({ consignment, canWrite, onChanged }: { consignment: { id: string; holdStatus?: string }; canWrite: boolean; onChanged: () => void }) => (
    <div data-testid="weighbridge-stub">{`consignment=${consignment.id} write=${canWrite} hold=${consignment.holdStatus ?? 'none'}`}<button onClick={onChanged}>stub-weighed</button></div>
  ),
}));
// The real modal is tested in rail/ChangeRequestModal.test.tsx; here we only check how the drawer opens it.
vi.mock('./rail/ChangeRequestModal', () => ({
  default: ({ context, onClose, onCreated }: { context: unknown; onClose: () => void; onCreated: (r: unknown) => void }) => (
    <div role="dialog" aria-label="change-modal-stub">
      <pre data-testid="change-context">{JSON.stringify(context)}</pre>
      <button onClick={() => onCreated({})}>stub-created</button>
      <button onClick={onClose}>stub-close</button>
    </div>
  ),
}));

import { getConsignment, getRailOverview, listConsignments } from '../api/railApi';
import RailOperations from './RailOperations';

const open = async (role: string) => {
  h.auth.user = { role, email: 'u@x.co' };
  render(<MemoryRouter><RailOperations /></MemoryRouter>);
  const tabs = await screen.findByRole('group', { name: /Rail operations sections/ });
  // let the first load finish, so no state update lands after the test's assertions
  const table = await screen.findByRole('table');
  await waitFor(() => expect(table.querySelector('.animate-spin')).toBeNull());
  return tabs;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.getRailOverview.mockResolvedValue({ generatedAt: '', metrics: { activeConsignments: 0, inTransit: 0, atInterchange: 0, wagonsInTransit: 0, totalWagons: 0, tonnageMoved: 0, tonnagePlanned: 0, onTimePct: null, avgTransitHours: null, avgInterchangeDwellHours: null, atRisk: 0 }, byCorridor: [] });
  h.listConsignments.mockImplementation(async () => h.state.rows);
  h.getConsignmentApi.mockImplementation(async () => h.state.full);
  h.state.rows = [];
  h.state.full = h.consignment();
  h.state.scan = null;
  h.state.readiness = { required: true, ready: false, dgWagons: 1, missing: [], invalid: [], summary: 'consignment: missing Placard reference', blocksDeparture: true, consignmentNumber: 'RAIL-2026-00007' };
});

describe('RailOperations — tabs', () => {
  it('shows a consignment API failure instead of a false empty list and retries', async () => {
    vi.mocked(listConsignments).mockRejectedValueOnce(new Error('consignment API unavailable'));
    await open('MANAGER');
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load rail consignments: consignment API unavailable/);
    expect(screen.queryByText('No rail consignments yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('No rail consignments yet.')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps overview and conflict-scan failures distinct from the loaded consignment list', async () => {
    vi.mocked(getRailOverview).mockRejectedValueOnce(new Error('overview API unavailable'));
    h.state.scan = 'fail';
    await open('MANAGER');
    expect(screen.getByRole('alert')).toHaveTextContent(/Rail overview metrics unavailable: overview API unavailable/);
    expect(screen.getByRole('note')).toHaveTextContent(/Possession conflict check unavailable.*No all-clear status is implied/);
    expect(screen.queryByText('No rail consignments yet.')).toBeTruthy();
  });

  it('has a labelled section control group with eight buttons and starts on Consignments', async () => {
    const tabs = await open('MANAGER');
    expect(within(tabs).getAllByRole('button').map((t) => t.textContent)).toEqual(['Consignments', 'Slot Applications & Compliance', 'Schedule Optimizer', 'Train Manifests', 'Live Tracking', 'Changes & Possessions', 'Tariffs & Weighbridge', 'Truck Appointments']);
    expect(screen.getByRole('button', { name: 'Consignments' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Slot Applications & Compliance' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(screen.getByRole('combobox', { name: 'Filter rail consignments by status' })).getByRole('option', { name: 'Cancelled' })).toBeTruthy();
    expect(screen.queryByTestId('slots-panel')).toBeNull();
    expect(screen.queryByTestId('optimizer-panel')).toBeNull();
    expect(screen.queryByTestId('manifests-panel')).toBeNull();
    expect(screen.queryByTestId('tracking-panel')).toBeNull();
    expect(screen.queryByTestId('changes-panel')).toBeNull();
    expect(screen.queryByTestId('tariffs-panel')).toBeNull();
    expect(await screen.findByText(/Corridor Breakdown|Search consignment|SADC Rail Corridors/)).toBeTruthy();
  });

  it('switching tabs shows the panel and hides the consignment view', async () => {
    await open('MANAGER');
    fireEvent.click(screen.getByRole('button', { name: 'Slot Applications & Compliance' }));
    expect(screen.getByTestId('slots-panel')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Search consignment/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Optimizer' }));
    expect(screen.getByTestId('optimizer-panel')).toBeTruthy();
    expect(screen.queryByTestId('slots-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Train Manifests' }));
    expect(screen.getByTestId('manifests-panel')).toBeTruthy();
    expect(screen.queryByTestId('optimizer-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Live Tracking' }));
    expect(screen.getByTestId('tracking-panel')).toBeTruthy();
    expect(screen.queryByTestId('manifests-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Changes & Possessions' }));
    expect(screen.getByTestId('changes-panel')).toBeTruthy();
    expect(screen.queryByTestId('tracking-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tariffs & Weighbridge' }));
    expect(screen.getByTestId('tariffs-panel')).toBeTruthy();
    expect(screen.queryByTestId('changes-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Consignments' }));
    expect(screen.queryByTestId('slots-panel')).toBeNull();
    expect(screen.queryByTestId('changes-panel')).toBeNull();
    expect(screen.queryByTestId('tariffs-panel')).toBeNull();
    expect(screen.getByPlaceholderText(/Search consignment/)).toBeTruthy();
  });

  it.each([
    ['MANAGER', 'write=true sign=true'],
    ['DISPATCH', 'write=true sign=false'],
    ['VIEWER', 'write=false sign=false'],
  ])('passes the right capabilities for %s to every panel', async (role, expected) => {
    await open(role);
    fireEvent.click(screen.getByRole('button', { name: 'Slot Applications & Compliance' }));
    expect(screen.getByTestId('slots-panel').textContent).toBe(expected);
    fireEvent.click(screen.getByRole('button', { name: 'Changes & Possessions' }));
    expect(screen.getByTestId('changes-panel').textContent).toBe(expected);
    // the tariff panel needs only the write capability (no formal act in it is signatory-only)
    fireEvent.click(screen.getByRole('button', { name: 'Tariffs & Weighbridge' }));
    expect(screen.getByTestId('tariffs-panel').textContent).toBe(expected.split(' ')[0]);
  });
});

describe('RailOperations — possession-conflict banner', () => {
  const clash = {
    conflicts: [{ windowId: 'p1', windowTitle: 'Ore line re-sleepering', windowKind: 'AD_HOC_EMERGENCY', corridorCode: 'COR-ORE', consignmentId: 'c1', consignmentNumber: 'RAIL-2026-00007', overlapStart: '2026-10-05T00:00:00Z', overlapEnd: '2026-10-05T12:00:00Z', overlapHours: 12, severity: 'HARD' }],
    unscheduled: [], unresolved: [], consignmentsChecked: 1,
  };

  it('shows the clash at the top of the Consignments tab, and its button takes the user to the possession windows', async () => {
    h.state.scan = clash;
    await open('MANAGER');
    const banner = await screen.findByTestId('possession-banner');
    expect(banner.textContent).toMatch(/Possession conflict — 1 consignment overlaps 1 possession window/);
    expect(banner.textContent).toMatch(/RAIL-2026-00007/);
    fireEvent.click(within(banner).getByRole('button', { name: 'View possession windows' }));
    expect(screen.getByTestId('changes-panel')).toBeTruthy();
  });

  it('no banner when nothing clashes', async () => {
    h.state.scan = { conflicts: [], unscheduled: [], unresolved: [], consignmentsChecked: 4 };
    await open('MANAGER');
    await screen.findByPlaceholderText(/Search consignment/);
    expect(screen.queryByTestId('possession-banner')).toBeNull();
  });

  it('if the scan cannot be loaded (e.g. not entitled) the page still works and shows no banner — it does not pretend to be "all clear" either', async () => {
    h.state.scan = 'fail';
    await open('MANAGER');
    expect(await screen.findByPlaceholderText(/Search consignment/)).toBeTruthy();
    expect(screen.queryByTestId('possession-banner')).toBeNull();
    expect(screen.queryByText(/all clear/i)).toBeNull();
  });

  it('the banner is not shown on the other tabs', async () => {
    h.state.scan = clash;
    await open('MANAGER');
    await screen.findByTestId('possession-banner');
    fireEvent.click(screen.getByRole('button', { name: 'Slot Applications & Compliance' }));
    expect(screen.queryByTestId('possession-banner')).toBeNull();
  });
});

describe('RailOperations — dangerous-goods badges', () => {
  it('the list has a Dangerous goods column: red with the gap count, green when ready, a dash when none', async () => {
    h.state.rows = [
      h.consignment({ id: 'a', consignmentNumber: 'A-1', dg: { required: true, ready: false, problems: 2 } }),
      h.consignment({ id: 'b', consignmentNumber: 'B-1', dg: { required: true, ready: true, problems: 0 } }),
      h.consignment({ id: 'c', consignmentNumber: 'C-1', dg: { required: false, ready: true, problems: 0 } }),
    ];
    await open('MANAGER');
    expect(await screen.findByRole('columnheader', { name: 'Dangerous goods' })).toBeTruthy();
    const rowOf = (n: string) => within(screen.getByText(n).closest('tr') as HTMLElement);
    expect(rowOf('A-1').getByText('DG · 2 gaps').className).toMatch(/rose/);
    expect(rowOf('B-1').getByText('DG ready').className).toMatch(/emerald/);
    expect(rowOf('C-1').getByLabelText('No dangerous goods')).toBeTruthy();
  });
});

describe('RailOperations — consignment drawer', () => {
  const openDrawer = async (role = 'MANAGER') => {
    h.state.rows = [h.consignment({ dg: { required: true, ready: false, problems: 1 } })];
    await open(role);
    // The visible action is a native button, so it is keyboard-operable and has an explicit purpose.
    fireEvent.click(await within(await screen.findByRole('table')).findByRole('button', { name: 'Open consignment RAIL-2026-00007' }));
    await screen.findByTestId('dg-section');
  };

  it('shows the dangerous-goods section with the departure-blocked banner', async () => {
    await openDrawer();
    expect(await screen.findByText('Departure is blocked — dangerous-goods details are incomplete')).toBeTruthy();
  });

  it('shows a flagged wagon\'s UN number and class in the wagon register', async () => {
    h.state.full = h.consignment({ wagons: [
      { id: 'w1', wagonNumber: 'TANK-1', type: 'TANK', loadedTonnes: 60, isDangerousGoods: true, unNumber: 'UN1203', imdgClass: '3' },
      { id: 'w2', wagonNumber: 'FLAT-1', type: 'FLAT', loadedTonnes: 40, isDangerousGoods: false },
    ] });
    await openDrawer();
    expect(screen.getByText('UN1203 · class 3')).toBeTruthy();
    expect(within(screen.getByText('FLAT-1').closest('tr') as HTMLElement).queryByText(/UN|DG/)).toBeNull();
  });

  it('shows the possession banner for THIS consignment only', async () => {
    h.state.scan = {
      conflicts: [
        { windowId: 'p1', windowTitle: 'Window for this one', windowKind: 'AD_HOC_EMERGENCY', corridorCode: 'COR-ORE', consignmentId: 'c1', consignmentNumber: 'RAIL-2026-00007', overlapStart: '2026-10-05T00:00:00Z', overlapEnd: '2026-10-05T12:00:00Z', overlapHours: 12, severity: 'HARD' },
        { windowId: 'p2', windowTitle: 'Window for another', windowKind: 'AD_HOC_EMERGENCY', corridorCode: 'COR-ORE', consignmentId: 'c9', consignmentNumber: 'RAIL-2026-00099', overlapStart: '2026-10-05T00:00:00Z', overlapEnd: '2026-10-05T12:00:00Z', overlapHours: 8, severity: 'HARD' },
      ], unscheduled: [], unresolved: [], consignmentsChecked: 2,
    };
    await openDrawer();
    const banners = screen.getAllByTestId('possession-banner');
    const drawerBanner = banners.find((b) => /this consignment overlaps/.test(b.textContent ?? ''))!;
    expect(drawerBanner.textContent).toMatch(/Window for this one/);
    expect(drawerBanner.textContent).not.toMatch(/Window for another/);
  });

  it('a writer sees Cancel / reschedule and it opens the modal for this consignment, pre-filled', async () => {
    await openDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel / reschedule' }));
    expect(JSON.parse(screen.getByTestId('change-context').textContent!)).toEqual({ consignmentId: 'c1', trainSlotRef: 'SVC-77', originalDeparture: '2026-10-05T04:00:00.000Z' });
  });

  it('with no service reference the consignment number is the train reference', async () => {
    h.state.full = h.consignment({ serviceRef: null });
    await openDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel / reschedule' }));
    expect(JSON.parse(screen.getByTestId('change-context').textContent!)).toMatchObject({ trainSlotRef: 'RAIL-2026-00007' });
  });

  it('a read-only VIEWER sees neither Cancel / reschedule nor the DG edit form', async () => {
    await openDrawer('VIEWER');
    expect(screen.queryByRole('button', { name: 'Cancel / reschedule' })).toBeNull();
    expect(screen.queryByTestId('dg-flag')).toBeNull();
    expect(screen.queryByRole('button', { name: /Save dangerous-goods details/ })).toBeNull();
  });

  it.each(['CANCELLED', 'COMPLETED'])('a %s consignment cannot be cancelled / rescheduled again', async (status) => {
    h.state.full = h.consignment({ status });
    await openDrawer();
    expect(screen.queryByRole('button', { name: 'Cancel / reschedule' })).toBeNull();
  });

  it('after a request is logged the modal closes and the consignment is re-read', async () => {
    await openDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel / reschedule' }));
    const reads = vi.mocked(getConsignment).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'stub-created' }));
    expect(screen.queryByRole('dialog', { name: 'change-modal-stub' })).toBeNull();
    await waitFor(() => expect(vi.mocked(getConsignment).mock.calls.length).toBeGreaterThan(reads));
  });
});

describe('RailOperations — weighbridge hold (Wave 4)', () => {
  const held = { holdStatus: 'HOLD_FOR_LOAD_ADJUSTMENT', holdReason: 'Overloaded: MNR-000001 (4 t over). Reduce the load and re-weigh the wagon within its limit.' };
  const openDrawer = async (role: string, over: Record<string, unknown> = {}) => {
    const row = h.consignment({ id: 'c1', ...over });
    h.state.rows = [row];
    h.state.full = row;
    await open(role);
    fireEvent.click(await screen.findByText('RAIL-2026-00007'));
    await screen.findByTestId('weighbridge-stub');
  };

  it('a held consignment carries a HOLD pill in the list (with the reason on hover); an unheld one does not', async () => {
    h.state.rows = [h.consignment({ id: 'a', consignmentNumber: 'RAIL-HELD', ...held }), h.consignment({ id: 'b', consignmentNumber: 'RAIL-FREE', holdStatus: 'NONE' })];
    await open('MANAGER');
    const rowOf = (n: string) => screen.getByText(n).closest('tr') as HTMLElement;
    const pill = within(rowOf('RAIL-HELD')).getByText('HOLD');
    expect(pill.className).toMatch(/rose/);
    expect(pill.getAttribute('title')).toMatch(/Overloaded: MNR-000001/);
    expect(within(rowOf('RAIL-FREE')).queryByText('HOLD')).toBeNull();
  });

  it('a consignment with no hold information at all (an older row) shows no pill', async () => {
    h.state.rows = [h.consignment({ id: 'a', consignmentNumber: 'RAIL-OLD' })];
    await open('MANAGER');
    expect(within(screen.getByText('RAIL-OLD').closest('tr') as HTMLElement).queryByText('HOLD')).toBeNull();
  });

  it('the drawer shows ON HOLD beside the status, and hosts the weighbridge section for this consignment', async () => {
    await openDrawer('MANAGER', held);
    expect(screen.getByText('ON HOLD').className).toMatch(/rose/);
    expect(screen.getByTestId('weighbridge-stub').textContent).toContain('consignment=c1 write=true hold=HOLD_FOR_LOAD_ADJUSTMENT');
  });

  it('no ON HOLD chip for a consignment that is not held', async () => {
    await openDrawer('MANAGER', { holdStatus: 'NONE' });
    expect(screen.queryByText('ON HOLD')).toBeNull();
  });

  it('a read-only user is told nothing they can act on: the section is hosted without write access', async () => {
    await openDrawer('VIEWER', held);
    expect(screen.getByTestId('weighbridge-stub').textContent).toContain('write=false');
    expect(screen.getByText('ON HOLD')).toBeTruthy(); // reading the hold is allowed
  });

  it('after a reading is recorded the consignment is re-read, so the hold chip follows the server', async () => {
    await openDrawer('MANAGER', held);
    vi.mocked(getConsignment).mockClear();
    h.state.full = h.consignment({ id: 'c1', holdStatus: 'NONE', holdReason: null });
    fireEvent.click(screen.getByText('stub-weighed'));
    await waitFor(() => expect(getConsignment).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(screen.queryByText('ON HOLD')).toBeNull());
  });
});
