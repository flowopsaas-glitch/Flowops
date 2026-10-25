import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, RefreshCw, Truck } from "lucide-react";
import {
  bookTruckAppointment, createTruckShareLink, getTruckAppointmentSummary, listTruckAppointments,
  replanTruckDay, revokeTruckShareLink, transitionTruckAppointment,
  type TruckAppointment, type TruckAppointmentSummary,
} from "../../api/railTruckAppointmentsApi";
import { useToast } from "../../components/toast-context";
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
  const [replan, setReplan] = useState({ terminalName: "", date: "", shiftMinutes: "120", reason: "" });
  const [replanning, setReplanning] = useState(false);
  const [editing, setEditing] = useState<{ id: string; start: string; end: string; force: boolean; reason: string } | null>(null);

  const load = useCallback(() => (async () => {
    try {
      const [list, sum] = await Promise.all([listTruckAppointments(), getTruckAppointmentSummary()]);
      setRows(list); setSummary(sum); setLoadError(null);
    } catch (e) {
      setLoadError(String((e as Error)?.message ?? e));
      setRows([]); setSummary(null);
    } finally { setLoading(false); }
  })(), []);

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

  const share = async (r: TruckAppointment) => {
    try {
      const link = await createTruckShareLink(r.id);
      const url = `${window.location.origin}${link.path}`;
      try { await navigator.clipboard.writeText(url); showToast("Share link copied — send it to the haulier/terminal. They see only this booking.", "success"); }
      catch { showToast(`Share link: ${url}`, "info"); }
      await load();
    } catch (e) { showToast(String((e as Error)?.message ?? e), "error"); }
  };

  const unshare = async (r: TruckAppointment) => {
    try { await revokeTruckShareLink(r.id); showToast("Share link revoked.", "success"); await load(); }
    catch (e) { showToast(String((e as Error)?.message ?? e), "error"); }
  };

  const applyReschedule = async () => {
    if (!editing) return;
    if (!editing.start || !editing.end) { showToast("New window start and end are required.", "error"); return; }
    if (editing.force && !editing.reason.trim()) { showToast("A forced change inside the cut-off needs a recorded reason.", "error"); return; }
    try {
      const res = await transitionTruckAppointment(editing.id, "reschedule", {
        windowStart: new Date(editing.start).toISOString(),
        windowEnd: new Date(editing.end).toISOString(),
        ...(editing.force ? { force: true, note: editing.reason.trim() } : {}),
      });
      showToast(res?.forced ? "Window changed (forced inside cut-off, reason recorded)." : "Window rescheduled.", "success");
      setEditing(null);
      await load();
    } catch (e) { showToast(String((e as Error)?.message ?? e), "error"); }
  };

  const applyReplan = async () => {
    const shift = Number.parseInt(replan.shiftMinutes, 10);
    if (!replan.terminalName.trim() || !replan.date || !Number.isFinite(shift) || shift === 0 || replan.reason.trim().length < 3) {
      showToast("Terminal, date, a non-zero shift and a reason are required to replan a day.", "error"); return;
    }
    setReplanning(true);
    try {
      const res = await replanTruckDay({ terminalName: replan.terminalName.trim(), date: replan.date, shiftMinutes: shift, reason: replan.reason.trim() });
      showToast(res.shifted === 0
        ? "No BOOKED appointments matched that terminal and day — nothing was moved."
        : `Replanned: ${res.shifted} window(s) shifted${res.withConflicts ? `, ${res.withConflicts} now overlap another booking — review the board` : ""}.`, res.shifted === 0 ? "info" : "success");
      await load();
    } catch (e) { showToast(String((e as Error)?.message ?? e), "error"); }
    finally { setReplanning(false); }
  };

  return (
    <Section title="Truck appointments (terminal gate)">
      <p className="mb-3 text-xs text-slate-400">
        Booked gate windows replace arrive-and-queue. Overlapping windows are flagged for the terminal
        operator to govern — never auto-rejected. Wait times are measured from recorded arrival and
        loading timestamps only.
        {summary?.changeCutoffHours != null && (
          <> Window changes inside {summary.changeCutoffHours}h of the window start must be forced with a
          recorded reason. Bookings can be shared with the haulier/terminal as a read-only link.</>
        )}
      </p>

      {loadError && <Banner tone="danger" title="Truck appointments unavailable">{loadError}. No conclusion about gate bookings can be drawn.</Banner>}
      {conflicts && (
        <Banner tone="warn" title="Overlapping window booked">
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

      {canWrite && (
        <div className="mb-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Replan a day">
          <label className="text-[11px] text-slate-400">Replan: terminal
            <input aria-label="Replan terminal" className={`${inputCls} mt-1 w-full`} value={replan.terminalName} onChange={(e) => setReplan({ ...replan, terminalName: e.target.value })} placeholder="Central Terminal" />
          </label>
          <label className="text-[11px] text-slate-400">Day
            <input aria-label="Replan date" type="date" className={`${inputCls} mt-1 w-full`} value={replan.date} onChange={(e) => setReplan({ ...replan, date: e.target.value })} />
          </label>
          <label className="text-[11px] text-slate-400">Shift (minutes, + late / − early)
            <input aria-label="Shift minutes" type="number" className={`${inputCls} mt-1 w-full`} value={replan.shiftMinutes} onChange={(e) => setReplan({ ...replan, shiftMinutes: e.target.value })} />
          </label>
          <label className="text-[11px] text-slate-400">Reason (recorded on every moved booking)
            <input aria-label="Replan reason" className={`${inputCls} mt-1 w-full`} value={replan.reason} onChange={(e) => setReplan({ ...replan, reason: e.target.value })} placeholder="Train ETA slipped 2h" />
          </label>
          <div className="flex items-end">
            <button type="button" onClick={() => void applyReplan()} disabled={replanning} className={`${btnNeutral} inline-flex items-center gap-2`}>
              {replanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Shift day's bookings
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
                        {r.status === "BOOKED" && (
                          <button type="button" onClick={() => setEditing({ id: r.id, start: r.windowStart.slice(0, 16), end: r.windowEnd.slice(0, 16), force: false, reason: "" })} className={btnNeutral}>Reschedule</button>
                        )}
                        {r.shareToken
                          ? <button type="button" onClick={() => void unshare(r)} className={btnNeutral}>Revoke link</button>
                          : <button type="button" onClick={() => void share(r)} className={btnNeutral}>Share link</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && canWrite && (
        <div className="mt-4 grid gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Reschedule appointment">
          <label className="text-[11px] text-slate-400">New window start
            <input aria-label="New window start" type="datetime-local" className={`${inputCls} mt-1 w-full`} value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} />
          </label>
          <label className="text-[11px] text-slate-400">New window end
            <input aria-label="New window end" type="datetime-local" className={`${inputCls} mt-1 w-full`} value={editing.end} onChange={(e) => setEditing({ ...editing, end: e.target.value })} />
          </label>
          <label className="flex items-end gap-2 text-[11px] text-slate-300">
            <input aria-label="Force change inside cut-off" type="checkbox" checked={editing.force} onChange={(e) => setEditing({ ...editing, force: e.target.checked })} />
            Force inside cut-off
          </label>
          <label className="text-[11px] text-slate-400">Reason (required when forced)
            <input aria-label="Forced change reason" className={`${inputCls} mt-1 w-full`} value={editing.reason} onChange={(e) => setEditing({ ...editing, reason: e.target.value })} placeholder="Recorded on the booking" />
          </label>
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => void applyReschedule()} className={btnPrimary}>Apply new window</button>
            <button type="button" onClick={() => setEditing(null)} className={btnNeutral}>Discard</button>
          </div>
        </div>
      )}
    </Section>
  );
}
