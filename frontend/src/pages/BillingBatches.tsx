import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { toast } from 'sonner';
import { FileSpreadsheet, Download, RefreshCw, Plus, CheckCircle, Clock, AlertTriangle, DollarSign } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import PageSkeleton from '@/components/ui/PageSkeleton';
import EmptyState from '@/components/ui/EmptyState';

interface BillingBatch {
  id: string;
  batchNumber: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalInvoices: number;
  totalAmount: number;
  createdAt: string;
  processedAt: string | null;
}

const statusConfig: Record<string, { bg: string; color: string }> = {
  completed: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
  processing: { bg: 'rgba(108,158,255,0.12)', color: '#6C9EFF' },
  pending: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
  failed: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
};

export default function BillingBatches() {
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const data = await api.get('/billing/batches');
      setBatches(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to fetch billing batches:', err);
      toast.error('Failed to load billing batches');
    }
    setLoading(false);
  };

  useEffect(() => { fetchBatches(); }, []);

  const totalRevenue = batches.reduce((s, b) => s + (b.totalAmount || 0), 0);
  const completedCount = batches.filter(b => b.status === 'completed').length;

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      <PageHeader icon={FileSpreadsheet} title="Billing Batches" description="Reconcile and process billing in batches" color="#A78BFA">
        <button onClick={fetchBatches} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ marginBottom: '20px' }}>
        <MiniStat label="Total Batches" value={String(batches.length)} icon={FileSpreadsheet} color="#A78BFA" />
        <MiniStat label="Revenue" value={`R${totalRevenue.toLocaleString()}`} icon={DollarSign} color="#FBBF24" />
        <MiniStat label="Completed" value={String(completedCount)} icon={CheckCircle} color="#4ADE80" />
        <MiniStat label="Pending" value={String(batches.filter(b => b.status === 'pending').length)} icon={Clock} color="#6C9EFF" />
      </div>

      {loading ? (
        <PageSkeleton type="table" rows={5} />
      ) : batches.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No billing batches" description="Billing batches will appear here once waybills are delivered and ready for invoicing." color="#A78BFA" />
      ) : (
        <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Batch #', 'Status', 'Invoices', 'Amount', 'Created', 'Processed'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((b, i) => {
                const sc = statusConfig[b.status] || statusConfig.pending;
                return (
                  <tr key={b.id} style={{ borderBottom: i < batches.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }} className="hover:bg-white/[0.02] transition-colors">
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#A78BFA' }}>{b.batchNumber || `BATCH-${b.id}`}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: sc.bg, color: sc.color, textTransform: 'uppercase' }}>{b.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'white' }}>{b.totalInvoices || 0}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'white' }}>R{(b.totalAmount || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{b.processedAt ? new Date(b.processedAt).toLocaleDateString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div style={{ borderRadius: '10px', padding: '14px 16px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}12` }}>
        <Icon size={15} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{value}</div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{label}</div>
      </div>
    </div>
  );
}
