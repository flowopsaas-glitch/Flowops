import { api } from "./client";

export type AIEvent = {
  id: number;
  source: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "TRIAGED" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
  title: string;
  summary: string;
  explanation?: string | null;
  suggestedAction?: string | null;
  aiScore?: number | null;
  aiConfidence?: number | null;
  aiModel?: string | null;
  aiSignals: string[];
  company?: { id: number; name: string } | null;
  client?: { id: number; name: string } | null;
  collection?: { id: number; name: string } | null;
  quote?: { id: number; title?: string | null } | null;
  emailHubItem?: { id: number; subject: string; senderEmail: string } | null;
  assignedTo?: { id: number; email: string; role: string } | null;
  detectedAt: string;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  recommendations?: Array<{
    id: number;
    title: string;
    description: string;
    status: string;
    confidence?: number | null;
  }>;
};

export type AIEventStats = {
  total: number;
  open: number;
  critical: number;
  high: number;
  resolved: number;
  upgradeIntent: number;
  demoRequests: number;
};

export async function getAIEvents(params?: {
  search?: string;
  source?: string;
  type?: string;
  severity?: string;
  status?: string;
}) {
  const res = await api.get<AIEvent[]>("/ai-events", { params });
  return res.data;
}

export async function getAIEventStats() {
  const res = await api.get<AIEventStats>("/ai-events/stats");
  return res.data;
}

export async function resolveAIEvent(id: number | string, note?: string) {
  const res = await api.post(`/ai-events/${id}/resolve`, { note });
  return res.data;
}

export async function dismissAIEvent(id: number | string) {
  const res = await api.post(`/ai-events/${id}/dismiss`);
  return res.data;
}