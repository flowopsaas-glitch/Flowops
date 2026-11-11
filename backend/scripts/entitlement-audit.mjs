#!/usr/bin/env node
/**
 * Entitlement audit — every controller is classified, no silent gaps.
 *
 * The frontend <RequireFeature> gate fails OPEN on network errors (UX only),
 * so the real enforcement is @RequireFeature() metadata checked by the
 * globally-registered FeatureGuard. Classification rules:
 *   - EXPECTED: controller must declare the mapped @RequireFeature. Only
 *     features that are core (true on every plan) or already gated
 *     identically in the UI may be mapped — never gate a backend workflow
 *     behind a plan feature its UI does not require.
 *   - EXEMPT: controller carries no plan feature by design (reason recorded
 *     inline). Auth, public/token surfaces, owner-only and core platform
 *     controllers live here; they are still behind JWT/roles/owner guards.
 * This scan fails (exit 1) when:
 *   - an EXPECTED controller loses its @RequireFeature,
 *   - a controller file appears in neither map (unclassified), or a map
 *     entry points at a file that no longer exists,
 *   - FeatureGuard is not registered as a global APP_GUARD in app.module.ts.
 *
 * Usage: node scripts/entitlement-audit.mjs [--format summary|json]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(process.cwd(), "src");

/** Feature → backend controllers that must declare it. */
export const EXPECTED = {
  "warehouse-management/warehouse.controller.ts": "warehouseManagement",
  "process-control/process-control.controller.ts": "warehouseManagement",
  "product-master/product-master.controller.ts": "warehouseManagement",
  "commercial-analytics/commercial-analytics.controller.ts": "commercialAnalytics",
  "logistics-analytics/logistics-analytics.controller.ts": "logisticsAnalytics",
  "courier-management/courier-management.controller.ts": "courierManagement",
  "autopilot/autopilot.controller.ts": "clawAutopilot",
  "support/support.controller.ts": "aiSupportAgent",
  "accounting/accounting.controller.ts": "accounting",
  "disbursements/disbursements.controller.ts": "accounting",
  "accounting-integrations/accounting-integrations.controller.ts": "accountingBridge",
  "cod/cod.controller.ts": "codReconciliation",
  "delivery-notes/delivery-notes.controller.ts": "deliveryNotes",
  "digital-payments/digital-payments.controller.ts": "digitalPayments",
  "email-hub/email-hub.controller.ts": "emailHub",
  "epod/epod.controller.ts": "epod",
  "forwarding/forwarding.controller.ts": "freightForwarding",
  "general-average/general-average.controller.ts": "freightForwarding",
  "live-tracking/live-tracking.controller.ts": "liveTracking",
  "market-trends/market-trends.controller.ts": "marketTrends",
  "order-flow/order-flow.controller.ts": "orderFlowIntegration",
  "rate-shopping/rate-shopping.controller.ts": "rateShopping",
  "returns/returns.controller.ts": "returns",
  "route-optimization/route-optimization.controller.ts": "routeOptimization",
  "routing/routing.controller.ts": "routeOptimization",
  "smart-routing/smart-routing.controller.ts": "smartRouting",
  "ai/ai-ops.controller.ts": "aiControlTower",
  "copilot/copilot.controller.ts": "copilot",
  "api/api-keys.controller.ts": "api",
  "webhooks/webhooks.controller.ts": "api",
  "whatsapp/whatsapp.controller.ts": "whatsapp",
  "rail/rail.controller.ts": "rail",
  "rail/rail-slot.controller.ts": "rail",
  "rail/rail-change.controller.ts": "rail",
  "rail/rail-handshake.controller.ts": "rail",
  "rail/rail-manifest.controller.ts": "rail",
  "rail/rail-occurrence.controller.ts": "rail",
  "rail/rail-optimizer.controller.ts": "rail",
  "rail/rail-possession.controller.ts": "rail",
  "rail/rail-tariff.controller.ts": "rail",
  "rail/rail-telemetry.controller.ts": "rail",
  "rail/rail-weighbridge.controller.ts": "rail",
  "rail/rail-truck-appointments.controller.ts": "rail",
  "rail/rail-truck-window-changes.controller.ts": "rail",
  // Core features (true on every plan incl. starter) — safe to enforce:
  "waybills/waybills.controller.ts": "waybills",
  "collections/collections.controller.ts": "collections",
  "tracking/tracking.controller.ts": "tracking",
  "manifests/manifests.controller.ts": "manifests",
  "manifests/load-scan.controller.ts": "manifests",
  "rate-cards/rate-cards.controller.ts": "rateCards",
  // Handler-level (SSO login flow handlers are @Public and must stay open):
  "sso/sso.controller.ts": "sso",
};

/** Controllers with no plan feature by design — reason required. */
export const EXEMPT = {
  "app.controller.ts": "health/root surface",
  "auth/auth.controller.ts": "authentication must never be plan-locked",
  "otp/otp.controller.ts": "authentication (OTP) must never be plan-locked",
  "billing/billing.controller.ts": "billing/entitlements surface itself",
  "paystack/paystack.controller.ts": "payment provider webhooks + billing (signature-verified)",
  "users/users.controller.ts": "core tenant administration (roles-guarded)",
  "companies/companies.controller.ts": "core tenant administration (roles-guarded)",
  "branches/branches.controller.ts": "core tenant structure, plan-limited in BillingService",
  "dashboard/dashboard.controller.ts": "core home surface for every plan",
  "notifications/notifications.controller.ts": "core platform notifications",
  "push/push.controller.ts": "core platform push registration",
  "clients/clients.controller.ts": "core CRM data used by waybills/quotes on every plan",
  "trip-costs/trip-costs.controller.ts": "core operational cost capture — the measured-data foundation for profitability on every plan (roles-guarded)",
  "carriers/carriers.controller.ts": "core ops master data (roles-guarded)",
  "drivers/drivers.controller.ts": "core fleet data, plan-limited in BillingService",
  "dispatch/dispatch.controller.ts": "core dispatch workflow (no plan feature key exists)",
  "shipments/shipments.controller.ts": "core shipment workflow (no plan feature key exists)",
  "quotes/quotes.controller.ts": "core sales quoting (no plan feature key exists)",
  "invoices/invoices.controller.ts": "core billing documents for every plan",
  "logistics-ops/logistics-ops.controller.ts": "core ops surface (address book, hub scans) spanning core features",
  "geocoding/geocoding.controller.ts": "core addressing utility used across core flows",
  "driver-safety/driver-safety.controller.ts": "safety/compliance must never be plan-locked",
  "driver-safety/trip-leg.controller.ts": "safety/compliance must never be plan-locked — same module as driver-safety.controller.ts, roles-guarded per route",
  "audit/audit.controller.ts": "audit trail is a core platform surface with no plan feature key; roles-guarded",
  "common/health/public-health.controller.ts": "liveness/readiness probe, @Public by design — gating a health check would break load balancers",
  "public-tools/public-tools.controller.ts": "@Public prospect-facing calculators used before signup; no tenant and no plan exists yet",
  "common/compliance/driver-compliance.controller.ts": "safety/compliance must never be plan-locked",
  "fleet-maintenance/fleet-maintenance.controller.ts": "core fleet upkeep (no plan feature key exists)",
  "maintenance/maintenance.controller.ts": "core asset/job-card record — the evidence a warranty or a comeback is judged on; no plan feature key exists (roles-guarded)",
  "claims/claims.controller.ts": "claims & liability are a core operational record on every plan (no plan feature key exists, roles-guarded)",
  "fleet-intelligence/fleet-intelligence.controller.ts": "read-only fleet insight over core fleet data",
  "carbon/carbon.controller.ts": "read-only ESG estimate over core ops data",
  "esg/esg.controller.ts": "read-only ESG reporting over core ops data",
  "intelligence/intelligence.controller.ts": "internal ops intelligence (roles-guarded)",
  "integrations/integration-credential.controller.ts": "admin settings surface (permission-guarded, no plan feature key)",
  "ai/ai.controller.ts": "AI utilities surfaced inside core pages; optional-provider feature",
  "ai/ai-chat.controller.ts": "chat surfaced on the core Dashboard (no UI plan gate to mirror)",
  "ai/ai-diagnostics.controller.ts": "internal diagnostics (roles-guarded)",
  "ai/ai-events.controller.ts": "internal AI event ingestion (roles/guards apply)",
  "ai/competitive-intelligence.controller.ts": "owner-area intelligence (/owner/intel, owner-guarded)",
  "ecommerce/ecommerce.controller.ts": "inbound store webhooks are @Public signature-verified handlers",
  "api/public-api.controller.ts": "external API-key surface; keys are managed behind @RequireFeature('api')",
  "customer-portal/customer-portal.controller.ts": "public customer token surface",
  "invoices/public-invoice.controller.ts": "public customer token surface",
  "returns/returns-portal.controller.ts": "public customer token surface",
  "driver-portal/driver-portal.controller.ts": "driver token surface (not a tenant plan feature)",
  "owner/owner.controller.ts": "platform-owner surface (owner-guarded)",
  "okr/okr.controller.ts": "platform-owner surface (owner-guarded)",
  "observability/observability.controller.ts": "platform observability (owner/guarded)",
  "rail/rail-timetable-owner.controller.ts": "platform-owner surface (owner-guarded)",
};

function walk(dir, base, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else if (entry.endsWith(".controller.ts")) out.push(relative(base, full));
  }
  return out;
}

export function auditEntitlements(root = ROOT) {
  const gaps = [];
  for (const [file, feature] of Object.entries(EXPECTED)) {
    let source = "";
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      gaps.push({ file, feature, problem: "controller file not found" });
      continue;
    }
    if (!new RegExp(`@RequireFeature\\(['"]${feature}['"]\\)`).test(source)) {
      gaps.push({ file, feature, problem: `missing @RequireFeature('${feature}')` });
    }
  }
  for (const file of Object.keys(EXEMPT)) {
    try {
      readFileSync(join(root, file), "utf8");
    } catch {
      gaps.push({ file, feature: "-", problem: "EXEMPT entry points at a missing controller file" });
    }
  }
  let all = [];
  try {
    all = walk(root, root);
  } catch { /* surfaced as unclassified below via empty list mismatch */ }
  for (const file of all) {
    if (!(file in EXPECTED) && !(file in EXEMPT)) {
      gaps.push({ file, feature: "-", problem: "unclassified controller: add @RequireFeature mapping or EXEMPT reason" });
    }
  }
  let globalGuard = false;
  try {
    const app = readFileSync(join(root, "app.module.ts"), "utf8");
    globalGuard = /provide:\s*APP_GUARD,\s*useClass:\s*FeatureGuard/.test(app);
  } catch { /* treated as gap below */ }
  if (!globalGuard) {
    gaps.push({ file: "app.module.ts", feature: "*", problem: "FeatureGuard is not a global APP_GUARD" });
  }
  return gaps;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const gaps = auditEntitlements();
  if (process.argv.includes("--format") && process.argv.includes("json")) {
    console.log(JSON.stringify({ gaps }, null, 2));
  } else if (gaps.length === 0) {
    console.log(`entitlement-audit: OK — ${Object.keys(EXPECTED).length} feature-gated + ${Object.keys(EXEMPT).length} exempt-classified controllers; FeatureGuard is global.`);
  } else {
    console.error(`entitlement-audit: ${gaps.length} gap(s):`);
    for (const g of gaps) console.error(`  - ${g.file}: ${g.problem}`);
  }
  process.exit(gaps.length === 0 ? 0 : 1);
}
