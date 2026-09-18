import { Logger } from '@nestjs/common';
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
 * ROLLOUT SAFETY: enforcement is OFF by default (STRICT = false). In this mode
 * an illegal transition is LOGGED but ALLOWED, so introducing the machine can
 * never break a working flow. Once the logs are clean in real use, flip STRICT
 * to true (or set env WAYBILL_STRICT_TRANSITIONS=true) to actively block bad
 * transitions.
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
  FAILED_DELIVERY:    ['OUT_FOR_DELIVERY', 'RETURNED', 'AT_DESTINATION_HUB', 'CANCELLED'], // re-attempt
  RETURNED:           ['CANCELLED'],
  CANCELLED:          [],                 // terminal
};

const logger = new Logger('WaybillStatusMachine');

function strictEnabled(): boolean {
  // Env override wins; otherwise default OFF for a safe rollout.
  const env = process.env.WAYBILL_STRICT_TRANSITIONS;
  if (env != null) return env === 'true' || env === '1';
  return false;
}

/** Is moving from `from` to `to` a legal transition? A no-op (from === to) is always allowed. */
export function isLegalTransition(from: WaybillStatus, to: WaybillStatus): boolean {
  if (from === to) return true;
  return (LEGAL[from] ?? []).includes(to);
}

/**
 * Assert (or, in non-strict mode, just warn about) a transition.
 *
 * @returns true if the transition should proceed, false only in the impossible
 *          case where a caller wants to branch on it. In STRICT mode an illegal
 *          transition throws the provided error type via `onIllegal`.
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

  const label = ctx.trackingNumber ?? ctx.waybillId ?? 'unknown';
  const msg =
    `Illegal waybill transition ${from} → ${to} (waybill ${label}` +
    (ctx.actor ? `, by ${ctx.actor}` : '') + `). Legal next: [${(LEGAL[from] ?? []).join(', ') || 'none'}].`;

  if (strictEnabled()) {
    if (onIllegal) onIllegal(msg);
    throw new Error(msg);
  }
  // Non-breaking rollout: record it so we can see real-world transitions before enforcing.
  logger.warn(`[allow-and-log] ${msg}`);
}

/** Expose the map for docs / tests / a future admin view. */
export const WAYBILL_TRANSITIONS = LEGAL;
