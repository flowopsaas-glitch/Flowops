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
