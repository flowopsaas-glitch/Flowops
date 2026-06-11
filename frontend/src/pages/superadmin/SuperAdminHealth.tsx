import { useState, useEffect } from 'react';
import { Activity, Cpu, Database, HardDrive, RefreshCw, Lightbulb, Shield, Zap, TrendingUp, Server } from 'lucide-react';
import SuperAdminLayout from '@/components/supertenant/SuperAdminLayout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface HealthMetric {
  name: string;
  value: number;
  unit: string;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  threshold: { warn: number; critical: number };
}

interface Recommendation {
  id: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  description: string;
  action: string;
}

interface HealthStatus {
  overallScore: number;
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  metrics: HealthMetric[];
  recommendations: Recommendation[];
  systemInfo: {
    uptime: number;
    nodeVersion: string;
    platform: string;
    cpuCores: number;
    totalMemoryMB: number;
    freeMemoryMB: number;
    loadAverage: number[];
  };
  database: {
    connected: boolean;
    responseTimeMs: number;
    totalCompanies: number;
    totalUsers: number;
    totalWaybills: number;
  };
  lastCheckAt: string;
}

const statusColors = {
  HEALTHY: '#4ADE80',
  DEGRADED: '#FBBF24',
  CRITICAL: '#F87171',
};

const severityColors = {
  LOW: { bg: 'rgba(108,158,255,0.1)', color: '#6C9EFF', border: 'rgba(108,158,255,0.2)' },
  MEDIUM: { bg: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: 'rgba(251,191,36,0.2)' },
  HIGH: { bg: 'rgba(248,113,113,0.1)', color: '#F87171', border: 'rgba(248,113,113,0.2)' },
};

const categoryIcons: Record<string, any> = {
  PERFORMANCE: Zap,
  SECURITY: Shield,
  SCALABILITY: TrendingUp,
  RELIABILITY: Server,
  FEATURE: Lightbulb,
};

export default function SuperAdminHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const fetchHealth = async () => {
    const token = localStorage.getItem('access_token');
    try {
      const res = await fetch(`${API_BASE}/platform-health/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.overallScore !== undefined) setHealth(data);
      }
    } catch (e) { console.warn('Failed to fetch health:', e); }
    setLoading(false);
  };

  const triggerCheck = async () => {
    setChecking(true);
    const token = localStorage.getItem('access_token');
    try {
      await fetch(`${API_BASE}/platform-health/check`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchHealth();
    } catch (e) { console.error(e); }
    setChecking(false);
  };

  useEffect(() => { fetchHealth(); }, []);

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const metricIcons: Record<string, any> = {
    'Memory Usage': HardDrive,
    'CPU Load': Cpu,
    'Database Response': Database,
    'Process Uptime': Server,
    'Heap Usage': Activity,
  };

  return (
    <SuperAdminLayout onRefresh={triggerCheck} loading={checking}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white', margin: 0 }}>AI Platform Health</h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
              Real-time system monitoring and AI-powered recommendations
            </p>
          </div>
          <button onClick={triggerCheck} disabled={checking} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
            background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)', color: 'white',
            border: 'none', cursor: 'pointer', opacity: checking ? 0.6 : 1,
          }}>
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking...' : 'Run Health Check'}
          </button>
        </div>

        {/* Loading / No data */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
            Loading health data...
          </div>
        )}

        {!loading && !health && (
          <div style={{
            borderRadius: '12px', padding: '48px', textAlign: 'center',
            background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)',
          }}>
            <Activity size={32} color="rgba(255,255,255,0.3)" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>
              No health data yet. Run a health check to get started.
            </div>
            <button onClick={triggerCheck} style={{
              padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)', color: 'white',
              border: 'none', cursor: 'pointer',
            }}>
              Run First Check
            </button>
          </div>
        )}

        {health && (
          <>
            {/* Overall Score Card */}
            <div style={{
              borderRadius: '16px', padding: '24px',
              background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)',
              display: 'flex', alignItems: 'center', gap: '24px',
            }}>
              {/* Score circle */}
              <div style={{
                width: '100px', height: '100px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                background: `conic-gradient(${statusColors[health.overallStatus]} ${health.overallScore * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
                position: 'relative',
              }}>
                <div style={{
                  width: '80px', height: '80px', borderRadius: '50%', position: 'absolute',
                  background: '#0f162d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: statusColors[health.overallStatus] }}>
                    {health.overallScore}
                  </span>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>/ 100</span>
                </div>
              </div>

              {/* Status info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    fontSize: '20px', fontWeight: 700, color: statusColors[health.overallStatus],
                  }}>
                    {health.overallStatus}
                  </span>
                  <span style={{
                    fontSize: '10px', padding: '3px 8px', borderRadius: '6px', fontWeight: 600,
                    background: `${statusColors[health.overallStatus]}20`, color: statusColors[health.overallStatus],
                  }}>
                    {health.metrics.filter(m => m.status === 'HEALTHY').length}/{health.metrics.length} metrics OK
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                  Last checked: {new Date(health.lastCheckAt).toLocaleString()}
                </div>
              </div>

              {/* System quick stats */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{formatUptime(health.systemInfo.uptime)}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Uptime</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{health.systemInfo.cpuCores}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>CPU Cores</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{health.database.responseTimeMs}ms</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>DB Latency</div>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'white', marginBottom: '12px' }}>System Metrics</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {health.metrics.map(metric => {
                  const Icon = metricIcons[metric.name] || Activity;
                  return (
                    <div key={metric.name} style={{
                      borderRadius: '12px', padding: '16px',
                      background: 'rgba(15,22,45,0.85)', border: `1px solid ${statusColors[metric.status]}30`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Icon size={14} color={statusColors[metric.status]} />
                          <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>{metric.name}</span>
                        </div>
                        <span style={{
                          fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
                          background: `${statusColors[metric.status]}20`, color: statusColors[metric.status],
                        }}>
                          {metric.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: 'white' }}>
                        {metric.value}{metric.unit}
                      </div>
                      {/* Progress bar */}
                      {metric.unit === '%' && (
                        <div style={{ marginTop: '8px', height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }}>
                          <div style={{
                            height: '4px', borderRadius: '4px',
                            width: `${Math.min(metric.value, 100)}%`,
                            background: statusColors[metric.status],
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Database & System Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Database */}
              <div style={{ borderRadius: '12px', padding: '20px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Database size={16} color="#6C9EFF" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>Database</span>
                  <span style={{
                    fontSize: '10px', padding: '2px 8px', borderRadius: '6px', fontWeight: 600,
                    background: health.database.connected ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
                    color: health.database.connected ? '#4ADE80' : '#F87171',
                  }}>
                    {health.database.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Response Time</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{health.database.responseTimeMs}ms</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Companies</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{health.database.totalCompanies}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Users</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{health.database.totalUsers}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Waybills</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>{health.database.totalWaybills}</div>
                  </div>
                </div>
              </div>

              {/* System Info */}
              <div style={{ borderRadius: '12px', padding: '20px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Server size={16} color="#A78BFA" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>System Info</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Node.js</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>{health.systemInfo.nodeVersion}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Platform</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>{health.systemInfo.platform}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Total RAM</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>{Math.round(health.systemInfo.totalMemoryMB / 1024 * 10) / 10} GB</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Free RAM</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>{Math.round(health.systemInfo.freeMemoryMB / 1024 * 10) / 10} GB</div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Recommendations */}
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'white', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lightbulb size={16} color="#FBBF24" />
                AI Recommendations
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', fontWeight: 600, background: 'rgba(251,191,36,0.12)', color: '#FBBF24' }}>
                  {health.recommendations.length}
                </span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {health.recommendations.map(rec => {
                  const Icon = categoryIcons[rec.category] || Lightbulb;
                  const colors = severityColors[rec.severity];
                  return (
                    <div key={rec.id} style={{
                      borderRadius: '10px', padding: '16px',
                      background: colors.bg, border: `1px solid ${colors.border}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `${colors.color}15`,
                        }}>
                          <Icon size={16} color={colors.color} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>{rec.title}</span>
                            <span style={{
                              fontSize: '9px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700,
                              background: `${colors.color}20`, color: colors.color, textTransform: 'uppercase',
                            }}>
                              {rec.severity}
                            </span>
                            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
                              {rec.category}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
                            {rec.description}
                          </div>
                          <div style={{ fontSize: '11px', color: colors.color, fontWeight: 500 }}>
                            Suggested: {rec.action}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {health.recommendations.length === 0 && (
                  <div style={{
                    borderRadius: '10px', padding: '24px', textAlign: 'center',
                    background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)',
                  }}>
                    <Shield size={20} color="#4ADE80" style={{ marginBottom: '8px' }} />
                    <div style={{ fontSize: '13px', color: '#4ADE80' }}>No recommendations — platform is optimized!</div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
}
