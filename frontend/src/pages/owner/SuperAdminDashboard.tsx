// frontend/src/pages/owner/SuperAdminDashboard.tsx
import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { 
  Building2, 
  Users, 
  Shield, 
  CreditCard, 
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X
} from 'lucide-react';

interface DashboardStats {
  totalCompanies: number;
  activeCompanies: number;
  inactiveCompanies: number;
  totalUsers: number;
  companyAdmins: number;
  demoTenants: number;
}

interface Subscription {
  id: number;
  name: string;
  plan: string;
  status: string;
  monthlyPrice: number;
  isActive: boolean;
  demoEnabled: boolean;
  demoExpiresAt: string | null;
  _count: { users: number };
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalCompanies: 0,
    activeCompanies: 0,
    inactiveCompanies: 0,
    totalUsers: 0,
    companyAdmins: 0,
    demoTenants: 0,
  });
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'subscriptions' | 'ai-supervisor'>('overview');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Create Tenant Modal State
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [newTenant, setNewTenant] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [creating, setCreating] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccessMsg(null);
      
      // Fetch platform overview
      const overview = await api.get('/companies/platform/overview');
      
      // Fetch companies with subscriptions
      const companies = await api.get('/companies/all-with-subscriptions');
      
      // Calculate stats
      const companyAdmins = companies.filter((c: any) => c._count?.users > 0).length;
      const demoTenants = companies.filter((c: any) => c.demoEnabled).length;
      
      setStats({
        totalCompanies: overview.totalCompanies || 0,
        activeCompanies: overview.activeCompanies || 0,
        inactiveCompanies: overview.inactiveCompanies || 0,
        totalUsers: overview.totalUsers || 0,
        companyAdmins,
        demoTenants,
      });
      
      setSubscriptions(companies);
      setSuccessMsg('Dashboard data loaded successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMsg(null), 3000);
      
    } catch (err: any) {
      console.error('Failed to fetch dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async () => {
    if (!newTenant.name.trim()) {
      alert('Company name is required');
      return;
    }

    try {
      setCreating(true);
      await api.post('/companies', {
        name: newTenant.name,
        email: newTenant.email || undefined,
        phone: newTenant.phone || undefined,
      });
      
      setSuccessMsg('Tenant created successfully!');
      setShowCreateTenant(false);
      setNewTenant({ name: '', email: '', phone: '' });
      fetchDashboardData(); // Refresh data
      
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert('Failed to create tenant: ' + (err.message || 'Unknown error'));
    } finally {
      setCreating(false);
    }
  };

  const handleNavigateToPasswords = () => {
    window.location.href = '/owner/passwords';
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Success/Error Banner */}
        {successMsg && (
          <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm">{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
            <button onClick={fetchDashboardData} className="ml-auto text-xs underline hover:text-red-300">Retry</button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Super Owner Console</h1>
            <p className="text-slate-400 mt-1">Platform-wide oversight and tenant management</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchDashboardData}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-800">
          <TabButton 
            active={activeTab === 'overview'} 
            onClick={() => setActiveTab('overview')}
            icon={TrendingUp}
            label="Overview"
          />
          <TabButton 
            active={activeTab === 'subscriptions'} 
            onClick={() => setActiveTab('subscriptions')}
            icon={CreditCard}
            label="Subscriptions"
          />
          <TabButton 
            active={activeTab === 'ai-supervisor'} 
            onClick={() => setActiveTab('ai-supervisor')}
            icon={Shield}
            label="AI Supervisor"
          />
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard 
                icon={Building2}
                label="Tenant Companies"
                value={stats.totalCompanies}
                subtext="Platform-wide tenant count"
                color="text-cyan-400"
              />
              <StatCard 
                icon={Users}
                label="Platform Users"
                value={stats.totalUsers}
                subtext="All users across the platform"
                color="text-purple-400"
              />
              <StatCard 
                icon={Shield}
                label="Company Admins"
                value={stats.companyAdmins}
                subtext="Operational tenant admins"
                color="text-emerald-400"
              />
              <StatCard 
                icon={CreditCard}
                label="Demo Tenants"
                value={stats.demoTenants}
                subtext="Live demo subscriptions"
                color="text-amber-400"
              />
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <QuickActionsCard 
                onCreateTenant={() => setShowCreateTenant(true)}
                onManagePasswords={handleNavigateToPasswords}
                onViewSubscriptions={() => setActiveTab('subscriptions')}
              />
              <RecentActivityCard subscriptions={subscriptions} />
            </div>
          </div>
        )}

        {/* Subscriptions Tab */}
        {activeTab === 'subscriptions' && (
          <SubscriptionsMonitor subscriptions={subscriptions} />
        )}

        {/* AI Supervisor Tab */}
        {activeTab === 'ai-supervisor' && (
          <AISupervisor subscriptions={subscriptions} />
        )}

      </div>

      {/* Create Tenant Modal */}
      {showCreateTenant && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Create New Tenant</h2>
              <button 
                onClick={() => setShowCreateTenant(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Company Name *</label>
                <input
                  type="text"
                  placeholder="Enter company name"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({...newTenant, name: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition-colors"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Admin Email</label>
                <input
                  type="email"
                  placeholder="admin@company.com"
                  value={newTenant.email}
                  onChange={(e) => setNewTenant({...newTenant, email: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  placeholder="+27 12 345 6789"
                  value={newTenant.phone}
                  onChange={(e) => setNewTenant({...newTenant, phone: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition-colors"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowCreateTenant(false)}
                  disabled={creating}
                  className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTenant}
                  disabled={creating || !newTenant.name.trim()}
                  className="flex-1 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-slate-950 text-sm font-bold transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Tenant'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-Components ──────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
        active 
          ? 'border-cyan-400 text-cyan-400' 
          : 'border-transparent text-slate-400 hover:text-white'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, subtext, color }: any) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-white mt-2">{value}</p>
          <p className="text-sm text-slate-400 mt-1">{subtext}</p>
        </div>
        <div className={`p-3 rounded-lg bg-slate-800 ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

function QuickActionsCard({ onCreateTenant, onManagePasswords, onViewSubscriptions }: any) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
      <div className="space-y-3">
        <button 
          onClick={onCreateTenant}
          className="w-full px-4 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-between group"
        >
          <span>Create Tenant</span>
          <span className="group-hover:translate-x-1 transition-transform">→</span>
        </button>
        
        <button 
          onClick={onManagePasswords}
          className="w-full px-4 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-between group"
        >
          <span>Manage Users & Passwords</span>
          <span className="group-hover:translate-x-1 transition-transform">→</span>
        </button>
        
        <button 
          onClick={onViewSubscriptions}
          className="w-full px-4 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-between group"
        >
          <span>View All Subscriptions</span>
          <span className="group-hover:translate-x-1 transition-transform">→</span>
        </button>
      </div>
    </div>
  );
}

function RecentActivityCard({ subscriptions }: { subscriptions: Subscription[] }) {
  const recentTenants = subscriptions.slice(0, 5);
  
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Recent Tenants</h3>
      <div className="space-y-3">
        {recentTenants.map(tenant => (
          <div key={tenant.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-white">{tenant.name}</p>
              <p className="text-xs text-slate-400">{tenant.plan} • {tenant._count?.users || 0} users</p>
            </div>
            <span className={`px-2 py-1 rounded text-xs ${
              tenant.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
            }`}>
              {tenant.status}
            </span>
          </div>
        ))}
        {recentTenants.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">No tenants yet</p>
        )}
      </div>
    </div>
  );
}

function SubscriptionsMonitor({ subscriptions }: { subscriptions: Subscription[] }) {
  const totalRevenue = subscriptions.reduce((sum, s) => sum + (s.monthlyPrice || 0), 0);
  const activeSubs = subscriptions.filter(s => s.status === 'Active').length;
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          icon={CreditCard}
          label="Total Subscriptions"
          value={subscriptions.length}
          color="text-cyan-400"
        />
        <StatCard 
          icon={CheckCircle2}
          label="Active Subscriptions"
          value={activeSubs}
          color="text-emerald-400"
        />
        <StatCard 
          icon={TrendingUp}
          label="Monthly Revenue"
          value={`ZAR ${totalRevenue.toLocaleString()}`}
          color="text-amber-400"
        />
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-lg font-semibold text-white">All Subscriptions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                {['Company', 'Plan', 'Status', 'Users', 'Monthly Price', 'Demo', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {subscriptions.map(sub => (
                <tr key={sub.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-sm text-white">{sub.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      sub.plan === 'Professional' ? 'bg-purple-500/20 text-purple-400' :
                      sub.plan === 'Starter' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {sub.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      sub.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {sub.status === 'Active' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {sub.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{sub._count?.users || 0}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-300">ZAR {sub.monthlyPrice?.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {sub.demoEnabled ? (
                      <span className="text-xs text-amber-400">Active</span>
                    ) : (
                      <span className="text-xs text-slate-500">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-cyan-400 hover:text-cyan-300">Manage</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AISupervisor({ subscriptions }: { subscriptions: Subscription[] }) {
  // Simulate AI analysis
  const alerts = [
    { type: 'warning', message: '3 tenants approaching demo expiry', count: 3 },
    { type: 'info', message: 'Revenue up 15% this month', count: 0 },
    { type: 'success', message: 'All subscriptions active', count: subscriptions.filter(s => s.status === 'Active').length },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-purple-900/50 to-slate-900/50 border border-purple-500/30 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">AI Supervisor Status</h3>
          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium">
            Active Monitoring
          </span>
        </div>
        <p className="text-slate-300 text-sm">
          AI-powered oversight analyzing subscription health, usage patterns, and billing anomalies in real-time.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {alerts.map((alert, idx) => (
          <div key={idx} className={`p-4 rounded-xl border ${
            alert.type === 'warning' ? 'bg-amber-500/10 border-amber-500/30' :
            alert.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30' :
            'bg-blue-500/10 border-blue-500/30'
          }`}>
            <div className="flex items-center gap-2">
              {alert.type === 'warning' ? <AlertTriangle className="w-5 h-5 text-amber-400" /> :
               alert.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> :
               <TrendingUp className="w-5 h-5 text-blue-400" />}
              <span className={`text-sm font-medium ${
                alert.type === 'warning' ? 'text-amber-400' :
                alert.type === 'success' ? 'text-emerald-400' :
                'text-blue-400'
              }`}>
                {alert.message}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">AI Insights</h3>
        <div className="space-y-3">
          <InsightItem 
            title="Subscription Health"
            description="All active subscriptions are in good standing. No payment failures detected."
            status="healthy"
          />
          <InsightItem 
            title="Demo Conversion Rate"
            description="2 tenants converted from demo to paid plans this month (40% conversion rate)"
            status="positive"
          />
          <InsightItem 
            title="Revenue Forecast"
            description="Projected monthly revenue: ZAR 24,500 (based on current active subscriptions)"
            status="info"
          />
        </div>
      </div>
    </div>
  );
}

function InsightItem({ title, description, status }: any) {
  return (
    <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
      <div className={`w-2 h-2 rounded-full mt-2 ${
        status === 'healthy' ? 'bg-emerald-400' :
        status === 'positive' ? 'bg-blue-400' :
        'bg-amber-400'
      }`} />
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-sm text-slate-400 mt-1">{description}</p>
      </div>
    </div>
  );
}
