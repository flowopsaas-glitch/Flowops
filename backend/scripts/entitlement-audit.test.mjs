import { test } from "node:test";
import assert from "node:assert/strict";
import { auditEntitlements, EXPECTED } from "./entitlement-audit.mjs";

test("every expected controller declares its feature and FeatureGuard is global", () => {
  const gaps = auditEntitlements();
  assert.deepEqual(gaps, [], `entitlement gaps: ${JSON.stringify(gaps)}`);
});

test("the expected map covers warehouse, rail and the premium modules", () => {
  const features = new Set(Object.values(EXPECTED));
  for (const f of ["warehouseManagement", "rail", "commercialAnalytics", "courierManagement", "clawAutopilot", "aiSupportAgent", "accounting", "accountingBridge", "sso"]) {
    assert.ok(features.has(f), `missing coverage for ${f}`);
  }
});
