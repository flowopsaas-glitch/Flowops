import { useState, useEffect } from 'react';
import { UserPlus, CheckCircle, XCircle, Clock, Link2, Send, RefreshCw, Mail } from 'lucide-react';
import SuperAdminLayout from '@/components/supertenant/SuperAdminLayout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface SignupRequest {
  id: number;
  companyName: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string | null;
  requestedPlan: string;
  message: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  aiTriage: string | null;
  aiPriority: string | null;
  createdAt: string;
  approvedAt: string | null;
  generatedEmail: string | null;
}

interface Stats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

const priorityColors: Record<string, { bg: string; color: string }> = {
  HIGH: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
  MEDIUM: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
  LOW: { bg: 'rgba(108,158,255,0.12)', color: '#6C9EFF' },
};

const planColors: Record<string, string> = {
  ENTERPRISE: '#A78BFA',
  PROFESSIONAL: '#6C9EFF',
  STARTER: '#4ADE80',
};

export default function SuperAdminSignups() {
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', companyName: '', plan: 'STARTER' });
  const [inviteResult, setInviteResult] = useState<{ signupUrl: string } | null>(null);

  const token = localStorage.getItem('access_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadData = async () => {
    setLoading(true);
    try {
      const [reqRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/onboarding/requests?status=${filter}`, { headers }),
        fetch(`${API_BASE}/onboarding/stats`, { headers }),
      ]);
      if (reqRes.ok) setRequests(await reqRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [filter]);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${API_BASE}/onboarding/approve/${id}`, { method: 'POST', headers });
      if (res.ok) {
        const data = await res.json();
        alert(`✅ Approved! Credentials sent to ${data.user.email}\nGenerated password: ${data.generatedPassword}`);
        loadData();
      } else {
        const err = await res.json();
        alert(`Error: ${err.message}`);
      }
    } catch (e) { console.error(e); }
    setActionLoading(null);
  };

  const handleReject = async (id: number) => {
    if (!confirm('Are you sure you want to reject this request?')) return;
    setActionLoading(id);
    try {
      await fetch(`${API_BASE}/onboarding/reject/${id}`, { method: 'POST', headers, body: JSON.stringify({}) });
      loadData();
    } catch (e) { console.error(e); }
    setActionLoading(null);
  };

  const handleInvite = async () => {
    if (!inviteForm.email || !inviteForm.companyName) return;
    try {
      const res = await fetch(`${API_BASE}/onboarding/invite-link`, {
        method: 'POST', headers,
        body: JSON.stringify(inviteForm),
      });
      if (res.ok) {
        const data = await res.json();
        setInviteResult(data);
      }
    } catch (e) { console.error(e); }
  };

  return (
    <SuperAdminLayout onRefresh={loadData} loading={loading}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white', margin: 0 }}>Signup Requests</h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
              Manage client signups and send invite links
            </p>
          </div>
          <button onClick={() => setInviteModal(true)} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
            background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)', color: 'white',
            border: 'none', cursor: 'pointer',
          }}>
            <Link2 size={14} /> Generate Invite Link
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total', value: stats.total, icon: Mail, color: '#6C9EFF' },
              { label: 'Pending', value: stats.pending, icon: Clock, color: '#FBBF24' },
              { label: 'Approved', value: stats.approved, icon: CheckCircle, color: '#4ADE80' },
              { label: 'Rejected', value: stats.rejected, icon: XCircle, color: '#F87171' },
            ].map(s => (
              <div key={s.label} style={{ borderRadius: '12px', padding: '16px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${s.color}15` }}>
                  <s.icon size={18} color={s.color} />
                </div>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'white' }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {['PENDING', 'APPROVED', 'REJECTED'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${filter === s ? 'rgba(108,158,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
              background: filter === s ? 'rgba(108,158,255,0.15)' : 'rgba(255,255,255,0.03)',
              color: filter === s ? '#6C9EFF' : 'rgba(255,255,255,0.5)',
            }}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Request List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {requests.map(req => (
            <div key={req.id} style={{
              borderRadius: '12px', padding: '16px 20px',
              background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: 'white' }}>{req.companyName}</span>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, background: `${planColors[req.requestedPlan] || '#6C9EFF'}15`, color: planColors[req.requestedPlan] || '#6C9EFF' }}>
                      {req.requestedPlan}
                    </span>
                    {req.aiPriority && (
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', fontWeight: 600, ...(priorityColors[req.aiPriority] || priorityColors.MEDIUM) }}>
                        {req.aiPriority}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                    {req.contactName} • {req.contactEmail} {req.contactPhone && `• ${req.contactPhone}`}
                  </div>
                  {req.aiTriage && (
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', marginTop: '6px' }}>
                      🤖 AI: {req.aiTriage}
                    </div>
                  )}
                  {req.message && (
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '6px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)' }}>
                      "{req.message}"
                    </div>
                  )}
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>
                    Submitted: {new Date(req.createdAt).toLocaleString()}
                    {req.approvedAt && ` • Approved: ${new Date(req.approvedAt).toLocaleString()}`}
                  </div>
                </div>

                {/* Actions */}
                {req.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button onClick={() => handleApprove(req.id)} disabled={actionLoading === req.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        background: 'rgba(74,222,128,0.15)', color: '#4ADE80',
                        border: '1px solid rgba(74,222,128,0.3)', cursor: 'pointer',
                      }}>
                      <CheckCircle size={14} /> Approve
                    </button>
                    <button onClick={() => handleReject(req.id)} disabled={actionLoading === req.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        background: 'rgba(248,113,113,0.15)', color: '#F87171',
                        border: '1px solid rgba(248,113,113,0.3)', cursor: 'pointer',
                      }}>
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                )}

                {req.status === 'APPROVED' && (
                  <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', fontWeight: 600, background: 'rgba(74,222,128,0.12)', color: '#4ADE80' }}>
                    ✓ Approved
                  </span>
                )}
                {req.status === 'REJECTED' && (
                  <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', fontWeight: 600, background: 'rgba(248,113,113,0.12)', color: '#F87171' }}>
                    ✗ Rejected
                  </span>
                )}
              </div>
            </div>
          ))}

          {!loading && requests.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
              No {filter.toLowerCase()} signup requests
            </div>
          )}
        </div>
      </div>

      {/* Invite Link Modal */}
      {inviteModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div style={{ borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '440px', background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'white', marginBottom: '20px' }}>Generate Invite Link</h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>Email</label>
              <input value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="client@company.co.za" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>Company Name</label>
              <input value={inviteForm.companyName} onChange={e => setInviteForm({ ...inviteForm, companyName: e.target.value })}
                placeholder="Company name" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>Plan</label>
              <select value={inviteForm.plan} onChange={e => setInviteForm({ ...inviteForm, plan: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }}>
                <option value="STARTER" style={{ background: '#0f1629' }}>Starter</option>
                <option value="PROFESSIONAL" style={{ background: '#0f1629' }}>Professional</option>
                <option value="ENTERPRISE" style={{ background: '#0f1629' }}>Enterprise</option>
              </select>
            </div>

            {inviteResult && (
              <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#4ADE80', marginBottom: '6px' }}>✓ Invite link generated & emailed!</div>
                <input readOnly value={inviteResult.signupUrl} onClick={e => (e.target as HTMLInputElement).select()}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.3)', border: 'none', outline: 'none' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => { setInviteModal(false); setInviteResult(null); }}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>
                Close
              </button>
              <button onClick={handleInvite}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Send size={13} /> Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </SuperAdminLayout>
  );
}
