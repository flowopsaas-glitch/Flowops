import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({ auth: { user: { role: 'MANAGER', email: 'm@x.co' } as Record<string, unknown> } }));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: unknown }) => <div data-testid="map">{children as never}</div>,
  TileLayer: () => null, Polyline: () => null, CircleMarker: () => null, Tooltip: () => null,
}));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../components/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../api/railApi', () => ({
  getRailOverview: vi.fn().mockResolvedValue({ generatedAt: '', metrics: { activeConsignments: 0, inTransit: 0, atInterchange: 0, wagonsInTransit: 0, totalWagons: 0, tonnageMoved: 0, tonnagePlanned: 0, onTimePct: null, avgTransitHours: null, avgInterchangeDwellHours: null, atRisk: 0 }, byCorridor: [] }),
  listConsignments: vi.fn().mockResolvedValue([]),
  getConsignment: vi.fn(), advanceConsignment: vi.fn(),
}));
vi.mock('./rail/SlotCompliancePanel', () => ({
  default: ({ canWrite, canSign }: { canWrite: boolean; canSign: boolean }) => <div data-testid="slots-panel">{`write=${canWrite} sign=${canSign}`}</div>,
}));

import RailOperations from './RailOperations';

const open = async (role: string) => {
  h.auth.user = { role, email: 'u@x.co' };
  render(<RailOperations />);
  return screen.findByRole('tablist', { name: /Rail operations sections/ });
};

describe('RailOperations — Slot Applications & Compliance tab', () => {
  it('has a tab bar and starts on Consignments', async () => {
    await open('MANAGER');
    expect(screen.getByRole('tab', { name: 'Consignments' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Slot Applications & Compliance' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.queryByTestId('slots-panel')).toBeNull();
    expect(await screen.findByText(/Corridor Breakdown|Search consignment|SADC Rail Corridors/)).toBeTruthy();
  });

  it('switching tabs shows the panel and hides the consignment view', async () => {
    await open('MANAGER');
    fireEvent.click(screen.getByRole('tab', { name: 'Slot Applications & Compliance' }));
    expect(screen.getByTestId('slots-panel')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Search consignment/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Consignments' }));
    expect(screen.queryByTestId('slots-panel')).toBeNull();
    expect(screen.getByPlaceholderText(/Search consignment/)).toBeTruthy();
  });

  it.each([
    ['MANAGER', 'write=true sign=true'],
    ['DISPATCH', 'write=true sign=false'],
    ['VIEWER', 'write=false sign=false'],
  ])('passes the right capabilities for %s', async (role, expected) => {
    await open(role);
    fireEvent.click(screen.getByRole('tab', { name: 'Slot Applications & Compliance' }));
    expect(screen.getByTestId('slots-panel').textContent).toBe(expected);
  });
});
