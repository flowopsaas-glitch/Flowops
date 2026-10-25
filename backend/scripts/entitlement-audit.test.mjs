import { test } from "node:test";
import assert from "node:assert/strict";
import { auditEntitlements, EXPECTED, EXEMPT } from "./entitlement-audit.mjs";

test("every controller is classified and FeatureGuard is global", () => {
  const gaps = auditEntitlements();
  assert.deepEqual(gaps, [], `entitlement gaps: ${JSON.stringify(gaps)}`);
});

test("the expected map covers warehouse, rail and the premium modules", () => {
  const features = new Set(Object.values(EXPECTED));
  for (const f of ["warehouseManagement", "rail", "commercialAnalytics", "courierManagement", "clawAutopilot", "aiSupportAgent", "accounting", "accountingBridge", "sso"]) {
    assert.ok(features.has(f), `missing coverage for ${f}`);
  }
});

test("core all-plan features are enforced server-side too", () => {
  const features = new Set(Object.values(EXPECTED));
  for (const f of ["waybills", "collections", "tracking", "manifests", "rateCards"]) {
    assert.ok(features.has(f), `missing core coverage for ${f}`);
  }
});

test("EXPECTED and EXEMPT never overlap and every EXEMPT entry has a reason", () => {
  for (const file of Object.keys(EXEMPT)) {
    assert.ok(!(file in EXPECTED), `${file} is in both maps`);
    assert.ok(EXEMPT[file].length >= 12, `${file} needs a real exemption reason`);
  }
});
