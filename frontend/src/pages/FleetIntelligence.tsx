import { errorMessageOf } from "@/components/patterns/errorMessage";
import { useCallback, useEffect, useState } from "react";
import {
  Brain, TrendingUp, TrendingDown, Users, MapPin,
  Zap, RefreshCw, Truck, Activity, Target, ArrowRight,
  Gauge, Timer, Flame, Snowflake,
} from "lucide-react";
import { api } from "../api/client";
import { TiltCard } from "../components/premium/TiltCard";

function cn(...c: Array<string | false | null | undefined>) { return c.filter(Boolean).join(" "); }

type ZoneData = {
  zone: string; pickups: number; deliveries: number; total: number;
  growthPct: number | null; trend: string;
};
type DriverStat = {
  id: string; name: string; phone: string | null; vehicleType: string | null;
  delivered7d: number; delivered30d: number; avgPerDay: number;
  successRate: number | null; utilization: number; rating: string;
};
type IdleDriver = {
  id: string; name: string; phone: string | null; vehicleType: string | null;
  lastDeliveryDaysAgo: number; severity: string;
};
type BranchBalance = {
  id: string; name: string; city?: string; load: number; totalWaybills: number; delivered: number;
};
type Recommendation = {
  type: string; priority: string; title: string; description: string; impact: string;
};
type Report = {
  generatedAt: string; networkHealthScore: number;
  zones: { totalZones: number; zones: ZoneData[]; hotZones: ZoneData[]; coldZones: ZoneData[]; concentration: number; insight: string };
  drivers: { totalDrivers: number; avgUtilization: number; highPerformers: number; mediumPerformers: number; lowPerformers: number; drivers: DriverStat[]; insight: string };
  idle: { idleCount: number; totalDrivers: number; idleRatePct: number; estimatedWaste: number; drivers: IdleDriver[]; insight: string };
  forecast: { history: Array<{ month: string; count: number }>; currentLoad: number; currentCapacity: number; capacityUsedPct: number; activeDrivers: number; monthlyGrowthRate: number; monthsUntilCapacity: number | null; forecast: Array<{ month: string; projected: number; capacityPct: number }>; driversNeeded3mo: number; insight: string };
  branches: { branchCount: number; branches: BranchBalance[]; imbalanceScore: number; insight: string };
  repositioning: { count: number; recommendations: Recommendation[]; insight: string };
};


const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  HIGH: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  MEDIUM: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  LOW: "border-white/10 bg-white/5 text-white/50",
};

const TREND_ICONS: Record<string, React.ReactNode> = {
  SURGING: <Flame className="h-3.5 w-3.5 text-rose-400" />,
  GROWING: <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />,
  STABLE: <Activity className="h-3.5 w-3.5 text-sky-400" />,
  DECLINING: <TrendingDown className="h-3.5 w-3.5 text-slate-400" />,
};

function healthColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-rose-400";
}

function utilizationBar(pct: number) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}


export default function FleetIntelligence() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => (async () => {
    const res = await api.get("/fleet-intelligence/dashboard");
    setReport(res?.data ?? res);
    setError("");

  })().catch((e: unknown) => {
    setError(errorMessageOf(e) || "Failed to load fleet intelligence.");

  }).finally(() => {
    setLoading(false);

  }), []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Brain className="h-12 w-12 text-sky-400 animate-pulse mx-auto" />
          <p className="text-sm text-white/50 font-bold">CLAW Fleet Intelligence analyzing network...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 text-rose-200 text-sm">
        {error || "No data available. Create some waybills and add drivers to unlock Fleet Intelligence."}
      </div>
    );
  }

  const r = report;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-7 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-300">
              <Brain className="h-3.5 w-3.5" /> CLAW Fleet Intelligence
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white">
              Network Command Center
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Tactical fleet balancing — zone demand, driver utilization, idle detection, capacity forecasting & repositioning AI.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Network Health</div>
              <div className={cn("text-3xl font-black", healthColor(r.networkHealthScore))}>
                {r.networkHealthScore}%
              </div>
            </div>
            <button onClick={load} className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>


      {/* Top Stats */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <TiltCard className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-white/50">Utilization</div>
            <Gauge className="h-5 w-5 text-sky-400" />
          </div>
          <div className="mt-2 text-3xl font-black text-sky-300">{r.drivers.avgUtilization}%</div>
          <div className="mt-1 text-[11px] text-white/40">{r.drivers.totalDrivers} drivers active</div>
        </TiltCard>
        <TiltCard className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-white/50">Idle Fleet</div>
            <Timer className="h-5 w-5 text-amber-400" />
          </div>
          <div className={cn("mt-2 text-3xl font-black", r.idle.idleCount > 0 ? "text-amber-300" : "text-emerald-300")}>
            {r.idle.idleCount}
          </div>
          <div className="mt-1 text-[11px] text-white/40">
            {r.idle.idleCount > 0 ? `~R${r.idle.estimatedWaste.toLocaleString()} wasted` : "All drivers active"}
          </div>
        </TiltCard>
        <TiltCard className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-white/50">Capacity</div>
            <Target className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="mt-2 text-3xl font-black text-emerald-300">{r.forecast.capacityUsedPct}%</div>
          <div className="mt-1 text-[11px] text-white/40">
            {r.forecast.monthsUntilCapacity != null ? `${r.forecast.monthsUntilCapacity}mo until full` : "Comfortable"}
          </div>
        </TiltCard>
        <TiltCard className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-white/50">Hot Zones</div>
            <Flame className="h-5 w-5 text-rose-400" />
          </div>
          <div className="mt-2 text-3xl font-black text-rose-300">{r.zones.hotZones.length}</div>
          <div className="mt-1 text-[11px] text-white/40">
            {r.zones.hotZones.length > 0 ? r.zones.hotZones[0]?.zone : "Demand balanced"}
          </div>
        </TiltCard>
      </div>


      {/* AI Recommendations */}
      {r.repositioning.recommendations.length > 0 && (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-black text-white">AI Repositioning Recommendations</h2>
            <span className="ml-auto text-xs font-bold text-white/30">{r.repositioning.count} actions</span>
          </div>
          <div className="space-y-3">
            {r.repositioning.recommendations.map((rec, i) => (
              <div key={i} className={cn("rounded-2xl border p-4", PRIORITY_COLORS[rec.priority] || PRIORITY_COLORS.LOW)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{rec.priority}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">{rec.type}</span>
                    </div>
                    <h3 className="mt-1 font-bold text-white text-sm">{rec.title}</h3>
                    <p className="mt-1 text-xs opacity-70 leading-relaxed">{rec.description}</p>
                    <p className="mt-2 text-[11px] font-bold opacity-60 flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" /> {rec.impact}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Zone Demand + Driver Utilization Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Zone Demand Heatmap */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Zone Demand</h2>
          </div>
          <p className="text-[11px] text-white/40 mb-4">{r.zones.insight}</p>
          <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar">
            {r.zones.zones.map((zone) => (
              <div key={zone.zone} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {TREND_ICONS[zone.trend] || TREND_ICONS.STABLE}
                  <span className="text-sm font-bold text-white truncate">{zone.zone}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-white/50">{zone.total} shipments</span>
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-full",
                    zone.growthPct > 20 ? "bg-emerald-500/20 text-emerald-300" :
                    zone.growthPct < -20 ? "bg-rose-500/20 text-rose-300" :
                    "bg-white/10 text-white/50"
                  )}>
                    {zone.growthPct == null ? "new" : `${zone.growthPct > 0 ? "+" : ""}${zone.growthPct}%`}
                  </span>
                </div>
              </div>
            ))}
            {r.zones.zones.length === 0 && (
              <div className="py-8 text-center text-sm text-white/30">No zone data yet. Create waybills to see demand patterns.</div>
            )}
          </div>
        </div>

        {/* Driver Utilization */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Driver Utilization</h2>
          </div>
          <p className="text-[11px] text-white/40 mb-4">{r.drivers.insight}</p>
          <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar">
            {r.drivers.drivers.map((driver) => (
              <div key={driver.id} className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Truck className="h-3.5 w-3.5 text-white/30" />
                    <span className="text-sm font-bold text-white">{driver.name}</span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-black uppercase px-2 py-0.5 rounded-full",
                    driver.rating === "HIGH" ? "bg-emerald-500/20 text-emerald-300" :
                    driver.rating === "MEDIUM" ? "bg-amber-500/20 text-amber-300" :
                    "bg-rose-500/20 text-rose-300"
                  )}>{driver.rating}</span>
                </div>
                {utilizationBar(driver.utilization)}
                <div className="flex justify-between mt-1.5 text-[10px] text-white/40">
                  <span>{driver.avgPerDay} stops/day</span>
                  <span>{driver.delivered7d} this week</span>
                  <span>{driver.successRate == null ? "no data yet" : `${driver.successRate}% success`}</span>
                </div>
              </div>
            ))}
            {r.drivers.drivers.length === 0 && (
              <div className="py-8 text-center text-sm text-white/30">No drivers added yet.</div>
            )}
          </div>
        </div>
      </div>


      {/* Capacity Forecast + Idle Fleet Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Capacity Forecast */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Capacity Forecast</h2>
          </div>
          <p className="text-[11px] text-white/40 mb-4">{r.forecast.insight}</p>

          {/* Mini bar chart — history + forecast */}
          <div className="flex items-end gap-1 h-28 mb-3">
            {r.forecast.history.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-sky-500/60 transition-all"
                  style={{ height: `${Math.max(4, (m.count / Math.max(r.forecast.currentCapacity, 1)) * 100)}%` }}
                />
                <span className="text-[9px] text-white/30 truncate w-full text-center">{m.month.split(' ')[0]}</span>
              </div>
            ))}
            {r.forecast.forecast.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-violet-500/40 border border-violet-400/30 border-dashed transition-all"
                  style={{ height: `${Math.max(4, m.capacityPct)}%` }}
                />
                <span className="text-[9px] text-violet-300/50 truncate w-full text-center">{m.month.split(' ')[0]}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-black/20 p-2">
              <div className="text-lg font-black text-white">{r.forecast.activeDrivers}</div>
              <div className="text-[9px] text-white/40">Drivers</div>
            </div>
            <div className="rounded-xl bg-black/20 p-2">
              <div className="text-lg font-black text-white">{r.forecast.monthlyGrowthRate}%</div>
              <div className="text-[9px] text-white/40">Growth/mo</div>
            </div>
            <div className="rounded-xl bg-black/20 p-2">
              <div className={cn("text-lg font-black", r.forecast.driversNeeded3mo > 0 ? "text-amber-300" : "text-emerald-300")}>
                {r.forecast.driversNeeded3mo > 0 ? `+${r.forecast.driversNeeded3mo}` : "✓"}
              </div>
              <div className="text-[9px] text-white/40">Hire in 3mo</div>
            </div>
          </div>
        </div>

        {/* Idle Fleet */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-1">
            <Snowflake className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Idle Fleet Detection</h2>
          </div>
          <p className="text-[11px] text-white/40 mb-4">{r.idle.insight}</p>

          {r.idle.drivers.length > 0 ? (
            <div className="space-y-2">
              {r.idle.drivers.map((d) => (
                <div key={d.id} className={cn(
                  "flex items-center justify-between rounded-xl border px-3 py-2.5",
                  d.severity === "CRITICAL" ? "border-rose-500/30 bg-rose-500/5" :
                  d.severity === "WARNING" ? "border-amber-500/30 bg-amber-500/5" :
                  "border-white/10 bg-black/20"
                )}>
                  <div>
                    <span className="text-sm font-bold text-white">{d.name}</span>
                    <span className="ml-2 text-[10px] text-white/40">{d.vehicleType}</span>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      "text-xs font-bold",
                      d.severity === "CRITICAL" ? "text-rose-300" :
                      d.severity === "WARNING" ? "text-amber-300" : "text-white/50"
                    )}>
                      {d.lastDeliveryDaysAgo}d idle
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Activity className="h-8 w-8 text-emerald-400 mb-2" />
              <p className="text-sm font-bold text-emerald-300">All drivers active</p>
              <p className="text-[11px] text-white/40 mt-1">No idle vehicles detected in the last 72 hours.</p>
            </div>
          )}
        </div>
      </div>


      {/* Branch Balancing */}
      {r.branches.branchCount > 0 && (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Branch Network Balance</h2>
            <span className="ml-auto text-xs text-white/30">Imbalance: {r.branches.imbalanceScore}%</span>
          </div>
          <p className="text-[11px] text-white/40 mb-4">{r.branches.insight}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {r.branches.branches.map((b) => (
              <div key={b.id} className="rounded-xl border border-white/5 bg-black/20 px-3 py-3">
                <div className="text-sm font-bold text-white">{b.name}</div>
                <div className="text-[10px] text-white/40 mb-2">{b.city}</div>
                {utilizationBar(Math.min(100, Math.round((b.load / Math.max(r.branches.branches[0]?.load, 1)) * 100)))}
                <div className="mt-1 text-[10px] text-white/50">{b.totalWaybills} waybills / {b.delivered} delivered</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-3 text-center text-[11px] text-white/30">
        Fleet Intelligence powered by <strong className="text-sky-400/60">CLAW AI</strong> — Analyses run daily at 05:00 SAST and on-demand.
        Generated {new Date(r.generatedAt).toLocaleString("en-ZA")}.
      </div>
    </div>
  );
}
