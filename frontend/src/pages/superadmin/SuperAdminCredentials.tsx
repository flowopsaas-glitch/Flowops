import { useState, useEffect } from 'react';
import { Key, UserPlus, RefreshCw, Eye, EyeOff, Copy, CheckCircle, Building2, Mail, Shield } from 'lucide-react';
import SuperAdminLayout from '@/components/supertenant/SuperAdminLayout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface Company {
  id: number;
  name: string;
  plan: string;
}

interface UserRecord {
  id: number;
  email: string;
  name?: string;
  role: string;
  companyId: number;
  company?: { id: number; name: string };
  createdAt?: string;
}

export default function SuperAdminCredentials() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'create' | 'reset'>('create');

  // Create form
  const [createForm, setCreateForm] = useState({ companyId: '', email: '', name: '', password: '', role: 'ADMIN' });
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState<{ email: string; password: string } | null>(null);
  const [createError, setCreateError] = useState('');

  // Reset form
  const [resetUserId, setResetUserId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const [resetError, setResetError] = useState('');

  // UI
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState('');

  const token = localStorage.getItem('access_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    const load = async () => {
      try {
        const [compRes, usersRes] = await Promise.all([
          fetch(`${API_BASE}/companies`, { headers }),
          fetch(`${API_BASE}/users`, { headers }),
        ]);
        if (compRes.ok) setCompanies(await compRes.json());
        if (usersRes.ok) {
          const data = await usersRes.json();
          setUsers(Array.isArray(data) ? data : data.users || []);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const special = '!@#$%';
    let pwd = '';
    for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    pwd += special[Math.floor(Math.random() * special.length)];
    pwd += new Date().getFullYear();
    return pwd;
  };

  const handleCreate = async () => {
    if (!createForm.companyId || !createForm.email) {
      setCreateError('Company and email are required');
      return;
    }
    setCreateLoading(true);
    setCreateError('');
    setCreateResult(null);

    const password = createForm.password || generatePassword();

    try {
      const res = await fetch(`${API_BASE}/users/my-company`, {
        method: 'POST',
        headers: { ...headers, 'x-company-override': createForm.companyId },
        body: JSON.stringify({
          email: createForm.email.toLowerCase().trim(),
          password,
          name: createForm.name || createForm.email.split('@')[0],
          role: createForm.role,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to create user');
      }

      setCreateResult({ email: createForm.email, password });
      // Refresh user list
      const usersRes = await fetch(`${API_BASE}/users`, { headers });
      if (usersRes.ok) setUsers(await usersRes.json());
    } catch (err: any) {
      setCreateError(err.message);
    }
    setCreateLoading(false);
  };

  const handleReset = async () => {
    if (!resetUserId) {
      setResetError('Please select a user');
      return;
    }
    setResetLoading(true);
    setResetError('');
    setResetResult(null);

    const newPassword = resetPassword || generatePassword();

    try {
      const res = await fetch(`${API_BASE}/users/${resetUserId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ password: newPassword }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to reset password');
      }

      const user = users.find(u => u.id === Number(resetUserId));
      setResetResult({ email: user?.email || '', password: newPassword });
    } catch (err: any) {
      setResetError(err.message);
    }
    setResetLoading(false);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(''), 2000);
  };

  const adminUsers = users.filter(u => ['ADMIN', 'COMPANY_ADMIN', 'SUPER_ADMIN'].includes(u.role));

  return (
    <SuperAdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px' }}>
        {/* Header */}
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white', margin: 0 }}>Tenant Admin Credentials</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
            Create new admin accounts or reset passwords for tenant companies
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { setTab('create'); setCreateResult(null); setCreateError(''); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${tab === 'create' ? 'rgba(108,158,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
              background: tab === 'create' ? 'rgba(108,158,255,0.15)' : 'rgba(255,255,255,0.03)',
              color: tab === 'create' ? '#6C9EFF' : 'rgba(255,255,255,0.5)',
            }}>
            <UserPlus size={14} /> Create Admin
          </button>
          <button onClick={() => { setTab('reset'); setResetResult(null); setResetError(''); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${tab === 'reset' ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)'}`,
              background: tab === 'reset' ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.03)',
              color: tab === 'reset' ? '#FBBF24' : 'rgba(255,255,255,0.5)',
            }}>
            <Key size={14} /> Reset Password
          </button>
        </div>

        {/* ─── CREATE ADMIN TAB ─── */}
        {tab === 'create' && (
          <div style={{ borderRadius: '12px', padding: '24px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'white', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={16} color="#6C9EFF" /> Create Tenant Admin
            </h2>

            {createError && (
              <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', fontSize: '13px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}>
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Company Select */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                  <Building2 size={12} /> Select Company *
                </label>
                <select value={createForm.companyId} onChange={e => setCreateForm({ ...createForm, companyId: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }}>
                  <option value="" style={{ background: '#0f1629' }}>— Select a company —</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id} style={{ background: '#0f1629' }}>{c.name} ({c.plan})</option>
                  ))}
                </select>
              </div>

              {/* Email */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                  <Mail size={12} /> Admin Email *
                </label>
                <input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="admin@company.co.za"
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
              </div>

              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                  Display Name
                </label>
                <input type="text" value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="John Admin"
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
              </div>

              {/* Password */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                  <span><Key size={12} style={{ display: 'inline', marginRight: '4px' }} /> Password (leave blank to auto-generate)</span>
                  <button type="button" onClick={() => setCreateForm({ ...createForm, password: generatePassword() })}
                    style={{ fontSize: '11px', color: '#6C9EFF', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Generate
                  </button>
                </label>
                <div style={{ position: 'relative' }}>
                  <input type={showPassword ? 'text' : 'password'} value={createForm.password}
                    onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Auto-generated if empty"
                    style={{ width: '100%', padding: '12px', paddingRight: '40px', borderRadius: '10px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {showPassword ? <EyeOff size={16} color="rgba(255,255,255,0.4)" /> : <Eye size={16} color="rgba(255,255,255,0.4)" />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                  <Shield size={12} /> Role
                </label>
                <select value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }}>
                  <option value="ADMIN" style={{ background: '#0f1629' }}>Admin (full company access)</option>
                  <option value="COMPANY_ADMIN" style={{ background: '#0f1629' }}>Company Admin</option>
                  <option value="OPERATOR" style={{ background: '#0f1629' }}>Operator</option>
                  <option value="DISPATCHER" style={{ background: '#0f1629' }}>Dispatcher</option>
                </select>
              </div>

              {/* Submit */}
              <button onClick={handleCreate} disabled={createLoading}
                style={{
                  padding: '14px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                  color: 'white', border: 'none', cursor: createLoading ? 'not-allowed' : 'pointer',
                  background: createLoading ? 'rgba(108,158,255,0.4)' : 'linear-gradient(135deg, #6C9EFF, #A78BFA)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                {createLoading ? <><RefreshCw size={14} className="animate-spin" /> Creating...</> : <><UserPlus size={14} /> Create Admin Account</>}
              </button>
            </div>

            {/* Success Result */}
            {createResult && (
              <CredentialCard email={createResult.email} password={createResult.password} copied={copied} onCopy={copyToClipboard} />
            )}
          </div>
        )}

        {/* ─── RESET PASSWORD TAB ─── */}
        {tab === 'reset' && (
          <div style={{ borderRadius: '12px', padding: '24px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'white', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Key size={16} color="#FBBF24" /> Reset Tenant Admin Password
            </h2>

            {resetError && (
              <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', fontSize: '13px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}>
                {resetError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* User Select */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                  Select User *
                </label>
                <select value={resetUserId} onChange={e => setResetUserId(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }}>
                  <option value="" style={{ background: '#0f1629' }}>— Select a user —</option>
                  {adminUsers.map(u => (
                    <option key={u.id} value={u.id} style={{ background: '#0f1629' }}>
                      {u.email} ({u.role}) {u.company ? `— ${u.company.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* New Password */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                  <span>New Password (leave blank to auto-generate)</span>
                  <button type="button" onClick={() => setResetPassword(generatePassword())}
                    style={{ fontSize: '11px', color: '#FBBF24', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Generate
                  </button>
                </label>
                <div style={{ position: 'relative' }}>
                  <input type={showPassword ? 'text' : 'password'} value={resetPassword}
                    onChange={e => setResetPassword(e.target.value)}
                    placeholder="Auto-generated if empty"
                    style={{ width: '100%', padding: '12px', paddingRight: '40px', borderRadius: '10px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {showPassword ? <EyeOff size={16} color="rgba(255,255,255,0.4)" /> : <Eye size={16} color="rgba(255,255,255,0.4)" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button onClick={handleReset} disabled={resetLoading}
                style={{
                  padding: '14px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                  color: 'white', border: 'none', cursor: resetLoading ? 'not-allowed' : 'pointer',
                  background: resetLoading ? 'rgba(251,191,36,0.4)' : 'linear-gradient(135deg, #FBBF24, #F59E0B)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                {resetLoading ? <><RefreshCw size={14} className="animate-spin" /> Resetting...</> : <><Key size={14} /> Reset Password</>}
              </button>
            </div>

            {/* Success Result */}
            {resetResult && (
              <CredentialCard email={resetResult.email} password={resetResult.password} copied={copied} onCopy={copyToClipboard} />
            )}
          </div>
        )}

        {/* Existing Admin Users Table */}
        <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'white', margin: 0 }}>Existing Admin Users</h3>
          </div>
          <table style={{ width: '100%', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Email', 'Name', 'Role', 'Company', 'Created'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {adminUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px 16px', color: 'white', fontWeight: 500 }}>{u.email}</td>
                  <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.6)' }}>{u.name || '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: 'rgba(108,158,255,0.12)', color: '#6C9EFF' }}>
                      {u.role.toLowerCase().replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.5)' }}>{u.company?.name || '—'}</td>
                  <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.4)' }}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {adminUsers.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No admin users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SuperAdminLayout>
  );
}

// ── Credential Card (shows generated creds with copy buttons) ───────────────
function CredentialCard({ email, password, copied, onCopy }: {
  email: string; password: string; copied: string; onCopy: (text: string, field: string) => void;
}) {
  return (
    <div style={{ marginTop: '20px', padding: '20px', borderRadius: '12px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <CheckCircle size={16} color="#4ADE80" />
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#4ADE80' }}>Credentials Ready</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>EMAIL</div>
            <div style={{ fontSize: '13px', color: 'white', fontFamily: 'monospace' }}>{email}</div>
          </div>
          <button onClick={() => onCopy(email, 'email')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            {copied === 'email' ? <CheckCircle size={14} color="#4ADE80" /> : <Copy size={14} color="rgba(255,255,255,0.4)" />}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>PASSWORD</div>
            <div style={{ fontSize: '13px', color: '#4ADE80', fontFamily: 'monospace' }}>{password}</div>
          </div>
          <button onClick={() => onCopy(password, 'password')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            {copied === 'password' ? <CheckCircle size={14} color="#4ADE80" /> : <Copy size={14} color="rgba(255,255,255,0.4)" />}
          </button>
        </div>
      </div>

      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '12px' }}>
        Share these credentials securely with the tenant admin. They should change the password on first login.
      </p>
    </div>
  );
}
