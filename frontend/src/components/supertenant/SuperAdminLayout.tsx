import { ReactNode, useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface SuperAdminLayoutProps {
  children: ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
}

export default function SuperAdminLayout({ children, onRefresh, loading }: SuperAdminLayoutProps) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setUser(await res.json());
      } catch (e) { /* ignore */ }
    };
    fetchUser();
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0f1e' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar user={user} onRefresh={onRefresh} loading={loading} />
        <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          <div style={{ maxWidth: '1400px' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
