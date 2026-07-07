import { useEffect, useState, useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Truck,
  Package,
  DollarSign,
  Clock,
  AlertTriangle,
  Star,
  RefreshCw,
  Sparkles,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Zap,
  Shield,
  Activity,
  Globe,
  Award,
  ChevronRight,
  Calendar,
  Flame,
  CheckCircle2,
} from "lucide-react";
import {
  getLogisticsAnalytics,
  getLogisticsTrends,
  refreshLogisticsAnalytics,
  type LogisticsSnapshot,
  type TrendPoint,
} from "../api/logisticsAnalyticsApi";


// ─── Utility: compute operational health score (0-100) ──────────────────────
function computeHealthScore(s: LogisticsSnapshot): number {
  const onTimeWeight = 0.35;
  const failWeight = 0.25;
  const slaWeight = 0.20;
  const ratingWeight = 0.20;

  const onTimeScore = Math.min(s.onTimePercentage, 100);
  const failScore = s.totalDeliveries > 0
    ? Math.max(0, 100 - (s.failedDeliveries / s.totalDeliveries) * 100 * 5)
    : 100;
  const slaScore = s.totalDeliveries > 0
    ? Math.max(0, 100 - (s.slaBreaches / s.totalDeliveries) * 100 * 3)
    : 100;
  const ratingScore = s.customerRatingAvg ? (s.customerRatingAvg / 5) * 100 : 70;

  return Math.round(
    onTimeScore * onTimeWeight +
    failScore * failWeight +
    slaScore * slaWeight +
    ratingScore * ratingWeight
  );
}

function getHealthGrade(score: number): { grade: string; color: string; label: string } {
  if (score >= 90) return { grade: "A+", color: "text-emerald-400", label: "Exceptional" };
  if (score >= 80) return { grade: "A", color: "text-emerald-400", label: "Excellent" };
  if (score >= 70) return { grade: "B", color: "text-sky-400", label: "Good" };
  if (score >= 60) return { grade: "C", color: "text-amber-400", label: "Needs Improvement" };
  return { grade: "D", color: "text-red-400", label: "Critical" };
}


// ─── Components ─────────────────────────────────────────────────────────────

function HealthRing({ score, size = 120 }: { score: number; size?: number }) {
  const { grade, color, label } = getHealthGrade(score);
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={score >= 80 ? "#34d399" : score >= 60 ? "#38bdf8" : "#f59e0b"}
            strokeWidth={8}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-black ${color}`}>{grade}</span>
          <span className="text-[10px] font-bold text-white/40">{score}/100</span>
        </div>
      </div>
      <span className={`text-xs font-black uppercase tracking-wider ${color}`}>{label}</span>
    </div>
  );
}


function KpiCard({
  label, value, suffix, icon: Icon, color, trend, subtitle,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  trend?: "up" | "down" | null;
  subtitle?: string;
}) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]">
      <div className="flex items-center justify-between">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-black ${
            trend === "up" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
          }`}>
            {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {trend === "up" ? "Up" : "Down"}
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-black text-white">
          {value}
          {suffix && <span className="ml-1 text-sm font-bold text-white/50">{suffix}</span>}
        </div>
        <div className="mt-0.5 text-xs font-bold text-white/40">{label}</div>
        {subtitle && <div className="mt-0.5 text-[10px] text-white/25">{subtitle}</div>}
      </div>
    </div>
  );
}


function MiniSparkline({ data, color = "sky" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100;
  const h = 32;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");

  const gradientId = `spark-${color}-${Math.random().toString(36).slice(2)}`;
  const fillPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color === "emerald" ? "#34d399" : "#38bdf8"} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color === "emerald" ? "#34d399" : "#38bdf8"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color === "emerald" ? "#34d399" : "#38bdf8"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


function TrendChart({ data }: { data: TrendPoint[] }) {
  const maxDeliveries = Math.max(...data.map((d) => d.totalDeliveries), 1);
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="space-y-4">
      {/* Delivery volume bars */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/30">Delivery Volume</span>
          <span className="text-[10px] font-bold text-white/20">Last 6 months</span>
        </div>
        <div className="flex items-end gap-2 h-24">
          {data.map((d, i) => {
            const height = Math.max((d.totalDeliveries / maxDeliveries) * 100, 4);
            const isLast = i === data.length - 1;
            return (
              <div key={d.period} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[9px] font-bold text-white/30">{d.totalDeliveries}</span>
                <div
                  className={`w-full rounded-t-lg transition-all ${
                    isLast
                      ? "bg-gradient-to-t from-sky-500 to-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.3)]"
                      : "bg-gradient-to-t from-sky-500/40 to-sky-400/20"
                  }`}
                  style={{ height: `${height}%` }}
                />
                <span className="text-[9px] font-bold text-white/25">
                  {d.period.split("-")[1]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Revenue trend line */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/30">Revenue Trend (ZAR)</span>
          <span className="text-xs font-bold text-emerald-400">
            R{data[data.length - 1]?.revenue?.toLocaleString() ?? 0}
          </span>
        </div>
        <MiniSparkline data={data.map(d => d.revenue)} color="emerald" />
      </div>
    </div>
  );
}


function PerformanceGauges({ s }: { s: LogisticsSnapshot }) {
  const gauges = [
    { label: "On-Time Rate", value: s.onTimePercentage, target: 95, unit: "%" },
    { label: "Customer Rating", value: (s.customerRatingAvg ?? 0) * 20, target: 90, unit: "/5" },
    { label: "Success Rate", value: s.totalDeliveries > 0 ? ((s.totalDeliveries - s.failedDeliveries) / s.totalDeliveries) * 100 : 100, target: 98, unit: "%" },
  ];

  return (
    <div className="space-y-3">
      {gauges.map((g) => {
        const pct = Math.min(g.value, 100);
        const atTarget = pct >= g.target;
        return (
          <div key={g.label}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-bold text-white/50">{g.label}</span>
              <span className={`text-xs font-black ${atTarget ? "text-emerald-400" : "text-amber-400"}`}>
                {g.unit === "/5" ? `${(s.customerRatingAvg ?? 0).toFixed(1)}/5` : `${Math.round(pct)}%`}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                  atTarget ? "bg-emerald-400" : pct >= 60 ? "bg-sky-400" : "bg-amber-400"
                }`}
                style={{ width: `${pct}%` }}
              />
              {/* Target marker */}
              <div
                className="absolute inset-y-0 w-0.5 bg-white/30"
                style={{ left: `${g.target}%` }}
                title={`Target: ${g.target}%`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}


function AiInsightsPanel({ s }: { s: LogisticsSnapshot }) {
  if (!s.aiInsights) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/20">
          <Sparkles className="h-7 w-7 text-violet-400/50" />
        </div>
        <p className="mt-4 text-sm font-bold text-white/40">AI Insights Unavailable</p>
        <p className="mt-1 max-w-xs text-[11px] text-white/25">
          Set <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-[10px]">GROQ_API_KEY</code> to
          enable AI-powered logistics intelligence. Raw metrics are computed from your live data.
        </p>
      </div>
    );
  }

  const ai = s.aiInsights;
  return (
    <div className="space-y-5">
      {/* Executive Summary */}
      <div className="rounded-xl border border-violet-500/10 bg-violet-500/[0.03] p-4">
        <p className="text-sm leading-relaxed text-white/80">{ai.summary}</p>
      </div>

      {/* Trends */}
      {ai.trends?.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-sky-300/70">
            <TrendingUp className="h-3.5 w-3.5" /> Key Trends
          </h3>
          <div className="space-y-2">
            {ai.trends.map((t: string, i: number) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-400">
                  <span className="text-[10px] font-black">{i + 1}</span>
                </div>
                <p className="text-xs leading-relaxed text-white/60">{t}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {ai.recommendations?.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-emerald-300/70">
            <Zap className="h-3.5 w-3.5" /> AI Recommendations
          </h3>
          <div className="space-y-2">
            {ai.recommendations.map((r: string, i: number) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.02] p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/60" />
                <p className="text-xs leading-relaxed text-white/60">{r}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Main Page Component ────────────────────────────────────────────────────

export default function LogisticsAnalytics() {
  const [snapshot, setSnapshot] = useState<LogisticsSnapshot | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "performance" | "ai">("overview");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getLogisticsAnalytics(), getLogisticsTrends()])
      .then(([snap, trendData]) => {
        if (alive) { setSnapshot(snap); setTrends(trendData); }
      })
      .catch((err) => { if (alive) setError(err?.message || "Failed to load analytics"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [snap, trendData] = await Promise.all([
        refreshLogisticsAnalytics(),
        getLogisticsTrends(),
      ]);
      setSnapshot(snap);
      setTrends(trendData);
    } catch (err: any) {
      setError(err?.message || "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const healthScore = useMemo(() => snapshot ? computeHealthScore(snapshot) : 0, [snapshot]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-sky-500/20" />
          <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin text-sky-400" />
        </div>
        <p className="text-xs font-bold text-white/30">Computing logistics intelligence...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-400/60" />
          <p className="mt-4 text-sm font-bold text-white/50">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-3 text-xs font-bold text-sky-400 underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const s = snapshot!;

  return (
    <div className="space-y-6 p-6 lg:p-8">


      {/* ── Hero Header ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/[0.08] via-violet-500/[0.04] to-transparent p-6 lg:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-sky-500/5 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-violet-500/5 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-sky-300">
              <Sparkles className="h-3 w-3" /> Enterprise Analytics
            </div>
            <h1 className="text-3xl font-black text-white lg:text-4xl">
              Logistics Intelligence
            </h1>
            <p className="mt-2 max-w-lg text-sm text-white/50">
              AI-powered operational insights for period{" "}
              <span className="font-bold text-white/70">{s.period}</span>.
              Real-time KPIs computed from your live delivery data with Groq AI narrative analysis.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-2.5 text-xs font-black text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Recalculating..." : "Refresh & Regenerate AI"}
              </button>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/25">
                <Calendar className="h-3 w-3" />
                Last updated: {new Date(s.updatedAt).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Health Score Ring */}
          <div className="flex-shrink-0">
            <HealthRing score={healthScore} size={140} />
            <p className="mt-1 text-center text-[10px] font-bold text-white/25">Operational Health</p>
          </div>
        </div>
      </div>


      {/* ── Tab Navigation ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.02] p-1">
        {([
          { id: "overview" as const, label: "Overview", icon: BarChart3 },
          { id: "performance" as const, label: "Performance", icon: Target },
          { id: "ai" as const, label: "AI Insights", icon: Sparkles },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
              activeTab === tab.id
                ? "bg-white/10 text-white shadow-sm"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>


      {/* ── Overview Tab ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <KpiCard
              label="Total Deliveries"
              value={s.totalDeliveries.toLocaleString()}
              icon={Package}
              color="bg-sky-500/20 text-sky-300"
              subtitle={`${s.deliveredOnTime} on time`}
            />
            <KpiCard
              label="On-Time Rate"
              value={`${s.onTimePercentage}%`}
              icon={Clock}
              color="bg-emerald-500/20 text-emerald-300"
              trend={s.onTimePercentage >= 85 ? "up" : "down"}
              subtitle="Target: 95%"
            />
            <KpiCard
              label="Failed Deliveries"
              value={s.failedDeliveries}
              icon={AlertTriangle}
              color="bg-red-500/20 text-red-300"
              trend={s.failedDeliveries === 0 ? "up" : "down"}
              subtitle={s.totalDeliveries > 0 ? `${((s.failedDeliveries/s.totalDeliveries)*100).toFixed(1)}% fail rate` : ""}
            />
            <KpiCard
              label="SLA Breaches"
              value={s.slaBreaches}
              icon={Shield}
              color="bg-amber-500/20 text-amber-300"
              trend={s.slaBreaches === 0 ? "up" : "down"}
            />
            <KpiCard
              label="Revenue"
              value={`R${s.revenue.toLocaleString()}`}
              icon={DollarSign}
              color="bg-violet-500/20 text-violet-300"
              trend="up"
              subtitle={s.costPerDelivery ? `R${s.costPerDelivery}/delivery` : ""}
            />
            <KpiCard
              label="Collections"
              value={s.totalCollections}
              icon={Truck}
              color="bg-cyan-500/20 text-cyan-300"
            />
            <KpiCard
              label="COD Collected"
              value={`R${s.codCollected.toLocaleString()}`}
              icon={DollarSign}
              color="bg-emerald-500/20 text-emerald-300"
            />
            <KpiCard
              label="Active Drivers"
              value={s.activeDrivers}
              icon={Truck}
              color="bg-blue-500/20 text-blue-300"
              subtitle={s.avgDriverUtilPct ? `${s.avgDriverUtilPct}% utilisation` : ""}
            />
            <KpiCard
              label="Customer Rating"
              value={s.customerRatingAvg?.toFixed(1) ?? "N/A"}
              suffix={s.customerRatingAvg ? "/ 5" : ""}
              icon={Star}
              color="bg-yellow-500/20 text-yellow-300"
              trend={s.customerRatingAvg && s.customerRatingAvg >= 4 ? "up" : null}
            />
            <KpiCard
              label="Returned Parcels"
              value={s.returnedParcels}
              icon={Package}
              color="bg-orange-500/20 text-orange-300"
              subtitle={s.totalDeliveries > 0 ? `${((s.returnedParcels/s.totalDeliveries)*100).toFixed(1)}% return rate` : ""}
            />
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-sky-300" />
                <h2 className="text-sm font-black text-white">6-Month Trend Analysis</h2>
              </div>
              {trends.length > 0 ? (
                <TrendChart data={trends} />
              ) : (
                <p className="py-8 text-center text-xs text-white/30">Insufficient data for trends.</p>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-4 flex items-center gap-2">
                <Target className="h-5 w-5 text-emerald-300" />
                <h2 className="text-sm font-black text-white">Performance vs Targets</h2>
              </div>
              <PerformanceGauges s={s} />

              {/* Quick stats */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
                  <Flame className="mx-auto h-5 w-5 text-amber-400/60" />
                  <div className="mt-1 text-lg font-black text-white">{s.totalDeliveries - s.failedDeliveries}</div>
                  <div className="text-[10px] font-bold text-white/30">Successful</div>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
                  <Activity className="mx-auto h-5 w-5 text-sky-400/60" />
                  <div className="mt-1 text-lg font-black text-white">{healthScore}</div>
                  <div className="text-[10px] font-bold text-white/30">Health Score</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}


      {/* ── Performance Tab ──────────────────────────────────────────────────── */}
      {activeTab === "performance" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Delivery Funnel */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 lg:col-span-2">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-black text-white">
              <Activity className="h-5 w-5 text-sky-300" /> Delivery Funnel
            </h2>
            <div className="space-y-3">
              {[
                { label: "Total Created", value: s.totalDeliveries, pct: 100, color: "bg-sky-400" },
                { label: "Delivered On-Time", value: s.deliveredOnTime, pct: s.totalDeliveries > 0 ? (s.deliveredOnTime / s.totalDeliveries) * 100 : 0, color: "bg-emerald-400" },
                { label: "Delivered Late", value: Math.max(0, s.totalDeliveries - s.deliveredOnTime - s.failedDeliveries - s.returnedParcels), pct: s.totalDeliveries > 0 ? (Math.max(0, s.totalDeliveries - s.deliveredOnTime - s.failedDeliveries - s.returnedParcels) / s.totalDeliveries) * 100 : 0, color: "bg-amber-400" },
                { label: "Failed", value: s.failedDeliveries, pct: s.totalDeliveries > 0 ? (s.failedDeliveries / s.totalDeliveries) * 100 : 0, color: "bg-red-400" },
                { label: "Returned", value: s.returnedParcels, pct: s.totalDeliveries > 0 ? (s.returnedParcels / s.totalDeliveries) * 100 : 0, color: "bg-orange-400" },
              ].map((step) => (
                <div key={step.label} className="flex items-center gap-4">
                  <span className="w-32 text-xs font-bold text-white/50">{step.label}</span>
                  <div className="flex-1">
                    <div className="relative h-6 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${step.color} transition-all duration-700`}
                        style={{ width: `${Math.max(step.pct, 1)}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-16 text-right text-xs font-black text-white/70">{step.value}</span>
                  <span className="w-12 text-right text-[10px] font-bold text-white/30">{step.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Period Comparison */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-black text-white">
              <Globe className="h-5 w-5 text-violet-300" /> Period Benchmarks
            </h2>
            <div className="space-y-4">
              {trends.length >= 2 && (() => {
                const curr = trends[trends.length - 1];
                const prev = trends[trends.length - 2];
                const delChange = prev.totalDeliveries > 0 ? ((curr.totalDeliveries - prev.totalDeliveries) / prev.totalDeliveries * 100) : 0;
                const revChange = prev.revenue > 0 ? ((curr.revenue - prev.revenue) / prev.revenue * 100) : 0;

                return (
                  <>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-white/40">Deliveries vs Last Month</span>
                        <span className={`text-xs font-black ${delChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {delChange >= 0 ? "+" : ""}{delChange.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-white/40">Revenue vs Last Month</span>
                        <span className={`text-xs font-black ${revChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {revChange >= 0 ? "+" : ""}{revChange.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white/40">On-Time Sparkline</span>
                </div>
                <div className="mt-2">
                  <MiniSparkline data={trends.map(t => t.onTimePercentage)} color="emerald" />
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white/40">SLA Breach Sparkline</span>
                </div>
                <div className="mt-2">
                  <MiniSparkline data={trends.map(t => t.slaBreaches)} color="sky" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ── AI Insights Tab ──────────────────────────────────────────────────── */}
      {activeTab === "ai" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-300" />
                <h2 className="text-sm font-black text-white">AI-Powered Analysis</h2>
              </div>
              {s.aiGeneratedAt && (
                <span className="text-[10px] font-bold text-white/20">
                  Generated {new Date(s.aiGeneratedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <AiInsightsPanel s={s} />
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-white/40">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition hover:border-sky-400/20 hover:bg-sky-400/[0.04] disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 text-sky-400 ${refreshing ? "animate-spin" : ""}`} />
                  <div>
                    <div className="text-xs font-bold text-white/70">Regenerate Insights</div>
                    <div className="text-[10px] text-white/30">Recompute metrics + fresh AI analysis</div>
                  </div>
                </button>
                <a
                  href="/ask"
                  className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition hover:border-violet-400/20 hover:bg-violet-400/[0.04]"
                >
                  <Sparkles className="h-4 w-4 text-violet-400" />
                  <div>
                    <div className="text-xs font-bold text-white/70">Ask FlowOps</div>
                    <div className="text-[10px] text-white/30">Deep-dive with AI copilot</div>
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 text-white/20" />
                </a>
              </div>
            </div>

            {/* Data Freshness */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-white/40">Data Sources</h3>
              <div className="space-y-2">
                {[
                  { label: "Waybills", status: "Live" },
                  { label: "Invoices", status: "Live" },
                  { label: "Collections", status: "Live" },
                  { label: "Driver Fleet", status: "Live" },
                  { label: "Groq AI", status: s.aiInsights ? "Active" : "Inactive" },
                ].map((src) => (
                  <div key={src.label} className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white/40">{src.label}</span>
                    <span className={`flex items-center gap-1 text-[10px] font-black ${
                      src.status === "Live" || src.status === "Active" ? "text-emerald-400" : "text-white/25"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        src.status === "Live" || src.status === "Active" ? "bg-emerald-400" : "bg-white/20"
                      }`} />
                      {src.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
