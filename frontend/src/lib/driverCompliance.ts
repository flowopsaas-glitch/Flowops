/**
 * Driver compliance — client access and the presentation rules around it.
 *
 * The backend already decides compliance (one pure policy, `driver-compliance.policy.ts`).
 * What this module must not do is *retell* that decision in a way the data does
 * not support:
 *
 *  - **"Dispatchable" is not "compliant".** A driver with no licence date on
 *    file is dispatchable while `DRIVER_REQUIRE_DOCUMENTS` is off, and that is a
 *    completely different statement from having a valid licence. The page says
 *    both things separately.
 *  - **A missing document is not an expired one.** "Not on file" is its own
 *    state; rendering it as an expiry would invent a fact.
 *  - **A warning window is a policy, not a truth.** The threshold comes from the
 *    server (`warningWindowDays`), so the page never hard-codes 14.
 */

import { api } from "../api/client";

export type ComplianceSeverity = "BLOCK" | "WARN";

export interface ComplianceIssue {
  code: string;
  severity: ComplianceSeverity;
  message: string;
  field?: string;
}

export interface ComplianceResult {
  driverId: string;
  companyId: string;
  compliant: boolean;
  dispatchable: boolean;
  blockers: ComplianceIssue[];
  warnings: ComplianceIssue[];
  issues: ComplianceIssue[];
  unverifiedDocuments: string[];
  checkedAt: string;
}

export interface CompliancePolicy {
  requireDocuments: boolean;
  warningWindowDays: number;
  availableStatuses: string[];
}

export interface ComplianceDocuments {
  licenseExpiry: string | null;
  insuranceExpiry: string | null;
  backgroundCheckExpiry: string | null;
}

export interface ComplianceService {
  nextServiceDate: string | null;
  currentKm: number | null;
  nextServiceKm: number | null;
}

/** One row of the fleet report, exactly as the API returns it. */
export interface ComplianceDriverRow {
  driverId: string;
  name: string | null;
  status: string;
  isActive: boolean;
  compliant: boolean;
  dispatchable: boolean;
  blockerCodes: string[];
  /** Human sentences, parallel to `blockerCodes`. */
  blockers: string[];
  warnings: string[];
  unverifiedDocuments: string[];
  documents: ComplianceDocuments;
  service: ComplianceService;
  complianceHold: boolean | null;
}

export interface ComplianceSummary {
  drivers: number;
  dispatchable: number;
  blocked: number;
  withWarnings: number;
  documented: number;
  undocumented: number;
  /** Null when the fleet is empty — 100% of nobody is not a measurement. */
  documentCoveragePercentage: number | null;
}

export interface FleetComplianceReport {
  generatedAt: string;
  policy: CompliancePolicy;
  summary: ComplianceSummary;
  readyToRequireDocuments: boolean;
  drivers: ComplianceDriverRow[];
}

export interface DriverComplianceDetail {
  snapshot: Record<string, unknown> & { driverId: string; name?: string | null };
  compliance: ComplianceResult;
  policy: CompliancePolicy;
}

export interface EvidencePatch {
  licenseExpiry?: string | null;
  insuranceExpiry?: string | null;
  backgroundCheckExpiry?: string | null;
  nextServiceDate?: string | null;
  currentKm?: number | null;
  nextServiceKm?: number | null;
}

export interface EvidenceResult {
  driverId: string;
  changed: string[];
  compliance: ComplianceResult;
}

type Envelope<T> = { data: T; statusCode?: number; message?: string };

function unwrap<T>(body: Envelope<T> | T): T {
  if (body && typeof body === "object" && "data" in (body as Envelope<T>)) {
    return (body as Envelope<T>).data;
  }
  return body as T;
}

export interface FleetQuery {
  status?: string;
  onlyProblems?: boolean;
  take?: number;
}

function clean(query: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    out[key] = value === true ? "true" : (value as string | number);
  }
  return out;
}

export async function fetchFleetCompliance(query: FleetQuery = {}): Promise<FleetComplianceReport> {
  const body = await api.get<Envelope<FleetComplianceReport>, Envelope<FleetComplianceReport>>(
    "/compliance/drivers",
    { params: clean(query as Record<string, unknown>) },
  );
  return unwrap(body);
}

export async function fetchDriverCompliance(driverId: string): Promise<DriverComplianceDetail> {
  const body = await api.get<Envelope<DriverComplianceDetail>, Envelope<DriverComplianceDetail>>(
    `/compliance/drivers/${driverId}`,
  );
  return unwrap(body);
}

export async function recordComplianceEvidence(driverId: string, patch: EvidencePatch): Promise<EvidenceResult> {
  const body = await api.patch<Envelope<EvidenceResult>, Envelope<EvidenceResult>>(
    `/compliance/drivers/${driverId}`,
    patch,
  );
  return unwrap(body);
}

export async function setComplianceHold(
  driverId: string,
  hold: boolean,
  reason?: string | null,
): Promise<EvidenceResult> {
  const body = await api.patch<Envelope<EvidenceResult>, Envelope<EvidenceResult>>(
    `/compliance/drivers/${driverId}/hold`,
    reason ? { hold, reason } : { hold },
  );
  return unwrap(body);
}

// ── Who may do what ─────────────────────────────────────────────────────────

const EVIDENCE_ROLES = ["ADMIN", "COMPANY_ADMIN", "MANAGER", "DISPATCH", "TENANT_ADMIN", "SUPER_ADMIN"];
const HOLD_ROLES = ["ADMIN", "COMPANY_ADMIN", "MANAGER", "TENANT_ADMIN", "SUPER_ADMIN"];

const normaliseRole = (role?: string | null) => String(role ?? "").trim().toUpperCase();

/** Mirrors the controller: recording a document is operational data entry. */
export function canRecordEvidence(role?: string | null): boolean {
  return EVIDENCE_ROLES.includes(normaliseRole(role));
}

/**
 * Mirrors the controller: a hold stops a colleague working, so placing one is
 * supervisory. A dispatcher can record a licence but cannot suspend a driver.
 */
export function canManageHold(role?: string | null): boolean {
  return HOLD_ROLES.includes(normaliseRole(role));
}

// ── Document and service state ──────────────────────────────────────────────

export type DocumentState = "missing" | "expired" | "expiring" | "valid";

export interface DocumentStatus {
  state: DocumentState;
  /** Pre-formatted, unambiguous: "Expires 14 Nov 2026", "Not on file". */
  label: string;
  /** Whole days until expiry; negative once expired. Null when not on file. */
  daysUntilExpiry: number | null;
}

export const DOCUMENT_LABELS: Record<keyof ComplianceDocuments, string> = {
  licenseExpiry: "Driver licence",
  insuranceExpiry: "Insurance",
  backgroundCheckExpiry: "Background check",
};

export const DOCUMENT_KEYS: Array<keyof ComplianceDocuments> = [
  "licenseExpiry",
  "insuranceExpiry",
  "backgroundCheckExpiry",
];

const MS_PER_DAY = 86_400_000;

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Judge one expiry date against the server's warning window.
 *
 * `missing` is deliberately its own state: an absent date is an absent fact, and
 * showing it as "expired" would accuse a driver of something nobody recorded.
 */
export function documentStatus(
  expiry: string | null | undefined,
  warningWindowDays: number,
  now: number = Date.now(),
): DocumentStatus {
  if (!expiry) {
    return { state: "missing", label: "Not on file", daysUntilExpiry: null };
  }
  const date = new Date(expiry);
  if (Number.isNaN(date.getTime())) {
    return { state: "missing", label: "Not on file", daysUntilExpiry: null };
  }
  const daysUntilExpiry = Math.floor((date.getTime() - now) / MS_PER_DAY);
  if (daysUntilExpiry < 0) {
    const overdue = Math.abs(daysUntilExpiry);
    return {
      state: "expired",
      label: `Expired ${formatDate(date)} (${overdue} day${overdue === 1 ? "" : "s"} ago)`,
      daysUntilExpiry,
    };
  }
  if (daysUntilExpiry <= warningWindowDays) {
    return {
      state: "expiring",
      label: daysUntilExpiry === 0 ? `Expires today (${formatDate(date)})` : `Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}`,
      daysUntilExpiry,
    };
  }
  return { state: "valid", label: `Valid to ${formatDate(date)}`, daysUntilExpiry };
}

export type ServiceState = "unknown" | "overdue" | "due" | "ok";

export interface ServiceStatus {
  state: ServiceState;
  label: string;
}

/**
 * Service due-ness, from a date OR an odometer threshold — whichever the record
 * actually carries. A truck can be due by kilometres with months left on the
 * calendar, and saying "OK" because the date is fine would be wrong.
 */
export function serviceStatus(
  service: ComplianceService,
  dueWithinDays = 14,
  now: number = Date.now(),
): ServiceStatus {
  const { nextServiceDate, currentKm, nextServiceKm } = service;

  if (nextServiceKm != null && currentKm != null) {
    const remaining = nextServiceKm - currentKm;
    if (remaining <= 0) {
      return { state: "overdue", label: `Odometer ${currentKm.toLocaleString("en-ZA")} km is past the ${nextServiceKm.toLocaleString("en-ZA")} km service` };
    }
    if (remaining <= 500) {
      return { state: "due", label: `${remaining.toLocaleString("en-ZA")} km to service` };
    }
    return { state: "ok", label: `${remaining.toLocaleString("en-ZA")} km to service` };
  }

  if (nextServiceDate) {
    const date = new Date(nextServiceDate);
    if (!Number.isNaN(date.getTime())) {
      const days = Math.floor((date.getTime() - now) / MS_PER_DAY);
      if (days < 0) return { state: "overdue", label: `Service was due ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago` };
      if (days <= dueWithinDays) return { state: "due", label: days === 0 ? "Service due today" : `Service due in ${days} day${days === 1 ? "" : "s"}` };
      return { state: "ok", label: `Service due ${formatDate(date)}` };
    }
  }

  return { state: "unknown", label: "No service date or odometer on file" };
}

// ── Decision wording ────────────────────────────────────────────────────────

/**
 * Why a driver is allowed — in the terms the policy actually used.
 *
 * "Dispatchable" on its own reads as "compliant", which is not what the platform
 * determined: it means no blocking condition applies, and with documents not yet
 * required that can coexist with three missing certificates.
 */
export function dispatchableReason(
  row: Pick<ComplianceDriverRow, "dispatchable" | "unverifiedDocuments" | "warnings">,
  requireDocuments: boolean,
): string {
  if (!row.dispatchable) return "Blocked — see the reasons";
  if (row.unverifiedDocuments.length > 0 && !requireDocuments) {
    return `Allowed, but ${row.unverifiedDocuments.length} document${row.unverifiedDocuments.length === 1 ? "" : "s"} not on file`;
  }
  if (row.warnings.length > 0) return "Allowed with warnings";
  return "No blocking conditions";
}

/**
 * The policy banner.
 *
 * Whether documents are *required* is a server-side switch
 * (`DRIVER_REQUIRE_DOCUMENTS`) and this page cannot change it, so it says what
 * is true and what turning it on would mean — it does not offer a toggle it
 * cannot honour.
 */
export function policyNote(
  policy: CompliancePolicy,
  summary: Pick<ComplianceSummary, "drivers" | "documented" | "undocumented" | "documentCoveragePercentage">,
  readyToRequireDocuments: boolean,
): string {
  if (policy.requireDocuments) {
    const missing = summary.undocumented;
    return missing === 0
      ? "Documents are required for dispatch, and every driver on this fleet has all three on file."
      : `Documents are required for dispatch. ${missing} of ${summary.drivers} driver${summary.drivers === 1 ? "" : "s"} are missing at least one document and cannot be dispatched until it is recorded.`;
  }
  if (summary.drivers === 0) {
    return "No drivers on this fleet yet.";
  }
  if (readyToRequireDocuments) {
    return "Documents are not yet required for dispatch, but every driver has all three on file — the account is ready to require them.";
  }
  const coverage = summary.documentCoveragePercentage ?? 0;
  return `Documents are not required for dispatch yet. ${summary.documented} of ${summary.drivers} drivers are fully documented (${coverage}%), so turning the requirement on now would block the rest.`;
}
