// ── Plan entitlements — the single source of truth for what each tier gets ──
// Limits (-1 = unlimited) and feature flags. Enforced by BillingService and
// surfaced to the frontend via GET /billing/entitlements. Keep this in sync with
// the marketing PricingPage + in-app BillingPlans (they read the same shape).

export type PlanId = 'starter' | 'professional' | 'professional_10' | 'professional_25' | 'professional_50' | 'enterprise';

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
  'clawAutopilot', 'sso', 'freightForwarding', 'aiSupportAgent', 'courierManagement',
  'logisticsAnalytics', 'commercialAnalytics', 'warehouseManagement',
  'deliveryNotes', 'digitalPayments', 'epod', 'liveTracking',
  'marketTrends', 'orderFlowIntegration', 'smartRouting', 'rail',
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
  commercialAnalytics: true,
  deliveryNotes: true, digitalPayments: true, epod: true, liveTracking: true,
  smartRouting: true,
};

const ENTERPRISE: Partial<Record<FeatureKey, boolean>> = {
  ...PRO,
  whiteLabel: true, nativeApp: true, selfHost: true, dedicatedManager: true,
  clawAutopilot: true, sso: true, freightForwarding: true, aiSupportAgent: true, courierManagement: true,
  logisticsAnalytics: true, commercialAnalytics: true, warehouseManagement: true,
  marketTrends: true, orderFlowIntegration: true, rail: true,
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
    name: 'Professional (3 Drivers)',
    priceZar: 5999,
    limits: { waybillsPerMonth: -1, drivers: 3, users: 10, branches: 1 },
    features: fill(PRO),
  },
  professional_10: {
    id: 'professional_10',
    name: 'Professional (10 Drivers)',
    priceZar: 9999,
    limits: { waybillsPerMonth: -1, drivers: 10, users: 25, branches: 3 },
    features: fill(PRO),
  },
  professional_25: {
    id: 'professional_25',
    name: 'Professional (25 Drivers)',
    priceZar: 19999,
    limits: { waybillsPerMonth: -1, drivers: 25, users: 50, branches: -1 },
    features: fill(PRO),
  },
  professional_50: {
    id: 'professional_50',
    name: 'Professional (50 Drivers)',
    priceZar: 29999,
    limits: { waybillsPerMonth: -1, drivers: 50, users: 100, branches: -1 },
    features: fill(PRO),
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceZar: 100000,
    limits: { waybillsPerMonth: -1, drivers: -1, users: -1, branches: -1 },
    features: fill(ENTERPRISE),
  },
};

export function normalizePlan(plan?: string | null): PlanId {
  const p = String(plan || 'starter').toLowerCase();
  if (p === 'enterprise') return 'enterprise';
  if (p.startsWith('professional')) return p as PlanId;
  return 'starter';
}


// Human-readable labels for the owner subscription editor (feature add-on catalog).
export const FEATURE_LABELS: Record<string, string> = {
  waybills: 'Waybill management',
  collections: 'Collections',
  tracking: 'Customer tracking',
  pod: 'Proof of delivery',
  manifests: 'Manifests',
  rateCards: 'Rate cards',
  codReconciliation: 'COD reconciliation',
  returns: 'Returns / RMA',
  routeOptimization: 'Route optimisation',
  rateShopping: 'Rate shopping',
  whatsapp: 'WhatsApp hub',
  emailHub: 'Email hub',
  accounting: 'Accounting',
  accountingBridge: 'Accounting bridge (Pastel/Xero)',
  aiControlTower: 'AI Control Tower',
  copilot: 'Ask FlowOps copilot',
  api: 'Public API & webhooks',
  ecommerce: 'E-commerce connectors',
  whiteLabel: 'White-label branding',
  nativeApp: 'Native mobile app',
  selfHost: 'Self-host option',
  dedicatedManager: 'Dedicated account manager',
  clawAutopilot: 'CLAW Autopilot (autonomous ops)',
  sso: 'Single Sign-On (OIDC)',
  freightForwarding: 'Freight Forwarding (import/export)',
  rail: 'Rail & Intermodal (corridor coordination)',
  aiSupportAgent: 'AI Support Agent',
  courierManagement: 'Courier Management (orchestration)',
  logisticsAnalytics: 'Logistics Analytics (premium insights)',
  deliveryNotes: 'Delivery Notes (dispatcher)',
  digitalPayments: 'Digital Payment Collection',
  epod: 'Electronic Proof of Delivery',
  liveTracking: 'Live GPS Tracking',
  marketTrends: 'Market Trends Intelligence (AI)',
  orderFlowIntegration: 'Auto Order Flow Integration',
  smartRouting: 'Smart Route Planning & Scheduling',
};
