import { BadRequestException, Logger } from '@nestjs/common';
import { WaybillStatus } from '@prisma/client';

/**
 * Waybill lifecycle state machine.
 *
 * Real freight moves through a defined chain of custody:
 *
 *   PENDING → COLLECTED → AT_ORIGIN_HUB → (IN_TRANSIT linehaul) →
 *   AT_DESTINATION_HUB → OUT_FOR_DELIVERY → DELIVERED
 *
 * with exception branches (FAILED_DELIVERY, RETURNED, CANCELLED) reachable from
 * the operational states. This module is the single source of truth for which
 * status transitions are legal, so the codebase stops doing arbitrary
 * `prisma.waybill.update({ data: { status }})` jumps.
 *
 * ENFORCEMENT (moved from opt-in to strict-by-default)
 * ----------------------------------------------------
 * The machine used to log illegal transitions and let them through, which meant
 * a scrambled waybill was only ever discovered by a customer. Every caller has
 * now been audited (see the transition registry below), so the default is
 * STRICT: an illegal transition is refused before any write.
 *
 *   WAYBILL_TRANSITION_MODE=strict|warn|off   (default: strict)
 *   WAYBILL_STRICT_TRANSITIONS=true|false     (legacy alias, still honoured)
 *
 *   strict — refuse (throw) and let the caller audit the refusal
 *   warn   — log loudly and allow (the old rollout behaviour, for emergencies)
 *   off    — allow silently (only for a deliberately disabled environment)
 *
 * WARNING is for a live incident where an unexpected-but-real-world transition
 * must not block operations: it is visible in the logs but never silent.
 */

// Direct-to-door couriers (no linehaul) legitimately go COLLECTED → OUT_FOR_DELIVERY,
// so that shortcut is intentionally legal too. The hub path is REQUIRED only when
// a waybill is loaded onto a linehaul (enforced separately at manifest-load time).
const LEGAL: Record<WaybillStatus, WaybillStatus[]> = {
  PENDING:            ['COLLECTED', 'AT_ORIGIN_HUB', 'CANCELLED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'],
  COLLECTED:          ['AT_ORIGIN_HUB', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURNED', 'CANCELLED'],
  AT_ORIGIN_HUB:      ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'AT_DESTINATION_HUB', 'CANCELLED'],
  IN_TRANSIT:         ['AT_DESTINATION_HUB', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURNED', 'CANCELLED'],
  AT_DESTINATION_HUB: ['OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURNED', 'CANCELLED'],
  OUT_FOR_DELIVERY:   ['DELIVERED', 'FAILED_DELIVERY', 'RETURNED'],
  DELIVERED:          [],                 // terminal
  FAILED_DELIVERY:    ['OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'AT_DESTINATION_HUB', 'CANCELLED'], // re-attempt; a successful second visit is completed directly
  RETURNED:           ['CANCELLED'],
  CANCELLED:          [],                 // terminal
};

/**
 * Who may perform each transition, as documentation-in-code. This is not
 * enforced here (authorisation belongs to the calling feature) but it is the
 * registry used when reviewing a new write path: if a caller does not appear
 * here, the transition it performs needs a deliberate decision.
 *
 *  - `waybills.update`        — dispatch/office editing a waybill (PATCH)
 *  - `waybills.batchScan`     — warehouse bulk scan-in
 *  - `logistics-ops.receive`  — depot receive / hub arrival (strict + CAS)
 *  - `logistics-ops.attempt`  — failed delivery attempt and return-to-sender
 *  - `driver-portal.linehaul` — linehaul arrival at the destination branch
 *  - `epod.capture`           — proof-of-delivery completion
 *  - `cod.geofence`           — GPS geofence auto-advance
 */
export const TRANSITION_CALLERS: Record<string, string[]> = {
  'waybills.update': ['PENDING', 'COLLECTED', 'AT_ORIGIN_HUB', 'IN_TRANSIT', 'AT_DESTINATION_HUB', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURNED', 'CANCELLED'],
  'waybills.batchScan': ['COLLECTED', 'AT_ORIGIN_HUB', 'AT_DESTINATION_HUB', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURNED'],
  'logistics-ops.receive': ['AT_ORIGIN_HUB', 'AT_DESTINATION_HUB'],
  'logistics-ops.attempt': ['FAILED_DELIVERY', 'RETURNED', 'COLLECTED'],
  'driver-portal.linehaul': ['AT_DESTINATION_HUB'],
  'epod.capture': ['DELIVERED'],
  'cod.geofence': ['OUT_FOR_DELIVERY'],
};

export type TransitionMode = 'strict' | 'warn' | 'off';

const logger = new Logger('WaybillStatusMachine');

/**
 * Resolve the enforcement mode. Strict is the default; the legacy boolean env
 * var maps onto it (`false` used to mean log-and-allow, i.e. `warn`).
 */
export function getTransitionMode(): TransitionMode {
  const legacy = process.env.WAYBILL_STRICT_TRANSITIONS;
  if (legacy === 'true' || legacy === '1') return 'strict';
  if (legacy === 'false' || legacy === '0') return 'warn';

  const configured = (process.env.WAYBILL_TRANSITION_MODE ?? 'strict').toLowerCase().trim();
  if (configured === 'warn' || configured === 'off' || configured === 'strict') return configured;
  logger.warn(
    `Unknown WAYBILL_TRANSITION_MODE="${configured}" — falling back to strict enforcement`,
  );
  return 'strict';
}

/** Is moving from `from` to `to` a legal transition? A no-op is always allowed. */
export function isLegalTransition(from: WaybillStatus, to: WaybillStatus): boolean {
  if (from === to) return true;
  return (LEGAL[from] ?? []).includes(to);
}

/** The legal next states for a status (used by API error messages and the UI). */
export function legalNextStatuses(from: WaybillStatus): WaybillStatus[] {
  return [...(LEGAL[from] ?? [])];
}

/** Build the refusal message (also used verbatim in audit rows). */
export function illegalTransitionMessage(
  from: WaybillStatus,
  to: WaybillStatus,
  ctx: { waybillId?: string; trackingNumber?: string; actor?: string } = {},
): string {
  const label = ctx.trackingNumber ?? ctx.waybillId ?? 'unknown';
  const legal = (LEGAL[from] ?? []).join(', ') || 'none (terminal state)';
  return (
    `Illegal waybill transition ${from} → ${to} (waybill ${label}` +
    (ctx.actor ? `, by ${ctx.actor}` : '') +
    `). Legal next: [${legal}].`
  );
}

/**
 * Which statuses may legally move TO `to` — the inverse of the table above.
 *
 * Callers that claim a row with a compare-and-set (putting a status whitelist
 * in the `WHERE` clause) derive that whitelist from here. That matters: a
 * hand-written whitelist is how `driver-portal.linehaul` quietly accepted
 * COLLECTED → AT_DESTINATION_HUB and OUT_FOR_DELIVERY → AT_DESTINATION_HUB,
 * which the table refuses. One source of truth, or the whitelist drifts.
 */
export function legalPredecessorStatuses(to: WaybillStatus): WaybillStatus[] {
  return (Object.keys(LEGAL) as WaybillStatus[]).filter((from) =>
    (LEGAL[from] ?? []).includes(to),
  );
}

/**
 * Assert (or, in non-strict mode, only warn about) a transition.
 *
 * In strict mode an illegal transition is refused through `onIllegal` (so the
 * caller can audit it and raise its own HTTP error) or, if the caller passed
 * none, as a `BadRequestException` — never as a bare 500.
 */
export function guardTransition(
  from: WaybillStatus | null | undefined,
  to: WaybillStatus,
  ctx: { waybillId?: string; trackingNumber?: string; actor?: string } = {},
  onIllegal?: (msg: string) => never,
): void {
  // Unknown/missing prior status → allow (e.g. brand-new record); nothing to guard.
  if (!from) return;
  if (isLegalTransition(from, to)) return;

  const msg = illegalTransitionMessage(from, to, ctx);
  const mode = getTransitionMode();

  if (mode === 'strict') {
    if (onIllegal) onIllegal(msg);
    throw new BadRequestException(msg);
  }
  if (mode === 'warn') {
    logger.warn(`[allow-and-log] ${msg}`);
    return;
  }
  // mode === 'off': deliberately silent.
}

/** Expose the map for docs / tests / a future admin view. */
export const WAYBILL_TRANSITIONS = LEGAL;
