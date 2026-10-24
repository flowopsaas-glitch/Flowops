#!/usr/bin/env node
/**
 * Entitlement audit — every paid capability must be enforced server-side.
 *
 * The frontend <RequireFeature> gate fails OPEN on network errors (UX only),
 * so the real enforcement is @RequireFeature() metadata checked by the
 * globally-registered FeatureGuard. This static scan fails (exit 1) when:
 *   - a controller in EXPECTED has no matching @RequireFeature, or
 *   - FeatureGuard is not registered as a global APP_GUARD in app.module.ts.
 *
 * Usage: node scripts/entitlement-audit.mjs [--format summary|json]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(process.cwd(), "src");

/** Frontend-gated feature → backend controllers that must declare it. */
export const EXPECTED = {
  "warehouse-management/warehouse.controller.ts": "warehouseManagement",
  "commercial-analytics/commercial-analytics.controller.ts": "commercialAnalytics",
  "courier-management/courier-management.controller.ts": "courierManagement",
  "autopilot/autopilot.controller.ts": "clawAutopilot",
  "support/support.controller.ts": "aiSupportAgent",
  "disbursements/disbursements.controller.ts": "accounting",
  "accounting-integrations/accounting-integrations.controller.ts": "accountingBridge",
  "rail/rail.controller.ts": "rail",
  "rail/rail-slot.controller.ts": "rail",
  "rail/rail-change.controller.ts": "rail",
  "rail/rail-handshake.controller.ts": "rail",
  "rail/rail-manifest.controller.ts": "rail",
  "rail/rail-occurrence.controller.ts": "rail",
  "rail/rail-optimizer.controller.ts": "rail",
  "rail/rail-possession.controller.ts": "rail",
  "rail/rail-tariff.controller.ts": "rail",
  "rail/rail-weighbridge.controller.ts": "rail",
  "rail/rail-truck-appointments.controller.ts": "rail",
  // Handler-level (SSO login flow handlers are @Public and must stay open):
  "sso/sso.controller.ts": "sso",
};

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
    console.log(`entitlement-audit: OK — ${Object.keys(EXPECTED).length} controllers declare their feature; FeatureGuard is global.`);
  } else {
    console.error(`entitlement-audit: ${gaps.length} gap(s):`);
    for (const g of gaps) console.error(`  - ${g.file}: ${g.problem}`);
  }
  process.exit(gaps.length === 0 ? 0 : 1);
}

// keep `relative` referenced for future table output parity with rbac-inventory
void relative; void statSync; void readdirSync;
