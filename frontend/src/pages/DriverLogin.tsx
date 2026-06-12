import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Lock, Phone, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../api/client'; // Adjust path if needed
import { setAccessToken, setLoginMode, setStoredUser } from '../lib/session';

export default function DriverLogin() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Hit the new backend route
      const res = await api.post('/auth/driver-login', { phone, pin });
      
      // Store the secure token via the canonical session module — replaces
      // the legacy `driverToken` / `driverInfo` pair.
      setAccessToken(res.data.access_token);
      setLoginMode("driver");
      setStoredUser(res.data.driver);
      
      // Push them to their active manifest
      navigate('/manifest');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Check network.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#020817] min-h-screen flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-slate-900 rounded-[32px] p-8 shadow-2xl border border-white/5 relative overflow-hidden">
        
        {/* Background glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-blue-500/20 blur-[50px] rounded-full pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center mb-10">
          <div className="bg-blue-500/10 p-4 rounded-2xl mb-4 border border-blue-500/20">
            <Truck size={40} className="text-blue-500" />
          </div>
          <h1 className="text-3xl font-black text-white italic tracking-tighter uppercase">Driver Portal</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2 flex items-center gap-1">
            <ShieldCheck size={14} className="text-emerald-500" /> Secure Terminal
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 relative z-10">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-xs font-bold text-center">
              {error}
            </div>
          )}

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 mb-1 block">Phone Number</label>
            <div className="relative">
              <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:bg-blue-500/5 transition-all"
                placeholder="082 123 4567"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 mb-1 block">Security PIN</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:bg-blue-500/5 transition-all text-center tracking-[0.5em] text-lg"
                placeholder="••••"
                required
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full mt-8 bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-2xl font-black uppercase text-sm tracking-widest shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Authorize Fleet Access'}
            {!loading && <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>
      </div>
    </div>
  );
}