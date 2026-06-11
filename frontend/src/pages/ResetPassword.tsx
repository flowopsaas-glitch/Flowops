import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle, Loader2, Eye, EyeOff, AlertTriangle, ArrowLeft } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const verify = async () => {
      if (!token) { setVerifying(false); setTokenValid(false); return; }
      try {
        const res = await fetch(`${API_URL}/auth/verify-reset-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          const data = await res.json();
          setTokenValid(true);
          setEmail(data.email || '');
        } else {
          setTokenValid(false);
        }
      } catch {
        setTokenValid(false);
      }
      setVerifying(false);
    };
    verify();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Reset failed');
      }
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0f1e', padding: '24px' }}>
      <div style={{ maxWidth: '420px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)' }}>
            <span style={{ color: 'white', fontWeight: 900, fontSize: '16px' }}>F</span>
          </div>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'white' }}>FlowOps</span>
        </div>
        {children}
      </div>
    </div>
  );

  if (verifying) {
    return wrap(
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Loader2 size={28} color="#6C9EFF" className="animate-spin" style={{ margin: '0 auto 12px' }} />
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>Verifying reset link...</p>
      </div>
    );
  }

  if (!tokenValid) {
    return wrap(
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(248,113,113,0.15)' }}>
          <AlertTriangle size={28} color="#F87171" />
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'white', marginBottom: '12px' }}>Invalid or Expired Link</h1>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.6', marginBottom: '24px' }}>
          This password reset link is invalid or has expired. Reset links are valid for 1 hour.
        </p>
        <a href="/forgot-password" style={{ display: 'inline-block', padding: '12px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, color: 'white', textDecoration: 'none', background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)' }}>
          Request New Link
        </a>
      </div>
    );
  }

  if (done) {
    return wrap(
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(74,222,128,0.15)' }}>
          <CheckCircle size={28} color="#4ADE80" />
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white', marginBottom: '12px' }}>Password Reset!</h1>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.6', marginBottom: '24px' }}>
          Your password has been updated. You can now log in with your new password.
        </p>
        <a href="/login" style={{ display: 'inline-block', padding: '12px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, color: 'white', textDecoration: 'none', background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)' }}>
          Go to Login
        </a>
      </div>
    );
  }

  return wrap(
    <>
      <div style={{ width: '48px', height: '48px', borderRadius: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(108,158,255,0.12)' }}>
        <Lock size={24} color="#6C9EFF" />
      </div>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>Set New Password</h1>
      <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '28px' }}>
        {email ? `Resetting password for ${email}` : 'Choose a strong new password.'}
      </p>

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>New Password</label>
          <div style={{ position: 'relative' }}>
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="At least 6 characters"
              style={{ width: '100%', padding: '14px 16px', paddingRight: '44px', borderRadius: '12px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {showPassword ? <EyeOff size={16} color="rgba(255,255,255,0.4)" /> : <Eye size={16} color="rgba(255,255,255,0.4)" />}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>Confirm Password</label>
          <input type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Re-enter password"
            style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
        </div>

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
          color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          background: loading ? 'rgba(108,158,255,0.4)' : 'linear-gradient(135deg, #6C9EFF, #A78BFA)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}>
          {loading ? <><Loader2 size={16} className="animate-spin" /> Resetting...</> : 'Reset Password'}
        </button>
      </form>

      <p style={{ marginTop: '20px', textAlign: 'center' }}>
        <a href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Back to Login
        </a>
      </p>
    </>
  );
}
