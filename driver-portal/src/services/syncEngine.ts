// Sync engine — drains the offline outbox to the server.
//
// It runs the queued mutations in FIFO order. Each send carries the mutation's
// idempotency key so the backend can safely ignore a duplicate if a previous
// attempt actually reached the server but the response was lost (classic
// flaky-mobile-network failure mode). On success the mutation is removed; on a
// 4xx that is NOT a transient/network error we drop it too (replaying a
// permanently-rejected write forever is pointless), while network/5xx errors
// are kept for the next flush.
import api from './api';
import {
  getPendingMutations, removeMutation, markMutationTried, pendingCount,
} from './offlineDB';

let flushing = false;
type Listener = (pending: number) => void;
const listeners = new Set<Listener>();

/** Subscribe to pending-count changes (for the "N unsynced" badge). */
export function onPendingChange(fn: Listener): () => void {
  listeners.add(fn);
  void pendingCount().then(fn);
  return () => listeners.delete(fn);
}

async function notify() {
  const n = await pendingCount();
  listeners.forEach((fn) => fn(n));
}

/**
 * Attempt to send every queued mutation. Safe to call repeatedly and
 * concurrently — a guard prevents overlapping runs.
 */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  if (!navigator.onLine) return;
  flushing = true;
  try {
    const pending = await getPendingMutations();
    for (const m of pending) {
      try {
        await api.post(m.url, m.body, { headers: { 'X-Idempotency-Key': m.id } });
        await removeMutation(m.id);      // confirmed on the server
        await notify();
      } catch (err: any) {
        const status = err?.response?.status ?? err?.status;
        // Permanent client rejection (bad request / not found / conflict-that-
        // means-already-applied) — stop retrying, but keep 401 (auth refresh
        // is handled by the api interceptor) and all network/5xx for retry.
        const permanent = status === 400 || status === 404 || status === 409 || status === 422;
        await markMutationTried(m.id, err?.message);
        if (permanent) {
          await removeMutation(m.id);
          await notify();
        } else {
          // Transient (offline mid-flush, timeout, 5xx). Stop the run; we'll
          // retry the whole queue on the next trigger.
          break;
        }
      }
    }
  } finally {
    flushing = false;
    await notify();
  }
}

let started = false;
/** Wire up the triggers that drain the outbox. Call once at app start. */
export function startSyncEngine(): void {
  if (started) return;
  started = true;

  // 1. Whenever the browser regains connectivity.
  window.addEventListener('online', () => { void flushOutbox(); });
  // 2. When the app returns to the foreground (driver reopens the PWA).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushOutbox();
  });
  // 3. A gentle heartbeat so a queue left behind still drains on a stable link.
  setInterval(() => { void flushOutbox(); }, 30_000);
  // 4. And once right now, in case we launched with a queue already waiting.
  void flushOutbox();
}
