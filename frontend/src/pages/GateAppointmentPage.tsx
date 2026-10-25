import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarClock, CheckCircle2, Clock, Loader2, Truck, XCircle } from "lucide-react";
import { getSharedTruckAppointment, type SharedTruckAppointment } from "../api/railTruckAppointmentsApi";

/**
 * Public counterparty view of one terminal truck appointment, opened from
 * an unguessable share link the operator sent the haulier/terminal. Read-only
 * by design: it shows the booked window, the vehicle and the measured state
 * (arrival/loading/completion timestamps) — nothing internal to the tenant.
 */
const STATUS_LABEL: Record<string, string> = {
  BOOKED: "Booked — arrive inside your window",
  ARRIVED: "Arrived at terminal",
  LOADING: "Loading / offloading in progress",
  COMPLETED: "Completed",
  NO_SHOW: "Marked as no-show",
  CANCELLED: "Cancelled",
};

export default function GateAppointmentPage() {
  const { token } = useParams<{ token: string }>();
  const [appt, setAppt] = useState<SharedTruckAppointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setError("This share link is incomplete."); setLoading(false); return; }
      try {
        const data = await getSharedTruckAppointment(token);
        if (!cancelled) setAppt(data);
      } catch {
        if (!cancelled) setError("This appointment link is invalid or has been revoked by the operator.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-2 text-sky-300">
          <Truck className="h-5 w-5" />
          <h1 className="text-base font-black tracking-wide">Terminal gate appointment</h1>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-400" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your appointment…
          </div>
        ) : error ? (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        ) : appt ? (
          <div>
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {STATUS_LABEL[appt.status] ?? appt.status}
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-400">Terminal</dt><dd className="font-bold">{appt.terminalName}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-400">Haulier</dt><dd className="font-bold">{appt.haulierName}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-400">Vehicle</dt><dd className="font-bold">{appt.vehicleReg}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-400">Purpose</dt><dd className="font-bold">{appt.purpose === "COLLECTION" ? "Collection" : "Delivery"}</dd></div>
              <div className="flex justify-between gap-4">
                <dt className="flex items-center gap-1 text-slate-400"><CalendarClock className="h-3.5 w-3.5" /> Window</dt>
                <dd className="text-right font-bold">
                  {new Date(appt.windowStart).toLocaleString()} – {new Date(appt.windowEnd).toLocaleTimeString()}
                </dd>
              </div>
              {appt.arrivedAt && (
                <div className="flex justify-between gap-4"><dt className="text-slate-400">Arrived</dt><dd className="font-bold">{new Date(appt.arrivedAt).toLocaleString()}</dd></div>
              )}
              {appt.waitMinutes != null && (
                <div className="flex justify-between gap-4">
                  <dt className="flex items-center gap-1 text-slate-400"><Clock className="h-3.5 w-3.5" /> Measured wait (arrival → loading)</dt>
                  <dd className="font-bold">{appt.waitMinutes} min</dd>
                </div>
              )}
            </dl>
            <p className="mt-5 text-[11px] leading-relaxed text-slate-500">
              Times shown are recorded by the terminal operator. If this window no longer works,
              contact the operator who sent you this link — a changed window is only valid once it
              appears here.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
