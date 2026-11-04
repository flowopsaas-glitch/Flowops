/**
 * The audit trail read model.
 *
 * ── What this is, stated precisely ──────────────────────────────────────────
 * The platform records **events**, not field edits. A `TrackingEvent` says
 * "parcel collected at 14:02 by Sipho at the Johannesburg hub"; it does not say
 * "the `weight` field changed from 12 to 15". There is no old-value/new-value
 * log anywhere in the schema, and this module does not invent one.
 *
 * That distinction is the whole point. An audit trail offered to a client, an
 * insurer or an arbitrator is evidence, and evidence that quietly guesses is
 * worse than evidence that stops where the record stops. So:
 *
 *   - every row here corresponds to exactly one immutable database row;
 *   - `fromStatus` is populated **only** where the preceding event for the same
 *     entity is in hand (a single-entity history), never guessed on a list view;
 *   - fields the source does not carry stay `null`.
 *
 * `tracking_events` is append-only: nothing in the backend updates or deletes a
 * row (`grep -rn 'trackingEvent.update\|trackingEvent.delete' src` is empty), so
 * a record that exists cannot be rewritten through the application.
 */

export type TrailKind = 'waybill' | 'consignment';

/** One immutable event, normalised across the two source tables. */
export interface TrailRecord {
  /** Source row id — stable, and the tie-breaker in the pagination cursor. */
  id: string;
  kind: TrailKind;
  entityId: string;
  /** Human reference: waybill tracking number, or consignment number. */
  entityReference: string;
  /** Source event code, e.g. COLLECTED, ARRIVED, DELIVERED. */
  event: string;
  /** Resulting state, when the source distinguishes it from the event code. */
  status: string | null;
  /**
   * State immediately before this event. **History view only** — deriving it on
   * a paginated list would mean either guessing or an unbounded scan, and a
   * partially-populated transition column reads as if the missing halves were
   * "no change".
   */
  fromStatus: string | null;
  description: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  actorType: string | null;
  actorId: string | null;
  /** Resolved at read time from Driver/User; the source often stores only an id. */
  actorName: string | null;
  occurredAt: string;
  /** Source metadata (ePOD id, manifest code, signature URL…), passed through. */
  evidence: Record<string, unknown> | null;
}

export interface TrailPage {
  records: TrailRecord[];
  /** Opaque cursor for the next page; `null` when this is the last one. */
  nextCursor: string | null;
  /** True when more rows exist beyond this page. */
  hasMore: boolean;
}

export interface TrailSummary {
  /** Window the figures cover, in days. */
  days: number;
  total: number;
  byKind: Record<TrailKind, number>;
  byActorType: Record<string, number>;
  /** Distinct entities touched in the window — volume, not busywork. */
  entitiesTouched: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

/**
 * Pagination cursor. Encodes the sort key `(occurredAt, id)` so the next page
 * resumes exactly where the last ended — stable under concurrent inserts, unlike
 * an offset.
 */
export interface TrailCursor {
  occurredAt: string;
  id: string;
}

export const TRAIL_KINDS: readonly TrailKind[] = ['waybill', 'consignment'];

/**
 * The one filter shape both endpoints accept. `from`/`to` are ISO strings and
 * are inclusive of `from`, exclusive of `to`.
 */
export interface TrailQuery {
  kind?: TrailKind;
  /** Free-text over description, reference, location and actor name. */
  q?: string;
  actorType?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}
