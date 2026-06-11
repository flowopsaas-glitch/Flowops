import { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, Clock, AlertTriangle, Info, Trash2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import PageSkeleton from '@/components/ui/PageSkeleton';
import EmptyState from '@/components/ui/EmptyState';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

const typeConfig: Record<string, { icon: any; color: string }> = {
  INFO: { icon: Info, color: '#6C9EFF' },
  WARNING: { icon: AlertTriangle, color: '#FBBF24' },
  ALERT: { icon: AlertTriangle, color: '#F87171' },
  SUCCESS: { icon: Check, color: '#4ADE80' },
};

export default function Notifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } catch (e) { console.error('Failed to load notifications:', e); }
    setLoading(false);
  };

  const markRead = async (id: number) => {
    try {
      const token = localStorage.getItem('access_token');
      await fetch(`${API_URL}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (e) { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      const token = localStorage.getItem('access_token');
      await fetch(`${API_URL}/notifications/mark-all-read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { loadData(); }, []);

  const unreadCount = items.filter(n => !n.isRead).length;

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      <PageHeader icon={Bell} title="Notifications" description={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`} color="#A78BFA">
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
            background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
            border: 'none', cursor: 'pointer',
          }}>
            <CheckCheck size={13} /> Mark All Read
          </button>
        )}
      </PageHeader>

      {loading ? (
        <PageSkeleton type="list" rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="You're all caught up! Notifications will appear here when there's activity in your workspace."
          color="#A78BFA"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map(n => {
            const config = typeConfig[n.type] || typeConfig.INFO;
            const Icon = config.icon;
            return (
              <div key={n.id} onClick={() => !n.isRead && markRead(n.id)}
                style={{
                  borderRadius: '10px', padding: '14px 18px', cursor: !n.isRead ? 'pointer' : 'default',
                  background: n.isRead ? 'rgba(15,22,45,0.5)' : 'rgba(15,22,45,0.85)',
                  border: `1px solid ${n.isRead ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}`,
                  opacity: n.isRead ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${config.color}12`,
                  }}>
                    <Icon size={15} color={config.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>{n.title || 'Notification'}</span>
                      {!n.isRead && (
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: config.color }} />
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.4' }}>
                      {n.message}
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                    {n.createdAt ? timeAgo(n.createdAt) : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
