export type TenantNavPermissionKey =
  | "dashboard"
  | "shipments"
  | "waybillInbox"
  | "waybills"
  | "clients"
  | "notifications"
  | "collections"
  | "returns"
  | "transactionLog"
  | "claims"
  | "maintenance"
  | "driverCompliance"
  | "podDeliveries"
  | "driverDispatch"
  | "fleetDuty"
  | "whatsapp"
  | "email"
  | "clientQueries"
  | "rateCards"
  | "billingBatches"
  | "invoiceDrafts"
  | "invoices"
  | "proofPayments"
  | "accounting"
  | "creditControl"
  | "quotes"
  | "aiControlTower"
  | "copilot"
  | "risksExceptions"
  | "rail"
  | "railHandshake"
  | "usersRoles"
  | "settings";

export type TenantNavPermissions = Record<TenantNavPermissionKey, boolean>;

export const TENANT_NAV_PERMISSION_LABELS: Record<TenantNavPermissionKey, string> = {
  dashboard: "Dashboard",
  shipments: "Shipments",
  waybillInbox: "Waybill Inbox",
  waybills: "Waybills",
  clients: "Clients",
  notifications: "Notifications",
  collections: "Collections",
  returns: "Returns (RMA)",
  transactionLog: "Transaction Log",
  claims: "Claims & Liability",
  maintenance: "Asset Maintenance",
  driverCompliance: "Driver Compliance",
  podDeliveries: "POD / Deliveries",
  driverDispatch: "Driver Dispatch",
  fleetDuty: "Fleet Duty Board",

  whatsapp: "WhatsApp",
  email: "Email",
  clientQueries: "Client Queries",
  rateCards: "Rate Cards",
  billingBatches: "Billing Batches",
  invoiceDrafts: "Invoice Drafts",
  invoices: "Invoices",
  proofPayments: "Invoices",

  accounting: "Accounting",
  creditControl: "Credit Control",
  quotes: "Quotes",
  aiControlTower: "AI Control Tower",
  copilot: "Ask FlowOps",
  risksExceptions: "High Risk Queue",
  rail: "Rail & Intermodal",
  railHandshake: "Daily Handshake",
  usersRoles: "Users & Roles",
  settings: "Settings",
};

export const ALL_TENANT_NAV_PERMISSION_KEYS: TenantNavPermissionKey[] = [
  "dashboard",
  "shipments",
  "waybillInbox",
  "waybills",
  "clients",
  "notifications",
  "collections",
  "returns",
  "transactionLog",
  "claims",
  "maintenance",
  "driverCompliance",
  "podDeliveries",
  "driverDispatch",
  "whatsapp",
  "email",
  "clientQueries",
  "rateCards",
  "billingBatches",
  "invoiceDrafts",
  "invoices",
  "accounting",
  "creditControl",
  "quotes",
  "aiControlTower",
  "copilot",
  "risksExceptions",
  "rail",
  "railHandshake",
  "usersRoles",
  "settings",
];

export function buildFullTenantNavPermissions(): TenantNavPermissions {
  return {
    dashboard: true,
    shipments: true,
    waybillInbox: true,
    waybills: true,
    clients: true,
    notifications: true,
    collections: true,
    returns: true,
    transactionLog: true,
    claims: true,
    maintenance: true,
    driverCompliance: true,
    podDeliveries: true,
    driverDispatch: true,
    fleetDuty: true,

    whatsapp: true,
    email: true,
    clientQueries: true,
    rateCards: true,
    billingBatches: true,
    invoiceDrafts: true,
    invoices: true,
    proofPayments: true,

    accounting: true,
    creditControl: true,
    quotes: true,
    aiControlTower: true,
    copilot: true,
    risksExceptions: true,
    rail: true,
    railHandshake: true,
    usersRoles: true,
    settings: true,
  };
}

export function buildRoleDefaultTenantNavPermissions(role?: string): TenantNavPermissions {
  const value = String(role || "").trim().toUpperCase();

  // Only real `enum UserRole` values belong here. SUPER_ADMIN, ULTIMATE_OWNER
  // and TENANT_ADMIN were also checked for, but no such role exists in
  // schema.prisma, so the API can never issue one and those branches were dead.
  // They are removed rather than kept as harmless-looking aliases: a branch for
  // a role that cannot exist reads as a permission the platform has. An unknown
  // role now falls through to the all-false default at the bottom, which is the
  // correct answer for something the server will never send.
  if (value === "COMPANY_ADMIN" || value === "ADMIN") {
    return buildFullTenantNavPermissions();
  }

  if (value === "MANAGER") {
    // Operational oversight + billing visibility, but no user admin / settings.
    return {
      dashboard: true,
      shipments: true,
      waybillInbox: true,
      waybills: true,
      clients: true,
      notifications: true,
      collections: true,
      returns: true,
      transactionLog: true,
      claims: true,
      maintenance: true,
      driverCompliance: true,
      podDeliveries: true,
      driverDispatch: true,
      fleetDuty: true,

      whatsapp: true,
      email: true,
      clientQueries: true,
      rateCards: true,
      billingBatches: true,
      invoiceDrafts: true,
      invoices: true,
      proofPayments: true,

      accounting: true,
      creditControl: true,
      quotes: true,
      aiControlTower: true,
      copilot: true,
      risksExceptions: true,
      // Rail: full operational access (not a signing authority by role — see canSignRailHandshake).
      rail: true,
      railHandshake: true,
      usersRoles: false,
      settings: false,
    };
  }

  if (value === "WAREHOUSE") {
    // Hub clerk: inbound/outbound goods handling, POD capture, exception flags.
    // Returns land at the warehouse for receiving + inspection, so they get it.
    return {
      dashboard: true,
      shipments: true,
      waybillInbox: true,
      waybills: true,
      clients: false,
      notifications: true,
      collections: false,
      returns: true,
      transactionLog: true,
      claims: true,
      maintenance: true,
      driverCompliance: false,
      podDeliveries: true,
      driverDispatch: false,
      fleetDuty: false,

      whatsapp: true,
      email: false,
      clientQueries: false,
      rateCards: false,
      billingBatches: false,
      invoiceDrafts: false,
      invoices: false,
      proofPayments: false,

      accounting: false,
      creditControl: false,
      quotes: false,
      aiControlTower: false,
      copilot: false,
      risksExceptions: true,
      rail: false,
      railHandshake: false,
      usersRoles: false,
      settings: false,
    };
  }

  if (value === "DRIVER") {
    // Field driver — focused on their active deliveries / pickups.
    return {
      dashboard: true,
      shipments: false,
      waybillInbox: false,
      waybills: false,
      clients: false,
      notifications: true,
      collections: true,
      returns: false,
      transactionLog: false,
      claims: false,
      maintenance: false,
      driverCompliance: false,
      podDeliveries: true,
      driverDispatch: false,
      fleetDuty: false,

      whatsapp: true,
      email: false,
      clientQueries: false,
      rateCards: false,
      billingBatches: false,
      invoiceDrafts: false,
      invoices: false,
      proofPayments: false,

      accounting: false,
      creditControl: false,
      quotes: false,
      aiControlTower: false,
      copilot: false,
      risksExceptions: false,
      rail: false,
      railHandshake: false,
      usersRoles: false,
      settings: false,
    };
  }

  if (value === "VIEWER") {
    return buildViewerPermissions();
  }

  // OPS_CLERK (warehouse clerk) is named by the Wave-1 brief but is NOT a value
  // of the backend `UserRole` enum — the API cannot issue it, so this branch is
  // unreachable today. Adding the role needs `ALTER TYPE ... ADD VALUE`.
  //
  // It is kept as a forward-compat alias: the day the role exists, a clerk
  // inherits the dispatch profile without anyone remembering to wire it up.
  // It is deliberately NOT listed in RAIL_WRITE_ROLES / RAIL_SIGNATORY_ROLES
  // above — those are runtime gates, and a role that cannot match is a gate
  // that does not close.
  if (value === "DISPATCH" || value === "OPS_CLERK") {
    return {
      dashboard: true,
      shipments: true,
      waybillInbox: true,
      waybills: true,
      clients: true,
      notifications: true,
      collections: true,
      returns: true,
      transactionLog: true,
      claims: true,
      maintenance: true,
      driverCompliance: true,
      podDeliveries: true,
      driverDispatch: true,
      fleetDuty: true,

      whatsapp: true,
      email: true,
      clientQueries: true,
      rateCards: false,
      billingBatches: false,
      invoiceDrafts: false,
      invoices: false,
      proofPayments: false,

      accounting: false,
      creditControl: false,
      quotes: true,
      aiControlTower: true,
      copilot: true,
      risksExceptions: true,
      rail: true,
      railHandshake: true,
      usersRoles: false,
      settings: false,
    };
  }

  return {
    dashboard: true,
    shipments: true,
    waybillInbox: true,
    waybills: true,
    clients: true,
    notifications: true,
    collections: false,
    returns: false,
    transactionLog: false,
    claims: false,
    maintenance: false,
    driverCompliance: false,
    podDeliveries: true,
    driverDispatch: false,
    fleetDuty: false,

    whatsapp: false,
    email: false,
    clientQueries: false,
    rateCards: false,
    billingBatches: false,
    invoiceDrafts: false,
    invoices: false,
    proofPayments: false,

    accounting: false,
    creditControl: false,
    quotes: false,
    aiControlTower: false,
    copilot: false,
    risksExceptions: false,
    rail: false,
    railHandshake: false,
    usersRoles: false,
    settings: false,
  };
}

// ── VIEWER — Finance & Reporting ─────────────────────────────────────────

function buildViewerPermissions(): TenantNavPermissions {
  return {
    dashboard: true,
    shipments: false,
    waybillInbox: false,
    waybills: false,
    clients: false,
    notifications: true,
    collections: false,
    returns: false,
    transactionLog: false,
    claims: true,
    maintenance: true,
    driverCompliance: true,
    podDeliveries: false,
    driverDispatch: false,
    fleetDuty: false,

    whatsapp: false,
    email: false,
    clientQueries: false,
    rateCards: true,       // Rate Cards + Rate Shopping
    billingBatches: true,  // Billing Batches + COD Reconciliation
    invoiceDrafts: true,
    invoices: true,        // Finance Home + Invoices
    proofPayments: true,              // Proof & Payments (money board)
    accounting: true,      // credit/debit notes, statements, age analysis
    creditControl: true,
    quotes: true,
    aiControlTower: false,
    copilot: true,         // Ask FlowOps — analytics Q&A fits the finance/reporting viewer
    risksExceptions: false,
    // Rail is visible to the viewer but READ-ONLY: the API grants VIEWER GET only,
    // and the pages hide every mutating control (see getRailAccessLevel).
    rail: true,
    railHandshake: true,
    usersRoles: false,
    settings: false,
  };
}

export function normalizeTenantNavPermissions(
  incoming: unknown,
  role?: string
): TenantNavPermissions {
  const base = buildRoleDefaultTenantNavPermissions(role);

  if (!incoming || typeof incoming !== "object") {
    return base;
  }

  const source = incoming as Record<string, unknown>;
  const next = { ...base };

  for (const key of ALL_TENANT_NAV_PERMISSION_KEYS) {
    if (source[key] === true || source[key] === false) {
      next[key] = source[key] === true;
    }
  }

  return next;
}

// ── Rail access level ────────────────────────────────────────────────────────
//
// The boolean matrix says whether a page is VISIBLE. Rail also needs "visible but
// read-only" (VIEWER), which a boolean cannot express — so the write/sign split
// lives here, next to the matrix, and mirrors the API's role sets
// (backend/src/rail/rail-roles.ts: WRITE and SIGNATORY).

export type RailAccessLevel = "NONE" | "READ_ONLY" | "FULL";

// These MUST all be values of the backend `enum UserRole` (schema.prisma:
// ADMIN, COMPANY_ADMIN, MANAGER, DISPATCH, WAREHOUSE, AGENT, USER, DRIVER,
// VIEWER). A role named here that the API cannot issue is not a fallback — it
// is a role that silently never matches, and it misleads the next reader into
// thinking the platform has it.
//
// SUPER_ADMIN, ULTIMATE_OWNER, TENANT_ADMIN and OPS_CLERK were listed here and
// exist in NO enum. They are removed rather than kept "for when they arrive":
// a gate that cannot fire is not forward-compatibility, it is noise. Adding a
// role is a schema change; when one is added, it goes in here at the same
// time. backend/src/rail/rail-role-drift.spec.ts enforces the correspondence.
const RAIL_WRITE_ROLES = new Set([
  "COMPANY_ADMIN", "ADMIN", "MANAGER", "DISPATCH",
]);

/** Authorised representatives: may sign off, resolve and lodge Regulator disputes. */
const RAIL_SIGNATORY_ROLES = new Set([
  "COMPANY_ADMIN", "ADMIN", "MANAGER",
]);

const normRole = (role?: string) => String(role || "").trim().toUpperCase();

/**
 * NONE      — neither Rail page is visible to this user (hidden for DRIVER / WAREHOUSE,
 *             or revoked by an explicit per-user override).
 * READ_ONLY — visible, but no mutating control may be offered (VIEWER).
 * FULL      — may create and edit.
 */
export function getRailAccessLevel(role?: string, incomingPermissions?: unknown): RailAccessLevel {
  const perms = normalizeTenantNavPermissions(incomingPermissions, role);
  if (!perms.rail && !perms.railHandshake) return "NONE";
  return RAIL_WRITE_ROLES.has(normRole(role)) ? "FULL" : "READ_ONLY";
}

/** True for roles that may make formal commitments on the tenant's behalf. */
export function canSignRailHandshake(role?: string): boolean {
  return RAIL_SIGNATORY_ROLES.has(normRole(role));
}

/**
 * Per-user nav overrides the backend may attach to `/auth/me` (as `permissions`,
 * or the older `navPermissions`). The shape is deliberately loose — it is run
 * through `normalizeTenantNavPermissions`, which only trusts boolean values.
 */
export function userPermissionOverrides(user: unknown): unknown {
  const u = user as { permissions?: unknown; navPermissions?: unknown } | null | undefined;
  return u?.permissions ?? u?.navPermissions;
}
