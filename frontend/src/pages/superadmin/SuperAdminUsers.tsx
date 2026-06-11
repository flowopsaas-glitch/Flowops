import { useState, useEffect } from 'react';
import { Users, Shield, User, Search } from 'lucide-react';
import SuperAdminLayout from '@/components/supertenant/SuperAdminLayout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface UserRecord {
  id: number;
  name?: string;
  email: string;
  role: string;
  createdAt?: string;
  companyId?: number;
}

export default function SuperAdminUsers() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem('access_token');
      try {
        const usersRes = await fetch(`${API_BASE}/users`, { headers: { Authorization: `Bearer ${token}` } });
        if (usersRes.ok) {
          const data = await usersRes.json();
          setUsers(Array.isArray(data) ? data : data.users || []);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const filtered = users.filter(u =>
    (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalUsers = users.length;
  const admins = users.filter(u => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN' || u.role === 'COMPANY_ADMIN').length;
  const regularUsers = totalUsers - admins;

  const roleBadge = (role: string) => {
    const colors: Record<string, { bg: string; color: string }> = {
      SUPER_ADMIN: { bg: 'rgba(167,139,250,0.15)', color: '#A78BFA' },
      ADMIN: { bg: 'rgba(108,158,255,0.15)', color: '#6C9EFF' },
      COMPANY_ADMIN: { bg: 'rgba(108,158,255,0.15)', color: '#6C9EFF' },
      DISPATCHER: { bg: 'rgba(74,222,128,0.15)', color: '#4ADE80' },
      DRIVER: { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' },
      USER: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' },
    };
    const s = colors[role] || colors['USER'];
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: s.bg, color: s.color }}>
        {role.toLowerCase().replace('_', ' ')}
      </span>
    );
  };

  return (
    <SuperAdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-white">Users</h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>All registered users across the platform</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl p-5 flex items-center gap-4"
              style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(108,158,255,0.15)' }}>
                <Users size={20} style={{ color: '#6C9EFF' }} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{totalUsers}</div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Total Users</div>
              </div>
            </div>
            <div className="rounded-xl p-5 flex items-center gap-4"
              style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.15)' }}>
                <Shield size={20} style={{ color: '#A78BFA' }} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{admins}</div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Admins</div>
              </div>
            </div>
            <div className="rounded-xl p-5 flex items-center gap-4"
              style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,222,128,0.15)' }}>
                <User size={20} style={{ color: '#4ADE80' }} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{regularUsers}</div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Regular Users</div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full pl-11 pr-4 py-3 rounded-xl text-sm text-white outline-none"
              style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}
            />
          </div>

          {/* Users Table */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Name', 'Email', 'Role', 'Joined'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: 'linear-gradient(135deg,#6C9EFF,#A78BFA)' }}>
                          {(u.name || u.email)[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-white">{u.name || u.email.split('@')[0]}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{u.email}</td>
                    <td className="px-5 py-3">{roleBadge(u.role)}</td>
                    <td className="px-5 py-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {loading ? 'Loading users...' : 'No users found'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
      </div>
    </SuperAdminLayout>
  );
}
