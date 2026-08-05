import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield, Lock, Building2, KeyRound, Mail, Eye, EyeOff,
  ArrowRight, Sparkles, CheckCircle2, Zap, Globe,
} from "lucide-react";
import logo from "../assets/logo.png";
import {
  hasAcceptedCurrentTerms,
  persistTermsAcceptanceLocally,
  persistTermsAcceptanceRemotePayload,
} from "../legal/termsAcceptance";
import { login, ownerLogin, type LoginResponse } from "../api/authApi";
import { lookupSso } from "../api/ssoApi";
import { setLoginMode as setSessionLoginMode, setStoredUser } from "../lib/session";

// ── Dev-only autofill (prod builds get "") ────────────────────────────────
function getDevDefaults() {
  if (!import.meta.env.DEV) return { email: "", password: "" };
  return {
    email: String(import.meta.env.VITE_DEV_TENANT_EMAIL ?? import.meta.env.VITE_DEV_OWNER_EMAIL ?? ""),
    password: String(import.meta.env.VITE_DEV_TENANT_PASSWORD ?? import.meta.env.VITE_DEV_OWNER_PASSWORD ?? ""),
  };
}
const DEV_DEFAULTS = getDevDefaults();
const SHOW_DEV_HINT =
  import.meta.env.DEV &&
  Boolean(import.meta.env.VITE_DEV_TENANT_EMAIL || import.meta.env.VITE_DEV_OWNER_EMAIL);

const FEATURES = [
  { icon: Building2, title: "Run your whole operation", body: "Dispatch, waybills, COD, billing and AI — one workspace." },
  { icon: Zap, title: "CLAW Autopilot", body: "Detects SLA risk and acts before it costs you." },
  { icon: Shield, title: "Secure & POPIA-aware", body: "Tenant-isolated, encrypted sessions, audit trails." },
];

const TRUST = ["Built for South Africa 🇿🇦", "Real-time tracking", "Enterprise SSO"];

export default function LoginPage() {
  const [email, setEmail] = useState(DEV_DEFAULTS.email);
  const [password, setPassword] = useState(DEV_DEFAULTS.password);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [error, setError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(() => hasAcceptedCurrentTerms());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!termsAccepted) {
      setError("Please confirm that you agree to the Terms of Service and Privacy Notice.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      persistTermsAcceptanceRemotePayload();

      // One sign-in, auto-routed: try tenant first, fall back to owner.
      let result: LoginResponse;
      let resolvedMode: "tenant" | "owner";
      try {
        result = await login(email, password);
        resolvedMode = "tenant";
      } catch (tenantErr) {
        try {
          result = await ownerLogin(email, password);
          resolvedMode = "owner";
        } catch {
          throw tenantErr;
        }
      }

      if (result.user) setStoredUser(result.user);
      setSessionLoginMode(resolvedMode);
      persistTermsAcceptanceLocally();
      window.location.href = resolvedMode === "owner" ? "/owner/dashboard" : "/dashboard";
    } catch (err: any) {
      setError(String(err?.message || err?.response?.data?.message || "Invalid email or password."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSsoLogin() {
    setError("");
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter your work email first, then continue with SSO.");
      return;
    }
    setSsoBusy(true);
    try {
      const res = await lookupSso(trimmed);
      if (res.sso && res.startUrl) {
        window.location.href = res.startUrl;
      } else {
        setError("No single sign-on is configured for this email domain.");
        setSsoBusy(false);
      }
    } catch (err: any) {
      setError(err?.message || "Could not start single sign-on.");
      setSsoBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050a18] text-white">
      {/* ── Ambient background ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[34rem] w-[34rem] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[32rem] w-[32rem] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 left-1/3 h-[30rem] w-[30rem] rounded-full bg-sky-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center justify-center gap-12 px-6 py-10 lg:flex-row lg:gap-16">
        {/* ── Left: brand + value prop ── */}
        <div className="hidden w-full max-w-xl space-y-9 lg:block">
          <div className="flex items-center gap-3">
            <img src={logo} alt="FlowOps" className="h-12 w-12 rounded-2xl ring-1 ring-white/15" />
            <div>
              <div className="text-xl font-black tracking-tight">FlowOps</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-blue-300/70">
                Tactical operations OS
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
              <Sparkles className="h-3.5 w-3.5 text-emerald-300" /> Dispatch · Billing · AI · Comms
            </div>
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight">
              The operations workspace modern courier teams run on.
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-slate-300/90">
              One secure sign-in takes you straight to your workspace — the same premium
              shell as dispatch, inbox, and billing. Not a bolt-on portal.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-blue-400/30 hover:bg-white/[0.07]"
              >
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-indigo-500/10 text-blue-200 transition group-hover:scale-105">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{body}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-slate-400">
            {TRUST.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" /> {t}
              </span>
            ))}
          </div>
        </div>

        {/* ── Right: sign-in card ── */}
        <div className="w-full max-w-md">
          <form
            onSubmit={handleSubmit}
            className="relative w-full rounded-[28px] border border-white/10 bg-[#0a1730]/80 p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
          >
            {/* Mobile brand */}
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <img src={logo} alt="FlowOps" className="h-10 w-10 rounded-xl ring-1 ring-white/15" />
              <span className="text-lg font-black tracking-tight">FlowOps</span>
            </div>

            <div className="mb-6">
              <h2 className="text-3xl font-black tracking-tight">Welcome back</h2>
              <p className="mt-1.5 text-sm text-slate-400">
                Sign in to your FlowOps workspace — we&apos;ll take you to the right place.
              </p>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#060f22] py-3 pl-11 pr-4 text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                  placeholder="you@company.co.za"
                />
              </div>
            </div>

            {/* Password */}
            <div className="mt-4 space-y-1.5">
              <label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#060f22] py-3 pl-11 pr-11 text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            {/* Terms */}
            <label className="mt-4 flex cursor-pointer select-none items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-300">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-white/30 bg-[#060f22] text-blue-400 focus:ring-blue-400/40"
              />
              <span>
                I agree to the{" "}
                <Link to="/legal/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-300 underline-offset-2 hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/legal/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-300 underline-offset-2 hover:underline">
                  Privacy Notice
                </Link>
                .
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={busy}
              className="group mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 py-3.5 font-bold text-white shadow-lg shadow-blue-900/40 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </>
              )}
            </button>

            {/* SSO */}
            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.25em] text-slate-600">
              <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
            </div>
            <button
              type="button"
              onClick={handleSsoLogin}
              disabled={ssoBusy || busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] py-3.5 font-semibold text-slate-100 transition hover:bg-white/10 disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4 text-blue-300" />
              {ssoBusy ? "Redirecting to your provider…" : "Sign in with SSO"}
            </button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
              <Globe className="h-3 w-3" /> Okta · Azure AD · Google Workspace · Auth0
            </p>

            {SHOW_DEV_HINT && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
                <span className="font-medium text-white">Dev autofill active</span> — from{" "}
                <code className="text-blue-200">VITE_DEV_*</code> in <code>.env.local</code>.
              </div>
            )}

            <p className="mt-6 text-center text-sm text-slate-400">
              Need an account?{" "}
              <Link to="/signup" className="font-semibold text-blue-300 underline-offset-2 hover:underline">
                Request access
              </Link>
              {" · "}
              <Link to="/forgot-password" className="font-semibold text-blue-300 underline-offset-2 hover:underline">
                Forgot password?
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
