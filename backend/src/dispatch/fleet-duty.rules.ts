/**
 * Fleet Duty Board rules. Pure, one place, the dispatcher's control-room truth.
 *
 * A board row answers five questions at a glance:
 *   1. Is this driver ON DUTY right now (and since when)?
 *   2. In which craft (bakkie / bicycle / truck / linehaul / train)?
 *   3. On which vehicle?
 *   4. How hard has this shift gone — fatigue level (platform policy: warn at 8h
 *      continuous duty, critical at 10h — mirror of the NDoT hours-of-service
 *      envelope; this is an operational warning, not legal advice)?
 *   5. What is the load — open runs in hand vs runs delivered today?
 */

export type FatigueLevel = 'OK' | 'WARN' | 'CRITICAL';
export type DutyState = 'ON_DUTY' | 'OFF_DUTY';

export const FATIGUE_WARN_HOURS = 8;
export const FATIGUE_CRITICAL_HOURS = 10;

export const CRAFT_LABEL: Record<string, string> = {
  BICYCLE: 'Bicycle',
  BAKKIE: 'Bakkie',
  TRUCK: 'Truck',
  LINEHAUL: 'Linehaul',
  TRAIN: 'Train driver',
};

export function craftLabel(mode: string | null | undefined): string {
  return CRAFT_LABEL[mode ?? ''] ?? '—';
}

/** Hours on the current shift, one decimal. 0 when not on duty. */
export function shiftHours(startedAt: Date | string | null | undefined, now: Date): number {
  if (!startedAt) return 0;
  const ms = now.getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export function fatigueLevel(hours: number): FatigueLevel {
  if (hours >= FATIGUE_CRITICAL_HOURS) return 'CRITICAL';
  if (hours >= FATIGUE_WARN_HOURS) return 'WARN';
  return 'OK';
}

export type RosterRow = {
  driverId: string;
  driverName: string;
  phone: string | null;
  state: DutyState;
  mode: string | null;
  craft: string;
  vehicleReg: string | null;
  dutyId: string | null;
  startedAt: Date | null;
  hoursOnDuty: number;
  fatigue: FatigueLevel;
  openLoads: number;
  deliveredToday: number;
};

export function rosterRow(input: {
  driverId: string;
  driverName: string;
  phone?: string | null;
  duty?: {
    id: string;
    mode: string;
    vehicleReg?: string | null;
    driverVehicleReg?: string | null;
    startedAt: Date | string;
  } | null;
  openLoads: number;
  deliveredToday: number;
}, now: Date): RosterRow {
  const duty = input.duty ?? null;
  const hours = duty ? shiftHours(duty.startedAt, now) : 0;
  return {
    driverId: input.driverId,
    driverName: input.driverName,
    phone: input.phone ?? null,
    state: duty ? 'ON_DUTY' : 'OFF_DUTY',
    mode: duty?.mode ?? null,
    craft: duty ? craftLabel(duty.mode) : '—',
    vehicleReg: duty?.vehicleReg ?? duty?.driverVehicleReg ?? null,
    dutyId: duty?.id ?? null,
    startedAt: duty ? new Date(duty.startedAt) : null,
    hoursOnDuty: hours,
    fatigue: duty ? fatigueLevel(hours) : 'OK',
    openLoads: input.openLoads,
    deliveredToday: input.deliveredToday,
  };
}

/** Duty first, fatigue-heaviest first within duty, then anyone with open loads, then name. */
export function sortRoster(rows: RosterRow[]): RosterRow[] {
  const weight = (r: RosterRow) =>
    (r.state === 'ON_DUTY' ? 0 : 2) + (r.fatigue === 'CRITICAL' ? -1 : r.fatigue === 'WARN' ? 0 : 0.5) * 0.01;
  return [...rows].sort((a, b) => {
    const w = weight(a) - weight(b);
    if (w !== 0) return w;
    if (a.state !== b.state) return a.state === 'ON_DUTY' ? -1 : 1;
    if (a.hoursOnDuty !== b.hoursOnDuty) return b.hoursOnDuty - a.hoursOnDuty;
    return a.driverName.localeCompare(b.driverName);
  });
}

export function boardSummary(rows: RosterRow[]) {
  const onDuty = rows.filter((r) => r.state === 'ON_DUTY');
  const byMode: Record<string, number> = {};
  for (const r of onDuty) byMode[r.mode ?? 'UNKNOWN'] = (byMode[r.mode ?? 'UNKNOWN'] ?? 0) + 1;
  return {
    drivers: rows.length,
    onDuty: onDuty.length,
    offDuty: rows.length - onDuty.length,
    byMode,
    fatigueWarn: onDuty.filter((r) => r.fatigue === 'WARN').length,
    fatigueCritical: onDuty.filter((r) => r.fatigue === 'CRITICAL').length,
    openLoads: rows.reduce((s, r) => s + r.openLoads, 0),
    deliveredToday: rows.reduce((s, r) => s + r.deliveredToday, 0),
  };
}
