import { Company } from '@/types/supertenant';
import { Eye, Settings2, MoreHorizontal } from 'lucide-react';

interface TenantTableProps {
  tenants: Company[];
  onRefresh: () => void;
}

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
  if (!tenants.length) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No tenants found</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="text-sm font-bold text-white">Tenant Companies</div>
        <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(108,158,255,0.15)', color: '#6C9EFF' }}>
          {tenants.length} total
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {['Company', 'Plan', 'Status', 'Users', 'Actions'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'rgba(255,255,255,0.35)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tenants.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: i < tenants.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                className="hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3">
                  <div className="font-semibold text-white">{t.name}</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>ID: {t.id}</div>
                </td>
                <td className="px-5 py-3">
                  <span className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{ background: `${planColors[t.plan] || '#6C9EFF'}20`, color: planColors[t.plan] || '#6C9EFF' }}>
                    {t.plan || 'STARTER'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: statusColors[t.status] || '#4ADE80' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColors[t.status] || '#4ADE80' }} />
                    {t.status || 'Active'}
                  </span>
                </td>
                <td className="px-5 py-3 text-white/70">{t.activeUsers ?? '—'}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <button className="p-1.5 rounded-lg transition-all hover:bg-white/10" title="View">
                      <Eye size={13} className="text-white/50" />
                    </button>
                    <button className="p-1.5 rounded-lg transition-all hover:bg-white/10" title="Settings">
                      <Settings2 size={13} className="text-white/50" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
