import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CorridorCapacityPanel from './CorridorCapacityPanel';

/**
 * Slot applications ask for trainsPerWeek and run through to ALLOCATED, but
 * nothing ever computed how much a corridor could carry — the only signal a
 * corridor was over-committed was a free-text note written by whoever noticed.
 *
 * These tests are mostly about the READ path and about one boundary: the check
 * is ADVISORY. An operator who is over-subscribed must still be told the truth,
 * and must still be able to see it — this panel never refuses anything.
 */

const {
  mockGetCorridorCapacity,
  mockPreview,
  mockUpsert,
  mockDelete,
} = vi.hoisted(() => ({
  mockGetCorridorCapacity: vi.fn(),
  mockPreview: vi.fn(),
  mockUpsert: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../../api/railSlotApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/railSlotApi')>('../../api/railSlotApi');
  return {
    ...actual,
    getCorridorCapacity: mockGetCorridorCapacity,
    previewCorridorCapacity: mockPreview,
    upsertCorridorCapacity: mockUpsert,
    deleteCorridorCapacity: mockDelete,
  };
});

const check = (over: Record<string, unknown> = {}) => ({
  status: 'TIGHT' as const,
  corridorCode: 'COR-ORE',
  from: '2026-11-08T00:00:00.000Z',
  until: '2027-11-08T00:00:00.000Z',
  declaredPathsPerDay: 13,
  theoreticalPathsPerDay: 20,
  capacityFactor: 0.65,
  dataStatus: 'SOURCE_PENDING' as const,
  sourceRef: null,
  committedPathsPerDay: 8,
  pendingPathsPerDay: 4,
  thisApplicationPathsPerDay: 0,
  demandPathsPerDay: 12,
  headroomPathsPerDay: 1,
  utilisation: 0.923,
  statements: [],
  possessions: [],
  contributing: [
    { applicationNumber: 'SA-2026-001', status: 'ALLOCATED', pathsPerDay: 8 },
    { applicationNumber: 'SA-2026-002', status: 'SUBMITTED', pathsPerDay: 4 },
  ],
  reason: null,
  ...over,
});

const CORRIDORS = [{ code: 'COR-ORE', name: 'Ore' }];

describe('CorridorCapacityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCorridorCapacity.mockResolvedValue([]);
    mockPreview.mockResolvedValue(check());
    mockUpsert.mockResolvedValue({ id: 'cap-1' });
    mockDelete.mockResolvedValue({ deleted: true });
  });

  it('asks for a corridor before showing anything', async () => {
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    expect(screen.getByText(/Choose a corridor to see how much of it you already hold/)).toBeTruthy();
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('displays the headroom, what is granted and what is merely applied for', async () => {
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    fireEvent.change(screen.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });

    await waitFor(() => expect(screen.getByTestId('declared')).toBeTruthy());
    expect(screen.getByTestId('declared').textContent).toContain('13');
    expect(screen.getByTestId('committed').textContent).toContain('8');
    expect(screen.getByTestId('pending').textContent).toContain('4');
    expect(screen.getByTestId('headroom').textContent).toContain('1');
    // The verdict and the arithmetic behind it are both on screen.
    expect(screen.getByText('Tight')).toBeTruthy();
    expect(screen.getByText('92% of practical capacity')).toBeTruthy();
    expect(screen.getByText(/20 theoretical/)).toBeTruthy();
  });

  it('names the applications making up the demand', async () => {
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    fireEvent.change(screen.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });

    await waitFor(() => expect(screen.getByText('SA-2026-001')).toBeTruthy());
    expect(screen.getByText('SA-2026-002')).toBeTruthy();
    expect(screen.getByText('ALLOCATED')).toBeTruthy();
    expect(screen.getByText('SUBMITTED')).toBeTruthy();
  });

  it('tells the truth when over-subscribed, and says so without refusing anything', async () => {
    mockPreview.mockResolvedValue(
      check({ status: 'OVERSUBSCRIBED', headroomPathsPerDay: -4, demandPathsPerDay: 17, utilisation: 1.31 }),
    );
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    fireEvent.change(screen.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });

    await waitFor(() => expect(screen.getByText('Over-subscribed')).toBeTruthy());
    expect(screen.getByText('131% of practical capacity')).toBeTruthy();
    // Negative headroom is shown, not hidden behind a clamped zero.
    expect(screen.getByTestId('headroom').textContent).toContain('-4');
  });

  it('explains UNKNOWN instead of showing a number nobody can stand behind', async () => {
    mockPreview.mockResolvedValue(
      check({
        status: 'UNKNOWN', declaredPathsPerDay: null, headroomPathsPerDay: null, utilisation: null,
        theoreticalPathsPerDay: undefined, capacityFactor: undefined,
        reason: 'No capacity statement covers this corridor for that period, so no headroom can be stated. Add one to get a number.',
      }),
    );
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    fireEvent.change(screen.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });

    await waitFor(() => expect(screen.getByText('No capacity stated')).toBeTruthy());
    expect(screen.getByText(/No capacity statement covers this corridor/)).toBeTruthy();
    expect(screen.getByTestId('headroom').textContent).toBe('—');
  });

  it('warns when the stated capacity has no source', async () => {
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    fireEvent.change(screen.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });

    await waitFor(() => expect(screen.getByText(/Unsourced figure/)).toBeTruthy());
  });

  it('reports possessions for judgement and does not quietly reduce the headroom', async () => {
    mockPreview.mockResolvedValue(
      check({
        status: 'OK',
        possessions: [{ id: 'p1', title: 'Sishen–Saldanha relaying', kind: 'ANNUAL_PLAN', startsAt: '2027-02-01T00:00:00.000Z', endsAt: '2027-02-21T00:00:00.000Z' }],
      }),
    );
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    fireEvent.change(screen.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });

    await waitFor(() => expect(screen.getByText(/Sishen–Saldanha relaying/)).toBeTruthy());
    expect(screen.getByText(/not deducted/)).toBeTruthy();
    // Neither the ceiling nor the headroom moves because of a possession —
    // pin both, and pin headroom as a number rather than a sign, or a silent
    // subtraction would pass.
    expect(screen.getByTestId('declared').textContent).toContain('13');
    expect(screen.getByTestId('headroom').textContent).toContain('1');
  });

  it('saves a statement with the practical figure left to the server', async () => {
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    fireEvent.change(screen.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });
    await waitFor(() => expect(screen.getByTestId('declared')).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Theoretical paths\/day/), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-01-01' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '2027-12-31' } });
    fireEvent.click(screen.getByText('Save statement'));

    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    const dto = mockUpsert.mock.calls[0][0];
    expect(dto.corridorCode).toBe('COR-ORE');
    expect(dto.theoreticalPathsPerDay).toBe(20);
    expect(dto.capacityFactor).toBe(0.65);
    // Never computed in the browser.
    expect(dto).not.toHaveProperty('practicalPathsPerDay');
  });

  it('will not save a statement without a theoretical figure or a period', async () => {
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    fireEvent.change(screen.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });
    await waitFor(() => expect(screen.getByTestId('declared')).toBeTruthy());

    const save = screen.getByText('Save statement').closest('button') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('lists existing statements with their derived practical figure', async () => {
    mockGetCorridorCapacity.mockResolvedValue([
      { id: 'cap-1', corridorCode: 'COR-ORE', validFrom: '2027-01-01T00:00:00.000Z', validUntil: '2027-12-31T00:00:00.000Z',
        theoreticalPathsPerDay: 20, capacityFactor: 0.65, practicalPathsPerDay: 13, unit: 'PATHS_PER_DAY',
        dataStatus: 'SOURCE_PENDING', sourceRef: null, notes: null, createdByEmail: null, createdAt: '2026-11-08T00:00:00.000Z' },
    ] as never);
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    fireEvent.change(screen.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });

    // "20 theoretical" also appears in the summary above, so scope to the list.
    await waitFor(() => expect(screen.getByText(/Capacity statements for COR-ORE/)).toBeTruthy());
    const list = screen.getByText(/Capacity statements for COR-ORE/).parentElement;
    expect(list?.textContent).toContain('20 theoretical');
    expect(list?.textContent).toContain('13');
    expect(screen.getByText('Unsourced')).toBeTruthy();
  });

  it('can remove a statement', async () => {
    mockGetCorridorCapacity.mockResolvedValue([
      { id: 'cap-1', corridorCode: 'COR-ORE', validFrom: '2027-01-01T00:00:00.000Z', validUntil: '2027-12-31T00:00:00.000Z',
        theoreticalPathsPerDay: 20, capacityFactor: 0.65, practicalPathsPerDay: 13, unit: 'PATHS_PER_DAY',
        dataStatus: 'VERIFIED', sourceRef: 'Annexure 33b', notes: null, createdByEmail: null, createdAt: '2026-11-08T00:00:00.000Z' },
    ] as never);
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    fireEvent.change(screen.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });

    await waitFor(() => expect(screen.getByText('Remove')).toBeTruthy());
    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('cap-1'));
  });

  it('surfaces a load failure rather than an empty headroom', async () => {
    mockPreview.mockRejectedValue(new Error('Unknown corridor "COR-NOPE".'));
    render(<CorridorCapacityPanel corridors={CORRIDORS} />);
    fireEvent.change(screen.getByLabelText('Corridor'), { target: { value: 'COR-ORE' } });

    await waitFor(() => expect(screen.getByText(/Unknown corridor/)).toBeTruthy());
  });
});
