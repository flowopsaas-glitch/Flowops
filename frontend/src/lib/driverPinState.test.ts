import { describe, expect, it } from 'vitest';
import { driverHasPinSet, toDriverPinRow, type RawDriverPinRow } from './driverPinState';

const HASH = '$2b$12$storedpinhashstoredpinhashstoredp';

describe('driverHasPinSet', () => {
  it('reads the derived flag the API sends', () => {
    expect(driverHasPinSet({ id: 'd1', hasPinSet: true })).toBe(true);
    expect(driverHasPinSet({ id: 'd1', hasPinSet: false })).toBe(false);
  });

  it('trusts an explicit false over a stale hash', () => {
    // The flag is the only source that knows the stored state; a leftover hash
    // (an older API during a rolling deploy) must not override it.
    expect(driverHasPinSet({ id: 'd1', hasPinSet: false, driverPin: HASH })).toBe(false);
  });

  it('falls back to the legacy hash only when the API sent no flag', () => {
    expect(driverHasPinSet({ id: 'd1', driverPin: HASH })).toBe(true);
    expect(driverHasPinSet({ id: 'd1', driverPin: null })).toBe(false);
    expect(driverHasPinSet({ id: 'd1' })).toBe(false);
  });

  it('is false for a missing row rather than throwing', () => {
    expect(driverHasPinSet(null)).toBe(false);
    expect(driverHasPinSet(undefined)).toBe(false);
  });
});

describe('toDriverPinRow', () => {
  it('maps the API row into the shape the drivers screen holds', () => {
    const raw: RawDriverPinRow = {
      id: 42,
      name: 'Sipho Dlamini',
      phone: '+27821234567',
      vehicleReg: 'BBZ 123-456',
      hasPinSet: true,
    };

    expect(toDriverPinRow(raw)).toEqual({
      id: '42',
      name: 'Sipho Dlamini',
      phone: '+27821234567',
      vehicleReg: 'BBZ 123-456',
      hasPinSet: true,
    });
  });

  it('never carries the PIN hash into component state', () => {
    const row = toDriverPinRow({ id: 'd1', name: 'Thandi Nkosi', driverPin: HASH });

    expect(row).not.toHaveProperty('driverPin');
    expect(row.hasPinSet).toBe(true);
    expect(Object.keys(row).sort()).toEqual(['hasPinSet', 'id', 'name', 'phone', 'vehicleReg']);
  });

  it('defaults a nameless driver and nulls', () => {
    expect(toDriverPinRow({ id: 'd1', name: null, phone: null, vehicleReg: null })).toEqual({
      id: 'd1',
      name: 'Driver',
      phone: undefined,
      vehicleReg: undefined,
      hasPinSet: false,
    });
  });
});
