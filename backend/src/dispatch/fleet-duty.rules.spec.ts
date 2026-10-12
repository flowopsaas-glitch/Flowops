import {
  boardSummary,
  craftLabel,
  fatigueLevel,
  FATIGUE_CRITICAL_HOURS,
  FATIGUE_WARN_HOURS,
  rosterRow,
  shiftHours,
  sortRoster,
} from './fleet-duty.rules';

const NOW = new Date('2026-10-12T18:00:00Z');

describe('fleet-duty.rules — the dispatcher roster', () => {
  it('shift hours compute to one decimal and never go negative', () => {
    expect(shiftHours(new Date('2026-10-12T10:00:00Z'), NOW)).toBe(8);
    expect(shiftHours(new Date('2026-10-12T15:30:00Z'), NOW)).toBe(2.5);
    expect(shiftHours(new Date('2026-10-12T20:00:00Z'), NOW)).toBe(0);
    expect(shiftHours(null, NOW)).toBe(0);
    expect(shiftHours(undefined, NOW)).toBe(0);
  });

  it('fatigue escalates at the 8h / 10h platform policy lines', () => {
    expect(fatigueLevel(0)).toBe('OK');
    expect(fatigueLevel(7.9)).toBe('OK');
    expect(fatigueLevel(FATIGUE_WARN_HOURS)).toBe('WARN');
    expect(fatigueLevel(9.9)).toBe('WARN');
    expect(fatigueLevel(FATIGUE_CRITICAL_HOURS)).toBe('CRITICAL');
    expect(fatigueLevel(14)).toBe('CRITICAL');
  });

  it('names the craft in dispatcher language', () => {
    expect(craftLabel('BAKKIE')).toBe('Bakkie');
    expect(craftLabel('TRAIN')).toBe('Train driver');
    expect(craftLabel(null)).toBe('—');
  });

  it('derives ON_DUTY with vehicle preference: duty reg over driver reg', () => {
    const on = rosterRow({
      driverId: 'd1', driverName: 'Thabo',
      duty: { id: 'duty-1', mode: 'TRUCK', vehicleReg: 'GP 123-456', driverVehicleReg: 'OLD-1', startedAt: new Date('2026-10-12T10:00:00Z') },
      openLoads: 2, deliveredToday: 3,
    }, NOW);
    expect(on.state).toBe('ON_DUTY');
    expect(on.craft).toBe('Truck');
    expect(on.vehicleReg).toBe('GP 123-456');
    expect(on.hoursOnDuty).toBe(8);
    expect(on.fatigue).toBe('WARN');

    const off = rosterRow({ driverId: 'd2', driverName: 'Ayanda', duty: null, openLoads: 0, deliveredToday: 1 }, NOW);
    expect(off.state).toBe('OFF_DUTY');
    expect(off.fatigue).toBe('OK');
    expect(off.hoursOnDuty).toBe(0);
  });

  it('sorts duty first, heaviest shift first, and summarises the fleet', () => {
    const rows = sortRoster([
      rosterRow({ driverId: 'a', driverName: 'Zanele', duty: null, openLoads: 0, deliveredToday: 0 }, NOW),
      rosterRow({ driverId: 'b', driverName: 'Kabelo', duty: { id: 'd2', mode: 'BAKKIE', startedAt: new Date('2026-10-12T10:00:00Z') }, openLoads: 1, deliveredToday: 2 }, NOW),
      rosterRow({ driverId: 'c', driverName: 'Pieter', duty: { id: 'd3', mode: 'LINEHAUL', startedAt: new Date('2026-10-12T15:00:00Z') }, openLoads: 0, deliveredToday: 0 }, NOW),
    ]);
    expect(rows.map((r) => r.driverName)).toEqual(['Kabelo', 'Pieter', 'Zanele']);

    const s = boardSummary(rows);
    expect(s.drivers).toBe(3);
    expect(s.onDuty).toBe(2);
    expect(s.offDuty).toBe(1);
    expect(s.byMode).toEqual({ BAKKIE: 1, LINEHAUL: 1 });
    expect(s.fatigueWarn).toBe(1);
    expect(s.openLoads).toBe(1);
    expect(s.deliveredToday).toBe(2);
  });

  it('flags a 10h+ shift as CRITICAL in the summary', () => {
    const rows = [rosterRow({
      driverId: 'd', driverName: 'Long',
      duty: { id: 'x', mode: 'TRUCK', startedAt: new Date('2026-10-12T07:59:00Z') },
      openLoads: 0, deliveredToday: 0,
    }, NOW)];
    expect(rows[0].fatigue).toBe('CRITICAL');
    expect(boardSummary(rows).fatigueCritical).toBe(1);
  });
});
