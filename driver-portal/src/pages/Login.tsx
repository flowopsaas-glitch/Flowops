import { useState } from 'react';
import { Phone, Lock, AlertCircle, Sparkles } from 'lucide-react';
import { driverApi } from '../services/api';

interface LoginProps {
  onLogin: (driver: any) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [phone, setPhone] = useState('+27821234567');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await driverApi.login(phone, pin);
      localStorage.setItem('driver', JSON.stringify(response.data));
      onLogin(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid phone number or PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      <div className="relative backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl p-8 w-full max-w-md border border-white/20">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl blur-2xl opacity-50 animate-pulse"></div>
              <div className="relative bg-gradient-to-br from-slate-800 to-blue-900 rounded-2xl p-6 shadow-2xl border-2 border-cyan-400/30">
                {/* Logo with fade-in */}
                <div className={`transition-opacity duration-500 ${logoLoaded ? 'opacity-100' : 'opacity-0'}`}>
                  <img 
                    src="/logos/flowops-logo.png" 
                    alt="FlowOps" 
                    className="w-32 h-32 object-contain"
                    onLoad={() => setLogoLoaded(true)}
                    onError={() => setLogoLoaded(true)}
                  />
                </div>
                {/* Fallback icon while loading */}
                {!logoLoaded && (
                  <div className="w-32 h-32 bg-gradient-to-br from-blue-400 via-cyan-400 to-blue-600 rounded-2xl flex items-center justify-center animate-pulse">
                    <span className="text-4xl font-bold text-white">F</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <h1 className="text-5xl font-black text-white mb-2 bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
            FlowOps
          </h1>
          <p className="text-cyan-200 text-xl font-bold mb-1">Driver Portal</p>
          <p className="text-cyan-300/80 flex items-center justify-center gap-2 text-sm">
            <Sparkles className="w-4 h-4" />
            <span className="font-medium italic">Logistics, Evolved</span>
            <Sparkles className="w-4 h-4" />
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-cyan-100 text-sm font-medium mb-2">Phone Number</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Phone className="h-5 w-5 text-cyan-300" />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="block w-full pl-11 pr-4 py-4 bg-white/10 border border-cyan-400/30 rounded-xl text-white placeholder-cyan-200/50 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                placeholder="+27821234567"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-cyan-100 text-sm font-medium mb-2">PIN</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-cyan-300" />
              </div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="block w-full pl-11 pr-4 py-4 bg-white/10 border border-cyan-400/30 rounded-xl text-white placeholder-cyan-200/50 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                placeholder="••••"
                maxLength={4}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 hover:from-blue-700 hover:via-cyan-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition-all disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-cyan-200/60">
          Contact dispatch if you forgot your PIN
        </p>
      </div>
    </div>
  );
}
