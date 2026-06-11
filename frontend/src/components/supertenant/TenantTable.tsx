import { useState } from 'react';
import { Company } from '@/types/supertenant';
import { Eye, Settings2, Ban, RotateCcw } from 'lucide-react';
import EditTenantModal from './EditTenantModal';
import TenantDetailModal from './TenantDetailModal';

interface TenantTableProps {
  tenants: Company[];
  onRefresh: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const planColors: Record<string, string> = {
  ENTERPRISE: '#A78BFA',
  PRO: '#6C9EFF',
  STARTER: '#4ADE80',
};

const statusColors: Record<string, string> = {
  Active: '#4ADE80',
  Inactive: '#F87171',
  Suspended: '#FBBF24',
};

export default function TenantTable({ tenants, onRefresh }: TenantTableProps) {
  const [editTenant, setEditTenant] = useState<Company | null>(null);
  const [viewTenant, setViewTenant] = useState<Company | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const handleSuspend = async (tenant: Company) => {
    setLoadingId(tenant.id);
    try {
      const token = localStorage.getItem('access_token');
      const newStatus = tenant.status === 'Suspended' ? 'Active' : 'Suspended';
      const res = await fetch(`${API_BASE}/companies/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: newStatus === 'Active', status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update tenant status');
      onRefresh();
    } catch (err) {
      console.error('Suspend/restore failed:', err);
    } finally {
      setLoadingId(null);
    }
  };

  if (!tenants.length) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No tenants found</div>
      </div>
    );
  }

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Tenant Management Table</h2>
        <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Tenant Name', 'Plan', 'Billing Status', 'Usage', 'Active Users', 'Last Active', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: 'rgba(255,255,255,0.4)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenants.map((t, i) => (
                  <tr key={t.id}
                    style={{
                      borderBottom: i < tenants.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    }}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{t.name}</div>
                      <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>ID: {t.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold px-2 py-1 rounded-full"
                        style={{ background: `${planColors[t.plan] || '#6C9EFF'}20`, color: planColors[t.plan] || '#6C9EFF' }}>
                        {t.plan || 'STARTER'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={t.billingStatus || 'Active'} />
                    </td>
                    <td className="px-4 py-3">
                      <UsageBar value={Math.min(((t.activeUsers || 0) / 50) * 100, 100)} />
                    </td>
                    <td className="px-4 py-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.activeUsers ?? 0}</td>
                    <td className="px-4 py-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {t.lastActive || t.updatedAt?.split('T')[0] || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={t.status || 'Active'} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleSuspend(t)}
                          disabled={loadingId === t.id}
                          className="px-2 py-1 rounded text-xs font-medium transition-all disabled:opacity-50"
                          style={{
                            background: t.status === 'Suspended' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                            color: t.status === 'Suspended' ? '#4ADE80' : '#F87171',
                            border: `1px solid ${t.status === 'Suspended' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
                          }}>
                          {loadingId === t.id ? '...' : t.status === 'Suspended' ? 'Restore' : 'Suspend'}
                        </button>
                        <button
                          onClick={() => setEditTenant(t)}
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{ background: 'rgba(108,158,255,0.12)', color: '#6C9EFF', border: '1px solid rgba(108,158,255,0.25)' }}>
                          Edit
                        </button>
                        <button
                          onClick={() => setViewTenant(t)}
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editTenant && (
        <EditTenantModal
          tenant={editTenant}
          onClose={() => setEditTenant(null)}
          onSaved={() => { setEditTenant(null); onRefresh(); }}
        />
      )}
      {viewTenant && (
        <TenantDetailModal
          tenant={viewTenant}
          onClose={() => setViewTenant(null)}
        />
      )}
    </>
  );
}

function StatusBadge({ value }: { value: string }) {
  const colors: Record<string, { color: string; bg: string; border: string }> = {
    Active: { color: '#4ADE80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)' },
    Pending: { color: '#FBBF24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' },
    Overdue: { color: '#F87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
    Suspended: { color: '#F87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
    Inactive: { color: '#F87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
  };
  const s = colors[value] || colors['Active'];
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {value}
    </span>
  );
}

function UsageBar({ value }: { value: number }) {
  const pct = Math.min(value || 0, 100);
  const color = pct > 80 ? '#F87171' : pct > 50 ? '#FBBF24' : '#6C9EFF';
  return (
    <div className="w-20 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
