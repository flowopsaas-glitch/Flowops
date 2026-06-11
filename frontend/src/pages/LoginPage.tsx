import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Truck, Building2, Package, Users, Shield, LogIn } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email.trim(), password);
      // AuthContext.login() handles redirect based on role
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setLoading(false);
    }
  };

  const roleHints = [
    { icon: Shield, role: 'Super Admin', desc: 'Platform owner control', color: '#A78BFA' },
    { icon: Building2, role: 'Tenant Admin', desc: 'Company management', color: '#6C9EFF' },
    { icon: Truck, role: 'Dispatcher', desc: 'Dispatch board & routes', color: '#4ADE80' },
    { icon: Package, role: 'Warehouse Clerk', desc: 'Inventory & stock', color: '#FBBF24' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0a0f1e' }}>
      {/* Left: Login Form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
        <div style={{ maxWidth: '420px', width: '100%' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '40px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #6C9EFF, #A78BFA)',
            }}>
              <span style={{ color: 'white', fontWeight: 900, fontSize: '16px' }}>F</span>
            </div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'white', letterSpacing: '0.5px' }}>FlowOps</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>Logistics Command Platform</div>
            </div>
          </div>

          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>Welcome Back</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px' }}>
            Sign in to access your FlowOps workspace
          </p>

          {error && (
            <div style={{
              marginBottom: '20px', padding: '14px 16px', borderRadius: '10px', fontSize: '13px',
              background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
              border: '1px solid rgba(239,68,68,0.2)',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@company.co.za"
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: '12px', fontSize: '14px', color: 'white',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>
                Password
                <a href="#" style={{ color: '#6C9EFF', textDecoration: 'none', fontSize: '11px' }}>Forgot password?</a>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: '12px', fontSize: '14px', color: 'white',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none',
                }}
              />
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
              color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? 'rgba(108,158,255,0.4)' : 'linear-gradient(135deg, #6C9EFF, #A78BFA)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s',
            }}>
              {loading ? (
                <>Signing in...</>
              ) : (
                <><LogIn size={16} /> Sign In</>
              )}
            </button>
          </form>

          {/* Sign up link */}
          <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
            Don't have an account?{' '}
            <a href="/signup" style={{ color: '#6C9EFF', textDecoration: 'none', fontWeight: 500 }}>Request Access</a>
          </p>

          {/* Driver portal link */}
          <p style={{ marginTop: '12px', textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
            Driver?{' '}
            <a href="/driver/portal" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>Use Driver Portal</a>
          </p>
        </div>
      </div>

      {/* Right: Role panel (hidden on mobile) */}
      <div style={{
        width: '380px', padding: '48px 32px', display: 'none',
        background: 'rgba(15,22,45,0.6)', borderLeft: '1px solid rgba(255,255,255,0.06)',
        flexDirection: 'column', justifyContent: 'center',
      }} className="lg:!flex">
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            One Platform, Every Role
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'white', lineHeight: '1.4' }}>
            Login once — you'll be directed to your workspace automatically
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {roleHints.map(({ icon: Icon, role, desc, color }) => (
            <div key={role} style={{
              display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px',
              borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${color}15`,
              }}>
                <Icon size={18} color={color} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>{role}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: '32px', padding: '16px', borderRadius: '12px',
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', lineHeight: '1.6' }}>
            Your role is determined by your account. After login, you'll be automatically redirected to your designated workspace. No separate login pages needed.
          </div>
        </div>
      </div>
    </div>
  );
}
