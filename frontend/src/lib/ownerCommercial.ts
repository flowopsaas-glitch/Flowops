import { getOwnerApiBase } from './ownerApi'
import { getOwnerAccessToken } from './ownerSession'

export type OwnerCommercialSummary = {
  tenantId: number
  tenantName: string
  commercialStatus: string | null
  commercialStatusReason: string | null
  statusChangedAt: string | null
  /** Opaque backend payloads — carried through, not inspected by the frontend. */
  subscriptionOverride: unknown
  subscriptionOverrideSummary: unknown
  latestQuote: unknown
  latestInvoice: unknown
  latestCommercialNote: unknown
  counts: {
    notes: number
    quotes: number
    invoices: number
  }
  updatedAt: string | null
}

async function ownerFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getOwnerAccessToken()

  if (!token) {
    throw new Error('Owner session missing')
  }

  const response = await fetch(`${getOwnerApiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })

  const text = await response.text()

  let data: unknown

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!response.ok) {
    const body = data as { message?: unknown; error?: unknown } | null
    const message =
      body?.message ||
      body?.error ||
      'Owner commercial request failed'

    throw new Error(String(message))
  }

  return data as T
}

export async function getOwnerTenantCommercialList(): Promise<OwnerCommercialSummary[]> {
  return ownerFetch('/owner/tenants-commercial', {
    method: 'GET',
  })
}

export async function getOwnerTenantCommercialSummary(tenantId: number): Promise<OwnerCommercialSummary> {
  return ownerFetch(`/owner/tenants/${tenantId}/commercial-summary`, {
    method: 'GET',
  })
}

export async function addOwnerCommercialNote(
  tenantId: number,
  note: string,
  tags: string[],
) {
  return ownerFetch(`/owner/tenants/${tenantId}/commercial-notes`, {
    method: 'POST',
    body: JSON.stringify({
      note,
      tags,
    }),
  })
}

export async function updateOwnerCommercialStatus(
  tenantId: number,
  status: string,
  reason: string,
) {
  return ownerFetch(`/owner/tenants/${tenantId}/status`, {
    method: 'POST',
    body: JSON.stringify({
      status,
      reason,
    }),
  })
}

export async function updateOwnerSubscriptionOverride(
  tenantId: number,
  payload: Record<string, unknown>,
) {
  return ownerFetch(`/owner/tenants/${tenantId}/subscription-override`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createOwnerQuote(
  tenantId: number,
  payload: Record<string, unknown>,
) {
  return ownerFetch(`/owner/tenants/${tenantId}/quotes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createOwnerInvoice(
  tenantId: number,
  payload: Record<string, unknown>,
) {
  return ownerFetch(`/owner/tenants/${tenantId}/invoices`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
