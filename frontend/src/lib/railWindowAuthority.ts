/**
 * Who may move a published truck gate window — the frontend's copy of the
 * backend rule.
 *
 * The SERVER is authoritative (`RAIL_WINDOW_CHANGE_ROLES` +
 * `assertWindowChangeAuthority` in `backend/src/rail/rail-roles.ts`, enforced
 * inside `RailTruckWindowChangesService.publishWindowChange`). This list exists
 * only so the UI does not offer a control that will be refused: a dispatcher who
 * cannot move a window should see why, not discover it from a 403 toast after
 * filling in a form.
 *
 * The rule, in words: FlowOps has one tenant per deployment, and inside it sit
 * both the terminal-side supervisors and the haulier's own dispatch desk. So
 * "can write rail data" is not the same as "can re-time the terminal's gate".
 * ADMIN, COMPANY_ADMIN and MANAGER hold the window-change permission; DISPATCH
 * may read the acknowledgement board and confirm that a change reached the
 * haulier, but may not move a window or edit the acknowledgement thresholds.
 * A share-link holder and a driver session can confirm and nothing else.
 */

/** Mirrors `RAIL_WINDOW_CHANGE_ROLES` on the server. */
export const WINDOW_CHANGE_ROLES = ["ADMIN", "COMPANY_ADMIN", "MANAGER"] as const;

export type WindowChangeRole = (typeof WINDOW_CHANGE_ROLES)[number];

/** Whether a role holds the window-change permission. Unknown roles are refused. */
export function canChangeWindowRole(role?: string | null): role is WindowChangeRole {
  return !!role && (WINDOW_CHANGE_ROLES as readonly string[]).includes(role);
}

/** What a user without the permission is told, so the disabled control explains itself. */
export const WINDOW_CHANGE_DENIED_HINT =
  "Your role can read the acknowledgement board and confirm that a change reached the haulier, " +
  "but only a terminal-side manager (ADMIN, COMPANY_ADMIN, MANAGER) can move a published window.";
