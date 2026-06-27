// ── Plan entitlements — the single source of truth for what each tier gets ──
// Limits (-1 = unlimited) and feature flags. Enforced by BillingService and
// surfaced to the frontend via GET /billing/entitlements. Keep this in sync with
// the marketing PricingPage + in-app BillingPlans (they read the same shape).

export type PlanId = 'starter' | 'professional' | 'enterprise';

export interface PlanLimits {
  waybillsPerMonth: number; // -1 = unlimited
  drivers: number;
  users: number;
  branches: number;
}

export interface PlanEntitlement {
  id: PlanId;
  name: string;
  priceZar: number;
  limits: PlanLimits;
  features: Record<string, boolean>;
}

// Feature keys used across tiers (UI can soft-gate/upsell on these).
export const FEATURE_KEYS = [
  'waybills', 'collections', 'tracking', 'pod', 'manifests', 'rateCards',
  'codReconciliation', 'returns', 'routeOptimization', 'rateShopping',
  'whatsapp', 'emailHub', 'accounting', 'accountingBridge',
  'aiControlTower', 'copilot', 'api', 'ecommerce',
  'whiteLabel', 'nativeApp', 'selfHost', 'dedicatedManager',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

const CORE: Partial<Record<FeatureKey, boolean>> = {
  waybills: true, collections: true, tracking: true, pod: true,
  manifests: true, rateCards: true,
};

const PRO: Partial<Record<FeatureKey, boolean>> = {
  ...CORE,
  codReconciliation: true, returns: true, routeOptimization: true, rateShopping: true,
  whatsapp: true, emailHub: true, accounting: true, accountingBridge: true,
  aiControlTower: true, copilot: true, api: true, ecommerce: true,
};

const ENTERPRISE: Partial<Record<FeatureKey, boolean>> = {
  ...PRO,
  whiteLabel: true, nativeApp: true, selfHost: true, dedicatedManager: true,
};

const fill = (on: Partial<Record<FeatureKey, boolean>>): Record<string, boolean> =>
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, Boolean(on[k])]));

export const PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlement> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceZar: 0,
    limits: { waybillsPerMonth: 100, drivers: 3, users: 3, branches: 1 },
    features: fill(CORE),
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    priceZar: 11999,
    limits: { waybillsPerMonth: -1, drivers: 25, users: 50, branches: -1 },
    features: fill(PRO),
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceZar: 29999,
    limits: { waybillsPerMonth: -1, drivers: -1, users: -1, branches: -1 },
    features: fill(ENTERPRISE),
  },
};

export function normalizePlan(plan?: string | null): PlanId {
  const p = String(plan || 'starter').toLowerCase();
  return (p === 'professional' || p === 'enterprise') ? p : 'starter';
}
