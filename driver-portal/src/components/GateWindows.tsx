import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Loader2, RefreshCw, WifiOff,
} from 'lucide-react';
import api from '../services/api';
import {
  cacheGateWindows, findMutationByUrl, getCachedGateWindows, getRejectedMutations,
  onMutationsChange, queueMutation, type PendingMutation,
} from '../services/offlineDB';
import { flushOutbox } from '../services/syncEngine';
import {
  ackTimestamps, confirmedOutcome, interpretAckFailure, pendingSyncOutcome,
  type WindowAckOutcome,
} from '../services/windowAck';

/**
 * The driver's half of the truck-window closed loop.
 *
 * A terminal operator can change a published gate window and the driver has to
 * hear about it fast, in one tap, possibly with no signal. So this panel:
 *
 *  - shows the NEW window large, with the superseded one struck through and the
 *    reason underneath — never two plausible times side by side;
 *  - caches the last known list, so a driver in a notspot still sees the window
 *    the terminal last published rather than an empty screen;
 *  - queues a confirmation offline through the same IndexedDB outbox every other
 *    field write uses, and says PENDING SYNC while it is queued — with the
 *    DEVICE time labelled as the device's claim and the SERVER time shown as not
 *    recorded yet, because until it syncs there is no server time;
 *  - and, when the flush comes back refused (the terminal moved the window
 *    again while the driver was offline), shows NOT CONFIRMED with the server's
 *    own words and the version that is now current. A refused confirmation is
 *    never rendered as a success and never disappears silently.
 *
 * A driver can confirm and nothing else: the portal exposes two gate-window
 * routes (list, confirm) and the backend derives the driver identity from the
 * session token, never from the request body.
 */

export interface GateWindowChange {
  id: string;
  version: number;
  changeKind: string;
  changedAt: string;
  reason: string | null;
  previousWindow: { start: string; end: string; text: string };
  newWindow: { start: string; end: string; text: string } | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedDeviceAt: string | null;
}

export interface GateWindowItem {
  appointmentId: string;
  terminalName: string;
  haulierName: string;
  vehicleReg: string;
  purpose: string;
  status: string;
  windowVersion: number;
  currentWindow: { start: string; end: string; text: string };
  change: GateWindowChange | null;
  supersededCount: number;
}

type ItemState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'outcome'; outcome: WindowAckOutcome; ackedAt?: string | null; ackDeviceAt?: string | null };

const ackUrl = (changeId: string) => `/driver-portal/gate-windows/${changeId}/ack`;

export default function GateWindows() {
  const [items, setItems] = useState<GateWindowItem[]>([]);
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [rejected, setRejected] = useState<PendingMutation[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const setState = useCallback((appointmentId: string, next: ItemState) => {
    setStates((prev) => ({ ...prev, [appointmentId]: next }));
  }, []);

  /** Re-derive per-window state from the outbox: queued = PENDING SYNC, refused = NOT CONFIRMED. */
  const reconcileWithOutbox = useCallback(async (rows: GateWindowItem[]) => {
    const refused = (await getRejectedMutations()).filter((m) => m.kind === 'window-ack');
    setRejected(refused);
    for (const row of rows) {
      if (!row.change) continue;
      const queued = await findMutationByUrl(ackUrl(row.change.id));
      if (!queued) continue;
      if (queued.state === 'REJECTED') {
        setState(row.appointmentId, {
          kind: 'outcome',
          outcome: interpretAckFailure({ rejection: queued.rejection ?? null, message: queued.lastError }),
          ackDeviceAt: queued.body?.deviceAckedAt ?? null,
        });
      } else {
        setState(row.appointmentId, {
          kind: 'outcome',
          outcome: pendingSyncOutcome(),
          ackDeviceAt: queued.body?.deviceAckedAt ?? null,
        });
      }
    }
  }, [setState]);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const data: any = await api.get('/driver-portal/gate-windows');
      const rows: GateWindowItem[] = Array.isArray(data?.items) ? data.items : [];
      setItems(rows);
      setComputedAt(data?.computedAt ?? null);
      setSource(data?.source ?? null);
      setLoadError(null);
      setFromCache(false);
      void cacheGateWindows(rows as any);
      await reconcileWithOutbox(rows);
    } catch (err: any) {
      const cached = (await getCachedGateWindows()) as unknown as GateWindowItem[];
      if (cached.length) {
        // Last known windows, clearly labelled as such: a stale window is better
        // than a blank screen in a notspot, but only if the driver knows it.
        setItems(cached);
        setFromCache(true);
        setLoadError(null);
        await reconcileWithOutbox(cached);
      } else {
        setLoadError(String(err?.message ?? err));
      }
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [reconcileWithOutbox]);

  useEffect(() => { void load(); }, [load]);

  // The portal polls: a push tickle only says "look again", it carries no data.
  useEffect(() => {
    const t = setInterval(() => { void load({ silent: true }); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const on = () => { setOnline(true); void flushOutbox(); void load({ silent: true }); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [load]);

  // A background flush can turn a queued confirmation into a refusal. A refusal
  // means the server knows something this device does not (a newer window, a
  // change that is not this driver's), so the list is reloaded as well as
  // re-labelled — the driver is shown the window that is current now, not the
  // one they confirmed offline.
  const refusedSeen = useRef(0);
  useEffect(() => onMutationsChange((pending, refusedCount) => {
    setPendingCount(pending);
    void (async () => {
      const rows = (await getRejectedMutations()).filter((m) => m.kind === 'window-ack');
      setRejected(rows);
      if (refusedCount > 0) await reconcileWithOutbox(items);
      if (refusedCount > refusedSeen.current) {
        refusedSeen.current = refusedCount;
        await load({ silent: true });
      }
    })();
  }), [items, reconcileWithOutbox, load]);

  const confirm = async (item: GateWindowItem) => {
    const change = item.change;
    if (!change) return;
    const url = ackUrl(change.id);
    // The device's own time, labelled as such wherever it is shown.
    const deviceAckedAt = new Date().toISOString();

    if (!navigator.onLine) {
      await queueMutation('window-ack', url, { deviceAckedAt });
      setState(item.appointmentId, { kind: 'outcome', outcome: pendingSyncOutcome(), ackDeviceAt: deviceAckedAt });
      return;
    }

    setState(item.appointmentId, { kind: 'confirming' });
    try {
      const res: any = await api.post(url, { deviceAckedAt }, {
        headers: { 'X-Idempotency-Key': `driver-ack:${change.id}` },
      });
      const recipient = res?.recipient ?? null;
      setState(item.appointmentId, {
        kind: 'outcome',
        outcome: confirmedOutcome({
          version: change.version,
          idempotentReplay: !!res?.idempotentReplay,
          ackedAt: recipient?.ack?.ackedAt ?? null,
          ackDeviceAt: recipient?.ack?.ackDeviceAt ?? null,
        }),
        ackedAt: recipient?.ack?.ackedAt ?? null,
        ackDeviceAt: recipient?.ack?.ackDeviceAt ?? deviceAckedAt,
      });
      await load({ silent: true });
    } catch (err: any) {
      const outcome = interpretAckFailure(err);
      if (outcome.kind === 'PENDING_SYNC') {
        // No answer from the server: do not lose the driver's confirmation.
        await queueMutation('window-ack', url, { deviceAckedAt });
        setState(item.appointmentId, {
          kind: 'outcome',
          outcome: { ...pendingSyncOutcome(), detail: outcome.detail },
          ackDeviceAt: deviceAckedAt,
        });
        return;
      }
      setState(item.appointmentId, { kind: 'outcome', outcome });
      // A superseded confirmation means the window moved: show the current one.
      await load({ silent: true });
    }
  };

  const waiting = useMemo(
    () => items.filter((i) => i.change && !i.change.acknowledged && (states[i.appointmentId]?.kind ?? 'idle') === 'idle'),
    [items, states],
  );

  if (loading && items.length === 0) {
    return (
      <div className="px-4 pt-1">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center text-gray-300" role="status">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading your gate windows…
        </div>
      </div>
    );
  }

  // A failed load with nothing cached is NOT "you have no windows" — it is
  // UNKNOWN, and the difference matters: a driver who reads the empty state as
  // fact will assume the old window still stands.
  if (loadError && !items.length) {
    return (
      <div className="px-4 pt-1">
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100" role="alert">
          <AlertTriangle className="w-5 h-5 mb-2" />
          Could not load your gate windows: {loadError}
          <p className="mt-2 text-xs text-rose-200/80">
            Nothing is cached on this device, so whether your window changed is UNKNOWN. Do not assume an earlier
            window still stands — reconnect and try again, or call dispatch.
          </p>
          <button
            onClick={() => void load()}
            className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm font-bold"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="px-4 pt-1">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-gray-400">
          <CalendarClock className="w-5 h-5 mb-2 text-gray-500" />
          No gate window is assigned to you right now.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-1 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-amber-300" /> Terminal gate windows
          {waiting.length > 0 && (
            <span className="text-[10px] font-black text-amber-200 bg-amber-500/20 border border-amber-500/40 rounded-md px-1.5 py-0.5">
              {waiting.length} NEED CONFIRMING
            </span>
          )}
        </h2>
        <button
          onClick={() => { void flushOutbox(); void load(); }}
          className="p-2 rounded-xl border border-white/10 hover:bg-white/10"
          title="Refresh and sync now"
          aria-label="Refresh gate windows and sync pending confirmations"
        >
          <RefreshCw className={`w-4 h-4 text-gray-300 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!online && (
        <div className="flex items-center gap-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
          <WifiOff className="w-4 h-4" />
          You are offline. Confirmations are queued on this device and sent when signal returns — until then they are
          PENDING SYNC, not confirmed.
        </div>
      )}
      {fromCache && (
        <div className="text-xs text-gray-400 bg-white/5 border border-white/10 rounded-xl p-3">
          Showing the last known windows stored on this device
          {computedAt ? ` (as at ${new Date(computedAt).toLocaleString()})` : ''}. The terminal may have changed them
          since — reconnect to be sure.
        </div>
      )}
      {loadError && !fromCache && (
        <div className="text-xs text-rose-200 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert">
          Could not load your gate windows: {loadError}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="rounded-2xl border-2 border-rose-500/50 bg-rose-500/10 p-3" role="alert">
          <div className="flex items-center gap-2 text-sm font-black text-rose-200">
            <AlertTriangle className="w-4 h-4" /> {rejected.length} confirmation{rejected.length > 1 ? 's were' : ' was'} NOT accepted
          </div>
          <ul className="mt-2 space-y-2 text-xs text-rose-100">
            {rejected.map((m) => {
              const outcome = interpretAckFailure({ rejection: m.rejection ?? null, message: m.lastError });
              return (
                <li key={m.id}>
                  <span className="font-bold">{outcome.title}</span>
                  {outcome.detail ? <span> — {outcome.detail}</span> : null}
                  {outcome.activeVersion ? <span> Current version: v{outcome.activeVersion}.</span> : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-rose-200/80">
            Nothing was recorded on the server for these. Confirm the current window below.
          </p>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2">
          {pendingCount} field action{pendingCount > 1 ? 's' : ''} still waiting to upload.
        </div>
      )}

      {items.map((item) => {
        const change = item.change;
        const state = states[item.appointmentId] ?? { kind: 'idle' as const };
        const outcome = state.kind === 'outcome' ? state.outcome : null;
        const serverAcked = change?.acknowledged
          ? ackTimestamps({ ackedAt: change.acknowledgedAt, ackDeviceAt: change.acknowledgedDeviceAt })
          : null;

        return (
          <section
            key={item.appointmentId}
            aria-label={`Gate window at ${item.terminalName} for ${item.vehicleReg}`}
            className={`rounded-2xl border p-4 ${change && !change.acknowledged && !outcome
              ? 'border-amber-500/50 bg-amber-500/[0.07]'
              : 'border-white/10 bg-white/5'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold truncate">{item.terminalName}</div>
                <div className="text-xs text-gray-400 truncate">{item.haulierName} · {item.vehicleReg}</div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 shrink-0">{item.status}</span>
            </div>

            {!change ? (
              <div className="mt-3">
                <div className="text-[11px] text-gray-400">Your window (unchanged)</div>
                <div className="text-xl font-black">{item.currentWindow.text}</div>
              </div>
            ) : (
              <div className="mt-3">
                <div className="text-[11px] uppercase tracking-widest text-gray-400">
                  {change.changeKind === 'CANCELLED' ? 'Window cancelled' : 'Window CHANGED'} · version {change.version}
                </div>
                <div className="mt-1">
                  <div className="text-[11px] text-gray-500">No longer in force</div>
                  <del className="text-base text-gray-500 line-through">{change.previousWindow.text}</del>
                </div>
                <div className="mt-1" aria-live="polite">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-gray-200">
                    {change.changeKind === 'CANCELLED' ? 'New window' : 'Go to this window'}
                  </div>
                  {change.newWindow ? (
                    <div className="text-2xl font-black leading-tight text-emerald-300">{change.newWindow.text}</div>
                  ) : (
                    <div className="text-2xl font-black leading-tight text-rose-300">
                      No replacement — do not travel to the terminal
                    </div>
                  )}
                </div>
                {change.reason && (
                  <p className="mt-2 text-xs text-gray-300"><span className="font-bold">Reason:</span> {change.reason}</p>
                )}
                <p className="mt-1 text-[11px] text-gray-500">
                  Changed {new Date(change.changedAt).toLocaleString()}
                  {item.supersededCount > 0 ? ` · ${item.supersededCount} earlier version${item.supersededCount > 1 ? 's' : ''} superseded` : ''}
                </p>
              </div>
            )}

            {/* Server-side confirmation already on record */}
            {change?.acknowledged && serverAcked && !outcome && (
              <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                <div className="flex items-center gap-2 font-black"><CheckCircle2 className="w-4 h-4" /> Confirmed</div>
                <div className="mt-1">Server recorded: {serverAcked.server}</div>
                {serverAcked.device
                  ? <div>Device reported: {serverAcked.device} (this device's clock, at the time you tapped)</div>
                  : null}
              </div>
            )}

            {/* Local outcome of the last attempt on this device */}
            {outcome && (
              <div
                className={`mt-3 rounded-xl border p-3 text-xs ${outcome.confirmed
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : outcome.kind === 'PENDING_SYNC'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                    : 'border-rose-500/50 bg-rose-500/10 text-rose-100'}`}
                role="status"
                aria-live="assertive"
              >
                <div className="flex items-center gap-2 font-black">
                  {outcome.confirmed ? <CheckCircle2 className="w-4 h-4" />
                    : outcome.kind === 'PENDING_SYNC' ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <AlertTriangle className="w-4 h-4" />}
                  {outcome.title}
                </div>
                {outcome.detail ? <p className="mt-1">{outcome.detail}</p> : null}
                {state.kind === 'outcome' && state.ackDeviceAt && (
                  <p className="mt-1">
                    Device time when you tapped: {new Date(state.ackDeviceAt).toLocaleString()}
                    {outcome.kind === 'PENDING_SYNC'
                      ? ' · Server time: not recorded yet (it is recorded when this syncs, and that is the time the terminal measures).'
                      : ''}
                  </p>
                )}
                {state.kind === 'outcome' && outcome.confirmed && state.ackedAt && (
                  <p className="mt-1">Server recorded: {new Date(state.ackedAt).toLocaleString()}</p>
                )}
                {outcome.kind === 'SUPERSEDED' && (
                  <button
                    onClick={() => void load()}
                    className="mt-2 w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm font-bold"
                  >
                    Show me the window that is current now
                  </button>
                )}
              </div>
            )}

            {change && !change.acknowledged && state.kind === 'idle' && (
              <button
                onClick={() => void confirm(item)}
                className="mt-4 w-full rounded-2xl bg-emerald-500 px-6 py-5 text-xl font-black text-emerald-950 shadow-lg shadow-emerald-500/20"
                aria-describedby={`confirm-help-${item.appointmentId}`}
              >
                {change.changeKind === 'CANCELLED' ? 'CONFIRM — I KNOW IT IS CANCELLED' : 'CONFIRM — I HAVE THE NEW WINDOW'}
              </button>
            )}
            {change && !change.acknowledged && state.kind === 'confirming' && (
              <div className="mt-4 w-full rounded-2xl bg-white/10 px-6 py-5 text-center text-lg font-black text-gray-300" role="status">
                <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Confirming…
              </div>
            )}
            {change && !change.acknowledged && (
              <p id={`confirm-help-${item.appointmentId}`} className="mt-2 text-center text-[11px] text-gray-500">
                One tap tells the terminal this change reached you. Works offline — it will say PENDING SYNC until the
                server has it.
              </p>
            )}
          </section>
        );
      })}

      {source && (
        <p className="pb-2 text-[10px] text-gray-500">
          Source: {source}
          {computedAt ? ` · computed ${new Date(computedAt).toLocaleString()}` : ''}
          {online ? '' : ' · device offline, showing cached data'}
        </p>
      )}
    </div>
  );
}
