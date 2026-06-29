/**
 * Plan-tier metadata shared across the frontend.
 *
 * Single source (frontend-side) for which gated features belong to which tier,
 * so the sidebar teasers (AppLayout) and the route guard (RequireFeature) can't
 * drift apart. Mirrors the layering in backend/src/billing/plan-entitlements.ts
 * (CORE ⊂ PRO ⊂ ENTERPRISE) — anything not listed here is treated as a
 * Professional feature for upsell-copy purposes.
 */

export type PlanTier = "PRO" | "ENTERPRISE";

export const ENTERPRISE_FEATURES = new Set<string>([
  "whiteLabel",
  "nativeApp",
  "selfHost",
  "dedicatedManager",
  "clawAutopilot",
  "sso",
  "freightForwarding",
  "aiSupportAgent",
  "courierManagement",
]);

/** Which tier unlocks a given feature flag (drives the PRO / ENTERPRISE badge). */
export function featureTier(feature?: string): PlanTier | null {
  if (!feature) return null;
  return ENTERPRISE_FEATURES.has(feature) ? "ENTERPRISE" : "PRO";
}
