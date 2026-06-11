import { Bell, RefreshCw, Radio } from 'lucide-react';

interface TopBarProps {
  user: any;
  onRefresh?: () => void;
  loading?: boolean;
}

export default function TopBar({ user, onRefresh, loading }: TopBarProps) {
  return (
    <header style={{
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      background: 'rgba(8,13,26,0.95)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      position: 'sticky',
      top: 0,
      zIndex: 30,
      backdropFilter: 'blur(12px)',
    }}>
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>Platform Control Center</span>
        <span style={{
          fontSize: '11px', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700,
          background: 'rgba(108,158,255,0.15)', color: '#6C9EFF',
        }}>SUPER ADMIN</span>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* AI Monitoring */}
        <span style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: '11px', padding: '4px 10px', borderRadius: '9999px',
          background: 'rgba(74,222,128,0.1)', color: '#4ADE80',
          border: '1px solid rgba(74,222,128,0.2)',
        }}>
          <Radio size={10} /> AI MONITORING ACTIVE
        </span>

        {/* Refresh */}
        {onRefresh && (
          <button onClick={onRefresh} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
            background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
            border: 'none', cursor: 'pointer',
          }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        )}

        {/* Bell */}
        <button style={{
          position: 'relative', padding: '8px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer',
        }}>
          <Bell size={15} color="rgba(255,255,255,0.6)" />
        </button>

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 900, color: 'white',
            background: 'linear-gradient(135deg,#6C9EFF,#A78BFA)',
          }}>
            {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'S'}
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'white' }}>{user?.name || 'Super Admin'}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{user?.email || ''}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
