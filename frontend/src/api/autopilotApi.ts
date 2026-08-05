import { api } from "./client";

export type Severity = "low" | "medium" | "high" | "critical";
export type SignalKind =
  | "SLA_PRE_BREACH"
  | "SLA_BREACH"
  | "STALLED_DELIVERY"
  | "COD_MISMATCH"
  | "UNASSIGNED_COLLECTION";

export type OpsSignal = {
  kind: SignalKind;
  severity: Severity;
  confidence: number;
  entity: { type: string; id: string; ref: string };
  summary: string;
  recommendedAction: string;
  autoActionable: boolean;
  executed?: boolean;
  executionResult?: string;
};

export type AutopilotConfig = {
  available: boolean;
  enabled: boolean;
  aggression: "LOW" | "MEDIUM" | "HIGH";
  globalAggression: "LOW" | "MEDIUM" | "HIGH";
};

export type AutopilotRun = {
  ranAt: string;
  totalSignals: number;
  executed: number;
  recommendedOnly: number;
  signals: OpsSignal[];
};

export type AutopilotLogEntry = {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: string;
  metadata?: any;
  createdAt: string;
};

const unwrap = (r: any) => r?.data ?? r;

export async function getAutopilotConfig(): Promise<AutopilotConfig> {
  return unwrap(await api.get("/autopilot/config"));
}

export async function setAutopilotConfig(dto: {
  enabled?: boolean;
  aggression?: string | null;
}): Promise<AutopilotConfig> {
  return unwrap(await api.put("/autopilot/config", dto));
}

export async function getAutopilotSignals(): Promise<OpsSignal[]> {
  const r = unwrap(await api.get("/autopilot/signals"));
  return Array.isArray(r) ? r : [];
}

export async function runAutopilot(auto = true): Promise<AutopilotRun> {
  return unwrap(await api.post("/autopilot/run", { auto }));
}

export async function getAutopilotLog(limit = 50): Promise<AutopilotLogEntry[]> {
  const r = unwrap(await api.get(`/autopilot/log?limit=${limit}`));
  return Array.isArray(r) ? r : [];
}
