import { errorMessageOf } from "@/components/patterns/errorMessage";
import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { setToken, setLoginMode, setRefreshToken } from "../api/client";
import { exchangeSsoCode } from "../api/ssoApi";

/** Redeems the short-lived, browser-bound OIDC code without putting FlowOps bearer tokens in a URL. */
export default function SsoFinish() {
  const [error, setError] = useState<string | null>(null);
  // React StrictMode replays effects in development. Cache the initial code and
  // the redemption promise so the one-time code is exchanged exactly once.
  const codeRef = useRef<string | null>(null);
  if (codeRef.current === null) {
    codeRef.current = new URL(window.location.href).searchParams.get("code");
  }
  const redemptionRef = useRef<ReturnType<typeof exchangeSsoCode> | null>(null);

  useEffect(() => {
    let active = true;
    const current = new URL(window.location.href);
    const code = codeRef.current;
    // Remove even the single-use code from browser history before making requests.
    window.history.replaceState(null, "", `${current.pathname}${current.hash}`);
    if (!code) {
      setError("Single sign-on did not return a session. Please try again.");
      return () => { active = false; };
    }

    redemptionRef.current ??= exchangeSsoCode(code);
    void redemptionRef.current.then((session) => {
      if (!session?.access_token || !session?.refresh_token) {
        throw new Error("Single sign-on did not return a complete session.");
      }
      if (!active) return;
      setToken(session.access_token);
      setRefreshToken(session.refresh_token);
      setLoginMode("tenant");
      window.location.replace("/dashboard");
    }).catch((e: unknown) => {
      if (active) setError(errorMessageOf(e) || "Could not establish your session. Please try again.");
    });

    return () => { active = false; };
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
