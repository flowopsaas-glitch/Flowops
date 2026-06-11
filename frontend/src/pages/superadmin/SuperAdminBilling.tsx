import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import Sidebar from '@/components/supertenant/Sidebar';
import TopBar from '@/components/supertenant/TopBar';
import StatCard from '@/components/supertenant/StatCard';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export default function SuperAdminBilling() {
  const [user, setUser] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
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
    load();
  }, []);

  const totalMRR = tenants.reduce((s, t) => s + (t.monthlyRevenue || 0), 0);
  const activeRevenue = tenants.filter(t => t.billingStatus === 'Active').reduce((s, t) => s + (t.monthlyRevenue || 0), 0);
  const pendingInvoices = tenants.filter(t => t.billingStatus === 'Pending' || !t.billingStatus).length;
  const paidTenants = tenants.filter(t => t.billingStatus === 'Active').length;

  // Revenue by plan
  const planRevenue = {
    STARTER: { total: 0, count: 0 },
    PRO: { total: 0, count: 0 },
    ENTERPRISE: { total: 0, count: 0 },
  };
  tenants.forEach(t => {
    const plan = (t.plan || 'STARTER').toUpperCase();
    if (planRevenue[plan as keyof typeof planRevenue]) {
      planRevenue[plan as keyof typeof planRevenue].total += t.monthlyRevenue || 0;
      planRevenue[plan as keyof typeof planRevenue].count += 1;
    }
  });

  const handleToggleBilling = async (tenant: any) => {
    const token = localStorage.getItem('access_token');
    const newStatus = tenant.billingStatus === 'Active' ? 'Pending' : 'Active';
    try {
      await fetch(`${API_BASE}/companies/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ billingStatus: newStatus }),
      });
      setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, billingStatus: newStatus } : t));
    } catch (e) { console.error(e); }
  };

  const stats = [
    { title: 'Total MRR', value: `R${totalMRR.toLocaleString()}`, icon: DollarSign, iconBg: 'rgba(251,191,36,0.15)', iconColor: '#FBBF24', progress: 85, progressColor: 'linear-gradient(90deg,#FBBF24,#F59E0B)', label: 'Total MRR', trend: null },
    { title: 'Active Revenue', value: `R${activeRevenue.toLocaleString()}`, icon: TrendingUp, iconBg: 'rgba(74,222,128,0.15)', iconColor: '#4ADE80', progress: 60, progressColor: 'linear-gradient(90deg,#4ADE80,#22D3EE)', label: 'Active Revenue', trend: null },
    { title: 'Pending Invoices', value: pendingInvoices, icon: AlertTriangle, iconBg: 'rgba(248,113,113,0.15)', iconColor: '#F87171', progress: 30, progressColor: 'linear-gradient(90deg,#F87171,#FBBF24)', label: 'Pending Invoices', trend: null },
    { title: 'Paid Tenants', value: paidTenants, icon: CheckCircle, iconBg: 'rgba(74,222,128,0.15)', iconColor: '#4ADE80', progress: tenants.length ? (paidTenants / tenants.length) * 100 : 0, progressColor: 'linear-gradient(90deg,#4ADE80,#22D3EE)', label: 'Paid Tenants', trend: null },
  ];

  const planColors: Record<string, string> = { STARTER: '#4ADE80', PRO: '#6C9EFF', ENTERPRISE: '#A78BFA' };

  return (
    <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
      <Sidebar />
      <TopBar user={user} />
      <main className="pl-[175px] pt-14">
        <div className="p-6 space-y-6 max-w-[1400px]">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-white">Billing</h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Monitor revenue and billing status across all tenants</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map(s => <StatCard key={s.title} {...s} />)}
          </div>

          {/* Revenue by Plan */}
          <div className="rounded-xl p-5" style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <h3 className="text-sm font-bold text-white mb-4">Revenue by Plan</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['STARTER', 'PRO', 'ENTERPRISE'] as const).map(plan => (
                <div key={plan} className="rounded-xl p-5 text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-xs font-bold mb-2" style={{ color: planColors[plan] }}>{plan}</div>
                  <div className="text-2xl font-bold text-white">R{planRevenue[plan].total.toLocaleString()}</div>
                  <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{planRevenue[plan].count} tenants</div>
                </div>
              ))}
            </div>
          </div>

          {/* Billing Records Table */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <div className="px-5 py-4"><h3 className="text-sm font-bold text-white">Billing Records</h3></div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Tenant', 'Plan', 'Monthly Revenue', 'Billing Status', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenants.map((t, i) => {
                  const billingStatus = t.billingStatus || 'Pending';
                  return (
                    <tr key={t.id} style={{ borderBottom: i < tenants.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <td className="px-5 py-3 font-medium text-white">{t.name}</td>
                      <td className="px-5 py-3">
                        <span className="text-xs font-bold" style={{ color: planColors[(t.plan || 'STARTER').toUpperCase()] || '#6C9EFF' }}>
                          {t.plan || 'Starter'}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-white">R{(t.monthlyRevenue || 0).toLocaleString()}</td>
                      <td className="px-5 py-3">
                        <span className="text-xs font-medium px-2 py-0.5 rounded"
                          style={{
                            background: billingStatus === 'Active' ? 'rgba(74,222,128,0.12)' : 'rgba(251,191,36,0.12)',
                            color: billingStatus === 'Active' ? '#4ADE80' : '#FBBF24',
                          }}>
                          {billingStatus}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => handleToggleBilling(t)}
                          className="text-xs font-medium px-3 py-1.5 rounded transition-all"
                          style={{
                            background: billingStatus === 'Active' ? 'rgba(251,191,36,0.15)' : 'rgba(74,222,128,0.15)',
                            color: billingStatus === 'Active' ? '#FBBF24' : '#4ADE80',
                            border: `1px solid ${billingStatus === 'Active' ? 'rgba(251,191,36,0.3)' : 'rgba(74,222,128,0.3)'}`,
                          }}>
                          {billingStatus === 'Active' ? 'Set Pending' : 'Mark Paid'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {tenants.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>No billing data available</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
