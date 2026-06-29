import { useEffect, useMemo, useState } from "react";
import {
  Landmark, Plus, Loader2, Search, CheckCircle2, Trash2, Wallet, Clock, AlertTriangle, TrendingUp,
} from "lucide-react";
import * as api from "../api/disbursementApi";
import { useToast } from "../components/ToastProvider";

const input = "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/25";
const money = (v: number) => `R${(v ?? 0).toLocaleString("en-ZA")}`;
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "—");

const STATUS_CFG: Record<api.DisbursementStatus, { label: string; cls: string }> = {
  OUTSTANDING: { label: "Outstanding", cls: "border-amber-400/20 bg-amber-500/10 text-amber-200" },
  INVOICED: { label: "Invoiced", cls: "border-sky-400/20 bg-sky-500/10 text-sky-200" },
  RECOVERED: { label: "Recovered", cls: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" },
  WRITTEN_OFF: { label: "Written off", cls: "border-white/10 bg-white/5 text-white/40" },
};

export default function Disbursements() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<api.Disbursement[]>([]);
  const [metrics, setMetrics] = useState<api.DisbursementMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ clientName: "", authority: "SARS", category: "DUTY", amount: "", reference: "", description: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([
        api.listDisbursements(statusFilter ? { status: statusFilter } : undefined),
        api.disbursementMetrics().catch(() => null),
      ]);
      setRows(r);
      setMetrics(m);
    } catch (e: any) {
      showToast(e?.message ?? "Could not load disbursements", "error");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [statusFilter]);

  const visible = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter((d) => (d.clientName ?? "").toLowerCase().includes(s) || d.authority.toLowerCase().includes(s) || (d.reference ?? "").toLowerCase().includes(s));
  }, [rows, q]);

  const create = async () => {
    if (!form.amount || Number(form.amount) <= 0) { showToast("Enter an amount", "error"); return; }
    setBusy("create");
    try {
      await api.createDisbursement({ ...form, amount: Number(form.amount) } as any);
      setForm({ clientName: "", authority: "SARS", category: "DUTY", amount: "", reference: "", description: "" });
      setShowNew(false);
      await load();
      showToast("Disbursement recorded", "success");
    } catch (e: any) { showToast(e?.message ?? "Could not record", "error"); }
    finally { setBusy(null); }
  };

  const act = async (id: string, fn: () => Promise<any>, ok: string) => {
    setBusy(id);
    try { await fn(); await load(); showToast(ok, "success"); }
    catch (e: any) { showToast(e?.message ?? "Action failed", "error"); }
    finally { setBusy(null); }
  };

  const agingTotal = metrics ? metrics.aging.d0_30 + metrics.aging.d31_60 + metrics.aging.d61_90 + metrics.aging.d90plus : 0;
  const agingBars = metrics ? [
    { label: "0–30d", v: metrics.aging.d0_30, cls: "bg-emerald-400" },
    { label: "31–60d", v: metrics.aging.d31_60, cls: "bg-sky-400" },
    { label: "61–90d", v: metrics.aging.d61_90, cls: "bg-amber-400" },
    { label: "90d+", v: metrics.aging.d90plus, cls: "bg-rose-400" },
  ] : [];

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        {/* Header */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 fx-reveal">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/20 ring-2 ring-emerald-500/30">
                <Landmark className="h-7 w-7 text-emerald-300" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Clearing finance</p>
                <h1 className="text-2xl font-black text-white">Disbursements</h1>
                <p className="text-xs text-white/40">Duties &amp; charges paid on a client's behalf — and recovered</p>
              </div>
            </div>
            <button onClick={() => setShowNew((v) => !v)} className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-5 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-500/25">
              <Plus className="h-4 w-4" /> Record disbursement
            </button>
          </div>

          {metrics && (
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={Clock} label="Outstanding" value={money(metrics.outstanding)} sub={`${metrics.outstandingCount} items`} tone="text-amber-300" />
              <Kpi icon={CheckCircle2} label="Recovered" value={money(metrics.recovered)} tone="text-emerald-300" />
              <Kpi icon={AlertTriangle} label="90d+ at risk" value={money(metrics.aging.d90plus)} tone={metrics.aging.d90plus ? "text-rose-300" : "text-white"} />
              <Kpi icon={TrendingUp} label="Written off" value={money(metrics.writtenOff)} tone="text-white/60" />
            </div>
          )}

          {/* Aging bar */}
          {metrics && agingTotal > 0 && (
            <div className="mt-4">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/5">
                {agingBars.map((b) => b.v > 0 && (
                  <div key={b.label} className={b.cls} style={{ width: `${(b.v / agingTotal) * 100}%` }} title={`${b.label}: ${money(b.v)}`} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-white/45">
                {agingBars.map((b) => (
                  <span key={b.label} className="inline-flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${b.cls}`} /> {b.label} {money(b.v)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {showNew && (
            <div className="mt-4 grid sm:grid-cols-6 gap-2 rounded-2xl border border-emerald-500/20 bg-black/30 p-4">
              <input placeholder="Client" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} className={`${input} sm:col-span-2`} />
              <select value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} className={input}>
                {["SARS", "Port Authority", "Shipping Line", "Airline", "Other"].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input}>
                {["DUTY", "VAT", "PORT", "LINE", "STORAGE", "OTHER"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" placeholder="Amount (R)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
              <button onClick={create} disabled={busy === "create"} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/20 py-2 text-sm font-black text-emerald-200 disabled:opacity-50">
                {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save
              </button>
              <input placeholder="Reference (receipt no.)" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className={`${input} sm:col-span-3`} />
              <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${input} sm:col-span-3`} />
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
            <input placeholder="Search client / authority / ref…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder-white/25" />
          </div>
          {["", "OUTSTANDING", "INVOICED", "RECOVERED", "WRITTEN_OFF"].map((s) => (
            <button key={s || "ALL"} onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold border transition ${statusFilter === s ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10"}`}>
              {s ? STATUS_CFG[s as api.DisbursementStatus].label : "All"}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-white/10 py-16 text-center">
            <Wallet className="h-12 w-12 text-white/15" />
            <p className="text-sm font-bold text-white/40">No disbursements yet</p>
            <p className="text-xs text-white/25">Record duties or charges you've paid on a client's behalf to track recovery.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((d) => {
              const cfg = STATUS_CFG[d.status];
              const ageDays = Math.floor((Date.now() - new Date(d.paidAt).getTime()) / 86_400_000);
              const aging = (d.status === "OUTSTANDING" || d.status === "INVOICED") && ageDays > 60;
              return (
                <div key={d.id} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 fx-lift flex items-center gap-4">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20 shrink-0">
                    <Landmark className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-white">{money(d.amount)}</span>
                      <span className="text-[10px] font-bold text-white/40">{d.authority}{d.category ? ` · ${d.category}` : ""}</span>
                      {aging && <span className="text-[10px] font-bold text-rose-300">{ageDays}d unrecovered</span>}
                    </div>
                    <div className="text-[11px] text-white/45 truncate">
                      {d.clientName || "—"}{d.reference ? ` · ref ${d.reference}` : ""} · paid {fmt(d.paidAt)}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shrink-0 ${cfg.cls}`}>{cfg.label}</span>
                  {d.status !== "RECOVERED" && (
                    <button onClick={() => act(d.id, () => api.recoverDisbursement(d.id), "Marked recovered")} disabled={busy === d.id}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40 shrink-0">
                      Recover
                    </button>
                  )}
                  <button onClick={() => act(d.id, () => api.deleteDisbursement(d.id), "Deleted")} disabled={busy === d.id}
                    className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5 text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = "text-white" }: { icon: any; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 fx-lift">
      <Icon className={`h-4 w-4 ${tone} opacity-80`} />
      <div className={`mt-2 text-xl font-black tracking-tight ${tone}`}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-white/30 mt-0.5">{sub}</div>}
    </div>
  );
}
