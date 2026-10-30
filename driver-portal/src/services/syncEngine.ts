// Sync engine — drains the offline outbox to the server.
//
// It runs the queued mutations in FIFO order. Each send carries the mutation's
// idempotency key so the backend can safely ignore a duplicate if a previous
// attempt actually reached the server but the response was lost (classic
// flaky-mobile-network failure mode).
//
// Three outcomes, and they are NOT the same thing:
//   2xx        → the write landed. The row is removed.
//   network/5xx/401 → no answer yet. The row stays PENDING and the run stops,
//                so the queue is retried in order on the next trigger.
//   permanent 4xx (400/404/409/422) → the server ANSWERED "no". Replaying it
//                forever is pointless, so the row stops being pending — but it
//                is kept as REJECTED with the status, code and message, because
//                a refusal is information the driver is owed. The case that
//                matters most: a gate-window confirmation queued offline while
//                the terminal published a newer window comes back 409
//                SUPERSEDED. That is NOT a confirmation, and the UI must show
//                it as such rather than letting the badge go to zero.
import api from './api';
import {
  getPendingMutations, markMutationTried, markRejected, pendingCount, removeMutation,
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
        const status: number | undefined = err?.status ?? err?.response?.status;
        // Permanent client rejection: the server answered, and the answer was
        // no. 401 is excluded — the api interceptor already tried a silent
        // token refresh, and a session that cannot be refreshed must not
        // silently discard field work.
        const permanent = status === 400 || status === 404 || status === 409 || status === 422;
        if (permanent) {
          await markRejected(m.id, {
            status,
            code: typeof err?.code === 'string' ? err.code : null,
            message: err?.message ?? 'Rejected by the server',
            activeVersion: typeof err?.activeVersion === 'number' ? err.activeVersion : null,
            at: Date.now(),
          });
          await notify();
          // Keep draining: one refused write must not block the rest of the day.
          continue;
        }
        // Transient (offline mid-flush, timeout, 5xx, dead session). Stop the
        // run; the whole queue is retried in order on the next trigger.
        await markMutationTried(m.id, err?.message);
        break;
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
