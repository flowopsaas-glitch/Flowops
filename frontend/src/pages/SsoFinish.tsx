import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { setToken, setLoginMode } from "../api/client";

/**
 * Landing page for the SSO redirect: /sso/finish?access_token=...&refresh_token=...
 * Stores the tenant access token and hands off to the dashboard. AuthContext
 * then hydrates the user via /auth/me.
 *
 * NOTE: silent token refresh for SSO sessions is a follow-up — when the access
 * token expires the user re-authenticates through their IdP.
 */
export default function SsoFinish() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get("access_token");
    if (!access) {
      setError("Single sign-on did not return a session. Please try again.");
      return;
    }
    try {
      setToken(access);
      setLoginMode("tenant");
      // Full-page nav so AuthContext re-initialises with the new token.
      window.location.replace("/dashboard");
    } catch {
      setError("Could not establish your session. Please try again.");
    }
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-[linear-gradient(180deg,#07111f,#0b1530)] text-white">
      {error ? (
        <div className="max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-rose-300" />
          <p className="mt-3 text-sm text-rose-200">{error}</p>
          <a href="/login" className="mt-4 inline-block rounded-xl border border-white/15 bg-white/8 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/15">
            Back to login
          </a>
        </div>
      ) : (
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-300" />
          <p className="mt-3 text-sm text-white/60">Completing single sign-on…</p>
        </div>
      )}
    </div>
  );
}
