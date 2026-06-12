import { api } from './client';
import {
  clearSession,
  getAccessToken,
  getStoredUser,
  isOwnerMode,
  setAccessToken,
  setLoginMode,
  setStoredUser,
} from '../lib/session';

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

// Owner-session helpers now delegate to lib/session.ts. Previously this file
// stored its own `flowops_owner_token` / `flowops_owner_profile` keys in
// parallel to the canonical access token, which meant logout-from-tenant
// could leave a dangling owner session in localStorage. Centralising on
// lib/session.ts removes that drift.

export function getOwnerToken(): string {
  // Only return a token when the current session IS the owner session —
  // prevents accidentally sending a tenant JWT to the owner endpoints.
  return isOwnerMode() ? (getAccessToken() ?? '') : '';
}

export function setOwnerSession(token: string, owner: Record<string, any>) {
  setAccessToken(token);
  setLoginMode('owner');
  setStoredUser(owner ?? {});
}

export function clearOwnerSession() {
  // Logout always wipes the whole session — there is only one active session
  // slot post-migration, so there's nothing tenant-side worth preserving.
  clearSession();
}

export function getOwnerProfile() {
  return isOwnerMode() ? getStoredUser<Record<string, any>>() : null;
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
