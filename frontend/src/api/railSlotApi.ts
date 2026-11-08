import { api } from "./client";

/** The API wraps every payload as { data, statusCode, message }; tolerate an already-unwrapped value too. */
const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;

// ── Enums (mirror the backend Prisma enums) ──────────────────────────────────
export type RailGauge = "CAPE_1067MM" | "NARROW_610MM" | "STANDARD_1435MM";
export type RailElectrification = "DC_3KV" | "AC_25KV" | "AC_50KV" | "DIESEL";
export type RailVehicleProfile = "A" | "B" | "B_PLUS_1";
export type RailDataStatus = "SOURCE_PENDING" | "VERIFIED";
export type RailComplianceDocType =
  | "RSR_PERMIT" | "INSURANCE" | "ROLLING_STOCK_CERT" | "TRAIN_CREW_CERT"
  | "DANGEROUS_GOODS" | "INTERFACE_AGREEMENT" | "ACCESS_CONTRACT" | "SECURITY_DEPOSIT";
export type RailComplianceDocStatus = "PENDING_REVIEW" | "VALID" | "EXPIRED" | "REVOKED";
export type EffectiveDocStatus = RailComplianceDocStatus | "NOT_YET_VALID";
export type SlotApplicationStatus =
  | "DRAFT" | "SUBMITTED" | "UNDER_ASSESSMENT" | "CAPACITY_CONFLICT" | "ALLOCATED" | "REJECTED" | "EXPIRED";
export type MobilisationState =
  | "NOT_ALLOCATED" | "ON_TRACK" | "DUE_SOON" | "OVERDUE" | "FORFEITURE_FLAGGED" | "OPERATED" | "CLOSED";
export type EnvelopeStatus = "COMPATIBLE" | "INCOMPATIBLE" | "UNVERIFIED";
export type RsrGuardLevel = "OK" | "WARNING" | "CRITICAL" | "EXPIRED" | "PENDING_REVIEW" | "MISSING";

export interface Corridor {
  code: string; name: string; aliases: string[]; workbookRoutes: string[];
  gauge: RailGauge | null; electrification: string[]; maxAxleLoadTonnes: number | null;
  vehicleProfile: RailVehicleProfile | null; maxTrainLengthM: number | null;
  dataStatus: RailDataStatus; sourceRef: string | null; notes: string | null; fromCatalog: boolean;
}

export interface Mobilisation {
  state: MobilisationState; mobilizeBy: string | null; daysRemaining: number | null; label: string;
}

export interface SlotApplication {
  id: string; applicationNumber: string; status: SlotApplicationStatus;
  corridorCode: string; originName?: string | null; destinationName?: string | null; railOperator?: string | null;
  imReference?: string | null; tractionType?: RailElectrification | null; commodity?: string | null;
  isDangerousGoods: boolean; trainsPerWeek?: number | null; wagonsPerTrain?: number | null; annualTonnes?: number | null;
  gauge?: RailGauge | null; axleLoadTonnes?: number | null; vehicleProfile?: RailVehicleProfile | null; trainLengthM?: number | null;
  requestedFrom: string; requestedUntil: string; validFrom?: string | null; validUntil?: string | null;
  selfScreening?: { version?: string; answers: SelfScreeningAnswer[] } | null;
  selfScreeningAccessType?: string | null; selfScreeningCompletedAt?: string | null;
  envelopeCheckStatus?: EnvelopeStatus | null;
  submittedAt?: string | null; allocatedAt?: string | null; mobilizeBy?: string | null; firstOperatedAt?: string | null;
  forfeitureFlaggedAt?: string | null; conflictNote?: string | null; rejectionReason?: string | null;
  consignmentId?: string | null; createdAt: string;
  /** Advisory snapshot taken at submission — never a submission blocker. */
  capacityCheckStatus?: CapacityStatus | null;
  capacityCheck?: CapacityCheck | null;
  mobilisation: Mobilisation;
}

export interface SelfScreeningAnswer { no: string; answer: "YES" | "NO"; remarks?: string }
export interface SelfScreeningQuestion { no: string; key: string; assessment: string; evidenceRequested?: string; refers?: string }

export interface ComplianceDoc {
  id: string; docType: RailComplianceDocType; status: RailComplianceDocStatus; effectiveStatus: EffectiveDocStatus;
  /** Whole days to the last valid day, computed by the server (negative once expired). */
  daysRemaining: number;
  referenceNumber?: string | null; issuer?: string | null; validFrom: string; validUntil: string;
  documentUrl?: string | null; notes?: string | null; revokedReason?: string | null;
}

export interface ComplianceEvaluation {
  stage: "SUBMIT" | "OPERATE"; ok: boolean; required: RailComplianceDocType[]; satisfied: RailComplianceDocType[];
  missing: RailComplianceDocType[]; expired: RailComplianceDocType[]; revoked: RailComplianceDocType[];
  pendingReview: RailComplianceDocType[]; notYetValid: RailComplianceDocType[];
  expiringSoon: { docType: RailComplianceDocType; validUntil: string; daysRemaining: number }[]; blockers: string[];
}

export interface RsrPermitGuard {
  level: RsrGuardLevel; validUntil: string | null; daysRemaining: number | null; referenceNumber: string | null; message: string;
}

export interface ComplianceSummary {
  rsrPermit: RsrPermitGuard; submit: ComplianceEvaluation; submitWithDangerousGoods: ComplianceEvaluation;
  operate: ComplianceEvaluation; documents: ComplianceDoc[];
}

export interface ReferenceCompleteness {
  corridors: { expected: number; loaded: number; verified: number };
  yards: { expected: number; loaded: number; verified: number };
  fromCatalogFallback: boolean; message: string;
}

export interface SlotOverview {
  generatedAt: string;
  applications: {
    total: number; byStatus: Record<string, number>; byMobilisationState: Record<string, number>;
    needingAttention: SlotApplication[];
  };
  compliance: { rsrPermit: RsrPermitGuard; submit: ComplianceEvaluation; operate: ComplianceEvaluation };
  reference: ReferenceCompleteness;
}

export interface EnvelopeFinding {
  code: string; severity: "VIOLATION" | "WARNING"; subject?: string; message: string; actual?: number | string; limit?: number | string;
}
export interface EnvelopeResult {
  status: EnvelopeStatus; corridorCode: string | null; corridorVerified: boolean;
  violations: EnvelopeFinding[]; warnings: EnvelopeFinding[]; unverified: string[]; subjectsChecked: number; checkedAt: string;
  source: "MANUAL" | "CONSIGNMENT";
  consignment: { id: string; consignmentNumber: string; corridor: string | null; wagons: number } | null;
  corridor: { code: string; name: string; dataStatus: RailDataStatus } | null; corridorQuery: string | null;
}

export interface Readiness {
  ready: boolean; status: SlotApplicationStatus; blockers: string[]; notes: string[];
  selfScreening: { complete: boolean; unanswered: string[]; flagged: string[]; missingRemarks: string[] };
  compliance: ComplianceEvaluation; envelope: EnvelopeResult;
  /** Advisory — reported so the applicant can see the headroom, never a blocker. */
  capacity: CapacityCheck;
}

// ── Reference ────────────────────────────────────────────────────────────────
export const getCorridors = async (): Promise<Corridor[]> => unwrap(await api.get("/rail/slots/corridors"));
export const getReferenceStatus = async (): Promise<ReferenceCompleteness> => unwrap(await api.get("/rail/slots/reference-status"));
export const getSelfScreeningForm = async (): Promise<{ version: string; questions: SelfScreeningQuestion[] }> =>
  unwrap(await api.get("/rail/slots/self-screening"));
export const checkEnvelope = async (dto: {
  corridorCode?: string; consignmentId?: string;
  subjects?: { label?: string; gauge?: RailGauge; axleLoadTonnes?: number; tareTonnes?: number; loadedTonnes?: number; axles?: number }[];
}): Promise<EnvelopeResult> => unwrap(await api.post("/rail/slots/envelope-check", dto));

// ── Overview / compliance ────────────────────────────────────────────────────
export const getSlotOverview = async (): Promise<SlotOverview> => unwrap(await api.get("/rail/slots/overview"));
export const getCompliance = async (): Promise<ComplianceSummary> => unwrap(await api.get("/rail/slots/compliance"));
export const createComplianceDoc = async (dto: {
  docType: RailComplianceDocType; referenceNumber?: string; issuer?: string; validFrom: string; validUntil: string; documentUrl?: string; notes?: string;
}): Promise<ComplianceDoc> => unwrap(await api.post("/rail/slots/compliance/docs", dto));
export const verifyComplianceDoc = async (id: string): Promise<ComplianceDoc> => unwrap(await api.post(`/rail/slots/compliance/docs/${id}/verify`, {}));
export const revokeComplianceDoc = async (id: string, reason: string): Promise<ComplianceDoc> =>
  unwrap(await api.post(`/rail/slots/compliance/docs/${id}/revoke`, { reason }));

// ── Applications ─────────────────────────────────────────────────────────────
export const listSlotApplications = async (): Promise<SlotApplication[]> => {
  const r = unwrap(await api.get("/rail/slots/applications"));
  return Array.isArray(r) ? r : [];
};
export const getSlotApplication = async (id: string): Promise<SlotApplication> => unwrap(await api.get(`/rail/slots/applications/${id}`));
export const getSlotReadiness = async (id: string): Promise<Readiness> => unwrap(await api.get(`/rail/slots/applications/${id}/readiness`));
export const createSlotApplication = async (dto: Partial<SlotApplication> & { corridorCode: string; requestedFrom: string; requestedUntil: string }): Promise<SlotApplication> =>
  unwrap(await api.post("/rail/slots/applications", dto));
export const saveSelfScreening = async (id: string, dto: { accessType?: "Network A" | "Network B"; answers: SelfScreeningAnswer[] }) =>
  unwrap(await api.put(`/rail/slots/applications/${id}/self-screening`, dto));
const post = async (id: string, action: string, body: unknown = {}) => unwrap(await api.post(`/rail/slots/applications/${id}/${action}`, body));
export const submitSlotApplication = (id: string) => post(id, "submit");
export const assessSlotApplication = (id: string) => post(id, "assess");
export const flagSlotConflict = (id: string, note: string) => post(id, "conflict", { note });
export const resolveSlotConflict = (id: string) => post(id, "resolve-conflict");
export const allocateSlotApplication = (id: string, dto: { allocatedAt?: string; validFrom?: string; validUntil?: string; imReference?: string } = {}) => post(id, "allocate", dto);
export const rejectSlotApplication = (id: string, reason: string) => post(id, "reject", { reason });
export const expireSlotApplication = (id: string) => post(id, "expire");
export const markSlotOperated = (id: string, dto: { operatedAt?: string; consignmentId?: string } = {}) => post(id, "operated", dto);
export const linkSlotConsignment = (id: string, consignmentId: string) => post(id, "link-consignment", { consignmentId });

// ── Labels ───────────────────────────────────────────────────────────────────
export const GAUGE_LABEL: Record<RailGauge, string> = { CAPE_1067MM: "1067 mm", NARROW_610MM: "610 mm", STANDARD_1435MM: "1435 mm" };
export const ELECTRIFICATION_LABEL: Record<RailElectrification, string> = { DC_3KV: "3 kV DC", AC_25KV: "25 kV AC", AC_50KV: "50 kV AC", DIESEL: "Diesel" };
export const PROFILE_LABEL: Record<RailVehicleProfile, string> = { A: "A", B: "B", B_PLUS_1: "B+1" };
export const DOC_TYPE_LABEL: Record<RailComplianceDocType, string> = {
  RSR_PERMIT: "RSR Safety Permit", INSURANCE: "Insurance", ROLLING_STOCK_CERT: "Rolling-stock certification",
  TRAIN_CREW_CERT: "Train-crew certification", DANGEROUS_GOODS: "Dangerous-goods authorisation",
  INTERFACE_AGREEMENT: "Interface agreement", ACCESS_CONTRACT: "Access contract (RAA)", SECURITY_DEPOSIT: "Security deposit / guarantee",
};
export const DOC_TYPES = Object.keys(DOC_TYPE_LABEL) as RailComplianceDocType[];
export const SLOT_STATUS_LABEL: Record<SlotApplicationStatus, string> = {
  DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_ASSESSMENT: "Under assessment", CAPACITY_CONFLICT: "Capacity conflict",
  ALLOCATED: "Allocated", REJECTED: "Rejected", EXPIRED: "Expired",
};

// ── Corridor capacity ───────────────────────────────────────────────────────
//
// Slot applications ask for trainsPerWeek and run through to ALLOCATED, but
// nothing computed how much a corridor could carry: the only signal a corridor
// was over-committed was a free-text note written by whoever noticed. This is
// that missing half.
//
// ADVISORY end to end. The infrastructure manager decides what is allocated,
// and applying for more than you expect to be granted is legitimate — so this
// informs and never refuses. Tenant-scoped: it measures THIS operator's own
// commitments, because FlowOps can see no other operator's applications.

export type CapacityStatus = "OK" | "TIGHT" | "OVERSUBSCRIBED" | "UNKNOWN";
export type RailCapacityUnit = "PATHS_PER_DAY" | "TRAINS_PER_WEEK";

export interface CorridorCapacity {
  id: string;
  corridorCode: string;
  validFrom: string;
  validUntil: string;
  theoreticalPathsPerDay: number;
  capacityFactor: number;
  practicalPathsPerDay: number;
  unit: RailCapacityUnit;
  dataStatus: RailDataStatus;
  sourceRef: string | null;
  notes: string | null;
  createdByEmail: string | null;
  createdAt: string;
}

export interface CapacityCheck {
  status: CapacityStatus;
  corridorCode: string;
  from: string;
  until: string;
  /** Null when no capacity statement covers the period. */
  declaredPathsPerDay: number | null;
  theoreticalPathsPerDay?: number;
  capacityFactor?: number;
  dataStatus?: RailDataStatus;
  sourceRef?: string | null;
  /** Granted by the IM. */
  committedPathsPerDay: number;
  /** Asked for but not yet granted. */
  pendingPathsPerDay: number;
  thisApplicationPathsPerDay: number;
  demandPathsPerDay: number;
  headroomPathsPerDay: number | null;
  utilisation: number | null;
  statements: Array<{
    id: string; validFrom: string; validUntil: string;
    practicalPathsPerDay: number; dataStatus: RailDataStatus; binding: boolean;
  }>;
  /** Reported, never deducted: what a possession costs depends on whether it is
   *  a full closure or single-line working, and that is not ours to guess. */
  possessions: Array<{ id: string; title: string; kind: string; startsAt: string; endsAt: string }>;
  contributing: Array<{ applicationNumber: string; status: string; pathsPerDay: number }>;
  reason: string | null;
}

export const getCorridorCapacity = async (corridorCode?: string): Promise<CorridorCapacity[]> => {
  const q = corridorCode ? `?corridorCode=${encodeURIComponent(corridorCode)}` : "";
  const r = unwrap(await api.get(`/rail/slots/capacity${q}`));
  return Array.isArray(r) ? r : [];
};

export const previewCorridorCapacity = async (args: {
  corridorCode: string; from: string; until: string; trainsPerWeek?: number | null;
}): Promise<CapacityCheck> =>
  unwrap(await api.get(
    `/rail/slots/capacity/preview?corridorCode=${encodeURIComponent(args.corridorCode)}` +
    `&from=${encodeURIComponent(args.from)}&until=${encodeURIComponent(args.until)}` +
    (args.trainsPerWeek ? `&trainsPerWeek=${args.trainsPerWeek}` : ""),
  ));

export const upsertCorridorCapacity = async (dto: {
  corridorCode: string; validFrom: string; validUntil: string;
  theoreticalPathsPerDay: number; capacityFactor?: number;
  unit?: RailCapacityUnit; dataStatus?: RailDataStatus; sourceRef?: string; notes?: string;
}): Promise<CorridorCapacity> => unwrap(await api.put("/rail/slots/capacity", dto));

export const deleteCorridorCapacity = async (id: string): Promise<{ deleted: boolean }> =>
  unwrap(await api.delete(`/rail/slots/capacity/${id}`));

export const CAPACITY_STATUS_LABEL: Record<CapacityStatus, string> = {
  OK: "Headroom available",
  TIGHT: "Tight",
  OVERSUBSCRIBED: "Over-subscribed",
  UNKNOWN: "No capacity stated",
};

export const CAPACITY_UNIT_LABEL: Record<RailCapacityUnit, string> = {
  PATHS_PER_DAY: "paths/day",
  TRAINS_PER_WEEK: "trains/week",
};

// ── Schedule optimizer (Phase 2: decision support — proposes, humans apply) ──
export type OptimizerDecision = "ALLOCATE" | "DEFER" | "REJECT";

export interface OptimizerProposal {
  applicationId: string;
  applicationNumber: string;
  corridorCode: string;
  decision: OptimizerDecision;
  score: number;
  weeklyDemand: number | null;
  reasons: string[];
  warnings: string[];
}

export interface CorridorUtilization {
  corridorCode: string;
  capacityPerWeek: number | null;
  allocatedPerWeek: number;
  proposedPerWeek: number;
  deferredPerWeek: number;
  remainingPerWeek: number | null;
}

export interface OptimizerResult {
  proposals: OptimizerProposal[];
  utilization: CorridorUtilization[];
  generatedAt: string;
  notes: string[];
}

export const runOptimizer = async (capacity: { corridorCode: string; trainsPerWeek: number }[]): Promise<OptimizerResult> =>
  unwrap(await api.post("/rail/optimizer/run", { capacity }));

export interface OptimizerApplyItem {
  applicationId: string;
  action: "ALLOCATE" | "REJECT";
  validFrom?: string;
  validUntil?: string;
  imReference?: string;
  reason?: string;
}

export const applyOptimizer = async (decisions: OptimizerApplyItem[]): Promise<{
  applied: number; failed: number;
  results: Array<{ applicationId: string; applicationNumber?: string; ok: boolean; action: string; error?: string }>;
}> => unwrap(await api.post("/rail/optimizer/apply", { decisions }));

export const OPTIMIZER_DECISION_LABEL: Record<OptimizerDecision, string> = {
  ALLOCATE: "Allocate", DEFER: "Defer", REJECT: "Reject",
};
