import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Loader2, ShieldCheck } from "lucide-react";
import { ackSharedTruckAppointment, getSharedTruckAppointment, type SharedTruckAppointment } from "../api/railTruckAppointmentsApi";

/**
 * Counterparty view of a booked truck window, reached through the expiring
 * share link. The haulier (or their dispatcher) is not a FlowOps user: this page
 * is deliberately tiny, and the token in the URL is the credential.
 *
 * What it must do, and why it is built this way:
 *  - A CHANGED window is the first thing on the page. The new window is large,
 *    the superseded one is struck through with <del> (semantic, so a screen
 *    reader announces it as deleted rather than reading two plausible times),
 *    and the reason is shown when the terminal had to give one.
 *  - Confirming is ONE big button, thumb-reachable, no nested menus. The person
 *    confirming may be in a cab yard on a phone in bright light.
 *  - The link's own validity is stated honestly: when it can be read but not
 *    confirmed (a legacy link issued before expiry enforcement) we say so and
 *    tell the haulier what to ask the terminal for, rather than rendering a
 *    button that would be refused.
 *  - The page polls. A haulier is not on a FlowOps socket, so the refresh
 *    fallback is the only way a change reaches them while the page is open.
 */

const STATUS_LABEL: Record<string, string> = {
  BOOKED: "Booked",
  ARRIVED: "Arrived at terminal",
  LOADING: "Loading",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
};

/** A haulier-facing page must not need a reload to notice a new window. */
const POLL_MS = 15_000;

function humanTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "UNKNOWN";
}

export default function GateAppointmentPage() {
  const { token } = useParams<{ token: string }>();
  const [appt, setAppt] = useState<SharedTruckAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  /** A failed background poll. Distinct from `error`, which means "no data". */
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  // Same shape as the rest of the app's loaders: `load` returns the promise of an
  // inner async function, so the mount effect starts a fetch rather than writing
  // state during the effect body. `loading` belongs to whoever initiates a
  // non-silent load (Try again / Reload) and is cleared here.
  const load = useCallback(
    (opts: { silent?: boolean } = {}) =>
      (async () => {
        if (!token) return;
        try {
          const data = await getSharedTruckAppointment(token);
          setAppt(data);
          // The server's own words are shown when a read is refused — an expired
          // or revoked link has a specific reason, and a generic message hides it.
          setError(null);
          setRefreshError(null);
          setLoadedAt(new Date());
        } catch (e) {
          const message = String((e as Error)?.message ?? e);
          if (opts.silent) {
            // A failed background poll must not turn a readable page into "this
            // link cannot be used": the link is fine, the refresh was not. Say
            // which, and keep showing the window the haulier was reading.
            setRefreshError(message);
          } else {
            setError(message);
            setAppt(null);
          }
        } finally {
          if (!opts.silent) setLoading(false);
        }
      })(),
    [token],
  );

  useEffect(() => { void load(); }, [load]);

  // Poll while the page is open: this is the delivery fallback for link-based
  // hauliers, who have no realtime connection of their own.
  useEffect(() => {
    const t = setInterval(() => { void load({ silent: true }); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const confirm = async () => {
    if (!token) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      // The idempotency key is derived from the change, so a double tap (or a
      // flaky connection retrying) cannot record two confirmations.
      // deviceAckedAt is the counterparty's clock, sent as a claim. The server
      // stores it separately from the time it observed the request and measures
      // latency only with its own — so a wrong phone clock cannot move a KPI.
      await ackSharedTruckAppointment(token, {
        idempotencyKey: `share-ack:${appt?.change?.id ?? token}`,
        deviceAckedAt: new Date().toISOString(),
      });
      await load({ silent: true });
    } catch (e) {
      setConfirmError(String((e as Error)?.message ?? e));
      // A refusal usually means the world moved on — the version was superseded,
      // or the link expired. Re-read so the haulier is left looking at the
      // window that is actually in force instead of a refused button.
      await load({ silent: true });
    } finally {
      setConfirming(false);
    }
  };

  if (!token) {
    return <UnusableLink message="This link is incomplete — it carries no share token." />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your appointment…
      </div>
    );
  }

  if (error || !appt) {
    return (
      <UnusableLink
        message={error ?? "Unable to load this appointment — check the link."}
        onRetry={() => { setLoading(true); void load(); }}
      />
    );
  }

  const change = appt.change;
  const cancelled = change?.changeKind === "CANCELLED";
  const acked = change?.acknowledged ?? false;
  // Defensive: the shared view always carries the link state, but a payload from
  // an older backend mid-rollout would otherwise crash the page a haulier is
  // standing in a yard reading. Absent link state means "cannot confirm".
  const link = appt.link;
  const canAck = link?.canAcknowledge ?? false;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
        <ShieldCheck className="h-4 w-4" />
        Shared by the terminal operator · this page is read-only apart from confirming a change
      </div>
      <h1 className="text-2xl font-black text-white">Truck window · {appt.terminalName}</h1>

      {refreshError && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200"
        >
          This page could not refresh itself: {refreshError}. What is shown was last loaded
          {loadedAt ? ` at ${loadedAt.toLocaleTimeString()}` : " at an unknown time"} — reload it before you travel.
          <button
            type="button"
            onClick={() => { setLoading(true); void load(); }}
            className="ml-2 font-bold underline"
          >
            Reload
          </button>
        </p>
      )}

      {/* ── The change, first and largest ─────────────────────────────── */}
      {change && (
        <section
          aria-labelledby="window-change-title"
          className={`mt-4 rounded-xl border-2 p-4 ${acked ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/50 bg-amber-500/10"}`}
        >
          <h2 id="window-change-title" className="text-sm font-black uppercase tracking-widest text-slate-200">
            {cancelled ? "Your window was cancelled" : "Your window has CHANGED"} · version {change.version}
          </h2>

          <div className="mt-3">
            <div className="text-xs text-slate-400">Previous window — no longer in force</div>
            <del className="text-lg text-slate-500 line-through">{change.previousWindowText}</del>
          </div>

          <div className="mt-2" aria-live="polite">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-200">
              {cancelled ? "New window" : "Use this window"}
            </div>
            {cancelled ? (
              <p className="text-2xl font-black text-rose-300">
                No replacement window — do not travel to the terminal
              </p>
            ) : (
              <p className="text-3xl font-black leading-tight text-emerald-300">
                {change.newWindowText ?? "UNKNOWN — ask the terminal"}
              </p>
            )}
          </div>

          {change.reason && (
            <p className="mt-3 text-sm text-slate-200">
              <span className="font-bold">Reason given by the terminal:</span> {change.reason}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            Published by the terminal {humanTime(change.changedAt)}
          </p>

          {acked ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-200">
              <div className="flex items-center gap-2 font-black">
                <CheckCircle2 className="h-5 w-5" /> Confirmed
              </div>
              <p className="mt-1 text-xs">
                The terminal recorded your confirmation at {humanTime(change.acknowledgedAt)}. If the window changes
                again, a new version will appear here and will need confirming again.
              </p>
            </div>
          ) : canAck ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={confirming}
                className="w-full rounded-2xl bg-emerald-500 px-6 py-5 text-xl font-black text-emerald-950 shadow-lg shadow-emerald-500/20 disabled:opacity-60"
                aria-describedby="confirm-explainer"
              >
                {confirming ? "Confirming…" : cancelled ? "Confirm I know it is cancelled" : "CONFIRM — I have the new window"}
              </button>
              <p id="confirm-explainer" className="mt-2 text-center text-xs text-slate-400">
                One tap tells the terminal that this change has reached you. The time of your confirmation is recorded.
              </p>
              {confirmError && (
                <p className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200" role="alert">
                  {confirmError}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-300">
              <div className="font-bold text-slate-200">You cannot confirm from this link</div>
              <p className="mt-1 text-xs">
                {link?.noExpiryOnRecord
                  ? "This link was issued before FlowOps enforced link expiry, so it can be read but not used to confirm. Ask the terminal operator to re-share the appointment and use the new link."
                  : "This link can no longer be used to confirm a change. Ask the terminal operator for a current link."}
              </p>
            </div>
          )}
        </section>
      )}

      {!change && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-slate-400">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          No change has been published to this window. If the terminal moves it, the new window appears here and this
          page updates itself.
        </div>
      )}

      {/* ── The appointment as it currently stands ────────────────────── */}
      <section aria-labelledby="appointment-title" className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h2 id="appointment-title" className="text-sm font-bold uppercase tracking-widest text-slate-300">Your appointment</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Purpose</dt>
            <dd className="text-slate-200">{appt.purpose}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Haulier</dt>
            <dd className="font-semibold text-slate-200">{appt.haulierName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Vehicle</dt>
            <dd className="text-slate-200">{appt.vehicleReg}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Current window</dt>
            <dd className="text-right font-bold text-slate-100">
              <CalendarClock className="mr-1 inline h-4 w-4" />
              {new Date(appt.windowStart).toLocaleString()} – {new Date(appt.windowEnd).toLocaleTimeString()}
              {(appt.windowVersion ?? 1) > 1 && (
                <span className="block text-[11px] font-normal text-slate-500">version {appt.windowVersion}</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-400">Status</dt>
            <dd className="text-slate-200">{STATUS_LABEL[appt.status] ?? appt.status}</dd>
          </div>
        </dl>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Arrive inside your window. A changed window is only valid once it appears on this page — the terminal's board
          shows whether you have confirmed it.
          {link?.expiresAt
            ? ` This link expires ${humanTime(link.expiresAt)}; ask the terminal for a new one after that.`
            : " This link has no expiry recorded."}
        </p>
      </section>
    </div>
  );
}


/**
 * The page a counterparty gets when the link itself cannot be used. The reason is
 * the server's, and the booking is explicitly unaffected — a haulier who thinks
 * their slot is gone will otherwise drive to the terminal to find out.
 */
function UnusableLink({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center" role="alert">
      <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-rose-400" />
      <h1 className="text-lg font-bold text-rose-300">This link cannot be used</h1>
      <p className="mt-2 text-sm text-slate-300">{message}</p>
      <p className="mt-4 text-xs text-slate-500">
        Share links expire and can be revoked. If you believe this link should still work, ask the terminal operator to
        issue a fresh one — your booking itself is unaffected.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200"
        >
          Try again
        </button>
      )}
    </div>
  );
}
