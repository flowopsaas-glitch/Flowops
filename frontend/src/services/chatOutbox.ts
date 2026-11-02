// Chat outbox queue — safe offline messaging for the dispatch chat page.
//
// A message composed while offline is written locally first (optimistic),
// tagged with a client-generated idempotency key, and replayed to the server
// automatically when connectivity returns. Nothing is silently discarded.
//
// Three outcomes, and they are NOT the same thing:
//   2xx        → the write landed. The row moves to SENT (confirmed).
//   permanent 4xx (400/404/409/422) → the server answered "no". Replaying it
//                forever is pointless, so the row stops being pending — but it
//                is KEPT as REJECTED with the server's status/code/message, so
//                the dispatcher is owed an honest refusal, not a silent zero.
//   transient (offline mid-flush, timeout, 5xx, dead session) → no answer yet.
//                The row stays PENDING and is retried in FIFO order on the
//                next trigger (online, visibilitychange, heartbeat).
//
// Persistence: localStorage so the queue survives a tab refresh and a
// reconnect. Gracefully falls back to in-memory only if storage is unavailable.
//
// All timing uses device (local) time for the queued event and server time
// only once the server acknowledges — the two are never conflated.
import type { Msg } from '../pages/DriverChatPage';

const STORAGE_KEY = 'flowops-chat-outbox';

export type QueuedMessage = {
  id: string;                  // client-generated idempotency key
  driverId: string;            // tenant-scoped driver recipient
  message: string;             // trimmed body
  journeyStageId?: string;     // optional journey-stage linkage (client-side)
  createdAt: number;           // epoch ms — device time when composed
  seq: number;                 // monotonic enqueue sequence — deterministic ordering
  attempts: number;            // how many send attempts
  state: 'PENDING' | 'SENT' | 'REJECTED';
  lastError?: string;
  /** Permanent refusal detail, kept so the UI can show an honest "NOT CONFIRMED". */
  rejection?: {
    status?: number | null;
    code?: string | null;
    message: string;
    at: number; // epoch ms — device time the refusal was recorded
  };
  /** Dispatcher follow-up lifecycle (client-side, audit-stamped). */
  followUp?: boolean;
  followUpAt?: number;   // epoch ms — when follow-up was requested
  followUpBy?: string;   // actor/role who requested it
  resolvedAt?: number;   // epoch ms — when follow-up was resolved
};

type OutboxListener = (queue: QueuedMessage[]) => void;

// ── storage ─────────────────────────────────────────────────────────────────

function loadAll(): QueuedMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as QueuedMessage[];
  } catch {
    return [];
  }
}

function saveAll(queue: QueuedMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* storage unavailable — keep in-memory only for this session */
  }
}

let queue: QueuedMessage[] = loadAll();
let seq = queue.length; // continue the sequence after any persisted rows

const listeners = new Set<OutboxListener>();

function persist(): void {
  saveAll(queue);
  notify();
}

function notify(): void {
  const snap = [...queue];
  listeners.forEach((fn) => fn(snap));
}

// ── public API ──────────────────────────────────────────────────────────────

/** Compose and queue a message for reliable delivery. Returns the queued row. */
export function queueMessage(
  driverId: string,
  message: string,
  clientMessageId: string,
  opts?: { journeyStageId?: string },
): QueuedMessage {
  const trimmed = message.trim();
  const row: QueuedMessage = {
    id: clientMessageId,
    driverId,
    message: trimmed,
    journeyStageId: opts?.journeyStageId,
    createdAt: Date.now(),
    seq: ++seq,
    attempts: 0,
    state: 'PENDING',
  };
  queue = [...queue, row];
  persist();
  return row;
}

/** All queued rows for a driver, newest first (pending + rejected + sent). */
export function getQueued(driverId: string): QueuedMessage[] {
  return [...queue]
    .filter((m) => m.driverId === driverId)
    .sort((a, b) => b.seq - a.seq);
}

/** Rows still awaiting a server answer (PENDING), oldest first for FIFO replay. */
export function getPending(driverId: string): QueuedMessage[] {
  return [...queue]
    .filter((m) => m.driverId === driverId && m.state === 'PENDING')
    .sort((a, b) => a.seq - b.seq);
}

/** Rows the server permanently refused (REJECTED), newest first. */
export function getRejected(driverId: string): QueuedMessage[] {
  return [...queue]
    .filter((m) => m.driverId === driverId && m.state === 'REJECTED')
    .sort((a, b) => b.seq - a.seq);
}

/** Count of pending (unsynced) messages for a driver — drives the badge. */
export function pendingCount(driverId: string): number {
  return queue.filter((m) => m.driverId === driverId && m.state === 'PENDING').length;
}

/** Mark a queued row as confirmed on the server. */
export function markSent(id: string): QueuedMessage | undefined {
  const row = queue.find((m) => m.id === id);
  if (!row || row.state !== 'PENDING') return undefined;
  row.state = 'SENT';
  persist();
  return row;
}

/** Record a permanent server refusal. The row is KEPT as REJECTED. */
export function markRejected(
  id: string,
  rejection: { status?: number | null; code?: string | null; message: string },
): QueuedMessage | undefined {
  const row = queue.find((m) => m.id === id);
  if (!row || row.state !== 'PENDING') return undefined;
  row.state = 'REJECTED';
  row.attempts += 1;
  row.lastError = rejection.message;
  row.rejection = {
    status: rejection.status ?? null,
    code: rejection.code ?? null,
    message: rejection.message,
    at: Date.now(),
  };
  persist();
  return row;
}

/** Record a transient attempt failure (keeps the row PENDING for retry). */
export function markAttempted(id: string, error?: string): QueuedMessage | undefined {
  const row = queue.find((m) => m.id === id);
  if (!row || row.state !== 'PENDING') return undefined;
  row.attempts += 1;
  row.lastError = error;
  persist();
  return row;
}

/** Remove a confirmed row from the queue. */
export function removeMessage(id: string): boolean {
  const before = queue.length;
  queue = queue.filter((m) => m.id !== id);
  if (queue.length !== before) {
    persist();
    return true;
  }
  return false;
}

/** Clear all rows for a driver (sent + rejected). Pending rows are preserved. */
export function clearCompleted(driverId: string): number {
  const before = queue.length;
  queue = queue.filter(
    (m) => !(m.driverId === driverId && (m.state === 'SENT' || m.state === 'REJECTED')),
  );
  if (queue.length !== before) {
    persist();
    return before - queue.length;
  }
  return 0;
}

/** Request dispatcher follow-up on a queued/sent message (audit-stamped). */
export function requestFollowUp(
  id: string,
  by: string,
): { followUp: boolean; followUpAt: number } | undefined {
  const row = queue.find((m) => m.id === id);
  if (!row) return undefined;
  row.followUp = true;
  row.followUpAt = Date.now();
  row.followUpBy = by;
  persist();
  return { followUp: true, followUpAt: row.followUpAt };
}

/** Resolve dispatcher follow-up on a message. */
export function resolveFollowUp(id: string): { resolvedAt: number } | undefined {
  const row = queue.find((m) => m.id === id);
  if (!row) return undefined;
  row.resolvedAt = Date.now();
  persist();
  return { resolvedAt: row.resolvedAt };
}

/** Tag a message with a journey-stage linkage. */
export function setJourneyStage(
  id: string,
  journeyStageId: string | null,
): QueuedMessage | undefined {
  const row = queue.find((m) => m.id === id);
  if (!row) return undefined;
  row.journeyStageId = journeyStageId ?? undefined;
  persist();
  return row;
}

/** Subscribe to outbox changes (drives badges / pending indicators). */
export function onChange(fn: OutboxListener): () => void {
  listeners.add(fn);
  void notify();
  return () => listeners.delete(fn);
}

/**
 * Drain the pending queue in FIFO order. `send` is injectable so this is
 * fully unit-testable without a real HTTP client.
 *
 * send(message, clientMessageId) resolves on 2xx, rejects with {status?, code?, message?}
 * on a server answer, or throws a non-status error for transient failures.
 */
export async function flush(
  driverId: string,
  send: (message: string, clientMessageId: string) => Promise<unknown>,
): Promise<{ sent: number; rejected: number; stillPending: number }> {
  const pending = getPending(driverId);
  let sent = 0;
  let rejected = 0;

  for (const m of pending) {
    // Re-read pending each iteration in case a concurrent flush mutated it.
    const current = queue.find((x) => x.id === m.id);
    if (!current || current.state !== 'PENDING') continue;

    try {
      await send(current.message, current.id);
      markSent(current.id);
      sent += 1;
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      const code = err?.code ?? null;
      const message = err?.message ?? 'Send failed';
      const permanent =
        status === 400 || status === 404 || status === 409 || status === 422;

      if (permanent) {
        markRejected(current.id, { status, code, message });
        rejected += 1;
        // One refused write must not block the rest of the queue.
        continue;
      }

      // Transient: keep PENDING, stop the run, retry on next trigger.
      markAttempted(current.id, message);
      break;
    }
  }

  return {
    sent,
    rejected,
    stillPending: pendingCount(driverId),
  };
}

/** Test-only: reset the in-memory queue and storage. */
export function __resetForTest(): void {
  queue = [];
  seq = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notify();
}
