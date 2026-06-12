import axios from './client'
import { FLOWOPS_API_URL } from '../lib/env'

export type TenantDashboardMetrics = {
  companies: number
  users: number
  collections: number
  invoices: number
  notifications: number
  drivers: number
  shipments: number
}

async function safeGet<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await axios.get(url)
    return (response?.data ?? fallback) as T
  } catch {
    return fallback
  }
}

export async function getTenantDashboardMetrics(): Promise<TenantDashboardMetrics> {
  const [
    collections,
    invoices,
    notifications,
    drivers,
    shipments,
    users,
    company,
  ] = await Promise.all([
    safeGet<any[]>('/collections', []),
    safeGet<any[]>('/invoices', []),
    safeGet<any[]>('/notifications', []),
    safeGet<any[]>('/drivers', []),
    safeGet<any[]>('/shipments/live', []),
    safeGet<any[]>('/users/my-company', []),
    safeGet<any>('/companies/my-company', null),
  ])

  return {
    companies: company ? 1 : 0,
    users: Array.isArray(users) ? users.length : 0,
    collections: Array.isArray(collections) ? collections.length : 0,
    invoices: Array.isArray(invoices) ? invoices.length : 0,
    notifications: Array.isArray(notifications) ? notifications.length : 0,
    drivers: Array.isArray(drivers) ? drivers.length : 0,
    shipments: Array.isArray(shipments) ? shipments.length : 0,
  }
}

export async function getTenantClients() {
  const companies = await safeGet<any[]>('/companies', [])
  return Array.isArray(companies) ? companies : []
}

export async function getTenantNotifications() {
  const notifications = await safeGet<any[]>('/notifications', [])
  return Array.isArray(notifications) ? notifications : []
}

export async function markTenantNotificationRead(id: string | number) {
  try {
    const response = await axios.patch(`/notifications/${id}/read`)
    return response?.data ?? { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function getTenantWhatsAppRegistrations() {
  const company = await safeGet<any>('/companies/my-company', null)

  if (!company) {
    return []
  }

  const candidates = [
    company.portalWhatsappNo,
    company.whatsappNumber,
    company.phone,
  ].filter(Boolean)

  return candidates.map((value: any, index: number) => ({
    id: `wa-${index + 1}`,
    label: index === 0 ? 'Primary' : `Number ${index + 1}`,
    value: String(value),
  }))
}

export async function registerTenantWhatsAppNumber(payload: {
  clientName: string
  whatsappNumber: string
}) {
  try {
    const response = await axios.post('/whatsapp/register-client-number', payload)
    return response?.data ?? { ok: true }
  } catch (error: any) {
    return {
      ok: false,
      message:
        error?.response?.data?.message ||
        error?.message ||
        'WhatsApp registration failed',
    }
  }
}

export async function getTenantPortalLinks() {
  const company = await safeGet<any>('/companies/my-company', null)

  if (!company?.id) {
    return []
  }

  const links = await safeGet<any[]>(`/booking-portal/companies/${company.id}/links`, [])
  return Array.isArray(links) ? links : []
}

export async function createTenantPortalLink(payload: {
  companyId: number
  clientId?: number | null
  clientName?: string | null
}) {
  try {
    const response = await axios.post(
      `/booking-portal/companies/${payload.companyId}/links`,
      {
        clientId: payload.clientId ?? null,
        clientName: payload.clientName ?? null,
      },
    )

    return response?.data ?? { ok: true }
  } catch (error: any) {
    return {
      ok: false,
      message:
        error?.response?.data?.message ||
        error?.message ||
        'Portal link creation failed',
    }
  }
}

export async function getTenantMyCompany() {
  return safeGet<any>('/companies/my-company', null)
}

export async function createTenantClient(data: any) {
  const response = await fetch(`${FLOWOPS_API_URL}/companies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create client');
  }
  
  return response.json();
}
