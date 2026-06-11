import { Plus, Mail, Shield, Download, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface QuickActionsProps {
  onAddTenant: () => void;
}

const actions = [
  { icon: Plus, label: 'Add Tenant', desc: 'Create a new tenant company', iconColor: '#6C9EFF', iconBg: 'rgba(108,158,255,0.15)', nav: null },
  { icon: Mail, label: 'Email Blast', desc: 'Send bulk notifications', iconColor: '#A78BFA', iconBg: 'rgba(167,139,250,0.15)', nav: '/superadmin/billing' },
  { icon: Shield, label: 'Security Audit', desc: 'Review platform security', iconColor: '#2DD4BF', iconBg: 'rgba(45,212,191,0.15)', nav: '/superadmin/settings' },
  { icon: Download, label: 'Export Data', desc: 'Export reports and analytics', iconColor: '#FBBF24', iconBg: 'rgba(251,191,36,0.15)', nav: '/superadmin/billing' },
];

export default function QuickActions({ onAddTenant }: QuickActionsProps) {
  const navigate = useNavigate();

  const handleClick = (label: string, nav: string | null) => {
    if (label === 'Add Tenant') {
      onAddTenant();
    } else if (nav) {
      navigate(nav);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {actions.map(({ icon: Icon, label, desc, iconColor, iconBg, nav }) => (
          <button
            key={label}
            onClick={() => handleClick(label, nav)}
            className="flex items-center gap-4 p-4 rounded-xl text-left transition-all hover:scale-[1.01] hover:bg-white/[0.02]"
            style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
              <Icon size={18} style={{ color: iconColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white">{label}</div>
              {desc && <div className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{desc}</div>}
            </div>
            <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
          </button>
        ))}
      </div>
    </div>
  );
}
