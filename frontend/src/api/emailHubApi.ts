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

/**
 * The backend wraps every response with TransformInterceptor:
 *   { data: <payload>, statusCode, message }
 * The axios instance's response interceptor returns response.data (the HTTP body).
 * So `raw` at runtime is { data: <payload>, ... }, and raw?.data ?? raw extracts
 * the real payload whether or not the envelope is present.
 */
function unwrap<T>(raw: any): T {
  return (raw?.data ?? raw) as T;
}

function unwrapArray<T>(raw: any): T[] {
  const data = raw?.data ?? raw;
  return (Array.isArray(data) ? data : []) as T[];
}

export async function getEmailHubItems(params?: {
  search?: string;
  type?: EmailHubType | "";
  status?: EmailHubStatus | "";
  priority?: EmailHubPriority | "";
}): Promise<EmailHubItem[]> {
  const raw: any = await api.get("/email-hub", { params });
  return unwrapArray<EmailHubItem>(raw);
}

export async function getEmailHubStats(): Promise<EmailHubStats> {
  const raw: any = await api.get("/email-hub/stats");
  return unwrap<EmailHubStats>(raw);
}

export async function getEmailHubItem(id: number): Promise<EmailHubItem> {
  const raw: any = await api.get(`/email-hub/${id}`);
  return unwrap<EmailHubItem>(raw);
}

export async function createEmailHubItem(
  payload: Partial<EmailHubItem>
): Promise<EmailHubItem> {
  const raw: any = await api.post("/email-hub", payload);
  return unwrap<EmailHubItem>(raw);
}

export async function updateEmailHubItem(
  id: number,
  payload: Partial<EmailHubItem>
): Promise<EmailHubItem> {
  const raw: any = await api.patch(`/email-hub/${id}`, payload);
  return unwrap<EmailHubItem>(raw);
}

export async function markEmailHubRead(id: number): Promise<void> {
  await api.patch(`/email-hub/${id}/read`);
}

export async function resolveEmailHubItem(id: number): Promise<void> {
  await api.patch(`/email-hub/${id}/resolve`);
}

export async function seedEmailHubDemo(): Promise<{ created: number }> {
  const raw: any = await api.post("/email-hub/seed-demo");
  return unwrap<{ created: number }>(raw);
}
