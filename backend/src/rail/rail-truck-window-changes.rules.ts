import { TruckAppointmentStatus } from '@prisma/client';

/**
 * Terminal truck window changes — the pure rules.
 *
 * Everything in this file is a synchronous function of its inputs: no Prisma,
 * no clock reads, no I/O. The service supplies `now` and the persisted rows,
 * which means the whole state machine (eligibility, supersede, acknowledgement,
 * escalation, KPI maths) is testable without a database and cannot drift
 * between what the tests assert and what production evaluates.
 *
 * Two rules from the terminal operator this layer exists to serve:
 *   1. A window can be changed by the terminal operator — but the change is an
 *      EVENT with an actor, a reason and a version, never an in-place edit.
 *   2. Hauliers must be informed quickly during the transportation flow — so
 *      acknowledgement is tracked per recipient and escalates on the clock,
 *      and "does that truck know?" is answerable at a glance.
 */

// ── Window-change eligibility ────────────────────────────────────────────────

export type WindowChangeCode =
  | 'INVALID_WINDOW'
  | 'NOT_BOOKED'
  | 'WINDOW_CLOSED'
  | 'CUTOFF_NEEDS_FORCE';

export type WindowChangeAssessment =
  | {
      allowed: true;
      forced: boolean;
      insideCutoff: boolean;
      windowAlreadyClosed: boolean;
      cutoffHours: number;
    }
  | { allowed: false; code: WindowChangeCode; message: string; cutoffHours: number };

export interface WindowChangeInput {
  status: TruckAppointmentStatus | string;
  windowStart: Date;
  windowEnd: Date;
  /** Injected — never `new Date()` inside a rule. */
  now: Date;
  cutoffHours: number;
  /** Present and non-blank after trimming. */
  reason?: string | null;
  force?: boolean;
  /** Supplied for RESCHEDULED / REPLANNED; omit for CANCELLED. */
  newWindowStart?: Date | null;
  newWindowEnd?: Date | null;
}

/**
 * Can this window be changed right now, and if so under what governance?
 *
 * Ordering matters and is deliberate:
 *  - a malformed new window is rejected before any status reasoning, so the
 *    operator gets the real complaint rather than a governance error;
 *  - publishing a NEW window for a slot that has already CLOSED is refused even
 *    when the appointment is still BOOKED: it would tell a haulier something
 *    false about the past. The honest action is to cancel or no-show and book a
 *    fresh appointment — so CANCELLING a closed window is explicitly allowed
 *    (that is the action the refusal points at), and the event then records
 *    `windowAlreadyClosed: true` so the trail shows the slot was already dead
 *    when it was cancelled.
 *  - an ARRIVED / LOADING truck is refused: the vehicle is already at the gate,
 *    so a window change cannot reach it in time and would only create a second
 *    "truth" about a truck that is physically present. This is the
 *    "change after departure" case — recorded and audited as a refusal, never
 *    silently applied.
 */
export function assessWindowChange(input: WindowChangeInput): WindowChangeAssessment {
  const { status, windowStart, windowEnd, now, cutoffHours } = input;

  const wantsNewWindow = input.newWindowStart !== undefined || input.newWindowEnd !== undefined;
  if (wantsNewWindow) {
    const start = input.newWindowStart;
    const end = input.newWindowEnd;
    if (!start || !end || Number.isNaN(new Date(start).getTime()) || Number.isNaN(new Date(end).getTime())) {
      return refuse('INVALID_WINDOW', 'Both a new windowStart and windowEnd are required to change a window.', cutoffHours);
    }
    if (new Date(end) <= new Date(start)) {
      return refuse('INVALID_WINDOW', 'The new windowEnd must be after the new windowStart.', cutoffHours);
    }
  }

  if (status !== TruckAppointmentStatus.BOOKED && status !== 'BOOKED') {
    return refuse(
      'NOT_BOOKED',
      `Only a BOOKED window can be changed (this appointment is ${status}). ` +
        'A truck that has arrived or loaded is past the point a window change can help — record what happened instead.',
      cutoffHours,
    );
  }

  const closed = now >= new Date(windowEnd);
  if (closed && wantsNewWindow) {
    return refuse(
      'WINDOW_CLOSED',
      'This window has already closed, so a new window cannot be published into the past. ' +
        'Cancel it or mark the appointment no-show, then book a fresh window.',
      cutoffHours,
    );
  }

  const cutoffAt = new Date(new Date(windowStart).getTime() - cutoffHours * 3_600_000);
  const insideCutoff = now >= cutoffAt;
  const reason = input.reason?.trim();

  if (insideCutoff && !(input.force && reason)) {
    return refuse(
      'CUTOFF_NEEDS_FORCE',
      `This window starts within the ${cutoffHours}h change cut-off. ` +
        'Inside the cut-off a change must be forced with a recorded reason (force=true and note).',
      cutoffHours,
    );
  }

  return {
    allowed: true,
    forced: insideCutoff,
    insideCutoff,
    // Only reachable for a CANCELLED change: publishing a new window into a
    // closed slot is refused above. Recording it means the trail can show the
    // slot was already dead when the terminal cancelled it.
    windowAlreadyClosed: closed,
    cutoffHours,
  };
}

function refuse(code: WindowChangeCode, message: string, cutoffHours: number): WindowChangeAssessment {
  return { allowed: false, code, message, cutoffHours };
}

// ── Versioning / supersede ───────────────────────────────────────────────────

/**
 * The next version number for an appointment. Versions are 1-based and
 * monotonic: they are never reused, so a superseded version stays identifiable
 * forever and an acknowledgement can be pinned to the exact window it accepted.
 */
export function nextVersion(highestExisting: number | null | undefined): number {
  const base = typeof highestExisting === 'number' && Number.isFinite(highestExisting) ? highestExisting : 0;
  return Math.max(0, Math.floor(base)) + 1;
}

// ── Acknowledgement ──────────────────────────────────────────────────────────

export type AckCode = 'SUPERSEDED' | 'ALREADY_ACKED' | 'NOT_A_RECIPIENT';

export type AckAssessment =
  | { allowed: true; idempotentReplay: false }
  | { allowed: true; idempotentReplay: true }
  | { allowed: false; code: AckCode; message: string };

/**
 * May this recipient acknowledge this change?
 *
 *  - Acknowledging a SUPERSEDED version is refused with a pointer to the
 *    current version. Accepting a stale ack would record "the haulier knows"
 *    about a window that no longer exists — the exact failure the operator's
 *    rule is meant to prevent.
 *  - A repeat ack on the ACTIVE version is NOT an error: an offline driver's
 *    outbox flushes the same mutation more than once, and a dispatcher may tap
 *    twice on a bad connection. It returns the original acknowledgement
 *    (idempotentReplay) rather than creating a second one or moving `ackedAt`.
 */
export function assessAcknowledgement(input: {
  changeStatus: 'ACTIVE' | 'SUPERSEDED';
  ackState: 'UNACKED' | 'ACKNOWLEDGED';
  activeVersion?: number | null;
}): AckAssessment {
  if (input.changeStatus === 'SUPERSEDED') {
    return {
      allowed: false,
      code: 'SUPERSEDED',
      message:
        'That window version was superseded by a newer change and can no longer be acknowledged. ' +
        (input.activeVersion
          ? `Confirm version ${input.activeVersion} instead — it carries the window that is actually current.`
          : 'Reload the appointment to see the window that is currently in force.'),
    };
  }
  if (input.ackState === 'ACKNOWLEDGED') {
    return { allowed: true, idempotentReplay: true };
  }
  return { allowed: true, idempotentReplay: false };
}

// ── Escalation ladder ────────────────────────────────────────────────────────

export type EscalationStage = 'NONE' | 'REMINDER' | 'ESCALATED';

export interface EscalationAssessment {
  stage: EscalationStage;
  minutesSinceChange: number;
  /** Minutes until the ack is overdue (negative once it is). */
  minutesUntilDue: number;
  overdue: boolean;
  reminderDue: boolean;
  escalationDue: boolean;
}

/**
 * Where an unacknowledged recipient sits on the ladder, computed from the clock.
 *
 * Deliberately a pure function evaluated on read (the rail-handshake
 * escalation pattern) rather than something a cron has to remember to run: the
 * board can never show a stale "still fine" for a change that went quiet an
 * hour ago. An ACKNOWLEDGED recipient is always NONE — acknowledging stops the
 * ladder, it does not restart it.
 *
 * `ackDueMinutes` is frozen onto the recipient row at change time, so editing a
 * terminal's policy afterwards does not retroactively move the DEADLINE a
 * recipient was given. The reminder and escalation rungs are read live from the
 * terminal's policy: a terminal that re-tunes its ladder wants the new tuning
 * applied to the changes still open, and no recipient was ever told a reminder
 * time.
 */
export function assessEscalation(input: {
  changedAt: Date;
  now: Date;
  ackState: 'UNACKED' | 'ACKNOWLEDGED';
  ackDueMinutes: number;
  reminderAfterMinutes: number;
  escalateAfterMinutes: number;
}): EscalationAssessment {
  const minutesSinceChange = Math.max(
    0,
    Math.floor((new Date(input.now).getTime() - new Date(input.changedAt).getTime()) / 60_000),
  );
  if (input.ackState === 'ACKNOWLEDGED') {
    return {
      stage: 'NONE',
      minutesSinceChange,
      minutesUntilDue: input.ackDueMinutes - minutesSinceChange,
      overdue: false,
      reminderDue: false,
      escalationDue: false,
    };
  }
  const reminderDue = minutesSinceChange >= input.reminderAfterMinutes;
  const escalationDue = minutesSinceChange >= input.escalateAfterMinutes;
  const stage: EscalationStage = escalationDue ? 'ESCALATED' : reminderDue ? 'REMINDER' : 'NONE';
  return {
    stage,
    minutesSinceChange,
    minutesUntilDue: input.ackDueMinutes - minutesSinceChange,
    overdue: minutesSinceChange >= input.ackDueMinutes,
    reminderDue,
    escalationDue,
  };
}

/**
 * Terminal acknowledgement thresholds. A per-terminal policy row wins; when a
 * terminal has none, these documented constants apply. They are defaults chosen
 * for a gate operation, NOT measurements — nothing here claims to know how long
 * a given terminal actually takes.
 */
export const DEFAULT_GATE_ACK_POLICY = {
  ackDueMinutes: 30,
  reminderAfterMinutes: 15,
  escalateAfterMinutes: 45,
} as const;

export function resolveAckPolicy(
  policy: { ackDueMinutes?: number | null; reminderAfterMinutes?: number | null; escalateAfterMinutes?: number | null } | null | undefined,
): { ackDueMinutes: number; reminderAfterMinutes: number; escalateAfterMinutes: number; source: 'TERMINAL' | 'DEFAULT' } {
  const positive = (v: number | null | undefined, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
  if (!policy) return { ...DEFAULT_GATE_ACK_POLICY, source: 'DEFAULT' };
  return {
    ackDueMinutes: positive(policy.ackDueMinutes, DEFAULT_GATE_ACK_POLICY.ackDueMinutes),
    reminderAfterMinutes: positive(policy.reminderAfterMinutes, DEFAULT_GATE_ACK_POLICY.reminderAfterMinutes),
    escalateAfterMinutes: positive(policy.escalateAfterMinutes, DEFAULT_GATE_ACK_POLICY.escalateAfterMinutes),
    source: 'TERMINAL',
  };
}

// ── Delivery-state fidelity ──────────────────────────────────────────────────

/**
 * Delivery fidelity ordering. A recipient may be reached on several channels
 * (a driver gets a push tickle AND has the portal poll); the headline state is
 * the highest-fidelity one we ACTUALLY OBSERVED, never the most optimistic one
 * we hoped for.
 *
 *   UNAVAILABLE < QUEUED < PUBLISHED < SENT < DELIVERED
 *
 * FAILED is not on the ladder: it describes an attempt that errored, and it is
 * only the headline when nothing better was observed on another channel.
 */
export const DELIVERY_FIDELITY: Record<string, number> = {
  UNAVAILABLE: 0,
  FAILED: 1,
  QUEUED: 2,
  PUBLISHED: 3,
  SENT: 4,
  DELIVERED: 5,
};

/** Highest-fidelity state across a set of observed per-channel states. */
export function bestDeliveryState(states: string[]): string {
  if (!states.length) return 'QUEUED';
  return states.reduce((best, s) =>
    (DELIVERY_FIDELITY[s] ?? -1) > (DELIVERY_FIDELITY[best] ?? -1) ? s : best,
  );
}

/**
 * Reasons a recipient has no delivery. Machine-readable so the UI renders
 * "DRIVER NOT ASSIGNED" instead of an empty cell — and so nobody can mistake
 * the absence of a recipient for a successful notification.
 */
export const DELIVERY_UNAVAILABLE_REASON = {
  DRIVER_NOT_ASSIGNED: 'DRIVER_NOT_ASSIGNED',
  NO_SHARE_TOKEN: 'NO_SHARE_TOKEN',
  SHARE_TOKEN_EXPIRED: 'SHARE_TOKEN_EXPIRED',
  PUSH_NOT_CONFIGURED: 'PUSH_NOT_CONFIGURED',
  NO_PUSH_SUBSCRIPTION: 'NO_PUSH_SUBSCRIPTION',
  NO_SOCKET_RECEIPT: 'NO_SOCKET_RECEIPT',
} as const;

// ── Measurement ──────────────────────────────────────────────────────────────

/**
 * Nearest-rank percentile over an ascending-sorted sample.
 *
 * Nearest-rank (not interpolated) because the sample sizes here are small —
 * with n=4 an interpolated P90 invents a value between two observations, and
 * the whole point of these numbers is that they are defensible. Returns null
 * for an empty sample: an absent measurement is UNKNOWN, never 0.
 */
export function percentile(sortedAscending: number[], p: number): number | null {
  const values = sortedAscending.filter((v) => Number.isFinite(v));
  if (!values.length) return null;
  if (p <= 0) return values[0];
  if (p >= 100) return values[values.length - 1];
  const rank = Math.ceil((p / 100) * values.length);
  return values[Math.min(values.length, Math.max(1, rank)) - 1];
}

export function median(values: number[]): number | null {
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

export interface AckLatencySample {
  /** Server-observed acknowledgement time minus the change time, in minutes. */
  minutes: number;
}

export interface AckLatencySummary {
  medianMinutes: number | null;
  p90Minutes: number | null;
  n: number;
  minMinutes: number | null;
  maxMinutes: number | null;
}

/**
 * change→ack latency. `n` is reported alongside every figure: a median of 4
 * minutes over n=2 is not evidence of anything, and the UI must show that.
 */
export function summariseAckLatency(samples: AckLatencySample[]): AckLatencySummary {
  const values = samples
    .map((s) => s.minutes)
    .filter((m) => Number.isFinite(m))
    .sort((a, b) => a - b);
  return {
    medianMinutes: median(values),
    p90Minutes: percentile(values, 90),
    n: values.length,
    minMinutes: values.length ? values[0] : null,
    maxMinutes: values.length ? values[values.length - 1] : null,
  };
}

export interface AckedBeforeArrivalInput {
  /** Server-observed ack time, or null when nobody acknowledged. */
  ackedAt: Date | null;
  /** Terminal-recorded arrival, or null when the truck never arrived. */
  arrivedAt: Date | null;
  /**
   * Whether ANY recipient of this change was actually reachable. A change whose
   * only recipients were unreachable (no driver assigned, no share link issued)
   * could not have been acknowledged by anybody, so counting it as a failure
   * would blame the terminal for a gap in its own data. Defaults to true.
   */
  reachable?: boolean;
}

/**
 * "% of changes acknowledged before the truck arrived".
 *
 * The denominator is only changes where BOTH a change time and a recorded
 * arrival exist — otherwise the question has no answer. Everything else is
 * counted and reported as excluded, with the reason, so the percentage can
 * never quietly shrink its denominator to look better.
 */
export function summariseAckedBeforeArrival(
  rows: AckedBeforeArrivalInput[],
): {
  ackedBeforeArrival: number;
  ackedAfterArrival: number;
  neverAcked: number;
  denominator: number;
  excludedNoArrival: number;
  excludedUnreachable: number;
  percent: number | null;
} {
  let ackedBeforeArrival = 0;
  let ackedAfterArrival = 0;
  let neverAcked = 0;
  let excludedNoArrival = 0;
  let excludedUnreachable = 0;

  for (const r of rows) {
    // Unreachable first: it is a stronger exclusion than a missing arrival,
    // because nobody could have confirmed even if the truck had arrived.
    if (r.reachable === false) {
      excludedUnreachable += 1;
      continue;
    }
    if (!r.arrivedAt) {
      excludedNoArrival += 1;
      continue;
    }
    if (!r.ackedAt) {
      neverAcked += 1;
      continue;
    }
    if (new Date(r.ackedAt) <= new Date(r.arrivedAt)) ackedBeforeArrival += 1;
    else ackedAfterArrival += 1;
  }

  const denominator = ackedBeforeArrival + ackedAfterArrival + neverAcked;
  return {
    ackedBeforeArrival,
    ackedAfterArrival,
    neverAcked,
    denominator,
    excludedNoArrival,
    excludedUnreachable,
    percent: denominator ? Math.round((ackedBeforeArrival / denominator) * 1000) / 10 : null,
  };
}

// ── Acknowledgement rate, per recipient type ─────────────────────────────────

export interface AckRateInput {
  /** HAULIER or DRIVER — the two are measured separately, never merged. */
  recipientType: string;
  acknowledged: boolean;
  /**
   * False when the recipient had no deliverable channel: no driver assigned, no
   * share link, push not configured. Such a recipient is EXCLUDED from the
   * denominator and reported as its own count — an acknowledgement rate that
   * counted them would report a data gap as a performance failure.
   */
  reachable: boolean;
  /** True for a DRIVER row whose reason is DRIVER_NOT_ASSIGNED. */
  notAssigned?: boolean;
}

export interface AckRateSummary {
  acknowledged: number;
  notAcknowledged: number;
  /** Reachable recipients: the denominator the percentage is computed on. */
  denominator: number;
  /** Excluded from the denominator, counted on their own. */
  unreachable: number;
  driverNotAssigned: number;
  percent: number | null;
  percentText: string;
}

/**
 * Acknowledgement rate with its denominator stated.
 *
 * `percent` is null (rendered UNKNOWN) when nothing was reachable: an empty
 * denominator has no rate, and 0% would be a lie in the other direction.
 */
export function summariseAckRate(rows: AckRateInput[]): AckRateSummary {
  let acknowledged = 0;
  let notAcknowledged = 0;
  let unreachable = 0;
  let driverNotAssigned = 0;

  for (const r of rows) {
    if (r.notAssigned) driverNotAssigned += 1;
    if (!r.reachable) {
      unreachable += 1;
      continue;
    }
    if (r.acknowledged) acknowledged += 1;
    else notAcknowledged += 1;
  }

  const denominator = acknowledged + notAcknowledged;
  const percent = denominator ? Math.round((acknowledged / denominator) * 1000) / 10 : null;
  return {
    acknowledged,
    notAcknowledged,
    denominator,
    unreachable,
    driverNotAssigned,
    percent,
    percentText: percent === null ? 'UNKNOWN' : `${percent}%`,
  };
}

/**
 * Format minutes for a human being under pressure at a gate.
 *
 * Never rounds a sub-minute latency down to "0 min" — that would read as
 * instantaneous and hide the real figure. Rounds ONCE, then decomposes, so a
 * latency of 119.7 minutes reads "2h" and never "1h 60m".
 *
 * Values below 1 minute (including a negative value from a client clock ahead
 * of the server — callers floor elapsed time at 0) all read "<1 min".
 */
export function formatDurationMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return 'UNKNOWN';
  if (minutes < 1) return '<1 min';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
