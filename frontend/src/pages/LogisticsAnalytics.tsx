import { useEffect, useState } from "react";
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
} from "lucide-react";
import {
  getLogisticsAnalytics,
  getLogisticsTrends,
  refreshLogisticsAnalytics,
  type LogisticsSnapshot,
  type TrendPoint,
} from "../api/logisticsAnalyticsApi";

function KpiCard({
  label,
  value,
  suffix,
  icon: Icon,
  color,
  trend,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  trend?: "up" | "down" | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20">
      <div className="flex items-center justify-between">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-xs font-bold ${trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
            {trend === "up" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-black text-white">
          {value}
          {suffix && <span className="ml-1 text-sm font-bold text-white/50">{suffix}</span>}
        </div>
        <div className="mt-0.5 text-xs font-bold text-white/40">{label}</div>
      </div>
    </div>
  );
}

function TrendBar({ data }: { data: TrendPoint[] }) {
  const max = Math.max(...data.map((d) => d.totalDeliveries), 1);
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d) => {
        const height = Math.max((d.totalDeliveries / max) * 100, 4);
        return (
          <div key={d.period} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-lg bg-gradient-to-t from-sky-500/60 to-sky-400/30 transition-all"
              style={{ height: `${height}%` }}
              title={`${d.totalDeliveries} deliveries`}
            />
            <span className="text-[9px] font-bold text-white/30">
              {d.period.split("-")[1]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function LogisticsAnalytics() {
  const [snapshot, setSnapshot] = useState<LogisticsSnapshot | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getLogisticsAnalytics(), getLogisticsTrends()])
      .then(([snap, trendData]) => {
        if (alive) {
          setSnapshot(snap);
          setTrends(trendData);
        }
      })
      .catch((err) => {
        if (alive) setError(err?.message || "Failed to load analytics");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const snap = await refreshLogisticsAnalytics();
      setSnapshot(snap);
    } catch (err: any) {
      setError(err?.message || "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-400/50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-400/60" />
          <p className="mt-3 text-sm font-bold text-white/50">{error}</p>
        </div>
      </div>
    );
  }

  const s = snapshot!;

  return (
    <div className="space-y-8 p-6 lg:p-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Logistics Analytics</h1>
          <p className="mt-1 text-sm text-white/40">
            AI-powered insights for period <span className="font-bold text-white/60">{s.period}</span>
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-2.5 text-xs font-black text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Recalculating..." : "Refresh Analytics"}
        </button>
      </div>

      {/* ── KPI Grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Total Deliveries" value={s.totalDeliveries} icon={Package} color="bg-sky-500/20 text-sky-300" />
        <KpiCard label="On-Time %" value={`${s.onTimePercentage}%`} icon={Clock} color="bg-emerald-500/20 text-emerald-300" trend={s.onTimePercentage >= 85 ? "up" : "down"} />
        <KpiCard label="Failed Deliveries" value={s.failedDeliveries} icon={AlertTriangle} color="bg-red-500/20 text-red-300" trend={s.failedDeliveries === 0 ? "up" : "down"} />
        <KpiCard label="SLA Breaches" value={s.slaBreaches} icon={TrendingDown} color="bg-amber-500/20 text-amber-300" />
        <KpiCard label="Revenue" value={`R${s.revenue.toLocaleString()}`} icon={DollarSign} color="bg-violet-500/20 text-violet-300" trend="up" />
        <KpiCard label="Collections" value={s.totalCollections} icon={Truck} color="bg-cyan-500/20 text-cyan-300" />
        <KpiCard label="COD Collected" value={`R${s.codCollected.toLocaleString()}`} icon={DollarSign} color="bg-emerald-500/20 text-emerald-300" />
        <KpiCard label="Active Drivers" value={s.activeDrivers} icon={Truck} color="bg-blue-500/20 text-blue-300" />
        <KpiCard label="Customer Rating" value={s.customerRatingAvg ?? "N/A"} suffix={s.customerRatingAvg ? "/ 5" : ""} icon={Star} color="bg-yellow-500/20 text-yellow-300" />
        <KpiCard label="Returned Parcels" value={s.returnedParcels} icon={Package} color="bg-orange-500/20 text-orange-300" />
      </div>

      {/* ── Trends + AI Insights ───────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trend chart */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-sky-300" />
            <h2 className="text-sm font-black text-white">Delivery Volume — Last 6 Months</h2>
          </div>
          {trends.length > 0 ? (
            <TrendBar data={trends} />
          ) : (
            <p className="text-xs text-white/30">No trend data available yet.</p>
          )}
        </div>

        {/* AI Insights */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-300" />
            <h2 className="text-sm font-black text-white">AI-Powered Insights</h2>
            {s.aiGeneratedAt && (
              <span className="ml-auto text-[10px] font-bold text-white/25">
                Generated {new Date(s.aiGeneratedAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {s.aiInsights ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-white/70">{s.aiInsights.summary}</p>

              {s.aiInsights.trends?.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-sky-300/70">Trends</h3>
                  <ul className="space-y-1.5">
                    {s.aiInsights.trends.map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400/50" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {s.aiInsights.recommendations?.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-emerald-300/70">Recommendations</h3>
                  <ul className="space-y-1.5">
                    {s.aiInsights.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/50" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Sparkles className="h-8 w-8 text-white/15" />
              <p className="mt-3 text-xs font-bold text-white/30">
                AI insights unavailable — set GROQ_API_KEY to enable.
              </p>
              <p className="mt-1 text-[10px] text-white/20">
                Raw metrics are still computed from your live data.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
