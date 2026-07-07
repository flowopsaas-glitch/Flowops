import { useEffect, useState } from "react";
import { Leaf, TrendingDown, TrendingUp, Truck, Loader2, RefreshCw, AlertTriangle, BarChart3 } from "lucide-react";
import { api } from "../api/client";

type CarbonReport = {
  period: string;
  totalKmDriven: number;
  totalDeliveries: number;
  avgKmPerDelivery: number;
  totalCo2Kg: number;
  co2PerDelivery: number;
  co2PerKm: number;
  petrolVehicles: number;
  dieselVehicles: number;
  electricVehicles: number;
  motorbikeCount: number;
  netEmissionsKg: number;
  changePercent: number | null;
};

type Trend = { period: string; totalCo2Kg: number; totalDeliveries: number; co2PerDelivery: number };

export default function EsgDashboard() {
  const [report, setReport] = useState<CarbonReport | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/esg/report").then((r: any) => r?.data ?? r),
      api.get("/esg/trends").then((r: any) => r?.data ?? r),
    ]).then(([r, t]) => { setReport(r); setTrends(t); })
      .finally(() => setLoading(false));
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r: any = await api.post("/esg/refresh");
      setReport(r?.data ?? r);
    } finally { setRefreshing(false); }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-400/50" /></div>;
  if (!report) return <div className="flex min-h-[40vh] items-center justify-center"><AlertTriangle className="h-10 w-10 text-amber-400/60" /></div>;

  const fleetTotal = report.petrolVehicles + report.dieselVehicles + report.electricVehicles + report.motorbikeCount;
  const evPercent = fleetTotal > 0 ? Math.round((report.electricVehicles / fleetTotal) * 100) : 0;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/[0.08] via-green-500/[0.04] to-transparent p-6 lg:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">
              <Leaf className="h-3 w-3" /> ESG & Carbon Reporting
            </div>
            <h1 className="text-3xl font-black text-white">Fleet Emissions</h1>
            <p className="mt-1 text-sm text-white/50">Period: {report.period} · CO2 tracking for DHL/3PL compliance</p>
          </div>
          <button onClick={refresh} disabled={refreshing} className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2.5 text-xs font-black text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Computing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Total CO2" value={`${report.totalCo2Kg.toLocaleString()} kg`} icon={Leaf} color="bg-emerald-500/20 text-emerald-300" trend={report.changePercent} />
        <KPI label="Per Delivery" value={`${report.co2PerDelivery} kg`} icon={Truck} color="bg-sky-500/20 text-sky-300" />
        <KPI label="Total km Driven" value={report.totalKmDriven.toLocaleString()} icon={BarChart3} color="bg-violet-500/20 text-violet-300" />
        <KPI label="EV Adoption" value={`${evPercent}%`} icon={Leaf} color="bg-green-500/20 text-green-300" />
      </div>

      {/* Fleet Composition + Trend */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-4 text-sm font-black text-white flex items-center gap-2"><Truck className="h-5 w-5 text-sky-300" /> Fleet Composition</h2>
          <div className="space-y-3">
            {[
              { label: "Diesel Vehicles", count: report.dieselVehicles, color: "bg-amber-400" },
              { label: "Petrol Vehicles", count: report.petrolVehicles, color: "bg-sky-400" },
              { label: "Motorbikes", count: report.motorbikeCount, color: "bg-violet-400" },
              { label: "Electric Vehicles", count: report.electricVehicles, color: "bg-emerald-400" },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-3">
                <span className="w-32 text-xs text-white/50">{f.label}</span>
                <div className="flex-1 h-4 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full rounded-full ${f.color}`} style={{ width: `${fleetTotal > 0 ? (f.count / fleetTotal) * 100 : 0}%` }} />
                </div>
                <span className="w-8 text-right text-xs font-black text-white">{f.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-4 text-sm font-black text-white flex items-center gap-2"><BarChart3 className="h-5 w-5 text-emerald-300" /> Emissions Trend (6 months)</h2>
          <div className="flex items-end gap-2 h-32">
            {trends.map((t, i) => {
              const max = Math.max(...trends.map(x => x.totalCo2Kg), 1);
              const h = Math.max((t.totalCo2Kg / max) * 100, 4);
              const isLast = i === trends.length - 1;
              return (
                <div key={t.period} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[8px] text-white/30">{Math.round(t.totalCo2Kg)}</span>
                  <div className={`w-full rounded-t-lg ${isLast ? "bg-emerald-400" : "bg-emerald-400/30"}`} style={{ height: `${h}%` }} />
                  <span className="text-[9px] text-white/25">{t.period.split("-")[1]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, icon: Icon, color, trend }: { label: string; value: string; icon: any; color: string; trend?: number | null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`grid h-9 w-9 place-items-center rounded-xl ${color}`}><Icon className="h-4 w-4" /></div>
        {trend !== null && trend !== undefined && (
          <span className={`flex items-center gap-0.5 text-[10px] font-bold ${trend <= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {trend <= 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="text-lg font-black text-white">{value}</div>
      <div className="text-[10px] text-white/40">{label}</div>
    </div>
  );
}
