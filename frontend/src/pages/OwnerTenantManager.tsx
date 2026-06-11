// frontend/src/pages/OwnerTenantManager.tsx
import React, { useState, useEffect } from 'react';
import { get, post, patch } from '../api/client';
import { toast } from 'sonner';
import { 
  Building2, UserPlus, Key, CreditCard, RefreshCw,
  CheckCircle2, XCircle, Calendar, DollarSign, Lock,
  Search, Filter, MoreVertical
} from 'lucide-react';

interface Company {
  id: number;
  name: string;
  status: string;
  plan: string;
  isActive: boolean;
  monthlyPrice: number;
  baseTierPrice: number;
  perUserPrice: number;
  pricePerWhatsapp: number;
  pricePerEmail: number;
  demoEnabled: boolean;
  demoExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number };
}

export default function OwnerTenantManager() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState<string>('all');
  
  // Modal states
  const [showCreateUser, setShowCreateUser] = useState<number | null>(null);
  const [showUpdatePlan, setShowUpdatePlan] = useState<number | null>(null);
  const [showResetPassword, setShowResetPassword] = useState<{id: number, email: string} | null>(null);
  const [formData, setFormData] = useState<any>({});

  const fetchCompanies = async () => {
    try {
      const data = await get<Company[]>('/companies/all-with-subscriptions');
      // Filter out the debug proof object if present
      const realCompanies = data.filter((c: any) => c.id !== 999999);
      setCompanies(realCompanies);
    } catch (err: any) {
      console.error('Failed to fetch companies:', err);
      toast.error('Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCreateUser = async (companyId: number) => {
    try {
      await post('/users/my-company', {
        ...formData,
        companyId,
      });
      toast.success('User created successfully');
      setShowCreateUser(null);
      setFormData({});
      fetchCompanies(); // Refresh to show updated user count
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    }
  };

  const handleResetPassword = async (userId: number, email: string) => {
    if (!formData.newPassword) {
      toast.error('Please enter a new password');
      return;
    }
    if (formData.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      await post(`/users/${userId}/reset-password`, {
        newPassword: formData.newPassword
      });
      toast.success(`Password updated for ${email}`);
      setShowResetPassword(null);
      setFormData({});
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password');
    }
  };

  const handleUpdateSubscription = async (companyId: number) => {
    try {
      await patch(`/companies/${companyId}/subscription`, {
        plan: formData.plan,
        status: formData.status,
        monthlyPrice: parseFloat(formData.monthlyPrice) || 0,
        demoEnabled: formData.demoEnabled || false,
        demoExpiresAt: formData.demoExpiresAt || null,
      });
      toast.success('Subscription updated successfully');
      setShowUpdatePlan(null);
      setFormData({});
      fetchCompanies();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update subscription');
    }
  };

  const filteredCompanies = companies.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlan = filterPlan === 'all' || c.plan === filterPlan;
    return matchesSearch && matchesPlan;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-spin w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Building2 className="w-7 h-7 text-cyan-400" />
              Owner Tenant Manager
            </h1>
            <p className="text-slate-400 mt-1 text-sm">
              Manage tenant companies, users, and subscriptions
            </p>
          </div>
          <button
            onClick={fetchCompanies}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard 
            icon={Building2} 
            label="Total Tenants" 
            value={companies.length} 
            color="text-cyan-400" 
          />
          <StatCard 
            icon={CheckCircle2} 
            label="Active" 
            value={companies.filter(c => c.isActive).length} 
            color="text-emerald-400" 
          />
          <StatCard 
            icon={CreditCard} 
            label="Paid Plans" 
            value={companies.filter(c => c.plan !== 'FREE').length} 
            color="text-purple-400" 
          />
          <StatCard 
            icon={DollarSign} 
            label="Monthly Revenue" 
            value={`ZAR ${companies.reduce((sum, c) => sum + (c.monthlyPrice || 0), 0).toFixed(2)}`} 
            color="text-amber-400" 
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search companies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">All Plans</option>
              <option value="FREE">Free</option>
              <option value="Starter">Starter</option>
              <option value="Professional">Professional</option>
              <option value="Enterprise">Enterprise</option>
            </select>
          </div>
        </div>

        {/* Companies Table */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  {['Company', 'Plan', 'Status', 'Users', 'Price/Mo', 'Demo', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredCompanies.length > 0 ? filteredCompanies.map((company) => (
                  <tr key={company.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-white">{company.name}</div>
                      <div className="text-xs text-slate-500">
                        Created {new Date(company.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        company.plan === 'Starter' ? 'bg-blue-500/20 text-blue-400' :
                        company.plan === 'Professional' ? 'bg-purple-500/20 text-purple-400' :
                        company.plan === 'Enterprise' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {company.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                        company.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {company.status === 'Active' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {company.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {company._count?.users || 0}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-300">
                      ZAR {company.monthlyPrice?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-4 py-3">
                      {company.demoEnabled ? (
                        <span className="text-xs text-amber-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {company.demoExpiresAt ? new Date(company.demoExpiresAt).toLocaleDateString() : 'No expiry'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setShowCreateUser(company.id);
                            setFormData({ companyId: company.id, role: 'ADMIN' });
                          }}
                          title="Add User"
                          className="p-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded transition-colors"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setShowUpdatePlan(company.id);
                            setFormData({
                              plan: company.plan,
                              status: company.status,
                              monthlyPrice: company.monthlyPrice,
                              demoEnabled: company.demoEnabled,
                              demoExpiresAt: company.demoExpiresAt?.split('T')[0],
                            });
                          }}
                          title="Update Plan"
                          className="p-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded transition-colors"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setShowResetPassword({ id: company.id, email: `admin@${company.name.toLowerCase().replace(/\s+/g, '')}.flowops.com` })}
                          title="Reset Password"
                          className="p-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded transition-colors"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      No companies found matching your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create User Modal */}
        {showCreateUser && (
          <Modal title="Create Tenant User" onClose={() => setShowCreateUser(null)}>
            <div className="space-y-4">
              <Input
                label="Email"
                type="email"
                value={formData.email || ''}
                onChange={(e: any) => setFormData({...formData, email: e.target.value})}
                placeholder="user@company.com"
                required
              />
              <Input
                label="Password"
                type="password"
                value={formData.password || ''}
                onChange={(e: any) => setFormData({...formData, password: e.target.value})}
                placeholder="••••••••"
                required
              />
              <Input
                label="Full Name"
                value={formData.name || ''}
                onChange={(e: any) => setFormData({...formData, name: e.target.value})}
                placeholder="John Doe"
                required
              />
              <Select
                label="Role"
                value={formData.role || 'ADMIN'}
                onChange={(e: any) => setFormData({...formData, role: e.target.value})}
                options={[
                  { value: 'ADMIN', label: 'Admin' },
                  { value: 'OPERATOR', label: 'Operator' },
                  { value: 'VIEWER', label: 'Viewer' },
                ]}
              />
              <button
                onClick={() => handleCreateUser(showCreateUser)}
                className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold rounded-lg transition-colors"
              >
                Create User
              </button>
            </div>
          </Modal>
        )}

        {/* Reset Password Modal */}
        {showResetPassword && (
          <Modal title={`Reset Password: ${showResetPassword.email}`} onClose={() => setShowResetPassword(null)}>
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Enter a new password for <span className="text-white font-medium">{showResetPassword.email}</span>
              </p>
              <Input
                label="New Password"
                type="password"
                value={formData.newPassword || ''}
                onChange={(e: any) => setFormData({...formData, newPassword: e.target.value})}
                placeholder="••••••••"
                required
              />
              <p className="text-xs text-slate-500">
                Password must be at least 6 characters
              </p>
              <button
                onClick={() => handleResetPassword(showResetPassword.id, showResetPassword.email)}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Reset Password
              </button>
            </div>
          </Modal>
        )}

        {/* Update Subscription Modal */}
        {showUpdatePlan && (
          <Modal title="Update Subscription" onClose={() => setShowUpdatePlan(null)}>
            <div className="space-y-4">
              <Select
                label="Plan"
                value={formData.plan || 'Starter'}
                onChange={(e: any) => setFormData({...formData, plan: e.target.value})}
                options={[
                  { value: 'FREE', label: 'Free (ZAR 0/mo)' },
                  { value: 'Starter', label: 'Starter (ZAR 1,500/mo)' },
                  { value: 'Professional', label: 'Professional (ZAR 8,000/mo)' },
                  { value: 'Enterprise', label: 'Enterprise (ZAR 17,000/mo)' },
                ]}
              />
              <Select
                label="Status"
                value={formData.status || 'Active'}
                onChange={(e: any) => setFormData({...formData, status: e.target.value})}
                options={[
                  { value: 'Active', label: 'Active' },
                  { value: 'Inactive', label: 'Inactive' },
                  { value: 'Suspended', label: 'Suspended' },
                ]}
              />
              <Input
                label="Monthly Price (ZAR)"
                type="number"
                value={formData.monthlyPrice || 0}
                onChange={(e: any) => setFormData({...formData, monthlyPrice: e.target.value})}
                min="0"
                step="0.01"
              />
              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="demoEnabled"
                  checked={formData.demoEnabled || false}
                  onChange={(e: any) => setFormData({...formData, demoEnabled: e.target.checked})}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                />
                <label htmlFor="demoEnabled" className="text-sm text-slate-300">Demo Mode Enabled</label>
              </div>
              {formData.demoEnabled && (
                <Input
                  label="Demo Expires On"
                  type="date"
                  value={formData.demoExpiresAt || ''}
                  onChange={(e: any) => setFormData({...formData, demoExpiresAt: e.target.value})}
                />
              )}
              <button
                onClick={() => handleUpdateSubscription(showUpdatePlan)}
                className="w-full py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-colors"
              >
                Update Subscription
              </button>
            </div>
          </Modal>
        )}

      </div>
    </div>
  );
}

// ── Helper Components ──────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color.replace('text-', 'bg-')}/10`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
          <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, ...props }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-400 mb-1.5">{label}</label>
      <input
        {...props}
        className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition-colors"
      />
    </div>
  );
}

function Select({ label, options, ...props }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-400 mb-1.5">{label}</label>
      <select
        {...props}
        className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition-colors"
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
