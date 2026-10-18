import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import React from 'react';
import TrainManifestPanel from './TrainManifestPanel';

/**
 * Digital Train Manifest panel — the departure document workflow:
 * snapshot from a consignment, issue (signatory + freeze), depart/arrive/close,
 * cancel with a reason, and the print view.
 */

const h = vi.hoisted(() => ({
  listTrainManifests: vi.fn(),
  getTrainManifest: vi.fn(),
  createTrainManifest: vi.fn(),
  updateTrainManifest: vi.fn(),
  issueTrainManifest: vi.fn(),
  amendTrainManifest: vi.fn(),
  departTrainManifest: vi.fn(),
  arriveTrainManifest: vi.fn(),
  closeTrainManifest: vi.fn(),
  cancelTrainManifest: vi.fn(),
  listConsignments: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../api/railManifestApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/railManifestApi')>('../../api/railManifestApi');
  return {
    ...actual,
    listTrainManifests: h.listTrainManifests,
    getTrainManifest: h.getTrainManifest,
    createTrainManifest: h.createTrainManifest,
    updateTrainManifest: h.updateTrainManifest,
    issueTrainManifest: h.issueTrainManifest,
    amendTrainManifest: h.amendTrainManifest,
    departTrainManifest: h.departTrainManifest,
    arriveTrainManifest: h.arriveTrainManifest,
    closeTrainManifest: h.closeTrainManifest,
    cancelTrainManifest: h.cancelTrainManifest,
  };
});
vi.mock('../../api/railApi', () => ({
  listConsignments: h.listConsignments,
}));
vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ showToast: h.showToast }),
}));

const WAGON = {
  id: 'w1', position: 1, wagonNumber: 'SAR-064213', type: 'GONDOLA',
  tareTonnes: 20, loadedTonnes: 62, commodity: 'Manganese', sealNumbers: null,
  axles: null, isDangerousGoods: false, unNumber: null, imdgClass: null,
  placardRef: null, emergencyContact24h: null, msdsDocumentUrl: null, note: null,
};

const DRAFT = {
  id: 'm1', manifestNumber: 'TM-2026-00001', revision: 1, supersedesId: null, status: 'DRAFT',
  consignmentId: 'c1', consignmentNumber: 'RAIL-2026-00007', slotApplicationId: null,
  trainServiceRef: 'PATH-44', corridor: 'COR-ORE', originSiding: 'Sishen', destinationSiding: 'Saldanha',
  railOperator: 'TOC One', locoReference: 'L-9', plannedDeparture: null, plannedArrival: null,
  notes: null, issuedAt: null, issuedBy: null, departedAt: null, departedBy: null,
  arrivedAt: null, arrivedBy: null, closedAt: null, closedBy: null,
  cancelledAt: null, cancelledReason: null, supersededAt: null,
  createdAt: '2026-10-12T06:00:00Z', updatedAt: '2026-10-12T06:00:00Z',
  wagons: [WAGON], _count: { wagons: 1 },
};

const ISSUED = {
  ...DRAFT, id: 'm2', manifestNumber: 'TM-2026-00002', status: 'ISSUED',
  issuedAt: '2026-10-12T07:00:00Z',
  issuedBy: 'J. Nkosi [verified: Mia Manager <mia@toc.co.za> (MANAGER)]',
};

beforeEach(() => {
  h.listTrainManifests.mockResolvedValue([DRAFT]);
  h.getTrainManifest.mockResolvedValue(DRAFT);
  h.listConsignments.mockResolvedValue([
    { id: 'c1', consignmentNumber: 'RAIL-2026-00007', commodity: 'Manganese', originSiding: 'Sishen', destinationSiding: 'Saldanha' },
  ]);
  h.issueTrainManifest.mockResolvedValue({ ...DRAFT, status: 'ISSUED' });
  h.departTrainManifest.mockResolvedValue({ ...ISSUED, status: 'DEPARTED' });
  h.cancelTrainManifest.mockResolvedValue({ ...DRAFT, status: 'CANCELLED' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TrainManifestPanel', () => {
  it('shows an API failure instead of saying there are no manifests', async () => {
    h.listTrainManifests.mockRejectedValueOnce(new Error('manifest API unavailable'));
    render(<TrainManifestPanel canWrite canSign />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load train manifests: manifest API unavailable/);
    expect(screen.queryByText(/No train manifests yet/i)).toBeNull();
  });

  it('shows the empty state with the snapshot explanation', async () => {
    h.listTrainManifests.mockResolvedValue([]);
    render(<TrainManifestPanel canWrite canSign />);
    await waitFor(() => expect(screen.getByText(/no train manifests yet/i)).toBeTruthy());
  });

  it('lists manifests with status and opens the detail with the wagon consist', async () => {
    render(<TrainManifestPanel canWrite canSign />);
    await waitFor(() => expect(screen.getByText('TM-2026-00001')).toBeTruthy());
    expect(screen.getByText('Draft')).toBeTruthy();
    fireEvent.click(screen.getByText('TM-2026-00001'));
    await waitFor(() => expect(screen.getByText('SAR-064213')).toBeTruthy());
    expect(screen.getByText('Manganese')).toBeTruthy();
    expect(screen.getAllByText(/RAIL-2026-00007/).length).toBeGreaterThan(0);
  });

  it('issues a draft only with a signatory name, freezing the document', async () => {
    render(<TrainManifestPanel canWrite canSign />);
    await waitFor(() => expect(screen.getByText('TM-2026-00001')).toBeTruthy());
    fireEvent.click(screen.getByText('TM-2026-00001'));
    await waitFor(() => expect(screen.getByText(/issue & freeze/i)).toBeTruthy());

    const issueBtn = screen.getByRole('button', { name: /issue & freeze/i });
    expect(issueBtn.hasAttribute('disabled')).toBe(true); // needs a signatory name first

    fireEvent.change(screen.getByLabelText(/signatory name/i), { target: { value: 'J. Nkosi, Train Guard' } });
    fireEvent.click(screen.getByRole('button', { name: /issue & freeze/i }));
    await waitFor(() => expect(h.issueTrainManifest).toHaveBeenCalledWith('m1', 'J. Nkosi, Train Guard'));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining('issued'), 'success'));
  });

  it('records departure on an issued manifest', async () => {
    h.listTrainManifests.mockResolvedValue([ISSUED]);
    h.getTrainManifest.mockResolvedValue(ISSUED);
    render(<TrainManifestPanel canWrite canSign />);
    await waitFor(() => expect(screen.getByText('TM-2026-00002')).toBeTruthy());
    fireEvent.click(screen.getByText('TM-2026-00002'));
    await waitFor(() => expect(screen.getByRole('button', { name: /record departure/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /record departure/i }));
    await waitFor(() => expect(h.departTrainManifest).toHaveBeenCalledWith('m2', undefined));
  });

  it('cancels a draft only with a reason', async () => {
    render(<TrainManifestPanel canWrite canSign />);
    await waitFor(() => expect(screen.getByText('TM-2026-00001')).toBeTruthy());
    fireEvent.click(screen.getByText('TM-2026-00001'));
    await waitFor(() => expect(screen.getByRole('button', { name: /cancel manifest/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /cancel manifest/i }));

    const modal = screen.getByRole('dialog', { name: 'Cancel manifest' });
    const confirm = within(modal).getByRole('button', { name: /cancel manifest/i });
    expect(confirm.hasAttribute('disabled')).toBe(true); // reason required
    fireEvent.change(within(modal).getByLabelText(/reason/i), { target: { value: 'Train cancelled by control' } });
    fireEvent.click(within(modal).getByRole('button', { name: /cancel manifest/i }));
    await waitFor(() => expect(h.cancelTrainManifest).toHaveBeenCalledWith('m1', 'Train cancelled by control'));
  });
});
