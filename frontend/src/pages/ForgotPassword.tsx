import { useState } from 'react';
import { Mail, ArrowLeft, CheckCircle, Loader2, KeyRound } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Request failed');
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0f1e', padding: '24px' }}>
      <div style={{ maxWidth: '420px', width: '100%' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)' }}>
            <span style={{ color: 'white', fontWeight: 900, fontSize: '16px' }}>F</span>
          </div>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'white' }}>FlowOps</span>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(74,222,128,0.15)' }}>
              <CheckCircle size={28} color="#4ADE80" />
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white', marginBottom: '12px' }}>Check Your Email</h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.6', marginBottom: '24px' }}>
              If an account exists for <strong style={{ color: 'white' }}>{email}</strong>, we've sent a password reset link. The link expires in 1 hour.
            </p>
            <a href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: '#6C9EFF', textDecoration: 'none' }}>
              <ArrowLeft size={14} /> Back to Login
            </a>
          </div>
        ) : (
          <>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(108,158,255,0.12)' }}>
              <KeyRound size={24} color="#6C9EFF" />
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>Forgot Password?</h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '28px' }}>
              Enter your email and we'll send you a link to reset your password.
            </p>

            {error && (
              <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                  <Mail size={12} /> Email Address
                </label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.co.za"
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }} />
              </div>

              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? 'rgba(108,158,255,0.4)' : 'linear-gradient(135deg, #6C9EFF, #A78BFA)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
                {loading ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : 'Send Reset Link'}
              </button>
            </form>

            <p style={{ marginTop: '20px', textAlign: 'center' }}>
              <a href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
                <ArrowLeft size={14} /> Back to Login
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
