export type TenantNavPermissionKey =
  | "dashboard"
  | "shipments"
  | "waybillInbox"
  | "waybills"
  | "clients"
  | "notifications"
  | "collections"
  | "returns"
  | "podDeliveries"
  | "driverDispatch"
  | "whatsapp"
  | "email"
  | "clientQueries"
  | "rateCards"
  | "billingBatches"
  | "invoiceDrafts"
  | "invoices"
  | "accounting"
  | "creditControl"
  | "quotes"
  | "aiControlTower"
  | "risksExceptions"
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
  podDeliveries: "POD / Deliveries",
  driverDispatch: "Driver Dispatch",
  whatsapp: "WhatsApp",
  email: "Email",
  clientQueries: "Client Queries",
  rateCards: "Rate Cards",
  billingBatches: "Billing Batches",
  invoiceDrafts: "Invoice Drafts",
  invoices: "Invoices",
  accounting: "Accounting",
  creditControl: "Credit Control",
  quotes: "Quotes",
  aiControlTower: "AI Control Tower",
  risksExceptions: "High Risk Queue",
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
  "risksExceptions",
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
    podDeliveries: true,
    driverDispatch: true,
    whatsapp: true,
    email: true,
    clientQueries: true,
    rateCards: true,
    billingBatches: true,
    invoiceDrafts: true,
    invoices: true,
    accounting: true,
    creditControl: true,
    quotes: true,
    aiControlTower: true,
    risksExceptions: true,
    usersRoles: true,
    settings: true,
  };
}

export function buildRoleDefaultTenantNavPermissions(role?: string): TenantNavPermissions {
  const value = String(role || "").trim().toUpperCase();

  if (value === "SUPER_ADMIN" || value === "ULTIMATE_OWNER") {
    return buildFullTenantNavPermissions();
  }

  if (value === "COMPANY_ADMIN" || value === "ADMIN" || value === "TENANT_ADMIN") {
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
      podDeliveries: true,
      driverDispatch: true,
      whatsapp: true,
      email: true,
      clientQueries: true,
      rateCards: true,
      billingBatches: true,
      invoiceDrafts: true,
      invoices: true,
      accounting: true,
      creditControl: true,
      quotes: true,
      aiControlTower: true,
      risksExceptions: true,
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
      podDeliveries: true,
      driverDispatch: false,
      whatsapp: true,
      email: false,
      clientQueries: false,
      rateCards: false,
      billingBatches: false,
      invoiceDrafts: false,
      invoices: false,
      accounting: false,
      creditControl: false,
      quotes: false,
      aiControlTower: false,
      risksExceptions: true,
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
      podDeliveries: true,
      driverDispatch: false,
      whatsapp: true,
      email: false,
      clientQueries: false,
      rateCards: false,
      billingBatches: false,
      invoiceDrafts: false,
      invoices: false,
      accounting: false,
      creditControl: false,
      quotes: false,
      aiControlTower: false,
      risksExceptions: false,
      usersRoles: false,
      settings: false,
    };
  }

  if (value === "VIEWER") {
    return buildViewerPermissions();
  }

  if (value === "DISPATCH") {
    return {
      dashboard: true,
      shipments: true,
      waybillInbox: true,
      waybills: true,
      clients: true,
      notifications: true,
      collections: true,
      returns: true,
      podDeliveries: true,
      driverDispatch: true,
      whatsapp: true,
      email: true,
      clientQueries: true,
      rateCards: false,
      billingBatches: false,
      invoiceDrafts: false,
      invoices: false,
      accounting: false,
      creditControl: false,
      quotes: true,
      aiControlTower: true,
      risksExceptions: true,
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
    podDeliveries: true,
    driverDispatch: false,
    whatsapp: false,
    email: false,
    clientQueries: false,
    rateCards: false,
    billingBatches: false,
    invoiceDrafts: false,
    invoices: false,
    accounting: false,
    creditControl: false,
    quotes: false,
    aiControlTower: false,
    risksExceptions: false,
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
    podDeliveries: false,
    driverDispatch: false,
    whatsapp: false,
    email: false,
    clientQueries: false,
    rateCards: true,       // Rate Cards + Rate Shopping
    billingBatches: true,  // Billing Batches + COD Reconciliation
    invoiceDrafts: true,
    invoices: true,        // Finance Home + Invoices
    accounting: true,      // credit/debit notes, statements, age analysis
    creditControl: true,
    quotes: true,
    aiControlTower: false,
    risksExceptions: false,
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
