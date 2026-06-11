import { api } from "./client";

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

export async function getCompanies() {
  return await api.get<CompanyRecord[]>("/companies") as any;
}

export async function getCompany(id: number) {
  return await api.get<CompanyRecord>(`/companies/${id}`) as any;
}

export async function getPlatformOverview() {
  return await api.get<PlatformOverview>("/companies/platform/overview") as any;
}

export async function createCompany(payload: CreateCompanyPayload) {
  return await api.post<CompanyRecord>("/companies", payload) as any;
}

export async function updateCompany(id: number, payload: Partial<CreateCompanyPayload>) {
  return await api.patch<CompanyRecord>(`/companies/${id}`, payload) as any;
}

export async function createCompanyAdmin(
  companyId: number,
  payload: CreateCompanyAdminPayload
) {
  return await api.post(`/companies/${companyId}/admins`, payload) as any;
}