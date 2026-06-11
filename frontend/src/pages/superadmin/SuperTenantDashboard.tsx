import { useState } from 'react';
import { Building2, Users, DollarSign, Activity, Zap, AlertTriangle, Radio } from 'lucide-react';
import Sidebar from '@/components/supertenant/Sidebar';
import TopBar from '@/components/supertenant/TopBar';
import StatCard from '@/components/supertenant/StatCard';
import PerformanceCharts from '@/components/supertenant/PerformanceCharts';
import TenantTable from '@/components/supertenant/TenantTable';
import QuickActions from '@/components/supertenant/QuickActions';
import AddTenantModal from '@/components/supertenant/AddTenantModal';
import { useTenants } from '@/hooks/supertenant/useTenants';

export default function SuperTenantDashboard() {
  const { tenants, stats, loading, refresh } = useTenants();
  const [showAddModal, setShowAddModal] = useState(false);

  const s = stats;

  const stats1 = [
    { title: 'Active Tenants', value: s?.activeTenants ?? '—', icon: Building2, iconBg: 'rgba(108,158,255,0.15)', iconColor: '#6C9EFF', progress: s ? (s.activeTenants / Math.max(s.totalTenants,1)) * 100 : 0, progressColor: 'linear-gradient(90deg,#6C9EFF,#A78BFA)', label: 'Active Tenants', trend: null },
    { title: 'Total Users', value: s?.totalUsers ?? '—', icon: Users, iconBg: 'rgba(167,139,250,0.15)', iconColor: '#A78BFA', progress: 72, progressColor: 'linear-gradient(90deg,#A78BFA,#6C9EFF)', label: 'Total Users', trend: '22' },
    { title: 'Monthly Revenue', value: s?.monthlyRevenue ? `R${s.monthlyRevenue.toLocaleString()}` : 'R0', icon: DollarSign, iconBg: 'rgba(251,191,36,0.15)', iconColor: '#FBBF24', progress: 85, progressColor: 'linear-gradient(90deg,#FBBF24,#F59E0B)', label: 'Monthly Revenue', trend: '5' },
    { title: 'System Health', value: `${s?.systemHealth ?? 99}%`, icon: Activity, iconBg: 'rgba(74,222,128,0.15)', iconColor: '#4ADE80', progress: s?.systemHealth ?? 99, progressColor: 'linear-gradient(90deg,#4ADE80,#22D3EE)', label: 'System Health', trend: null },
  ];

  const stats2 = [
    { title: 'Dispatches Today', value: s?.dispatchesToday ?? '—', icon: Zap, iconBg: 'rgba(108,158,255,0.15)', iconColor: '#6C9EFF', progress: 38, progressColor: 'linear-gradient(90deg,#6C9EFF,#A78BFA)', label: 'Dispatches Today', trend: null },
    { title: 'Pending Issues', value: s?.pendingIssues ?? '—', icon: AlertTriangle, iconBg: 'rgba(251,191,36,0.15)', iconColor: '#FBBF24', progress: 45, progressColor: 'linear-gradient(90deg,#FBBF24,#F59E0B)', label: 'Pending Issues', trend: null },
    { title: 'Uptime', value: `${s?.uptime ?? 100}%`, icon: Radio, iconBg: 'rgba(74,222,128,0.15)', iconColor: '#4ADE80', progress: s?.uptime ?? 100, progressColor: 'linear-gradient(90deg,#4ADE80,#22D3EE)', label: 'Uptime', trend: null },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
      <Sidebar />
      <TopBar user={null} onRefresh={refresh} loading={loading} />
      <main className="pl-[175px] pt-14">
        <div className="p-6 space-y-6 max-w-[1400px]">
          {loading && (
            <div className="text-center py-8 text-white/40 text-sm">Loading platform data...</div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats1.map(s => <StatCard key={s.title} {...s} />)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {stats2.map(s => <StatCard key={s.title} {...s} />)}
          </div>
          <PerformanceCharts />
          <TenantTable tenants={tenants} onRefresh={refresh} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl p-4 hidden lg:block"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-xs font-semibold mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>NAVIGATION</div>
              {['Dashboard','Tenants','Users','Billing','Dispatches','Settings'].map((item, i) => (
                <div key={item} className="flex items-center gap-2 px-2 py-2 rounded-lg mb-1 text-sm"
                  style={{ color: i === 0 ? '#6C9EFF' : 'rgba(255,255,255,0.5)', background: i === 0 ? 'rgba(108,158,255,0.1)' : 'transparent' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: i === 0 ? '#6C9EFF' : 'rgba(255,255,255,0.2)' }} />
                  {item}
                </div>
              ))}
            </div>
            <div className="lg:col-span-2">
              <QuickActions onAddTenant={() => setShowAddModal(true)} />
            </div>
          </div>
        </div>
      </main>
      {showAddModal && (
        <AddTenantModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); refresh(); }}
        />
      )}
    </div>
  );
}
