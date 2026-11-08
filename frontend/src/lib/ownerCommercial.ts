import { getOwnerApiBase } from './ownerApi'
import { getOwnerAccessToken } from './ownerSession'

/**
 * Where a tenant STANDS commercially.
 *
 * The owner console already showed what a tenant is DOING (MRR, seats,
 * waybills). It never showed where the relationship stood — being courted,
 * happy, at risk, leaving — so that lived in someone's head and got lost
 * whenever they were unavailable. This module is that surface.
 *
 * Tenant ids are strings: they come from `useParams<{ id: string }>()` in the
 * owner pages and from `company.id` on the backend. Typing them as numbers
 * here compiled only because nothing imported this module — the moment a page
 * wired it up it would have sent `undefined` into the URL.
 */

export const COMMERCIAL_STATUSES = [
  'PROSPECT',
  'ONBOARDING',
  'ACTIVE',
  'AT_RISK',
  'RENEWAL_DUE',
  'CHURNING',
  'CHURNED',
  'DORMANT',
] as const

export type CommercialStatus = (typeof COMMERCIAL_STATUSES)[number]

export function isCommercialStatus(value: unknown): value is CommercialStatus {
  return typeof value === 'string' && (COMMERCIAL_STATUSES as readonly string[]).includes(value)
}

/** Human label for a status, for chips and dropdowns. */
export const COMMERCIAL_STATUS_LABELS: Record<CommercialStatus, string> = {
  PROSPECT: 'Prospect',
  ONBOARDING: 'Onboarding',
  ACTIVE: 'Active',
  AT_RISK: 'At risk',
  RENEWAL_DUE: 'Renewal due',
  CHURNING: 'Churning',
  CHURNED: 'Churned',
  DORMANT: 'Dormant',
}

export type OwnerCommercialNote = {
  id: string
  companyId: string
  note: string
  tags: string[] | null
  createdByEmail: string | null
  createdAt: string
}

export type OwnerCommercialCounts = {
  notes: number
  quotes: number
  invoices: number
}

export type OwnerCommercialOverrideSummary = {
  features: string[]
  priceOverrideZar: number | null
} | null

export type OwnerCommercialSummary = {
  tenantId: string
  tenantName: string
  commercialStatus: CommercialStatus | null
  commercialStatusReason: string | null
  statusChangedAt: string | null
  /** Raw value, for edit forms. */
  subscriptionOverride: {
    featureOverrides: Record<string, unknown> | null
    priceOverrideZar: number | null
  }
  /** Short human-readable form, for list rows. */
  subscriptionOverrideSummary: OwnerCommercialOverrideSummary
  /** Opaque backend payloads — carried through, not inspected by the frontend. */
  latestQuote: unknown
  latestInvoice: unknown
  latestCommercialNote: OwnerCommercialNote | null
  counts: OwnerCommercialCounts
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

export async function getOwnerTenantCommercialSummary(
  tenantId: string,
): Promise<OwnerCommercialSummary> {
  return ownerFetch(`/owner/tenants/${tenantId}/commercial-summary`, {
    method: 'GET',
  })
}

export async function addOwnerCommercialNote(
  tenantId: string,
  note: string,
  tags: string[] = [],
): Promise<OwnerCommercialNote> {
  return ownerFetch(`/owner/tenants/${tenantId}/commercial-notes`, {
    method: 'POST',
    body: JSON.stringify({
      note,
      tags,
    }),
  })
}

/**
 * Set where a tenant stands.
 *
 * The backend refuses a status without a reason. Six months from now
 * "AT_RISK" on its own tells the next person nothing — the reason is the
 * whole value, so it is required rather than optional.
 */
export async function updateOwnerCommercialStatus(
  tenantId: string,
  status: CommercialStatus,
  reason: string,
): Promise<OwnerCommercialSummary> {
  return ownerFetch(`/owner/tenants/${tenantId}/status`, {
    method: 'POST',
    body: JSON.stringify({
      status,
      reason,
    }),
  })
}

export async function updateOwnerSubscriptionOverride(
  tenantId: string,
  payload: { featureOverrides?: Record<string, unknown> | null; priceOverrideZar?: number | null },
): Promise<OwnerCommercialSummary> {
  return ownerFetch(`/owner/tenants/${tenantId}/subscription-override`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createOwnerQuote(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return ownerFetch(`/owner/tenants/${tenantId}/quotes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createOwnerInvoice(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return ownerFetch(`/owner/tenants/${tenantId}/invoices`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
