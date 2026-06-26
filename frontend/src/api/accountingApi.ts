import { api, getApiBaseUrl, getToken } from "./client";

export type CreditNoteStatus = "DRAFT" | "ISSUED" | "APPLIED" | "VOID";
export type DebitNoteStatus = "DRAFT" | "ISSUED" | "SETTLED" | "VOID";
export type CommissionStatus = "PENDING" | "APPROVED" | "PAID" | "VOID";

export type NoteItem = { id?: string; description: string; quantity: number; unitPrice: number; total?: number };

export type CreditNote = {
  id: string; number: string; status: CreditNoteStatus;
  clientName: string; clientEmail?: string | null; invoiceId?: string | null;
  reason?: string | null; subtotal: number; tax: number; total: number; appliedAmount: number;
  issuedAt?: string | null; appliedAt?: string | null;
  items: NoteItem[]; createdAt: string;
};

export type DebitNote = {
  id: string; number: string; status: DebitNoteStatus;
  clientName: string; clientEmail?: string | null; invoiceId?: string | null;
  reason?: string | null; subtotal: number; tax: number; total: number;
  issuedAt?: string | null; settledAt?: string | null;
  items: NoteItem[]; createdAt: string;
};

export type StatementLine = { date: string; ref: string; description: string; debit: number; credit: number; balance: number };
export type Statement = {
  client: string; from: string; to: string;
  openingBalance: number; closingBalance: number; totalDebit: number; totalCredit: number;
  lines: StatementLine[];
};

export type AgeRow = { clientName: string; current: number; d30: number; d60: number; d90: number; d90plus: number; total: number };
export type AgeAnalysis = { clients: AgeRow[]; totals: Omit<AgeRow, "clientName"> };

export type Salesperson = { id: string; name: string; email?: string | null; defaultCommissionPct: number; isActive: boolean };
export type Commission = {
  id: string; salespersonId: string; periodMonth: string; baseAmount: number; ratePct: number;
  amount: number; status: CommissionStatus; note?: string | null;
  salesperson?: { id: string; name: string };
  invoice?: { invoiceNumber: string; clientName: string } | null;
  createdAt: string;
};
export type CommissionSummaryRow = {
  salespersonId: string; name: string; pending: number; approved: number; paid: number; total: number; count: number;
};

export type AiRecommendation = { priority: "HIGH" | "MEDIUM" | "LOW"; title: string; detail: string };
export type AiCollectionTarget = { client: string; outstanding: number; overdue: number; oldest90Plus: number; action: string };
export type AiCreditRisk = { client: string; outstanding: number; creditLimit: number; over: number };
export type AiAssist = {
  generatedAt: string; assistant: string; summary: string; riskScore: number;
  kpis: { totalOutstanding: number; seriouslyOverdue: number; collectedLast30: number; unappliedCredits: number; pendingCommission: number };
  recommendations: AiRecommendation[];
  collectionTargets: AiCollectionTarget[];
  creditRisks: AiCreditRisk[];
};

const unwrap = <T>(r: any): T => (r?.data ?? r) as T;
const arr = <T>(r: any): T[] => (Array.isArray(r) ? r : r?.data ?? []);

type NotePayload = {
  clientName: string; clientEmail?: string; invoiceId?: string; reason?: string;
  taxRate?: number; items: { description: string; quantity?: number; unitPrice: number }[];
};

// ── Credit notes ────────────────────────────────────────────────────────
export const listCreditNotes = async (q: Record<string, string> = {}) => arr<CreditNote>(await api.get("/credit-notes", { params: q }));
export const createCreditNote = async (p: NotePayload) => unwrap<CreditNote>(await api.post("/credit-notes", p));
export const issueCreditNote = async (id: string) => unwrap<CreditNote>(await api.post(`/credit-notes/${id}/issue`, {}));
export const applyCreditNote = async (id: string, body: { invoiceId?: string; amount?: number }) => unwrap<CreditNote>(await api.post(`/credit-notes/${id}/apply`, body));
export const voidCreditNote = async (id: string) => unwrap<CreditNote>(await api.post(`/credit-notes/${id}/void`, {}));

// ── Debit notes ─────────────────────────────────────────────────────────
export const listDebitNotes = async (q: Record<string, string> = {}) => arr<DebitNote>(await api.get("/debit-notes", { params: q }));
export const createDebitNote = async (p: NotePayload) => unwrap<DebitNote>(await api.post("/debit-notes", p));
export const issueDebitNote = async (id: string) => unwrap<DebitNote>(await api.post(`/debit-notes/${id}/issue`, {}));
export const settleDebitNote = async (id: string) => unwrap<DebitNote>(await api.post(`/debit-notes/${id}/settle`, {}));
export const voidDebitNote = async (id: string) => unwrap<DebitNote>(await api.post(`/debit-notes/${id}/void`, {}));

// ── Statements + aging ────────────────────────────────────────────────────
export const getStatement = async (client: string, from?: string, to?: string) =>
  unwrap<Statement>(await api.get("/accounting/statement", { params: { client, from: from ?? "", to: to ?? "" } }));
export const getAgeAnalysis = async () => unwrap<AgeAnalysis>(await api.get("/accounting/age-analysis"));

// ── AI assist ─────────────────────────────────────────────────────────────
export const getAiAssist = async () => unwrap<AiAssist>(await api.get("/accounting/ai-assist"));

// ── Salespeople + commission ────────────────────────────────────────────
export const listSalespeople = async () => arr<Salesperson>(await api.get("/salespeople"));
export const createSalesperson = async (p: { name: string; email?: string; defaultCommissionPct?: number }) =>
  unwrap<Salesperson>(await api.post("/salespeople", p));
export const listCommissions = async (q: Record<string, string> = {}) => arr<Commission>(await api.get("/commissions", { params: q }));
export const commissionSummary = async (periodMonth?: string) =>
  arr<CommissionSummaryRow>(await api.get("/commissions/summary", { params: periodMonth ? { periodMonth } : {} }));
export const generateCommissions = async (p: { salespersonId: string; periodMonth: string; ratePct?: number; basis?: "subtotal" | "total" }) =>
  unwrap<{ created: number; skipped: number; totalCommission: number; salesperson: string }>(await api.post("/commissions/generate", p));
export const approveCommission = async (id: string) => unwrap<Commission>(await api.post(`/commissions/${id}/approve`, {}));
export const payCommission = async (id: string) => unwrap<Commission>(await api.post(`/commissions/${id}/mark-paid`, {}));

// ── CSV / Pastel export (auth-aware blob download) ─────────────────────────
export async function downloadExport(type: "invoices" | "credit-notes" | "payments" | "pastel") {
  const token = getToken();
  const res = await fetch(`${getApiBaseUrl()}/accounting/export/${type}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? `${type}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
