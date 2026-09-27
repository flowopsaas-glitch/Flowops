/**
 * Tenant-scoping helpers.
 *
 * Rule: the tenant id comes from the authenticated session, never from a
 * request body. These helpers make that structural rather than a matter of
 * object-literal ordering — `{ companyId, ...dto }` silently lets a client
 * override the tenant, because the spread comes second.
 */

/** Keys a client must never be able to set or change through an API body. */
export const OWNED_BY_SERVER = [
  "companyId",
  "id",
  "createdAt",
  "updatedAt",
] as const;

/**
 * Strip server-owned fields from client input, then pin the tenant id.
 *
 * @param companyId tenant id taken from the authenticated session
 * @param data      request body (may be undefined)
 */
export function withCompanyId<T extends Record<string, any>>(
  companyId: string,
  data?: T | null,
): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if ((OWNED_BY_SERVER as readonly string[]).includes(key)) continue;
    safe[key] = value;
  }
  safe.companyId = companyId;
  return safe;
}
