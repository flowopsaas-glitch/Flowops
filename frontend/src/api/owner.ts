import { api } from './client';

export type OwnerPlan = {
  code: string;
  name: string;
  priceMonthly: number;
  maxUsers: number;
  maxBranches: number;
  aiEnabled?: boolean;
  whatsappEnabled?: boolean;
  description?: string;
};

export type OwnerTenant = {
  tenantId: number;
  tenantName: string;
  planCode: string;
  status: string;
  billingStatus: string;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  isDemo: boolean;
  daysRemaining: number;
  lifecycle: string;
  tenantHealthScore: number;
  aiAlertCount: number;
  telemetry?: Record<string, any>;
};

const OWNER_TOKEN_KEY = 'flowops_owner_token';
const OWNER_PROFILE_KEY = 'flowops_owner_profile';

export function getOwnerToken() {
  return localStorage.getItem(OWNER_TOKEN_KEY) || '';
}

export function setOwnerSession(token: string, owner: Record<string, any>) {
  localStorage.setItem(OWNER_TOKEN_KEY, token);
  localStorage.setItem(OWNER_PROFILE_KEY, JSON.stringify(owner || {}));
}

export function clearOwnerSession() {
  localStorage.removeItem(OWNER_TOKEN_KEY);
  localStorage.removeItem(OWNER_PROFILE_KEY);
}

export function getOwnerProfile() {
  const raw = localStorage.getItem(OWNER_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ownerHeaders() {
  return {
    Authorization: `Bearer ${getOwnerToken()}`,
  };
}

export async function ownerLogin(payload: { email: string; accessKey: string }) {
  const { data } = await api.post('/owner/auth/login', payload);
  setOwnerSession(data.token, data.owner);
  return data;
}

export async function fetchOwnerTenants() {
  const { data } = await api.get('/owner/tenants', { headers: ownerHeaders() });
  return data;
}

export async function fetchOwnerPlatformMetrics() {
  const { data } = await api.get('/owner/platform-metrics', { headers: ownerHeaders() });
  return data;
}

export async function fetchOwnerAiAlerts() {
  const { data } = await api.get('/owner/ai-alerts', { headers: ownerHeaders() });
  return data;
}

export async function fetchOwnerAudit() {
  const { data } = await api.get('/owner/audit', { headers: ownerHeaders() });
  return data;
}

export async function fetchOwnerPlans() {
  const { data } = await api.get('/owner/plans', { headers: ownerHeaders() });
  return data;
}

export async function updateOwnerPlans(plans: OwnerPlan[]) {
  const { data } = await api.patch(
    '/owner/plans',
    { plans },
    { headers: ownerHeaders() },
  );
  return data;
}

export async function createOwnerTenantDraft(payload: Record<string, any>) {
  const { data } = await api.post('/owner/tenants/draft', payload, {
    headers: ownerHeaders(),
  });
  return data;
}

export async function runOwnerTenantAction(
  tenantId: number,
  payload: { action: 'SUSPEND' | 'REACTIVATE' | 'CHANGE_PLAN'; payload?: Record<string, any> },
) {
  const { data } = await api.patch(`/owner/tenants/${tenantId}/action`, payload, {
    headers: ownerHeaders(),
  });
  return data;
}

export async function getOwnerViewMode(tenantId: number) {
  const { data } = await api.get(`/owner/view-mode/${tenantId}`, {
    headers: ownerHeaders(),
  });
  return data;
}

