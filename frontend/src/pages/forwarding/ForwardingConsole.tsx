import {useCallback,  useEffect, useMemo, useState } from "react";
import { formatMoney } from "../../lib/currency";
import { useNavigate } from "react-router-dom";
import {
  Ship, Plane, Truck, Plus, Loader2, Crown, Search, AlertTriangle,
  ArrowRight, Anchor, Package, KeyRound, Stamp, Timer, Wallet, ShieldAlert,
  FileWarning, Activity, Gauge, Route,
  type LucideIcon,
} from "lucide-react";
import {
  listFiles, createFile, getForwardingOverview,
  type ShipmentFile, type ForwardingOverview, type ForwardingException, type FreightMode, type FreightDirection, type LoadType,
} from "../../api/forwardingApi";
import { getEntitlements } from "../../api/billingApi";
import { useToast } from "../../components/toast-context";
import { TiltCard } from "../../components/premium/TiltCard";
import SarsEdiSetup from "./SarsEdiSetup";
const tenantCurrency = () => window.__FLOWOPS_CURRENCY__ ?? 'ZAR';

const MODE_ICON: Record<string, LucideIcon> = { OCEAN: Ship, AIR: Plane, ROAD: Truck };

const STATUS_CLS: Record<string, string> = {
  DRAFT: "border-white/15 bg-white/5 text-white/50",
  BOOKED: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  CARGO_RECEIVED: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  LOADED: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  DEPARTED: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  ARRIVED: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  CUSTOMS_CLEARED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  DELIVERED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  CANCELLED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

function fmtDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "—";
}

export default function ForwardingConsole() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [entitled, setEntitled] = useState<boolean | null>(null);
  // "Now" is captured once on mount via the sanctioned lazy initializer
  // (Date.now() must not be called during render). The ages computed from it
  // below are day-granular, so mount-time precision is honest.
  const [now] = useState(() => Date.now());
  const [files, setFiles] = useState<ShipmentFile[]>([]);
  const [overview, setOverview] = useState<ForwardingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ direction?: string; status?: string; q?: string }>({});
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showEdi, setShowEdi] = useState(false);
  const [form, setForm] = useState({ mode: "OCEAN", direction: "IMPORT", loadType: "FCL", shipperName: "", consigneeName: "" });

  useEffect(() => {
    void (async () => {
      try {
        const ent = await getEntitlements().catch(() => null);
        const ok = !!ent?.features?.freightForwarding;
        setEntitled(ok);
        if (ok) {
          const [f, ov] = await Promise.all([
            listFiles(),
            getForwardingOverview().catch(() => null),
          ]);
          setFiles(f);
          setOverview(ov);
        }
      } catch {
        setEntitled(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const reload = useCallback(() => listFiles(filter).catch(() => []).then(setFiles), [filter]);
  useEffect(() => { if (entitled) void reload(); }, [entitled, reload]);

  const kpis = useMemo(() => {
    const open = files.filter((f) => !["DELIVERED", "CANCELLED"].includes(f.status)).length;
    const arriving = files.filter((f) => f.eta && new Date(f.eta).getTime() < now + 7 * 86400000 && !["DELIVERED", "CANCELLED"].includes(f.status)).length;
    const atRisk = files.filter((f) => (f.aiRiskScore ?? 0) >= 50).length;
    return { open, arriving, atRisk, total: files.length };
  }, [files, now]);

  // Prefer the server roll-up (covers all files + customs/demurrage/disbursement
  // exposure); fall back to what we can derive from the loaded list.
  const ovKpis = useMemo(() => ({
    openFiles: overview?.kpis.openFiles ?? kpis.open,
    arriving7d: overview?.kpis.arriving7d ?? kpis.arriving,
    atRisk: overview?.kpis.atRisk ?? kpis.atRisk,
    customsPending: overview?.kpis.customsPending ?? 0,
    demurrageExposure: overview?.kpis.demurrageExposure ?? 0,
    demurrageAccruingCount: overview?.kpis.demurrageAccruingCount ?? 0,
    disbursementOutstanding: overview?.kpis.disbursementOutstanding ?? 0,
  }), [overview, kpis]);

  const submitNew = async () => {
    setCreating(true);
    try {
      const created = await createFile({ ...form, mode: form.mode as FreightMode, direction: form.direction as FreightDirection, loadType: form.loadType as LoadType });
      showToast(`Created ${created.fileNumber}`, "success");
      setShowNew(false);
      navigate(`/forwarding/${created.id}`);
    } catch (e) {
      showToast(e?.message ?? "Could not create file", "error");
    } finally { setCreating(false); }
  };

  if (loading) {
    return <div className="min-h-full grid place-items-center bg-[#0b1530]"><Loader2 className="h-7 w-7 animate-spin text-white/40" /></div>;
  }

  if (!entitled) {
    return (
      <div className="min-h-full bg-[linear-gradient(180deg,#07111f,#0b1530)] p-8">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-cyan-500/30 bg-cyan-500/8 p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-500/15 ring-1 ring-cyan-500/30">
            <Anchor className="h-7 w-7 text-cyan-300" />
          </div>
          <h1 className="mt-4 text-2xl font-black text-white">Freight Forwarding</h1>
          <p className="mt-2 text-sm text-white/60">
            Manage ocean &amp; air container import/export — shipment files, containers, customs, charges and the
            domestic last-mile, all in one place. Available on the <span className="font-bold text-cyan-300">Enterprise</span> plan.
          </p>
          <button onClick={() => navigate("/billing/plans")} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/20 px-5 py-2.5 text-sm font-black text-cyan-200 hover:bg-cyan-500/30 transition">
            <Crown className="h-4 w-4" /> See Enterprise plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(20,120,160,0.12),transparent_30%),linear-gradient(180deg,#07111f,#0b1530)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">

        {/* Header */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl shadow-[0_16px_50px_rgba(0,0,0,0.3)] fx-reveal">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-500/20 ring-2 ring-cyan-500/30">
                <Anchor className="h-7 w-7 text-cyan-300" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Freight Forwarding</p>
                <h1 className="text-2xl font-black text-white">Shipment Files</h1>
                <p className="text-xs text-white/40">Import / export · ocean · air · road</p>
              </div>
            </div>
            <button onClick={() => setShowNew((v) => !v)} className="flex items-center gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/15 px-5 py-2.5 text-sm font-bold text-cyan-200 hover:bg-cyan-500/25 transition">
              <Plus className="h-4 w-4" /> New file
            </button>
            <button onClick={() => setShowEdi((v) => !v)} title="SARS EDI transmission setup"
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10 transition">
              <KeyRound className="h-4 w-4" /> SARS EDI
            </button>
            <button onClick={() => navigate("/forwarding/sadc-corridors")} title="SADC border posts, corridors & port routing"
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10 transition">
              <Route className="h-4 w-4" /> SADC Corridors
            </button>
          </div>

          {/* Exposure KPIs — the desk's live risk & money picture */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <TiltCard><Kpi icon={Package} label="Open files" value={ovKpis.openFiles} tone="text-white" /></TiltCard>
            <TiltCard><Kpi icon={Activity} label="Arriving (7d)" value={ovKpis.arriving7d} tone="text-amber-300" /></TiltCard>
            <TiltCard><Kpi icon={Stamp} label="Customs pending" value={ovKpis.customsPending} tone="text-sky-300" /></TiltCard>
            <TiltCard><Kpi icon={Timer} label="Demurrage est." value={fmtMoney(ovKpis.demurrageExposure)} tone="text-rose-300" sub={ovKpis.demurrageAccruingCount ? `${ovKpis.demurrageAccruingCount} accruing` : undefined} /></TiltCard>
            <TiltCard><Kpi icon={Wallet} label="Disbursed out" value={fmtMoney(ovKpis.disbursementOutstanding)} tone="text-emerald-300" /></TiltCard>
            <TiltCard><Kpi icon={ShieldAlert} label="At risk" value={ovKpis.atRisk} tone="text-rose-300" /></TiltCard>
          </div>

          {/* New file form */}
          {showNew && (
            <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-black/30 p-4 grid sm:grid-cols-5 gap-2">
              {(["mode", "direction", "loadType"] as const).map((k) => (
                <select key={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white">
                  {(k === "mode" ? ["OCEAN", "AIR", "ROAD"] : k === "direction" ? ["IMPORT", "EXPORT"] : ["FCL", "LCL", "BREAKBULK", "AIR"]).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ))}
              <input placeholder="Shipper" value={form.shipperName} onChange={(e) => setForm({ ...form, shipperName: e.target.value })} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/25" />
              <input placeholder="Consignee" value={form.consigneeName} onChange={(e) => setForm({ ...form, consigneeName: e.target.value })} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/25" />
              <button onClick={submitNew} disabled={creating} className="sm:col-span-5 flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/20 py-2.5 text-sm font-black text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create shipment file
              </button>
            </div>
          )}
        </div>

        {/* SARS EDI transmission setup */}
        {showEdi && <SarsEdiSetup />}

        {/* ── Command centre: needs attention ─────────────────────────────── */}
        {overview && overview.exceptions.length > 0 && (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 fx-glass fx-reveal">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <h2 className="text-sm font-black uppercase tracking-[0.15em] text-white/55">Needs attention</h2>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">{overview.exceptions.length}</span>
            </div>
            <div className="space-y-2">
              {overview.exceptions.map((x, i) => (
                <ExceptionRow key={`${x.fileId}-${x.kind}-${i}`} x={x} onClick={() => navigate(`/forwarding/${x.fileId}`)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Command centre: arrivals board + customs queue ──────────────── */}
        {overview && (overview.arrivals.length > 0 || ovKpis.customsPending > 0) && (
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Arrivals board */}
            <div className="lg:col-span-2 rounded-[28px] border border-white/10 bg-white/[0.05] p-5 fx-glass fx-reveal">
              <div className="flex items-center gap-2 mb-3">
                <Anchor className="h-4 w-4 text-cyan-300" />
                <h2 className="text-sm font-black uppercase tracking-[0.15em] text-white/55">Arrivals board</h2>
                <span className="text-[10px] text-white/30">soonest ETA first</span>
              </div>
              {overview.arrivals.length === 0 ? (
                <p className="text-xs text-white/30 py-4">No files with an ETA yet — set ETAs on your open files to populate the board.</p>
              ) : (
                <div className="space-y-1.5">
                  {overview.arrivals.map((a) => {
                    const Icon = MODE_ICON[a.mode] || Ship;
                    return (
                      <button key={a.id} onClick={() => navigate(`/forwarding/${a.id}`)}
                        className="w-full text-left flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2 hover:bg-white/[0.06] transition fx-lift">
                        <Icon className="h-4 w-4 text-cyan-300 shrink-0" />
                        <span className="font-mono text-xs font-bold text-white/85 shrink-0">{a.fileNumber}</span>
                        <span className="text-[11px] text-white/45 truncate flex-1">{a.pol || "?"}→{a.pod || "?"}{a.consigneeName ? ` · ${a.consigneeName}` : ""}</span>
                        {a.aiRiskScore >= 50 && <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold text-rose-300 shrink-0">risk {a.aiRiskScore}</span>}
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0 ${STATUS_CLS[a.status] ?? STATUS_CLS.DRAFT}`}>{a.status.replace(/_/g, " ")}</span>
                        <span className={`text-[10px] shrink-0 ${a.overdue ? "text-rose-300 font-bold" : "text-white/40"}`}>{a.overdue ? "overdue " : "ETA "}{fmtDate(a.eta)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Customs queue */}
            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 fx-glass fx-reveal">
              <div className="flex items-center gap-2 mb-3">
                <Stamp className="h-4 w-4 text-sky-300" />
                <h2 className="text-sm font-black uppercase tracking-[0.15em] text-white/55">Customs queue</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <QueueChip label="Draft" value={overview.customsQueue.DRAFT} tone="text-white/60" />
                <QueueChip label="Submitted" value={overview.customsQueue.SUBMITTED} tone="text-sky-300" />
                <QueueChip label="Query" value={overview.customsQueue.QUERY} tone="text-amber-300" />
                <QueueChip label="Rejected" value={overview.customsQueue.REJECTED} tone="text-rose-300" />
                <QueueChip label="Released" value={overview.customsQueue.RELEASED} tone="text-emerald-300" full />
              </div>
              <p className="mt-3 text-[10px] leading-snug text-white/30">{overview.note}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
            <input placeholder="Search file no / shipper / consignee…" value={filter.q ?? ""} onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && reload()}
              className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder-white/25" />
          </div>
          {(["", "IMPORT", "EXPORT"] as const).map((d) => (
            <button key={d || "ALL"} onClick={() => setFilter({ ...filter, direction: d || undefined })}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold border transition ${(filter.direction || "") === d ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300" : "border-white/10 bg-white/5 text-white/40 hover:bg-white/10"}`}>
              {d || "ALL"}
            </button>
          ))}
        </div>

        {/* List */}
        {files.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-white/10 py-16 text-center">
            <Package className="h-12 w-12 text-white/15" />
            <p className="text-sm font-bold text-white/40">No shipment files yet</p>
            <p className="text-xs text-white/25">Create your first import/export file to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f) => {
              const Icon = MODE_ICON[f.mode] || Ship;
              const risk = f.aiRiskScore ?? 0;
              return (
                <button key={f.id} onClick={() => navigate(`/forwarding/${f.id}`)}
                  className="w-full text-left rounded-2xl border border-white/8 bg-white/[0.04] p-4 hover:bg-white/[0.07] transition flex items-center gap-4 fx-lift">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20 shrink-0">
                    <Icon className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-white">{f.fileNumber}</span>
                      <span className="text-[10px] font-bold text-white/40">{f.direction} · {f.loadType}</span>
                      {risk >= 50 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                          <AlertTriangle className="h-3 w-3" /> risk {risk}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-white/45 truncate">
                      {f.shipperName || "—"} → {f.consigneeName || "—"} · {f.pol || "?"}→{f.pod || "?"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_CLS[f.status] ?? STATUS_CLS.DRAFT}`}>
                      {f.status.replace(/_/g, " ")}
                    </span>
                    <div className="text-[10px] text-white/30 mt-1">ETA {fmtDate(f.eta)}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/20 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtMoney(n: number) {
  return formatMoney(Math.round(n), tenantCurrency());
}

function Kpi({ label, value, tone, icon: Icon, sub }: { label: string; value: number | string; tone: string; icon?: LucideIcon; sub?: string }) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4 fx-lift h-full">
      <div className="flex items-center justify-between">
        <div className={`text-2xl font-black ${tone}`}>{value}</div>
        {Icon && <Icon className="h-4 w-4 text-white/25" />}
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-rose-300/70 mt-0.5">{sub}</div>}
    </div>
  );
}

const EXC_META: Record<string, { tone: string; icon: LucideIcon }> = {
  CUSTOMS_QUERY: { tone: "amber", icon: Stamp },
  CUSTOMS_REJECTED: { tone: "rose", icon: FileWarning },
  DEMURRAGE: { tone: "rose", icon: Timer },
  RISK: { tone: "amber", icon: Gauge },
  DOCS: { tone: "sky", icon: FileWarning },
};
const SEV_DOT: Record<string, string> = { high: "bg-rose-400", medium: "bg-amber-400", low: "bg-white/40" };

function ExceptionRow({ x, onClick }: { x: ForwardingException; onClick: () => void }) {
  const meta = EXC_META[x.kind] ?? { tone: "amber", icon: AlertTriangle };
  const Icon = meta.icon;
  return (
    <button onClick={onClick}
      className="w-full text-left flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 hover:bg-white/[0.06] transition fx-lift">
      <span className={`h-2 w-2 rounded-full shrink-0 ${SEV_DOT[x.severity] ?? SEV_DOT.low}`} />
      <Icon className="h-4 w-4 text-white/45 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-bold text-white/85">{x.fileNumber}</span>
          <span className="text-[11px] font-bold text-white/70">{x.label}</span>
        </div>
        <div className="text-[11px] text-white/45 truncate">{x.detail}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-white/20 shrink-0" />
    </button>
  );
}

function QueueChip({ label, value, tone, full }: { label: string; value: number; tone: string; full?: boolean }) {
  return (
    <div className={`rounded-xl border border-white/8 bg-black/20 px-3 py-2 fx-lift ${full ? "col-span-2" : ""}`}>
      <div className={`text-xl font-black ${tone}`}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}
