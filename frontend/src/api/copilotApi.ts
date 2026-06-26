import { api } from "./client";

export type CopilotChart = {
  type: "bar" | "line" | "donut";
  labels: string[];
  values: number[];
};

export type CopilotAnswer = {
  question: string;
  answer: string;
  value?: number | string | null;
  unit?: "count" | "currency" | "percent" | null;
  chart?: CopilotChart | null;
  table?: Array<Record<string, any>> | null;
  intent: string;
  matched: boolean;
  tookMs: number;
};

const unwrap = <T>(r: any): T => (r?.data ?? r) as T;

export async function askCopilot(question: string): Promise<CopilotAnswer> {
  return unwrap<CopilotAnswer>(await api.post("/copilot/ask", { question }));
}

export async function getCopilotSuggestions(): Promise<string[]> {
  const r: any = await api.get("/copilot/suggestions");
  const data = r?.data ?? r;
  return data?.suggestions ?? [];
}
