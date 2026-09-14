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

/** A queued, not-yet-confirmed server write. */
export type PendingMutation = {
  id: string;                 // client-generated uuid — also the idempotency key
  kind: 'pod' | 'collect' | 'gps';
  url: string;                // relative API path, e.g. /driver-portal/pod
  body: Record<string, any>;  // JSON payload
  createdAt: number;          // epoch ms — replay in FIFO order
  attempts: number;           // how many times we've tried to send it
  lastError?: string;
};

class DriverDB extends Dexie {
  jobs!: Table<Job, string>;
  mutations!: Table<PendingMutation, string>;
  constructor() {
    super('flowops-driver');
    // v1 — jobs cache only.
    this.version(1).stores({ jobs: 'id, status, type' });
    // v2 — add the outbox. Dexie migrates existing stores automatically.
    this.version(2).stores({
      jobs: 'id, status, type',
      mutations: 'id, kind, createdAt',
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

function uuid(): string {
  // crypto.randomUUID is available in all modern mobile browsers; fall back just in case.
  try { return crypto.randomUUID(); } catch { /* older webview */ }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
  };
  await db.mutations.put(m);
  return m.id;
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  try {
    return await db.mutations.orderBy('createdAt').toArray();
  } catch {
    return [];
  }
}

export async function pendingCount(): Promise<number> {
  try { return await db.mutations.count(); } catch { return 0; }
}

export async function removeMutation(id: string): Promise<void> {
  try { await db.mutations.delete(id); } catch { /* ignore */ }
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
