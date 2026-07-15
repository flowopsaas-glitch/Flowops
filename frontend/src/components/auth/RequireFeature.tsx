/**
 * RequireFeature — gates a route/section by the tenant's PLAN ENTITLEMENT.
 *
 * This is the access-control counterpart to the sidebar entitlement filtering
 * in AppLayout. Hiding a nav link is not enforcement on its own — a user can
 * type the URL directly — so paid modules need a guard at the route layer too.
 *
 * Unlike the plan-rank-only RequirePlan, this reads the live entitlements from
 * GET /billing/entitlements, so it honours:
 *   • the 14-day trial (which grants Professional features), and
 *   • owner-granted per-tenant feature add-ons (featureOverrides).
 *
 * While entitlements load we render a lightweight loader (never a flash of the
 * upsell for an entitled user). If the feature is not entitled we render a
 * full-page upgrade screen instead of letting a broken/erroring page mount.
 *
 * Usage (wraps the protected element, can be combined with RequirePermission):
 *   <Route path="/autopilot" element={
 *     <RequireFeature feature="clawAutopilot" name="CLAW Autopilot">
 *       <AutopilotConsole />
 *     </RequireFeature>
 *   } />
 */

import { type ReactNode, useEffect, useState } from "react";
import { Zap, Loader2 } from "lucide-react";
import { getEntitlements } from "../../api/billingApi";
import { ENTERPRISE_FEATURES } from "../../lib/planMeta";

const WA_NUMBER = "27606592875";

export default function RequireFeature({
  feature,
  name,
  children,
}: {
  feature: string;
  /** Human-friendly feature name for the upsell screen. */
  name?: string;
  children?: ReactNode;
}) {
  // null = loading, true/false once resolved.
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    getEntitlements()
      .then((e) => {
        if (alive) setAllowed(Boolean(e?.features?.[feature]));
      })
      // On a transient failure, fail OPEN so we never lock an entitled user out
      // of a feature they paid for because of a flaky network call. The backend
      // still enforces the entitlement on every protected endpoint.
      .catch(() => {
        if (alive) setAllowed(true);
      });
    return () => {
      alive = false;
    };
  }, [feature]);

  if (allowed === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    );
  }

  if (allowed) return <>{children}</>;

  const tier = ENTERPRISE_FEATURES.has(feature) ? "Enterprise" : "Professional";
  const label = name ?? "this feature";
  const upgradeMsg = `Hi! I'd like to unlock ${label} on FlowOps. Can you upgrade my account to ${tier}?`;

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/20 ring-1 ring-amber-500/30">
          <Zap className="h-8 w-8 text-amber-400" />
        </div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-amber-400">
          {tier} feature
        </p>
        <h2 className="mt-1 text-2xl font-black text-white">{name ?? "Upgrade to unlock"}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-white/50">
          This module is part of the {tier} plan. Upgrade to switch it on for your team — your existing data stays exactly where it is.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <a
            href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(upgradeMsg)}`}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-400"
          >
            <Zap className="h-4 w-4" />
            Upgrade on WhatsApp
          </a>
          <a
            href="/billing/plans"
            className="text-xs font-bold text-white/50 underline underline-offset-2 transition hover:text-white"
          >
            Compare plans &amp; usage →
          </a>
        </div>
      </div>
    </div>
  );
}
