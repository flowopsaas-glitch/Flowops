import { useEffect, useMemo, useState } from "react";
import { useDismissOnEscape } from "../components/patterns/useDismissOnEscape";
import { useNavigate } from "react-router-dom";
import {
  PackageCheck, Plus, Loader2, Crown, Sparkles, X, Check, Truck, Zap,
  MapPin, ArrowRight, Clock, ChevronRight,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useToast } from "../components/toast-context";
import { getEntitlements } from "../api/billingApi";
import {
  listCourierOrders, getCourierStats, createCourierOrder, updateCourierOrder,
  orchestrateCouriers, applyOrchestration,
  type CourierOrder, type CourierStats, type OrchestrationPlan, type CourierOrderPriority,
} from "../api/courierApi";

const glassCard = (c?: string) =>
  cn("rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl", c);

const PRIORITY_CLS: Record<string, string> = {
  URGENT: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  NORMAL: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  LOW: "border-white/15 bg-white/5 text-white/50",
};

const STATUS_COLS: { key: CourierOrder["status"]; label: string }[] = [
  { key: "NEW", label: "New" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "DISPATCHED", label: "Dispatched" },
  { key: "COMPLETED", label: "Completed" },
];

export default function CourierManagement() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<CourierOrder[]>([]);
  const [stats, setStats] = useState<CourierStats | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const [plan, setPlan] = useState<OrchestrationPlan | null>(null);
  const [applying, setApplying] = useState(false);

  const load = async () => {
    const [o, s] = await Promise.all([listCourierOrders().catch(() => []), getCourierStats().catch(() => null)]);
    setOrders(o);
    setStats(s);
  };

  useEffect(() => {
    void (async () => {
      try {
        const ent = await getEntitlements().catch(() => null);
        const ok = !!ent?.features?.courierManagement;
        setEntitled(ok);
        if (ok) await load();
      } catch { setEntitled(false); }
      finally { setLoading(false); }
    })();
  }, []);

  const grouped = useMemo(() => {
    const m: Record<string, CourierOrder[]> = { NEW: [], ASSIGNED: [], DISPATCHED: [], COMPLETED: [], CANCELLED: [] };
    for (const o of orders) (m[o.status] ||= []).push(o);
    return m;
  }, [orders]);

  const runOrchestrate = async () => {
    setOrchestrating(true);
    try {
      const p = await orchestrateCouriers();
      setPlan(p);
      if (!p.assignments.length) showToast(p.summary || "Nothing to orchestrate", "info");
    } catch (e) {
      showToast(e?.response?.data?.message || e?.message || "Orchestration failed", "error");
    } finally { setOrchestrating(false); }
  };

  const applyPlan = async () => {
    if (!plan) return;
    setApplying(true);
    try {
      const res = await applyOrchestration(plan.assignments.map((a) => ({ driverId: a.driverId, orderIds: a.orderIds })));
      showToast(`Applied — ${res.applied} order(s) assigned.`, "success");
      setPlan(null);
      await load();
    } catch (e) {
      showToast(e?.response?.data?.message || e?.message || "Could not apply plan", "error");
    } finally { setApplying(false); }
  };

  const advance = async (o: CourierOrder, status: CourierOrder["status"]) => {
    try { await updateCourierOrder(o.id, { status }); await load(); }
    catch (e) { showToast(e?.message || "Update failed", "error"); }
  };

  if (loading) return <div className="min-h-full grid place-items-center"><Loader2 className="h-7 w-7 animate-spin text-white/40" /></div>;

  if (!entitled) {
    return (
      <div className="min-h-full p-8">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-cyan-500/30 bg-cyan-500/8 p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-500/15 ring-1 ring-cyan-500/30">
            <PackageCheck className="h-7 w-7 text-cyan-300" />
          </div>
          <h1 className="mt-4 text-2xl font-black text-white">Courier Management Suite</h1>
          <p className="mt-2 text-sm text-white/60">
            Client order management plus <span className="text-white/80">AI delivery orchestration</span> — CLAW assigns
            and sequences pending orders across your available drivers in one click. Available on the{" "}
            <span className="font-bold text-cyan-300">Enterprise</span> plan.
          </p>
          <button onClick={() => navigate("/billing/plans")} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/20 px-5 py-2.5 text-sm font-black text-cyan-200 hover:bg-cyan-500/30 transition">
            <Crown className="h-4 w-4" /> See Enterprise plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 md:p-8 text-white">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500/30 to-sky-500/20 text-cyan-200">
          <PackageCheck className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight">Courier Management</h1>
          <p className="text-sm text-white/50">Client orders + AI delivery orchestration.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={runOrchestrate} disabled={orchestrating}
            className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/15 px-4 py-2 text-sm font-bold text-violet-200 hover:bg-violet-500/25 transition disabled:opacity-40">
            {orchestrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI Orchestrate
          </button>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-400 transition">
            <Plus className="h-4 w-4" /> New order
          </button>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "New", value: stats.new, cls: "text-sky-300" },
            { label: "Assigned", value: stats.assigned, cls: "text-violet-300" },
            { label: "Dispatched", value: stats.dispatched, cls: "text-amber-300" },
            { label: "Completed", value: stats.completed, cls: "text-emerald-300" },
          ].map((k) => (
            <div key={k.label} className={glassCard("p-4")}>
              <div className={cn("text-3xl font-black", k.cls)}>{k.value}</div>
              <div className="text-[11px] uppercase tracking-wider text-white/40">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Board */}
      <div className="grid gap-3 lg:grid-cols-4">
        {STATUS_COLS.map((col) => (
          <div key={col.key} className={glassCard("p-3")}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-white/60">{col.label}</h2>
              <span className="text-[11px] text-white/30">{grouped[col.key]?.length ?? 0}</span>
            </div>
            <div className="space-y-2">
              {(grouped[col.key] ?? []).map((o) => (
                <div key={o.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${PRIORITY_CLS[o.priority]}`}>{o.priority}</span>
                    <span className="ml-auto font-mono text-[10px] text-white/30">{o.reference}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-bold text-white/85">{o.clientName}</p>
                  <div className="mt-1 flex items-start gap-1 text-[11px] text-white/45">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="truncate">{o.pickupAddress}</span>
                    <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="truncate">{o.dropoffAddress}</span>
                  </div>
                  {o.assignedDriverName && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-cyan-300/80">
                      <Truck className="h-3 w-3" /> {o.assignedDriverName}{o.sequence ? ` · stop ${o.sequence}` : ""}
                    </div>
                  )}
                  <div className="mt-2 flex gap-1.5">
                    {o.status === "ASSIGNED" && <QuickBtn onClick={() => advance(o, "DISPATCHED")} label="Dispatch" />}
                    {o.status === "DISPATCHED" && <QuickBtn onClick={() => advance(o, "COMPLETED")} label="Complete" />}
                    {o.status === "NEW" && <span className="text-[10px] text-white/30">Awaiting orchestration</span>}
                  </div>
                </div>
              ))}
              {(grouped[col.key]?.length ?? 0) === 0 && <p className="py-4 text-center text-[11px] text-white/20">—</p>}
            </div>
          </div>
        ))}
      </div>

      {showNew && <NewOrderModal onClose={() => setShowNew(false)} onCreated={async () => { setShowNew(false); await load(); }} />}
      {plan && <PlanModal plan={plan} onClose={() => setPlan(null)} onApply={applyPlan} applying={applying} orders={orders} />}
    </div>
  );
}

function QuickBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/60 hover:bg-white/10 hover:text-white transition">
      <ChevronRight className="h-3 w-3" /> {label}
    </button>
  );
}

function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useDismissOnEscape(true, onClose);
  const { showToast } = useToast();
  const [f, setF] = useState({ clientName: "", pickupAddress: "", dropoffAddress: "", priority: "NORMAL" as CourierOrderPriority, contactPhone: "", itemsDesc: "" });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try { await createCourierOrder(f); showToast("Order created", "success"); onCreated(); }
    catch (e) { showToast(e?.response?.data?.message || e?.message || "Could not create order", "error"); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><button type="button" aria-label="Close dialog" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} />
      <div className={glassCard("w-full max-w-lg p-5")} role="dialog">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-cyan-300" />
          <h2 className="text-lg font-black">New courier order</h2>
          <button onClick={onClose} className="ml-auto text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Client name"><input value={f.clientName} onChange={(e) => set("clientName", e.target.value)} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pickup address"><input value={f.pickupAddress} onChange={(e) => set("pickupAddress", e.target.value)} className={inputCls} /></Field>
            <Field label="Drop-off address"><input value={f.dropoffAddress} onChange={(e) => set("dropoffAddress", e.target.value)} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <select value={f.priority} onChange={(e) => set("priority", e.target.value)} className={inputCls}>
                {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Contact phone"><input value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Items / notes"><input value={f.itemsDesc} onChange={(e) => set("itemsDesc", e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/60 hover:text-white">Cancel</button>
          <button disabled={saving || !f.clientName || !f.pickupAddress || !f.dropoffAddress} onClick={submit}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-400 disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanModal({ plan, onClose, onApply, applying, orders }: {
  plan: OrchestrationPlan; onClose: () => void; onApply: () => void; applying: boolean; orders: CourierOrder[];
}) {
  useDismissOnEscape(true, onClose);
  const refOf = (id: string) => orders.find((o) => o.id === id)?.reference || id.slice(0, 6);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><button type="button" aria-label="Close dialog" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} />
      <div className={glassCard("flex max-h-[85vh] w-full max-w-2xl flex-col p-5")} role="dialog">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-violet-300" />
          <h2 className="text-lg font-black">AI orchestration plan</h2>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/40">{plan.model}</span>
          <button onClick={onClose} className="ml-auto text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1 text-sm text-white/60">{plan.summary}</p>

        <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
          {plan.assignments.map((a) => (
            <div key={a.driverId} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-cyan-300" />
                <span className="text-sm font-bold text-white/85">{a.driverName || a.driverId}</span>
                <span className="ml-auto text-[11px] text-white/35">{a.orderIds.length} stop(s)</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.orderIds.map((id, i) => (
                  <span key={id} className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/70">{i + 1}. {refOf(id)}</span>
                ))}
              </div>
              {a.reasoning && <p className="mt-2 flex items-start gap-1.5 text-[11px] text-white/45"><Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-violet-300/70" />{a.reasoning}</p>}
            </div>
          ))}
          {plan.unassigned.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[11px] text-amber-200/80">
              <Clock className="mb-1 inline h-3.5 w-3.5" /> {plan.unassigned.length} order(s) couldn't be assigned — add drivers or assign manually.
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/60 hover:text-white">Discard</button>
          <button disabled={applying || !plan.assignments.length} onClick={onApply}
            className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold text-white hover:bg-violet-400 disabled:opacity-40">
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Apply plan
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400/40";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-white/40">{label}</span>
      {children}
    </label>
  );
}
