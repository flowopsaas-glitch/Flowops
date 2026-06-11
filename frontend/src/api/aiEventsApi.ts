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
  return await api.get<AIEvent[]>("/ai-events", { params }) as any;
}

export async function getAIEventStats() {
  return await api.get<AIEventStats>("/ai-events/stats") as any;
}

export async function seedAIEventsDemo() {
  return await api.post<{ created: number }>("/ai-events/seed-demo") as any;
}

export async function resolveAIEvent(id: number, resolutionNote?: string) {
  const res = await api.patch(`/ai-events/${id}/resolve`, { resolutionNote });
  return res.data;
}

export async function dismissAIEvent(id: number, resolutionNote?: string) {
  const res = await api.patch(`/ai-events/${id}/dismiss`, { resolutionNote });
  return res.data;
}