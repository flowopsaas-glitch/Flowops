import type { DriverMode } from '@prisma/client';

/**
 * Driver modes — the profession a driver is driving THIS shift.
 *
 * One portal, five crafts. The rules here decide (deterministically, and the
 * same on the server and the UI) what each mode sees, what it must capture,
 * and what a valid duty looks like. A bakkie driver in the morning and a
 * linehaul driver at night get exactly the right tools — and a hard boundary
 * between them.
 */

export const DRIVER_MODES = ['BICYCLE', 'BAKKIE', 'TRUCK', 'LINEHAUL', 'TRAIN'] as const;

export type JobKind = 'parcel' | 'collection' | 'linehaul' | 'rail';

export interface DriveModeConfig {
  label: string;
  /** Job kinds this mode works (server-side scoping of the work queue). */
  jobKinds: JobKind[];
  /** Heavy equipment must declare what it is driving. */
  requiresVehicleReg: boolean;
  /** What the driver must capture before a delivery counts. */
  pod: { signature: boolean; photo: boolean; scan: boolean };
  /** The shift checklist shown on the mode home (operational, not enforced). */
  checklist: string[];
  description: string;
}

export const DRIVE_MODE_CONFIG: Record<DriverMode, DriveModeConfig> = {
  BICYCLE: {
    label: 'Bicycle',
    jobKinds: ['parcel', 'collection'],
    requiresVehicleReg: false,
    pod: { signature: true, photo: true, scan: false },
    checklist: ['Battery / phone charge', 'Cold-chain bag sealed (if perishable)'],
    description: 'Short-radius last-mile. Photo + signature on every drop.',
  },
  BAKKIE: {
    label: 'Bakkie',
    jobKinds: ['parcel', 'collection'],
    requiresVehicleReg: false,
    pod: { signature: true, photo: true, scan: true },
    checklist: ['Straps & load cover', 'Spare tyre & jack', 'COD float counted'],
    description: 'Light deliveries and collections with a proper POD.',
  },
  TRUCK: {
    label: 'Truck',
    jobKinds: ['parcel', 'collection', 'linehaul'],
    requiresVehicleReg: true,
    pod: { signature: true, photo: true, scan: true },
    checklist: ['Weighbridge ticket', 'DG placards (if applicable)', 'Seals intact', 'Tachograph / logbook'],
    description: 'Heavy loads. Reg required — weighbridge, seals and DG discipline.',
  },
  LINEHAUL: {
    label: 'Linehaul',
    jobKinds: ['linehaul'],
    requiresVehicleReg: true,
    pod: { signature: true, photo: false, scan: true },
    checklist: ['Seal numbers recorded', 'Trunk manifest matched', 'Handover at destination hub'],
    description: 'Inter-depot trunk runs. Seal numbers and handovers are the job.',
  },
  TRAIN: {
    label: 'Train driver',
    jobKinds: ['rail'],
    requiresVehicleReg: true,
    pod: { signature: false, photo: false, scan: false },
    checklist: ['Consist confirmed against manifest', 'Possession windows checked', 'Brake test / guard sign-on'],
    description: 'Rail duty. Consist, possessions and the sign-on discipline.',
  },
};

export function isDriverMode(v: unknown): v is DriverMode {
  return typeof v === 'string' && (DRIVER_MODES as readonly string[]).includes(v);
}

/** Job kinds visible in a mode — the server scopes the work queue with this. */
export function jobKindsForMode(mode: DriverMode): JobKind[] {
  return DRIVE_MODE_CONFIG[mode].jobKinds;
}

export function isJobKindVisible(mode: DriverMode, kind: JobKind): boolean {
  return DRIVE_MODE_CONFIG[mode].jobKinds.includes(kind);
}

// ── Duty lifecycle ──────────────────────────────────────────────────────────

export interface DutyLike {
  status: string;
  mode: string;
  startedAt: Date | string;
  vehicleReg?: string | null;
}

export interface StartDutyInput {
  mode: DriverMode;
  vehicleReg?: string | null;
  allowedModes?: DriverMode[] | null;
}

export interface StartDutyCheck {
  ok: boolean;
  blockers: string[];
}

/**
 * A duty may start only if:
 *  - the mode is a real mode AND the admin allows it for this driver
 *    (an empty/absent allowedModes list means "all modes" — the common case),
 *  - the mode's vehicle requirements are met (reg for truck/linehaul/train).
 * Starting a new duty while one is active is allowed and AUTO-ENDS the old one
 * (the switch flow) — that is a transition, not a blocker.
 */
export function checkStartDuty(input: StartDutyInput): StartDutyCheck {
  const blockers: string[] = [];
  const { mode, vehicleReg, allowedModes } = input;

  if (!isDriverMode(mode)) blockers.push(`Unknown drive mode: ${String(mode)}.`);
  else {
    if (Array.isArray(allowedModes) && allowedModes.length > 0 && !allowedModes.includes(mode)) {
      blockers.push(`${DRIVE_MODE_CONFIG[mode].label} is not in this driver's allowed modes.`);
    }
    const cfg = DRIVE_MODE_CONFIG[mode];
    if (cfg.requiresVehicleReg && !vehicleReg?.trim()) {
      blockers.push(`${cfg.label} duty requires a vehicle registration number.`);
    }
    if (vehicleReg && vehicleReg.trim().length > 20) blockers.push('Vehicle registration is too long.');
  }
  return { ok: blockers.length === 0, blockers };
}

/** Ending an ACTIVE duty is always fine; a completed one is terminal. */
export function canEndDuty(duty: Pick<DutyLike, 'status'> | null | undefined): boolean {
  return !!duty && duty.status === 'ACTIVE';
}

/** Duty duration in minutes (for the shift summary). */
export function dutyMinutes(duty: { startedAt: Date | string; endedAt?: Date | string | null }, asOf: Date = new Date()): number {
  const start = new Date(duty.startedAt).getTime();
  const end = duty.endedAt ? new Date(duty.endedAt).getTime() : asOf.getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}
