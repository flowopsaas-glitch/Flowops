import type { RailPossessionKind, RailPossessionStatus } from '@prisma/client';
import { CorridorIdentity, resolveCorridor } from './rail-reference';

/**
 * Possession-window rules — pure.
 *
 * The brief names three kinds (Annual Plan, 60-day Locked, Ad-hoc Emergency) and attributes them to
 * Annexures 23 / 24 / 41. None of those was supplied, and the source register maps them to other subjects
 * (23 = shunting-stock specification, 24 = Interface Management Agreement, 41 = Occurrence Reporting
 * Procedure), so the 60-day lock below is `[BRIEF, unverified]`.
 */

export const POSSESSION_LOCK_DAYS = 60;
const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Consignment statuses that still occupy a path. */
export const ACTIVE_CONSIGNMENT_STATUSES = ['PLANNED', 'WAGONS_ALLOCATED', 'LOADING', 'DEPARTED', 'IN_TRANSIT', 'AT_INTERCHANGE'] as const;

export interface PossessionLike {
  id: string;
  corridorCode: string;
  kind: RailPossessionKind;
  status: RailPossessionStatus;
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
}

export interface ConsignmentLike {
  id: string;
  consignmentNumber: string;
  status: string;
  corridor?: string | null;
  plannedDeparture?: Date | string | null;
  plannedArrival?: Date | string | null;
  actualDeparture?: Date | string | null;
  slaHours?: number | null;
}

/** From this instant an ANNUAL_PLAN window is treated as locked (60 days before it starts). */
export const possessionLockedFrom = (w: Pick<PossessionLike, 'startsAt'>): Date => new Date(new Date(w.startsAt).getTime() - POSSESSION_LOCK_DAYS * DAY);

export function isEffectivelyLocked(w: Pick<PossessionLike, 'kind' | 'startsAt'>, now: Date = new Date()): boolean {
  if (w.kind === 'LOCKED_60_DAY' || w.kind === 'AD_HOC_EMERGENCY') return true;
  return now.getTime() >= possessionLockedFrom(w).getTime();
}

/** The time a consignment occupies the corridor, or null when it cannot be worked out. */
export function consignmentInterval(c: ConsignmentLike): { start: Date; end: Date } | null {
  const start = c.actualDeparture ?? c.plannedDeparture;
  if (!start) return null;
  const s = new Date(start);
  const endRaw = c.plannedArrival ?? (c.slaHours ? new Date(s.getTime() + c.slaHours * HOUR) : null);
  if (!endRaw) return null;
  const e = new Date(endRaw);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e.getTime() <= s.getTime()) return null;
  return { start: s, end: e };
}

export interface PossessionConflict {
  windowId: string;
  windowTitle: string;
  windowKind: RailPossessionKind;
  corridorCode: string;
  consignmentId: string;
  consignmentNumber: string;
  overlapStart: string;
  overlapEnd: string;
  overlapHours: number;
  /** HARD = locked / emergency (cannot be moved); PLANNED = an annual-plan window not yet locked. */
  severity: 'HARD' | 'PLANNED';
}

export interface ConflictScan {
  conflicts: PossessionConflict[];
  /** Consignments with no usable schedule — they CANNOT be checked, and are listed rather than assumed clear. */
  unscheduled: string[];
  /** Consignments whose corridor text matches no catalog corridor — likewise listed, never guessed. */
  unresolved: string[];
  consignmentsChecked: number;
}

/**
 * A window conflicts with a consignment when: the window is PLANNED or ACTIVE, the consignment is still
 * active, they are on the same catalog corridor, and their time ranges overlap (touching ends do not).
 */
export function detectPossessionConflicts<C extends CorridorIdentity>(
  windows: readonly PossessionLike[],
  consignments: readonly ConsignmentLike[],
  corridors: readonly C[],
  now: Date = new Date(),
): ConflictScan {
  const live = windows.filter((w) => w.status === 'PLANNED' || w.status === 'ACTIVE');
  const active = consignments.filter((c) => (ACTIVE_CONSIGNMENT_STATUSES as readonly string[]).includes(c.status));
  const conflicts: PossessionConflict[] = [];
  const unscheduled: string[] = [];
  const unresolved: string[] = [];
  for (const c of active) {
    const interval = consignmentInterval(c);
    if (!interval) { unscheduled.push(c.consignmentNumber); continue; }
    const corridor = resolveCorridor(corridors, c.corridor);
    if (!corridor) { unresolved.push(c.consignmentNumber); continue; }
    for (const w of live) {
      if (w.corridorCode !== corridor.code) continue;
      const ws = new Date(w.startsAt);
      const we = new Date(w.endsAt);
      if (!(ws < interval.end && we > interval.start)) continue;
      const os = new Date(Math.max(ws.getTime(), interval.start.getTime()));
      const oe = new Date(Math.min(we.getTime(), interval.end.getTime()));
      conflicts.push({
        windowId: w.id, windowTitle: w.title, windowKind: w.kind, corridorCode: w.corridorCode,
        consignmentId: c.id, consignmentNumber: c.consignmentNumber,
        overlapStart: os.toISOString(), overlapEnd: oe.toISOString(), overlapHours: Math.round(((oe.getTime() - os.getTime()) / HOUR) * 10) / 10,
        severity: isEffectivelyLocked(w, now) ? 'HARD' : 'PLANNED',
      });
    }
  }
  return { conflicts, unscheduled, unresolved, consignmentsChecked: active.length };
}
