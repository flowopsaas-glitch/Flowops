import { api } from "./client";

const unwrap = (r: any) => r?.data ?? r;

// ── Enums (mirror backend Prisma enums) ──────────────────────────────────────
export type HandshakeReportStatus =
  | "DRAFT" | "PENDING_TOC" | "SIGNED_OFF" | "DISPUTED" | "CLOSED";

export type DeviationCategory =
  | "CANCELLATION" | "DELAY" | "NO_SHOW" | "RESCHEDULE" | "INFRASTRUCTURE"
  | "ROLLING_STOCK" | "OPERATIONAL" | "SECURITY" | "WEATHER" | "OTHER";

export type ResponsibleParty =
  | "UNDETERMINED" | "IM" | "THIS_TOC" | "ANOTHER_TOC" | "EXTERNAL" | "FORCE_MAJEURE";

export type SlotImpact = "NONE" | "NOT_USED" | "CANCELLED" | "RESCHEDULED" | "DELAYED";

export type DeviationStatus = "LOGGED" | "AGREED" | "OPEN" | "RESOLVED" | "DISPUTED";

export type EscalationStage =
  | "NONE" | "LIAISON_MANAGER_24H" | "HEAD_LIAISON_48H"
  | "ROUTE_LOGISTICS_FORUM" | "REGULATOR_DISPUTE";

export interface HandshakeDeviation {
  id: string;
  reportId: string;
  trainSlotRef: string;
  orderNumber?: string | null;
  consignmentId?: string | null;
  category: DeviationCategory;
  reason: string;
  rootCause?: string | null;
  location?: string | null;
  occurredAt?: string | null;
  delayMinutes?: number | null;
  responsibleParty: ResponsibleParty;
  slotImpact: SlotImpact;
  costZar?: number | null;
  costRecovered: boolean;
  status: DeviationStatus;
  escalationStage: EscalationStage;
  disputeReason?: string | null;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HandshakeReport {
  id: string;
  reportNumber: string;
  status: HandshakeReportStatus;
  reportDate: string;
  windowStart: string;
  windowEnd: string;
  railOperator?: string | null;
  corridor?: string | null;
  signedOffAt?: string | null;
  signedOffBy?: string | null;
  imReference?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  deviations?: HandshakeDeviation[];
  openItems?: number;
  _count?: { deviations: number };
}

export interface HandshakeOverview {
  totalReports: number;
  openItems: number;
  disputes: number;
  atRegulator: number;
  recoverableExposureZar: number;
  byResponsibleParty: {
    responsibleParty: ResponsibleParty;
    count: number;
    totalDelayMinutes: number;
    totalCostZar: number;
  }[];
}

// ── Overview ──────────────────────────────────────────────────────────────────
export const getHandshakeOverview = async (): Promise<HandshakeOverview> =>
  unwrap(await api.get(`/rail/handshake/overview`));

// ── Reports ───────────────────────────────────────────────────────────────────
export const listHandshakeReports = async (
  f: { status?: string; corridor?: string } = {},
): Promise<HandshakeReport[]> => {
  const qs = new URLSearchParams(
    Object.entries(f).filter(([, v]) => v) as [string, string][],
  ).toString();
  const r = unwrap(await api.get(`/rail/handshake/reports${qs ? `?${qs}` : ""}`));
  return Array.isArray(r) ? r : [];
};

export const getHandshakeReport = async (id: string): Promise<HandshakeReport> =>
  unwrap(await api.get(`/rail/handshake/reports/${id}`));

export const createHandshakeReport = async (dto: {
  reportDate?: string; railOperator?: string; corridor?: string; imReference?: string; notes?: string;
}): Promise<HandshakeReport> =>
  unwrap(await api.post(`/rail/handshake/reports`, dto));

export const updateHandshakeReport = async (
  id: string,
  dto: { railOperator?: string; corridor?: string; imReference?: string; notes?: string },
): Promise<HandshakeReport> =>
  unwrap(await api.patch(`/rail/handshake/reports/${id}`, dto));

export const issueHandshakeReport = async (id: string): Promise<HandshakeReport> =>
  unwrap(await api.post(`/rail/handshake/reports/${id}/issue`, {}));

export const signOffHandshakeReport = async (id: string, signedOffBy: string): Promise<HandshakeReport> =>
  unwrap(await api.post(`/rail/handshake/reports/${id}/sign-off`, { signedOffBy }));

export const runHandshakeEscalation = async (id: string) =>
  unwrap(await api.post(`/rail/handshake/reports/${id}/run-escalation`, {}));

// ── Deviations ──────────────────────────────────────────────────────────────
export const logDeviation = async (reportId: string, dto: Partial<HandshakeDeviation>) =>
  unwrap(await api.post(`/rail/handshake/reports/${reportId}/deviations`, dto));

export const updateDeviation = async (
  reportId: string, deviationId: string, dto: Partial<HandshakeDeviation>,
) =>
  unwrap(await api.patch(`/rail/handshake/reports/${reportId}/deviations/${deviationId}`, dto));

export const reviewDeviation = async (
  reportId: string, deviationId: string, agree: boolean, disputeReason?: string,
) =>
  unwrap(await api.post(`/rail/handshake/reports/${reportId}/deviations/${deviationId}/review`, {
    agree, disputeReason,
  }));

export const resolveDeviation = async (
  reportId: string, deviationId: string,
  dto: { resolutionNote?: string; responsibleParty?: ResponsibleParty; costRecovered?: boolean },
) =>
  unwrap(await api.post(`/rail/handshake/reports/${reportId}/deviations/${deviationId}/resolve`, dto));

export const lodgeDispute = async (reportId: string, deviationId: string) =>
  unwrap(await api.post(`/rail/handshake/reports/${reportId}/deviations/${deviationId}/dispute`, {}));

export const removeDeviation = async (reportId: string, deviationId: string) =>
  unwrap(await api.delete(`/rail/handshake/reports/${reportId}/deviations/${deviationId}`));

// ── UI label helpers ──────────────────────────────────────────────────────────
export const RESPONSIBLE_PARTY_LABEL: Record<ResponsibleParty, string> = {
  UNDETERMINED: "Undetermined",
  IM: "Infrastructure Manager",
  THIS_TOC: "Us (this TOC)",
  ANOTHER_TOC: "Another operator",
  EXTERNAL: "External party",
  FORCE_MAJEURE: "Force majeure",
};

export const ESCALATION_LABEL: Record<EscalationStage, string> = {
  NONE: "—",
  LIAISON_MANAGER_24H: "24h · IM Liaison Manager",
  HEAD_LIAISON_48H: "48h · IM Head of Liaison",
  ROUTE_LOGISTICS_FORUM: "72h · Route Logistics Forum",
  REGULATOR_DISPUTE: "Regulator dispute",
};

export const DEVIATION_CATEGORY_LABEL: Record<DeviationCategory, string> = {
  CANCELLATION: "Cancellation",
  DELAY: "Delay",
  NO_SHOW: "No-show",
  RESCHEDULE: "Reschedule",
  INFRASTRUCTURE: "Infrastructure fault",
  ROLLING_STOCK: "Rolling stock fault",
  OPERATIONAL: "Operational",
  SECURITY: "Security / theft",
  WEATHER: "Weather",
  OTHER: "Other",
};
