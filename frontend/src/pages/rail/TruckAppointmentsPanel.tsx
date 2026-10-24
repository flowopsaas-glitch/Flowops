import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, RefreshCw, Truck } from "lucide-react";
import {
  bookTruckAppointment, getTruckAppointmentSummary, listTruckAppointments, transitionTruckAppointment,
  type TruckAppointment, type TruckAppointmentSummary,
} from "../../api/railTruckAppointmentsApi";
import { useToast } from "../../components/ToastProvider";
import { Banner, Section, btnNeutral, btnPrimary, inputCls } from "./railUi";

/**
 * Terminal truck appointments — booked gate windows for the road side of the
 * road<->rail handoff. Overlaps are shown, not hidden: the terminal operator
 * governs conflicts. Wait times come from recorded timestamps only.
 */
const NEXT: Record<string, { action: "arrive" | "start-loading" | "complete" | "no-show" | "cancel"; label: string }[]> = {
  BOOKED: [
    { action: "arrive", label: "Arrived" },
    { action: "no-show", label: "No-show" },
    { action: "cancel", label: "Cancel" },
  ],
  ARRIVED: [
    { action: "start-loading", label: "Start loading" },
    { action: "cancel", label: "Cancel" },
  ],
  LOADING: [{ action: "complete", label: "Complete" }],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

const STATUS_STYLE: Record<string, string> = {
  BOOKED: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  ARRIVED: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  LOADING: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  COMPLETED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  NO_SHOW: "bg-red-500/10 text-red-300 border-red-500/30",
  CANCELLED: "bg-white/5 text-white/40 border-white/10",
};

const emptyForm = { terminalName: "", haulierName: "", vehicleReg: "", driverName: "", purpose: "DELIVERY", windowStart: "", windowEnd: "" };

export default function TruckAppointmentsPanel({ canWrite }: { canWrite: boolean }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<TruckAppointment[]>([]);
  const [summary, setSummary] = useState<TruckAppointmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [booking, setBooking] = useState(false);
  const [conflicts, setConflicts] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const [list, sum] = await Promise.all([listTruckAppointments(), getTruckAppointmentSummary()]);
      setRows(list); setSummary(sum);
    } catch (e) {
      setLoadError(String((e as Error)?.message ?? e));
      setRows([]); setSummary(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const book = async () => {
    if (!form.terminalName.trim() || !form.haulierName.trim() || !form.vehicleReg.trim() || !form.windowStart || !form.windowEnd) {
      showToast("Terminal, haulier, vehicle and window are required.", "error"); return;
    }
    setBooking(true); setConflicts(null);
    try {
      const created = await bookTruckAppointment({
        terminalName: form.terminalName.trim(),
        haulierName: form.haulierName.trim(),
        vehicleReg: form.vehicleReg.trim(),
        driverName: form.driverName.trim() || undefined,
        purpose: form.purpose,
        windowStart: new Date(form.windowStart).toISOString(),
        windowEnd: new Date(form.windowEnd).toISOString(),
      });
      if (created.conflicts?.length) {
        setConflicts(created.conflicts.map((c) => `${c.haulierName} (${c.vehicleReg})`));
        showToast("Booked — but this window overlaps an existing appointment. Review below.", "error");
      } else {
        showToast("Truck appointment booked.", "success");
      }
      setForm(emptyForm);
      await load();
    } catch (e) {
      showToast(String((e as Error)?.message ?? e), "error");
    } finally { setBooking(false); }
  };

  const act = async (id: string, action: "arrive" | "start-loading" | "complete" | "no-show" | "cancel") => {
    try {
      await transitionTruckAppointment(id, action);
      await load();
    } catch (e) {
      showToast(String((e as Error)?.message ?? e), "error");
    }
  };

  return (
    <Section title="Truck appointments (terminal gate)">
      <p className="mb-3 text-xs text-slate-400">
        Booked gate windows replace arrive-and-queue. Overlapping windows are flagged for the terminal
        operator to govern — never auto-rejected. Wait times are measured from recorded arrival and
        loading timestamps only.
      </p>

      {loadError && <Banner tone="danger">Truck appointments unavailable: {loadError}. No conclusion about gate bookings can be drawn.</Banner>}
      {conflicts && (
        <Banner tone="warn">
          Overlap on the last booking — also booked in that window: {conflicts.join(", ")}. Reschedule or proceed under terminal governance.
        </Banner>
      )}

      {summary && (
        <div className="mb-4 flex flex-wrap gap-2 text-[11px] text-slate-300" aria-label="Appointment summary">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">Total {summary.total}</span>
          {Object.entries(summary.byStatus).map(([k, v]) => (
            <span key={k} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">{k} {v}</span>
          ))}
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
            Avg wait {summary.avgWaitMinutes == null ? "unavailable (no measured waits)" : `${summary.avgWaitMinutes} min · n=${summary.measuredWaits}`}
          </span>
        </div>
      )}

      {canWrite && (
        <div className="mb-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[11px] text-slate-400">Terminal / yard
            <input aria-label="Terminal name" className={`${inputCls} mt-1 w-full`} value={form.terminalName} onChange={(e) => setForm({ ...form, terminalName: e.target.value })} placeholder="Central Terminal" />
          </label>
          <label className="text-[11px] text-slate-400">Haulier
            <input aria-label="Haulier name" className={`${inputCls} mt-1 w-full`} value={form.haulierName} onChange={(e) => setForm({ ...form, haulierName: e.target.value })} placeholder="Haulier Co" />
          </label>
          <label className="text-[11px] text-slate-400">Vehicle reg
            <input aria-label="Vehicle registration" className={`${inputCls} mt-1 w-full`} value={form.vehicleReg} onChange={(e) => setForm({ ...form, vehicleReg: e.target.value })} placeholder="ABC 123" />
          </label>
          <label className="text-[11px] text-slate-400">Driver (optional)
            <input aria-label="Driver name" className={`${inputCls} mt-1 w-full`} value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
          </label>
          <label className="text-[11px] text-slate-400">Window start
            <input aria-label="Window start" type="datetime-local" className={`${inputCls} mt-1 w-full`} value={form.windowStart} onChange={(e) => setForm({ ...form, windowStart: e.target.value })} />
          </label>
          <label className="text-[11px] text-slate-400">Window end
            <input aria-label="Window end" type="datetime-local" className={`${inputCls} mt-1 w-full`} value={form.windowEnd} onChange={(e) => setForm({ ...form, windowEnd: e.target.value })} />
          </label>
          <label className="text-[11px] text-slate-400">Purpose
            <select aria-label="Purpose" className={`${inputCls} mt-1 w-full`} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}>
              <option value="DELIVERY">Delivery</option>
              <option value="COLLECTION">Collection</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="button" onClick={() => void book()} disabled={booking} className={`${btnPrimary} inline-flex items-center gap-2`}>
              {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Book window
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => void load()} className={`${btnNeutral} inline-flex items-center gap-2`}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading appointments…</div>
      ) : rows.length === 0 && !loadError ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-slate-400">
          <CalendarClock className="mx-auto mb-2 h-8 w-8 text-slate-500" />
          No truck appointments yet. Book the first gate window above.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5">Window</th><th className="px-2 py-1.5">Terminal</th>
                <th className="px-2 py-1.5">Haulier / Vehicle</th><th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Measured wait</th><th className="px-2 py-1.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="px-2 py-2 text-xs text-slate-300">
                    {new Date(r.windowStart).toLocaleString()} – {new Date(r.windowEnd).toLocaleTimeString()}
                  </td>
                  <td className="px-2 py-2">{r.terminalName}</td>
                  <td className="px-2 py-2 text-xs">{r.haulierName} · {r.vehicleReg}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</span>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-300">
                    {r.waitMinutes == null ? "—" : `${r.waitMinutes} min`}
                    {r.lateMinutes != null && r.lateMinutes > 0 ? <span className="text-amber-300"> · arrived {r.lateMinutes} min after window start</span> : null}
                  </td>
                  <td className="px-2 py-2">
                    {canWrite && (
                      <div className="flex flex-wrap gap-1">
                        {(NEXT[r.status] ?? []).map((n) => (
                          <button key={n.action} type="button" onClick={() => void act(r.id, n.action)} className={btnNeutral}>{n.label}</button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
