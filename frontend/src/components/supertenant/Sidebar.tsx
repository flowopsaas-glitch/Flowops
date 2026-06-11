import { Crown, LayoutDashboard, Building2, Users, CreditCard, Settings, LogOut, Zap } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/superadmin' },
  { label: 'Tenants', icon: Building2, path: '/superadmin/companies' },
  { label: 'Users', icon: Users, path: '/superadmin/users' },
  { label: 'Billing', icon: CreditCard, path: '/superadmin/billing' },
  { label: 'Dispatches', icon: Zap, path: '/superadmin/dispatches' },
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
    <aside className="fixed left-0 top-0 h-screen w-[175px] flex flex-col z-40"
      style={{ background: '#080d1a', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#6C9EFF,#A78BFA)' }}>
          <Crown size={14} className="text-white" />
        </div>
        <div>
          <div className="text-xs font-black text-white tracking-wide">FLOWOPS</div>
          <div className="text-[9px] font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>GOD MODE</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ label, icon: Icon, path }) => {
          const active = location.pathname === path || (path !== '/superadmin' && location.pathname.startsWith(path));
          return (
            <button key={path} onClick={() => navigate(path)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all text-left"
              style={{
                color: active ? '#6C9EFF' : 'rgba(255,255,255,0.5)',
                background: active ? 'rgba(108,158,255,0.12)' : 'transparent',
                fontWeight: active ? 600 : 400,
              }}>
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-2 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all"
          style={{ color: 'rgba(255,255,255,0.4)' }}>
          <LogOut size={15} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
