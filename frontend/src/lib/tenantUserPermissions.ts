import {
  PERMISSION_REGISTRY,
  ROLE_ALIASES,
  TENANT_USER_ROLES,
  type PermissionDefinition,
} from "./permissionRegistry";

export type TenantNavPermissionKey =
  (typeof PERMISSION_REGISTRY)[number]["key"];

export type TenantNavPermissions = Record<TenantNavPermissionKey, boolean>;

export const TENANT_NAV_PERMISSION_LABELS = Object.fromEntries(
  PERMISSION_REGISTRY.map((p) => [p.key, p.label]),
) as Record<TenantNavPermissionKey, string>;

export const ALL_TENANT_NAV_PERMISSION_KEYS = PERMISSION_REGISTRY.map(
  (p) => p.key,
) as TenantNavPermissionKey[];

export function buildFullTenantNavPermissions(): TenantNavPermissions {
  return Object.fromEntries(
    PERMISSION_REGISTRY.map((p) => [p.key, true]),
  ) as TenantNavPermissions;
}

/**
 * The permissions a role gets before any per-user override.
 *
 * Derived from the registry instead of written out per role. Eight hand-written
 * role blocks were a fourth copy of this knowledge, and the copy that drifted:
 * they granted `fleetDuty` and `proofPayments`, which the override list then
 * silently dropped, so an admin toggling either saw a change that never
 * applied. An unknown role — including `AGENT` and `USER`, which deliberately
 * default to nothing, and anything a future backend invents — falls through to
 * no permissions, which is the right answer for something the server will never
 * send.
 */
/**
 * `fallback` is optional, so reading it off the registry's literal tuple type
 * is a union-narrowing error. Widening through the declared type is what the
 * helper is for; it keeps `PERMISSION_REGISTRY` literal-typed, which is what
 * lets `TenantNavPermissionKey` be derived from it.
 */
function grantedToUnrecognisedRoles(p: PermissionDefinition): boolean {
  return Boolean(p.fallback);
}

export function buildRoleDefaultTenantNavPermissions(role?: string): TenantNavPermissions {
  const raw = String(role || "").trim().toUpperCase();
  const value = ROLE_ALIASES[raw] ?? raw;
  const isKnownRole = (TENANT_USER_ROLES as readonly string[]).includes(value);

  return Object.fromEntries(
    PERMISSION_REGISTRY.map((p) => {
      // An unrecognised role is not the same as a role with no permissions:
      // AGENT, USER and anything the backend adds later all land on the
      // restricted fallback, while DRIVER genuinely has almost nothing.
      const granted = isKnownRole
        ? (p.roles as readonly string[]).includes(value)
        : grantedToUnrecognisedRoles(p);
      return [p.key, granted];
    }),
  ) as TenantNavPermissions;
}

export function normalizeTenantNavPermissions(
  incoming: unknown,
  role?: string
): TenantNavPermissions {
  const base = buildRoleDefaultTenantNavPermissions(role);

  if (!incoming || typeof incoming !== "object") {
    return base;
  }

  const source = incoming as Record<string, unknown>;
  const next = { ...base };

  for (const key of ALL_TENANT_NAV_PERMISSION_KEYS) {
    if (source[key] === true || source[key] === false) {
      next[key] = source[key] === true;
    }
  }

  return next;
}

// ── Rail access level ────────────────────────────────────────────────────────
//
// The boolean matrix says whether a page is VISIBLE. Rail also needs "visible but
// read-only" (VIEWER), which a boolean cannot express — so the write/sign split
// lives here, next to the matrix, and mirrors the API's role sets
// (backend/src/rail/rail-roles.ts: WRITE and SIGNATORY).

export type RailAccessLevel = "NONE" | "READ_ONLY" | "FULL";

// These MUST all be values of the backend `enum UserRole` (schema.prisma:
// ADMIN, COMPANY_ADMIN, MANAGER, DISPATCH, WAREHOUSE, AGENT, USER, DRIVER,
// VIEWER). A role named here that the API cannot issue is not a fallback — it
// is a role that silently never matches, and it misleads the next reader into
// thinking the platform has it.
//
// SUPER_ADMIN, ULTIMATE_OWNER, TENANT_ADMIN and OPS_CLERK were listed here and
// exist in NO enum. They are removed rather than kept "for when they arrive":
// a gate that cannot fire is not forward-compatibility, it is noise. Adding a
// role is a schema change; when one is added, it goes in here at the same
// time. backend/src/rail/rail-role-drift.spec.ts enforces the correspondence.
const RAIL_WRITE_ROLES = new Set([
  "COMPANY_ADMIN", "ADMIN", "MANAGER", "DISPATCH",
]);

/** Authorised representatives: may sign off, resolve and lodge Regulator disputes. */
const RAIL_SIGNATORY_ROLES = new Set([
  "COMPANY_ADMIN", "ADMIN", "MANAGER",
]);

const normRole = (role?: string) => String(role || "").trim().toUpperCase();

/**
 * NONE      — neither Rail page is visible to this user (hidden for DRIVER / WAREHOUSE,
 *             or revoked by an explicit per-user override).
 * READ_ONLY — visible, but no mutating control may be offered (VIEWER).
 * FULL      — may create and edit.
 */
export function getRailAccessLevel(role?: string, incomingPermissions?: unknown): RailAccessLevel {
  const perms = normalizeTenantNavPermissions(incomingPermissions, role);
  if (!perms.rail && !perms.railHandshake) return "NONE";
  return RAIL_WRITE_ROLES.has(normRole(role)) ? "FULL" : "READ_ONLY";
}

/** True for roles that may make formal commitments on the tenant's behalf. */
export function canSignRailHandshake(role?: string): boolean {
  return RAIL_SIGNATORY_ROLES.has(normRole(role));
}

/**
 * Per-user nav overrides the backend may attach to `/auth/me` (as `permissions`,
 * or the older `navPermissions`). The shape is deliberately loose — it is run
 * through `normalizeTenantNavPermissions`, which only trusts boolean values.
 */
export function userPermissionOverrides(user: unknown): unknown {
  const u = user as { permissions?: unknown; navPermissions?: unknown } | null | undefined;
  return u?.permissions ?? u?.navPermissions;
}
