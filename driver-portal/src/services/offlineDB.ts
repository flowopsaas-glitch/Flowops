// Offline store for the driver PWA.
//
// Two responsibilities:
//   1. cacheJobs / getCachedJobs — last-known job list so the dashboard still
//      renders when the device drops connectivity in the field.
//   2. An OUTBOX of pending mutations (POD, collection confirm, GPS) so that an
//      action taken in a dead zone is NEVER lost. The action is written locally
//      first (optimistic), then replayed to the server automatically when
//      connectivity returns. Each mutation carries a client-generated
//      idempotency key so a replay after a flaky connection cannot double-apply
//      (e.g. create two waybills or double-mark a delivery).
import Dexie, { type Table } from 'dexie';

export type Job = Record<string, any> & { id: string };

/** A gate window as the driver's portal last saw it (cached for offline use). */
export type CachedGateWindow = Record<string, any> & { appointmentId: string };

/**
 * A journey as the driver's portal last saw it.
 *
 * Cached because the single most likely moment a driver opens their journey is
 * the moment they need to report a problem with it -- which correlates strongly
 * with having no signal. A journey they cannot read is a journey they cannot
 * report against.
 */
export type CachedJourney = Record<string, any> & { id: string };

/** What the server said when it permanently refused a queued write. */
export type MutationRejection = {
  status?: number;
  /** The backend's machine-readable code, e.g. SUPERSEDED for a stale window ack. */
  code?: string | null;
  message: string;
  /** For SUPERSEDED: the version that IS current, so the UI can point at it. */
  activeVersion?: number | null;
  at: number;
};

/** A queued, not-yet-confirmed server write. */
export type PendingMutation = {
  id: string;                 // client-generated uuid — also the idempotency key
  kind: 'pod' | 'collect' | 'gps' | 'window-ack' | 'journey-update';
  url: string;                // relative API path, e.g. /driver-portal/pod
  body: Record<string, any>;  // JSON payload
  createdAt: number;          // epoch ms — replay in FIFO order
  attempts: number;           // how many times we've tried to send it
  lastError?: string;
  /**
   * PENDING  — still to be sent (or being retried after a network failure).
   * REJECTED — the server gave a permanent "no". This is an ANSWER, not a
   *            success, and it must stay visible to the driver: a confirmation
   *            that was refused because the window changed again has to be
   *            shown as NOT CONFIRMED, never silently dropped from the badge.
   * Absent on rows written before this field existed; treated as PENDING.
   */
  state?: 'PENDING' | 'REJECTED';
  rejection?: MutationRejection;
};

class DriverDB extends Dexie {
  jobs!: Table<Job, string>;
  mutations!: Table<PendingMutation, string>;
  gateWindows!: Table<CachedGateWindow, string>;
  journeys!: Table<CachedJourney, string>;
  constructor() {
    super('flowops-driver');
    // v1 — jobs cache only.
    this.version(1).stores({ jobs: 'id, status, type' });
    // v2 — add the outbox. Dexie migrates existing stores automatically.
    this.version(2).stores({
      jobs: 'id, status, type',
      mutations: 'id, kind, createdAt',
    });
    // v3 — cache the driver's gate windows so a changed window is still visible
    // in a notspot, and so a queued confirmation has something to attach to.
    // `state` on mutations is a plain field, deliberately NOT an index: filtering
    // a small outbox in memory avoids a migration for legacy rows that predate it.
    this.version(3).stores({
      jobs: 'id, status, type',
      mutations: 'id, kind, createdAt',
      gateWindows: 'appointmentId',
    });
    // v4 — cache the driver's journeys so the stage list and the update form
    // still work in a notspot. Same reasoning as gate windows: this is the
    // screen a driver reaches for precisely when something has gone wrong.
    this.version(4).stores({
      jobs: 'id, status, type',
      mutations: 'id, kind, createdAt',
      gateWindows: 'appointmentId',
      journeys: 'id, status',
    });
  }
}

const db = new DriverDB();

// ── Job cache ────────────────────────────────────────────────────────────────
export async function cacheJobs(jobs: Job[]): Promise<void> {
  try {
    await db.transaction('rw', db.jobs, async () => {
      await db.jobs.clear();
      if (jobs.length) await db.jobs.bulkPut(jobs);
    });
  } catch {
    /* cache is best-effort */
  }
}

export async function getCachedJobs(): Promise<Job[]> {
  try {
    return await db.jobs.toArray();
  } catch {
    return [];
  }
}

// ── Outbox ────────────────────────────────────────────────────────────────────

/**
 * A client-generated id.
 *
 * Exported because a caller sometimes needs the SAME id in two places at once:
 * a journey update carries its idempotency key in the body (that is what the
 * backend dedupes on), and the outbox row that may later replay it has to
 * reuse that exact value or the replay creates a second update.
 */
export function newId(): string {
  // crypto.randomUUID is available in all modern mobile browsers; fall back just in case.
  try { return crypto.randomUUID(); } catch { /* older webview */ }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const uuid = newId;

/** Queue a mutation for reliable delivery. Returns the mutation id (idempotency key). */
export async function queueMutation(
  kind: PendingMutation['kind'],
  url: string,
  body: Record<string, any>,
): Promise<string> {
  const m: PendingMutation = {
    id: uuid(),
    kind,
    url,
    body,
    createdAt: Date.now(),
    attempts: 0,
    state: 'PENDING',
  };
  await db.mutations.put(m);
  await notifyMutationChange();
  return m.id;
}

/**
 * Queue a write that supersedes any earlier copy of itself.
 *
 * For a value where only the LATEST matters — the driver's position being the
 * obvious one. Queuing each GPS fix individually meant an hour in a notspot
 * produced 120 outbox rows, all of them stale by the time they could be sent,
 * and every one of them replayed in front of the driver's real work (POD,
 * collections) when signal returned. Worse, the badge then claimed
 * "120 to sync", which teaches a driver to distrust the badge.
 *
 * The existing row is updated in place rather than replaced, so its position in
 * the FIFO queue — and therefore its ordering against everything else the
 * driver did — is preserved.
 */
export async function queueCoalesced(
  kind: PendingMutation['kind'],
  url: string,
  body: Record<string, any>,
): Promise<string> {
  const existing = (await getPendingMutations()).find((m) => m.kind === kind && m.url === url);
  if (existing) {
    await db.mutations.put({ ...existing, body, attempts: existing.attempts });
    await notifyMutationChange();
    return existing.id;
  }
  return queueMutation(kind, url, body);
}

const isPending = (m: PendingMutation) => (m.state ?? 'PENDING') === 'PENDING';

export async function getPendingMutations(): Promise<PendingMutation[]> {
  try {
    const all = await db.mutations.orderBy('createdAt').toArray();
    return all.filter(isPending);
  } catch {
    return [];
  }
}

/** Refused writes, newest first — the driver has to be able to see these. */
export async function getRejectedMutations(): Promise<PendingMutation[]> {
  try {
    const all = await db.mutations.orderBy('createdAt').reverse().toArray();
    return all.filter((m) => m.state === 'REJECTED');
  } catch {
    return [];
  }
}

export async function pendingCount(): Promise<number> {
  try {
    const all = await db.mutations.toArray();
    return all.filter(isPending).length;
  } catch { return 0; }
}

export async function removeMutation(id: string): Promise<void> {
  try { await db.mutations.delete(id); await notifyMutationChange(); } catch { /* ignore */ }
}

/**
 * Record a permanent refusal. The row is KEPT (not deleted) with the server's
 * status, code and words attached, so the UI can say exactly why an action did
 * not take effect — "that window version was superseded" — instead of the
 * badge quietly going to zero as though the write had succeeded.
 */
export async function markRejected(id: string, rejection: MutationRejection): Promise<void> {
  try {
    const m = await db.mutations.get(id);
    if (!m) return;
    m.state = 'REJECTED';
    m.rejection = rejection;
    m.attempts += 1;
    m.lastError = rejection.message;
    await db.mutations.put(m);
    await notifyMutationChange();
  } catch { /* ignore */ }
}

export async function markMutationTried(id: string, error?: string): Promise<void> {
  try {
    const m = await db.mutations.get(id);
    if (m) {
      m.attempts += 1;
      m.lastError = error;
      await db.mutations.put(m);
    }
  } catch { /* ignore */ }
}

/** Is a write for this URL already queued or already refused? (one ack per change) */
export async function findMutationByUrl(url: string): Promise<PendingMutation | undefined> {
  try {
    const all = await db.mutations.toArray();
    return all.find((m) => m.url === url);
  } catch { return undefined; }
}

// ── Gate-window cache ────────────────────────────────────────────────────────

export async function cacheGateWindows(items: CachedGateWindow[]): Promise<void> {
  try {
    await db.transaction('rw', db.gateWindows, async () => {
      await db.gateWindows.clear();
      if (items.length) await db.gateWindows.bulkPut(items);
    });
  } catch { /* cache is best-effort */ }
}

export async function getCachedGateWindows(): Promise<CachedGateWindow[]> {
  try { return await db.gateWindows.toArray(); } catch { return []; }
}

// ── Journey cache ────────────────────────────────────────────────────────────
export async function cacheJourneys(items: CachedJourney[]): Promise<void> {
  try {
    await db.transaction('rw', db.journeys, async () => {
      await db.journeys.clear();
      if (items.length) await db.journeys.bulkPut(items);
    });
  } catch { /* cache is best-effort */ }
}

export async function getCachedJourneys(): Promise<CachedJourney[]> {
  try { return await db.journeys.toArray(); } catch { return []; }
}

// ── Outbox listeners ─────────────────────────────────────────────────────────

type MutationListener = (pending: number, rejected: number) => void;
const mutationListeners = new Set<MutationListener>();

async function notifyMutationChange(): Promise<void> {
  if (!mutationListeners.size) return;
  const [pending, rejected] = await Promise.all([pendingCount(), getRejectedMutations()]);
  mutationListeners.forEach((fn) => fn(pending, rejected.length));
}

/**
 * Subscribe to outbox state. The pending count drives the "N to sync" badge; the
 * rejected count drives the "NOT CONFIRMED" banner, because a refusal must be
 * as visible as a success.
 */
export function onMutationsChange(fn: MutationListener): () => void {
  mutationListeners.add(fn);
  void notifyMutationChange().then(() => undefined);
  void Promise.all([pendingCount(), getRejectedMutations()]).then(([p, r]) => fn(p, r.length));
  return () => mutationListeners.delete(fn);
}
