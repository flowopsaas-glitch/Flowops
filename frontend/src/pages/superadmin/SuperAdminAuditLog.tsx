import { useState, useEffect } from 'react';
import { FileText, Search, RefreshCw, Download, Filter, User, Clock, Shield } from 'lucide-react';
import SuperAdminLayout from '@/components/supertenant/SuperAdminLayout';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
const token = () => localStorage.getItem('access_token');

const actionColors: Record<string, { bg: string; color: string }> = {
  CREATED: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
  UPDATED: { bg: 'rgba(108,158,255,0.12)', color: '#6C9EFF' },
  DELETED: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
  LOGIN: { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA' },
  LOGOUT: { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' },
  INVOICE_SENT: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
  INVOICE_PAID: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
  WAYBILL_DELIVERED: { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
  POD_CAPTURED: { bg: 'rgba(34,211,238,0.12)', color: '#22D3EE' },
  SEEDER_RUN: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
};

export default function SuperAdminAuditLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const h = { Authorization: `Bearer ${token()}` };
  const limit = 50;

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (search) params.append('action', search);
      if (entityFilter) params.append('entityType', entityFilter);
      const [logsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/audit-log?${params}`, { headers: h }),
        fetch(`${API_URL}/audit-log/stats`, { headers: h }),
      ]);
      if (logsRes.ok) { const d = await logsRes.json(); setLogs(d.logs || []); setTotal(d.total || 0); }
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [offset, entityFilter]);

  const handleExport = async () => {
    window.open(`${API_URL}/export?type=audit-log&token=${token()}`, '_blank');
  };

  const filtered = search ? logs.filter(l => l.action?.toLowerCase().includes(search.toLowerCase()) || l.description?.toLowerCase().includes(search.toLowerCase())) : logs;

  return (
    <SuperAdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white', margin: 0 }}>Audit Log</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>Track all platform actions and changes</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)', color: 'white', border: 'none', cursor: 'pointer' }}>
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Events', value: stats.totalLogs, icon: FileText, color: '#6C9EFF' },
              { label: "Today's Events", value: stats.todayLogs, icon: Clock, color: '#4ADE80' },
              { label: 'This Week', value: stats.weekLogs, icon: Shield, color: '#A78BFA' },
              { label: 'Top Action', value: stats.topActions?.[0]?.action || 'N/A', icon: User, color: '#FBBF24' },
            ].map(s => (
              <div key={s.label} style={{ borderRadius: '12px', padding: '16px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${s.color}12` }}>
                  <s.icon size={15} color={s.color} />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{String(s.value)}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search actions..."
              style={{ width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px', borderRadius: '10px', fontSize: '13px', color: 'white', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
          </div>
          <select value={entityFilter} onChange={e => { setEntityFilter(e.target.value); setOffset(0); }}
            style={{ padding: '10px 14px', borderRadius: '10px', fontSize: '13px', color: 'white', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }}>
            <option value="" style={{ background: '#0f1629' }}>All Entity Types</option>
            {['Waybill', 'Collection', 'Driver', 'User', 'Invoice', 'Client', 'Company', 'System'].map(t => (
              <option key={t} value={t} style={{ background: '#0f1629' }}>{t}</option>
            ))}
          </select>
        </div>

        {/* Logs Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Loading audit logs...</div>
        ) : (
          <>
            <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>Events ({total})</span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Showing {filtered.length} of {total}</span>
              </div>
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Action', 'Description', 'Entity', 'User', 'IP', 'Time'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l, i) => {
                    const ac = actionColors[l.action] || { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' };
                    return (
                      <tr key={l.id || i} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }} className="hover:bg-white/[0.02] transition-colors">
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: ac.bg, color: ac.color, whiteSpace: 'nowrap' }}>
                            {l.action}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.7)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description || '—'}</td>
                        <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.5)' }}>{l.entityType ? `${l.entityType}${l.entityId ? ` #${l.entityId}` : ''}` : '—'}</td>
                        <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.6)' }}>{l.user?.name || l.user?.email || '—'}</td>
                        <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.35)', fontSize: '11px' }}>{l.ipAddress || '—'}</td>
                        <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.4)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {l.createdAt ? new Date(l.createdAt).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No audit events found</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > limit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
                  style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: offset === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)', border: 'none', cursor: offset === 0 ? 'not-allowed' : 'pointer' }}>
                  ← Previous
                </button>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                  {offset + 1}–{Math.min(offset + limit, total)} of {total}
                </span>
                <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}
                  style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: offset + limit >= total ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)', border: 'none', cursor: offset + limit >= total ? 'not-allowed' : 'pointer' }}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
}
