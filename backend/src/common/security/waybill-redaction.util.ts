/**
 * A `Waybill` row carries `ratingToken`: the bearer token behind the customer's
 * public rating link (`GET /rate/:token` → `getPublicRating`, `submitRating`).
 * Whoever holds it can submit that delivery's customer rating, and a fabricated
 * five-star rating is indistinguishable from a real one in every scorecard that
 * reads `customerRating`.
 *
 * The token is meant to reach exactly two places: the customer (through
 * `NotificationsService.sendRatingRequest`, which emails/SMSes the link) and the
 * dispatcher who deliberately asks for it (`requestRating` answers with an
 * explicit `{ success, token }`). It was also riding along on every row-shaped
 * response - the waybill list, the waybill detail, the driver's active-waybill
 * feed and the create / update / delivery / risk / proof-of-collection writes -
 * because Prisma's `include:` narrows relations but still returns every scalar
 * column.
 *
 * Strip at the response boundary only. Internal consumers - the notification
 * fan-out, the Shopify push, the websocket emit, `requestRating`'s own write -
 * must keep receiving the row they were handed, or the rating email silently
 * stops going out.
 */
export function withoutRatingToken<T>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const { ratingToken, ...safe } = row as Record<string, unknown>;
  return safe as T;
}
