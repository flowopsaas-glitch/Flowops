import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Warehouse, Lock, Mail, LogIn, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export default function WarehouseLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Invalid credentials');
      }
      const data = await res.json();
      const role = data.user?.role?.toUpperCase();
      if (role !== 'WAREHOUSE_CLERK' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        throw new Error('Access denied. This login is for Warehouse Clerks only.');
      }
      localStorage.setItem('access_token', data.accessToken);
      navigate('/warehouse', { replace: true });
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #020617 0%, #0c1a3a 50%, #020617 100%)',
      padding: '24px', fontFamily: 'sans-serif',
    }}>
      <div style={{ maxWidth: '400px', width: '100%' }}>
        {/* Logo + Branding */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <img src="/logos/flowops-logo.png" alt="FlowOps"
            style={{ width: '64px', height: '64px', borderRadius: '16px', objectFit: 'contain', margin: '0 auto 16px', display: 'block' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'white', margin: 0, letterSpacing: '-0.5px' }}>
            FlowOps <span style={{ color: '#FBBF24' }}>Warehouse</span>
          </h1>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginTop: '6px' }}>
            Clerk Workstation
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(15,22,45,0.9)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '24px', padding: '32px', backdropFilter: 'blur(20px)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Warehouse size={18} style={{ color: '#FBBF24' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>Sign In</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Warehouse operations access</div>
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', fontSize: '13px', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <Mail size={11} /> Email Address
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="clerk@company.co.za"
                style={{ width: '100%', padding: '13px 15px', borderRadius: '12px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <Lock size={11} /> Password
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Enter your password"
                style={{ width: '100%', padding: '13px 15px', borderRadius: '12px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
              color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? 'rgba(251,191,36,0.3)' : 'linear-gradient(135deg, #FBBF24, #F59E0B)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: '0 4px 20px rgba(251,191,36,0.2)',
            }}>
              {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Signing in...</> : <><LogIn size={16} /> Enter Warehouse</>}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
            Tenant staff?{' '}
            <a href="/login" style={{ color: '#6C9EFF', textDecoration: 'none', fontWeight: 600 }}>Use main login</a>
          </p>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
