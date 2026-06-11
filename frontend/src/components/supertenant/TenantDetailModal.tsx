import { X, Building2, Users, CreditCard, Activity, Calendar } from 'lucide-react';
import { Company } from '@/types/supertenant';

interface TenantDetailModalProps {
  tenant: Company;
  onClose: () => void;
}

export default function TenantDetailModal({ tenant, onClose }: TenantDetailModalProps) {
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

  const details = [
    { label: 'Company Name', value: tenant.name, icon: Building2 },
    { label: 'Plan', value: tenant.plan || 'STARTER', icon: CreditCard },
    { label: 'Status', value: tenant.status || 'Active', icon: Activity },
    { label: 'Active Users', value: String(tenant.activeUsers ?? 0), icon: Users },
    { label: 'Created', value: tenant.createdAt?.split('T')[0] || '—', icon: Calendar },
    { label: 'Last Updated', value: tenant.updatedAt?.split('T')[0] || '—', icon: Calendar },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="rounded-2xl p-6 w-full max-w-lg"
        style={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)' }}>
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${planColors[tenant.plan] || '#6C9EFF'}20` }}>
              <Building2 size={20} style={{ color: planColors[tenant.plan] || '#6C9EFF' }} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{tenant.name}</h3>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Tenant ID: {tenant.id}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X size={18} /></button>
        </div>

        {/* Status badges */}
        <div className="flex gap-3 mb-6">
          <span className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ background: `${planColors[tenant.plan] || '#6C9EFF'}20`, color: planColors[tenant.plan] || '#6C9EFF' }}>
            {tenant.plan || 'STARTER'}
          </span>
          <span className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5"
            style={{ background: `${statusColors[tenant.status] || '#4ADE80'}20`, color: statusColors[tenant.status] || '#4ADE80' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColors[tenant.status] || '#4ADE80' }} />
            {tenant.status || 'Active'}
          </span>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {details.map(({ label, value, icon: Icon }) => (
            <div key={label} className="p-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={12} style={{ color: 'rgba(255,255,255,0.35)' }} />
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
              </div>
              <div className="text-sm font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>

        {/* Monthly stats */}
        <div className="p-4 rounded-xl mb-6"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-xs font-medium mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>MONTHLY STATS</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xl font-bold text-white">{tenant.dispatchesToday ?? 0}</div>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Dispatches Today</div>
            </div>
            <div>
              <div className="text-xl font-bold text-white">R{(tenant.monthlyRevenue ?? 0).toLocaleString()}</div>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Monthly Revenue</div>
            </div>
            <div>
              <div className="text-xl font-bold text-white">{tenant.billingStatus || 'Active'}</div>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Billing Status</div>
            </div>
          </div>
        </div>

        {/* Close button */}
        <button onClick={onClose}
          className="w-full py-2.5 rounded-lg text-sm font-medium"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
          Close
        </button>
      </div>
    </div>
  );
}
