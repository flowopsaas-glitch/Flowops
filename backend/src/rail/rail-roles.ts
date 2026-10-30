import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * Rail / Daily Handshake role sets.
 *
 * Evidence: the frontend permission matrix (frontend/src/lib/tenantUserPermissions.ts)
 * enables `rail` / `railHandshake` for ADMIN, COMPANY_ADMIN, MANAGER and DISPATCH,
 * makes them read-only for VIEWER, and hides them from DRIVER and WAREHOUSE. The
 * API enforces the same split so the UI is never more permissive than the server.
 *
 * `OPS_CLERK` appears in the Wave-1 brief but is NOT a value of the Prisma
 * `UserRole` enum (schema.prisma `enum UserRole`: ADMIN, COMPANY_ADMIN, MANAGER,
 * DISPATCH, WAREHOUSE, AGENT, USER, DRIVER, VIEWER). Adding it needs
 * `ALTER TYPE ... ADD VALUE`, which Wave 1 (zero DB migration) excludes — so it
 * is handled in the frontend matrix only, until the owner decides to add it.
 */

/** May read rail data. */
export const RAIL_READ_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.DISPATCH,
  UserRole.VIEWER,
];

/** May change rail data (everything except VIEWER). */
export const RAIL_WRITE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.DISPATCH,
];

/**
 * May make formal commitments on the tenant's behalf: sign off a handshake
 * report, resolve an item, or lodge a dispute with the Regulator. A signature is
 * an attestation by an authorised representative (Annexure 21: TOCs must send
 * "designated, authorised representatives"), so dispatch-level users are excluded.
 */
export const RAIL_SIGNATORY_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
];

/** Throw 403 unless the actor is an authorised representative. Used for formal commitments. */
export function assertSignatoryRole(actor: { role: UserRole }, what: string): void {
  if (!RAIL_SIGNATORY_ROLES.includes(actor.role)) {
    throw new ForbiddenException(`${what} must be made by an authorised representative (${RAIL_SIGNATORY_ROLES.join(', ')}).`);
  }
}

// ── Terminal gate windows: who may MOVE a published window ────────────────────

/**
 * The authority to change a published truck gate window.
 *
 * The rule this implements (validated by a terminal operator in a private
 * conversation, not a customer endorsement): *"A window can be changed by the
 * terminal operator, but hauliers must be informed quickly during the
 * transportation flow. Terminal operators are the guide of the whole process."*
 *
 * FlowOps has ONE tenant per deployment, and in that tenant the terminal-side
 * supervisors and the haulier's dispatch desk are users of the same company. So
 * "has rail write" is NOT a sufficient authority for moving a window: it would
 * let a dispatcher on the haulier side re-time the terminal's gate, which is
 * exactly what the rule forbids. This is therefore its own, dedicated
 * permission — separate from `RAIL_WRITE_ROLES` — and it is enforced in the
 * SERVICE (`RailTruckWindowChangesService.publishWindowChange`), not only on the
 * routes, so no controller, cron or future caller can bypass it.
 *
 * Who MAY change a window (exhaustive — these are the only three values):
 *   ADMIN, COMPANY_ADMIN, MANAGER — an authorised representative of the tenant
 *   that owns the appointment record, the same bar as a handshake sign-off.
 *
 * Who may NOT, and what they get instead:
 *   DISPATCH   — may READ the board and may ACKNOWLEDGE a change on the haulier
 *                organisation's behalf (confirming receipt is dispatch work),
 *                but may not move a window or edit the ack thresholds.
 *   VIEWER     — read only.
 *   WAREHOUSE, AGENT, USER, DRIVER — no rail access at all; a DRIVER session in
 *                the driver portal may acknowledge its own window and nothing else.
 *   A share-token holder (the counterparty outside the tenant) — the token is a
 *                READ + CONFIRM credential. There is no route by which it can
 *                publish, reschedule, cancel or replan a window, and the service
 *                refuses a null actor outright.
 *   A user of another tenant — refused by tenant scoping before authority is
 *                even considered.
 */
export const RAIL_WINDOW_CHANGE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
];

/** Whether a role holds the dedicated window-change permission. */
export function canChangeWindow(role: UserRole | string | null | undefined): boolean {
  return !!role && (RAIL_WINDOW_CHANGE_ROLES as string[]).includes(String(role));
}

/**
 * Throw 403 unless the actor holds the window-change permission.
 *
 * A missing actor is refused explicitly rather than defaulting to "system":
 * every window movement in this product is attributable to a named human being
 * in the tenant, because the change record is the evidence a terminal and a
 * haulier both rely on.
 */
export function assertWindowChangeAuthority(
  actor: { role?: UserRole | string | null } | null | undefined,
  what = 'A gate window change',
): void {
  if (!actor || !actor.role) {
    throw new ForbiddenException(
      `${what} must be published by an authenticated user of the tenant that owns the appointment. ` +
      'A share link or a driver session can read and confirm a window; neither can move one.',
    );
  }
  if (!canChangeWindow(actor.role)) {
    throw new ForbiddenException(
      `${what} requires the window-change permission (${RAIL_WINDOW_CHANGE_ROLES.join(', ')}). ` +
      `${String(actor.role)} may read the acknowledgement board and confirm a change on the haulier's behalf, ` +
      'but may not move a published window — ask a terminal-side manager to publish it.',
    );
  }
}
