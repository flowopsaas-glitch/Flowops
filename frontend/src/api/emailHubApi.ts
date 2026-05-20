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
  byType: Array<{ type: EmailHubType; _count: { _all: number } }>;
};

export async function getEmailHubItems(params?: {
  search?: string;
  type?: EmailHubType | "";
  status?: EmailHubStatus | "";
  priority?: EmailHubPriority | "";
}) {
  const res = await api.get<EmailHubItem[]>("/email-hub", { params });
  return res.data;
}

export async function getEmailHubStats() {
  const res = await api.get<EmailHubStats>("/email-hub/stats");
  return res.data;
}

export async function getEmailHubItem(id: number) {
  const res = await api.get<EmailHubItem>(`/email-hub/${id}`);
  return res.data;
}

export async function createEmailHubItem(payload: Partial<EmailHubItem>) {
  const res = await api.post<EmailHubItem>("/email-hub", payload);
  return res.data;
}

export async function updateEmailHubItem(
  id: number,
  payload: Partial<EmailHubItem>
) {
  const res = await api.patch<EmailHubItem>(`/email-hub/${id}`, payload);
  return res.data;
}

export async function markEmailHubRead(id: number) {
  await api.patch(`/email-hub/${id}/read`);
}

export async function resolveEmailHubItem(id: number) {
  await api.patch(`/email-hub/${id}/resolve`);
}

export async function seedEmailHubDemo() {
  const res = await api.post<{ created: number }>("/email-hub/seed-demo");
  return res.data;
}