import React, { useState, useEffect } from 'react';
import { Responsive as ResponsiveGridLayout, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import axios from 'axios';
import { Edit3, Save, Plus, X, Package, Truck, DollarSign, TrendingUp } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface WidgetConfig {
  i: string;
  type: 'kpi' | 'chart' | 'exceptions';
  config: any;
}

// Dark-themed KPI card matching FlowOps design system
const InlineKpiCard = ({ metric, value, label }: any) => {
  const icons: Record<string, any> = {
    totalWaybills: Package, deliveredToday: Truck, inTransit: Truck,
    pending: Package, revenue: DollarSign, otdPercent: TrendingUp,
  };
  const Icon = icons[metric] || Package;

  return (
    <div className="bg-[#1e293b] border border-slate-700 rounded-lg p-5 h-full flex flex-col justify-between shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
        <div className="p-2 bg-blue-600/20 rounded-lg">
          <Icon className="w-4 h-4 text-blue-400" />
        </div>
      </div>
      <div className="text-3xl font-bold text-white">
        {metric === 'revenue' ? `R${Number(value).toLocaleString()}` : 
         metric === 'otdPercent' ? `${value}%` : value}
      </div>
    </div>
  );
};

export const DynamicDashboard: React.FC = () => {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [layout, setLayout] = useState<Layout[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [layoutId, setLayoutId] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const token = localStorage.getItem('access_token') || localStorage.getItem('accessToken');
        if (!token) { setLoading(false); return; }

        const headers = { Authorization: `Bearer ${token}` };
        
        // Fetch layout and metrics in parallel
        const [layoutRes, metricsRes] = await Promise.all([
          axios.get(`${API_URL}/dashboards/layout`, { headers }).catch(() => null),
          axios.get(`${API_URL}/dashboards/metrics`, { headers }).catch(() => null),
        ]);

        if (metricsRes?.data) setMetrics(metricsRes.data);

        if (layoutRes?.data && !layoutRes.data.isNew && layoutRes.data.config?.widgets?.length > 0) {
          setWidgets(layoutRes.data.config.widgets);
          setLayout(layoutRes.data.config.layout);
          setLayoutId(layoutRes.data.id);
        } else {
          // Rich default layout for first-time users
          const defaultWidgets: WidgetConfig[] = [
            { i: 'kpi_total', type: 'kpi', config: { metric: 'totalWaybills', label: 'Total Waybills' } },
            { i: 'kpi_delivered', type: 'kpi', config: { metric: 'deliveredToday', label: 'Delivered Today' } },
            { i: 'kpi_transit', type: 'kpi', config: { metric: 'inTransit', label: 'In Transit' } },
            { i: 'kpi_revenue', type: 'kpi', config: { metric: 'revenue', label: 'Revenue' } },
          ];
          const defaultLayout: Layout[] = [
            { i: 'kpi_total', x: 0, y: 0, w: 3, h: 2 },
            { i: 'kpi_delivered', x: 3, y: 0, w: 3, h: 2 },
            { i: 'kpi_transit', x: 6, y: 0, w: 3, h: 2 },
            { i: 'kpi_revenue', x: 9, y: 0, w: 3, h: 2 },
          ];
          setWidgets(defaultWidgets);
          setLayout(defaultLayout);
          
          // Auto-save defaults
          setTimeout(async () => {
            await axios.post(`${API_URL}/dashboards/layout`, {
              name: 'Admin Command Center', role: 'ADMIN',
              config: { widgets: defaultWidgets, layout: defaultLayout }
            }, { headers });
          }, 1000);
        }
      } catch (err) { console.error('Failed to load dashboard:', err); }
      finally { setLoading(false); }
    };
    loadData();
  }, []);

  const saveLayout = async (newLayout: Layout[]) => {
    setLayout(newLayout);
    if (!isEditMode) return;
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('accessToken');
      await axios.post(`${API_URL}/dashboards/layout`, {
        id: layoutId, name: 'My Dashboard', role: 'ADMIN',
        config: { widgets, layout: newLayout }
      }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) { console.error('Save failed:', err); }
  };

  const addWidget = (metric: string, label: string) => {
    const id = `kpi_${Date.now()}`;
    setWidgets([...widgets, { i: id, type: 'kpi' as const, config: { metric, label } }]);
    setLayout([...layout, { i: id, x: 0, y: Infinity, w: 3, h: 2 }]);
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="p-4 bg-[#0f172a] min-h-screen"> {/* Dark background */}
      {/* Toolbar */}
      <div className="mb-4 flex justify-between items-center bg-[#1e293b] p-3 rounded-lg border border-slate-700">
        <h1 className="text-xl font-bold text-white">Command Center</h1>
        <div className="flex gap-2">
          {isEditMode && (
            <>
              <button onClick={() => addWidget('pending', 'Pending')} className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors">+ Pending</button>
              <button onClick={() => addWidget('otdPercent', 'OTD %')} className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors">+ OTD %</button>
            </>
          )}
          <button onClick={() => setIsEditMode(!isEditMode)} className={`px-4 py-2 rounded font-medium flex items-center gap-2 transition-colors ${isEditMode ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>
            {isEditMode ? <><Save className="w-4 h-4" /> Save Layout</> : <><Edit3 className="w-4 h-4" /> Customize</>}
          </button>
        </div>
      </div>

      {/* Grid */}
      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: layout }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={80}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        onLayoutChange={(currentLayout) => saveLayout(currentLayout as Layout[])}
      >
        {widgets.map((widget) => (
          <div key={widget.i} className={isEditMode ? 'border-2 border-dashed border-blue-500/50 rounded-lg relative' : ''}>
            {isEditMode && (
              <button onClick={() => { 
                setWidgets(widgets.filter(w => w.i !== widget.i)); 
                setLayout(layout.filter(l => l.i !== widget.i)); 
              }} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 z-10 hover:bg-red-600 transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
            {widget.type === 'kpi' && (
              <InlineKpiCard metric={widget.config.metric} value={metrics[widget.config.metric] ?? 0} label={widget.config.label} />
            )}
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
};
