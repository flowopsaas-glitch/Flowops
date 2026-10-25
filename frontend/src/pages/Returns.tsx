import { errorMessageOf } from "@/components/patterns/errorMessage";
import React, { useCallback, useEffect, useState } from "react";
import { useDismissOnEscape } from "../components/patterns/useDismissOnEscape";
import {
  RotateCcw, Plus, Search, PackageCheck, Truck, ClipboardCheck,
  CheckCircle2, XCircle, Clock, RefreshCw, Banknote, Boxes, X, Trash2,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "../components/toast-context";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { TiltCard } from "../components/premium/TiltCard";
import {
  listReturns, getReturnStats, createReturn, transitionReturn, deleteReturn,
  getReturnInsights,
  type ReturnRecord, type ReturnStats, type ReturnStatus, type ReturnReason,
  type ReturnResolution, type ReturnTransition, type CreateReturnPayload, type TransitionPayload,
  type ReturnInsights,
} from "../api/returnsApi";

const glassCard = (className?: string) =>
  cn("rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl", className);

const STATUS_META: Record<ReturnStatus, { label: string; cls: string }> = {
  REQUESTED:  { label: "Requested",   cls: "text-amber-300 bg-amber-400/10 border-amber-400/30" },
  APPROVED:   { label: "Approved",    cls: "text-sky-300 bg-sky-400/10 border-sky-400/30" },
  REJECTED:   { label: "Rejected",    cls: "text-rose-300 bg-rose-400/10 border-rose-400/30" },
  SCHEDULED:  { label: "Scheduled",   cls: "text-indigo-300 bg-indigo-400/10 border-indigo-400/30" },
  IN_TRANSIT: { label: "In Transit",  cls: "text-cyan-300 bg-cyan-400/10 border-cyan-400/30" },
  RECEIVED:   { label: "Received",    cls: "text-violet-300 bg-violet-400/10 border-violet-400/30" },
  INSPECTING: { label: "Inspecting",  cls: "text-fuchsia-300 bg-fuchsia-400/10 border-fuchsia-400/30" },
  COMPLETED:  { label: "Completed",   cls: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30" },
  CANCELLED:  { label: "Cancelled",   cls: "text-white/50 bg-white/5 border-white/10" },
};

const REASONS: ReturnReason[] = [
  "DAMAGED", "DEFECTIVE", "WRONG_ITEM", "NOT_AS_DESCRIBED",
  "MISSING_PARTS", "NO_LONGER_NEEDED", "FAILED_DELIVERY", "LATE_DELIVERY", "OTHER",
];
const RESOLUTIONS: ReturnResolution[] = [
  "REFUND", "REPLACEMENT", "REPAIR", "STORE_CREDIT", "RESTOCK", "DISPOSE",
];
const STATUSES: ReturnStatus[] = [
  "REQUESTED", "APPROVED", "SCHEDULED", "IN_TRANSIT", "RECEIVED", "INSPECTING", "COMPLETED", "REJECTED", "CANCELLED",
];

const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const money = (n?: number | null, cur = "ZAR") =>
  n == null ? "—" : `${cur === "ZAR" ? "R" : cur + " "}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Next-step actions available from a given status. */
function actionsFor(status: ReturnStatus): { action: ReturnTransition; label: string; tone?: string }[] {
  switch (status) {
    case "REQUESTED":  return [{ action: "approve", label: "Approve", tone: "ok" }, { action: "reject", label: "Reject", tone: "bad" }];
    case "APPROVED":   return [{ action: "schedule", label: "Schedule Collection" }];
    case "SCHEDULED":  return [{ action: "collect", label: "Mark Collected" }];
    case "IN_TRANSIT": return [{ action: "receive", label: "Mark Received" }];
    case "RECEIVED":   return [{ action: "inspect", label: "Start Inspection" }, { action: "resolve", label: "Resolve", tone: "ok" }];
    case "INSPECTING": return [{ action: "resolve", label: "Resolve", tone: "ok" }];
    default:           return [];
  }
}

const StatCard = ({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: React.ReactNode; accent: string }) => (
  <div className={glassCard("p-4 flex items-center gap-3")}>
    <div className={cn("grid h-10 w-10 place-items-center rounded-xl", accent)}><Icon className="h-5 w-5" /></div>
    <div>
      <div className="text-2xl font-black leading-none">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-white/50 mt-1">{label}</div>
    </div>
  </div>
);

export default function Returns() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ReturnRecord[]>([]);
  const [stats, setStats] = useState<ReturnStats | null>(null);
  const [insights, setInsights] = useState<ReturnInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | "">("");
  const [reasonFilter, setReasonFilter] = useState<ReturnReason | "">("");

  const [createOpen, setCreateOpen] = useState(false);
  const [resolveFor, setResolveFor] = useState<ReturnRecord | null>(null);

  const load = useCallback(() => (async () => {
    const [list, st] = await Promise.all([
      listReturns({ search, status: statusFilter, reason: reasonFilter }),
      getReturnStats(),
    ]);
    setRows(list);
    setStats(st);
    getReturnInsights().then(setInsights).catch(() => setInsights(null));

  })().catch((e: unknown) => {
    showToast(errorMessageOf(e) || "Failed to load returns", "error");

  }).finally(() => {
    setLoading(false);

  }), [search, statusFilter, reasonFilter, showToast]);

  useEffect(() => { void load(); }, [load]);

  async function runTransition(r: ReturnRecord, action: ReturnTransition, payload?: TransitionPayload) {
    setBusyId(r.id);
    try {
      await transitionReturn(r.id, action, payload);
      showToast(`${r.rmaNumber}: ${pretty(action)} done`, "success");
      await load();
    } catch (e) {
      showToast(errorMessageOf(e) || `Could not ${action}`, "error");
    } finally {
      setBusyId(null);
    }
  }

  function onAction(r: ReturnRecord, action: ReturnTransition) {
    if (action === "resolve") { setResolveFor(r); return; }
    if (action === "reject" || action === "cancel") {
      const note = window.prompt(`${pretty(action)} ${r.rmaNumber} — reason (optional):`) ?? undefined;
      void runTransition(r, action, note ? { note } : {});
      return;
    }
    void runTransition(r, action);
  }

  async function onDelete(r: ReturnRecord) {
    if (!window.confirm(`Permanently delete ${r.rmaNumber}? This cannot be undone.`)) return;
    setBusyId(r.id);
    try {
      await deleteReturn(r.id);
      showToast(`${r.rmaNumber} deleted`, "success");
      await load();
    } catch (e) {
      showToast(errorMessageOf(e) || "Delete failed (admins/managers only)", "error");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = rows;

  return (
    <div className="p-4 md:p-8 space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500/15 text-sky-300"><RotateCcw className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Returns &amp; RMA</h1>
            <p className="text-sm text-white/50">Collect, inspect, refund and restock — the full reverse-logistics lifecycle.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-white/10 bg-white/5" onClick={() => void load()}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Refresh
          </Button>
          <Button className="bg-sky-500 hover:bg-sky-400" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Log Return
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Boxes}         label="Open Returns"        value={stats?.open ?? "—"}            accent="bg-sky-500/15 text-sky-300" />
        <StatCard icon={Clock}         label="Pending Approval"    value={stats?.pendingApproval ?? "—"} accent="bg-amber-500/15 text-amber-300" />
        <StatCard icon={Truck}         label="Awaiting Collection" value={stats?.awaitingCollection ?? "—"} accent="bg-indigo-500/15 text-indigo-300" />
        <StatCard icon={ClipboardCheck} label="In Inspection"      value={stats?.inInspection ?? "—"}    accent="bg-fuchsia-500/15 text-fuchsia-300" />
        <StatCard icon={CheckCircle2}  label="Completed"           value={stats?.completed ?? "—"}       accent="bg-emerald-500/15 text-emerald-300" />
        <StatCard icon={Banknote}      label="Refunds Paid"        value={money(stats?.refundsPaid)}     accent="bg-rose-500/15 text-rose-300" />
      </div>

      {/* Returns intelligence */}
      {insights && insights.reasonTotal > 0 && (
        <ReturnsIntelligence data={insights} onFilterReason={(r) => setReasonFilter(r)} />
      )}

      {/* Filters */}
      <div className={glassCard("p-3 flex flex-wrap items-center gap-3")}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search RMA, tracking #, customer…"
            className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm outline-none focus:border-sky-400/50"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ReturnStatus | "")}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-sky-400/50">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value as ReturnReason | "")}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-sky-400/50">
          <option value="">All reasons</option>
          {REASONS.map((r) => <option key={r} value={r}>{pretty(r)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className={glassCard("overflow-hidden")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-white/40">
              <tr>
                <th className="p-3">RMA</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Original</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Status</th>
                <th className="p-3">Resolution</th>
                <th className="p-3">Refund</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr><td colSpan={8} className="p-10 text-center text-white/40">Loading returns…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="p-10 text-center text-white/40">
                  No returns yet. Click <span className="text-sky-300 font-semibold">Log Return</span> to create the first RMA.
                </td></tr>
              )}
              {!loading && filtered.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="p-3 font-mono font-bold text-sky-300">{r.rmaNumber}</td>
                  <td className="p-3">
                    <div className="font-semibold">{r.customerName}</div>
                    <div className="text-xs text-white/40">{r.customerPhone || r.customerEmail || "—"}</div>
                  </td>
                  <td className="p-3 font-mono text-xs text-white/60">{r.trackingNumber || "—"}</td>
                  <td className="p-3 text-white/70">{pretty(r.reason)}</td>
                  <td className="p-3">
                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold", STATUS_META[r.status].cls)}>
                      {STATUS_META[r.status].label}
                    </span>
                  </td>
                  <td className="p-3 text-white/70">{r.resolution === "PENDING" ? "—" : pretty(r.resolution)}</td>
                  <td className="p-3 font-mono">{money(r.refundAmount, r.currency)}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1.5">
                      {actionsFor(r.status).map((a) => (
                        <button
                          key={a.action}
                          disabled={busyId === r.id}
                          onClick={() => onAction(r, a.action)}
                          className={cn(
                            "rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-40",
                            a.tone === "ok"  && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20",
                            a.tone === "bad" && "border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20",
                            !a.tone          && "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
                          )}
                        >
                          {a.label}
                        </button>
                      ))}
                      {!["COMPLETED", "CANCELLED", "REJECTED"].includes(r.status) && (
                        <button
                          disabled={busyId === r.id}
                          onClick={() => onAction(r, "cancel")}
                          title="Cancel return"
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/50 hover:text-rose-300 disabled:opacity-40"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        disabled={busyId === r.id}
                        onClick={() => onDelete(r)}
                        title="Delete (admins/managers)"
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/30 hover:text-rose-400 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <CreateReturnModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); void load(); }}
        />
      )}
      {resolveFor && (
        <ResolveModal
          record={resolveFor}
          onClose={() => setResolveFor(null)}
          onResolved={(payload) => {
            const r = resolveFor;
            setResolveFor(null);
            void runTransition(r, "resolve", payload);
          }}
        />
      )}
    </div>
  );
}

// ── Create Return modal ───────────────────────────────────────────────────

function CreateReturnModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateReturnPayload>({
    customerName: "", customerPhone: "", trackingNumber: "", reason: "OTHER", reasonNote: "",
  });
  const set = (patch: Partial<CreateReturnPayload>) => setForm((f) => ({ ...f, ...patch }));

  async function submit() {
    if (!form.customerName.trim()) { showToast("Customer name is required", "error"); return; }
    setSaving(true);
    try {
      await createReturn({
        ...form,
        refundAmount: form.refundAmount ? Number(form.refundAmount) : undefined,
      });
      showToast("Return logged", "success");
      onCreated();
    } catch (e) {
      showToast(errorMessageOf(e) || "Could not create return", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Log a Return" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Customer name *">
          <Input value={form.customerName} onChange={(v) => set({ customerName: v })} placeholder="Thabo Mokoena" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input value={form.customerPhone ?? ""} onChange={(v) => set({ customerPhone: v })} placeholder="+27…" /></Field>
          <Field label="Email"><Input value={form.customerEmail ?? ""} onChange={(v) => set({ customerEmail: v })} placeholder="name@example.com" /></Field>
        </div>
        <Field label="Original tracking # (auto-links the waybill + suggests COD refund)">
          <Input value={form.trackingNumber ?? ""} onChange={(v) => set({ trackingNumber: v })} placeholder="FO-000123" />
        </Field>
        <Field label="Pickup address"><Input value={form.pickupAddress ?? ""} onChange={(v) => set({ pickupAddress: v })} placeholder="Where to collect from" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reason">
            <select value={form.reason} onChange={(e) => set({ reason: e.target.value as ReturnReason })}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-sky-400/50">
              {REASONS.map((r) => <option key={r} value={r}>{pretty(r)}</option>)}
            </select>
          </Field>
          <Field label="Refund amount (R)">
            <Input value={form.refundAmount != null ? String(form.refundAmount) : ""} onChange={(v) => set({ refundAmount: v ? Number(v) : undefined })} placeholder="auto from COD" />
          </Field>
        </div>
        <Field label="Notes"><Input value={form.reasonNote ?? ""} onChange={(v) => set({ reasonNote: v })} placeholder="e.g. box crushed, item scratched" /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" className="border-white/10 bg-white/5" onClick={onClose}>Cancel</Button>
        <Button className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50" disabled={saving} onClick={() => void submit()}>
          {saving ? "Saving…" : "Create RMA"}
        </Button>
      </div>
    </Modal>
  );
}

// ── Resolve modal ───────────────────────────────────────────────────────

function ResolveModal({
  record, onClose, onResolved,
}: { record: ReturnRecord; onClose: () => void; onResolved: (p: TransitionPayload) => void }) {
  const [resolution, setResolution] = useState<ReturnResolution>("REFUND");
  const [refund, setRefund] = useState<string>(record.refundAmount != null ? String(record.refundAmount) : "");
  const [restockFee, setRestockFee] = useState<string>("");
  const restock = resolution === "RESTOCK";

  return (
    <Modal title={`Resolve ${record.rmaNumber}`} onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Resolution">
          <select value={resolution} onChange={(e) => setResolution(e.target.value as ReturnResolution)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-sky-400/50">
            {RESOLUTIONS.map((r) => <option key={r} value={r}>{pretty(r)}</option>)}
          </select>
        </Field>
        {(resolution === "REFUND" || resolution === "STORE_CREDIT") && (
          <Field label="Refund / credit amount (R)">
            <Input value={refund} onChange={setRefund} placeholder="0.00" />
          </Field>
        )}
        <Field label="Restocking fee (R, optional)">
          <Input value={restockFee} onChange={setRestockFee} placeholder="0.00" />
        </Field>
        <p className="text-xs text-white/40">
          {restock
            ? "Item will be flagged as restocked back into inventory."
            : "Marks the return COMPLETED and records the resolution + financials."}
        </p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" className="border-white/10 bg-white/5" onClick={onClose}>Cancel</Button>
        <Button className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold"
          onClick={() => onResolved({
            resolution,
            refundAmount: refund ? Number(refund) : undefined,
            restockFee: restockFee ? Number(restockFee) : undefined,
            restocked: restock,
          })}>
          <PackageCheck className="mr-2 h-4 w-4" /> Complete Return
        </Button>
      </div>
    </Modal>
  );
}

// ── Tiny shared UI ────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useDismissOnEscape(true, onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><button type="button" aria-label="Close dialog" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} />
      <div className={glassCard("w-full max-w-lg p-5")} role="dialog">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black">{title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] uppercase tracking-wide text-white/50">{label}</span>
    {children}
  </label>
);

const Input = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-sky-400/50"
  />
);



// ── Returns intelligence panel ──────────────────────────────────────────────

const REASON_BAR = [
  "bg-rose-400", "bg-amber-400", "bg-orange-400", "bg-sky-400",
  "bg-indigo-400", "bg-violet-400", "bg-fuchsia-400", "bg-emerald-400", "bg-slate-400",
];

function ReturnsIntelligence({
  data,
  onFilterReason,
}: {
  data: ReturnInsights;
  onFilterReason: (r: ReturnReason) => void;
}) {
  const maxCount = Math.max(1, ...data.reasonMix.map((r) => r.count));

  return (
    <div className={glassCard("p-5 fx-reveal")}>
      <div className="flex items-center gap-2 mb-4">
        <RotateCcw className="h-4 w-4 text-cyan-300" />
        <h2 className="text-[11px] font-black uppercase tracking-[0.24em] text-white/60">Returns Intelligence</h2>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TiltCard>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 h-full">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-black text-white">{data.avgCycleDays != null ? `${data.avgCycleDays}d` : "—"}</div>
              <Clock className="h-4 w-4 text-white/25" />
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Avg cycle time</div>
            <div className="text-[10px] text-white/35 mt-0.5">request → completed{data.completedCount ? ` · ${data.completedCount} done` : ""}</div>
          </div>
        </TiltCard>
        <TiltCard>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4 h-full">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-black text-emerald-300">{data.restockRatePct}%</div>
              <PackageCheck className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Restock rate</div>
            <div className="text-[10px] text-white/35 mt-0.5">{data.restockedCount} back into stock</div>
          </div>
        </TiltCard>
        <TiltCard>
          <div className={`rounded-2xl border p-4 h-full ${data.openRefundExposure > 0 ? "border-amber-400/20 bg-amber-500/[0.07]" : "border-white/8 bg-white/[0.03]"}`}>
            <div className="flex items-center justify-between">
              <div className={`text-xl font-black ${data.openRefundExposure > 0 ? "text-amber-300" : "text-white"}`}>{money(data.openRefundExposure)}</div>
              <Banknote className="h-4 w-4 text-amber-300" />
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Open refund exposure</div>
            <div className="text-[10px] text-white/35 mt-0.5">{data.openCount} in-flight return{data.openCount === 1 ? "" : "s"}</div>
          </div>
        </TiltCard>
        <TiltCard>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 h-full">
            <div className="flex items-center justify-between">
              <div className="text-lg font-black text-white truncate">{data.topReason ? pretty(data.topReason) : "—"}</div>
              <RotateCcw className="h-4 w-4 text-white/25" />
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40 mt-1">Top return reason</div>
            <div className="text-[10px] text-white/35 mt-0.5">across {data.reasonTotal} returns</div>
          </div>
        </TiltCard>
      </div>

      {/* Reason mix */}
      <div className="mt-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-2">Why things come back — click a reason to filter</p>
        <div className="space-y-1.5">
          {data.reasonMix.map((r, i) => (
            <button key={r.reason} onClick={() => onFilterReason(r.reason)}
              className="w-full text-left flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2 hover:bg-white/[0.06] transition">
              <span className="w-32 shrink-0 text-xs font-bold text-white/75 truncate">{pretty(r.reason)}</span>
              <span className="relative flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                <span className={`absolute inset-y-0 left-0 rounded-full ${REASON_BAR[i % REASON_BAR.length]}`} style={{ width: `${(r.count / maxCount) * 100}%` }} />
              </span>
              <span className="w-10 shrink-0 text-right text-xs font-black text-white">{r.count}</span>
              <span className="w-12 shrink-0 text-right text-[10px] text-white/40">{r.pct}%</span>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-snug text-white/30">{data.note}</p>
    </div>
  );
}
