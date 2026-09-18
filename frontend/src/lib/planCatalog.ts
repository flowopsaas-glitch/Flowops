/**
 * Plan catalog — the SINGLE frontend source of truth for plan display content
 * (names, prices, taglines, and the feature bullet lists shown to customers).
 *
 * Both the in-app Billing & Plans screen and the public marketing Pricing page
 * render from this list, so their feature lists can never drift apart again.
 *
 * IMPORTANT — keep this in sync with the backend enforcement source of truth
 * (backend/src/billing/plan-entitlements.ts):
 *   • `price` here must match that file's pricing (Professional = Custom by region,
 *     Enterprise = Custom / contact-sales).
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
    price: "14-day Free Trial",
    tagline: "Experience the full Professional platform free for 14 days. Upgrade to continue.",
    features: [
      "14-day free trial (full Professional access)",
      "After trial: upgrade to Professional or Enterprise",
      "No credit card required to start",
      "Full platform access during trial",
      "WhatsApp notifications + tracking links",
      "Driver mobile portal",
      "Proof of delivery",
      "Email support",
    ],
  },
  {
    key: "professional",
    name: "Professional",
    price: "From R5,999",
    period: "/month",
    popular: true,
    tagline: "The full platform for growing courier operations. Scales with your fleet.",
    features: [
      "3 drivers — R5,999/month",
      "10 drivers — R9,999/month",
      "25 drivers — R19,999/month",
      "50 drivers — R29,999/month",
      "Unlimited waybills",
      "Multi-branch support",
      "COD reconciliation + driver wallets",
      "Returns / RMA management",
      "Accounting suite + Pastel/Xero bridge + AI finance assistant",
      "Multi-carrier rate shopping",
      "AI Control Tower",
      "Commercial Analytics — profitability, pricing intelligence & revenue forecasting",
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
      "Warehouse Management System — inventory, bins, pick/pack, cycle count, AI put-away",
      "CLAW Autopilot — autonomous ops (auto-assign, SLA escalation, COD checks)",
      "Freight Forwarding — import/export, containers, customs & last-mile",
      "Rail & Intermodal — consignment lifecycle, wagon register & road↔rail↔port corridor coordination",
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
