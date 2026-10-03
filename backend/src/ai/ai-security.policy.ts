import { UserRole } from '@prisma/client';

/**
 * AI security policy — one place for the decisions that gate the AI surface, so
 * controllers, services and tests all read the same values.
 *
 * Evidence for the role sets: the frontend permission matrix enables
 * `aiControlTower` / `copilot` for exactly ADMIN, COMPANY_ADMIN, MANAGER and
 * DISPATCH (frontend/src/lib/tenantUserPermissions.ts, role branches for
 * COMPANY_ADMIN/ADMIN, MANAGER and DISPATCH). WAREHOUSE, DRIVER and VIEWER have
 * `aiControlTower: false`, so the API must not be more permissive than the UI.
 */

/** Roles that may drive the Claw terminal, the WhatsApp mock endpoints and tenant diagnostics. */
export const AI_OPERATIONAL_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.DISPATCH,
];

/** Roles that may trigger repair / upgrade / chaos-simulation routines. */
export const AI_ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.COMPANY_ADMIN];

/**
 * Hard-block threshold for `sanitizeAiInput().riskScore`. Input at or above
 * this never reaches the model. The same value is used by ClawService,
 * WhatsAppInboxAiService and SupportService, so the platform has one threshold.
 *
 * Input that is merely *flagged* (`injectionDetected`, score >= 25) still
 * reaches the model — but its output can never trigger an `ai-action`.
 */
export const AI_INJECTION_BLOCK_SCORE = 75;

/** `AiEvent.type` values written by the AI security layer (free-text column — no migration needed). */
export const AI_SECURITY_EVENT_TYPE = {
  PROMPT_INJECTION_BLOCKED: 'PROMPT_INJECTION_BLOCKED',
  UNSAFE_ACTION_BLOCKED: 'UNSAFE_ACTION_BLOCKED',
} as const;
export type AiSecurityEventType = (typeof AI_SECURITY_EVENT_TYPE)[keyof typeof AI_SECURITY_EVENT_TYPE];

/** What happened to a flagged request — stored in `AiEvent.metadata.disposition`. */
export type AiSecurityDisposition =
  | 'BLOCKED_BEFORE_MODEL'
  | 'SHIELD_UNSAFE'
  | 'ACTIONS_SUPPRESSED'
  | 'ACTION_REMOVED';

/**
 * Fail-closed gate for autonomous code repair (`git checkout -b`, file writes,
 * `npm run build`, `git push`, and `git reset --hard` on failure).
 *
 * In production it is OFF unless the operator explicitly sets
 * `ALLOW_AI_SELF_REPAIR=true`. Outside production behaviour is unchanged.
 */
export function isAiSelfRepairAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return env.ALLOW_AI_SELF_REPAIR === 'true';
  return true;
}

/**
 * Fail-closed gate for the "chaos" endpoint, which deliberately corrupts a
 * waybill (FAILED_DELIVERY, totalAmount 0). Off in production unless
 * `ALLOW_AI_CHAOS_SIMULATION=true`.
 */
export function isAiChaosSimulationAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return env.ALLOW_AI_CHAOS_SIMULATION === 'true';
  return true;
}
