import { api } from "./client";

/** The API wraps every payload as { data, statusCode, message }; tolerate an already-unwrapped value too. */
const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;
const list = <T>(r: unknown): T[] => {
  const v = unwrap<unknown>(r);
  return Array.isArray(v) ? (v as T[]) : [];
};

/**
 * Wave 3 — cancel / reschedule (Annexure 20a + 20b), possession windows, occurrence reports and the
 * dangerous-goods readiness check. Types mirror backend/src/rail/rail-change.service.ts,
 * rail-possession.service.ts, rail-occurrence.service.ts and rail-dangerous-goods.ts.
 *
 * The consequence of a cancellation (who bears it, forfeit / credit / refund) is derived on the SERVER from the
 * Annexure 20b reason and the clock. This module only carries it: the UI never computes it.
 */

// ── Cancel / reschedule ──────────────────────────────────────────────────────
export type ChangeKind = "CANCEL" | "RESCHEDULE" | "REPLAN";
export type ChangeInitiator = "TOC" | "YARD_OPERATOR" | "TRIM" | "PORT_TERMINAL_OPERATOR" | "PRASA_OTHER_IM";
export type ChangeStatus = "SUBMITTED" | "ACKNOWLEDGED" | "ALTERNATIVE_PROPOSED" | "ACCEPTED" | "CANCELLED_CONFIRMED" | "CLOSED";
export type Attribution = "TRIM" | "TOC" | "FORCE_MAJEURE" | "UNDETERMINED";
export type CodeParty = "RAIL_OPERATIONS" | "INFRASTRUCTURE_MANAGER" | "FORCE_MAJEURE" | "ALLOCATION_REQUIRED";
export type NoticeBand = "SHORT_NOTICE" | "PLANNING_VERSION" | "AFTER_DEPARTURE" | "UNKNOWN";
export type CommercialWindow = "INSIDE_72H" | "OUTSIDE_72H" | "UNKNOWN";
export type ChangeConsequence =
  | "FORFEIT_FEES_PAID_IN_ADVANCE" | "CREDIT_IF_REALLOCATED" | "FULL_TRAIN_PATH_FEE_REFUND" | "NONE_FORCE_MAJEURE"
  | "NONE_PLANNED_OCCUPATION" | "NONE_REPLACEMENT_ACCEPTED" | "PENDING_REPLACEMENT_OUTCOME" | "PENDING_ALLOCATION" | "PENDING_DEPARTURE_TIME";
export type AckState = "ACKNOWLEDGED_IN_TIME" | "ACKNOWLEDGED_LATE" | "WAITING" | "OVERDUE";

export interface CancellationCode {
  code: string; sourceRow: number; reason: string; responsibleParty: CodeParty; possibleParties: string[]; sourceText: string; fromCatalog: boolean;
}

export interface ChangeWindows {
  windows: {
    noticeWithinMinutes: number; acknowledgeWithinHours: number; shortNoticeThresholdHours: number; commercialWindowHours: number;
    itpPlanningVersions: string[]; clearinghouse: { disputeWindowHours: number; closedToDisputeAfterHours: number };
  };
  initiators: { value: ChangeInitiator; step: number; label: string; via?: string }[];
  processSteps: { step: number; path: string; title: string; detail: string[] }[];
}

export interface NoticeInfo {
  hoursBeforeDeparture: number | null; noticeBand: NoticeBand; commercialWindow: CommercialWindow;
  itpRoute: "EMERGENCY_DYNAMIC_ITP" | "PLANNING_VERSION_ITP" | null; itpVersionsNamed: string[]; note: string;
}
export interface ConsequenceInfo {
  consequence: ChangeConsequence; penaltyApplicable: boolean; penaltyAgainst: "TOC" | "TRIM" | null; basis: string; evidence: string[]; caveats: string[];
}
export interface ChangePreview {
  code: { code: string; reason: string; sourceText: string; responsibleParty: CodeParty; possibleParties: string[] };
  attribution: Attribution; isForceMajeure: boolean; notice: NoticeInfo; noticeLateMinutes: number | null;
  consequence: ConsequenceInfo; warnings: string[]; needsClearinghouseAllocation: boolean;
}

export interface ChangeRequest {
  id: string; requestNumber: string; kind: ChangeKind; status: ChangeStatus; initiatedBy: ChangeInitiator;
  cancellationCode: string; cancellationReason: string; codeResponsibleParty: CodeParty; attribution: Attribution;
  isForceMajeure: boolean; isPlannedOccupation: boolean; trainSlotRef: string;
  slotApplicationId?: string | null; consignmentId?: string | null; handshakeReportId?: string | null; handshakeDeviationId?: string | null;
  originalDeparture?: string | null; proposedDeparture?: string | null; eventOccurredAt?: string | null; requestedAt: string; acknowledgedAt?: string | null;
  noticeLateMinutes?: number | null; hoursBeforeDeparture?: number | null; noticeBand: NoticeBand; commercialWindow: CommercialWindow;
  consequence: ChangeConsequence; penaltyApplicable: boolean; penaltyAgainst?: "TOC" | "TRIM" | null; penaltyBasis?: string | null;
  requiresStaging: boolean; replacementAccepted?: boolean | null; note?: string | null; closedAt?: string | null; createdAt: string;
  /** The IM owes an acknowledgement within 1 hour — computed by the server. */
  acknowledgement: AckState;
}

export interface ChangeBody {
  kind: ChangeKind; initiatedBy: ChangeInitiator; cancellationCode: string; trainSlotRef: string;
  consignmentId?: string; slotApplicationId?: string; handshakeReportId?: string;
  originalDeparture?: string; proposedDeparture?: string; eventOccurredAt?: string;
  isPlannedOccupation?: boolean; requiresStaging?: boolean; note?: string;
}
export interface CreateChangeResult { request: ChangeRequest; warnings: string[]; consequence: ConsequenceInfo; notice: NoticeInfo }

export const getCancellationCodes = async (): Promise<CancellationCode[]> => list(await api.get("/rail/changes/codes"));
export const getChangeWindows = async (): Promise<ChangeWindows> => unwrap(await api.get("/rail/changes/windows"));
/** Nothing is saved — the server derives attribution, notice window and consequence. */
export const previewChange = async (body: ChangeBody): Promise<ChangePreview> => unwrap(await api.post("/rail/changes/preview", body));
export const listChanges = async (f: { status?: string; consignmentId?: string } = {}): Promise<ChangeRequest[]> => {
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  return list(await api.get(`/rail/changes${qs ? `?${qs}` : ""}`));
};
export const createChange = async (body: ChangeBody): Promise<CreateChangeResult> => unwrap(await api.post("/rail/changes", body));
export type ChangeAction = "acknowledge" | "accept" | "confirm-cancellation" | "close";
export const changeAction = async (id: string, action: ChangeAction): Promise<ChangeRequest> => unwrap(await api.post(`/rail/changes/${id}/${action}`, {}));
export const proposeAlternative = async (id: string, body: { proposedDeparture: string; note?: string }): Promise<ChangeRequest> =>
  unwrap(await api.post(`/rail/changes/${id}/propose-alternative`, body));
export const allocateParty = async (id: string, body: { attribution: Exclude<Attribution, "UNDETERMINED">; note: string }): Promise<ChangeRequest> =>
  unwrap(await api.post(`/rail/changes/${id}/allocate-party`, body));

// ── Possession windows ───────────────────────────────────────────────────────
export type PossessionKind = "ANNUAL_PLAN" | "LOCKED_60_DAY" | "AD_HOC_EMERGENCY";
export type PossessionStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface PossessionWindow {
  id: string; corridorCode: string; kind: PossessionKind; status: PossessionStatus; title: string; location?: string | null; description?: string | null;
  imReference?: string | null; startsAt: string; endsAt: string; noticeGivenAt?: string | null; createdAt: string;
  /** Locked windows (inside the 60-day lock, or emergency) cannot be moved — computed by the server. */
  locked: boolean; lockedFrom: string | null;
}
export interface PossessionConflict {
  windowId: string; windowTitle: string; windowKind: PossessionKind; corridorCode: string; consignmentId: string; consignmentNumber: string;
  overlapStart: string; overlapEnd: string; overlapHours: number; severity: "HARD" | "PLANNED";
}
export interface ConflictScan {
  conflicts: PossessionConflict[];
  /** Consignments with no usable schedule — they cannot be checked, and are listed rather than assumed clear. */
  unscheduled: string[];
  /** Consignments whose corridor text matches no catalog corridor — likewise listed, never guessed. */
  unresolved: string[];
  consignmentsChecked: number;
}
export interface PossessionBody {
  corridorCode: string; kind: PossessionKind; title: string; startsAt: string; endsAt: string;
  location?: string; description?: string; imReference?: string; noticeGivenAt?: string;
}
export interface CreatePossessionResult { window: PossessionWindow; conflicts: PossessionConflict[]; unscheduled: string[]; unresolved: string[] }

export const listPossessions = async (f: { corridorCode?: string; status?: string } = {}): Promise<PossessionWindow[]> => {
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  return list(await api.get(`/rail/possessions${qs ? `?${qs}` : ""}`));
};
export const getPossessionConflicts = async (consignmentId?: string): Promise<ConflictScan> =>
  unwrap(await api.get(`/rail/possessions/conflicts${consignmentId ? `?consignmentId=${encodeURIComponent(consignmentId)}` : ""}`));
export const createPossession = async (body: PossessionBody): Promise<CreatePossessionResult> => unwrap(await api.post("/rail/possessions", body));
export const cancelPossession = async (id: string): Promise<PossessionWindow> => unwrap(await api.post(`/rail/possessions/${id}/cancel`, {}));
export const completePossession = async (id: string): Promise<PossessionWindow> => unwrap(await api.post(`/rail/possessions/${id}/complete`, {}));

// ── Occurrence reports ───────────────────────────────────────────────────────
export type OccurrenceType = "DERAILMENT" | "COLLISION" | "OHTE_CABLE_THEFT" | "SPAD" | "HAZMAT_SPILL" | "OTHER";
export type OccurrenceLevel = "LEVEL_1_CODE_GREEN" | "LEVEL_2_CODE_ORANGE" | "LEVEL_3_CODE_RED";
export type OccurrenceStatus = "REPORTED" | "UNDER_INVESTIGATION" | "PRELIMINARY_REPORT_FILED" | "CLOSED";

export interface OccurrenceReport {
  id: string; occurrenceNumber: string; type: OccurrenceType; level: OccurrenceLevel; status: OccurrenceStatus;
  corridorCode?: string | null; location?: string | null; trainSlotRef?: string | null; consignmentId?: string | null;
  deviationId?: string | null; auditLogId?: string | null; occurredAt: string; description: string;
  responsibleParty: Attribution; fatalities: boolean; hazmatInvolved: boolean;
  reportedToTcoAt?: string | null; reportedToRsrAt?: string | null; preliminaryReportDueAt?: string | null; preliminaryReportFiledAt?: string | null;
  investigationNote?: string | null; closedAt?: string | null; createdAt: string;
  /** True once occurredAt + 48 h has passed without a preliminary report — computed by the server. */
  preliminaryReportOverdue: boolean;
}
export interface OccurrenceBody {
  type: OccurrenceType; level: OccurrenceLevel; occurredAt: string; description: string;
  corridorCode?: string; location?: string; trainSlotRef?: string; consignmentId?: string; handshakeReportId?: string;
  responsibleParty?: Attribution; fatalities?: boolean; hazmatInvolved?: boolean;
}
export const listOccurrences = async (status?: string): Promise<OccurrenceReport[]> =>
  list(await api.get(`/rail/occurrences${status ? `?status=${encodeURIComponent(status)}` : ""}`));
export const createOccurrence = async (body: OccurrenceBody): Promise<OccurrenceReport> => unwrap(await api.post("/rail/occurrences", body));
export const notifyOccurrence = async (id: string, to: "TCO" | "RSR", at?: string): Promise<OccurrenceReport> =>
  unwrap(await api.post(`/rail/occurrences/${id}/notify`, { to, ...(at ? { at } : {}) }));
export const startInvestigation = async (id: string, note: string): Promise<OccurrenceReport> => unwrap(await api.post(`/rail/occurrences/${id}/investigate`, { note }));
export const filePreliminaryReport = async (id: string, note: string): Promise<OccurrenceReport> => unwrap(await api.post(`/rail/occurrences/${id}/preliminary-report`, { note }));
export const closeOccurrence = async (id: string, note: string): Promise<OccurrenceReport> => unwrap(await api.post(`/rail/occurrences/${id}/close`, { note }));

// ── Dangerous goods ──────────────────────────────────────────────────────────
export type DgField = "unNumber" | "imdgClass" | "placardRef" | "emergencyContact24h" | "msdsDocumentUrl";
export interface DgGap { scope: "CONSIGNMENT" | "WAGON"; ref: string; fields: DgField[] }
export interface DgIssue { scope: "CONSIGNMENT" | "WAGON"; ref: string; field: DgField; reason: string }
/** What the dispatch gate sees — exactly (GET /rail/consignments/:id/dangerous-goods). */
export interface DgReadiness {
  required: boolean; ready: boolean; dgWagons: number; missing: DgGap[]; invalid: DgIssue[]; summary: string;
  blocksDeparture: boolean; consignmentNumber: string;
}
/** The compact readiness on every consignment list row. */
export interface DgSummary { required: boolean; ready: boolean; problems: number }

export const getDangerousGoods = async (consignmentId: string): Promise<DgReadiness> =>
  unwrap(await api.get(`/rail/consignments/${consignmentId}/dangerous-goods`));
