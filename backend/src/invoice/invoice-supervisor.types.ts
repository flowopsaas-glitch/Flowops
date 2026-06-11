export type InvoiceSupervisorRisk = "LOW" | "MEDIUM" | "HIGH";
export type InvoiceSupervisorAction =
  | "SEND"
  | "REVIEW"
  | "HOLD"
  | "ESCALATE";

export type InvoiceSupervisorResult = {
  invoiceId: number;
  invoiceNumber: string;
  companyId: number | null;
  clientName: string | null;

  healthScore: number;
  confidence: number;
  risk: InvoiceSupervisorRisk;
  suggestedAction: InvoiceSupervisorAction;

  missingPodCount: number;
  codExposure: number;
  anomalyCount: number;

  warnings: string[];
  strengths: string[];
  summary: string;

  contractCode: string | null;
  payerSide: string | null;
  lastCheckedAt: string;
};