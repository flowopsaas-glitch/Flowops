import { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, RefreshCw, CheckCircle, Clock, Package, TrendingUp, Eye, Ban } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface RiskItem {
  id: number;
  waybillNumber: string;
  status: string;
  senderName?: string;
  receiverName?: string;
  riskScore?: number;
  riskReasons?: string[];
  createdAt: string;
  totalAmount?: number;
}

export default function HighRiskQueuePage() {
  const [items, setItems] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) { setLoading(false); return; }

    try {
      // Fetch waybills that are exceptions (FAILED, stuck, etc.)
      const res = await fetch(`${API_URL}/waybills`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const waybills = Array.isArray(data) ? data : data.waybills || [];
        // Filter for high-risk items (stuck, failed, or overdue)
        const risky = waybills.filter((w: any) =>
          ['FAILED', 'EXCEPTION', 'STUCK', 'SHORT_SUPPLY', 'OVER_SUPPLY', 'CANCELLED'].includes(w.status) ||
          (w.status === 'PENDING' && isOverdue(w.createdAt))
        ).map((w: any) => ({
          ...w,
          riskScore: computeClientRisk(w),
          riskReasons: computeReasons(w),
        }));
        setItems(risky.sort((a: any, b: any) => (b.riskScore || 0) - (a.riskScore || 0)));
      }
    } catch (e) { console.error('Failed to load risk queue:', e); }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, []);

  const riskColor = (score: number) => {
    if (score >= 70) return '#F87171';
    if (score >= 40) return '#FBBF24';
    return '#6C9EFF';
  };

  const riskLabel = (score: number) => {
    if (score >= 70) return 'CRITICAL';
    if (score >= 40) return 'HIGH';
    return 'MEDIUM';
  };

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(248,113,113,0.15)' }}>
            <ShieldAlert size={20} color="#F87171" />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white', margin: 0 }}>High Risk Queue</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>
              Exceptions and anomalies requiring immediate attention
            </p>
          </div>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
          background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
          border: 'none', cursor: 'pointer',
        }}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ marginBottom: '24px' }}>
        <StatCard label="Total Exceptions" value={items.length} icon={AlertTriangle} color="#F87171" />
        <StatCard label="Critical" value={items.filter(i => (i.riskScore || 0) >= 70).length} icon={Ban} color="#F87171" />
        <StatCard label="High Risk" value={items.filter(i => (i.riskScore || 0) >= 40 && (i.riskScore || 0) < 70).length} icon={ShieldAlert} color="#FBBF24" />
        <StatCard label="Monitoring" value={items.filter(i => (i.riskScore || 0) < 40).length} icon={Eye} color="#6C9EFF" />
      </div>

      {/* Queue List */}
      {loading ? (
        <LoadingSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="All Clear"
          description="No high-risk items detected. All shipments are operating within normal parameters."
          color="#4ADE80"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map(item => (
            <div key={item.id} style={{
              borderRadius: '12px', padding: '16px 20px',
              background: 'rgba(15,22,45,0.85)', border: `1px solid ${riskColor(item.riskScore || 0)}25`,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#6C9EFF' }}>
                      {item.waybillNumber || `WB-${item.id}`}
                    </span>
                    <span style={{
                      fontSize: '10px', padding: '2px 8px', borderRadius: '6px', fontWeight: 700,
                      background: `${riskColor(item.riskScore || 0)}15`,
                      color: riskColor(item.riskScore || 0),
                    }}>
                      {riskLabel(item.riskScore || 0)} ({item.riskScore}%)
                    </span>
                    <span style={{
                      fontSize: '10px', padding: '2px 8px', borderRadius: '6px', fontWeight: 600,
                      background: 'rgba(248,113,113,0.12)', color: '#F87171',
                    }}>
                      {item.status?.replace('_', ' ')}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                    {item.senderName || 'Unknown'} → {item.receiverName || 'Unknown'}
                    {item.totalAmount ? ` • R${item.totalAmount.toLocaleString()}` : ''}
                  </div>
                  {/* Risk reasons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(item.riskReasons || []).map((reason, i) => (
                      <span key={i} style={{
                        fontSize: '10px', padding: '3px 8px', borderRadius: '6px',
                        background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Risk score gauge */}
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `conic-gradient(${riskColor(item.riskScore || 0)} ${(item.riskScore || 0) * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
                    position: 'relative',
                  }}>
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '50%', position: 'absolute',
                      background: '#0f162d', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: riskColor(item.riskScore || 0) }}>
                        {item.riskScore}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>RISK</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helper functions ────────────────────────────────────────────────────────
function isOverdue(createdAt: string): boolean {
  const created = new Date(createdAt);
  const now = new Date();
  const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
  return diffHours > 48; // Overdue if pending for more than 48 hours
}

function computeClientRisk(waybill: any): number {
  let score = 20;
  if (waybill.status === 'FAILED' || waybill.status === 'CANCELLED') score += 50;
  if (waybill.status === 'EXCEPTION' || waybill.status === 'STUCK') score += 40;
  if (waybill.status === 'SHORT_SUPPLY' || waybill.status === 'OVER_SUPPLY') score += 30;
  if (waybill.status === 'PENDING' && isOverdue(waybill.createdAt)) score += 25;
  if (!waybill.receiverName) score += 10;
  if (!waybill.senderName) score += 10;
  return Math.min(score, 100);
}

function computeReasons(waybill: any): string[] {
  const reasons: string[] = [];
  if (waybill.status === 'FAILED') reasons.push('Delivery failed');
  if (waybill.status === 'CANCELLED') reasons.push('Cancelled shipment');
  if (waybill.status === 'EXCEPTION') reasons.push('Exception flagged');
  if (waybill.status === 'STUCK') reasons.push('Stuck in transit');
  if (waybill.status === 'SHORT_SUPPLY') reasons.push('Short supply');
  if (waybill.status === 'OVER_SUPPLY') reasons.push('Over supply');
  if (waybill.status === 'PENDING' && isOverdue(waybill.createdAt)) reasons.push('Overdue (48h+)');
  if (!waybill.receiverName) reasons.push('Missing receiver');
  if (!waybill.senderName) reasons.push('Missing sender');
  if (reasons.length === 0) reasons.push('Under monitoring');
  return reasons;
}

// ── Shared Components ───────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div style={{ borderRadius: '12px', padding: '16px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
        <Icon size={14} color={color} />
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>{value}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, color }: { icon: any; title: string; description: string; color: string }) {
  return (
    <div style={{
      borderRadius: '16px', padding: '48px', textAlign: 'center',
      background: `${color}08`, border: `1px solid ${color}20`,
    }}>
      <Icon size={32} color={color} style={{ margin: '0 auto 16px' }} />
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>{title}</h3>
      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', maxWidth: '400px', margin: '0 auto' }}>{description}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ borderRadius: '12px', padding: '20px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ width: '120px', height: '14px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }} className="animate-pulse" />
            <div style={{ width: '60px', height: '14px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)' }} className="animate-pulse" />
          </div>
          <div style={{ width: '200px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', marginTop: '10px' }} className="animate-pulse" />
        </div>
      ))}
    </div>
  );
}
