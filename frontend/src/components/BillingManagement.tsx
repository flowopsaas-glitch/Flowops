// frontend/src/components/BillingManagement.tsx
import React, { useState, useEffect } from 'react';
import { api, get } from '../api/client';
import { toast } from 'sonner';
import { Receipt, RefreshCw, Download, AlertCircle, Building2 } from 'lucide-react';

// Type matching your backend Company model
export interface Company {
  id: number;
  name: string;
  status: string;
  plan: string;
  isActive: boolean;
  baseTierPrice: number;
  perUserPrice: number;
  pricePerWhatsapp: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

export default function BillingManagement() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCompanies = async () => {
    try {
      // Uses your api client with automatic JWT handling!
      const data = await get<Company[]>('/companies');
      // Filter out the debug proof object if present
      const realCompanies = data.filter(c => c.id !== 999999);
      setCompanies(realCompanies);
      toast.success(`Loaded ${realCompanies.length} companies`);
    } catch (err: any) {
      console.error('Failed to fetch companies:', err);
      setError(err.message || 'Failed to load companies');
      toast.error('Could not load company data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCompanies();
  };

  const handleExport = () => {
    const csv = [
      ['ID', 'Name', 'Status', 'Plan', 'Active', 'Created'].join(','),
      ...companies.map(c => 
        [c.id, c.name, c.status, c.plan, c.isActive, new Date(c.createdAt).toLocaleDateString()].join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `companies-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported companies.csv');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-10 h-10 border-4 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm">Loading companies...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-6 bg-red-500/10 border border-red-500/30 rounded-2xl">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-red-400 font-medium">{error}</p>
        <button 
          onClick={handleRefresh}
          className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-cyan-400" />
            Companies
          </h1>
          <p className="text-slate-400 text-sm">Manage your tenant companies</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={handleExport}
            disabled={companies.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-slate-950 text-sm font-bold transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total" value={companies.length} color="text-cyan-400" />
        <StatCard 
          label="Active" 
          value={companies.filter(c => c.isActive).length} 
          color="text-emerald-400" 
        />
        <StatCard 
          label="Starter" 
          value={companies.filter(c => c.plan === 'Starter').length} 
          color="text-blue-400" 
        />
        <StatCard 
          label="Free" 
          value={companies.filter(c => c.plan === 'FREE').length} 
          color="text-purple-400" 
        />
      </div>

      {/* Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/50">
                {['ID', 'Name', 'Status', 'Plan', 'Active', 'Created'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {companies.length > 0 ? companies.map((company) => (
                <tr key={company.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-slate-300">{company.id}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-white">{company.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                      company.status === 'Active' 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : 'bg-slate-700 text-slate-400'
                    }`}>
                      {company.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{company.plan}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex w-2 h-2 rounded-full ${
                      company.isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-slate-600'
                    }`} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 font-mono">
                    {new Date(company.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Receipt className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                    <p className="text-slate-500 text-sm">No companies found</p>
                    <button 
                      onClick={handleRefresh}
                      className="mt-2 text-cyan-400 hover:text-cyan-300 text-sm font-medium"
                    >
                      Refresh to load data
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Simple stat card component
function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
