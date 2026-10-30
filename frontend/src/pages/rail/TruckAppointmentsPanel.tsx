import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, RefreshCw, Truck } from "lucide-react";
import {
  assignTruckDriver, bookTruckAppointment, createTruckShareLink, getTruckAppointmentSummary,
  listAssignableDrivers, listTruckAppointments, replanTruckDay, revokeTruckShareLink,
  transitionTruckAppointment,
  type AssignableDriver, type DriverAttachment, type TruckAppointment, type TruckAppointmentSummary,
} from "../../api/railTruckAppointmentsApi";
import { useToast } from "../../components/toast-context";
import { useAuth } from "../../contexts/auth-context";
import { canChangeWindowRole, WINDOW_CHANGE_DENIED_HINT } from "../../lib/railWindowAuthority";
import TruckWindowAckBoard from "./TruckWindowAckBoard";
import { Banner, Pill, Section, btnNeutral, btnPrimary, inputCls } from "./railUi";

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

const emptyForm = { terminalName: "", haulierName: "", vehicleReg: "", driverName: "", driverId: "", purpose: "DELIVERY", windowStart: "", windowEnd: "" };

/** Assigning is only possible while the truck has not been dealt with yet. */
const ASSIGNABLE_STATUSES = ["BOOKED", "ARRIVED"];

/**
 * What assigning a driver actually turned on, in the server's own terms.
 *
 * Assignment is two facts and the second one is conditional: if a window change
 * was already published, the driver has been attached to it, told over the
 * portal, and can confirm it; if none was open there was nothing to attach them
 * to. Saying "they have been notified" in the second case would claim a delivery
 * that never happened, and saying only "assigned" in the first would hide the
 * thing the terminal actually needs to know — that the open change now has this
 * driver on it, with their own clock and their own confirmation.
 */
function assignmentMessage(name: string, reg: string, a?: DriverAttachment | null): { message: string; tone: "success" | "error" } {
  const base = `${name} assigned to ${reg}.`;
  if (!a) {
    return {
      message: `${base} Window changes will reach them in the driver portal, and their confirmation is tracked separately from the haulier's.`,
      tone: "success",
    };
  }
  // Somebody else was taken off this change to make room: say so, because the
  // board will show a closed line and the operator should know why.
  const replaced = a.closedRecipientKeys.filter((k) => k !== "DRIVER:UNASSIGNED");
  const closedNote = replaced.length
    ? ` The previous driver was taken off the change (${replaced.join(", ")}).`
    : "";
  switch (a.reason) {
    case "ATTACHED":
      return {
        message: `${base} They were added to the open v${a.version} window change and told over the driver portal.`
          + ` Their confirmation is tracked separately from the haulier's, and their clock started at this assignment, not at the change.${closedNote}`,
        tone: "success",
      };
    case "ALREADY_ACKNOWLEDGED":
      return { message: `${base} They had already confirmed the open v${a.version} window change.${closedNote}`, tone: "success" };
    case "ALREADY_A_RECIPIENT":
      return {
        message: `${base} They were already on the open v${a.version} window change and still owe a confirmation.${closedNote}`,
        tone: "success",
      };
    case "NO_ACTIVE_CHANGE":
      return {
        message: `${base} No window change is open on it, so there was nothing to attach them to — the next one will reach them in the driver portal.`,
        tone: "success",
      };
    case "ATTACH_FAILED":
      // The driver IS assigned; the attachment is not. Both halves are stated,
      // because a green tick here would leave the open change addressed to
      // nobody and the terminal would not know to retry.
      return { message: `${base} But they were NOT attached to an open window change — ${a.message}`, tone: "error" };
    default:
      return { message: `${base} ${a.message}`, tone: "success" };
  }
}


export default function TruckAppointmentsPanel({ canWrite }: { canWrite: boolean }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  /**
   * Moving a published window is a separate permission from writing rail data:
   * inside one tenant sit both the terminal-side managers and the haulier's
   * dispatch desk, and only the former may re-time the terminal's gate. The
   * server enforces this; the UI states it instead of offering a control that
   * will be refused.
   */
  const canChangeWindow = canWrite && canChangeWindowRole(user?.role);
  const [rows, setRows] = useState<TruckAppointment[]>([]);
  /**
   * Active FlowOps drivers in this tenant — the only recipients the driver portal
   * can reach. A haulier's own driver, typed in as a name, is a label and not a
   * channel, so the two are kept apart everywhere below.
   */
  const [drivers, setDrivers] = useState<AssignableDriver[]>([]);
  const [driversError, setDriversError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [summary, setSummary] = useState<TruckAppointmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [booking, setBooking] = useState(false);
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const [replan, setReplan] = useState({ terminalName: "", date: "", shiftMinutes: "120", reason: "" });
  const [replanning, setReplanning] = useState(false);
  const [editing, setEditing] = useState<{ id: string; start: string; end: string; force: boolean; reason: string } | null>(null);
  /** Windows a day replan refused to move, with the reason — reported, never swallowed. */
  const [skipped, setSkipped] = useState<{ appointmentId: string; vehicleReg: string; reason: string }[]>([]);
  /**
   * Links issued before expiry enforcement: readable, unexpiring, unable to
   * confirm. Surfaced as a list because the only way to end one is revocation.
   */
  const legacyLinks = rows.filter((r) => r.shareLink?.legacy);

  const load = useCallback(() => (async () => {
    // Best-effort and separate: a role that cannot read the driver list must
    // still get the gate board, and the picker says why it is empty rather than
    // looking like there is nobody to assign.
    listAssignableDrivers()
      .then((d) => { setDrivers(d); setDriversError(null); })
      .catch((e) => { setDrivers([]); setDriversError(String((e as Error)?.message ?? e)); });
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
        driverId: form.driverId || undefined,
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
      // Cancelling a BOOKED window is a window change: the counterparty is told
      // and the confirmation loop applies. Inside the cut-off it needs a reason.
      const res = await transitionTruckAppointment(id, action, action === "cancel" ? { force: true, note: "Cancelled by the terminal operator" } : undefined);
      if (action === "cancel" && res?.change) {
        showToast(`Window cancelled as version v${res.change.version} — the haulier and driver were notified.`, "success");
      }
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

  /**
   * Assign the FlowOps driver who will actually drive this truck.
   *
   * This is the switch that turns the driver half of the loop on: without a
   * driverId the recipient is DRIVER:UNASSIGNED and the board reports DRIVER NOT
   * ASSIGNED instead of notifying anybody. Unassigning is not offered, because
   * the API does not support it — picking "not assigned" over an assigned driver
   * explains that rather than pretending it worked.
   */
  const assign = async (r: TruckAppointment, driverId: string) => {
    if (!driverId) {
      showToast(
        "A driver cannot be unassigned from here. Assign the driver who is actually driving; the terminal can reassign at any time.",
        "info",
      );
      return;
    }
    setAssigning(r.id);
    try {
      const res = await assignTruckDriver(r.id, driverId);
      const name = drivers.find((d) => d.id === driverId)?.name ?? driverId;
      const { message, tone } = assignmentMessage(name, r.vehicleReg, res?.driverAttachment);
      showToast(message, tone);
      await load();
    } catch (e) {
      showToast(String((e as Error)?.message ?? e), "error");
      await load();
    } finally { setAssigning(null); }
  };

  /**
   * Kill a legacy link and issue a new one in a single click. A legacy link was
   * issued before expiry enforcement: it never expires, and the only way to end
   * it is revocation — so re-issuing without revoking would leave the old one
   * readable forever.
   */
  const reissue = async (r: TruckAppointment) => {
    try {
      await revokeTruckShareLink(r.id);
      const link = await createTruckShareLink(r.id);
      const url = `${window.location.origin}${link.path}`;
      try { await navigator.clipboard.writeText(url); } catch { /* clipboard is a convenience, not the point */ }
      showToast(
        `Old link revoked and a new one issued${link.expiresAt ? `, expiring ${new Date(link.expiresAt).toLocaleString()}` : ""}. ` +
        `Send the new link — the old one no longer works. ${url}`,
        "success",
      );
      await load();
    } catch (e) { showToast(String((e as Error)?.message ?? e), "error"); }
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
      }, `reschedule:${editing.id}:${editing.start}:${editing.end}`);
      // The old window is superseded, not overwritten, and the haulier + driver
      // are told. Whether they have confirmed is on the acknowledgement board.
      const version = res?.change?.version;
      showToast(
        `Window changed (v${version ?? "?"}) — the previous window stays on the record as superseded, ` +
        `and the haulier${res?.change?.recipients?.some((r) => r.recipientType === "DRIVER" && r.driverId) ? " and the assigned driver were" : " was"} notified. ` +
        (res?.forced ? "Forced inside the cut-off; the reason is recorded. " : "") +
        "Confirmations are tracked on the board below.",
        "success",
      );
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
      // A day replan moves every BOOKED window at once, so a double submit must
      // not shift the day twice. The key is derived from the request itself: the
      // server replays the identical one, and a genuinely different reason is a
      // genuinely different request.
      const res = await replanTruckDay(
        { terminalName: replan.terminalName.trim(), date: replan.date, shiftMinutes: shift, reason: replan.reason.trim() },
        `replan:${replan.terminalName.trim()}:${replan.date}:${shift}:${replan.reason.trim()}`,
      );
      // Each moved window is its own notified change; the skipped ones are named,
      // because a day that was only partly replanned must not look like a whole day.
      setSkipped(res.skipped ?? []);
      showToast(res.shifted === 0
        ? `No BOOKED windows were moved.${res.skipped?.length ? ` ${res.skipped.length} were refused: ${res.skipped.map((k) => `${k.vehicleReg} (${k.reason})`).join("; ")}` : ""}`
        : `Replanned: ${res.shifted} window(s) moved, each published as its own notified change` +
          `${res.withConflicts ? ` · ${res.withConflicts} now overlap another booking — govern them` : ""}` +
          `${res.skipped?.length ? ` · ${res.skipped.length} NOT moved: ${res.skipped.map((k) => k.vehicleReg).join(", ")}` : ""}.`,
        res.shifted === 0 ? "info" : "success");
      await load();
    } catch (e) { showToast(String((e as Error)?.message ?? e), "error"); }
    finally { setReplanning(false); }
  };

  return (
    <Section title="Truck appointments (terminal gate)">
      <p className="mb-3 text-xs text-slate-400">
        Booked gate windows replace arrive-and-queue. Overlapping windows are flagged for the terminal
        operator to govern — never auto-rejected. Wait times are measured from recorded arrival and
        loading timestamps only. Changing a published window creates a new VERSION: the previous window
        stays on the record as superseded, and the haulier and the assigned driver are notified and
        tracked on the acknowledgement board below.
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

      {skipped.length > 0 && (
        <Banner tone="warn" title="Some windows were NOT moved by the day replan">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {skipped.map((k) => <li key={k.appointmentId}>{k.vehicleReg} — {k.reason}</li>)}
          </ul>
          A day that was only partly replanned must not look like a whole day. Handle these individually.
        </Banner>
      )}

      {legacyLinks.length > 0 && (
        <Banner tone="warn" title={`${legacyLinks.length} legacy share link${legacyLinks.length > 1 ? "s" : ""} — no expiry on record`}>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {legacyLinks.map((r) => (
              <li key={r.id}>{r.vehicleReg} · {r.haulierName} · {r.terminalName}</li>
            ))}
          </ul>
          These links were issued before expiry enforcement. They stay readable until somebody revokes them, and they
          can no longer be used to confirm a window change. Use <span className="font-bold">Revoke &amp; re-issue</span> on
          each row: revoking alone ends the link, re-issuing alone would leave the old one alive.
        </Banner>
      )}

      {/* "Does that truck know?" — the acknowledgement half of the closed loop. */}
      <TruckWindowAckBoard canWrite={canWrite} />

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
          <label className="text-[11px] text-slate-400">Driver in FlowOps (gets the portal confirmation)
            <select
              aria-label="Assigned FlowOps driver"
              className={`${inputCls} mt-1 w-full`}
              value={form.driverId}
              disabled={driversError !== null}
              title={driversError ? `Driver list unavailable: ${driversError}` : "Only an active FlowOps driver can be notified and can confirm in the portal"}
              onChange={(e) => setForm({ ...form, driverId: e.target.value })}
            >
              <option value="">Not assigned</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.id}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-slate-400">Driver name (haulier's own, optional)
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

      {canWrite && !canChangeWindow && (
        <Banner tone="warn" title="You can confirm changes but not move windows">
          {WINDOW_CHANGE_DENIED_HINT}
        </Banner>
      )}
      {canChangeWindow && (
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
                    {(r.windowVersion ?? 1) > 1 && (
                      <span className="mt-0.5 block text-[10px] text-slate-500">window v{r.windowVersion} (changed)</span>
                    )}
                    {r.pendingWindowChange && (
                      <span className="mt-0.5 block">
                        <Pill tone={r.pendingWindowChange.unacked > 0 ? "warn" : "ok"}>
                          {r.pendingWindowChange.unacked > 0
                            ? `v${r.pendingWindowChange.version} change · ${r.pendingWindowChange.unacked} not confirmed`
                            : `v${r.pendingWindowChange.version} change · confirmed`}
                        </Pill>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">{r.terminalName}</td>
                  <td className="px-2 py-2 text-xs">{r.haulierName} · {r.vehicleReg}
                    {r.driverId ? (
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        driver {r.driverName ?? "assigned"} · the portal can confirm
                      </span>
                    ) : (
                      <span
                        className="mt-0.5 block text-[10px] text-amber-300/80"
                        title="A window change can only reach a driver who has a FlowOps portal login. A name typed in as free text is a label, not a channel."
                      >
                        {r.driverName
                          ? `${r.driverName} is not a FlowOps driver — the portal cannot confirm`
                          : "no FlowOps driver — the portal cannot confirm a change"}
                      </span>
                    )}
                  </td>
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
                        {(NEXT[r.status] ?? []).map((n) => {
                          const needsWindowAuthority = n.action === "cancel" && r.status === "BOOKED";
                          return (
                            <button
                              key={n.action}
                              type="button"
                              onClick={() => void act(r.id, n.action)}
                              className={btnNeutral}
                              disabled={needsWindowAuthority && !canChangeWindow}
                              title={needsWindowAuthority && !canChangeWindow ? WINDOW_CHANGE_DENIED_HINT : undefined}
                            >
                              {n.label}
                            </button>
                          );
                        })}
                        {r.status === "BOOKED" && (
                          <button
                            type="button"
                            onClick={() => setEditing({ id: r.id, start: r.windowStart.slice(0, 16), end: r.windowEnd.slice(0, 16), force: false, reason: "" })}
                            className={btnNeutral}
                            disabled={!canChangeWindow}
                            title={canChangeWindow ? "Publish a new window version and notify the haulier and driver" : WINDOW_CHANGE_DENIED_HINT}
                          >
                            Reschedule
                          </button>
                        )}
                        {/* Cancelling a BOOKED window publishes a change, so it needs the same authority. */}
                        {r.status === "BOOKED" && !canChangeWindow && (
                          <span className="self-center text-[10px] text-slate-500" title={WINDOW_CHANGE_DENIED_HINT}>
                            Cancelling a booked window also needs the window-change permission
                          </span>
                        )}
                        {ASSIGNABLE_STATUSES.includes(r.status) && (
                          <label
                            className="flex w-full items-center gap-1 text-[10px] text-slate-500"
                            title={driversError ? `Driver list unavailable: ${driversError}` : undefined}
                          >
                            <span className="shrink-0">{r.driverId ? "Driver" : "Assign driver"}</span>
                            <select
                              aria-label={`Assign a FlowOps driver to ${r.vehicleReg}`}
                              className={`${inputCls} w-full py-0.5 text-[11px]`}
                              value={r.driverId ?? ""}
                              disabled={assigning === r.id || driversError !== null}
                              onChange={(e) => void assign(r, e.target.value)}
                            >
                              <option value="">Not assigned — the portal cannot confirm</option>
                              {/* An assigned driver who has since gone inactive is still the
                                  assigned driver: show them, do not silently look unassigned. */}
                              {r.driverId && !drivers.some((d) => d.id === r.driverId) && (
                                <option value={r.driverId}>{r.driverName ?? r.driverId} (not active)</option>
                              )}
                              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.id}</option>)}
                            </select>
                          </label>
                        )}
                        {r.shareToken
                          ? <button type="button" onClick={() => void unshare(r)} className={btnNeutral}>Revoke link</button>
                          : <button type="button" onClick={() => void share(r)} className={btnNeutral}>Share link</button>}
                        {r.shareLink?.legacy && (
                          <>
                            <span className="w-full rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-200" title={r.shareLink.warning ?? undefined}>
                              LEGACY LINK — never expires, cannot confirm
                            </span>
                            <button type="button" onClick={() => void reissue(r)} className={btnNeutral}>
                              Revoke &amp; re-issue
                            </button>
                          </>
                        )}
                        {r.shareLink?.state === "EXPIRED" && (
                          <span className="w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400">
                            Link expired — re-issue if they still need the window
                          </span>
                        )}
                        {r.shareLink?.state === "VALID" && r.shareLink.expiresAt && (
                          <span className="w-full text-[10px] text-slate-500">
                            Link expires {new Date(r.shareLink.expiresAt).toLocaleDateString()}
                          </span>
                        )}
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
