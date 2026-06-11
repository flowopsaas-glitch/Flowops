import { Bell, RefreshCw, Radio } from 'lucide-react';

interface TopBarProps {
  user: any;
  onRefresh?: () => void;
  loading?: boolean;
}

export default function TopBar({ user, onRefresh, loading }: TopBarProps) {
  return (
    <header className="fixed top-0 right-0 h-14 flex items-center justify-between px-6 z-30"
      style={{ left: '175px', background: 'rgba(8,13,26,0.95)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
      {/* Left: section info */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-white">Platform Control Center</span>
        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
          style={{ background: 'rgba(108,158,255,0.15)', color: '#6C9EFF' }}>
          SUPER ADMIN
        </span>
      </div>

      {/* Right: actions + user */}
      <div className="flex items-center gap-3">
        {/* AI Monitoring badge */}
        <span className="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(74,222,128,0.1)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.2)' }}>
          <Radio size={10} className="animate-pulse" />
          AI MONITORING ACTIVE
        </span>

        {/* Refresh */}
        {onRefresh && (
          <button onClick={onRefresh} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-white/10 transition-all"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          <Bell size={15} className="text-white/60" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: '#6C9EFF' }} />
        </button>

        {/* User avatar + info */}
        <div className="flex items-center gap-2 pl-2" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white"
            style={{ background: 'linear-gradient(135deg,#6C9EFF,#A78BFA)' }}>
            {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'S'}
          </div>
          <div className="hidden sm:block">
            <div className="text-xs font-semibold text-white leading-tight">
              {user?.name || 'Super Admin'}
            </div>
            <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {user?.email || 'Super Admin'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
