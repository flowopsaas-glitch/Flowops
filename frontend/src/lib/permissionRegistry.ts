/**
 * The tenant permission registry — ONE source of truth.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Before this file the same knowledge was written out three times and the three
 * copies disagreed:
 *
 *   - the `TenantNavPermissionKey` union            (33 keys)
 *   - `TENANT_NAV_PERMISSION_LABELS`                (33 keys)
 *   - `ALL_TENANT_NAV_PERMISSION_KEYS`              (31 keys)
 *
 * `fleetDuty` and `proofPayments` were in the first two and missing from the
 * third. That list is what `normalizeTenantNavPermissions` iterates to apply a
 * per-user override, so a backend that sent `fleetDuty: true` for one user was
 * silently ignored: the toggle looked like it worked and did not. The two keys
 * were also absent from the admin permission matrix, which renders from the
 * same list. A third copy — eight hand-written role blocks — set them anyway,
 * so the keys were live in role defaults and dead everywhere else.
 *
 * The label map had a second defect of the same family: `invoices` and
 * `proofPayments` were both labelled "Invoices", so the matrix would have shown
 * two identically named switches.
 *
 * Everything now derives from PERMISSION_REGISTRY below: the key union, the
 * labels, the iteration list and the per-role defaults. A key that is not in
 * the registry cannot exist, so the four lists cannot disagree again.
 *
 * WHY ROLES AND NOT A RELATIONSHIP GRAPH
 * --------------------------------------
 * FlowOps is flat B2B SaaS: nine roles, one tenant boundary, no per-resource
 * sharing and no nested ownership. Relationship-based authorisation (ReBAC,
 * Zanzibar-style) earns its complexity when permissions flow through a graph —
 * folder inheritance, user-driven sharing, per-document grants. None of that
 * applies to "who may open this page". RBAC over a declarative registry is the
 * right model here, and the layering the rest of the stack already follows is
 * the one the industry converged on: entitlement check (FeatureGuard) → role
 * check (RolesGuard) → tenant scoping (RLS / where clauses).
 *
 * The roles listed here are the DEFAULT for each role. A per-user override from
 * the backend wins, via `normalizeTenantNavPermissions`.
 */


/** Every value of the backend `enum UserRole` (prisma/schema.prisma). */
export const TENANT_USER_ROLES = [
  "ADMIN",
  "COMPANY_ADMIN",
  "MANAGER",
  "DISPATCH",
  "WAREHOUSE",
  "AGENT",
  "USER",
  "DRIVER",
  "VIEWER",
] as const;

export type TenantUserRole = (typeof TENANT_USER_ROLES)[number];

/**
 * Role names the API cannot issue but that reach this module anyway.
 *
 * `OPS_CLERK` is not in the enum — it never was — yet it has always been
 * treated as `DISPATCH` here, and a test pins that. Deleting the branch would
 * silently demote such a user to the restricted fallback. It is kept as an
 * explicit alias so the registry only ever names real roles, and so the
 * dead-name problem stays visible in one place instead of being spread across
 * role blocks.
 */
export const ROLE_ALIASES: Record<string, TenantUserRole> = {
  OPS_CLERK: "DISPATCH",
};

export type PermissionSection =
  | "CORE"
  | "OPS"
  | "BILLING"
  | "TRANSACTIONS"
  | "COMMUNICATIONS"
  | "RAIL"
  | "INSIGHTS"
  | "AI"
  | "ADMIN";

export type PermissionDefinition = {
  /** The key used in the permission matrix, the API payload and route gates. */
  key: string;
  /** Shown to admins. Must be unique: two switches with one name is a trap. */
  label: string;
  section: PermissionSection;
  /** Roles granted this permission by default. Empty means no known role. */
  roles: readonly TenantUserRole[];
  /**
   * Granted to a role this module does not recognise.
   *
   * An unrecognised role is not given nothing: it falls back to a restricted
   * working set (dashboard, shipments, waybills, clients, notifications, POD)
   * so that a role the backend adds later is not locked out of the product
   * until the frontend ships. That is a deliberate trade — an unknown name is
   * more likely to be a new role than an attack — and it is pinned by tests
   * rather than left to the next refactor to rediscover.
   */
  fallback?: true;
};

export const PERMISSION_REGISTRY = [
  { key: "dashboard", label: "Dashboard", section: "CORE", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE", "DRIVER", "VIEWER"], fallback: true },
  { key: "shipments", label: "Shipments", section: "CORE", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE"], fallback: true },
  { key: "waybillInbox", label: "Waybill Inbox", section: "CORE", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE"], fallback: true },
  { key: "waybills", label: "Waybills", section: "CORE", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE"], fallback: true },
  { key: "clients", label: "Clients", section: "CORE", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH"], fallback: true },
  { key: "notifications", label: "Notifications", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE", "DRIVER", "VIEWER"], fallback: true },
  { key: "collections", label: "Collections", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "DRIVER"] },
  { key: "returns", label: "Returns (RMA)", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE"] },
  { key: "transactionLog", label: "Transaction Log", section: "TRANSACTIONS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE"] },
  { key: "claims", label: "Claims & Liability", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE", "VIEWER"] },
  { key: "maintenance", label: "Asset Maintenance", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE", "VIEWER"] },
  { key: "driverCompliance", label: "Driver Compliance", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "VIEWER"] },
  { key: "podDeliveries", label: "POD / Deliveries", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE", "DRIVER"], fallback: true },
  { key: "driverDispatch", label: "Driver Dispatch", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH"] },
  { key: "fleetDuty", label: "Fleet Duty Board", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH"] },
  { key: "whatsapp", label: "WhatsApp", section: "COMMUNICATIONS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE", "DRIVER"] },
  { key: "email", label: "Email", section: "COMMUNICATIONS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH"] },
  { key: "clientQueries", label: "Client Queries", section: "COMMUNICATIONS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH"] },
  { key: "rateCards", label: "Rate Cards", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"] },
  { key: "billingBatches", label: "Billing Batches", section: "BILLING", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"] },
  { key: "invoiceDrafts", label: "Invoice Drafts", section: "BILLING", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"] },
  { key: "invoices", label: "Invoices", section: "BILLING", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"] },
  { key: "proofPayments", label: "Proof of Payments", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"] },
  { key: "accounting", label: "Accounting", section: "BILLING", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"] },
  { key: "creditControl", label: "Credit Control", section: "BILLING", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "VIEWER"] },
  { key: "quotes", label: "Quotes", section: "OPS", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "VIEWER"] },
  { key: "aiControlTower", label: "AI Control Tower", section: "AI", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH"] },
  { key: "copilot", label: "Ask FlowOps", section: "AI", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "VIEWER"] },
  { key: "risksExceptions", label: "High Risk Queue", section: "AI", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE"] },
  { key: "rail", label: "Rail & Intermodal", section: "RAIL", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "VIEWER"] },
  { key: "railHandshake", label: "Daily Handshake", section: "RAIL", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "VIEWER"] },
  { key: "usersRoles", label: "Users & Roles", section: "ADMIN", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { key: "settings", label: "Settings", section: "ADMIN", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { key: "fleetIntelligence", label: "Fleet Intelligence", section: "AI", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH"] },
  { key: "safetyZones", label: "Safety Zones", section: "AI", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE"] },
  { key: "tripLegs", label: "Trip Legs", section: "AI", roles: ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "WAREHOUSE", "DRIVER"] },
] as const satisfies readonly PermissionDefinition[];
