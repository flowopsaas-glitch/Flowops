import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CheckCircle,
  Gauge,
  PackageCheck,
  Plus,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { api } from "../../api/client";
import { startImpersonation } from "../../lib/impersonation";

// ── Types matching GET /owner/analytics ──────────────────────────────────
type Analytics = {
  generatedAt: string;
  currency: string;
  revenue: {
    mrr: number;
    arr: number;
    arpa: number;
    mrrDelta: number;
    collectedTotal: number;
    collected30: number;
    collectedDelta: number;
  };
  tenants: {
    total: number;
    active: number;
    paying: number;
    newThisPeriod: number;
    newDelta: number;
    churnedThisPeriod: number;
    churnRate: number;
  };
  planDistribution: Array<{ plan: string; count: number; mrr: number }>;
  growth: Array<{ month: string; newTenants: number; cumulative: number }>;
  operations: {
    totalWaybills: number;
    deliveries30: number;
    deliverySuccess: number;
    exceptionRate: number;
    onTimeRate: number | null;
    onTimeObservations?: number;
  };
  health: Array<{
    id: string;
    name: string;
    plan: string;
    users: number;
    waybillsTotal: number;
    waybills30: number;
    score: number;
    risk: "healthy" | "watch" | "at_risk";
  }>;
  topByVolume: Analytics["health"];
};

type PlatformAlert = {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  tenantName?: string | null;
  createdAt: string;
  resolved?: boolean;
};

type MrrMovement = {
  currency: string;
  series: Array<{ date: string; mrr: number }>;
  movement: {
    newBusiness: number;
    expansion: number;
    contraction: number;
    churn: number;
    net: number;
    current: number;
    previous: number;
    hasComparison: boolean;
  };
  snapshotCount: number;
};

type ApprovalRequest = {
  id: string;
  fullName: string;
  email: string;
  company: string;
  phone?: string | null;
  status: string;
  createdAt: string;
};

// ── Formatting helpers ────────────────────────────────────────────────────
function money(value: number | null | undefined, currency = "ZAR") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const compact = Math.abs(n) >= 1_000_000;
  return `${currency} ${n.toLocaleString("en-ZA", {
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  })}`;
}
function pctText(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return "0%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}
function num(n: number | undefined, digits = 0) {
  if (n == null || !Number.isFinite(n)) return "0";
  return Number(n).toLocaleString("en-ZA", { maximumFractionDigits: digits });
}

const PLAN_COLORS: Record<string, string> = {
  starter: "#64748b",
  professional: "#3b82f6",
  enterprise: "#a855f7",
};

// ── KPI card with direction-aware delta ────────────────────────────────────
function Kpi(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  goodWhenUp?: boolean;
}) {
  const { delta, goodWhenUp = true } = props;
  const hasDelta = delta != null && Number.isFinite(delta) && delta !== 0;
  const up = (delta ?? 0) >= 0;
  const good = hasDelta ? (goodWhenUp ? up : !up) : true;
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/50">
          {props.label}
        </div>
        <div className="text-white/40">{props.icon}</div>
      </div>
      <div className="mt-3 text-3xl font-black text-white">{props.value}</div>
      <div className="mt-2 flex items-center gap-2">
        {hasDelta ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
              good
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300"
            }`}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {pctText(delta)}
          </span>
        ) : null}
        {props.sub ? <span className="text-sm text-slate-400">{props.sub}</span> : null}
      </div>
    </div>
  );
}

function Section(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
      <div className="text-xl font-black tracking-tight text-white">{props.title}</div>
      {props.subtitle ? <div className="mt-1 text-sm text-slate-400">{props.subtitle}</div> : null}
      <div className="mt-5">{props.children}</div>
    </div>
  );
}

function riskBadge(risk: string) {
  const map: Record<string, string> = {
    healthy: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
    watch: "border-amber-400/20 bg-amber-500/10 text-amber-200",
    at_risk: "border-rose-400/20 bg-rose-500/10 text-rose-200",
  };
  const label = risk === "at_risk" ? "At risk" : risk === "watch" ? "Watch" : "Healthy";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${map[risk] ?? map.watch}`}>
      {label}
    </span>
  );
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [a, setA] = useState<Analytics | null>(null);
  const [alerts, setAlerts] = useState<PlatformAlert[]>([]);
  const [mrr, setMrr] = useState<MrrMovement | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [runningChecks, setRunningChecks] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res: any = await api.get("/owner/analytics");
      setA((res?.data ?? res) as Analytics);

      try {
        const alertsRes: any = await api.get("/owner/alerts");
        const items = alertsRes?.data ?? alertsRes;
        setAlerts(Array.isArray(items) ? items.slice(0, 8) : []);
      } catch { setAlerts([]); }

      try {
        const mrrRes: any = await api.get("/owner/mrr-movement");
        setMrr((mrrRes?.data ?? mrrRes) as MrrMovement);
      } catch { setMrr(null); }

      try {
        const apRes: any = await api.get("/owner/approval-requests");
        const items = apRes?.data ?? apRes;
        const arr = Array.isArray(items) ? items : Array.isArray(items?.data) ? items.data : [];
        setApprovals(arr.filter((r: ApprovalRequest) => r.status === "PENDING"));
      } catch { setApprovals([]); }
    } catch (err: any) {
      setError(err?.message || "Failed to load platform analytics.");
    } finally {
      setLoading(false);
    }
  }

  async function runChecks() {
    setRunningChecks(true);
    try {
      await api.post("/owner/alerts/run", {});
      const alertsRes: any = await api.get("/owner/alerts");
      const items = alertsRes?.data ?? alertsRes;
      setAlerts(Array.isArray(items) ? items.slice(0, 8) : []);
    } catch (err: any) {
      setError(err?.message || "Failed to run alert checks.");
    } finally {
      setRunningChecks(false);
    }
  }

  async function resolveAlert(id: string) {
    setAlerts((prev) => prev.filter((x) => x.id !== id));
    try {
      await api.post(`/owner/alerts/${id}/resolve`, {});
    } catch {
      // re-sync on failure
      void load();
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function viewAsTenant(tenantId: string, tenantName: string) {
    try {
      const res: any = await api.post(`/owner/impersonate/${tenantId}`, {});
      const payload = res?.data ?? res;
      const token = payload?.access_token;
      if (!token) throw new Error("No impersonation token returned");
      startImpersonation(token, tenantName);
      // Full navigation so the whole app re-initialises as the tenant.
      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err?.message || "Could not start impersonation for this tenant.");
    }
  }

  const cur = a?.currency || "ZAR";
  const planData = useMemo(
    () => (a?.planDistribution ?? []).filter((p) => p.count > 0),
    [a],
  );

  // Net Revenue Retention — computed from MRR movement snapshot diff.
  // NRR = (beginning MRR + expansion - contraction - churn) / beginning MRR * 100
  const nrr = useMemo(() => {
    if (!mrr?.movement.hasComparison || !mrr.movement.previous) return null;
    const { previous, expansion, contraction, churn } = mrr.movement;
    return Math.round(((previous + expansion - contraction - churn) / previous) * 100);
  }, [mrr]);

  async function approveRequest(id: string, company: string) {
    try {
      await api.post(`/owner/approval-requests/${id}/approve`, {});
      setApprovals((prev) => prev.filter((r) => r.id !== id));
      setError("");
    } catch (err: any) { setError(err?.message || "Failed to approve."); }
  }

  async function rejectRequest(id: string, company: string) {
    try {
      await api.post(`/owner/approval-requests/${id}/reject`, { reason: "Rejected by owner" });
      setApprovals((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) { setError(err?.message || "Failed to reject."); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
          Platform Intelligence
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">
              FlowOps Super Owner Console
            </h1>
            <p className="mt-2 max-w-3xl text-slate-300">
              Real-time SaaS &amp; operational intelligence across every tenant — revenue,
              growth, churn risk, and cross-platform delivery performance.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={load}
              className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200"
            >
              Refresh
            </button>
            <button
              onClick={() => navigate("/owner/tenants")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white"
            >
              Tenant Manager
            </button>
            <button
              onClick={() => navigate("/owner/access")}
              className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-2.5 text-sm font-bold text-amber-200"
            >
              Access &amp; Passwords
            </button>
          </div>
        </div>
        {a?.generatedAt ? (
          <div className="mt-3 text-xs text-white/40">
            Updated {new Date(a.generatedAt).toLocaleString("en-ZA")}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </div>

      {loading && !a ? (
        <div className="grid place-items-center rounded-[28px] border border-white/10 bg-white/[0.04] py-16 text-white/60">
          Loading platform analytics…
        </div>
      ) : null}

      {/* ── Quick Actions ── */}
      <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-6 py-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/40">
            <Zap className="h-3.5 w-3.5" /> Quick Actions
          </div>
          <button onClick={() => navigate("/owner/tenants")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20">
            <Plus className="h-3.5 w-3.5" /> Create Tenant
          </button>
          <button onClick={() => navigate("/owner/tenants")}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${approvals.length > 0 ? "border-amber-400/20 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20" : "border-white/10 bg-white/5 text-white/60"}`}>
            <CheckCircle className="h-3.5 w-3.5" />
            {approvals.length > 0 ? `${approvals.length} Pending Approval${approvals.length > 1 ? "s" : ""}` : "Approval Requests"}
          </button>
          <button onClick={runChecks} disabled={runningChecks}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 disabled:opacity-60">
            <AlertTriangle className="h-3.5 w-3.5" /> {runningChecks ? "Running…" : "Run Alert Checks"}
          </button>
          <button onClick={async () => {
              try { await api.post("/owner/trials/check", {}); void load(); }
              catch { /* ignore */ }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-300 hover:bg-violet-500/20">
            <Zap className="h-3.5 w-3.5" /> Run Trial &amp; Subscription Check
          </button>
          <button onClick={async () => { try { await api.post("/owner/mrr-snapshot", {}); void load(); } catch { alert("MRR snapshot failed"); } }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10">
            <TrendingUp className="h-3.5 w-3.5" /> Capture MRR
          </button>
          <button onClick={() => navigate("/owner/ops")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10">
            <Activity className="h-3.5 w-3.5" /> Live Ops Map
          </button>
          <button onClick={() => navigate("/owner/audit")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10">
            <Gauge className="h-3.5 w-3.5" /> Audit Trail
          </button>
        </div>
      </div>

      {/* ── Pending Approvals ── */}
      {approvals.length > 0 ? (
        <div className="rounded-[28px] border border-amber-400/20 bg-amber-500/5 p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-lg font-black text-amber-200">⏳ {approvals.length} Pending Approval Request{approvals.length > 1 ? "s" : ""}</div>
              <div className="text-sm text-slate-400 mt-0.5">Review and onboard new companies requesting platform access.</div>
            </div>
            <button onClick={() => navigate("/owner/tenants")}
              className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200">
              Manage all →
            </button>
          </div>
          <div className="space-y-3">
            {approvals.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div>
                  <div className="font-bold text-white">{r.company}</div>
                  <div className="text-sm text-slate-400">{r.fullName} · {r.email}</div>
                  <div className="text-xs text-white/40">{new Date(r.createdAt).toLocaleString("en-ZA")}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveRequest(r.id, r.company)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20">
                    <CheckCircle className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button onClick={() => rejectRequest(r.id, r.company)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/20">
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {a ? (
        <>
          {/* Revenue KPIs */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={<Banknote className="h-5 w-5" />} label="MRR" value={money(a.revenue.mrr, cur)} delta={a.revenue.mrrDelta} sub="vs 30d ago" />
            <Kpi icon={<TrendingUp className="h-5 w-5" />} label="ARR" value={money(a.revenue.arr, cur)} sub="annual run-rate" />
            <Kpi icon={<Gauge className="h-5 w-5" />} label="ARPA" value={money(a.revenue.arpa, cur)} sub={`${num(a.tenants.paying)} paying tenants`} />
            <Kpi icon={<Banknote className="h-5 w-5" />} label="Collected (30d)" value={money(a.revenue.collected30, cur)} delta={a.revenue.collectedDelta} sub="vs prior 30d" />
          </div>

          {/* Tenant + ops KPIs — now includes NRR */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={<Building2 className="h-5 w-5" />} label="Active Tenants" value={num(a.tenants.active)} sub={`${num(a.tenants.total)} total`} />
            <Kpi icon={<Users className="h-5 w-5" />} label="New Tenants (30d)" value={num(a.tenants.newThisPeriod)} delta={a.tenants.newDelta} sub="vs prior 30d" />
            <Kpi icon={<AlertTriangle className="h-5 w-5" />} label="Churn Rate" value={`${num(a.tenants.churnRate, 1)}%`} goodWhenUp={false} sub={`${num(a.tenants.churnedThisPeriod)} suspended`} />
            {nrr !== null ? (
              <Kpi icon={<TrendingUp className="h-5 w-5" />} label="NRR" value={`${nrr}%`}
                goodWhenUp sub="Net Revenue Retention" />
            ) : (
              <Kpi icon={<PackageCheck className="h-5 w-5" />} label="On-Time Delivery (by est. delivery)" value={a.operations.onTimeRate == null ? "Unavailable" : `${num(a.operations.onTimeRate, 1)}%`} sub={a.operations.onTimeRate == null ? "No delivered shipments with an estimated delivery" : `platform-wide · ${a.operations.onTimeObservations ?? 0} shipments with estimates`} />
            )}
          </div>

          {/* Charts */}
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Section title="Tenant Growth" subtitle="New + cumulative tenants over the last 6 months">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={a.growth ?? []}>
                    <defs>
                      <linearGradient id="cum" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" stroke="rgba(255,255,255,0.4)" fontSize={12} />
                    <YAxis stroke="rgba(255,255,255,0.4)" fontSize={12} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#0b1628", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }}
                    />
                    <Area type="monotone" dataKey="cumulative" name="Total tenants" stroke="#3b82f6" fill="url(#cum)" strokeWidth={2} />
                    <Area type="monotone" dataKey="newTenants" name="New" stroke="#22d3ee" fillOpacity={0} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Plan Mix" subtitle="Active tenants & MRR by plan">
              {planData.length ? (
                <div className="space-y-5">
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={planData} layout="vertical" margin={{ left: 16 }}>
                        <XAxis type="number" hide allowDecimals={false} />
                        <YAxis type="category" dataKey="plan" stroke="rgba(255,255,255,0.5)" fontSize={12} width={90}
                          tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)} />
                        <Tooltip
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                          contentStyle={{ background: "#0b1628", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }}
                        />
                        <Bar dataKey="count" name="Tenants" radius={[0, 6, 6, 0]}>
                          {planData.map((p) => (
                            <Cell key={p.plan} fill={PLAN_COLORS[p.plan.toLowerCase()] ?? "#3b82f6"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {planData.map((p) => (
                      <div key={p.plan} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">{p.plan}</div>
                        <div className="mt-1 text-2xl font-black text-white">{p.count}</div>
                        <div className="mt-1 text-xs text-slate-400">{money(p.mrr, cur)}/mo</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-slate-400">
                  No active paid tenants yet.
                </div>
              )}
            </Section>
          </div>

          {/* MRR movement */}
          {mrr ? (
            <Section
              title="MRR Movement"
              subtitle={
                mrr.movement.hasComparison
                  ? "Real new / expansion / contraction / churn from daily snapshots"
                  : "Trend builds daily — capture more snapshots to see movement breakdown"
              }
            >
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mrr.series ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={11} />
                      <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} />
                      <Tooltip
                        contentStyle={{ background: "#0b1628", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }}
                        formatter={(v: any) => money(Number(v), mrr.currency)}
                      />
                      <Line type="monotone" dataKey="mrr" name="MRR" stroke="#22d3ee" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-3 self-center">
                  {[
                    { label: "New business", val: mrr.movement.newBusiness, tone: "text-emerald-300" },
                    { label: "Expansion", val: mrr.movement.expansion, tone: "text-emerald-300" },
                    { label: "Contraction", val: -mrr.movement.contraction, tone: "text-rose-300" },
                    { label: "Churn", val: -mrr.movement.churn, tone: "text-rose-300" },
                  ].map((m) => (
                    <div key={m.label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">{m.label}</div>
                      <div className={`mt-1 text-xl font-black ${m.tone}`}>
                        {m.val >= 0 ? "+" : "−"}{money(Math.abs(m.val), mrr.currency)}
                      </div>
                    </div>
                  ))}
                  <div className="col-span-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/70">Net MRR change</div>
                    <div className="mt-1 text-2xl font-black text-white">
                      {mrr.movement.net >= 0 ? "+" : "−"}{money(Math.abs(mrr.movement.net), mrr.currency)}
                    </div>
                  </div>
                </div>
              </div>
            </Section>
          ) : null}

          {/* Ops strip */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={<PackageCheck className="h-5 w-5" />} label="Total Waybills" value={num(a.operations.totalWaybills)} sub={`${num(a.operations.deliveries30)} in last 30d`} />
            <Kpi icon={<Activity className="h-5 w-5" />} label="Delivery Success" value={`${num(a.operations.deliverySuccess, 1)}%`} sub="platform-wide" />
            <Kpi icon={<AlertTriangle className="h-5 w-5" />} label="Exception Rate" value={`${num(a.operations.exceptionRate, 1)}%`} goodWhenUp={false} sub="failed + returned" />
            <Kpi icon={<Banknote className="h-5 w-5" />} label="Collected (all-time)" value={money(a.revenue.collectedTotal, cur)} sub="successful payments" />
          </div>

          {/* Health + alerts */}
          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Section title="Tenant Health" subtitle="Composite score from activity, volume & plan — highest first">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-white/50">
                      <th className="px-3 py-3">Tenant</th>
                      <th className="px-3 py-3">Plan</th>
                      <th className="px-3 py-3">Users</th>
                      <th className="px-3 py-3">Waybills (30d)</th>
                      <th className="px-3 py-3">Score</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.health.slice(0, 10).map((h) => (
                      <tr
                        key={h.id}
                        className="cursor-pointer border-b border-white/5 hover:bg-white/[0.03]"
                        onClick={() => navigate(`/owner/tenants/${h.id}`)}
                      >
                        <td className="px-3 py-3 font-semibold text-white">{h.name}</td>
                        <td className="px-3 py-3 capitalize text-slate-300">{h.plan}</td>
                        <td className="px-3 py-3 text-slate-300">{h.users}</td>
                        <td className="px-3 py-3 text-slate-300">{h.waybills30}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                              <div
                                className={`h-full ${h.score >= 70 ? "bg-emerald-400" : h.score >= 40 ? "bg-amber-400" : "bg-rose-400"}`}
                                style={{ width: `${h.score}%` }}
                              />
                            </div>
                            <span className="text-white">{h.score}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">{riskBadge(h.risk)}</td>
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void viewAsTenant(h.id, h.name);
                            }}
                            className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/20"
                          >
                            View as
                          </button>
                        </td>
                      </tr>
                    ))}
                    {a.health.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                          No active tenants yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Critical Alerts" subtitle="Churn, SLA spikes & payment failures — auto-detected">
              <div className="mb-4 flex justify-end">
                <button
                  onClick={runChecks}
                  disabled={runningChecks}
                  className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-200 disabled:opacity-60"
                >
                  {runningChecks ? "Running…" : "Run checks now"}
                </button>
              </div>
              <div className="space-y-3">
                {alerts.length ? (
                  alerts.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-white">{item.title}</div>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${
                            item.severity === "critical"
                              ? "border-rose-400/20 bg-rose-500/10 text-rose-200"
                              : "border-amber-400/20 bg-amber-500/10 text-amber-200"
                          }`}
                        >
                          {item.severity || "info"}
                        </span>
                      </div>
                      {item.message ? <div className="mt-1.5 text-sm text-slate-300">{item.message}</div> : null}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-white/40">
                          {item.tenantName ? `${item.tenantName} · ` : ""}
                          {new Date(item.createdAt).toLocaleString("en-ZA")}
                        </span>
                        <button
                          onClick={() => resolveAlert(item.id)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/80 hover:bg-white/10"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-slate-400">
                    No active alerts. All clear across the platform.
                  </div>
                )}
              </div>
            </Section>
          </div>
        </>
      ) : null}
    </div>
  );
}
