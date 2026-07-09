/**
 * Plan catalog — the SINGLE frontend source of truth for plan display content
 * (names, prices, taglines, and the feature bullet lists shown to customers).
 *
 * Both the in-app Billing & Plans screen and the public marketing Pricing page
 * render from this list, so their feature lists can never drift apart again.
 *
 * IMPORTANT — keep this in sync with the backend enforcement source of truth
 * (backend/src/billing/plan-entitlements.ts):
 *   • `price` here must match that file's `priceZar` (Professional = R19,999,
 *     Enterprise is contact-sales / "Custom" — asking R100,000).
 *   • A feature only belongs on a tier's bullet list if that tier actually
 *     grants it in PLAN_ENTITLEMENTS. The backend remains the authority for
 *     what's enforced; this file is the authority for what's *displayed*.
 */

export type PlanKey = "starter" | "professional" | "enterprise";

export interface PlanCatalogEntry {
  key: PlanKey;
  name: string;
  /** Display price. Keep in sync with backend plan-entitlements.ts priceZar. */
  price: string;
  /** e.g. "/month". Omitted for Free / Custom. */
  period?: string;
  /** One-line positioning used as the card description. */
  tagline: string;
  /** Canonical, customer-facing feature bullets for this tier. */
  features: string[];
  /** Marks the highlighted "most popular" tier. */
  popular?: boolean;
}

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    key: "starter",
    name: "Starter",
    price: "Free",
    tagline: "Everything you need to get your first couriers on the road.",
    features: [
      "Up to 100 waybills / month",
      "3 driver accounts",
      "3 team members",
      "1 branch / depot",
      "Waybill management & GPS tracking",
      "Basic invoicing & rate cards",
      "WhatsApp click-to-chat (full Hub on Pro)",
      "Email support",
    ],
  },
  {
    key: "professional",
    name: "Professional",
    price: "R 19,999",
    period: "/month",
    popular: true,
    tagline: "The full platform for growing courier operations.",
    features: [
      "Unlimited waybills",
      "25 driver accounts",
      "50 team members",
      "Multi-branch support",
      "COD reconciliation + driver wallets",
      "Returns / RMA management",
      "Accounting suite + Pastel/Xero bridge + AI finance assistant",
      "Multi-carrier rate shopping",
      "AI Control Tower",
      "Route optimisation",
      "API keys & webhooks",
      "Shopify / WooCommerce connector",
      "Priority support",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    tagline: "For large fleets, 3PLs, and multi-company platforms.",
    features: [
      "Everything in Professional",
      "CLAW Autopilot — autonomous ops (auto-assign, SLA escalation, COD checks)",
      "Freight Forwarding — import/export, containers, customs & last-mile",
      "AI Support Agent — in-app help grounded in your live data",
      "Courier Management — multi-carrier order orchestration",
      "OIDC Single Sign-On (Okta, Azure AD, Google Workspace, Auth0)",
      "Native iOS & Android driver apps",
      "Self-hosted / on-premise deployment",
      "White-label branding & custom domain",
      "Unlimited users & drivers",
      "Dedicated account manager + custom SLA",
      "Custom integrations & onboarding",
    ],
  },
];

export const getPlan = (key: string): PlanCatalogEntry | undefined =>
  PLAN_CATALOG.find((p) => p.key === key);
