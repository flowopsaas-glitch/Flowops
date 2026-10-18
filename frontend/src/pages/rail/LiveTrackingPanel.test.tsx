import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import LiveTrackingPanel from './LiveTrackingPanel';

/**
 * Live Tracking panel — device registry (token shown once), the position map,
 * movement summaries, and the health-alert queue with acknowledge/resolve.
 */

const h = vi.hoisted(() => ({
  listRailDevices: vi.fn(),
  createRailDevice: vi.fn(),
  rotateDeviceToken: vi.fn(),
  getDevicePoints: vi.fn(),
  getDeviceSummary: vi.fn(),
  listTelemetryAlerts: vi.fn(),
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../api/railTelemetryApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/railTelemetryApi')>('../../api/railTelemetryApi');
  return {
    ...actual,
    listRailDevices: h.listRailDevices,
    createRailDevice: h.createRailDevice,
    rotateDeviceToken: h.rotateDeviceToken,
    getDevicePoints: h.getDevicePoints,
    getDeviceSummary: h.getDeviceSummary,
    listTelemetryAlerts: h.listTelemetryAlerts,
    acknowledgeAlert: h.acknowledgeAlert,
    resolveAlert: h.resolveAlert,
  };
});
vi.mock('./RailTelemetryMap', () => ({
  default: ({ devices, trail }: { devices: unknown[]; trail: unknown[] }) => (
    <div data-testid="rail-telemetry-map">map:{devices.length}:{trail.length}</div>
  ),
}));
vi.mock('../../components/ToastProvider', () => ({
  useToast: () => ({ showToast: h.showToast }),
}));

const DEVICE = {
  id: 'd1', deviceCode: 'WT-000123', kind: 'WAGON_TRACKER', status: 'ACTIVE',
  label: 'Ore rake 14', wagonNumber: 'SAR-064213', locoReference: null, simRef: null,
  speedLimitKph: null, batteryThresholdPct: null, notes: null,
  tokenPrefix: 'abc12345', lastSeenAt: new Date().toISOString(), lastLat: -26.2, lastLng: 28.05,
  lastSpeedKph: 62, lastBatteryPct: 88, silent: false, openAlerts: 1,
  createdAt: '2026-10-12T06:00:00Z',
};

const ALERT = {
  id: 'a1', deviceId: 'd1', kind: 'SPEED_EXCEEDED', status: 'OPEN',
  message: 'Speed 95 kph exceeds the 85 kph limit.', value: 95, threshold: 85,
  raisedAt: new Date().toISOString(), acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null,
  device: { deviceCode: 'WT-000123', label: 'Ore rake 14', wagonNumber: 'SAR-064213' },
};

const SILENT_DEVICE = {
  ...DEVICE, id: 'd2', deviceCode: 'WT-000456', label: 'Manganese rake', wagonNumber: null,
  lastSeenAt: '2026-10-11T04:00:00Z', lastLat: null, lastLng: null, lastSpeedKph: null,
  lastBatteryPct: 9, silent: true, openAlerts: 0,
};

beforeEach(() => {
  h.listRailDevices.mockResolvedValue([DEVICE, SILENT_DEVICE]);
  h.listTelemetryAlerts.mockResolvedValue([ALERT]);
  h.getDevicePoints.mockResolvedValue([
    { id: 'p1', recordedAt: '2026-10-12T11:00:00Z', lat: -26.21, lng: 28.04, speedKph: 55, headingDeg: null, batteryPct: 90, temperatureC: null, doorOpen: null },
    { id: 'p2', recordedAt: '2026-10-12T11:05:00Z', lat: -26.2, lng: 28.05, speedKph: 62, headingDeg: null, batteryPct: 88, temperatureC: null, doorOpen: null },
  ]);
  h.getDeviceSummary.mockResolvedValue({
    deviceId: 'd1', deviceCode: 'WT-000123', sinceHours: 24,
    pointCount: 2, distanceKm: 1.4, maxSpeedKph: 62, avgSpeedKph: 58.5,
    lastSeenAt: new Date().toISOString(), silent: false,
  });
  h.createRailDevice.mockResolvedValue({ device: DEVICE, ingestToken: 'super-secret-token' });
  h.acknowledgeAlert.mockResolvedValue({ ...ALERT, status: 'ACKNOWLEDGED' });
  h.resolveAlert.mockResolvedValue({ ...ALERT, status: 'RESOLVED' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LiveTrackingPanel', () => {
  it('shows the ingest contract when nothing has reported yet', async () => {
    h.listRailDevices.mockResolvedValue([]);
    h.listTelemetryAlerts.mockResolvedValue([]);
    render(<LiveTrackingPanel canWrite />);
    await waitFor(() => expect(screen.getByText(/no positions yet/i)).toBeTruthy());
    expect(screen.getByText(/X-Device-Token/)).toBeTruthy();
  });

  it('lists devices with health signals and exposes a keyboard-operable position selector', async () => {
    render(<LiveTrackingPanel canWrite />);
    await waitFor(() => expect(screen.getByText('WT-000123')).toBeTruthy());
    expect(screen.getByText('Ore rake 14')).toBeTruthy();
    expect(screen.getAllByText('silent').length).toBeGreaterThan(0); // the silent device wears the badge
    expect(screen.getByText('WT-000456')).toBeTruthy();
    const selectDevice = screen.getByRole('button', { name: 'Show positions for WT-000123' });
    expect(selectDevice).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(selectDevice);
    await waitFor(() => expect(h.getDevicePoints).toHaveBeenCalledWith('d1', { limit: 200 }));
    await waitFor(() => expect(h.getDeviceSummary).toHaveBeenCalledWith('d1', 24));
    await waitFor(() => expect(screen.getByTestId('rail-telemetry-map')).toBeTruthy());
    expect(screen.getByText('1 open')).toBeTruthy();
  });

  it('registers a device and shows the ingest token exactly once', async () => {
    render(<LiveTrackingPanel canWrite />);
    await waitFor(() => expect(screen.getByRole('button', { name: /register device/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /register device/i }));
    fireEvent.change(screen.getByLabelText(/device code/i), { target: { value: 'wt-000999' } });
    fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
    await waitFor(() => expect(h.createRailDevice).toHaveBeenCalledWith(
      expect.objectContaining({ deviceCode: 'WT-000999' }),
    ));
    await waitFor(() => expect(screen.getByText(/shown once/i)).toBeTruthy());
    expect(screen.getByText('super-secret-token')).toBeTruthy();
  });

  it('reports clipboard success only after writeText succeeds and keeps the token available on failure', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      render(<LiveTrackingPanel canWrite />);
      fireEvent.click(await screen.findByRole('button', { name: /register device/i }));
      fireEvent.change(screen.getByLabelText(/device code/i), { target: { value: 'wt-000999' } });
      fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
      expect(await screen.findByText('super-secret-token')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /copy/i }));
      await waitFor(() => expect(h.showToast).toHaveBeenCalledWith(
        expect.stringMatching(/Could not copy token.*permission denied.*manually/i), 'error',
      ));
      expect(writeText).toHaveBeenCalledWith('super-secret-token');
      expect(h.showToast).not.toHaveBeenCalledWith('Copied.', 'success');
      expect(screen.getByText('super-secret-token')).toBeTruthy();
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('does not describe a failed selected-device position request as an empty position set', async () => {
    h.listRailDevices.mockResolvedValue([SILENT_DEVICE]);
    h.listTelemetryAlerts.mockResolvedValue([]);
    h.getDevicePoints.mockRejectedValueOnce(new Error('position endpoint unavailable'));
    render(<LiveTrackingPanel canWrite />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show positions for WT-000456' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load selected device positions.*position endpoint unavailable/);
    expect(screen.getByText(/selected device's position state could not be verified/i)).toBeTruthy();
    expect(screen.queryByText(/No positions yet/i)).toBeNull();
  });

  it('does not describe unavailable devices or alerts as empty data', async () => {
    h.listRailDevices.mockRejectedValueOnce(new Error('device API unavailable'));
    h.listTelemetryAlerts.mockRejectedValueOnce(new Error('alert API unavailable'));
    render(<LiveTrackingPanel canWrite />);
    expect(await screen.findByText(/Position state cannot be verified/i)).toBeTruthy();
    expect(screen.getByText(/Device registry unavailable: device API unavailable/i)).toBeTruthy();
    expect(screen.getByText(/Could not refresh health alerts: alert API unavailable/i)).toBeTruthy();
    expect(screen.queryByText('No devices registered yet.')).toBeNull();
    expect(screen.queryByText(/No open alerts/i)).toBeNull();
  });

  it('acknowledges and resolves alerts', async () => {
    render(<LiveTrackingPanel canWrite />);
    await waitFor(() => expect(screen.getByText(/exceeds the 85 kph limit/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /acknowledge/i }));
    await waitFor(() => expect(h.acknowledgeAlert).toHaveBeenCalledWith('a1'));
    fireEvent.click(screen.getByRole('button', { name: /^resolve$/i }));
    await waitFor(() => expect(h.resolveAlert).toHaveBeenCalledWith('a1'));
  });

  it('hides write actions for read-only users', async () => {
    render(<LiveTrackingPanel canWrite={false} />);
    await waitFor(() => expect(screen.getByText('WT-000123')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /register device/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /acknowledge/i })).toBeNull();
  });
});
