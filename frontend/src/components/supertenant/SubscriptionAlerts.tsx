import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Ban, RefreshCw, ChevronRight, Shield } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface SubscriptionAlert {
  id: string;
  companyId: number;
  companyName: string;
  plan: string;
  alertType: 'TRIAL_EXPIRING' | 'TRIAL_EXPIRED' | 'DEMO_EXPIRING' | 'DEMO_EXPIRED' | 'SUBSCRIPTION_LOCKED';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  expiresAt: string | null;
  daysRemaining: number;
  createdAt: string;
}

interface AlertSummary {
  total: number;
  critical: number;
  warnings: number;
  info: number;
  lastSweepAt: string | null;
  expiringWithin7Days: number;
  alreadyExpired: number;
}

const severityConfig = {
  CRITICAL: { color: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)', icon: Ban },
  WARNING: { color: '#FBBF24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)', icon: AlertTriangle },
  INFO: { color: '#6C9EFF', bg: 'rgba(108,158,255,0.1)', border: 'rgba(108,158,255,0.25)', icon: Clock },
};

export default function SubscriptionAlerts() {
  const [alerts, setAlerts] = useState<SubscriptionAlert[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchAlerts = async () => {
    const token = localStorage.getItem('access_token');
    try {
      const [alertsRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/subscription-monitor/alerts`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/subscription-monitor/summary`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
    } catch (e) { console.warn('Failed to fetch subscription alerts:', e); }
    setLoading(false);
  };

  const triggerSweep = async () => {
    setSweeping(true);
    const token = localStorage.getItem('access_token');
    try {
      await fetch(`${API_BASE}/subscription-monitor/sweep`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchAlerts();
    } catch (e) { console.error(e); }
    setSweeping(false);
  };

  useEffect(() => { fetchAlerts(); }, []);

  // Show healthy state when no alerts
  if (!loading && alerts.length === 0) {
    return (
      <div style={{
        borderRadius: '12px', padding: '16px 20px',
        background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={16} color="#4ADE80" />
          <span style={{ fontSize: '13px', color: '#4ADE80', fontWeight: 500 }}>
            All subscriptions healthy — no expiring trials or demos
          </span>
        </div>
        <button onClick={triggerSweep} disabled={sweeping} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 500,
          background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)',
          border: 'none', cursor: 'pointer',
        }}>
          <RefreshCw size={11} className={sweeping ? 'animate-spin' : ''} /> Check Now
        </button>
      </div>
    );
  }

  const visibleAlerts = expanded ? alerts : alerts.slice(0, 3);

  return (
    <div style={{
      borderRadius: '12px', overflow: 'hidden',
      background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle size={16} color="#FBBF24" />
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>Subscription Alerts</span>
          {summary && summary.total > 0 && (
            <span style={{
              fontSize: '11px', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700,
              background: summary.critical > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.15)',
              color: summary.critical > 0 ? '#F87171' : '#FBBF24',
            }}>
              {summary.total} alert{summary.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {summary?.lastSweepAt && (
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
              Last check: {new Date(summary.lastSweepAt).toLocaleTimeString()}
            </span>
          )}
          <button onClick={triggerSweep} disabled={sweeping} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 500,
            background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)',
            border: 'none', cursor: 'pointer',
          }}>
            <RefreshCw size={11} className={sweeping ? 'animate-spin' : ''} /> Sweep
          </button>
        </div>
      </div>

      {/* Summary badges */}
      {summary && summary.total > 0 && (
        <div style={{ padding: '12px 20px', display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {summary.critical > 0 && (
            <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', fontWeight: 600, background: 'rgba(248,113,113,0.12)', color: '#F87171' }}>
              {summary.critical} Critical
            </span>
          )}
          {summary.warnings > 0 && (
            <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', fontWeight: 600, background: 'rgba(251,191,36,0.12)', color: '#FBBF24' }}>
              {summary.warnings} Warning{summary.warnings !== 1 ? 's' : ''}
            </span>
          )}
          {summary.info > 0 && (
            <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', fontWeight: 600, background: 'rgba(108,158,255,0.12)', color: '#6C9EFF' }}>
              {summary.info} Info
            </span>
          )}
        </div>
      )}

      {/* Alert list */}
      <div style={{ padding: '8px 12px' }}>
        {loading && (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>
            Loading alerts...
          </div>
        )}
        {visibleAlerts.map(alert => {
          const config = severityConfig[alert.severity];
          const Icon = config.icon;
          return (
            <div key={alert.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px', borderRadius: '8px', marginBottom: '4px',
              background: config.bg, border: `1px solid ${config.border}`,
            }}>
              <Icon size={16} color={config.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'white' }}>{alert.companyName}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{alert.message}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: config.color }}>
                  {alert.daysRemaining <= 0 ? 'EXPIRED' : `${alert.daysRemaining}d left`}
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>
                  {alert.plan}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand / collapse */}
      {alerts.length > 3 && (
        <div style={{ padding: '8px 20px 16px', textAlign: 'center' }}>
          <button onClick={() => setExpanded(!expanded)} style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '12px', fontWeight: 500, color: '#6C9EFF',
            background: 'none', border: 'none', cursor: 'pointer',
          }}>
            {expanded ? 'Show less' : `View all ${alerts.length} alerts`}
            <ChevronRight size={12} style={{ transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
          </button>
        </div>
      )}
    </div>
  );
}
