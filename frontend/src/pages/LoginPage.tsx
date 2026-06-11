import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // login() now returns user data directly AND handles redirect internally
      await login(email.trim(), password);
      // Note: AuthContext.login() now does window.location.href redirect
      // so we don't need navigate() here anymore
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f1e' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-md p-8 rounded-2xl" 
        style={{ background: 'rgba(15,22,45,0.9)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h1 className="text-2xl font-bold text-white mb-6 text-center">FlowOps Login</h1>
        
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: loading ? 'rgba(108,158,255,0.5)' : 'linear-gradient(135deg, #6C9EFF, #A78BFA)' }}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </div>
      </form>
    </div>
  );
}
