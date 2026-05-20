import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Shield, Lock, Building2 } from "lucide-react";
import {
  hasAcceptedCurrentTerms,
  persistTermsAcceptanceLocally,
  persistTermsAcceptanceRemotePayload,
} from "../legal/termsAcceptance";

// Hardened fallback directly matching your environment
const API_BASE = import.meta.env.VITE_FLOWOPS_API_URL || "http://localhost:3005/api";

type LoginMode = "tenant" | "owner";

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("tenant");
  const [email, setEmail] = useState("admin@alpha.com");
  const [password, setPassword] = useState("password123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(() =>
    hasAcceptedCurrentTerms(),
  );

  useEffect(() => {
    setTermsAccepted(hasAcceptedCurrentTerms());
  }, [mode]);

  const endpoint = useMemo(() => {
    return mode === "owner" ? "/auth/owner-login" : "/auth/login";
  }, [mode]);

  const submitLabel = useMemo(() => {
    return mode === "owner" ? "Sign in as Owner" : "Sign in as Tenant";
  }, [mode]);

  const helperText = useMemo(() => {
    return mode === "owner"
      ? "Hidden FlowOps platform owner access."
      : "Tenant company workspace access.";
  }, [mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    if (!termsAccepted) {
      setError(
        "Please confirm that you agree to the Terms of Service and Privacy Notice.",
      );
      setBusy(false);
      return;
    }

    try {
      const termsPayload = persistTermsAcceptanceRemotePayload();
      const response = await axios.post(`${API_BASE}${endpoint}`, {
        email,
        password,
        ...termsPayload,
      });

      const data = response.data || {};

      const token =
        data.accessToken || data.access_token || data.token || "";

      if (token) {
        localStorage.setItem("access_token", token);
        localStorage.setItem("accessToken", token);
        localStorage.setItem("token", token);
      }

      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }

      persistTermsAcceptanceLocally();

      if (mode === "owner") {
        localStorage.setItem("login_mode", "owner");
        localStorage.setItem("flowops_login_mode", "owner");
        localStorage.setItem("flowops_owner_token", token);
        localStorage.setItem("flowops_owner_profile", JSON.stringify(data.user || {}));
        localStorage.setItem("flowops_owner_access_token", token);
        localStorage.setItem("flowops.owner.accessToken", token);
        if (data.user) {
          localStorage.setItem("flowops.owner.user", JSON.stringify(data.user));
        }
        window.location.href = "/owner/dashboard";
      } else {
        localStorage.setItem("login_mode", "tenant");
        localStorage.setItem("flowops_login_mode", "tenant");
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Login failed";
      setError(String(message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0d2a63_0%,_#07142d_45%,_#030816_100%)] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
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
              Tenant sign-in for day-to-day ops, or owner sign-in for platform control. Same premium
              shell as dispatch, inbox, and billing — not a bolt-on portal.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="mb-4 h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-2">Tenant Control</h3>
              <p className="text-sm text-slate-300">
                Company users, inboxes, branding, and settings.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="mb-4 h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Shield className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-2">Secure Access</h3>
              <p className="text-sm text-slate-300">
                Protected routes and stored session handling.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="mb-4 h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-2">Owner Layer</h3>
              <p className="text-sm text-slate-300">
                Separate hidden owner login for FlowOps platform control.
              </p>
            </div>
          </div>
        </div>

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

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode("tenant");
                  setError("");
                  setEmail("admin@alpha.com");
                  setPassword("password123");
                }}
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
                onClick={() => {
                  setMode("owner");
                  setError("");
                  setEmail("flowopsaas@gmail.com");
                  setPassword("2026FlowOps!");
                }}
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

            <div className="space-y-2">
              <label htmlFor="email" className="text-xs uppercase tracking-[0.25em] text-slate-300">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400"
                placeholder="Enter email"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-xs uppercase tracking-[0.25em] text-slate-300">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#071224] px-4 py-3 text-white outline-none focus:border-blue-400"
                placeholder="Enter password"
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

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

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 py-4 font-semibold text-slate-950 shadow-lg disabled:opacity-60"
            >
              {busy ? "Signing in..." : submitLabel}
            </button>

            {import.meta.env.DEV ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-xs text-slate-300">
                <div className="font-medium text-white mb-1">Dev-only test hint:</div>
                <div>Tenant: admin@alpha.com / password123</div>
              </div>
            ) : null}

            <p className="text-center text-sm text-slate-400">
              Need an account?{" "}
              <Link
                to="/signup"
                className="font-semibold text-blue-300 hover:text-blue-200 underline-offset-2 hover:underline"
              >
                Request access
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
