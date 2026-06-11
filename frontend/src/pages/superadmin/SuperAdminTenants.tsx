import { useState, useEffect } from 'react';
import { Search, Plus, RefreshCw, Filter } from 'lucide-react';
import Sidebar from '@/components/supertenant/Sidebar';
import TopBar from '@/components/supertenant/TopBar';
import TenantTable from '@/components/supertenant/TenantTable';
import AddTenantModal from '@/components/supertenant/AddTenantModal';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export default function SuperAdminTenants() {
  const [user, setUser] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadData = async () => {
    setLoading(true);
    const token = localStorage.getItem('access_token');
    try {
      const [userRes, tenantsRes] = await Promise.all([
        fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/companies`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (userRes.ok) setUser(await userRes.json());
      if (tenantsRes.ok) {
        const data = await tenantsRes.json();
        setTenants(Array.isArray(data) ? data : []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Filtering
  const filtered = tenants.filter(t => {
    const matchSearch = t.name?.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === 'all' || (t.plan || 'STARTER').toUpperCase() === planFilter.toUpperCase();
    const matchStatus = statusFilter === 'all' || (t.status || 'Active') === statusFilter;
    return matchSearch && matchPlan && matchStatus;
  });

  const activeCount = tenants.filter(t => t.status === 'Active' || !t.status).length;
  const pendingCount = tenants.filter(t => t.status === 'Pending').length;
  const suspendedCount = tenants.filter(t => t.status === 'Suspended').length;

  return (
    <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
      <Sidebar />
      <TopBar user={user} />
      <main className="pl-[175px] pt-14">
        <div className="p-6 space-y-6 max-w-[1400px]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Tenants</h1>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Manage all tenants on the platform</p>
            </div>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#6C9EFF,#A78BFA)' }}>
              <Plus size={16} /> Add Tenant
            </button>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search tenants..."
                className="w-full pl-11 pr-4 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }} />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
              <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <option value="all" style={{ background: '#0f1629' }}>All Plans</option>
                <option value="STARTER" style={{ background: '#0f1629' }}>Starter</option>
                <option value="PRO" style={{ background: '#0f1629' }}>Pro</option>
                <option value="ENTERPRISE" style={{ background: '#0f1629' }}>Enterprise</option>
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <option value="all" style={{ background: '#0f1629' }}>All Status</option>
                <option value="Active" style={{ background: '#0f1629' }}>Active</option>
                <option value="Pending" style={{ background: '#0f1629' }}>Pending</option>
                <option value="Suspended" style={{ background: '#0f1629' }}>Suspended</option>
              </select>
              <button onClick={loadData} disabled={loading}
                className="p-2.5 rounded-xl transition-all hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <RefreshCw size={14} className={`text-white/60 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Status tabs */}
          <div className="flex gap-3">
            {[
              { label: 'Total', count: tenants.length, active: statusFilter === 'all' },
              { label: 'Active', count: activeCount, active: statusFilter === 'Active' },
              { label: 'Pending', count: pendingCount, active: statusFilter === 'Pending' },
              { label: 'Suspended', count: suspendedCount, active: statusFilter === 'Suspended' },
            ].map(tab => (
              <button key={tab.label}
                onClick={() => setStatusFilter(tab.active ? 'all' : tab.label === 'Total' ? 'all' : tab.label)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: tab.active ? 'rgba(108,158,255,0.15)' : 'rgba(255,255,255,0.04)',
                  color: tab.active ? '#6C9EFF' : 'rgba(255,255,255,0.5)',
                  border: `1px solid ${tab.active ? 'rgba(108,158,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                {tab.label}: <span className="font-bold">{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Tenant Table */}
          <TenantTable tenants={filtered} onRefresh={loadData} />
        </div>
      </main>

      {showAddModal && (
        <AddTenantModal onClose={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); loadData(); }} />
      )}
    </div>
  );
}
