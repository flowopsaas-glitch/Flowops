import { Crown, LayoutDashboard, Building2, Users, CreditCard, Settings, LogOut, Zap, Activity, UserPlus, Key, FileText } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/superadmin' },
  { label: 'Tenants', icon: Building2, path: '/superadmin/companies' },
  { label: 'Signups', icon: UserPlus, path: '/superadmin/signups' },
  { label: 'Credentials', icon: Key, path: '/superadmin/credentials' },
  { label: 'Users', icon: Users, path: '/superadmin/users' },
  { label: 'Billing', icon: CreditCard, path: '/superadmin/billing' },
  { label: 'Dispatches', icon: Zap, path: '/superadmin/dispatches' },
  { label: 'Health', icon: Activity, path: '/superadmin/health' },
  { label: 'Audit Log', icon: FileText, path: '/superadmin/audit-log' },
  { label: 'Settings', icon: Settings, path: '/superadmin/settings' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('accessToken');
    window.location.href = '/login';
  };

  return (
    <aside style={{
      width: '200px',
      minWidth: '200px',
      height: '100vh',
      position: 'sticky',
      top: 0,
      display: 'flex',
      flexDirection: 'column',
      background: '#080d1a',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      zIndex: 40,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)',
          }}>
            <Crown size={14} color="white" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 900, color: 'white', letterSpacing: '0.5px' }}>FLOWOPS</div>
            <div style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>GOD MODE</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 8px', overflowY: 'auto' }}>
        {navItems.map(({ label, icon: Icon, path }) => {
          const active = location.pathname === path || (path !== '/superadmin' && location.pathname.startsWith(path));
          return (
            <button key={path} onClick={() => navigate(path)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                marginBottom: '2px',
                color: active ? '#6C9EFF' : 'rgba(255,255,255,0.5)',
                background: active ? 'rgba(108,158,255,0.12)' : 'transparent',
                fontWeight: active ? 600 : 400,
                transition: 'all 0.15s',
              }}>
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={handleLogout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            fontSize: '14px',
            color: 'rgba(255,255,255,0.4)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}>
          <LogOut size={15} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
