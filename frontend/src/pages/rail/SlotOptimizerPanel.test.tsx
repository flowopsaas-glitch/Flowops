import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import SlotOptimizerPanel from './SlotOptimizerPanel';

/**
 * Schedule Optimizer panel — Phase 2 smoke: the optimizer PROPOSES and a human
 * APPLIES. Verifies capacity entry, proposal rendering, decision selection and
 * the apply call shape (rejects carry a reason).
 */

const h = vi.hoisted(() => ({
  listSlotApplications: vi.fn(),
  getCorridors: vi.fn(),
  runOptimizer: vi.fn(),
  applyOptimizer: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../api/railSlotApi', () => ({
  listSlotApplications: h.listSlotApplications,
  getCorridors: h.getCorridors,
  runOptimizer: h.runOptimizer,
  applyOptimizer: h.applyOptimizer,
  OPTIMIZER_DECISION_LABEL: { ALLOCATE: 'Allocate', DEFER: 'Defer', REJECT: 'Reject' },
}));
vi.mock('../../components/toast-context', () => ({
  useToast: () => ({ showToast: h.showToast }),
}));

const PENDING_APP = {
  id: 'a1', applicationNumber: 'SA-2026-00001', status: 'SUBMITTED', corridorCode: 'COR-ORE',
  requestedFrom: '2026-11-01', requestedUntil: '2027-03-31', trainsPerWeek: 3, isDangerousGoods: false,
};

beforeEach(() => {
  h.listSlotApplications.mockResolvedValue([PENDING_APP]);
  h.getCorridors.mockResolvedValue([{ code: 'COR-ORE', name: 'Ore' }]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SlotOptimizerPanel', () => {
  it('does not report no pending applications when the API fails', async () => {
    h.listSlotApplications.mockRejectedValueOnce(new Error('application API unavailable'));
    render(<SlotOptimizerPanel canWrite />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Schedule optimizer data unavailable: application API unavailable/);
    expect(screen.queryByText(/no pending applications/i)).toBeNull();
  });

  it('clears previous proposals before refresh and does not expose them after a failed reload', async () => {
    h.runOptimizer.mockResolvedValue({
      generatedAt: '2026-10-10T12:00:00Z',
      notes: [],
      proposals: [{
        applicationId: 'a1', applicationNumber: 'SA-2026-00001', corridorCode: 'COR-ORE',
        decision: 'ALLOCATE', score: 150, weeklyDemand: 3, reasons: ['Fits declared capacity.'], warnings: [],
      }],
      utilization: [],
    });
    render(<SlotOptimizerPanel canWrite />);
    await waitFor(() => expect(screen.getByLabelText(/weekly capacity for ore/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/weekly capacity for ore/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /run optimizer/i }));
    expect(await screen.findByText('SA-2026-00001')).toBeTruthy();

    h.listSlotApplications.mockRejectedValueOnce(new Error('application refresh unavailable'));
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Schedule optimizer data unavailable: application refresh unavailable/);
    expect(screen.queryByText('SA-2026-00001')).toBeNull();
    expect(screen.queryByRole('button', { name: /apply .* selected decision/i })).toBeNull();
  });

  it('surfaces an optimizer request failure in the page', async () => {
    h.runOptimizer.mockRejectedValueOnce(new Error('optimizer service unavailable'));
    render(<SlotOptimizerPanel canWrite />);
    await waitFor(() => expect(screen.getByLabelText(/weekly capacity for ore/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/weekly capacity for ore/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /run optimizer/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Optimizer run failed: optimizer service unavailable/);
    expect(screen.queryByRole('heading', { name: 'Proposals' })).toBeNull();
  });

  it('shows the empty state when nothing is pending', async () => {
    h.listSlotApplications.mockResolvedValue([]);
    render(<SlotOptimizerPanel canWrite />);
    await waitFor(() => expect(screen.getByText(/no pending applications/i)).toBeTruthy());
  });

  it('offers capacity entry per corridor and refuses to run without it', async () => {
    render(<SlotOptimizerPanel canWrite />);
    await waitFor(() => expect(screen.getByText(/Ore — trains \/ week/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /run optimizer/i }));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining('capacity'), 'error'));
    expect(h.runOptimizer).not.toHaveBeenCalled();
  });

  it('runs the optimizer, renders proposals, and applies selected decisions with a reject reason', async () => {
    h.runOptimizer.mockResolvedValue({
      generatedAt: '2026-10-10T12:00:00Z',
      notes: ['Corridor COR-ORE is over its declared capacity'],
      proposals: [
        {
          applicationId: 'a1', applicationNumber: 'SA-2026-00001', corridorCode: 'COR-ORE',
          decision: 'ALLOCATE', score: 150, weeklyDemand: 3,
          reasons: ['Fits declared capacity (3 of 5 trains/week on COR-ORE).'], warnings: [],
        },
        {
          applicationId: 'a2', applicationNumber: 'SA-2026-00002', corridorCode: 'COR-ORE',
          decision: 'REJECT', score: 0, weeklyDemand: 2,
          reasons: ['Corridor envelope check is INCOMPATIBLE (gauge / axle-load / profile limit violated).'], warnings: [],
        },
        {
          applicationId: 'a3', applicationNumber: 'SA-2026-00003', corridorCode: 'COR-ORE',
          decision: 'DEFER', score: 150, weeklyDemand: 2,
          reasons: ['Corridor COR-ORE capacity is 5 trains/week — 3 already allocated/proposed and this request needs 2.'], warnings: [],
        },
      ],
      utilization: [{
        corridorCode: 'COR-ORE', capacityPerWeek: 5, allocatedPerWeek: 0,
        proposedPerWeek: 3, deferredPerWeek: 2, remainingPerWeek: 2,
      }],
    });
    h.applyOptimizer.mockResolvedValue({ applied: 2, failed: 0, results: [] });

    render(<SlotOptimizerPanel canWrite />);
    await waitFor(() => expect(screen.getByText(/Ore — trains \/ week/i)).toBeTruthy());
    const input = screen.getByLabelText(/weekly capacity for ore/i);
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /run optimizer/i }));

    await waitFor(() => expect(screen.getByText('SA-2026-00001')).toBeTruthy());
    expect(screen.getByText(/INCOMPATIBLE/)).toBeTruthy(); // reject reason is shown verbatim
    expect(screen.getByText(/over its declared capacity/)).toBeTruthy(); // capacity notes render in the banner

    // ALLOCATE + REJECT are pre-selected; DEFER is not selectable.
    fireEvent.click(screen.getByRole('button', { name: /apply 2 selected decision/i }));
    await waitFor(() => expect(h.applyOptimizer).toHaveBeenCalledTimes(1));
    const sent = h.applyOptimizer.mock.calls[0][0];
    expect(sent).toHaveLength(2);
    const reject = sent.find((d: { action: string }) => d.action === 'REJECT');
    expect(reject.reason).toContain('INCOMPATIBLE');
    const allocate = sent.find((d: { action: string }) => d.action === 'ALLOCATE');
    expect(allocate.reason).toBeUndefined();
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining('Applied 2'), 'success'));
  });

  it('renders the utilisation table with declared vs allocated figures', async () => {
    h.runOptimizer.mockResolvedValue({
      generatedAt: '2026-10-10T12:00:00Z', notes: [],
      proposals: [],
      utilization: [{
        corridorCode: 'COR-ORE', capacityPerWeek: 5, allocatedPerWeek: 4,
        proposedPerWeek: 1, deferredPerWeek: 0, remainingPerWeek: 0,
      }],
    });
    render(<SlotOptimizerPanel canWrite={false} />);
    await waitFor(() => expect(screen.getByLabelText(/weekly capacity for ore/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/weekly capacity for ore/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /run optimizer/i }));
    await waitFor(() => expect(screen.getByText('Corridor utilisation')).toBeTruthy());
    expect(screen.getByText(/Declared capacity vs allocated/)).toBeTruthy();
    expect(screen.getAllByText('4').length).toBeGreaterThan(0);
  });
});
