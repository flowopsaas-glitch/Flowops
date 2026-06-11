import { useEffect, useState } from 'react';
import { Receipt, Download, RefreshCw, Search, DollarSign, CheckCircle, Clock } from 'lucide-react';
import { api } from '../api/client';
import PageHeader from '@/components/ui/PageHeader';
import PageSkeleton from '@/components/ui/PageSkeleton';
import EmptyState from '@/components/ui/EmptyState';

interface Invoice {
  id: number;
  invoiceNumber: string;
  clientName?: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  dueDate?: string;
}

const statusConfig: Record<string, { bg: string; color: string }> = {
  PAID: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
  SENT: { bg: 'rgba(108,158,255,0.12)', color: '#6C9EFF' },
  PENDING: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
  OVERDUE: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
  DRAFT: { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' },
};

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/invoices/supervisor?t=${Date.now()}`);
      const data = res as any;
      setInvoices(Array.isArray(data) ? data : data?.invoices || []);
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
      setInvoices([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchInvoices(); }, []);

  const filtered = invoices.filter(inv =>
    !search || inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
    inv.clientName?.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = invoices.reduce((s, inv) => s + (inv.totalAmount || 0), 0);
  const paidCount = invoices.filter(i => i.status === 'PAID').length;

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      <PageHeader icon={Receipt} title="Invoices" description={`${invoices.length} invoices • R${totalRevenue.toLocaleString()} total revenue`} color="#FBBF24">
        <button onClick={fetchInvoices} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
          background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
          border: 'none', cursor: 'pointer',
        }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </PageHeader>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3" style={{ marginBottom: '20px' }}>
        <MiniStat label="Total Revenue" value={`R${totalRevenue.toLocaleString()}`} icon={DollarSign} color="#FBBF24" />
        <MiniStat label="Paid" value={String(paidCount)} icon={CheckCircle} color="#4ADE80" />
        <MiniStat label="Outstanding" value={String(invoices.length - paidCount)} icon={Clock} color="#6C9EFF" />
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '20px', maxWidth: '350px' }}>
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices..."
          style={{ width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px', borderRadius: '10px', fontSize: '13px', color: 'white', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
      </div>

      {/* Content */}
      {loading ? (
        <PageSkeleton type="table" rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={search ? "No matching invoices" : "No invoices yet"}
          description={search ? "Try a different search." : "Invoices will appear here once billing batches are processed."}
          actionLabel={!search ? "Go to Billing Batches" : undefined}
          actionPath="/billing/batches"
          color="#FBBF24"
        />
      ) : (
        <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Invoice #', 'Client', 'Amount', 'Status', 'Date', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, i) => {
                const sc = statusConfig[inv.status] || statusConfig.PENDING;
                return (
                  <tr key={inv.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    className="hover:bg-white/[0.02] transition-colors">
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#FBBF24' }}>{inv.invoiceNumber || `INV-${inv.id}`}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.7)' }}>{inv.clientName || '—'}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'white' }}>R{(inv.totalAmount || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: sc.bg, color: sc.color }}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#6C9EFF', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <Download size={12} /> PDF
                      </button>
                    </td>
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
