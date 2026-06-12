import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shield, Lock, Building2 } from "lucide-react";
import {
  hasAcceptedCurrentTerms,
  persistTermsAcceptanceLocally,
  persistTermsAcceptanceRemotePayload,
} from "../legal/termsAcceptance";
import {
  login,
  ownerLogin,
  type LoginResponse,
} from "../api/authApi";
import {
  setLoginMode as setSessionLoginMode,
  setStoredUser,
} from "../lib/session";

// ── Dev-only autofill ─────────────────────────────────────────────────────
// Reads from VITE_DEV_TENANT_EMAIL / VITE_DEV_OWNER_EMAIL (set in .env.local).
// In production builds import.meta.env.DEV is false so these always return "".

type LoginMode = "tenant" | "owner";

function getDevDefaults(mode: LoginMode) {
  if (!import.meta.env.DEV) return { email: "", password: "" };
  if (mode === "owner") {
    return {
      email: String(import.meta.env.VITE_DEV_OWNER_EMAIL ?? ""),
      password: String(import.meta.env.VITE_DEV_OWNER_PASSWORD ?? ""),
    };
  }
  return {
    email: String(import.meta.env.VITE_DEV_TENANT_EMAIL ?? ""),
    password: String(import.meta.env.VITE_DEV_TENANT_PASSWORD ?? ""),
  };
}

const INITIAL_TENANT_DEFAULTS = getDevDefaults("tenant");
const SHOW_DEV_HINT =
  import.meta.env.DEV &&
  Boolean(
    import.meta.env.VITE_DEV_TENANT_EMAIL ||
      import.meta.env.VITE_DEV_OWNER_EMAIL,
  );

// ── Component ─────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("tenant");
  const [email, setEmail] = useState(INITIAL_TENANT_DEFAULTS.email);
  const [password, setPassword] = useState(INITIAL_TENANT_DEFAULTS.password);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(() =>
    hasAcceptedCurrentTerms(),
  );

  const submitLabel = useMemo(
    () => (mode === "owner" ? "Sign in as Owner" : "Sign in as Tenant"),
    [mode],
  );

  const helperText = useMemo(
    () =>
      mode === "owner"
        ? "Hidden FlowOps platform owner access."
        : "Tenant company workspace access.",
    [mode],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!termsAccepted) {
      setError(
        "Please confirm that you agree to the Terms of Service and Privacy Notice.",
      );
      return;
    }

    setBusy(true);
    setError("");

    try {
      const termsPayload = persistTermsAcceptanceRemotePayload();

      // authApi.login / ownerLogin:
      //  1. Calls the backend via the canonical `api` client (auth interceptors,
      //     401 refresh, ApiError on failure).
      //  2. Reads res.data (inner payload from TransformInterceptor envelope).
      //  3. Calls setToken(access_token) from lib/session.ts internally.
      const result: LoginResponse =
        mode === "owner"
          ? await ownerLogin(email, password)
          : await login(email, password);

      // Persist user + login mode so ProtectedRoute and guards can read them.
      if (result.user) setStoredUser(result.user);
      setSessionLoginMode(mode);

      persistTermsAcceptanceLocally();

      // Full-page navigation so AuthContext re-initialises with the new token
      // and calls /auth/me to hydrate the user object.
      window.location.href =
        mode === "owner" ? "/owner/dashboard" : "/dashboard";
    } catch (err: any) {
      // api/client.ts wraps 4xx/5xx as ApiError with a .message field.
      const message =
        err?.message || err?.response?.data?.message || "Login failed";
      setError(String(message));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: LoginMode) {
    const defaults = getDevDefaults(next);
    setMode(next);
    setEmail(defaults.email);
    setPassword(defaults.password);
    setError("");
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0d2a63_0%,_#07142d_45%,_#030816_100%)] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

        {/* ── Left: marketing copy ── */}
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200">
              <Shield className="h-4 w-4 text-emerald-300" />
              FlowOps secure access
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/55">
              Dispatch · billing · AI · comms
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="text-5xl font-black leading-tight tracking-tight max-w-2xl">
              The operations workspace modern courier teams run on.
            </h1>
            <p className="text-slate-300 text-lg max-w-2xl leading-relaxed">
              Tenant sign-in for day-to-day ops, or owner sign-in for platform
              control. Same premium shell as dispatch, inbox, and billing — not a
              bolt-on portal.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: <Building2 className="h-5 w-5" />,
                title: "Tenant Control",
                body: "Company users, inboxes, branding, and settings.",
              },
              {
                icon: <Shield className="h-5 w-5" />,
                title: "Secure Access",
                body: "Protected routes and stored session handling.",
              },
              {
                icon: <Lock className="h-5 w-5" />,
                title: "Owner Layer",
                body: "Separate hidden owner login for platform control.",
              },
            ].map(({ icon, title, body }) => (
              <div
                key={title}
                className="rounded-3xl border border-white/10 bg-white/5 p-5"
              >
                <div className="mb-4 h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  {icon}
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-slate-300">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: form ── */}
        <div className="flex justify-center lg:justify-end">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-[32px] border border-white/10 bg-[#09162f]/90 backdrop-blur-xl shadow-2xl p-8 space-y-6"
          >
            <div>
              <h2 className="text-4xl font-black tracking-tight">Sign in</h2>
              <p className="text-slate-300 mt-2 text-sm">
                Choose the correct login mode before entering your details.
              </p>
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => switchMode("tenant")}
                className={`rounded-2xl py-3 text-sm font-semibold transition ${
                  mode === "tenant"
                    ? "bg-blue-400 text-slate-950"
                    : "bg-white/10 text-slate-200 hover:bg-white/15"
                }`}
              >
                Tenant Login
              </button>
              <button
                type="button"
                onClick={() => switchMode("owner")}
                className={`rounded-2xl py-3 text-sm font-semibold transition ${
                  mode === "owner"
                    ? "bg-blue-400 text-slate-950"
                    : "bg-white/10 text-slate-200 hover:bg-white/15"
                }`}
              >
                Owner Login
              </button>
            </div>

            <div className="text-xs text-blue-200 bg-blue-500/10 border border-blue-400/20 rounded-2xl px-4 py-3">
              {helperText}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-xs uppercase tracking-[0.25em] text-slate-300"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400"
                placeholder="Enter email"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-xs uppercase tracking-[0.25em] text-slate-300"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400"
                placeholder="Enter password"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            {/* Terms */}
            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/30 bg-[#071224] text-blue-400 focus:ring-blue-400/40"
              />
              <span>
                I agree to the{" "}
                <Link
                  to="/legal/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 hover:text-blue-200 font-semibold underline-offset-2 hover:underline"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  to="/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 hover:text-blue-200 font-semibold underline-offset-2 hover:underline"
                >
                  Privacy Notice
                </Link>
                . I understand the Services are provided on a subscription basis and
                that logistics outcomes remain my organisation&apos;s responsibility.
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 py-4 font-semibold text-slate-950 shadow-lg disabled:opacity-60 transition hover:brightness-110 active:scale-[0.99]"
            >
              {busy ? "Signing in…" : submitLabel}
            </button>

            {/* Dev autofill hint */}
            {SHOW_DEV_HINT && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-xs text-slate-300">
                <div className="font-medium text-white mb-1">
                  Dev autofill active
                </div>
                <div>
                  Credentials loaded from{" "}
                  <code className="text-blue-200">VITE_DEV_TENANT_*</code> /{" "}
                  <code className="text-blue-200">VITE_DEV_OWNER_*</code> in{" "}
                  <code>.env.local</code>.
                </div>
              </div>
            )}

            <p className="text-center text-sm text-slate-400">
              Need an account?{" "}
              <Link
                to="/signup"
                className="font-semibold text-blue-300 hover:text-blue-200 underline-offset-2 hover:underline"
              >
                Request access
              </Link>
              {" · "}
              <Link
                to="/forgot-password"
                className="font-semibold text-blue-300 hover:text-blue-200 underline-offset-2 hover:underline"
              >
                Forgot password?
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
