import {
  canEndDuty, checkStartDuty, DRIVE_MODE_CONFIG, DRIVER_MODES, dutyMinutes,
  isDriverMode, isJobKindVisible, jobKindsForMode,
} from './driver-mode.rules';

describe('driver-mode.rules — the five crafts', () => {
  it('covers exactly the fleet the business runs: bakkie, bicycle, truck, linehaul, train', () => {
    expect([...DRIVER_MODES].sort()).toEqual(['BAKKIE', 'BICYCLE', 'LINEHAUL', 'TRAIN', 'TRUCK']);
  });

  it('every mode has a full config (label, kinds, pod, checklist)', () => {
    for (const mode of DRIVER_MODES) {
      const cfg = DRIVE_MODE_CONFIG[mode];
      expect(cfg.label.length).toBeGreaterThan(2);
      expect(cfg.jobKinds.length).toBeGreaterThan(0);
      expect(cfg.checklist.length).toBeGreaterThan(0);
      expect(cfg.description.length).toBeGreaterThan(10);
      expect(typeof cfg.pod.signature).toBe('boolean');
    }
  });

  it('scopes work to the mode — a linehaul driver never sees parcels, a bakkie never sees rail', () => {
    expect(jobKindsForMode('BICYCLE')).toEqual(['parcel', 'collection']);
    expect(jobKindsForMode('BAKKIE')).toEqual(['parcel', 'collection']);
    expect(jobKindsForMode('TRUCK')).toEqual(['parcel', 'collection', 'linehaul']);
    expect(jobKindsForMode('LINEHAUL')).toEqual(['linehaul']);
    expect(jobKindsForMode('TRAIN')).toEqual(['rail']);

    expect(isJobKindVisible('LINEHAUL', 'parcel')).toBe(false);
    expect(isJobKindVisible('BICYCLE', 'linehaul')).toBe(false);
    expect(isJobKindVisible('TRAIN', 'parcel')).toBe(false);
    expect(isJobKindVisible('TRUCK', 'linehaul')).toBe(true);
  });

  it('puts discipline where the risk is: heavy modes demand a reg, scans on road modes', () => {
    expect(DRIVE_MODE_CONFIG.TRUCK.requiresVehicleReg).toBe(true);
    expect(DRIVE_MODE_CONFIG.LINEHAUL.requiresVehicleReg).toBe(true);
    expect(DRIVE_MODE_CONFIG.TRAIN.requiresVehicleReg).toBe(true);
    expect(DRIVE_MODE_CONFIG.BICYCLE.requiresVehicleReg).toBe(false);
    expect(DRIVE_MODE_CONFIG.BAKKIE.requiresVehicleReg).toBe(false);
    // Train duty is sign-on/consist discipline, not courier POD
    expect(DRIVE_MODE_CONFIG.TRAIN.pod).toEqual({ signature: false, photo: false, scan: false });
    expect(DRIVE_MODE_CONFIG.BICYCLE.pod.photo).toBe(true);
  });
});

describe('driver-mode.rules — duty start/end', () => {
  it('accepts a valid duty in an allowed mode', () => {
    expect(checkStartDuty({ mode: 'BAKKIE' }).ok).toBe(true);
    expect(checkStartDuty({ mode: 'TRUCK', vehicleReg: 'GP 123-456' }).ok).toBe(true);
  });

  it('demands a vehicle reg for truck, linehaul and train — nothing else will do', () => {
    for (const mode of ['TRUCK', 'LINEHAUL', 'TRAIN'] as const) {
      const r = checkStartDuty({ mode });
      expect(r.ok).toBe(false);
      expect(r.blockers.join(' ')).toContain('vehicle registration');
      expect(checkStartDuty({ mode, vehicleReg: '  ' }).ok).toBe(false);
      expect(checkStartDuty({ mode, vehicleReg: 'BC 41 ZN' }).ok).toBe(true);
    }
    expect(checkStartDuty({ mode: 'BICYCLE' }).ok).toBe(true);
    expect(checkStartDuty({ mode: 'BAKKIE', vehicleReg: null }).ok).toBe(true);
  });

  it('respects the admin allowedModes list (empty = all modes)', () => {
    expect(checkStartDuty({ mode: 'TRAIN', vehicleReg: 'X', allowedModes: ['BAKKIE', 'TRUCK'] }).ok).toBe(false);
    const r = checkStartDuty({ mode: 'TRAIN', vehicleReg: 'X', allowedModes: ['BAKKIE'] });
    expect(r.blockers.join(' ')).toContain('not in this driver');
    expect(checkStartDuty({ mode: 'BAKKIE', allowedModes: ['BAKKIE'] }).ok).toBe(true);
    expect(checkStartDuty({ mode: 'TRAIN', vehicleReg: 'X', allowedModes: [] }).ok).toBe(true);
    expect(checkStartDuty({ mode: 'TRAIN', vehicleReg: 'X', allowedModes: null }).ok).toBe(true);
  });

  it('rejects unknown modes and absurd inputs', () => {
    expect(checkStartDuty({ mode: 'SPACESHIP' as never }).ok).toBe(false);
    expect(checkStartDuty({ mode: 'TRUCK', vehicleReg: 'R'.repeat(21) }).ok).toBe(false);
    expect(isDriverMode('TRUCK')).toBe(true);
    expect(isDriverMode('truck')).toBe(false); // case matters — enums are canonical
    expect(isDriverMode(undefined)).toBe(false);
  });

  it('only an ACTIVE duty can be ended', () => {
    expect(canEndDuty({ status: 'ACTIVE' })).toBe(true);
    expect(canEndDuty({ status: 'COMPLETED' })).toBe(false);
    expect(canEndDuty(null)).toBe(false);
  });

  it('measures shift length in whole minutes', () => {
    const asOf = new Date('2026-10-12T14:00:00Z');
    expect(dutyMinutes({ startedAt: '2026-10-12T08:00:00Z' }, asOf)).toBe(360);
    expect(dutyMinutes({ startedAt: '2026-10-12T08:00:00Z', endedAt: '2026-10-12T10:30:00Z' }, asOf)).toBe(150);
    expect(dutyMinutes({ startedAt: '2026-10-12T14:00:00Z' }, asOf)).toBe(0);
  });
});
