import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function TenantAdminLogin() {
  const navigate = useNavigate();
  const { login, user, isAuthenticated, booting } = useAuth();

  const [email, setEmail] = useState("admin@gogetcouriers.com");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!booting && isAuthenticated) {
      navigate("/tenant-admin", { replace: true });
    }
  }, [booting, isAuthenticated, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login({
        email: email.trim(),
        password,
        mode: "tenant",
      });

      navigate("/tenant-admin", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Tenant admin login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#031633] text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.04] shadow-2xl backdrop-blur-xl p-8">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.35em] text-sky-200/80">
            FlowOps Workspace
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            Tenant Admin Login
          </h1>
          <p className="mt-3 text-sm text-white/70">
            Sign in as tenant manager to access communications, collections,
            dispatch, billing, and tenant settings.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-semibold text-white/80">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
              placeholder="admin@company.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-white/80">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/60"
              placeholder="Enter password"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-gradient-to-r from-sky-400 to-blue-500 px-4 py-3 text-sm font-extrabold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Open Tenant Admin"}
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4 text-xs text-white/65">
          Current session:
          <div className="mt-2 font-semibold text-white/80">
            {user?.email || "No active tenant session"}
          </div>
          <div className="mt-1 text-white/55">
            Role: {user?.role || "Unknown"}
          </div>
        </div>
      </div>
    </div>
  );
}
