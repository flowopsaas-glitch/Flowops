import { BadRequestException } from '@nestjs/common';

/**
 * Shared plumbing for the terminal gate layer (truck appointments + window
 * changes).
 *
 * These live outside both services on purpose. `RailTruckAppointmentsService`
 * needs to hand a window change to `RailTruckWindowChangesService`, and the
 * change service needs the same cut-off and conflict answers — if each injected
 * the other, Nest would have a circular dependency to resolve. Extracting the
 * shared reads as free functions over a Prisma client keeps the dependency
 * arrow pointing one way (appointments → changes) and means there is exactly
 * one definition of "inside the cut-off" for the whole gate.
 */

/** The slice of PrismaService these helpers need (also satisfied by a tx client). */
export interface GatePrisma {
  company: {
    findUnique(args: { where: { id: string }; select: Record<string, boolean> }): Promise<any>;
  };
  terminalTruckAppointment: {
    findMany(args: any): Promise<any[]>;
  };
}

/** Default hours before window start inside which a change is a "late change". */
export const DEFAULT_GATE_CUTOFF_HOURS = 2;

/**
 * Per-company gate cut-off. A missing, negative or non-numeric value falls back
 * to the documented default rather than to 0 — 0 would silently disable the
 * forced-reason rule and let late changes through ungoverned.
 */
export async function readGateCutoffHours(prisma: GatePrisma, companyId: string): Promise<number> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { terminalGateCutoffHours: true },
  });
  const hours = company?.terminalGateCutoffHours;
  return typeof hours === 'number' && hours >= 0 ? hours : DEFAULT_GATE_CUTOFF_HOURS;
}

/** Parse + order-check a window. Throws BadRequestException with a usable message. */
export function validateGateWindow(startIso: string, endIso: string): { start: Date; end: Date } {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('windowStart and windowEnd must be valid dates');
  }
  if (end <= start) throw new BadRequestException('windowEnd must be after windowStart');
  return { start, end };
}

/**
 * Active appointments at the same terminal overlapping [start, end).
 *
 * Overlaps are REPORTED, never auto-resolved: the terminal operator governs
 * conflicts, because a scheduling engine that silently moved a truck would be
 * making an operational decision nobody asked it to make.
 */
export async function findGateConflicts(
  prisma: GatePrisma,
  companyId: string,
  terminalName: string,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  return prisma.terminalTruckAppointment.findMany({
    where: {
      companyId,
      terminalName: { equals: terminalName, mode: 'insensitive' },
      status: { in: ['BOOKED', 'ARRIVED', 'LOADING'] as any },
      windowStart: { lt: end },
      windowEnd: { gt: start },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      haulierName: true,
      vehicleReg: true,
      windowStart: true,
      windowEnd: true,
      status: true,
    },
    orderBy: { windowStart: 'asc' },
  });
}

/**
 * Is this share token still usable?
 *
 * Three separate questions with three separate answers, because they have
 * different consequences:
 *  - revoked / never issued  → the counterparty has no view at all
 *  - expired                 → the view is gone; re-issue to restore it
 *  - legacy (no expiry set)  → still READABLE (a link already in a haulier's
 *    inbox must not break), but NOT usable to acknowledge a change: an
 *    unauthenticated mutation behind a token with no recorded expiry is exactly
 *    what the closed loop must not allow.
 */
export type ShareTokenValidity =
  | { state: 'VALID'; expiresAt: Date | null }
  | { state: 'LEGACY_NO_EXPIRY'; issuedAt: Date | null }
  | { state: 'EXPIRED'; expiredAt: Date }
  | { state: 'ABSENT' };

export function assessShareToken(appt: {
  shareToken?: string | null;
  shareTokenIssuedAt?: Date | null;
  shareTokenExpiresAt?: Date | null;
}, now: Date): ShareTokenValidity {
  if (!appt.shareToken) return { state: 'ABSENT' };
  if (!appt.shareTokenExpiresAt) {
    return { state: 'LEGACY_NO_EXPIRY', issuedAt: appt.shareTokenIssuedAt ?? null };
  }
  if (new Date(appt.shareTokenExpiresAt) <= now) {
    return { state: 'EXPIRED', expiredAt: new Date(appt.shareTokenExpiresAt) };
  }
  return { state: 'VALID', expiresAt: new Date(appt.shareTokenExpiresAt) };
}

/**
 * The state of a counterparty share link, as the TERMINAL needs to see it —
 * without the token itself.
 *
 * `LEGACY_NO_EXPIRY` is the residual risk in this design and it is deliberately
 * surfaced rather than hidden: a link issued before expiry enforcement has no
 * expiry on record, so it stays readable until somebody revokes it, and it can
 * never be used to confirm a window change. An operator has to be able to see
 * which of their links are in that state and kill them in one click.
 */
export interface ShareLinkStateView {
  state: ShareTokenValidity['state'];
  /** True only for LEGACY_NO_EXPIRY — readable, unexpiring, cannot confirm. */
  legacy: boolean;
  canAcknowledge: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
  warning: string | null;
}

export function shareLinkState(
  appt: { shareToken?: string | null; shareTokenIssuedAt?: Date | null; shareTokenExpiresAt?: Date | null },
  now: Date = new Date(),
): ShareLinkStateView {
  const validity = assessShareToken(appt, now);
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  const base = {
    state: validity.state,
    legacy: validity.state === 'LEGACY_NO_EXPIRY',
    canAcknowledge: validity.state === 'VALID',
    issuedAt: iso(appt.shareTokenIssuedAt ?? null),
    expiresAt: validity.state === 'VALID' ? iso(validity.expiresAt) : null,
  };
  switch (validity.state) {
    case 'ABSENT':
      return { ...base, warning: null };
    case 'LEGACY_NO_EXPIRY':
      return {
        ...base,
        warning: 'LEGACY LINK — issued before expiry enforcement. It never expires and the holder can read this '
          + 'appointment until you revoke it, but they cannot confirm a window change with it. Revoke and re-issue.',
      };
    case 'EXPIRED':
      return { ...base, expiresAt: iso(appt.shareTokenExpiresAt ?? null), warning: 'Link expired — the counterparty can no longer read this appointment. Re-issue it if they still need the window.' };
    default:
      return { ...base, warning: null };
  }
}

/** Share links are short-lived by design: a gate window is a same-week fact. */
export const SHARE_TOKEN_TTL_DAYS = 7;

export function shareTokenExpiryFrom(issuedAt: Date, ttlDays = SHARE_TOKEN_TTL_DAYS): Date {
  return new Date(new Date(issuedAt).getTime() + ttlDays * 24 * 3_600_000);
}

/**
 * A share token is a CAPABILITY, not a display field.
 *
 * Whoever holds one can read the appointment without logging in
 * (`GET public/:token`) and can perform the only unauthenticated mutation in
 * the product (`POST public/:token/ack` — acknowledging a window change). So a
 * token sitting in an ordinary tenant response is not extra data: it is a
 * bearer credential handed to every role that can read that response. The
 * appointment list is served to the rail READ roles, which include VIEWER —
 * deliberately read-only, since `POST :id/ack` requires rail WRITE. A VIEWER who
 * can copy a token out of a list response can confirm a window change through
 * the public route, which is a privilege bypass rather than a leak of a label.
 *
 * The token therefore leaves the server in exactly one place: the response of
 * `POST :id/share`, which creates or rotates it for a caller who already holds
 * rail WRITE and needs the value in order to send it to the counterparty.
 * Every row-shaped tenant response goes through this helper instead, so a new
 * endpoint cannot re-leak it by spreading an appointment.
 *
 * The issued/expiry timestamps stay: they are facts about the link, not the
 * credential, and `shareLinkState()` already surfaces them to the terminal.
 */
export function withoutShareToken<T extends { shareToken?: unknown }>(appt: T): Omit<T, 'shareToken'> {
  const { shareToken: _shareToken, ...rest } = appt;
  return rest;
}

/**
 * Human-readable window text used in notifications, notes and audit metadata.
 * UTC-safe and explicit about the date, because a window that moves across
 * midnight is the case where "14:00 – 16:00" alone is actively misleading.
 */
export function formatWindow(start: Date | null | undefined, end: Date | null | undefined): string {
  if (!start || !end) return 'no window';
  const s = new Date(start);
  const e = new Date(end);
  const date = s.toISOString().slice(0, 10);
  const sameDay = e.toISOString().slice(0, 10) === date;
  const hm = (d: Date) => d.toISOString().slice(11, 16);
  return sameDay ? `${date} ${hm(s)}–${hm(e)} UTC` : `${date} ${hm(s)} – ${e.toISOString().slice(0, 10)} ${hm(e)} UTC`;
}
