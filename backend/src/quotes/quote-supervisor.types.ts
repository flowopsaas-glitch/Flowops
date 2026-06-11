export type QuoteSupervisorRisk = "LOW" | "MEDIUM" | "HIGH";
export type QuoteSupervisorAction =
  | "SHARE"
  | "REVIEW"
  | "REPRICE"
  | "ESCALATE";

export type QuoteSupervisorResult = {
  quoteId: number;
  companyId: number | null;
  title: string | null;

  healthScore: number;
  confidence: number;
  risk: QuoteSupervisorRisk;
  suggestedAction: QuoteSupervisorAction;

  estimatedTotal: number | null;
  estimatedMarginPercent: number | null;
  estimatedMarginAmount: number | null;

  contractCode: string | null;
  acceptanceStatus: string | null;
  latestSuggestionId: number | null;

  warnings: string[];
  strengths: string[];
  summary: string;

  lastCheckedAt: string;
};