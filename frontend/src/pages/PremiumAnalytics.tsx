import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from '../api/client';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, DollarSign, Truck, MapPin, AlertCircle } from "lucide-react";

export default function PremiumAnalytics() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<"TODAY" | "WEEK" | "MONTH">("MONTH");
  const [dashboardKpis, setDashboardKpis] = useState<any>(null);
  const [revenueAnalytics, setRevenueAnalytics] = useState<any>(null);
  const [fleetAnalytics, setFleetAnalytics] = useState<any>(null);
  const [geographicAnalytics, setGeographicAnalytics] = useState<any>(null);
  const [costAnalysis, setCostAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [dashboard, revenue, fleet, geographic, costs] = await Promise.all([
        api.get(`/analytics/dashboard?period=${period}`),
        api.get(`/analytics/revenue?period=${period}`),
        api.get("/analytics/fleet"),
        api.get("/analytics/geographic"),
        api.get("/analytics/costs"),
      ]);

      setDashboardKpis(dashboard.data);
      setRevenueAnalytics(revenue.data);
      setFleetAnalytics(fleet.data);
      setGeographicAnalytics(geographic.data);
      setCostAnalysis(costs.data);
    } catch (err) {
      console.error("Analytics fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-200 p-8">
      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-5xl font-black text-white mb-2 flex items-center gap-3">
          <TrendingUp className="text-emerald-400" size={40} />
          PLATINUM ANALYTICS
        </h1>
        <p className="text-slate-500 font-bold uppercase text-xs tracking-[0.2em]">
          Real-time KPIs · Revenue · Fleet Performance · Geographic Coverage
        </p>
      </div>

      {/* PERIOD SELECTOR */}
      <div className="flex gap-3 mb-8">
        {(["TODAY", "WEEK", "MONTH"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-6 py-3 rounded-xl font-black text-xs uppercase transition-all ${
              period === p
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                : "bg-slate-800/50 border border-white/10 hover:border-emerald-500/50"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* KPI CARDS - ROW 1 */}
      {dashboardKpis && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <KpiCard
            title="Waybills"
            value={dashboardKpis.kpis.waybills.total}
            subtitle={`${dashboardKpis.kpis.waybills.delivered} delivered`}
            trend="↑ 12%"
            color="emerald"
          />
          <KpiCard
            title="Success Rate"
            value={dashboardKpis.kpis.waybills.successRate}
            subtitle={`${dashboardKpis.kpis.waybills.failed} failed`}
            trend="↑ 4%"
            color="sky"
          />
          <KpiCard
            title="Invoices"
            value={dashboardKpis.kpis.invoicing.generated}
            subtitle={`${dashboardKpis.kpis.invoicing.paid} paid`}
            trend={dashboardKpis.kpis.invoicing.collectionRate}
            color="amber"
          />
          <KpiCard
            title="Active Drivers"
            value={dashboardKpis.kpis.operations.activeDrivers}
            subtitle="Fleet operational"
            trend="✓ Ready"
            color="purple"
          />
          <KpiCard
            title="Avg Delivery"
            value={dashboardKpis.kpis.operations.avgDeliveryTime}
            subtitle="Per waybill"
            trend="↓ Optimized"
            color="pink"
          />
        </div>
      )}

      {/* REVENUE SECTION */}
      {revenueAnalytics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-slate-900/50 border border-white/10 rounded-[32px] p-8">
            <h3 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
              <DollarSign className="text-emerald-400" size={28} />
              Revenue Trend
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueAnalytics.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                <Line type="monotone" dataKey="amount" stroke="#22c55e" strokeWidth={3} dot={{ fill: "#22c55e", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-900/50 border border-white/10 rounded-[32px] p-8">
            <h3 className="text-lg font-black text-white mb-6">Revenue Summary</h3>
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                <div className="text-xs text-emerald-400 font-black uppercase tracking-wider">Total Revenue</div>
                <div className="text-3xl font-black text-emerald-300 mt-2">R{revenueAnalytics.summary.totalRevenue}</div>
              </div>
              <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-4">
                <div className="text-xs text-sky-400 font-black uppercase tracking-wider">Paid</div>
                <div className="text-2xl font-black text-sky-300">R{revenueAnalytics.summary.paidRevenue}</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <div className="text-xs text-amber-400 font-black uppercase tracking-wider">Pending</div>
                <div className="text-2xl font-black text-amber-300">R{revenueAnalytics.summary.pendingRevenue}</div>
              </div>
              <div className="text-center mt-4 text-sm font-bold text-emerald-300">
                Collection Rate: {revenueAnalytics.summary.collectionRate}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FLEET PERFORMANCE */}
      {fleetAnalytics && (
        <div className="bg-slate-900/50 border border-white/10 rounded-[32px] p-8 mb-8">
          <h3 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
            <Truck className="text-sky-400" size={28} />
            Fleet Performance
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-sky-300">{fleetAnalytics.totalDrivers}</div>
              <div className="text-xs text-sky-400 font-black uppercase mt-1">Total Drivers</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
              <div className="text-3xl font-black text-emerald-300">{fleetAnalytics.activeDrivers}</div>
              <div className="text-xs text-emerald-400 font-black uppercase mt-1">Active Now</div>
            </div>
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {fleetAnalytics.performanceMetrics.slice(0, 5).map((driver: any, idx: number) => (
              <div key={idx} className="bg-slate-800/50 border border-white/5 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white">{driver.driverName}</div>
                  <div className="text-xs text-slate-500">{driver.totalDeliveries} deliveries</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-emerald-400">{driver.successRate}</div>
                  <div className="text-xs text-slate-500">Success</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COST ANALYSIS */}
      {costAnalysis && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-slate-900/50 border border-white/10 rounded-[32px] p-8">
            <h3 className="text-xl font-black text-white mb-6">Cost Breakdown</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Operating", value: parseFloat(costAnalysis.costs.baseOperating) },
                    { name: "Variable", value: parseFloat(costAnalysis.costs.variableCosts) },
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: R${value.toFixed(0)}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {COLORS.map((color, index) => (
                    <Cell key={`cell-${index}`} fill={color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `R${value.toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-900/50 border border-white/10 rounded-[32px] p-8">
            <h3 className="text-xl font-black text-white mb-6">Profitability</h3>
            <div className="space-y-4">
              <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
                <div className="text-xs text-slate-400 font-bold uppercase">Revenue</div>
                <div className="text-3xl font-black text-emerald-400 mt-1">R{costAnalysis.revenue}</div>
              </div>
              <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
                <div className="text-xs text-slate-400 font-bold uppercase">Operating Cost</div>
                <div className="text-2xl font-black text-red-400">R{costAnalysis.costs.totalOperating}</div>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                <div className="text-xs text-emerald-400 font-bold uppercase">Net Profit</div>
                <div className="text-3xl font-black text-emerald-300 mt-1">R{costAnalysis.netProfit}</div>
                <div className="text-sm text-emerald-200 mt-2">Margin: {costAnalysis.profitMargin}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GEOGRAPHIC COVERAGE */}
      {geographicAnalytics && (
        <div className="bg-slate-900/50 border border-white/10 rounded-[32px] p-8">
          <h3 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
            <MapPin className="text-purple-400" size={28} />
            Geographic Coverage
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {geographicAnalytics.coverage.map((branch: any, idx: number) => (
              <div key={idx} className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
                <div className="font-bold text-white mb-3">{branch.branchName}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Inventory:</span>
                    <span className="font-bold text-emerald-400">{branch.inventoryItems}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Completed:</span>
                    <span className="font-bold text-sky-400">{branch.completedDeliveries}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Coverage:</span>
                    <span className="font-bold text-purple-400">{branch.coverage}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ title, value, subtitle, trend, color }: any) {
  const colorClasses = {
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    sky: "bg-sky-500/10 border-sky-500/30 text-sky-300",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-300",
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-300",
    pink: "bg-pink-500/10 border-pink-500/30 text-pink-300",
  };

  return (
    <div className={`border rounded-xl p-4 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="text-xs font-black uppercase tracking-wider text-white/80">{title}</div>
      <div className="text-3xl font-black mt-2 text-white">{value}</div>
      <div className="text-xs text-white/60 mt-1">{subtitle}</div>
      <div className="text-xs font-bold mt-2 text-white/70">{trend}</div>
    </div>
  );
}
