import { api } from "./client";

export type SupervisorSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SupervisorArea = "SHIPMENTS" | "COLLECTIONS" | "BILLING" | "POD" | "ROUTING" | "TENANTS" | "AI";

export type SupervisorAlert = {
  id: string;
  title: string;
  description: string;
  severity: SupervisorSeverity;
  area: SupervisorArea;
  owner: string;
  eta: string;
};

export type SupervisorRecommendation = {
  id: string;
  title: string;
  description: string;
  impact: string;
  category: "CUSTOMER" | "ROUTE" | "BILLING" | "OPERATIONS" | "TENANT";
  action: { type: string; payload?: any };
};

export type SupervisorOverview = {
  ok: true;
  scope: "tenant" | "platform";
  generatedAt: string;
  tenant: { companyId: number | null; companyName: string | null };
  assistant: {
    provider: string;
    mode: "rules" | "hybrid";
    autopilot: boolean;
    note: string;
  };
  metrics: {
    totalCollections: number;
    pendingCollections: number;
    unassignedDispatches: number;
    waybillsMissingPod: number;
    draftInvoices: number;
    highSeverityEvents: number;
    activeTenants: number | null;
  };
  alerts: SupervisorAlert[];
  recommendations: SupervisorRecommendation[];
  copilotContext: Record<string, any>;
};

/**
 * THE CLAW: SYSTEM MONITORING LOGIC
 * Automatically reports 404/500 errors to the AI Repair engine
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 404 || error.response?.status === 500) {
      console.error("🕵️ THE CLAW DETECTED SYSTEM DAMAGE:", error.config.url);
      
      // Attempt to notify the backend to "Auto-Upgrade" or fix the route
      try {
        await api.post("/ai-ops/repair-route", {
          failedPath: error.config.url,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      } catch (reportError) {
        console.warn("AI Repair engine unreachable. System requires manual backend restart.");
      }
    }
    return Promise.reject(error);
  }
);

export async function getSupervisorOverview() {
  // Matches the failing route in Screenshot from 2026-05-03 15-57-02.jpg
  const res = await api.get<SupervisorOverview>("/ai-ops/supervisor/overview");
  return res.data;
}
