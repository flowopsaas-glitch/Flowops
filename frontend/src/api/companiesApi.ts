import { api } from "./client";

/**
 * Branding fields applied per tenant. Every field is optional — when unset
 * the UI falls back to platform defaults (FlowOps logo, default colour palette).
 *
 * Hex colours should be 7-char `#rrggbb`. We accept anything for now and the
 * UI normalises on read.
 */
export type CompanyBranding = {
  /** Display name shown in the sidebar and headers (defaults to the tenant `name`). */
  brandName?: string | null;
  /** Public-facing booking-portal subdomain (`{subdomain}.flowops.example`). */
  portalSubdomain?: string | null;
  /** Absolute or relative URL to the tenant logo. Relative paths are resolved against `FLOWOPS_HTTP_ORIGIN`. */
  logoUrl?: string | null;
  /** Primary brand colour. Used for accents, action buttons, and the booking portal hero. */
  primaryColor?: string | null;
  /** Secondary brand colour. Used for highlights and pill backgrounds. */
  secondaryColor?: string | null;
  /** Optional override for the invoice header strip. Defaults to `primaryColor`. */
  invoiceHeaderColor?: string | null;
};

export type CompanyRecord = {
  id: number;
  name: string;
  legalName?: string | null;
  registrationNumber?: string | null;
  vatNumber?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;

  subscriptionPlan?: string | null;
  enabledFeatures: string[];
  onboardingComplete?: boolean;
  onboardingStep?: string | null;
  isActive?: boolean;

  supportEmail?: string | null;
  opsEmail?: string | null;
  quotesEmail?: string | null;
  podsEmail?: string | null;
  notificationsEmail?: string | null;
  whatsappNumber?: string | null;

  // Branding (flat on the record so the backend can keep them as columns).
  brandName?: string | null;
  portalSubdomain?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  invoiceHeaderColor?: string | null;

  /** Optional secondary display name. Some tenants prefer this over `name` / `legalName` for headers. */
  tradingName?: string | null;

  /**
   * Registered hardware devices (scanners, printers, workstations). Loose
   * shape because the backend representation is still in flux and the
   * frontend currently only reads `.length` for status counts.
   */
  hardwareDevices?: Array<Record<string, unknown>> | null;

  /**
   * Permission / module enablement. Any of these may be present depending on
   * backend version — settings UIs typically read whichever is non-empty.
   * Stored as either an array of permission keys or a key→boolean map.
   */
  permissions?: string[] | Record<string, boolean> | null;
  enabledPermissions?: string[] | Record<string, boolean> | null;
  navPermissions?: string[] | Record<string, boolean> | null;
  modules?: string[] | Record<string, boolean> | null;

  users?: Array<{
    id: number;
    email: string;
    role: string;
    createdAt?: string;
  }>;
};

export type PlatformOverview = {
  companies: number;
  users: number;
  superAdmins: number;
  companyAdmins: number;
};

export type CreateCompanyPayload = {
  name: string;
  legalName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  address?: string;
  email?: string;
  phone?: string;

  subscriptionPlan?: string;
  enabledFeatures?: string[];
  onboardingComplete?: boolean;
  onboardingStep?: string;
  isActive?: boolean;

  supportEmail?: string;
  opsEmail?: string;
  quotesEmail?: string;
  podsEmail?: string;
  notificationsEmail?: string;
  whatsappNumber?: string;
};

export type CreateCompanyAdminPayload = {
  email: string;
  password: string;
  role?: "ADMIN" | "COMPANY_ADMIN";
};

/**
 * Fields a tenant admin is allowed to PATCH on their own company. Mirrors
 * `CompanyBranding` so the editor can submit a single typed payload.
 */
export type UpdateMyCompanyBrandingPayload = CompanyBranding;

export async function getCompanies() {
  const res = await api.get<CompanyRecord[]>("/companies");
  return res.data;
}

/**
 * Returns the company record for the currently authenticated tenant user.
 * The backend resolves the tenant from the bearer token; the frontend never
 * passes a company id here.
 */
export async function getMyCompany() {
  const res = await api.get<CompanyRecord>("/companies/my-company");
  return res.data;
}

/**
 * Updates branding fields on the current tenant's company. The backend is
 * expected to enforce that the caller is a company admin; the frontend
 * doesn't pass a company id.
 */
export async function updateMyCompanyBranding(
  payload: UpdateMyCompanyBrandingPayload,
) {
  const res = await api.patch<CompanyRecord>("/companies/my-company", payload);
  return res.data;
}

/**
 * Returns the company record for the currently authenticated tenant user.
 * The backend resolves the tenant from the bearer token; the frontend never
 * passes a company id here.
 */
export async function getMyCompany() {
  const res = await api.get<CompanyRecord>("/companies/my-company");
  return res.data;
}

/**
 * Updates branding fields on the current tenant's company. The backend is
 * expected to enforce that the caller is a company admin; the frontend
 * doesn't pass a company id.
 */
export async function updateMyCompanyBranding(
  payload: UpdateMyCompanyBrandingPayload,
) {
  const res = await api.patch<CompanyRecord>("/companies/my-company", payload);
  return res.data;
}

export async function getCompany(id: number) {
  const res = await api.get<CompanyRecord>(`/companies/${id}`);
  return res.data;
}

export async function getPlatformOverview() {
  const res = await api.get<PlatformOverview>("/companies/platform/overview");
  return res.data;
}

export async function createCompany(payload: CreateCompanyPayload) {
  const res = await api.post<CompanyRecord>("/companies", payload);
  return res.data;
}

export async function updateCompany(id: number, payload: Partial<CreateCompanyPayload>) {
  const res = await api.patch<CompanyRecord>(`/companies/${id}`, payload);
  return res.data;
}

export async function createCompanyAdmin(
  companyId: number,
  payload: CreateCompanyAdminPayload
) {
  const res = await api.post(`/companies/${companyId}/admins`, payload);
  return res.data;
}