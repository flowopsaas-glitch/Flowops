import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, DollarSign, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import PageHeader from '@/components/ui/PageHeader';
import PageSkeleton from '@/components/ui/PageSkeleton';
import EmptyState from '@/components/ui/EmptyState';

function money(v: number) {
  return `R${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoiceDrafts() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDrafts = async () => {
      try {
        const res = await api.get('/invoice-drafts') as any;
        const data = Array.isArray(res) ? res : (res?.data || []);
        setDrafts(data);
      } catch (err) { console.error("Failed to fetch drafts", err); }
      setLoading(false);
    };
    fetchDrafts();
  }, []);

  const stats = {
    totalValue: drafts.reduce((sum, d) => sum + (Number(d.total) || 0), 0),
    draftCount: drafts.filter(d => d.status === 'DRAFT').length,
    sentCount: drafts.filter(d => d.status === 'SENT' || d.status === 'FINALIZED').length,
  };

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      <PageHeader icon={FileText} title="Invoice Drafts" description={`${drafts.length} drafts • ${money(stats.totalValue)} total value`} color="#6C9EFF" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3" style={{ marginBottom: '20px' }}>
        <MiniStat label="Total Value" value={money(stats.totalValue)} icon={DollarSign} color="#FBBF24" />
        <MiniStat label="Drafts" value={String(stats.draftCount)} icon={Clock} color="#6C9EFF" />
        <MiniStat label="Sent/Finalized" value={String(stats.sentCount)} icon={CheckCircle} color="#4ADE80" />
      </div>

      {loading ? (
        <PageSkeleton type="list" rows={4} />
      ) : drafts.length === 0 ? (
        <EmptyState icon={FileText} title="No invoice drafts" description="Invoice drafts are created from billing batches. Process a batch to generate drafts." actionLabel="Go to Billing Batches" actionPath="/billing/batches" color="#6C9EFF" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {drafts.map(draft => (
            <div key={draft.id} onClick={() => navigate(`/invoice-drafts/${draft.id}`)}
              style={{
                borderRadius: '12px', padding: '16px 20px', cursor: 'pointer',
                background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'all 0.15s',
              }}
              className="hover:bg-white/[0.03]">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(108,158,255,0.12)' }}>
                  <FileText size={16} color="#6C9EFF" />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>{draft.clientName || `Draft #${draft.id}`}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                    {draft.lineCount || 0} line items • {draft.createdAt ? new Date(draft.createdAt).toLocaleDateString() : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'white' }}>{money(draft.total)}</span>
                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px',
                  background: draft.status === 'DRAFT' ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.12)',
                  color: draft.status === 'DRAFT' ? '#FBBF24' : '#4ADE80',
                }}>
                  {draft.status || 'DRAFT'}
                </span>
                <ArrowRight size={14} color="rgba(255,255,255,0.25)" />
              </div>
            </div>
          ))}
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
