import { api } from "./client";

export type EmailHubType =
  | "COLLECTION_REQUEST"
  | "POD"
  | "QUOTE"
  | "FEEDBACK"
  | "NOTIFICATION"
  | "AI_MONITOR"
  | "GENERAL";

export type EmailHubStatus =
  | "NEW"
  | "TRIAGED"
  | "IN_PROGRESS"
  | "WAITING"
  | "RESOLVED"
  | "ARCHIVED";

export type EmailHubPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type EmailHubItem = {
  id: number;
  type: EmailHubType;
  status: EmailHubStatus;
  priority: EmailHubPriority;
  subject: string;
  senderName?: string | null;
  senderEmail: string;
  body: string;
  companyId?: number | null;
  collectionId?: number | null;
  quoteId?: number | null;
  clientId?: number | null;
  waybillNumber?: string | null;
  podNumber?: string | null;
  aiSummary?: string | null;
  aiConfidence?: number | null;
  aiCategory?: string | null;
  aiSuggestedAction?: string | null;
  opsNote?: string | null;
  assignedToId?: number | null;
  isRead: boolean;
  needsOpsAction: boolean;
  receivedAt: string;
  updatedAt: string;
  company?: { id: number; name: string } | null;
  collection?: { id: number; name: string } | null;
  quote?: { id: number } | null;
  client?: { id: number; name: string } | null;
  assignedTo?: { id: number; email: string } | null;
};

export type EmailHubStats = {
  total: number;
  unread: number;
  needsOpsAction: number;
  critical: number;
};

// ── NOTE: Backend controller is mounted at /communications (not /email-hub) ──
const BASE = "/communications";

// The axios interceptor in client.ts already unwraps response.data,
// so these helpers return the data directly (no .data needed).
export async function getEmailHubItems(params?: {
  search?: string;
  type?: EmailHubType | "";
  status?: EmailHubStatus | "";
  priority?: EmailHubPriority | "";
}): Promise<EmailHubItem[]> {
  const data = await api.get<EmailHubItem[], EmailHubItem[]>(BASE, { params });
  return Array.isArray(data) ? data : [];
}

export async function getEmailHubStats(): Promise<EmailHubStats> {
  const raw = await api.get<any, any>(`${BASE}/stats`);
  // Backend returns { total, pending, anomalies }; normalize to UI shape
  return {
    total: raw?.total ?? 0,
    unread: raw?.unread ?? raw?.pending ?? 0,
    needsOpsAction: raw?.needsOpsAction ?? raw?.pending ?? 0,
    critical: raw?.critical ?? raw?.anomalies ?? 0,
  };
}

export async function getEmailHubItem(id: number): Promise<EmailHubItem> {
  return await api.get<EmailHubItem, EmailHubItem>(`${BASE}/${id}`);
}

export async function createEmailHubItem(payload: Partial<EmailHubItem>) {
  return await api.post<EmailHubItem, EmailHubItem>(BASE, payload);
}

export async function updateEmailHubItem(id: number, payload: Partial<EmailHubItem>) {
  return await api.patch<EmailHubItem, EmailHubItem>(`${BASE}/${id}`, payload);
}

export async function markEmailHubRead(id: number) {
  return await api.patch(`${BASE}/${id}/read`);
}

export async function resolveEmailHubItem(id: number) {
  return await api.patch(`${BASE}/${id}/resolve`);
}

export async function seedEmailHubDemo() {
  return await api.post<{ created: number }, { created: number }>(`${BASE}/seed-demo`);
}
