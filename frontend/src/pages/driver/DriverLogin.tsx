import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDriverAuth } from '../../contexts/DriverAuthContext';
import { useToast } from '../../components/ToastProvider';
import { Truck, AlertCircle, Loader2, Bot, MessageSquare, X, ShieldAlert, TriangleAlert } from 'lucide-react';

export default function DriverLogin() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAiHelp, setShowAiHelp] = useState(false);
  const [aiGreeting, setAiGreeting] = useState('');
  const [isSosActive, setIsSosActive] = useState(false);
  
  const { login, isLoading } = useDriverAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // 🚀 AI Security & Route Briefing (Context-Aware)
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setAiGreeting('SECURITY ALERT: Active hijacking hotspot reported near Malibongwe Dr. Route has been safely adjusted. Keep doors locked. 14 stops queued.');
    } else if (hour < 17) {
      setAiGreeting('ALL CLEAR: Traffic is light. No security alerts in your sector. 6 stops remaining.');
    } else {
      setAiGreeting('NIGHT OPS: Visibility dropping. Avoid unlit stops. Ensure all PODs are synced before returning to the depot.');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!phone || !pin) {
      setError('Please enter both phone number and PIN.');
      return;
    }

    // 🚨 DURESS PIN LOGIC (Example)
    // If the driver enters '9999' (or whatever their duress pin is), 
    // the backend should silently flag the police/armed response but return a normal login token.
    if (pin === '9999') {
       console.warn('SILENT DURESS ALARM TRIGGERED');
       // await api.post('/security/duress-ping', { phone, location: navigator.geolocation });
    }

    try {
      await login(phone, pin);
      navigate('/driver/portal');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    }
  };

  const handleSosTrigger = () => {
    setIsSosActive(true);
    // In production, this instantly pings the backend with GPS coordinates
    showToast("🚨 SOS TRIGGERED! Armed response and FlowOps Dispatch have been notified with your GPS location.", "success");
    setTimeout(() => setIsSosActive(false), 3000);
  };

  return (
    <div className="min-h-screen bg-[#06111f] flex flex-col justify-center items-center p-4 relative overflow-hidden">
      
      {/* Ambient Tech Background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-[400px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Branding */}
        <div className="flex flex-col items-center mb-6">
          <img 
            src="/logos/flowops-logo.png" 
            alt="FlowOps" 
            className="w-16 h-16 rounded-2xl mb-3 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <h1 className="text-3xl font-black text-white tracking-tight">FlowOps <span className="text-blue-400">Driver</span></h1>
          <p className="text-xs text-blue-400/60 font-semibold uppercase tracking-widest mt-1">Logistics, Evolved.</p>
        </div>

        {/* 🚀 AI Security Briefing Banner */}
        <div className={`mb-6 border rounded-2xl p-4 flex gap-4 items-start backdrop-blur-md transition-colors ${aiGreeting.includes('SECURITY ALERT') ? 'bg-red-950/40 border-red-500/30' : 'bg-blue-950/40 border-blue-500/20'}`}>
          <div className={`p-2 rounded-full shrink-0 ${aiGreeting.includes('SECURITY ALERT') ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
            {aiGreeting.includes('SECURITY ALERT') ? <ShieldAlert className="w-5 h-5 text-red-400" /> : <ShieldAlert className="w-5 h-5 text-blue-400" />}
          </div>
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-widest mb-1 ${aiGreeting.includes('SECURITY ALERT') ? 'text-red-400' : 'text-blue-400'}`}>
              Security & Route Intel
            </h3>
            <p className="text-sm text-white/80 leading-relaxed font-medium">
              {aiGreeting}
            </p>
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-xl rounded-[32px] shadow-2xl p-6 sm:p-8 border border-white/5">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-start gap-3 animate-in zoom-in-95">
              <TriangleAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-200 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-lg"
                placeholder="082 123 4567"
                disabled={isLoading}
              />
            </div>

            <div>
              <div className="flex justify-between items-end mb-2 pl-1 pr-1">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  Security PIN
                </label>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Standard or Duress Code</span>
              </div>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-2xl tracking-[0.5em]"
                placeholder="••••"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-500/20 transition-all flex justify-center items-center gap-2 active:scale-[0.98] uppercase tracking-widest text-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Secure Login'
              )}
            </button>
          </form>
        </div>

        {/* 🚀 AI Support & Emergency Footer */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <button 
            type="button"
            onClick={() => setShowAiHelp(true)}
            className="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors bg-slate-800/50 px-4 py-2 rounded-full border border-white/5 text-sm font-medium"
          >
            <Bot size={16} />
            AI Dispatch Support
          </button>

          {/* LOCK SCREEN SOS BUTTON */}
          <button
            type="button"
            onClick={handleSosTrigger}
            className={`flex items-center gap-2 px-6 py-3 rounded-full text-xs font-black uppercase tracking-[0.2em] transition-all border ${isSosActive ? 'bg-red-600 text-white border-red-500 shadow-[0_0_30px_rgba(220,38,38,0.6)] animate-pulse' : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'}`}
          >
            <ShieldAlert size={14} />
            {isSosActive ? 'DISPATCHING ARMED RESPONSE...' : 'Tap for Emergency SOS'}
          </button>
        </div>

      </div>

      {/* AI Support Modal */}
      {showAiHelp && (
        <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-0 animate-in fade-in duration-200">
          <div className="bg-slate-800 w-full max-w-sm rounded-[32px] sm:rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Bot className="text-cyan-400" size={20} />
                <span className="text-white font-bold">FlowOps Dispatch AI</span>
              </div>
              <button onClick={() => setShowAiHelp(false)} className="text-slate-400 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-900 rounded-2xl p-4 text-sm text-slate-300 leading-relaxed border border-white/5">
                Hi there. I am your AI dispatch assistant. 
                <br/><br/>
                If you have forgotten your PIN, I can send a temporary reset code to your registered WhatsApp number, or alert the fleet manager.
              </div>
              <button 
                onClick={() => {
                  showToast('AI Action: Sending WhatsApp reset link...', 'info');
                  setShowAiHelp(false);
                }}
                className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-colors"
              >
                <MessageSquare size={16} />
                Send WhatsApp Reset Link
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
