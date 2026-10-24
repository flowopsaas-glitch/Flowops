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

export type EmailHubAttachment = {
  id: string;
  filename: string;
  mimeType?: string | null;
  size: number;
  fileUrl?: string | null;
  scanStatus: "PENDING" | "CLEAN" | "THREAT" | "SKIPPED" | "ERROR";
  threatLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  threatReason?: string | null;
  scanEngine?: string | null;
};

export type EmailHubItem = {
  id: string;
  type: EmailHubType;
  status: EmailHubStatus;
  priority: EmailHubPriority;
  direction?: "INBOUND" | "OUTBOUND";
  subject: string;
  senderName?: string | null;
  senderEmail: string;
  recipientEmail?: string | null;
  body: string;
  companyId?: string | null;
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
  attachments?: EmailHubAttachment[];
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
function unwrap<T>(raw: unknown): T {
  return ((raw as { data?: T } | null)?.data ?? raw) as T;
}

function unwrapArray<T>(raw: unknown): T[] {
  const data = (raw as { data?: unknown } | null)?.data ?? raw;
  return (Array.isArray(data) ? data : []) as T[];
}

export async function getEmailHubItems(params?: {
  search?: string;
  type?: EmailHubType | "";
  status?: EmailHubStatus | "";
  priority?: EmailHubPriority | "";
}): Promise<EmailHubItem[]> {
  const raw = await api.get("/email-hub", { params });
  return unwrapArray<EmailHubItem>(raw);
}

export async function getEmailHubStats(): Promise<EmailHubStats> {
  const raw = await api.get("/email-hub/stats");
  return unwrap<EmailHubStats>(raw);
}

export async function getEmailHubItem(id: string): Promise<EmailHubItem> {
  const raw = await api.get(`/email-hub/${id}`);
  return unwrap<EmailHubItem>(raw);
}

export async function createEmailHubItem(
  payload: Partial<EmailHubItem>
): Promise<EmailHubItem> {
  const raw = await api.post("/email-hub", payload);
  return unwrap<EmailHubItem>(raw);
}

export async function updateEmailHubItem(
  id: string,
  payload: Partial<EmailHubItem>
): Promise<EmailHubItem> {
  const raw = await api.patch(`/email-hub/${id}`, payload);
  return unwrap<EmailHubItem>(raw);
}

export async function markEmailHubRead(id: string): Promise<void> {
  await api.patch(`/email-hub/${id}/read`);
}

export async function resolveEmailHubItem(id: string): Promise<void> {
  await api.patch(`/email-hub/${id}/resolve`);
}

/**
 * Compose and send an email with optional attachments. Every attachment is
 * threat-scanned server-side; files rated HIGH/CRITICAL are blocked from
 * transmission and the resulting hub item is flagged for ops.
 */
export async function sendEmailHub(
  form: { to: string; subject: string; body?: string; type?: EmailHubType; priority?: EmailHubPriority },
  files: File[] = []
): Promise<EmailHubItem> {
  const fd = new FormData();
  fd.append("to", form.to);
  fd.append("subject", form.subject);
  if (form.body) fd.append("body", form.body);
  if (form.type) fd.append("type", form.type);
  if (form.priority) fd.append("priority", form.priority);
  for (const file of files) fd.append("attachments", file);

  const raw = await api.post("/email-hub/send", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return unwrap<EmailHubItem>(raw);
}

export async function seedEmailHubDemo(): Promise<{ created: number }> {
  const raw = await api.post("/email-hub/seed-demo");
  return unwrap<{ created: number }>(raw);
}
