import { api } from "./client";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type RelatedHelp = { id: string; title: string };

export type SupportLive = {
  answer: string;
  value?: number | string | null;
  unit?: "count" | "currency" | "percent" | null;
  intent?: string;
} | null;

export type SupportAnswer = {
  answer: string;
  confidence: number;
  category?: string;
  shouldEscalate: boolean;
  suggestedFollowUps: string[];
  relatedHelp: RelatedHelp[];
  live?: SupportLive;
};

export type SupportTicket = {
  id: string;
  subject: string;
  message: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "low" | "normal" | "high";
  category?: string | null;
  raisedByName?: string | null;
  aiSummary?: string | null;
  resolution?: string | null;
  createdAt: string;
};

export async function askSupport(message: string, history?: ChatTurn[]): Promise<SupportAnswer> {
  const r: any = await api.post("/support/query", { message, history });
  return r?.data ?? r;
}

export async function getSupportSuggestions(): Promise<string[]> {
  const r: any = await api.get("/support/suggestions");
  return r?.data ?? r;
}

export async function createSupportTicket(payload: {
  subject: string;
  message: string;
  priority?: "low" | "normal" | "high";
  category?: string;
  transcript?: any;
  aiSummary?: string;
}): Promise<SupportTicket> {
  const r: any = await api.post("/support/tickets", payload);
  return r?.data ?? r;
}

export async function listSupportTickets(): Promise<SupportTicket[]> {
  const r: any = await api.get("/support/tickets");
  return Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : [];
}

export async function updateSupportTicket(
  id: string,
  payload: { status?: string; resolution?: string },
): Promise<SupportTicket> {
  const r: any = await api.patch(`/support/tickets/${id}`, payload);
  return r?.data ?? r;
}
