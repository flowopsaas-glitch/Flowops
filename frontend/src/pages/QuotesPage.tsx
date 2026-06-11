import { useEffect, useState } from 'react';
import { ScrollText, Search, RefreshCw, Plus, DollarSign, CheckCircle, Clock } from 'lucide-react';
import { apiGet } from '../api/client';
import PageHeader from '@/components/ui/PageHeader';
import PageSkeleton from '@/components/ui/PageSkeleton';
import EmptyState from '@/components/ui/EmptyState';

interface Quote {
  id: string | number;
  title: string;
  clientName: string;
  total: number;
  verdict: string;
  createdAt?: string;
}

const verdictConfig: Record<string, { bg: string; color: string }> = {
  APPROVED: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
  ACCEPTED: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
  PENDING: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
  DRAFT: { bg: 'rgba(108,158,255,0.12)', color: '#6C9EFF' },
  REJECTED: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
  EXPIRED: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
};

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const data = await apiGet<any>('/quotes');
      const list = Array.isArray(data) ? data : (data?.items || data?.data || []);
      setQuotes(list.map((item: any) => ({
        id: item?.id ?? crypto.randomUUID(),
        title: String(item?.title ?? 'Untitled').trim(),
        clientName: String(item?.clientName ?? 'Unknown Client').trim(),
        total: Number(item?.total ?? 0),
        verdict: String(item?.verdict ?? 'DRAFT').toUpperCase(),
        createdAt: item?.createdAt,
      })));
    } catch (err) {
      console.error('Failed to fetch quotes:', err);
      setQuotes([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchQuotes(); }, []);

  const filtered = quotes.filter(q =>
    !search || q.title.toLowerCase().includes(search.toLowerCase()) || q.clientName.toLowerCase().includes(search.toLowerCase())
  );

  const totalValue = quotes.reduce((s, q) => s + q.total, 0);

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      <PageHeader icon={ScrollText} title="Quotes" description={`${quotes.length} quotes • R${totalValue.toLocaleString()} total value`} color="#22D3EE">
        <button onClick={fetchQuotes} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>
          <RefreshCw size={13} />
        </button>
      </PageHeader>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '20px', maxWidth: '400px' }}>
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quotes by title or client..."
          style={{ width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px', borderRadius: '10px', fontSize: '13px', color: 'white', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
      </div>

      {loading ? (
        <PageSkeleton type="table" rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ScrollText} title={search ? "No matching quotes" : "No quotes yet"} description={search ? "Try a different search." : "Create quotes to send pricing proposals to your clients."} color="#22D3EE" />
      ) : (
        <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Quote', 'Client', 'Amount', 'Status', 'Date'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, i) => {
                const vc = verdictConfig[q.verdict] || verdictConfig.DRAFT;
                return (
                  <tr key={q.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }} className="hover:bg-white/[0.02] transition-colors">
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'white' }}>{q.title}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)' }}>{q.clientName}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'white' }}>R{q.total.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: vc.bg, color: vc.color }}>{q.verdict}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{q.createdAt ? new Date(q.createdAt).toLocaleDateString() : '—'}</td>
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
