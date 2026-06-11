import { Plus, Mail, Shield, Download } from 'lucide-react';

interface QuickActionsProps {
  onAddTenant: () => void;
}

export default function QuickActions({ onAddTenant }: QuickActionsProps) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="text-sm font-bold text-white mb-4">Quick Actions</div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onAddTenant}
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#6C9EFF,#A78BFA)' }}>
          <Plus size={15} /> Add Tenant
        </button>
        <button className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/10"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}>
          <Mail size={15} /> Email Blast
        </button>
        <button className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/10"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}>
          <Shield size={15} /> Security Audit
        </button>
        <button className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/10"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}>
          <Download size={15} /> Export Data
        </button>
      </div>
    </div>
  );
}
