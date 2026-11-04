/**
 * Claims & liability — client access and presentation rules.
 *
 * A claim is an allegation with money attached. Three things this module keeps
 * straight so the page cannot flatter the data:
 *
 *   - **Liability is a statement, not a default.** `UNASSESSED` renders as
 *     "not assessed", never as "carrier". An operator who has not decided who
 *     carries the loss is shown exactly that.
 *   - **Approved and settled are different facts.** Approved money is owed and
 *     not yet credited; settled money has a credit note behind it — a DRAFT one,
 *     which finance still has to issue. The UI says which.
 *   - **The history is the claim.** Every state change, note and evidence
 *     addition is an event, and the detail view is that event list. There is no
 *     separate "comments" store to drift out of sync.
 */

import { api } from "../api/client";

export const CLAIM_TYPES = ["DAMAGE", "LOSS", "SHORTAGE", "DELAY", "THEFT"] as const;
export const CLAIM_STATUSES = ["OPEN", "UNDER_REVIEW", "APPROVED", "REJECTED", "SETTLED", "WITHDRAWN"] as const;
export const CLAIM_LIABILITIES = ["UNASSESSED", "CARRIER", "INSURER", "CLIENT", "THIRD_PARTY"] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export type ClaimLiability = (typeof CLAIM_LIABILITIES)[number];

export interface ClaimEvent {
  id: string;
  type: "CREATED" | "STATUS_CHANGED" | "NOTE_ADDED" | "EVIDENCE_ADDED" | "SETTLED";
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus | null;
  actorName: string | null;
  actorId: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface Claim {
  id: string;
  number: string;
  status: ClaimStatus;
  type: ClaimType;
  liability: ClaimLiability;
  liabilityBasis: string | null;
  liabilityCap: number | null;
  claimedAmount: number;
  approvedAmount: number | null;
  currency: string;
  summary: string;
  description: string | null;
  clientName: string | null;
  clientEmail: string | null;
  waybillId: string | null;
  waybillNumber: string | null;
  invoiceId: string | null;
  creditNoteId: string | null;
  creditNoteNumber: string | null;
  rejectionReason: string | null;
  incidentAt: string | null;
  respondBy: string | null;
  settledAt: string | null;
  closedAt: string | null;
  evidence: { refs?: string[] } | Record<string, unknown> | null;
  raisedByName: string | null;
  createdAt: string;
  updatedAt: string;
  events?: ClaimEvent[];
}

export interface ClaimSummary {
  total: number;
  open: number;
  byStatus: Partial<Record<ClaimStatus, number>>;
  byType: Partial<Record<ClaimType, number>>;
  claimedOpen: number;
  approvedPayable: number;
  overdue: number;
}

type Envelope<T> = { data: T; statusCode?: number; message?: string };

function unwrap<T>(body: Envelope<T> | T): T {
  if (body && typeof body === "object" && "data" in (body as Envelope<T>)) {
    return (body as Envelope<T>).data;
  }
  return body as T;
}

export interface ClaimQuery {
  status?: ClaimStatus | "";
  type?: ClaimType | "";
  openOnly?: boolean;
  q?: string;
  limit?: number;
}

function clean(query: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value as string | number | boolean;
  }
  return out;
}

export async function fetchClaims(query: ClaimQuery = {}): Promise<Claim[]> {
  const body = await api.get<Envelope<Claim[]>, Envelope<Claim[]>>("/claims", {
    params: clean(query as Record<string, unknown>),
  });
  const rows = unwrap(body);
  return Array.isArray(rows) ? rows : [];
}

export async function fetchClaimSummary(): Promise<ClaimSummary> {
  const body = await api.get<Envelope<ClaimSummary>, Envelope<ClaimSummary>>("/claims/summary");
  return unwrap(body);
}

export async function fetchClaim(id: string): Promise<Claim> {
  const body = await api.get<Envelope<Claim>, Envelope<Claim>>(`/claims/${id}`);
  return unwrap(body);
}

/** Mutations all return the updated claim, so the caller can swap it into state. */
async function post<T extends object>(path: string, payload: T | undefined): Promise<Claim> {
  const body = await api.post<Envelope<Claim>, Envelope<Claim>>(path, payload ?? {});
  return unwrap(body);
}

export const createClaim = (payload: Record<string, unknown>) => post("/claims", payload);
export const assessClaim = (id: string, payload: { liability: Exclude<ClaimLiability, "UNASSESSED">; liabilityBasis: string; liabilityCap?: number }) =>
  post(`/claims/${id}/assess`, payload);
export const approveClaim = (id: string, payload: { approvedAmount: number; note?: string }) =>
  post(`/claims/${id}/approve`, payload);
export const rejectClaim = (id: string, payload: { reason: string }) => post(`/claims/${id}/reject`, payload);
export const withdrawClaim = (id: string, payload: { reason?: string } = {}) =>
  post(`/claims/${id}/withdraw`, payload);
export const settleClaim = (id: string, payload: { reason?: string } = {}) =>
  post(`/claims/${id}/settle`, payload);
export const addClaimNote = (id: string, description: string) => post(`/claims/${id}/notes`, { description });
export const addClaimEvidence = (id: string, refs: string[]) => post(`/claims/${id}/evidence`, { refs });

// ── Presentation ────────────────────────────────────────────────────────────

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved — not yet settled",
  REJECTED: "Rejected",
  SETTLED: "Settled",
  WITHDRAWN: "Withdrawn",
};

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  DAMAGE: "Damage",
  LOSS: "Loss",
  SHORTAGE: "Shortage",
  DELAY: "Delay",
  THEFT: "Theft",
};

export const CLAIM_LIABILITY_LABELS: Record<ClaimLiability, string> = {
  UNASSESSED: "Not assessed",
  CARRIER: "Carrier (us)",
  INSURER: "Insurer",
  CLIENT: "Client",
  THIRD_PARTY: "Third party",
};

/** Badge tone for a status. Mirrors StatusTone so the page matches the rest of the app. */
export function claimStatusTone(status: ClaimStatus): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "OPEN":
      return "info";
    case "UNDER_REVIEW":
      return "warning";
    case "APPROVED":
      return "success";
    case "SETTLED":
      return "neutral";
    case "REJECTED":
      return "danger";
    case "WITHDRAWN":
      return "neutral";
    default:
      return "neutral";
  }
}

export const TERMINAL_STATUSES: readonly ClaimStatus[] = ["SETTLED", "REJECTED", "WITHDRAWN"];

export function isTerminal(status: ClaimStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Which actions the API would accept right now.
 *
 * Kept here rather than inline in the JSX so the page and its tests agree on one
 * rule, and so nothing offers a button that the server will refuse with a 409.
 */
export function allowedActions(status: ClaimStatus): {
  assess: boolean;
  approve: boolean;
  reject: boolean;
  withdraw: boolean;
  settle: boolean;
} {
  return {
    assess: status === "OPEN" || status === "UNDER_REVIEW",
    approve: status === "UNDER_REVIEW",
    reject: status === "OPEN" || status === "UNDER_REVIEW",
    withdraw: !isTerminal(status),
    settle: status === "APPROVED",
  };
}

/** `ZAR 4 250.00` — space-grouped, always two decimals, never a bare number. */
export function formatMoney(amount: number | null | undefined, currency = "ZAR"): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, cents] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${currency} ${amount < 0 ? "-" : ""}${grouped}.${cents}`;
}

/** True when a response is still owed and the date has passed. */
export function isOverdue(claim: Pick<Claim, "respondBy" | "status">, now: number = Date.now()): boolean {
  if (!claim.respondBy || isTerminal(claim.status)) return false;
  const due = new Date(claim.respondBy).getTime();
  return Number.isFinite(due) && due < now;
}

/**
 * The amount that is actually at stake for a claim, in the business's terms.
 *
 * Before approval that is what was claimed; after approval it is what was
 * approved. Settled claims are no longer at stake — they are a liability already
 * recorded against a credit note — so they report zero here.
 */
export function amountAtStake(claim: Pick<Claim, "status" | "claimedAmount" | "approvedAmount">): number {
  if (claim.status === "SETTLED" || claim.status === "REJECTED" || claim.status === "WITHDRAWN") return 0;
  if (claim.status === "APPROVED" || claim.status === "UNDER_REVIEW") {
    return claim.approvedAmount ?? claim.claimedAmount;
  }
  return claim.claimedAmount;
}

export function evidenceRefs(claim: Pick<Claim, "evidence">): string[] {
  const refs = (claim.evidence as { refs?: unknown } | null)?.refs;
  return Array.isArray(refs) ? refs.map(String) : [];
}

/** Form validation the server also enforces — duplicated so the user sees it first. */
export function approvalProblem(
  amount: number,
  claim: Pick<Claim, "claimedAmount" | "liabilityCap">,
): string | null {
  if (!Number.isFinite(amount)) return "Enter an amount.";
  if (amount <= 0) return "An approval of zero is a rejection — reject the claim instead.";
  if (amount > claim.claimedAmount) return `Cannot exceed the claimed amount (${formatMoney(claim.claimedAmount)}).`;
  if (claim.liabilityCap != null && amount > claim.liabilityCap) {
    return `Cannot exceed the liability cap on this claim (${formatMoney(claim.liabilityCap)}).`;
  }
  return null;
}

export interface WaybillOption {
  id: string;
  trackingNumber: string;
  clientName: string | null;
}

/**
 * Waybill picker for the raise-a-claim form.
 *
 * Claims attach to a waybill id, so the form needs a search rather than a free
 * text box — a mistyped reference would otherwise fail with a 404 that says
 * nothing useful.
 */
export async function searchWaybills(term: string, limit = 20): Promise<WaybillOption[]> {
  const body = await api.get<Envelope<unknown>, Envelope<unknown>>("/waybills", {
    params: { search: term, limit },
  });
  const payload = unwrap(body);
  const wrapped = (payload as { data?: unknown } | null)?.data;
  const rows: unknown[] = Array.isArray(payload) ? payload : Array.isArray(wrapped) ? wrapped : [];

  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "string") return [];
    const label = record.trackingNumber ?? record.number ?? record.id;
    const client = record.recipientName ?? record.clientName;
    return [
      {
        id: record.id,
        trackingNumber: String(label),
        clientName: typeof client === "string" ? client : null,
      },
    ];
  });
}
