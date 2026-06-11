import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, DollarSign, Truck, CheckCircle2, AlertCircle, Download, Filter } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function PremiumAnalyticsDashboard() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<any>(null);
  const [period, setPeriod] = useState<'TODAY' | 'WEEK' | 'MONTH'>('MONTH');
  const [loading, setLoading] = useState(true);
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel' | 'pdf' | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/analytics/premium-dashboard`, { params: { period } });
        setMetrics(res.data);
      } catch (err) {
        console.error('Failed to fetch metrics:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.companyId) {
      void fetchMetrics();
    }
  }, [period, user]);

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      setExportFormat(format);
      const endpoint = `/export/waybills-${format}`;
      const response = await api.get(endpoint, { responseType: 'blob' });
      const blob = new Blob([response.data], {
        type: format === 'csv' ? 'text/csv' : format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `waybills-export.${format === 'excel' ? 'xlsx' : format}`;
      a.click();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExportFormat(null);
    }
  };

  if (loading || !metrics) {
    return <div className="p-8 text-white">Loading analytics...</div>;
  }

  const kpis = metrics.kpis || {};
  const trendData = metrics.trends || {};

  const chartData = [
    { name: 'Delivered', value: kpis.waybills?.delivered || 0 },
    { name: 'In Transit', value: kpis.waybills?.inTransit || 0 },
    { name: 'Failed', value: kpis.waybills?.failed || 0 },
  ];

  const COLORS = ['#22c55e', '#f59e0b', '#ef4444'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-950 p-8 text-white">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter mb-2">📊 PREMIUM ANALYTICS</h1>
          <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Real-time business intelligence</p>
        </div>

        <div className="flex gap-3">
          {(['TODAY', 'WEEK', 'MONTH'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg font-black text-xs uppercase transition-all ${
                period === p ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KPICard
          title="Total Waybills"
          value={kpis.waybills?.total || 0}
          icon={<Truck className="text-sky-400" size={24} />}
          trend="+12.5%"
          color="sky"
        />
        <KPICard
          title="Success Rate"
          value={`${kpis.waybills?.successRate || 0}%`}
          icon={<CheckCircle2 className="text-emerald-400" size={24} />}
          color="emerald"
        />
        <KPICard
          title="Revenue (R)"
          value={`${(kpis.revenue || 0).toLocaleString()}`}
          icon={<DollarSign className="text-amber-400" size={24} />}
          trend="+8.2%"
          color="amber"
        />
        <KPICard
          title="Active Drivers"
          value={kpis.operations?.activeDrivers || 0}
          icon={<TrendingUp className="text-purple-400" size={24} />}
          color="purple"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Status Distribution */}
        <div className="bg-slate-800/50 border border-white/10 rounded-[24px] p-6">
          <h3 className="text-lg font-black mb-4 flex items-center gap-2">
            📊 Status Distribution
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Performance Trend */}
        <div className="bg-slate-800/50 border border-white/10 rounded-[24px] p-6 lg:col-span-2">
          <h3 className="text-lg font-black mb-4 flex items-center gap-2">
            📈 30-Day Trend
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #475569' }} />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Invoice Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <MetricBox title="Invoices Generated" value={kpis.invoicing?.generated || 0} />
        <MetricBox title="Collection Rate" value={kpis.invoicing?.collectionRate || '0%'} />
        <MetricBox title="Pending Invoices" value={kpis.invoicing?.pending || 0} />
      </div>

      {/* Export Section */}
      <div className="bg-slate-800/50 border border-white/10 rounded-[24px] p-6">
        <h3 className="text-lg font-black mb-4 flex items-center gap-2">
          <Download size={20} /> Export Data
        </h3>
        <div className="flex flex-wrap gap-3">
          <ExportButton format="csv" loading={exportFormat === 'csv'} onClick={() => handleExport('csv')} />
          <ExportButton format="excel" loading={exportFormat === 'excel'} onClick={() => handleExport('excel')} />
          <ExportButton format="pdf" loading={exportFormat === 'pdf'} onClick={() => handleExport('pdf')} />
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon, trend, color }: any) {
  const colorClass = {
    sky: 'border-sky-500/30 bg-sky-500/10',
    emerald: 'border-emerald-500/30 bg-emerald-500/10',
    amber: 'border-amber-500/30 bg-amber-500/10',
    purple: 'border-purple-500/30 bg-purple-500/10',
  }[color];

  return (
    <div className={`rounded-[24px] border p-6 ${colorClass}`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-black text-slate-300 uppercase tracking-wider">{title}</h4>
        {icon}
      </div>
      <div className="text-3xl font-black mb-2">{value}</div>
      {trend && <div className="text-xs font-bold text-emerald-400">{trend} vs last period</div>}
    </div>
  );
}

function MetricBox({ title, value }: any) {
  return (
    <div className="bg-slate-800/50 border border-white/10 rounded-[20px] p-6 text-center">
      <p className="text-sm font-bold text-slate-400 uppercase mb-2">{title}</p>
      <p className="text-3xl font-black">{value}</p>
    </div>
  );
}

function ExportButton({ format, loading, onClick }: any) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-6 py-3 rounded-lg bg-gradient-to-r from-sky-500/20 to-sky-600/20 border border-sky-500/50 text-sky-300 font-black text-sm uppercase hover:from-sky-500/30 hover:to-sky-600/30 disabled:opacity-50 transition-all flex items-center gap-2"
    >
      <Download size={16} />
      {loading ? `Exporting ${format.toUpperCase()}...` : `Export as ${format.toUpperCase()}`}
    </button>
  );
}
