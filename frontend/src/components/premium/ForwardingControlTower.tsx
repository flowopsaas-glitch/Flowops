import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Ship, Plane, Truck, Anchor, AlertTriangle, Clock, FileCheck, Timer,
  TrendingUp, ArrowRight, Plus, Loader2, PackageSearch, Globe2,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../api/client";

interface ForwardingMetrics {
  totalFiles: number;
  openFiles: number;
  mode: { OCEAN: number; AIR: number; ROAD: number };
  direction: { IMPORT: number; EXPORT: number };
  arriving7: number;
  arriving14: number;
  etaExceptions: number;
  customs: { draft: number; submitted: number; query: number; released: number; rejected: number };
  demurrageAtRisk: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  recentFiles: Array<{
    id: string; fileNumber: string; mode: string; direction: string; status: string;
    pol?: string | null; pod?: string | null; eta?: string | null; aiRiskScore?: number | null;
    consigneeName?: string | null;
  }>;
}

const MODE_ICON: Record<string, LucideIcon> = { OCEAN: Ship, AIR: Plane, ROAD: Truck };
const money = (v: number) => `R${(v ?? 0).toLocaleString("en-ZA")}`;
const fmtEta = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "—";

const STATUS_CLS: Record<string, string> = {
  DRAFT: "bg-white/5 text-white/50",
  BOOKED: "bg-sky-500/15 text-sky-300", CARGO_RECEIVED: "bg-sky-500/15 text-sky-300",
  LOADED: "bg-indigo-500/15 text-indigo-300", DEPARTED: "bg-indigo-500/15 text-indigo-300",
  ARRIVED: "bg-amber-500/15 text-amber-300",
  CUSTOMS_CLEARED: "bg-emerald-500/15 text-emerald-300", DELIVERED: "bg-emerald-500/15 text-emerald-300",
  CANCELLED: "bg-rose-500/15 text-rose-300",
};

export function ForwardingControlTower() {
  const navigate = useNavigate();
  const [m, setM] = useState<ForwardingMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/dashboard/forwarding-metrics");
        setM(res && typeof res === "object" && "data" in res ? res.data : res);
      } catch { /* leave null */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-8 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }
  if (!m) return null;

  // World-class empty state — instructional CTA, never a blank wall.
  if (m.totalFiles === 0) {
    return (
      <div className="rounded-[24px] border border-cyan-500/25 bg-[linear-gradient(135deg,rgba(34,211,238,0.08),rgba(99,102,241,0.05))] p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-500/15 ring-1 ring-cyan-500/30">
          <Globe2 className="h-7 w-7 text-cyan-300" />
        </div>
        <h2 className="mt-4 text-xl font-black text-white">Your import/export control tower is ready</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
          Create your first shipment file and this becomes a live command center — containers at sea,
          customs status, demurrage risk and profit per file, all in one view.
        </p>
        <button onClick={() => navigate("/forwarding")}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/20 px-5 py-2.5 text-sm font-black text-cyan-200 hover:bg-cyan-500/30">
          <Plus className="h-4 w-4" /> Create first shipment file
        </button>
      </div>
    );
  }

  const customsPipe = [
    { k: "draft", label: "Draft", v: m.customs.draft, cls: "text-white/60" },
    { k: "submitted", label: "Submitted", v: m.customs.submitted, cls: "text-sky-300" },
    { k: "query", label: "Query", v: m.customs.query, cls: "text-amber-300" },
    { k: "released", label: "Released", v: m.customs.released, cls: "text-emerald-300" },
    { k: "rejected", label: "Rejected", v: m.customs.rejected, cls: "text-rose-300" },
  ];

  return (
    <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_40%),rgba(255,255,255,0.03)] p-5 sm:p-6 space-y-5 fx-reveal">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-500/15 ring-1 ring-cyan-500/30">
            <Anchor className="h-6 w-6 text-cyan-300" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/70">Import / Export</p>
            <h2 className="text-xl font-black text-white">Freight Control Tower</h2>
          </div>
        </div>
        <button onClick={() => navigate("/forwarding")}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/10">
          Open Forwarding <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi icon={PackageSearch} label="Open files" value={m.openFiles} sub={`${m.totalFiles} total`} />
        <Kpi icon={Clock} label="Arriving 7d" value={m.arriving7} sub={`${m.arriving14} in 14d`} tone="text-sky-300" />
        <Kpi icon={AlertTriangle} label="ETA exceptions" value={m.etaExceptions} tone={m.etaExceptions ? "text-rose-300" : "text-white"} alert={m.etaExceptions > 0} />
        <Kpi icon={Timer} label="Demurrage risk" value={m.demurrageAtRisk} tone={m.demurrageAtRisk ? "text-amber-300" : "text-white"} alert={m.demurrageAtRisk > 0} />
        <Kpi icon={FileCheck} label="Customs released" value={m.customs.released} sub={`${m.customs.submitted} pending`} tone="text-emerald-300" />
        <Kpi icon={TrendingUp} label="Gross profit" value={money(m.grossProfit)} sub={`rev ${money(m.revenue)}`} tone="text-emerald-300" isText />
      </div>

      {/* Mode + Direction + Customs pipeline */}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-3">By mode &amp; direction</p>
          <div className="flex items-center gap-4 flex-wrap">
            {(["OCEAN", "AIR", "ROAD"] as const).map((mode) => {
              const Icon = MODE_ICON[mode];
              return (
                <div key={mode} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-cyan-300" />
                  <span className="text-lg font-black text-white">{m.mode[mode]}</span>
                  <span className="text-[10px] text-white/40">{mode}</span>
                </div>
              );
            })}
            <div className="ml-auto flex items-center gap-3 text-xs">
              <span className="rounded-full bg-sky-500/15 px-2.5 py-1 font-bold text-sky-300">IMP {m.direction.IMPORT}</span>
              <span className="rounded-full bg-violet-500/15 px-2.5 py-1 font-bold text-violet-300">EXP {m.direction.EXPORT}</span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mb-3">Customs pipeline</p>
          <div className="flex items-center justify-between gap-2">
            {customsPipe.map((c) => (
              <div key={c.k} className="text-center">
                <div className={`text-xl font-black ${c.cls}`}>{c.v}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/35">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent files */}
      <div className="rounded-2xl border border-white/8 bg-black/20 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Active shipment files</p>
        </div>
        <div className="divide-y divide-white/5">
          {m.recentFiles.map((f) => {
            const Icon = MODE_ICON[f.mode] || Ship;
            const overdue = f.eta && new Date(f.eta) < new Date() && !["CUSTOMS_CLEARED", "DELIVERED", "CANCELLED"].includes(f.status);
            return (
              <button key={f.id} onClick={() => navigate(`/forwarding/${f.id}`)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03] transition">
                <Icon className="h-4 w-4 text-cyan-300 shrink-0" />
                <span className="font-mono text-xs font-bold text-white shrink-0">{f.fileNumber}</span>
                <span className="text-[10px] text-white/35 shrink-0">{f.direction}</span>
                <span className="text-[11px] text-white/45 truncate flex-1">
                  {(f.pol || "?")} → {(f.pod || "?")}{f.consigneeName ? ` · ${f.consigneeName}` : ""}
                </span>
                {(f.aiRiskScore ?? 0) >= 50 && (
                  <span className="text-[10px] text-rose-300 shrink-0">risk {f.aiRiskScore}</span>
                )}
                <span className={`text-[10px] shrink-0 ${overdue ? "text-rose-300 font-bold" : "text-white/40"}`}>ETA {fmtEta(f.eta)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0 ${STATUS_CLS[f.status] ?? STATUS_CLS.DRAFT}`}>
                  {f.status.replace(/_/g, " ")}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = "text-white", alert, isText }: {
  icon: LucideIcon; label: string; value: number | string; sub?: string; tone?: string; alert?: boolean; isText?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 fx-lift ${alert ? "border-rose-500/25 bg-rose-500/[0.06]" : "border-white/8 bg-white/[0.03]"}`}>
      <Icon className={`h-4 w-4 ${tone} opacity-80`} />
      <div className={`mt-2 font-black tracking-tight ${tone} ${isText ? "text-lg" : "text-2xl"}`}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-white/30 mt-0.5">{sub}</div>}
    </div>
  );
}
