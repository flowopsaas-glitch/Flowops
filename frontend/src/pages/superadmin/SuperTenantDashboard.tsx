import { useState } from 'react';
import { Building2, Users, DollarSign, Activity, Zap, AlertTriangle, Radio } from 'lucide-react';
import SuperAdminLayout from '@/components/supertenant/SuperAdminLayout';
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
    { title: 'Active Tenants', value: s?.activeTenants ?? '—', icon: Building2, iconBg: 'rgba(108,158,255,0.15)', iconColor: '#6C9EFF', progress: s ? (s.activeTenants / Math.max(s.totalTenants, 1)) * 100 : 0, progressColor: 'linear-gradient(90deg,#6C9EFF,#A78BFA)', label: 'Active Tenants', trend: null },
    { title: 'Total Users', value: s?.totalUsers ?? '—', icon: Users, iconBg: 'rgba(167,139,250,0.15)', iconColor: '#A78BFA', progress: 72, progressColor: 'linear-gradient(90deg,#A78BFA,#6C9EFF)', label: 'Total Users', trend: '+22%' },
    { title: 'Monthly Revenue', value: s?.monthlyRevenue != null ? `R${s.monthlyRevenue.toLocaleString()}` : 'R0', icon: DollarSign, iconBg: 'rgba(251,191,36,0.15)', iconColor: '#FBBF24', progress: 85, progressColor: 'linear-gradient(90deg,#FBBF24,#F59E0B)', label: 'Monthly Revenue', trend: '+5%' },
    { title: 'System Health', value: `${s?.systemHealth ?? 99}%`, icon: Activity, iconBg: 'rgba(74,222,128,0.15)', iconColor: '#4ADE80', progress: s?.systemHealth ?? 99, progressColor: 'linear-gradient(90deg,#4ADE80,#22D3EE)', label: 'System Health', trend: null },
  ];

  const stats2 = [
    { title: 'Dispatches Today', value: s?.dispatchesToday ?? 0, icon: Zap, iconBg: 'rgba(108,158,255,0.15)', iconColor: '#6C9EFF', progress: 38, progressColor: 'linear-gradient(90deg,#6C9EFF,#A78BFA)', label: 'Dispatches Today', trend: null },
    { title: 'Pending Issues', value: s?.pendingIssues ?? 0, icon: AlertTriangle, iconBg: 'rgba(251,191,36,0.15)', iconColor: '#FBBF24', progress: 45, progressColor: 'linear-gradient(90deg,#FBBF24,#F59E0B)', label: 'Pending Issues', trend: null },
    { title: 'Uptime', value: `${s?.uptime ?? 100}%`, icon: Radio, iconBg: 'rgba(74,222,128,0.15)', iconColor: '#4ADE80', progress: s?.uptime ?? 100, progressColor: 'linear-gradient(90deg,#4ADE80,#22D3EE)', label: 'Uptime', trend: null },
  ];

  return (
    <SuperAdminLayout onRefresh={refresh} loading={loading}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Loading platform data...</div>
        )}

        {/* Stats Row 1 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats1.map(s => <StatCard key={s.title} {...s} />)}
        </div>

        {/* Stats Row 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats2.map(s => <StatCard key={s.title} {...s} />)}
        </div>

        {/* Charts */}
        <PerformanceCharts />

        {/* Tenant Table */}
        <TenantTable tenants={tenants} onRefresh={refresh} />

        {/* Quick Actions */}
        <QuickActions onAddTenant={() => setShowAddModal(true)} />
      </div>

      {showAddModal && (
        <AddTenantModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); refresh(); }}
        />
      )}
    </SuperAdminLayout>
  );
}
