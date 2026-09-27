/**
 * Public (unauthenticated) portal lookup helpers.
 *
 * The customer portal is reachable without a login, so its filters are the
 * only thing standing between the internet and a tenant's shipment data.
 * The previous inline filter had a hole: `?phone=%20%20` normalised to an
 * empty string, and `contains: ''` matches every row in the tenant.
 */

export interface WaybillTrackQuery {
  phone?: string;
  email?: string;
  tracking?: string;
}

/**
 * Build a tenant-scoped `where` clause for public waybill lookup.
 *
 * Returns `null` when the caller supplied no usable filter — the route MUST
 * treat that as "no results", never as "no filter" (which would dump the
 * whole tenant).
 */
export function buildWaybillTrackWhere(
  companyId: string,
  query: WaybillTrackQuery,
): Record<string, unknown> | null {
  if (!companyId) return null;

  const where: Record<string, unknown> = { companyId };

  const tracking =
    typeof query.tracking === "string" ? query.tracking.trim() : "";
  if (tracking) {
    where.trackingNumber = tracking;
    return where;
  }

  const OR: Record<string, unknown>[] = [];

  const phone =
    typeof query.phone === "string" ? query.phone.replace(/\s+/g, "") : "";
  // An empty or punctuation-only phone must never become `contains: ''`.
  if (phone.replace(/[^0-9+]/g, "").length >= 4) {
    OR.push({ senderPhone: { contains: phone } });
    OR.push({ recipientPhone: { contains: phone } });
  }

  const email = typeof query.email === "string" ? query.email.trim() : "";
  // Exact match only: a partial email would let anyone enumerate a tenant.
  if (email.includes("@")) {
    OR.push({ recipientEmail: { equals: email, mode: "insensitive" } });
  }

  if (OR.length === 0) return null;

  where.OR = OR;
  return where;
}

/** Minimum digits required before a phone search is considered specific. */
export const MIN_PHONE_DIGITS = 4;
