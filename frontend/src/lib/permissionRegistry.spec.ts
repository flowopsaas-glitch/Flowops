import { describe, it, expect } from "vitest";
import {
  PERMISSION_REGISTRY,
  TENANT_USER_ROLES,
  ROLE_ALIASES,
} from "./permissionRegistry";
import {
  ALL_TENANT_NAV_PERMISSION_KEYS,
  TENANT_NAV_PERMISSION_LABELS,
  buildRoleDefaultTenantNavPermissions,
  buildFullTenantNavPermissions,
  normalizeTenantNavPermissions,
} from "./tenantUserPermissions";

/**
 * The role matrix exactly as it shipped before the registry existed, captured
 * by executing the eight hand-written role blocks this replaced rather than by
 * reading them.
 *
 * Parsing that file was how the first attempt at this went wrong: it missed
 * `OPS_CLERK`, which shares a branch with `DISPATCH`, and it read the
 * fall-through as "no permissions" when it actually grants seven. Both are
 * pinned here so the next refactor does not rediscover them.
 *
 * This is a characterisation test. It does not claim the matrix is good; it
 * claims the registry reproduces what ran in production.
 */
const SHIPPED_MATRIX: Record<string, string[]> = {
  dashboard: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "DRIVER", "MANAGER", "VIEWER", "WAREHOUSE"],
  shipments: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "WAREHOUSE"],
  waybillInbox: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "WAREHOUSE"],
  waybills: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "WAREHOUSE"],
  clients: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER"],
  notifications: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "DRIVER", "MANAGER", "VIEWER", "WAREHOUSE"],
  collections: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "DRIVER", "MANAGER"],
  returns: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "WAREHOUSE"],
  transactionLog: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "WAREHOUSE"],
  claims: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "VIEWER", "WAREHOUSE"],
  maintenance: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "VIEWER", "WAREHOUSE"],
  driverCompliance: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "VIEWER"],
  podDeliveries: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "DRIVER", "MANAGER", "WAREHOUSE"],
  driverDispatch: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER"],
  fleetDuty: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER"],
  whatsapp: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "DRIVER", "MANAGER", "WAREHOUSE"],
  email: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER"],
  clientQueries: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER"],
  rateCards: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"],
  billingBatches: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"],
  invoiceDrafts: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"],
  invoices: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"],
  proofPayments: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"],
  accounting: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"],
  creditControl: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"],
  quotes: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "VIEWER"],
  aiControlTower: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER"],
  copilot: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "VIEWER"],
  risksExceptions: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "WAREHOUSE"],
  rail: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "VIEWER"],
  railHandshake: ["ADMIN", "COMPANY_ADMIN", "DISPATCH", "MANAGER", "VIEWER"],
  usersRoles: ["ADMIN", "COMPANY_ADMIN"],
  settings: ["ADMIN", "COMPANY_ADMIN"],
};

/** What an unrecognised role received. Not nothing — see `fallback` below. */
const SHIPPED_FALLBACK = ["clients", "dashboard", "notifications", "podDeliveries", "shipments", "waybillInbox", "waybills"];

const REAL_ROLES = [
  "ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH",
  "WAREHOUSE", "DRIVER", "VIEWER",
];

describe("permission registry", () => {
  it("reproduces the shipped role matrix for every key", () => {
    for (const [key, expected] of Object.entries(SHIPPED_MATRIX)) {
      const def = PERMISSION_REGISTRY.find((p) => p.key === key);
      expect(def, `registry is missing ${key}`).toBeDefined();
      expect([...def!.roles].sort(), key).toEqual([...expected].sort());
    }
  });

  it("grants each real role exactly the permissions it had before", () => {
    for (const role of REAL_ROLES) {
      const perms = buildRoleDefaultTenantNavPermissions(role);
      for (const key of Object.keys(SHIPPED_MATRIX)) {
        expect(perms[key as keyof typeof perms], `${role} / ${key}`).toBe(
          SHIPPED_MATRIX[key].includes(role),
        );
      }
    }
  });

  it("treats OPS_CLERK exactly as DISPATCH", () => {
    // OPS_CLERK is not in the backend enum and never was, but it has always
    // been treated as DISPATCH here. Dropping it would silently demote such a
    // user to the fallback, so the alias is asserted rather than assumed.
    const clerk = buildRoleDefaultTenantNavPermissions("OPS_CLERK");
    const dispatch = buildRoleDefaultTenantNavPermissions("DISPATCH");
    expect(clerk).toEqual(dispatch);
    expect(ROLE_ALIASES.OPS_CLERK).toBe("DISPATCH");
  });

  it("gives an unrecognised role the restricted fallback, not nothing", () => {
    for (const role of ["", "NOT_A_ROLE", "SUPER_ADMIN", "TENANT_ADMIN"]) {
      const perms = buildRoleDefaultTenantNavPermissions(role);
      const granted = Object.entries(perms)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .sort();
      expect(granted, `role "${role}"`).toEqual([...SHIPPED_FALLBACK].sort());
    }
  });

  // ── The defects this file exists to make impossible ───────────────────────

  it("derives the key list from the registry so they cannot disagree", () => {
    // Before: the union and labels had 33 keys, ALL_TENANT_NAV_PERMISSION_KEYS
    // had 31, and `fleetDuty` and `proofPayments` were therefore silently
    // un-overridable — an admin toggling either saw a change that never applied.
    expect(ALL_TENANT_NAV_PERMISSION_KEYS).toHaveLength(PERMISSION_REGISTRY.length);
    expect(Object.keys(TENANT_NAV_PERMISSION_LABELS)).toHaveLength(
      PERMISSION_REGISTRY.length,
    );
  });

  it("gives every key a distinct label", () => {
    // `invoices` and `proofPayments` were both labelled "Invoices", so the
    // admin matrix would have shown two switches with one name.
    const labels = PERMISSION_REGISTRY.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("has no duplicate keys", () => {
    const ks = PERMISSION_REGISTRY.map((p) => p.key);
    expect(new Set(ks).size).toBe(ks.length);
  });

  it("only names roles the backend can actually issue", () => {
    for (const def of PERMISSION_REGISTRY) {
      for (const role of def.roles) expect(TENANT_USER_ROLES).toContain(role);
    }
  });

  it("makes every override key reachable", () => {
    // The bug, restated positively: a per-user override for any key must win.
    for (const p of PERMISSION_REGISTRY) {
      const granted = normalizeTenantNavPermissions({ [p.key]: true }, "DRIVER");
      expect(granted[p.key as keyof typeof granted], p.key).toBe(true);
      const revoked = normalizeTenantNavPermissions({ [p.key]: false }, "ADMIN");
      expect(revoked[p.key as keyof typeof revoked], p.key).toBe(false);
    }
  });

  it("keeps buildFullTenantNavPermissions all-true", () => {
    expect(Object.values(buildFullTenantNavPermissions()).every(Boolean)).toBe(true);
  });

  // ── Keys added for routes that previously had no gate at all ──────────────
  //
  // Each mirrors the `@Roles(...)` set on the backend route the page calls, so
  // the gate can promise neither more than the API will serve nor less.

  it("mirrors the backend role set for fleet intelligence", () => {
    // backend: FLEET_INTELLIGENCE_ROLES (fleet-intelligence.controller.ts)
    expect(PERMISSION_REGISTRY.find((p) => p.key === "fleetIntelligence")!.roles).toEqual([
      "ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH",
    ]);
  });

  it("mirrors the backend role set for safety zones", () => {
    // backend: GET /safety/zones (driver-safety.controller.ts)
    expect(PERMISSION_REGISTRY.find((p) => p.key === "safetyZones")!.roles).toEqual([
      "ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE",
    ]);
  });

  it("mirrors the backend role set for border dwell", () => {
    // backend: GET /border-dwell/sessions (border-dwell.controller.ts)
    expect(PERMISSION_REGISTRY.find((p) => p.key === "borderDwell")!.roles).toEqual([
      "ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE",
    ]);
  });

  it("mirrors the backend role set for safety incidents", () => {
    // backend: safety-incident.controller.ts — DRIVER may report, not review
    expect(PERMISSION_REGISTRY.find((p) => p.key === "safetyIncidents")!.roles).toEqual([
      "ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE", "DRIVER",
    ]);
  });

  it("mirrors the backend role set for trip documents", () => {
    // backend: trip-document.controller.ts
    expect(PERMISSION_REGISTRY.find((p) => p.key === "tripDocuments")!.roles).toEqual([
      "ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE",
    ]);
  });

  it("mirrors the backend role set for trip legs", () => {
    // backend: GET /trip-legs/trips (trip-leg.controller.ts) — DRIVER included
    expect(PERMISSION_REGISTRY.find((p) => p.key === "tripLegs")!.roles).toEqual([
      "ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE", "DRIVER",
    ]);
  });
});
