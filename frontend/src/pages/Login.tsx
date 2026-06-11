// src/pages/Login.tsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Shield, Users, Database, ArrowRight, Brain, Eye, EyeOff, 
  Lock, Mail, Activity, AlertCircle, CheckCircle, Loader2, Key
} from "lucide-react";
import {
  api,
  ApiError,
  getToken,
  setLoginMode,
  setToken,
  isOwnerMode,
  post,
} from '../api/client';

// ============================================================================
// 🔐 TYPE DEFINITIONS
// ============================================================================
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

type PasswordStrength = {
  level: 0 | 1 | 2 | 3 | 4 | 5;
  label: 'Very Weak' | 'Weak' | 'Medium' | 'Strong' | 'Very Strong';
  color: 'red-500' | 'orange-500' | 'yellow-500' | 'lime-500' | 'emerald-500';
};

// ============================================================================
// 🔐 SECURITY: Environment-based dev credentials (NEVER hardcoded)
// ============================================================================

// ============================================================================
// 🎨 MAIN COMPONENT
// ============================================================================
export default function Login() {
  const navigate = useNavigate();

  // 🔐 Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [agreed, setAgreed] = useState(false);
  
  // 🔐 Security State
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({
    level: 0, label: 'Very Weak', color: 'red-500'
  });
  const [lastAttempt, setLastAttempt] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [isRateLimited, setIsRateLimited] = useState(false);

  // 🔐 Security Constants
  const RATE_LIMIT_MS = 2000; // 2 seconds between attempts
  const MAX_ATTEMPTS = 5;
  const RATE_LIMIT_COOLDOWN = 60000; // 1 minute after max attempts

  // ============================================================================
  // 🔐 SECURITY: Password Strength Calculator
  // ============================================================================
  const calculatePasswordStrength = useCallback((pwd: string): PasswordStrength => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;
    
    const levels: Record<number, PasswordStrength> = {
      0: { level: 0, label: 'Very Weak', color: 'red-500' },
      1: { level: 1, label: 'Weak', color: 'red-500' },
      2: { level: 2, label: 'Medium', color: 'orange-500' },
      3: { level: 3, label: 'Strong', color: 'yellow-500' },
      4: { level: 4, label: 'Very Strong', color: 'lime-500' },
      5: { level: 5, label: 'Very Strong', color: 'emerald-500' },
    };
    
    return levels[Math.min(score, 5)];
  }, []);

  useEffect(() => {
    if (password) {
      setPasswordStrength(calculatePasswordStrength(password));
    } else {
      setPasswordStrength({ level: 0, label: 'Very Weak', color: 'red-500' });
    }
  }, [password, calculatePasswordStrength]);

  // ============================================================================
  // 🔐 SECURITY: Rate Limiting Logic
  // ============================================================================
  const checkRateLimit = useCallback(() => {
    const now = Date.now();
    
    // Check if within minimum delay between attempts
    if (now - lastAttempt < RATE_LIMIT_MS) {
      setIsRateLimited(true);
      return false;
    }
    
    // Check if hit max attempts and still in cooldown
    if (attemptCount >= MAX_ATTEMPTS) {
      if (now - lastAttempt < RATE_LIMIT_COOLDOWN) {
        setIsRateLimited(true);
        return false;
      }
      // Reset after cooldown
      setAttemptCount(0);
      setIsRateLimited(false);
    }
    
    return true;
  }, [lastAttempt, attemptCount]);

  // ============================================================================
  // 🔐 SECURITY: Session Management
  // ============================================================================
  useEffect(() => {
    const token = getToken();
    if (token) {
      const role = user?.role?.toUpperCase();
      navigate(role === "DISPATCHER" ? "/tools/dispatch" : (isOwnerMode() ? "/owner" : "/dashboard"), { replace: true });
    }
    
    // Cleanup rate limit state on unmount
    return () => {
      setAttemptCount(0);
      setIsRateLimited(false);
    };
  }, [navigate]);

  // ============================================================================
  // 🔐 SUBMIT HANDLER
  // ============================================================================
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // 🔐 Security: Rate limit check
    if (!checkRateLimit()) {
      const remaining = Math.ceil((RATE_LIMIT_COOLDOWN - (Date.now() - lastAttempt)) / 1000);
      setError(remaining > 0 
        ? `Too many attempts. Please wait ${remaining}s before trying again.`
        : "Please wait before trying again."
      );
      return;
    }
    
    // 🔐 Security: Terms agreement check
    if (!agreed) {
      setError("Please agree to the Terms of Service to continue.");
      return;
    }
    
    // 🔐 Security: Input validation
    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }
    
    // Reset state for new attempt
    setError("");
    setSuccess("");
    setLoading(true);
    setLastAttempt(Date.now());
    setAttemptCount(prev => prev + 1);

    try {
      const result = await post<LoginResponse>("/auth/login", { 
        email: email.trim().toLowerCase(), 
        password 
      });

      const token = result?.access_token || result?.accessToken || result?.token;

      if (!token) {
        throw new Error("Login succeeded but no authentication token was returned.");
      }

      // 🔐 Security: Store token securely via client utility
      setToken(token);
      setLoginMode("TENANT");

      setSuccess("✅ Authentication successful. Redirecting...");
      
      // Small delay for UX feedback before redirect
      setTimeout(() => {
        const role = user?.role?.toUpperCase();
      navigate(role === "DISPATCHER" ? "/tools/dispatch" : "/dashboard", { replace: true });
      }, 1000);
      
    } catch (err: unknown) {
      // Increment attempt count on failure
      setAttemptCount(prev => prev + 1);
      
      // 🔐 Security: Generic error messages to prevent user enumeration
      if (err instanceof ApiError) {
        switch (err.status) {
          case 401:
            setError("❌ Invalid email or password. Please try again.");
            break;
          case 403:
            setError("❌ Account access denied. Contact support.");
            break;
          case 429:
            setError("❌ Too many login attempts. Please wait 60 seconds.");
            break;
          case 422:
            setError("❌ Invalid input format. Please check your credentials.");
            break;
          default:
            setError(err.message || "❌ Authentication failed. Please check your connection.");
        }
      } else if (err instanceof Error) {
        if (err.message.includes('Failed to fetch')) {
          setError("❌ Cannot connect to server. Check your internet connection.");
        } else {
          setError("❌ Login failed. Please try again.");
        }
      } else {
        setError("❌ An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ============================================================================
  // 🔐 DEV: Safe credential filling (only in dev, with confirmation)
  // ============================================================================

  // ============================================================================
  // 🎨 UI: Password strength meter bars
  // ============================================================================
  const renderPasswordStrengthBars = () => (
    <div className="flex gap-1 mt-1.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((level) => (
        <div
          key={level}
          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
            level <= passwordStrength.level
              ? `bg-${passwordStrength.color}`
              : 'bg-slate-700/50'
          }`}
        />
      ))}
    </div>
  );

  // ============================================================================
  // 🎨 RENDER: Main Component
  // ============================================================================
  return (
    <div className="relative min-h-screen bg-[#020617] text-slate-100 flex items-center justify-center p-4 md:p-8 overflow-hidden font-sans antialiased">
      
      {/* 🎨 Premium Background: Atmospheric Glow Spheres */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-violet-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* 🎨 Main Layout Container */}
      <div className="relative z-10 max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        
        {/* 🎨 Left Panel: Marketing & Features */}
        <div className="lg:col-span-6 space-y-8 lg:space-y-12 order-2 lg:order-1">
          
          {/* 🔗 Tech Stack Badge */}
          <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2.5 rounded-full backdrop-blur-md shadow-inner">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">FlowOps Tenant Access</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">|</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">DISPATCH · BILLING · AI · COMMS</span>
          </div>

          {/* 🎯 Hero Heading */}
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] text-white">
              The operations workspace <br />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-500 bg-clip-text text-transparent animate-gradient">
                modern courier teams
              </span> run on.
            </h1>
            <p className="text-sm md:text-base text-slate-400 max-w-xl font-medium leading-relaxed">
              Sign in to access operations, dispatch, waybills, billing, and AI workflow tools for your tenant company. 
              Same premium shell as dispatch, inbox, and billing — not a bolt-on portal.
            </p>
          </div>

          {/* 🧩 Feature Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Card 1: Tenant Control */}
            <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl hover:border-blue-500/30 hover:shadow-blue-500/10 transition-all duration-300 group">
              <div className="rounded-xl bg-blue-500/10 w-10 h-10 flex items-center justify-center text-blue-400 mb-4 group-hover:bg-blue-500/20 group-hover:scale-110 transition-all">
                <Users size={18} strokeWidth={2} />
              </div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 mb-1">Tenant Control</h3>
              <p className="text-[11px] text-slate-400 font-medium leading-normal">
                Courier companies only see their own tenant environment and permitted features.
              </p>
            </div>

            {/* Card 2: Protected Operations */}
            <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl hover:border-indigo-500/30 hover:shadow-indigo-500/10 transition-all duration-300 group">
              <div className="rounded-xl bg-indigo-500/10 w-10 h-10 flex items-center justify-center text-indigo-400 mb-4 group-hover:bg-indigo-500/20 group-hover:scale-110 transition-all">
                <Database size={18} strokeWidth={2} />
              </div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 mb-1">Protected Operations</h3>
              <p className="text-[11px] text-slate-400 font-medium leading-normal">
                Dispatch, drivers, clients, invoicing, and AI control stay isolated per tenant.
              </p>
            </div>

            {/* Card 3: Owner Layer Hidden */}
            <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 pb-7 shadow-xl hover:border-violet-500/20 hover:shadow-violet-500/10 transition-all duration-300 group">
              <div className="rounded-xl bg-slate-500/10 w-10 h-10 flex items-center justify-center text-slate-400 mb-4 group-hover:bg-slate-500/20 group-hover:scale-110 transition-all">
                <Shield size={18} strokeWidth={2} />
              </div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 mb-1">Owner Layer Hidden</h3>
              <p className="text-[11px] text-slate-400 font-medium leading-normal">
                The FlowOps owner layer is completely separate and not exposed in tenant navigation.
              </p>
            </div>
          </div>

          {/* 📊 Live Status Indicator */}
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>API: Online</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span>AI: Connected</span>
            </div>
            <span>•</span>
            <span>Region: ZA</span>
          </div>
        </div>

        {/* 🎨 Right Panel: Authentication Form */}
        <div className="lg:col-span-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[32px] p-6 md:p-10 shadow-2xl space-y-8 order-1 lg:order-2">
          
          {/* 🔐 Header Section */}
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.25em] text-white/45 font-bold animate-pulse flex items-center gap-1.5">
              <Activity size={12} className="text-blue-400" /> Secure Authentication Gateway
            </div>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white">Tenant Sign In</h2>
            <p className="text-xs font-bold text-slate-400">
              Use your courier company account. This page is not for the hidden owner layer.
            </p>
          </div>

          {/* 🔐 Login Form */}
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            
            {/* Email Field */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-4 text-slate-500 pointer-events-none" size={16} />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-medium shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="your@company.com"
                  required
                  disabled={loading || isRateLimited}
                  aria-describedby={error ? "email-error" : undefined}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">
                Security Password
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-4 text-slate-500 pointer-events-none" size={16} />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordStrength(calculatePasswordStrength(e.target.value));
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-12 py-3.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-medium shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="••••••••••••"
                  required
                  disabled={loading || isRateLimited}
                  minLength={8}
                  aria-describedby={error ? "password-error" : "password-strength"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading || isRateLimited}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              
              {/* 🔐 Password Strength Meter */}
              {password && (
                <div id="password-strength" className="mt-2 space-y-1" role="status" aria-live="polite">
                  {renderPasswordStrengthBars()}
                  <p className={`text-[9px] font-medium ${
                    passwordStrength.level <= 2 ? 'text-red-400' : 
                    passwordStrength.level <= 4 ? 'text-yellow-400' : 'text-emerald-400'
                  }`}>
                    {passwordStrength.label} password
                  </p>
                </div>
              )}
            </div>

            {/* 🔐 Error/Success Alerts */}
            {error && (
              <div 
                id="form-error"
                className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-200 font-bold leading-normal flex items-start gap-2 animate-in fade-in slide-in-from-top-2"
                role="alert"
                aria-live="assertive"
              >
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            
            {success && (
              <div 
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200 font-bold leading-normal flex items-start gap-2 animate-in fade-in slide-in-from-top-2"
                role="status"
                aria-live="polite"
              >
                <CheckCircle size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>{success}</span>
              </div>
            )}

            {/* 🔐 Terms Agreement */}
            <div className="flex items-start gap-3 bg-black/20 p-4 rounded-xl border border-white/5 shadow-inner">
              <input
                type="checkbox"
                id="terms"
                name="terms"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 checked:bg-blue-600 rounded border-white/10 bg-black/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed accent-blue-600"
                disabled={loading || isRateLimited}
                required
              />
              <label 
                htmlFor="terms" 
                className="text-[11px] font-semibold text-slate-300 leading-snug cursor-pointer select-none"
              >
                I agree to the{" "}
                <a 
                  href='/legal/terms' 
                  target='_blank' 
                  rel="noopener noreferrer" 
                  className='text-blue-400 font-bold underline hover:text-blue-300 transition-colors'
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a 
                  href='/legal/privacy' 
                  target='_blank' 
                  rel="noopener noreferrer" 
                  className='text-blue-400 font-bold underline hover:text-blue-300 transition-colors'
                >
                  Privacy Notice
                </a>.
              </label>
            </div>

            {/* 🔐 Submit Button */}
            <button
              type="submit"
              disabled={loading || !agreed || isRateLimited || !email.trim() || !password}
              className={`w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 border border-white/10 ${
                agreed && !loading && !isRateLimited && email.trim() && password
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-600/30 active:scale-[0.99] cursor-pointer"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed border-none shadow-none"
              }`}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  <span>Verifying Gateway...</span>
                </>
              ) : isRateLimited ? (
                <span>Please wait before retrying...</span>
              ) : (
                <>
                  <span>Sign in to Control Workspace</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

