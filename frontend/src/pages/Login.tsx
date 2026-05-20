import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Users, Database, ArrowRight, Brain, Eye, EyeOff, Lock, Mail, Activity } from "lucide-react";
import {
  api,
  ApiError,
  getToken,
  setLoginMode,
  setToken,
  isOwnerMode,
  post,
} from '../api/client';

type LoginResponse = {
  access_token?: string;
  accessToken?: string;
  token?: string;
  user?: {
    id: number;
    email: string;
    role: string;
    companyId?: number | null;
    loginType?: "TENANT" | "OWNER";
  };
};

export default function Login() {
  const navigate = useNavigate();

  // 🚀 FIXED: Auto-populate email matching your active logistics database seed profile parameters
  const [email, setEmail] = useState("kadi@flowops.work");
  const [password, setPassword] = useState("GoGet2026!");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);

  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

  // Session token loop checks
  useEffect(() => {
    const token = getToken();
    if (token) {
      navigate(isOwnerMode() ? "/owner" : "/dashboard", { replace: true });
    }
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) return;
    setError("");
    setLoading(true);

    try {
      const result = await post<LoginResponse>(
        "/auth/login",
        { email, password });

      const token = result?.access_token || result?.accessToken || result?.token;

      if (!token) {
        throw new Error("Login succeeded but no token was returned.");
      }

      setToken(token);
      setLoginMode("TENANT");

      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Login failed. Check system connection context.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-[#020617] text-slate-100 flex items-center justify-center p-6 md:p-12 overflow-hidden font-sans">
      
      {/* Premium Background Blurred Atmospheric Glow Spheres */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Structural Container Layout */}
      <div className="relative z-10 max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        
        {/* Left Hand Marketing & Platform Features Grid Space */}
        <div className="lg:col-span-6 space-y-12">
          
          {/* Top Tech Stack Metadata Badges */}
          <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md shadow-inner">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">FlowOps Tenant Access</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">| DISPATCH · BILLING · AI · COMMS</span>
          </div>

          {/* Heading Matrix Hook */}
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] text-white">
              The operations workspace <br />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-indigo-500 bg-clip-text text-transparent">
                modern courier teams
              </span> run on.
            </h1>
            <p className="text-sm md:text-base text-slate-400 max-w-xl font-medium leading-relaxed">
              Sign in to access operations, dispatch, waybills, billing, and AI workflow tools for your tenant company. Same premium shell as dispatch, inbox, and billing — not a bolt-on portal.
            </p>
          </div>

          {/* Interactive Feature Matrix Info Grid Layout Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl hover:border-blue-500/30 transition-all duration-300 group">
              <div className="rounded-xl bg-blue-500/10 w-10 h-10 flex items-center justify-center text-blue-400 mb-4 group-hover:bg-blue-500/20 transition-all">
                <Users size={18} />
              </div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 mb-1">Tenant Control</h3>
              <p className="text-[11px] text-slate-400 font-medium leading-normal">Courier companies only see their own tenant environment and permitted features.</p>
            </div>

            <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl hover:border-indigo-500/30 transition-all duration-300 group">
              <div className="rounded-xl bg-indigo-500/10 w-10 h-10 flex items-center justify-center text-indigo-400 mb-4 group-hover:bg-indigo-500/20 transition-all">
                <Database size={18} />
              </div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 mb-1">Protected Operations</h3>
              <p className="text-[11px] text-slate-400 font-medium leading-normal">Dispatch, drivers, clients, invoicing, and AI control stay isolated per tenant.</p>
            </div>

            <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 pb-7 shadow-xl hover:border-indigo-500/20 transition-all duration-300 group">
              <div className="rounded-xl bg-slate-500/10 w-10 h-10 flex items-center justify-center text-slate-400 mb-4 group-hover:bg-slate-500/20 transition-all">
                <Shield size={18} />
              </div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 mb-1">Owner Layer Hidden</h3>
              <p className="text-[11px] text-slate-400 font-medium leading-normal">The FlowOps owner layer is completely separate and not exposed in tenant navigation.</p>
            </div>

          </div>
        </div>

        {/* Right Hand Interactive Authentication Card Form Panel Sheet */}
        <div className="lg:col-span-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 md:p-10 shadow-2xl space-y-8">
          
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.25em] text-white/45 font-bold animate-pulse flex items-center gap-1.5">
              <Activity size={12} className="text-blue-400" /> Tailwind v4 Active System Gateway
            </div>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white">Tenant Sign In</h2>
            <p className="text-xs font-bold text-slate-400">Use your courier company account. This page is not for the hidden owner layer.</p>
          </div>

          {/* Core Sign-In Interactive Fields */}
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Email Address</label>
              <div className="relative flex items-center">
                <Mail className="absolute left-4 text-slate-500" size={16} />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors font-medium shadow-inner"
                  placeholder="kadi@flowops.work"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Security Password</label>
              <div className="relative flex items-center">
                <Lock className="absolute left-4 text-slate-500" size={16} />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-12 py-3.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors font-medium shadow-inner"
                  placeholder="••••••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error Exception Alerts Output Rendering */}
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-200 font-bold leading-normal">
                ⚠️ Error: {error}
              </div>
            )}

            {/* Terms Agreement Checkbox Container */}
            <div className="flex items-start gap-3 bg-black/20 p-4 rounded-xl border border-white/5 shadow-inner">
              <input
                type="checkbox"
                id="terms"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 checked:bg-blue-600 rounded border-white/10 bg-black/40 cursor-pointer"
              />
              <label htmlFor="terms" className="text-[11px] font-semibold text-slate-300 leading-snug cursor-pointer select-none">
                I agree to the <span className="text-blue-400 font-bold underline hover:text-blue-300 transition-colors"><a href='/legal/terms' target='_blank' className='text-blue-400 font-bold underline hover:text-blue-300 transition-colors'>Terms of Service</a></span> and{" "}
                <span className="text-blue-400 font-bold underline hover:text-blue-300 transition-colors"><a href='/legal/privacy' target='_blank' className='text-blue-400 font-bold underline hover:text-blue-300 transition-colors'>Privacy Notice</a></span>.
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !agreed}
              className={`w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 border border-white/10 ${
                agreed && !loading
                  ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/30 active:scale-[0.99] cursor-pointer"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed border-none shadow-none"
              }`}
            >
              {loading ? "Verifying Gateway..." : "Sign in to Control Workspace"}
              <ArrowRight size={14} />
            </button>
          </form>

          {/* Dev Hint Card locked safely behind environmental visibility flags */}
          {isDevelopment && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 space-y-1.5 shadow-inner">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-blue-400 italic">
                <Brain size={10} className="animate-pulse" /> Dev-Only Test Staging Credentials:
              </div>
              <div className="font-mono text-[10px] text-slate-400 space-y-0.5 font-bold">
                <div><span className="text-slate-500">Email:</span> kadi@flowops.work</div>
                <div><span className="text-slate-500">Pass :</span> GoGet2026!</div>
              </div>
            </div>
          )}

          <div className="text-center pt-2">
            <button className="text-[11px] font-bold text-slate-500 hover:text-slate-400 tracking-wide transition-colors">
              Need an enterprise tenant account? Request gateway access
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

