import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Loader2, RefreshCw, Truck } from "lucide-react";
import {
  ackWindowChange, getWindowAckBoard, getWindowKpis,
  type WindowAckBoard, type WindowChange, type WindowKpis, type WindowRecipient,
} from "../../api/railTruckAppointmentsApi";
import { useAuth } from "../../contexts/auth-context";
import { useSocket } from "../../hooks/useSocket";
import { useToast } from "../../components/toast-context";
import { Banner, Pill, btnNeutral } from "./railUi";

/**
 * Terminal acknowledgement board — "does that truck know?" at a glance.
 *
 * One row per published window change, one line per recipient. The haulier
 * organisation and the assigned driver are SEPARATE lines with separate states,
 * because a dispatcher confirming is not the driver confirming, and a board that
 * merged them would tell the terminal something false about a truck that is
 * already on the road.
 *
 * Honesty rules this component is built around:
 *  - delivery state is what we OBSERVED. SENT (we dispatched) is not DELIVERED
 *    (a client confirmed receipt) is not ACKNOWLEDGED (a human confirmed). A
 *    recipient with no channel says why — DRIVER NOT ASSIGNED, no share link,
 *    push not configured — instead of rendering an empty cell that reads as
 *    "fine".
 *  - every figure carries n, a numerator/denominator, its source and its
 *    freshness. An absent measurement renders UNKNOWN, never 0.
 *  - the old window is struck through with <del> (semantic, announced by screen
 *    readers) and never removed: the superseded window stays on the record.
 *  - the ladder (reminder → escalated) is shown as it is persisted, so the
 *    terminal and the dispatcher both see that a change went quiet.
 *
 * Refresh: the socket company room pushes `truck-window-changed` /
 * `truck-window-acknowledged` when the backend has them, and a 20s poll runs
 * regardless — a terminal on a flaky connection still gets a board that is at
 * most 20 seconds old, and the freshness line says how old it actually is.
 */

const POLL_MS = 20_000;
/** Older than this and the board says so rather than presenting itself as live. */
const STALE_AFTER_MS = 90_000;

const DELIVERY_LABEL: Record<string, string> = {
  QUEUED: "Queued",
  PUBLISHED: "Published (pull)",
  SENT: "Sent",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  UNAVAILABLE: "Unavailable",
};

/** Machine-readable absence reasons, rendered as words an operator can act on. */
const REASON_LABEL: Record<string, string> = {
  DRIVER_NOT_ASSIGNED: "DRIVER NOT ASSIGNED",
  NO_SHARE_TOKEN: "no share link issued",
  SHARE_TOKEN_EXPIRED: "share link expired",
  PUSH_NOT_CONFIGURED: "web push not configured",
  NO_PUSH_SUBSCRIPTION: "no device registered",
  NO_SOCKET_RECEIPT: "no client receipt",
  REALTIME_EMIT_FAILED: "realtime emit failed",
  IN_APP_WRITE_FAILED: "notification write failed",
  PUSH_SEND_FAILED: "push rejected",
  PUSH_ERROR: "push error",
  SHARE_LINK_NO_EXPIRY: "link predates expiry enforcement",
};

const KIND_LABEL: Record<string, string> = {
  RESCHEDULED: "Rescheduled",
  REPLANNED: "Day replan",
  CANCELLED: "Cancelled",
};

function reasonText(reason: string | null | undefined): string {
  if (!reason) return "";
  return REASON_LABEL[reason] ?? reason;
}

/** Delivery, in words, with the reason attached whenever there is one. */
function deliveryText(r: WindowRecipient): string {
  const state = DELIVERY_LABEL[r.delivery.state] ?? r.delivery.state;
  const why = reasonText(r.delivery.reason);
  return why ? `${state} — ${why}` : state;
}

function RecipientLine({ r, canWrite, onAck, acking }: {
  r: WindowRecipient; canWrite: boolean; onAck: (r: WindowRecipient) => void; acking: boolean;
}) {
  const acked = r.ack.state === "ACKNOWLEDGED";
  const unreachable = r.delivery.state === "UNAVAILABLE";
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 text-[11px]">
      <span className="font-bold text-slate-300">{r.recipientType === "DRIVER" ? "Driver" : "Haulier"}:</span>
      <span className={unreachable ? "text-amber-300" : "text-slate-200"}>{r.recipientLabel}</span>

      {acked ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-300">
          <CheckCircle2 className="h-3 w-3" /> Confirmed
        </span>
      ) : unreachable ? (
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-400">
          Cannot confirm — not reachable
        </span>
      ) : r.escalation.stage === "ESCALATED" ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 font-bold text-rose-200">
          <AlertTriangle className="h-3 w-3" /> ESCALATED — not confirmed
        </span>
      ) : r.escalation.stage === "REMINDER" ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-bold text-amber-200">
          <BellRing className="h-3 w-3" /> Reminder sent — not confirmed
        </span>
      ) : (
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-300">Not confirmed yet</span>
      )}

      {/* Delivery is what we observed; it is never presented as an acknowledgement. */}
      <span className="text-slate-500">{deliveryText(r)}</span>

      {acked && r.ack.latencyMinutes != null && (
        <span className="text-slate-500">
          after {r.ack.latencyMinutes} min
          {r.ack.source ? ` · via ${r.ack.source.replace("_", " ").toLowerCase()}` : ""}
        </span>
      )}
      {/* A device-reported time is a claim from a clock we do not control: labelled, never merged. */}
      {acked && r.ack.ackDeviceAt && (
        <span className="text-slate-500" title="Reported by the device (an offline confirmation flushed later); the measurement uses the server-observed time.">
          device-reported {new Date(r.ack.ackDeviceAt).toLocaleString()}
        </span>
      )}

      {!acked && !unreachable && canWrite && r.recipientType === "HAULIER" && (
        <button
          type="button"
          onClick={() => onAck(r)}
          disabled={acking}
          className={btnNeutral}
          aria-label={`Confirm this window change on behalf of ${r.recipientLabel}`}
        >
          {acking ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Confirm for haulier
        </button>
      )}
    </li>
  );
}

function ChangeRow({ change, canWrite, onAck, acking }: {
  change: WindowChange; canWrite: boolean; onAck: (r: WindowRecipient) => void; acking: boolean;
}) {
  const a = change.appointment;
  const cancelled = change.changeKind === "CANCELLED";
  return (
    <tr className="border-t border-white/5 align-top">
      <td className="px-2 py-2 text-xs">
        <div className="font-bold text-slate-100">{a.vehicleReg}</div>
        <div className="text-slate-400">{a.haulierName}</div>
        <div className="text-slate-500">{a.terminalName}</div>
      </td>
      <td className="px-2 py-2 text-xs">
        {/* The superseded window stays visible and struck through — never silently overwritten. */}
        <del className="block text-slate-500 line-through" title="Superseded window — no longer in force">
          {change.previousWindow.text}
        </del>
        {cancelled ? (
          <span className="mt-0.5 block font-black text-rose-300">No new window — cancelled</span>
        ) : (
          <span className="mt-0.5 block text-base font-black text-emerald-300">{change.newWindow?.text}</span>
        )}
        <div className="mt-0.5 text-slate-500">
          {KIND_LABEL[change.changeKind] ?? change.changeKind} · v{change.version}
          {change.forced ? " · forced inside cut-off" : ""}
        </div>
        {change.reason && <div className="mt-0.5 text-slate-300">Reason: {change.reason}</div>}
      </td>
      <td className="px-2 py-2 text-xs text-slate-300">
        <div>{change.recipients[0]?.escalation.sinceChange ?? "UNKNOWN"} since change</div>
        <div className="text-slate-500">{new Date(change.changedAt).toLocaleString()}</div>
        <div className="text-slate-500">
          by {change.changedBy?.email ?? change.changedBy?.id ?? "the platform"}
        </div>
      </td>
      <td className="px-2 py-2">
        <ul className="space-y-0.5" aria-label={`Acknowledgement state for ${a.vehicleReg}`}>
          {change.recipients.map((r) => (
            <RecipientLine key={r.id} r={r} canWrite={canWrite} onAck={onAck} acking={acking} />
          ))}
        </ul>
      </td>
    </tr>
  );
}

export default function TruckWindowAckBoard({ canWrite }: { canWrite: boolean }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const { socket, isConnected } = useSocket(user?.companyId ?? "");
  const [board, setBoard] = useState<WindowAckBoard | null>(null);
  const [kpis, setKpis] = useState<WindowKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [acking, setAcking] = useState(false);
  /** Set by a timer: the data is older than the threshold and no refresh has landed. */
  const [stale, setStale] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Same shape as the rest of the rail panels: `load` returns the promise of an
  // inner async function, so the mount effect starts a fetch instead of writing
  // state during the effect body. `loading` belongs to whoever initiates it (the
  // Refresh button) and is cleared here.
  const load = useCallback(
    (opts: { silent?: boolean } = {}) =>
      (async () => {
        try {
          const [b, k] = await Promise.all([getWindowAckBoard(), getWindowKpis()]);
          if (!mounted.current) return;
          setBoard(b); setKpis(k); setError(null); setStale(false); setLoadedAt(new Date());
        } catch (e) {
          if (!mounted.current) return;
          const message = String((e as Error)?.message ?? e);
          // A failed silent refresh must not wipe a board the terminal is
          // reading; it marks the data as ageing instead.
          setError(message);
          if (!opts.silent) { setBoard(null); setKpis(null); }
        } finally {
          if (mounted.current && !opts.silent) setLoading(false);
        }
      })(),
    [],
  );

  useEffect(() => { void load(); }, [load]);

  // Polling fallback: the socket is a bonus, never the only way the board moves.
  useEffect(() => {
    const t = setInterval(() => { void load({ silent: true }); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Realtime: refresh immediately when the backend says something changed.
  useEffect(() => {
    if (!socket) return undefined;
    const onChange = () => { void load({ silent: true }); };
    socket.on("truck-window-changed", onChange);
    socket.on("truck-window-acknowledged", onChange);
    return () => {
      socket.off("truck-window-changed", onChange);
      socket.off("truck-window-acknowledged", onChange);
    };
  }, [socket, load]);

  /**
   * Staleness has to change while nobody is touching the board, so it is armed
   * by a timer on every successful load rather than computed from a clock read
   * during render — a render-time `Date.now()` is impure, and it would only be
   * re-evaluated by a re-render that may never come.
   */
  useEffect(() => {
    if (!loadedAt) return undefined;
    const t = setTimeout(() => setStale(true), STALE_AFTER_MS);
    return () => clearTimeout(t);
  }, [loadedAt]);

  /**
   * Data on screen that can no longer be trusted: either it is older than the
   * staleness threshold, or the last refresh failed. Both say AGEING while the
   * rows stay visible — a board the terminal is reading is never wiped by a
   * failed background refresh, and it is never presented as current either.
   */
  const ageing = Boolean(board) && (stale || Boolean(error));

  const ack = async (change: WindowChange, recipient: WindowRecipient) => {
    setAcking(true);
    try {
      const res = await ackWindowChange(change.id, { idempotencyKey: `ack:${change.id}:${recipient.id}` });
      showToast(
        res.idempotentReplay
          ? "Already confirmed — the original confirmation stands."
          : `Confirmed for ${recipient.recipientLabel}. The driver's confirmation is tracked separately.`,
        "success",
      );
      await load({ silent: true });
    } catch (e) {
      showToast(String((e as Error)?.message ?? e), "error");
    } finally { setAcking(false); }
  };

  const counts = board?.counts;
  const latency = kpis?.ackLatency;
  const before = kpis?.ackedBeforeArrival;

  return (
    <section className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-3" aria-labelledby="truck-ack-board-title">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="truck-ack-board-title" className="flex items-center gap-2 text-sm font-black text-slate-100">
          <Truck className="h-4 w-4 text-sky-300" /> Does that truck know? — window-change acknowledgements
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500" aria-live="polite">
            {loadedAt ? `Updated ${loadedAt.toLocaleTimeString()}` : "Not loaded yet"}
            {ageing ? " · DATA AGEING — refresh" : ""}
            {isConnected ? " · live" : " · polling only"}
          </span>
          <button
            type="button"
            onClick={() => { setLoading(true); void load(); }}
            className={`${btnNeutral} inline-flex items-center gap-1`}
            aria-label="Refresh acknowledgement board"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {error && !board && (
        <Banner tone="danger" title="Acknowledgement board unavailable">
          {error}. Until it loads, nothing can be concluded about which changes have been confirmed.
        </Banner>
      )}
      {ageing && (
        <Banner tone="warn" title="This board is ageing">
          It was last loaded {loadedAt ? loadedAt.toLocaleTimeString() : "an unknown time ago"}
          {error ? ` and the refresh since then has failed: ${error}` : " and the refresh has not succeeded since"}.
          The rows below are what the terminal last saw — treat the confirmation states as UNKNOWN until it reloads.
        </Banner>
      )}

      {loading && !board ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading acknowledgements…
        </div>
      ) : !board ? null : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-[11px]" aria-label="Acknowledgement counts">
            <Pill tone="ok" title="Recipients that confirmed">Confirmed {counts?.acknowledged ?? 0}</Pill>
            <Pill tone="warn" title="Recipients that have not confirmed">Not confirmed {counts?.unacknowledged ?? 0}</Pill>
            <Pill tone="danger" title="Past the acknowledgement deadline and still not confirmed">Overdue {counts?.stale ?? 0}</Pill>
            <Pill tone="danger" title="Escalated to the terminal and dispatcher">Escalated {counts?.escalated ?? 0}</Pill>
            <Pill tone="muted" title="Recipients with no deliverable channel — excluded from every count above, because nobody can confirm a notification that could not be sent">
              Not reachable {counts?.unreachable ?? 0}
            </Pill>
            <Pill tone="muted" title="Changes with no driver attached — nobody to tell">Driver not assigned {counts?.driverNotAssigned ?? 0}</Pill>
            <Pill tone="muted" title="Active window changes on the board">Changes {board.changes}</Pill>
          </div>

          {kpis && (
            <div className="mb-3 grid gap-2 text-[11px] text-slate-300 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                <div className="text-slate-500">Change → confirmation</div>
                <div className="text-sm font-black text-slate-100">
                  median {latency?.medianText ?? "UNKNOWN"} · P90 {latency?.p90Text ?? "UNKNOWN"}
                </div>
                <div className="text-slate-500">n={latency?.n ?? 0} acknowledgements</div>
                <div className="mt-1 text-[10px] text-slate-500">
                  Haulier n={latency?.byRecipientType.HAULIER.n ?? 0} (median {latency?.byRecipientType.HAULIER.medianText ?? "UNKNOWN"}) ·
                  {" "}Driver n={latency?.byRecipientType.DRIVER.n ?? 0} (median {latency?.byRecipientType.DRIVER.medianText ?? "UNKNOWN"})
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                {/* The arrival is the terminal's own log entry, not a GPS fix. The
                    label says so everywhere this figure appears. */}
                <div className="text-slate-500">Confirmed before the truck arrived <span className="text-slate-600">(terminal-recorded arrival)</span></div>
                <div className="text-sm font-black text-slate-100">{before?.percentText ?? "UNKNOWN"}</div>
                <div className="text-slate-500">
                  {before?.ackedBeforeArrival ?? 0} of {before?.denominator ?? 0} changes with a terminal-recorded arrival
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {before?.ackedAfterArrival ?? 0} confirmed after arrival · {before?.neverAcked ?? 0} never confirmed
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  Excluded: {before?.excludedNoArrival ?? 0} no arrival recorded
                  {before && before.excludedUnreachable > 0 ? ` · ${before.excludedUnreachable} nobody reachable` : ""}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                <div className="text-slate-500">Open items</div>
                <div className="text-sm font-black text-slate-100">{kpis.staleUnackedChanges} stale</div>
                <div className="text-slate-500">{kpis.unreachableRecipients} recipients unreachable</div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {kpis.changesExamined} changes examined · {kpis.driverNotAssignedChanges} with no driver assigned
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2 sm:col-span-3">
                <div className="text-slate-500">Acknowledgement rate, by recipient — the two are never merged</div>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  {(["HAULIER", "DRIVER"] as const).map((type) => {
                    const rate = kpis.ackRate?.[type];
                    return (
                      <div key={type}>
                        <div className="text-sm font-black text-slate-100">
                          {type === "HAULIER" ? "Haulier organisation" : "Assigned driver"}: {rate?.percentText ?? "UNKNOWN"}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {rate?.acknowledged ?? 0} confirmed of {rate?.denominator ?? 0} reachable
                          {" · "}{rate?.notAcknowledged ?? 0} not confirmed
                          {rate && rate.unreachable > 0 ? ` · ${rate.unreachable} excluded (no channel)` : ""}
                          {type === "DRIVER" && rate && rate.driverNotAssigned > 0
                            ? ` · ${rate.driverNotAssigned} DRIVER NOT ASSIGNED`
                            : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">{kpis.ackRate?.definition}</div>
              </div>
            </div>
          )}

          {kpis && (
            <p className="mb-3 text-[10px] leading-relaxed text-slate-500">
              <span className="font-bold text-slate-400">Method:</span> {kpis.method}{" "}
              {board.method ? <><span className="font-bold text-slate-400">Counts:</span> {board.method}{" "}</> : null}
              <span className="font-bold text-slate-400">Arrival:</span> {kpis.ackedBeforeArrival.arrivalSource}{" "}
              <span className="font-bold text-slate-400">Source:</span> {kpis.source}{" "}
              <span className="font-bold text-slate-400">Computed:</span> {new Date(kpis.computedAt).toLocaleString()}.
              A missing figure is UNKNOWN, never zero.
            </p>
          )}

          {board.rows.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-slate-400">
              <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-slate-500" />
              No window change is currently in force. Published changes appear here with their acknowledgement state —
              nothing is waiting on a confirmation right now.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <caption className="sr-only">
                  Window changes in force, with the acknowledgement state of each recipient and how long it has been
                  since the change was published.
                </caption>
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-2 py-1.5">Truck</th>
                    <th scope="col" className="px-2 py-1.5">Window (old → new)</th>
                    <th scope="col" className="px-2 py-1.5">Time since change</th>
                    <th scope="col" className="px-2 py-1.5">Who knows</th>
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((c) => (
                    <ChangeRow key={c.id} change={c} canWrite={canWrite} acking={acking} onAck={(r) => void ack(c, r)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
