/**
 * RequirePlan — gates UI sections by company plan.
 *
 * Plans in order: starter < professional < enterprise
 * Wraps a section; if the company's plan is below the required tier,
 * renders an overlay nudging the user to upgrade via WhatsApp.
 */

import { useAuth } from "../../contexts/AuthContext";
import { Zap } from "lucide-react";

type Plan = "starter" | "professional" | "enterprise";

const PLAN_RANK: Record<Plan, number> = {
  starter:      0,
  professional: 1,
  enterprise:   2,
};

interface Props {
  requiredPlan: Plan;
  children: React.ReactNode;
  featureName?: string;
}

export default function RequirePlan({ requiredPlan, children, featureName }: Props) {
  const { user } = useAuth();
  const co = user?.company as any;
  const currentPlan = (co?.plan ?? "starter").toLowerCase() as Plan;
  const trialExpired = co?.trialExpired ?? false;

  // Starter on active trial gets full Professional access
  const effectivePlan: Plan =
    currentPlan === "starter" && !trialExpired ? "professional" : currentPlan;

  const allowed = PLAN_RANK[effectivePlan] >= PLAN_RANK[requiredPlan];

  if (allowed) return <>{children}</>;

  const upgradeMsg = `Hi! I'd like to unlock ${featureName ?? "this feature"} on FlowOps. Can you upgrade my account to ${requiredPlan === "enterprise" ? "Enterprise" : "Professional"}?`;

  return (
    <div className="relative rounded-[28px] overflow-hidden">
      {/* Blurred locked content */}
      <div className="pointer-events-none select-none opacity-30 blur-sm">
        {children}
      </div>

      {/* Upgrade overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#07111f]/70 backdrop-blur-sm rounded-[28px] p-8 text-center">
        <div className="h-14 w-14 rounded-2xl bg-amber-500/20 ring-1 ring-amber-500/30 grid place-items-center">
          <Zap className="h-7 w-7 text-amber-400" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400 mb-1">
            {requiredPlan === "enterprise" ? "Enterprise" : "Professional"} Feature
          </p>
          <h3 className="text-lg font-black text-white">
            {featureName ?? "Upgrade to unlock"}
          </h3>
          <p className="text-sm text-white/50 mt-1 max-w-xs mx-auto">
            {trialExpired
              ? "Your trial has expired. Upgrade to regain full access."
              : `This feature requires the ${requiredPlan === "enterprise" ? "Enterprise" : "Professional"} plan.`}
          </p>
        </div>
        <button
          onClick={() => window.open(
            `https://wa.me/27814065725?text=${encodeURIComponent(upgradeMsg)}`,
            "_blank"
          )}
          className="flex items-center gap-2 rounded-2xl bg-amber-500 text-slate-950 px-6 py-3 text-sm font-black hover:bg-amber-400 transition"
        >
          <Zap className="h-4 w-4" />
          Upgrade on WhatsApp
        </button>
      </div>
    </div>
  );
}
