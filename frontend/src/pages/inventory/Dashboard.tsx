import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Package, Warehouse, TrendingUp, AlertTriangle, 
  Activity, Brain, ArrowUpRight, ArrowDownRight,
  Zap, Truck, BarChart3
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell 
} from 'recharts';
import { inventoryApi } from '../../lib/inventoryApi';

const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'];

export default function InventoryDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [movementsByType, setMovementsByType] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [metricsRes, movementsRes] = await Promise.all([
        inventoryApi.getMetrics(),
        inventoryApi.getMovements({ limit: 100 }),
      ]);
      setMetrics(metricsRes.data);
      
      // Transform movements for chart
      const chartData = movementsRes.data.reduce((acc: any[], move: any) => {
        const date = new Date(move.createdAt).toLocaleDateString('en-ZA', { weekday: 'short' });
        const existing = acc.find(d => d.name === date);
        if (existing) {
          existing[move.type] = (existing[move.type] || 0) + move.quantity;
        } else {
          acc.push({ name: date, [move.type]: move.quantity });
        }
        return acc;
      }, []);
      setMovementsByType(chartData);
    } catch (error) {
      console.error('Failed to load dashboard data', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#020617]">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-10 space-y-8">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
      >
        <div>
          <div className="flex items-center gap-2 text-blue-400 mb-2">
            <Zap size={18} />
            <span className="text-xs font-bold uppercase tracking-widest">AI-Powered Command Center</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight">Inventory Operations</h1>
          <p className="text-slate-400 mt-1">Real-time visibility across your entire supply chain.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-blue-500/20"
        >
          <Brain size={16} /> AI Forecast
        </motion.button>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Items', value: metrics?.totalItems || 0, icon: Package, color: 'blue', trend: '+12%' },
          { label: 'Warehouses', value: metrics?.totalWarehouses || 0, icon: Warehouse, color: 'indigo', trend: '+1' },
          { label: 'Stock Units', value: metrics?.totalStockUnits || 0, icon: BarChart3, color: 'violet', trend: '+845' },
          { label: 'Low Stock Alerts', value: metrics?.lowStockAlerts || 0, icon: AlertTriangle, color: 'rose', trend: '-2' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="relative bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 overflow-hidden group hover:border-blue-500/50 transition-all"
          >
            <div className={`absolute top-0 right-0 w-32 h-32 bg-${stat.color}-500/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-${stat.color}-500/20 transition-all`} />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl bg-${stat.color}-500/10 text-${stat.color}-400`}>
                  <stat.icon size={20} />
                </div>
                <span className={`text-xs font-bold flex items-center gap-1 ${stat.trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {stat.trend.startsWith('+') ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {stat.trend}
                </span>
              </div>
              <h3 className="text-3xl font-black mb-1">{stat.value.toLocaleString()}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock Movement Chart */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2 bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
        >
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-bold">Stock Movements</h2>
              <p className="text-xs text-slate-400">Real-time inflow vs outflow</p>
            </div>
            <Activity className="text-blue-400" size={20} />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={movementsByType}>
                <defs>
                  <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  labelStyle={{ color: '#f8fafc' }}
                />
                <Area type="monotone" dataKey="IN" stroke="#3b82f6" fillOpacity={1} fill="url(#colorIn)" />
                <Area type="monotone" dataKey="OUT" stroke="#f43f5e" fillOpacity={1} fill="url(#colorOut)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Distribution Pie */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
        >
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-bold">Movement Types</h2>
              <p className="text-xs text-slate-400">Distribution breakdown</p>
            </div>
            <TrendingUp className="text-indigo-400" size={20} />
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics?.movementsByType || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="_sum.quantity"
                  nameKey="type"
                >
                  {COLORS.map((color, index) => (
                    <Cell key={`cell-${index}`} fill={color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {metrics?.movementsByType?.map((item: any, i: number) => (
              <div key={item.type} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-slate-300 font-medium">{item.type}</span>
                </div>
                <span className="text-white font-bold">{item._sum.quantity}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* AI Insights Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-500/20 rounded-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Brain className="text-blue-400" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">AI Supply Chain Insights</h2>
            <p className="text-xs text-slate-400">Predictive analytics based on your movement history</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { title: 'Demand Spike Predicted', desc: 'Small Shipping Box demand expected to increase 34% next week.', icon: TrendingUp },
            { title: 'Optimal Reorder Point', desc: 'Adjust reorder point for SKU-BOX-SM-001 to 75 units to reduce holding costs.', icon: Zap },
            { title: 'Warehouse Congestion', desc: 'JHB-001 is at 85% capacity. Consider rerouting inbound stock to CPT-002.', icon: Warehouse },
          ].map((insight, i) => (
            <div key={i} className="bg-slate-900/50 backdrop-blur rounded-xl p-4 border border-white/5">
              <insight.icon className="text-blue-400 mb-2" size={18} />
              <h3 className="text-sm font-bold mb-1">{insight.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{insight.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
