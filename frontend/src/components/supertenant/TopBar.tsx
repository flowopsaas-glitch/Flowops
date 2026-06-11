import { Bell, RefreshCw } from 'lucide-react';

interface TopBarProps {
  user: any;
  onRefresh?: () => void;
  loading?: boolean;
}

export default function TopBar({ user, onRefresh, loading }: TopBarProps) {
  return (
    <header className="fixed top-0 left-[175px] right-0 h-14 flex items-center justify-between px-6 z-30"
      style={{ background: 'rgba(8,13,26,0.95)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
      <div>
        <span className="text-sm font-semibold text-white">Platform Control Center</span>
        <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-bold"
          style={{ background: 'rgba(108,158,255,0.15)', color: '#6C9EFF' }}>
          SUPER ADMIN
        </span>
      </div>
      <div className="flex items-center gap-3">
        {onRefresh && (
          <button onClick={onRefresh} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
        <button className="relative p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <Bell size={15} className="text-white/60" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white"
            style={{ background: 'linear-gradient(135deg,#6C9EFF,#A78BFA)' }}>
            {user?.email?.[0]?.toUpperCase() || 'S'}
          </div>
          <div className="hidden sm:block">
            <div className="text-xs font-semibold text-white">{user?.name || 'Super Admin'}</div>
            <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{user?.email || ''}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
