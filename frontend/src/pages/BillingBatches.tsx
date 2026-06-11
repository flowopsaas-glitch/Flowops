// frontend/src/pages/BillingBatches.tsx
import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { toast } from 'sonner';
import { FileText, Download, RefreshCw, AlertCircle } from 'lucide-react';

interface BillingBatch {
  id: string;
  batchNumber: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalInvoices: number;
  totalAmount: number;
  createdAt: string;
  processedAt: string | null;
}

export default function BillingBatches() {
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get('/billing/batches');
      setBatches(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to fetch billing batches:', err);
      setError(err.message || 'Failed to load billing batches');
      toast.error('Failed to load billing batches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const handleRefresh = () => {
    fetchBatches();
  };

  const handleExport = () => {
    const csv = [
      ['Batch Number', 'Status', 'Total Invoices', 'Total Amount', 'Created At'].join(','),
      ...batches.map(b => 
        [b.batchNumber, b.status, b.totalInvoices, b.totalAmount, b.createdAt].join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-batches-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported billing batches');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading billing batches...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center bg-red-500/10 border border-red-500/30 p-6 rounded-xl">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-400 mb-2">Failed to Load</h2>
          <p className="text-slate-400 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <FileText className="w-8 h-8 text-cyan-400" />
            Billing Batches
          </h1>
          <p className="text-slate-400 mt-1">Invoice batch processing and reconciliation</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={batches.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-slate-950 font-bold transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard 
          label="Total Batches" 
          value={batches.length} 
          color="text-cyan-400" 
        />
        <StatCard 
          label="Completed" 
          value={batches.filter(b => b.status === 'completed').length} 
          color="text-emerald-400" 
        />
        <StatCard 
          label="Processing" 
          value={batches.filter(b => b.status === 'processing').length} 
          color="text-amber-400" 
        />
        <StatCard 
          label="Total Invoices" 
          value={batches.reduce((sum, b) => sum + b.totalInvoices, 0)} 
          color="text-purple-400" 
        />
      </div>

      {/* Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {batches.length > 0 ? (
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  {['Batch Number', 'Status', 'Total Invoices', 'Total Amount', 'Created', 'Processed'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-white">{batch.batchNumber}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        batch.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                        batch.status === 'processing' ? 'bg-amber-500/20 text-amber-400' :
                        batch.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{batch.totalInvoices}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-300">
                      ZAR {batch.totalAmount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(batch.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {batch.processedAt ? new Date(batch.processedAt).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No billing batches found</p>
              <button
                onClick={handleRefresh}
                className="mt-2 text-cyan-400 hover:text-cyan-300 text-sm font-medium"
              >
                Refresh to load data
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper Components ──────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
