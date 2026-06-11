import { useEffect, useState } from 'react';
import { MessageCircleQuestion, Search, Clock, CheckCircle, AlertTriangle, RefreshCw, Receipt, ClipboardCheck, Mail } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import PageSkeleton from '@/components/ui/PageSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import { getEmailHubItems, resolveEmailHubItem, markEmailHubRead, EmailHubItem } from '@/api/emailHubApi';

const categoryConfig: Record<string, { label: string; color: string; icon: any }> = {
  FEEDBACK: { label: 'Feedback', color: '#FBBF24', icon: MessageCircleQuestion },
  QUOTE: { label: 'Quote Query', color: '#A78BFA', icon: Receipt },
  POD: { label: 'POD Dispute', color: '#4ADE80', icon: ClipboardCheck },
  COLLECTION_REQUEST: { label: 'Collection', color: '#22D3EE', icon: Mail },
  GENERAL: { label: 'General', color: '#6C9EFF', icon: MessageCircleQuestion },
};

const statusConfig: Record<string, { bg: string; color: string }> = {
  NEW: { bg: 'rgba(108,158,255,0.12)', color: '#6C9EFF' },
  TRIAGED: { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA' },
  IN_PROGRESS: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
  WAITING: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
  RESOLVED: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
  ARCHIVED: { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' },
};

export default function ClientQueries() {
  const [items, setItems] = useState<EmailHubItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionId, setActionId] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // Client queries = FEEDBACK, QUOTE, POD, and GENERAL email hub items
      const all = await getEmailHubItems({ search });
      const queries = all.filter(item =>
        ['FEEDBACK', 'QUOTE', 'POD', 'GENERAL', 'COLLECTION_REQUEST'].includes(item.type)
      );
      setItems(queries);
    } catch (e) {
      console.error('Failed to load client queries:', e);
      setItems([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleResolve = async (id: number) => {
    setActionId(id);
    try {
      await resolveEmailHubItem(id);
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'RESOLVED' as any } : i));
    } catch (e) { console.error(e); }
    setActionId(null);
  };

  const filtered = items.filter(i =>
    !search || i.subject?.toLowerCase().includes(search.toLowerCase()) ||
    (i as any).from?.toLowerCase().includes(search.toLowerCase()) ||
    i.senderEmail?.toLowerCase().includes(search.toLowerCase())
  );

  const openCount = items.filter(i => i.status !== 'RESOLVED' && i.status !== 'ARCHIVED').length;
  const urgentCount = items.filter(i => i.priority === 'CRITICAL' || i.priority === 'HIGH').length;
  const resolvedCount = items.filter(i => i.status === 'RESOLVED').length;

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      <PageHeader icon={MessageCircleQuestion} title="Client Queries" description="Manage customer support cases, disputes, and questions" color="#FBBF24">
        <button onClick={loadData} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
          background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
          border: 'none', cursor: 'pointer',
        }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ marginBottom: '20px' }}>
        <MiniStat label="Open Queries" value={openCount} icon={Search} color="#6C9EFF" />
        <MiniStat label="Urgent" value={urgentCount} icon={AlertTriangle} color="#F87171" />
        <MiniStat label="Resolved" value={resolvedCount} icon={CheckCircle} color="#4ADE80" />
        <MiniStat label="Total" value={items.length} icon={Mail} color="#A78BFA" />
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '20px', maxWidth: '400px' }}>
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search queries by subject or sender..."
          style={{ width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px', borderRadius: '10px', fontSize: '13px', color: 'white', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
      </div>

      {/* Content */}
      {loading ? (
        <PageSkeleton type="list" rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MessageCircleQuestion}
          title={search ? "No matching queries" : "No client queries"}
          description={search ? "Try a different search term." : "Client queries from email, WhatsApp, and support channels will appear here. They flow in via the Email Hub."}
          actionLabel={!search ? "Go to Email Hub" : undefined}
          actionPath="/communications/email"
          color="#FBBF24"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(item => {
            const cat = categoryConfig[item.type] || categoryConfig.GENERAL;
            const sc = statusConfig[item.status] || statusConfig.NEW;
            const CatIcon = cat.icon;
            return (
              <div key={item.id} style={{
                borderRadius: '12px', padding: '16px 20px',
                background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '12px', flex: 1, minWidth: 0 }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${cat.color}12` }}>
                      <CatIcon size={16} color={cat.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>{item.subject}</span>
                        <span style={{ fontSize: '9px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', background: `${cat.color}15`, color: cat.color, textTransform: 'uppercase' }}>{cat.label}</span>
                        <span style={{ fontSize: '9px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', background: sc.bg, color: sc.color }}>{item.status?.replace('_', ' ')}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
                        {item.senderName ? `${item.senderName} • ` : ''}{item.senderEmail || (item as any).from || 'Unknown sender'}
                        {item.waybillNumber ? ` • Waybill: ${item.waybillNumber}` : ''}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {item.body}
                      </div>
                      {item.aiSuggestedAction && (
                        <div style={{ fontSize: '11px', color: '#A78BFA', marginTop: '6px' }}>
                          🤖 AI suggests: {item.aiSuggestedAction}
                        </div>
                      )}
                    </div>
                  </div>
                  {item.status !== 'RESOLVED' && (
                    <button onClick={() => handleResolve(item.id)} disabled={actionId === item.id}
                      style={{
                        flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        background: 'rgba(74,222,128,0.15)', color: '#4ADE80',
                        border: '1px solid rgba(74,222,128,0.3)', cursor: 'pointer',
                      }}>
                      <CheckCircle size={13} /> {actionId === item.id ? '...' : 'Resolve'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div style={{ borderRadius: '10px', padding: '14px 16px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}12` }}>
        <Icon size={15} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'white' }}>{value}</div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{label}</div>
      </div>
    </div>
  );
}
