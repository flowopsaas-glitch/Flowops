/**
 * Tenant audit trail — client access and presentation rules.
 *
 * ── What this data is ──────────────────────────────────────────────────────
 * The platform records **events**, not field edits. A row says "parcel
 * collected at 14:02 by Sipho at the Johannesburg hub"; nothing in the database
 * records "weight changed from 12 to 15". So this page shows a movement and
 * status trail, and it must never be dressed up as a diff log.
 *
 * The helpers below exist to keep that honest in one place, away from JSX:
 *
 *   - `actorDisplay` refuses to render an absent actor as "System";
 *   - rail events say the actor is *not recorded by the source*, which is a
 *     different statement from "nobody did it";
 *   - `statusTransition` only shows a transition when both halves are known.
 */

import { api } from "../api/client";

export type TrailKind = "waybill" | "consignment";

export const TRAIL_KINDS: readonly TrailKind[] = ["waybill", "consignment"];

export interface TrailRecord {
  id: string;
  kind: TrailKind;
  entityId: string;
  /** Waybill tracking number or consignment number. May be `(waybill abc…)` if dangling. */
  entityReference: string;
  event: string;
  status: string | null;
  /** Populated only by the single-entity history endpoint. */
  fromStatus: string | null;
  description: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  actorType: string | null;
  actorId: string | null;
  actorName: string | null;
  occurredAt: string;
  evidence: Record<string, unknown> | null;
}

export interface TrailPage {
  records: TrailRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface TrailSummary {
  days: number;
  total: number;
  byKind: Record<TrailKind, number>;
  byActorType: Record<string, number>;
  entitiesTouched: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

export interface TrailQuery {
  kind?: TrailKind;
  q?: string;
  actorType?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/** The API wraps every response in `{ data, statusCode, message }`. */
type Envelope<T> = { data: T; statusCode?: number; message?: string };

function unwrap<T>(body: Envelope<T> | T): T {
  if (body && typeof body === "object" && "data" in (body as Envelope<T>)) {
    return (body as Envelope<T>).data;
  }
  return body as T;
}

/** Drop empty filter values so the server never sees `q=` or `kind=`. */
export function cleanQuery(query: TrailQuery): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value as string | number;
  }
  return out;
}

export async function fetchTrail(query: TrailQuery = {}): Promise<TrailPage> {
  const body = await api.get<Envelope<TrailPage>, Envelope<TrailPage>>("/audit/trail", {
    params: cleanQuery(query),
  });
  const page = unwrap(body);
  return {
    records: Array.isArray(page?.records) ? page.records : [],
    nextCursor: page?.nextCursor ?? null,
    hasMore: Boolean(page?.hasMore),
  };
}

export async function fetchTrailSummary(days = 7): Promise<TrailSummary> {
  const body = await api.get<Envelope<TrailSummary>, Envelope<TrailSummary>>("/audit/summary", {
    params: { days },
  });
  return unwrap(body);
}

/**
 * One entity's full history, oldest first. This is the only view where
 * `fromStatus` is populated, because only here is the predecessor row in hand.
 */
export async function fetchEntityHistory(kind: TrailKind, entityId: string): Promise<TrailRecord[]> {
  const body = await api.get<Envelope<TrailRecord[]>, Envelope<TrailRecord[]>>(
    `/audit/trail/${kind}/${encodeURIComponent(entityId)}`,
  );
  const rows = unwrap(body);
  return Array.isArray(rows) ? rows : [];
}

// ── Presentation rules ──────────────────────────────────────────────────────

export function shortId(id: string, length = 8): string {
  return id.length <= length ? id : `${id.slice(0, length)}…`;
}

export function kindLabel(kind: TrailKind): string {
  return kind === "waybill" ? "Waybill" : "Rail";
}

export function humanActorType(actorType: string): string {
  const known: Record<string, string> = {
    DRIVER: "Driver",
    DISPATCH: "Dispatch",
    WAREHOUSE: "Warehouse",
    SYSTEM: "System",
    AUTOMATION: "Automation",
    CUSTOMER: "Customer",
    AI: "AI",
  };
  if (known[actorType]) return known[actorType];
  const spaced = actorType.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type ActorTone = "recorded" | "unresolved" | "unattributed" | "unsupported";

export interface ActorDisplay {
  /** What to put in the cell. Never a guess. */
  text: string;
  /** Secondary line, or null. */
  detail: string | null;
  tone: ActorTone;
}

/**
 * Decide how to attribute one event.
 *
 * The distinctions matter to anyone reading this as evidence:
 *
 *  - `recorded`     — the row carries an actor (a name, or at least a type).
 *  - `unresolved`   — the row carries an actor **id** whose Driver/User record
 *                     is gone. The attribution is real; the name is not
 *                     recoverable. Showing "System" here would be a lie.
 *  - `unattributed` — the row has no actor fields at all.
 *  - `unsupported`  — rail events have no actor column in the schema. This is
 *                     "the source does not record this", not "nobody did it",
 *                     and the two must not be rendered identically.
 */
export function actorDisplay(
  record: Pick<TrailRecord, "kind" | "actorType" | "actorId" | "actorName">,
): ActorDisplay {
  if (record.kind === "consignment") {
    return { text: "Not recorded", detail: "rail events carry no actor", tone: "unsupported" };
  }
  if (record.actorName) {
    return { text: record.actorName, detail: null, tone: "recorded" };
  }
  if (record.actorId) {
    return { text: "Unresolved actor", detail: shortId(record.actorId), tone: "unresolved" };
  }
  if (record.actorType) {
    return { text: humanActorType(record.actorType), detail: null, tone: "recorded" };
  }
  return { text: "Unattributed", detail: null, tone: "unattributed" };
}

const TONE_CLASSES: Record<ActorTone, string> = {
  recorded: "text-white/80",
  unresolved: "text-amber-300",
  unattributed: "text-white/35 italic",
  unsupported: "text-white/35 italic",
};

export function actorToneClass(tone: ActorTone): string {
  return TONE_CLASSES[tone];
}

export type EventTone = "positive" | "negative" | "neutral";

const NEGATIVE_EVENTS = /FAIL|RETURN|EXCEPTION|CANCEL|REJECT|DAMAGE|LOST|DELAY/i;
const POSITIVE_EVENTS = /DELIVER|COMPLETE|ARRIVED|APPROVED|SIGNED|POD/i;

export function eventTone(event: string): EventTone {
  if (NEGATIVE_EVENTS.test(event)) return "negative";
  if (POSITIVE_EVENTS.test(event)) return "positive";
  return "neutral";
}

const EVENT_BADGE: Record<EventTone, string> = {
  positive: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  negative: "bg-red-500/15 text-red-300 border-red-500/30",
  neutral: "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

export function eventBadgeClass(event: string): string {
  return EVENT_BADGE[eventTone(event)];
}

export function humanEvent(event: string): string {
  return event.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resulting state only — the list view has no predecessor row to compare with. */
export function statusLabel(record: Pick<TrailRecord, "status" | "event">): string | null {
  return record.status ?? null;
}

/**
 * "COLLECTED → IN_TRANSIT" for history rows, or the bare status when the
 * predecessor is unknown. Never renders "null → X".
 */
export function statusTransition(record: Pick<TrailRecord, "fromStatus" | "status">): string | null {
  if (record.fromStatus && record.status) return `${record.fromStatus} → ${record.status}`;
  return record.status ?? record.fromStatus ?? null;
}

export interface FormattedTimestamp {
  date: string;
  time: string;
  /** Full ISO string, for the `title` attribute. */
  iso: string;
  relative: string;
}

/**
 * Local date + time with an explicit zone name, because a movement trail is
 * read across provinces and "14:02" alone does not say whose 14:02.
 */
export function formatTimestamp(iso: string, now: Date = new Date()): FormattedTimestamp {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { date: "—", time: "—", iso, relative: "" };
  }
  const dateText = date.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
  const timeText = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return { date: dateText, time: timeText, iso, relative: relativeTime(date, now) };
}

export function relativeTime(then: Date, now: Date = new Date()): string {
  const ms = now.getTime() - then.getTime();
  if (Number.isNaN(ms)) return "";
  const future = ms < 0;
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60_000);
  if (minutes < 1) return "just now";
  const build = (value: number, unit: string) =>
    future ? `in ${value} ${unit}${value === 1 ? "" : "s"}` : `${value} ${unit}${value === 1 ? "" : "s"} ago`;
  if (minutes < 60) return build(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return build(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return build(days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return build(months, "month");
  return build(Math.floor(months / 12), "year");
}

/** Keys of the source metadata, so the UI can show *that* evidence exists. */
export function evidenceKeys(record: Pick<TrailRecord, "evidence">): string[] {
  if (!record.evidence || typeof record.evidence !== "object") return [];
  return Object.keys(record.evidence);
}

/**
 * Label for the `byActorType` buckets the summary returns. Two of them are
 * pseudo-buckets and must not read like ordinary actors.
 */
export function actorBucketLabel(key: string): string {
  if (key === "UNATTRIBUTED") return "Unattributed (waybill events)";
  if (key === "UNRECORDED_RAIL") return "Rail (no actor recorded)";
  return humanActorType(key);
}

export const ACTOR_TYPE_OPTIONS = [
  { value: "DRIVER", label: "Driver" },
  { value: "DISPATCH", label: "Dispatch" },
  { value: "WAREHOUSE", label: "Warehouse" },
  { value: "SYSTEM", label: "System" },
] as const;

export const SUMMARY_WINDOWS = [1, 7, 30, 90] as const;
