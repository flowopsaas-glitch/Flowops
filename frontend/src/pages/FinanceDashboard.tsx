import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, BarChart2, CheckCircle2, CreditCard,
  Download, FileText, Layers, RefreshCw, Scale, TrendingDown,
  TrendingUp, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api/client";
import { exportCsv, csvFilename } from "../lib/exportCsv";

// ── Types ─────────────────────────────────────────────────────────────────

type Metrics = { outstanding: number; collected: number; total: number; collectionRate: number };
type RevTrend = { month: string; billed: number; collected: number; outstanding: number };
type AgingBucket = { label: string; days: string; amount: number; count: number; pct: number };
type ClientRow = {
  name: string; totalBilled: number; totalPaid: number; totalOverdue: number;
  invoiceCount: number; collectionRate: number; avgDaysToPay: number | null;
};

function money(v?: number | null) {
  if (v == null) return "ZAR 0.00";
  if (v >= 1_000_000) return `ZAR ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `ZAR ${(v / 1_000).toFixed(1)}k`;
  return `ZAR ${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function moneyFull(v?: number | null) {
  return `ZAR ${(v ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function unwrap<T>(r: unknown): T { return ((r as { data?: T } | null)?.data ?? r) as T; }
function unwrapList<T>(r: unknown): T[] { const d = (r as { data?: unknown } | null)?.data ?? r; return Array.isArray(d) ? (d as T[]) : []; }

// ── Aging bucket colours ──────────────────────────────────────────────────
const AGING_CFG: Record<string, { bar: string; badge: string }> = {
  "Current":    { bar: "#10b981", badge: "border-emerald-400/20 bg-emerald-500/10 text-emerald-300" },
  "1–30 days":  { bar: "#f59e0b", badge: "border-amber-400/20 bg-amber-500/10 text-amber-300" },
  "31–60 days": { bar: "#f97316", badge: "border-orange-400/20 bg-orange-500/10 text-orange-300" },
  "61–90 days": { bar: "#ef4444", badge: "border-rose-400/20 bg-rose-500/10 text-rose-300" },
  "90+ days":   { bar: "#9f1239", badge: "border-rose-700/30 bg-rose-900/20 text-rose-300" },
};

// ── Tooltip component ─────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; color: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1628] p-3 text-xs shadow-xl">
      <div className="font-black text-white mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white/60 capitalize">{p.dataKey}:</span>
          <span className="font-bold text-white">{moneyFull(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────

export default function FinanceDashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics]     = useState<Metrics | null>(null);
  const [trend, setTrend]         = useState<RevTrend[]>([]);
  const [aging, setAging]         = useState<{ buckets: AgingBucket[]; total: number } | null>(null);
  const [clients, setClients]     = useState<ClientRow[]>([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    try {
      const [metRes, trendRes, agingRes, clientRes] = await Promise.allSettled([
        api.get("/invoices/metrics"),
        api.get("/invoices/revenue-trend"),
        api.get("/invoices/ar-aging"),
        api.get("/invoices/client-metrics"),
      ]);
      if (metRes.status === "fulfilled")    setMetrics(unwrap<Metrics>(metRes.value));
      if (trendRes.status === "fulfilled")  setTrend(unwrapList<RevTrend>(trendRes.value));
      if (agingRes.status === "fulfilled")  setAging(unwrap<{ buckets: AgingBucket[]; total: number }>(agingRes.value));
      if (clientRes.status === "fulfilled") setClients(unwrapList<ClientRow>(clientRes.value));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Trend delta (current month vs previous)
  const trendDelta = useMemo(() => {
    if (trend.length < 2) return null;
    const curr = trend[trend.length - 1].collected;
    const prev = trend[trend.length - 2].collected;
    if (!prev) return null;
    const pct = Math.round(((curr - prev) / prev) * 100);
    return { pct, up: pct >= 0 };
  }, [trend]);

  // Quick links
  const quickLinks = [
    { label: "Invoices",         desc: "Create & track",      to: "/invoices",        icon: FileText,  color: "text-blue-400" },
    { label: "Billing Batches",  desc: "Batch from waybills", to: "/billing-batches", icon: Layers,    color: "text-cyan-400"  },
    { label: "Credit Control",   desc: "Chase arrears",       to: "/credit-control",  icon: CreditCard,color: "text-rose-400"  },
    { label: "Quotes",           desc: "Freight estimates",   to: "/quotes",          icon: Scale,     color: "text-indigo-400"},
    { label: "COD",              desc: "Cash on delivery",    to: "/cod",             icon: Wallet,    color: "text-amber-400" },
    { label: "Rate Shopping",    desc: "Compare carriers",    to: "/rate-shopping",   icon: BarChart2, color: "text-sky-400"   },
  ];

  const Skeleton = () => (
    <div className="h-6 w-24 animate-pulse rounded-lg bg-white/10" />
  );

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(6,182,212,0.08),transparent_28%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6">

        {/* ── Header ── */}
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
                <BarChart2 className="h-3.5 w-3.5" /> Finance Command Centre
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Finance Dashboard</h1>
              <p className="mt-1 text-sm text-white/50">
                Revenue analytics, AR aging, client performance — one screen.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => exportCsv(
                  clients,
                  csvFilename("client-metrics"),
                  [
                    { key: "name",            label: "Client"          },
                    { key: "totalBilled",     label: "Total Billed"    },
                    { key: "totalPaid",       label: "Total Paid"      },
                    { key: "totalOverdue",    label: "Total Overdue"   },
                    { key: "invoiceCount",    label: "Invoice Count"   },
                    { key: "collectionRate",  label: "Collection Rate %" },
                    { key: "avgDaysToPay",    label: "Avg Days to Pay" },
                  ]
                )}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-white/60 hover:bg-white/10 hover:text-white transition"
              >
                <Download className="h-4 w-4" /> Export
              </button>
              <button onClick={load} disabled={loading} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10 disabled:opacity-40">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {/* ── KPI Strip ── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              icon: TrendingUp,
              label: "Total Billed",
              val: money(trend.reduce((s, m) => s + m.billed, 0)),
              sub: `${metrics?.total ?? 0} invoices`,
              tone: "text-white",
              border: "border-white/10",
            },
            {
              icon: CheckCircle2,
              label: "Collected",
              val: money(metrics?.collected),
              sub: `${(metrics?.collectionRate ?? 0).toFixed(1)}% rate`,
              tone: "text-emerald-300",
              border: "border-emerald-400/20",
              delta: trendDelta,
            },
            {
              icon: AlertTriangle,
              label: "Outstanding",
              val: money(metrics?.outstanding),
              sub: `${aging?.buckets.find(b => b.label === "90+ days")?.count ?? 0} invoices 90+ days`,
              tone: "text-amber-300",
              border: "border-amber-400/20",
            },
            {
              icon: Users,
              label: "Active Clients",
              val: String(clients.length),
              sub: `Top: ${clients[0]?.name?.split(" ")[0] ?? "—"}`,
              tone: "text-sky-300",
              border: "border-sky-400/20",
            },
          ].map(({ icon: Icon, label, val, sub, tone, border, delta }: { icon: LucideIcon; label: string; val: string; sub: string; tone: string; border: string; delta?: { up?: boolean; pct?: number } | null }) => (
            <div key={label} className={`rounded-[24px] border ${border} bg-white/[0.05] p-5`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">{label}</div>
                <Icon className="h-4 w-4 text-white/25" />
              </div>
              <div className={`text-2xl font-black ${tone}`}>
                {loading ? <Skeleton /> : val}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-slate-400">{sub}</span>
                {delta && (
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${delta.up ? "text-emerald-400" : "text-rose-400"}`}>
                    {delta.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {delta.pct > 0 ? "+" : ""}{delta.pct}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Revenue Trend Chart + AR Aging ── */}
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">

          {/* Revenue trend */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-black text-white">Revenue Trend</h2>
                <p className="text-xs text-white/40 mt-0.5">Billed vs collected — last 6 months</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-white/40">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" />Billed</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Collected</span>
              </div>
            </div>
            {loading ? (
              <div className="h-[200px] animate-pulse rounded-2xl bg-white/5" />
            ) : trend.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-white/20 text-sm">No revenue data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trend} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="billedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="collectedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="billed"    stroke="#38bdf8" fill="url(#billedGrad)"     strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="collected" stroke="#34d399" fill="url(#collectedGrad)"  strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* AR Aging */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-black text-white">AR Aging</h2>
                <p className="text-xs text-white/40 mt-0.5">Outstanding invoices by age bucket</p>
              </div>
              <button onClick={() => navigate("/credit-control")} className="flex items-center gap-1 text-xs text-white/40 hover:text-sky-400 transition">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-white/5" />)}
              </div>
            ) : !aging || aging.total === 0 ? (
              <div className="flex flex-col items-center justify-center h-[200px]">
                <CheckCircle2 className="h-10 w-10 text-emerald-400/40 mb-2" />
                <div className="text-white/30 font-bold text-sm">All accounts current</div>
              </div>
            ) : (
              <div className="space-y-3">
                {aging.buckets.map((b) => {
                  const cfg = AGING_CFG[b.label] ?? AGING_CFG["Current"];
                  return (
                    <div key={b.label} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.badge}`}>{b.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-white/40">{b.count} inv</span>
                          <span className="font-black text-white">{money(b.amount)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${b.pct}%`, backgroundColor: cfg.bar }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between text-xs text-white/40 pt-1 border-t border-white/8">
                  <span>Total outstanding</span>
                  <span className="font-black text-amber-300">{money(aging.total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Client Metrics + Monthly Bar Chart ── */}
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">

          {/* Top Clients */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-black text-white">Client Performance</h2>
                <p className="text-xs text-white/40 mt-0.5">Top 10 by revenue · collection rate · avg days to pay</p>
              </div>
            </div>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5 mb-2" />)
            ) : clients.length === 0 ? (
              <div className="py-12 text-center text-white/20 text-sm">No client data yet</div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
                {clients.map((c, i) => (
                  <div key={c.name} className="rounded-2xl border border-white/8 bg-white/3 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-black text-white/30 w-5 shrink-0">#{i + 1}</span>
                        <span className="font-bold text-white text-sm truncate">{c.name}</span>
                      </div>
                      <span className="font-black text-white whitespace-nowrap text-sm">{money(c.totalBilled)}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      {/* Collection rate bar */}
                      <div className="flex-1">
                        <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${c.collectionRate}%` }} />
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold whitespace-nowrap ${c.collectionRate >= 90 ? "text-emerald-400" : c.collectionRate >= 60 ? "text-amber-400" : "text-rose-400"}`}>
                        {c.collectionRate}% paid
                      </span>
                      {c.avgDaysToPay != null && (
                        <span className="text-[10px] text-white/30 whitespace-nowrap">
                          ~{c.avgDaysToPay}d avg
                        </span>
                      )}
                      {c.totalOverdue > 0 && (
                        <span className="text-[10px] font-bold text-rose-400 whitespace-nowrap">
                          {money(c.totalOverdue)} overdue
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monthly billed bar chart */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-black text-white">Monthly Billing</h2>
                <p className="text-xs text-white/40 mt-0.5">Billed · outstanding · collected per month</p>
              </div>
            </div>
            {loading ? (
              <div className="h-[280px] animate-pulse rounded-2xl bg-white/5" />
            ) : trend.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-white/20 text-sm">No revenue data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trend} margin={{ top: 5, right: 0, bottom: 0, left: 0 }} barGap={2}>
                  <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="billed"    fill="#38bdf8" radius={[4,4,0,0]} opacity={0.7} />
                  <Bar dataKey="collected" fill="#34d399" radius={[4,4,0,0]} />
                  <Bar dataKey="outstanding" fill="#f59e0b" radius={[4,4,0,0]} opacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="flex items-center gap-4 mt-3 text-[10px] font-bold uppercase tracking-wider text-white/30">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" />Billed</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Collected</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Outstanding</span>
            </div>
          </div>
        </div>

        {/* ── Quick Links ── */}
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Finance Modules</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {quickLinks.map(({ label, desc, to, icon: Icon, color }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                className="group rounded-[20px] border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <Icon className={`h-5 w-5 mb-2 ${color} transition-transform group-hover:scale-110`} />
                <div className="font-black text-white text-sm">{label}</div>
                <div className="text-[11px] text-white/35 mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
