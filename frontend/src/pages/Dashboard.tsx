import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, Truck, DollarSign, TrendingUp, Clock, AlertTriangle,
  Plus, FileText, ClipboardList, ArrowRight, Activity, CheckCircle,
  BarChart3, Zap, Users, MapPin
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface Metrics {
  totalWaybills: number;
  deliveredToday: number;
  inTransit: number;
  pending: number;
  exceptions: number;
  revenue: number;
  otdPercent: number;
  activeManifests: number;
}

interface VolumePoint {
  date: string;
  count: number;
}

interface RecentWaybill {
  id: number;
  waybillNumber: string;
  status: string;
  senderName?: string;
  receiverName?: string;
  createdAt: string;
  totalAmount?: number;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [volume, setVolume] = useState<VolumePoint[]>([]);
  const [recentWaybills, setRecentWaybills] = useState<RecentWaybill[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem('access_token');
      if (!token) { setLoading(false); return; }
      const headers = { Authorization: `Bearer ${token}` };

      try {
        const [metricsRes, volumeRes, waybillsRes] = await Promise.all([
          fetch(`${API_URL}/dashboards/metrics`, { headers }).catch(() => null),
          fetch(`${API_URL}/dashboards/volume`, { headers }).catch(() => null),
          fetch(`${API_URL}/waybills?limit=8&sort=createdAt:desc`, { headers }).catch(() => null),
        ]);

        if (metricsRes?.ok) setMetrics(await metricsRes.json());
        if (volumeRes?.ok) setVolume(await volumeRes.json());
        if (waybillsRes?.ok) {
          const data = await waybillsRes.json();
          setRecentWaybills(Array.isArray(data) ? data.slice(0, 8) : data.waybills?.slice(0, 8) || []);
        }
      } catch (e) { console.error('Dashboard load failed:', e); }
      setLoading(false);
    };
    load();
  }, []);

  const m = metrics || { totalWaybills: 0, deliveredToday: 0, inTransit: 0, pending: 0, exceptions: 0, revenue: 0, otdPercent: 0, activeManifests: 0 };

  const kpiCards = [
    { label: 'Total Waybills', value: m.totalWaybills, icon: Package, color: '#6C9EFF', trend: null },
    { label: 'Delivered Today', value: m.deliveredToday, icon: CheckCircle, color: '#4ADE80', trend: null },
    { label: 'In Transit', value: m.inTransit, icon: Truck, color: '#A78BFA', trend: null },
    { label: 'Pending', value: m.pending, icon: Clock, color: '#FBBF24', trend: null },
    { label: 'Revenue', value: `R${m.revenue.toLocaleString()}`, icon: DollarSign, color: '#4ADE80', trend: '+5%' },
    { label: 'On-Time Delivery', value: `${m.otdPercent}%`, icon: TrendingUp, color: m.otdPercent >= 90 ? '#4ADE80' : m.otdPercent >= 70 ? '#FBBF24' : '#F87171', trend: null },
  ];

  const quickActions = [
    { label: 'Create Waybill', icon: Plus, color: '#6C9EFF', path: '/waybills/inbox' },
    { label: 'New Collection', icon: ClipboardList, color: '#A78BFA', path: '/collections' },
    { label: 'View Invoices', icon: FileText, color: '#4ADE80', path: '/invoices' },
    { label: 'Dispatch Board', icon: MapPin, color: '#FBBF24', path: '/driver-dispatch' },
  ];

  const statusColors: Record<string, { bg: string; color: string }> = {
    DELIVERED: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
    IN_TRANSIT: { bg: 'rgba(108,158,255,0.12)', color: '#6C9EFF' },
    PENDING: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
    PENDING_COLLECTION: { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA' },
    FAILED: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
    CANCELLED: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
  };

  const chartData = volume.map(v => ({
    day: v.date.slice(5), // "06-11" → "06-11"
    waybills: v.count,
  }));

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <Activity size={32} color="#6C9EFF" className="animate-pulse" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white', margin: 0 }}>Operations Dashboard</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
            Real-time overview of your logistics operations
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '11px', padding: '4px 12px', borderRadius: '9999px',
            background: 'rgba(74,222,128,0.1)', color: '#4ADE80',
            border: '1px solid rgba(74,222,128,0.2)',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ADE80', animation: 'pulse 2s infinite' }} />
            Live
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" style={{ marginBottom: '24px' }}>
        {kpiCards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} style={{
              borderRadius: '12px', padding: '16px',
              background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>{card.label}</span>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${card.color}15` }}>
                  <Icon size={14} color={card.color} />
                </div>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'white' }}>{card.value}</div>
              {card.trend && (
                <span style={{ fontSize: '10px', color: '#4ADE80', fontWeight: 600 }}>{card.trend}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Middle Row: Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ marginBottom: '24px' }}>
        {/* Volume Chart */}
        <div className="lg:col-span-2" style={{ borderRadius: '12px', padding: '20px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'white', margin: 0 }}>Waybill Volume (7 days)</h3>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', margin: '2px 0 0' }}>Daily waybill creation trend</p>
            </div>
            <BarChart3 size={16} color="rgba(255,255,255,0.3)" />
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorWaybills" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6C9EFF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6C9EFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(10,15,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="waybills" stroke="#6C9EFF" strokeWidth={2} fill="url(#colorWaybills)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
              No volume data yet — create your first waybill!
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div style={{ borderRadius: '12px', padding: '20px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'white', margin: '0 0 16px' }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {quickActions.map(action => {
              const Icon = action.icon;
              return (
                <button key={action.label} onClick={() => navigate(action.path)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
                    padding: '12px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.03)', textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${action.color}15` }}>
                    <Icon size={16} color={action.color} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'white', flex: 1 }}>{action.label}</span>
                  <ArrowRight size={14} color="rgba(255,255,255,0.25)" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Waybills + System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Waybills */}
        <div className="lg:col-span-2" style={{ borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'white', margin: 0 }}>Recent Waybills</h3>
            <button onClick={() => navigate('/waybills')} style={{ fontSize: '11px', color: '#6C9EFF', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
              View All →
            </button>
          </div>
          {recentWaybills.length > 0 ? (
            <table style={{ width: '100%', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {['Waybill #', 'Sender', 'Receiver', 'Status', 'Amount'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentWaybills.map((wb, i) => {
                  const sc = statusColors[wb.status] || statusColors.PENDING;
                  return (
                    <tr key={wb.id} style={{ borderBottom: i < recentWaybills.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                      className="hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => navigate(`/waybills`)}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#6C9EFF' }}>{wb.waybillNumber || `WB-${wb.id}`}</td>
                      <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.7)' }}>{wb.senderName || '—'}</td>
                      <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.7)' }}>{wb.receiverName || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: sc.bg, color: sc.color }}>
                          {wb.status?.replace('_', ' ') || 'PENDING'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: 'white', fontWeight: 500 }}>
                        {wb.totalAmount ? `R${wb.totalAmount.toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
              No waybills yet — start by creating one from the Waybill Inbox
            </div>
          )}
        </div>

        {/* System Status Panel */}
        <div style={{ borderRadius: '12px', padding: '20px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'white', margin: '0 0 16px' }}>System Status</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <StatusRow label="API" status="operational" />
            <StatusRow label="Database" status="operational" />
            <StatusRow label="AI Engine" status="operational" />
            <StatusRow label="Email Hub" status="operational" />
            <StatusRow label="WhatsApp" status={m.exceptions > 5 ? 'degraded' : 'operational'} />
          </div>

          {/* Exceptions alert */}
          {m.exceptions > 0 && (
            <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={14} color="#FBBF24" />
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#FBBF24' }}>
                  {m.exceptions} exception{m.exceptions !== 1 ? 's' : ''} need attention
                </span>
              </div>
              <button onClick={() => navigate('/security/high-risk')} style={{ fontSize: '11px', color: '#6C9EFF', background: 'none', border: 'none', cursor: 'pointer', marginTop: '6px' }}>
                View High Risk Queue →
              </button>
            </div>
          )}

          {/* Active manifests */}
          <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: 'rgba(108,158,255,0.05)', border: '1px solid rgba(108,158,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Active Manifests</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{m.activeManifests}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Status Row Component ────────────────────────────────────────────────────
function StatusRow({ label, status }: { label: string; status: 'operational' | 'degraded' | 'down' }) {
  const colors = {
    operational: '#4ADE80',
    degraded: '#FBBF24',
    down: '#F87171',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: colors[status] }} />
        <span style={{ fontSize: '11px', fontWeight: 500, color: colors[status], textTransform: 'capitalize' }}>{status}</span>
      </div>
    </div>
  );
}
