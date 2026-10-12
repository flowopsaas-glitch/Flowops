import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import React from 'react';
import DriverShiftBar from './DriverShiftBar';
import type { DriveModeConfig, DriverDuty } from '../../api/driverPortalApi';

/**
 * DriverShiftBar — the mode switcher. One tap changes craft; heavy modes
 * demand a vehicle reg first (the same rule the server enforces); switching
 * auto-ends the current duty via duty/start.
 */

const h = vi.hoisted(() => ({
  startDuty: vi.fn(),
  endDuty: vi.fn(),
}));

vi.mock('../../api/driverPortalApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/driverPortalApi')>('../../api/driverPortalApi');
  return { ...actual, startDuty: h.startDuty, endDuty: h.endDuty };
});

const MODES: DriveModeConfig[] = [
  { mode: 'BICYCLE', label: 'Bicycle', jobKinds: ['parcel', 'collection'], requiresVehicleReg: false, pod: { signature: true, photo: true, scan: false }, checklist: ['Phone charged'], description: 'Short-radius last-mile.', allowed: true },
  { mode: 'BAKKIE', label: 'Bakkie', jobKinds: ['parcel', 'collection'], requiresVehicleReg: false, pod: { signature: true, photo: true, scan: true }, checklist: ['Straps'], description: 'Light deliveries.', allowed: true },
  { mode: 'TRUCK', label: 'Truck', jobKinds: ['parcel', 'collection', 'linehaul'], requiresVehicleReg: true, pod: { signature: true, photo: true, scan: true }, checklist: ['Weighbridge ticket'], description: 'Heavy loads.', allowed: true },
  { mode: 'LINEHAUL', label: 'Linehaul', jobKinds: ['linehaul'], requiresVehicleReg: true, pod: { signature: true, photo: false, scan: true }, checklist: ['Seals'], description: 'Inter-depot trunk runs.', allowed: true },
  { mode: 'TRAIN', label: 'Train driver', jobKinds: ['rail'], requiresVehicleReg: true, pod: { signature: false, photo: false, scan: false }, checklist: ['Consist confirmed'], description: 'Rail duty.', allowed: false },
];

const onChange = vi.fn();
const onError = vi.fn();

beforeEach(() => {
  h.startDuty.mockResolvedValue({ duty: { id: 'd1', mode: 'BAKKIE', status: 'ACTIVE', vehicleReg: null, note: null, startedAt: '2026-10-12T06:00:00Z', endedAt: null }, previousEnded: null, config: MODES[1] });
  h.endDuty.mockResolvedValue({ duty: { id: 'd1', mode: 'BAKKIE', status: 'COMPLETED', vehicleReg: null, note: null, startedAt: '2026-10-12T06:00:00Z', endedAt: '2026-10-12T14:00:00Z' }, durationMinutes: 480 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DriverShiftBar', () => {
  it('offers the five crafts and starts a light-mode shift in one tap', async () => {
    render(<DriverShiftBar modes={MODES} activeDuty={null} vehicleReg={null} onChanged={onChange} onError={onError} />);
    fireEvent.click(screen.getByTestId('start-duty'));
    const dialog = screen.getByRole('dialog', { name: /choose your drive mode/i });
    expect(within(dialog).getByTestId('mode-BICYCLE')).toBeTruthy();
    expect(within(dialog).getByTestId('mode-TRAIN')).toBeTruthy();

    fireEvent.click(within(dialog).getByTestId('mode-BAKKIE'));
    await waitFor(() => expect(h.startDuty).toHaveBeenCalledWith({ mode: 'BAKKIE', vehicleReg: undefined }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('asks for a vehicle reg before truck duty can start', async () => {
    render(<DriverShiftBar modes={MODES} activeDuty={null} vehicleReg="GP 111-222" onChanged={onChange} onError={onError} />);
    fireEvent.click(screen.getByTestId('start-duty'));
    fireEvent.click(screen.getByTestId('mode-TRUCK'));
    expect(h.startDuty).not.toHaveBeenCalled(); // blocked until the reg is confirmed
    const prompt = screen.getByTestId('reg-prompt');
    expect(within(prompt).getByLabelText(/vehicle registration/i)).toBeTruthy();

    fireEvent.change(within(prompt).getByLabelText(/vehicle registration/i), { target: { value: 'GP 999-888' } });
    fireEvent.click(within(prompt).getByRole('button', { name: /go on duty/i }));
    await waitFor(() => expect(h.startDuty).toHaveBeenCalledWith({ mode: 'TRUCK', vehicleReg: 'GP 999-888' }));
  });

  it('shows the active duty and ends the shift', async () => {
    const duty = { id: 'd1', mode: 'LINEHAUL', status: 'ACTIVE', vehicleReg: 'BC 41 ZN', note: null, startedAt: '2026-10-12T06:00:00Z', endedAt: null };
    render(<DriverShiftBar modes={MODES} activeDuty={duty as DriverDuty} vehicleReg="BC 41 ZN" onChanged={onChange} onError={onError} />);
    expect(screen.getByText('Linehaul')).toBeTruthy();
    expect(screen.getByText(/BC 41 ZN/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('end-duty'));
    await waitFor(() => expect(h.endDuty).toHaveBeenCalled());
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ duty: null, mode: null }));
  });

  it('disables modes the admin has not allowed', () => {
    render(<DriverShiftBar modes={MODES} activeDuty={null} vehicleReg={null} onChanged={onChange} onError={onError} />);
    fireEvent.click(screen.getByTestId('start-duty'));
    expect(screen.getByTestId('mode-TRAIN').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('mode-BAKKIE').hasAttribute('disabled')).toBe(false);
  });
});
