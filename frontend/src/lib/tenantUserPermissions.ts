export type TenantNavPermissionKey =
  | "dashboard"
  | "shipments"
  | "waybillInbox"
  | "waybills"
  | "clients"
  | "notifications"
  | "collections"
  | "podDeliveries"
  | "driverDispatch"
  | "whatsapp"
  | "email"
  | "clientQueries"
  | "rateCards"
  | "billingBatches"
  | "invoiceDrafts"
  | "invoices"
  | "creditControl"
  | "quotes"
  | "aiControlTower"
  | "risksExceptions"
  | "usersRoles"
  | "settings"
  | "fleetMap"
  | "dispatchChat"
  | "driverAnalytics";

export type TenantNavPermissions = Record<TenantNavPermissionKey, boolean>;

export const TENANT_NAV_PERMISSION_LABELS: Record<TenantNavPermissionKey, string> = {
  dashboard: "Dashboard",
  shipments: "Shipments",
  waybillInbox: "Waybill Inbox",
  waybills: "Waybills",
  clients: "Clients",
  notifications: "Notifications",
  collections: "Collections",
  podDeliveries: "POD / Deliveries",
  driverDispatch: "Driver Dispatch",
  whatsapp: "WhatsApp",
  email: "Email",
  clientQueries: "Client Queries",
  rateCards: "Rate Cards",
  billingBatches: "Billing Batches",
  invoiceDrafts: "Invoice Drafts",
  invoices: "Invoices",
  creditControl: "Credit Control",
  quotes: "Quotes",
  aiControlTower: "AI Control Tower",
  risksExceptions: "High Risk Queue",
  usersRoles: "Users & Roles",
  settings: "Settings",
  fleetMap: "Live Fleet Map",
  dispatchChat: "Dispatch Chat",
  driverAnalytics: "Driver Analytics",
};

export const ALL_TENANT_NAV_PERMISSION_KEYS: TenantNavPermissionKey[] = [
  "dashboard",
  "shipments",
  "waybillInbox",
  "waybills",
  "clients",
  "notifications",
  "collections",
  "podDeliveries",
  "driverDispatch",
  "whatsapp",
  "email",
  "clientQueries",
  "rateCards",
  "billingBatches",
  "invoiceDrafts",
  "invoices",
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
    podDeliveries: true,
    driverDispatch: true,
    whatsapp: true,
    email: true,
    clientQueries: true,
    rateCards: true,
    billingBatches: true,
    invoiceDrafts: true,
    invoices: true,
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

  if (value === "DRIVER") {
    return {
      dashboard: true,
      shipments: true,
      waybillInbox: false,
      waybills: true,
      clients: false,
      notifications: true,
      collections: true,
      podDeliveries: true,
      driverDispatch: true,
      whatsapp: true,
      email: false,
      clientQueries: false,
      rateCards: false,
      billingBatches: false,
      invoiceDrafts: false,
      invoices: false,
      creditControl: false,
      quotes: false,
      aiControlTower: false,
      risksExceptions: false,
      usersRoles: false,
      settings: true,
    };
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
      podDeliveries: true,
      driverDispatch: true,
      whatsapp: true,
      email: true,
      clientQueries: true,
      rateCards: false,
      billingBatches: false,
      invoiceDrafts: false,
      invoices: false,
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
    podDeliveries: true,
    driverDispatch: false,
    whatsapp: false,
    email: false,
    clientQueries: false,
    rateCards: false,
    billingBatches: false,
    invoiceDrafts: false,
    invoices: false,
    creditControl: false,
    quotes: false,
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
