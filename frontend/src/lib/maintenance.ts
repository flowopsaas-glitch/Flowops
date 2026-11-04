/**
 * Asset maintenance & warranty — client access and presentation rules.
 *
 * The page is only as honest as these functions, because a maintenance screen
 * is read by two people with opposite interests: the operator who wants the
 * fleet to look available, and the contract holder deciding whether to renew.
 * Four rules keep the same page readable by both:
 *
 *   - **Warranty is three-valued.** `UNKNOWN` renders as "warranty not
 *     recorded", never as "out of warranty". A missing term is a gap in the
 *     record, not a commercial position.
 *   - **Availability carries its basis.** A percentage is always shown next to
 *     the window and the fleet size it was computed from. "99.2%" alone is a
 *     claim; "99.2% over 30 days, 6 units" is evidence.
 *   - **No figure is invented.** Null stays null in every formatter — a cost
 *     per hour with no meter movement shows an em dash, not "0.00".
 *   - **Downtime is shown in hours and days**, because "168 hours" means
 *     nothing to a contract holder and "7 days" does.
 */

import { api } from "../api/client";

type Envelope<T> = { data: T; statusCode?: number; message?: string };

function unwrap<T>(body: Envelope<T> | T): T {
  if (body && typeof body === "object" && "data" in (body as Envelope<T>)) {
    return (body as Envelope<T>).data;
  }
  return body as T;
}

function clean(query: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value as string | number | boolean;
  }
  return out;
}

// ── Vocabulary ──────────────────────────────────────────────────────────────

export const ASSET_CLASSES = [
  "REACH_STACKER",
  "RTG",
  "RMG",
  "FORKLIFT",
  "TRACTOR",
  "TRUCK",
  "TRAILER",
  "GENSET",
  "CRANE",
  "PUMP",
  "OTHER",
] as const;

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  REACH_STACKER: "Reach stacker",
  RTG: "RTG",
  RMG: "RMG",
  FORKLIFT: "Forklift",
  TRACTOR: "Tractor",
  TRUCK: "Truck",
  TRAILER: "Trailer",
  GENSET: "Genset",
  CRANE: "Crane",
  PUMP: "Pump",
  OTHER: "Other",
};

export const ASSET_STATUSES = ["IN_SERVICE", "DOWN", "UNDER_REPAIR", "RETIRED"] as const;
export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  IN_SERVICE: "In service",
  DOWN: "Down",
  UNDER_REPAIR: "Under repair",
  RETIRED: "Retired",
};

export const JOB_TYPES = ["BREAKDOWN", "PLANNED", "INSPECTION", "RECALL"] as const;
export const JOB_TYPE_LABELS: Record<MaintenanceJobType, string> = {
  BREAKDOWN: "Breakdown",
  PLANNED: "Planned",
  INSPECTION: "Inspection",
  RECALL: "Recall",
};

export const JOB_STATUSES = ["REPORTED", "IN_PROGRESS", "COMPLETED", "SIGNED_OFF", "CANCELLED"] as const;
export const JOB_STATUS_LABELS: Record<MaintenanceJobStatus, string> = {
  REPORTED: "Reported",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  SIGNED_OFF: "Signed off",
  CANCELLED: "Cancelled",
};

export const COST_KINDS = ["PART", "LABOUR", "OUTSIDE_SERVICE", "TRAVEL", "CONSUMABLE"] as const;
export const COST_KIND_LABELS: Record<CostKind, string> = {
  PART: "Part",
  LABOUR: "Labour",
  OUTSIDE_SERVICE: "Outside service",
  TRAVEL: "Travel",
  CONSUMABLE: "Consumable",
};

export type AssetClass = (typeof ASSET_CLASSES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type AssetMeterType = "HOURS" | "KM";
export type MaintenanceJobType = (typeof JOB_TYPES)[number];
export type MaintenanceJobStatus = (typeof JOB_STATUSES)[number];
export type CostKind = (typeof COST_KINDS)[number];
export type WarrantyPosition = "IN_WARRANTY" | "OUT_OF_WARRANTY" | "UNKNOWN";

// ── Types ───────────────────────────────────────────────────────────────────

export interface MaintenanceAsset {
  id: string;
  assetCode: string;
  name: string | null;
  assetClass: AssetClass;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  custodian: string | null;
  site: string | null;
  meterType: AssetMeterType;
  meterReading: number;
  meterReadAt: string | null;
  status: AssetStatus;
  retiredAt: string | null;
  notes: string | null;
  openJob?: MaintenanceJob | null;
}

export interface MaintenanceJobEvent {
  id: string;
  type: string;
  fromStatus: MaintenanceJobStatus | null;
  toStatus: MaintenanceJobStatus | null;
  actorName: string | null;
  description: string;
  createdAt: string;
}

export interface MaintenanceJob {
  id: string;
  jobNumber: string;
  assetId: string;
  type: MaintenanceJobType;
  status: MaintenanceJobStatus;
  reportedAt: string;
  reportedByName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  signedOffAt: string | null;
  signedOffBy: string | null;
  faultCodeId: string | null;
  faultDescription: string;
  workPerformed: string | null;
  downtimeMinutes: number | null;
  meterAtJob: number | null;
  priorJobId: string | null;
  warrantyTermDays: number | null;
  warrantyExpiresAt: string | null;
  labourHours: number | null;
  providerName: string | null;
  invoiceRef: string | null;
  cancelledReason: string | null;
  currency: string;
  asset?: { id: string; assetCode: string; name: string | null; assetClass?: AssetClass } | null;
  faultCode?: { id: string; code: string; label: string } | null;
  costs?: Array<{ amount: number; kind: CostKind }>;
  priorJob?: { id: string; jobNumber: string; completedAt: string | null } | null;
  events?: MaintenanceJobEvent[];
}

export interface MaintenanceFinding {
  code: string;
  severity: "attention" | "info";
  message: string;
}

export interface MaintenanceMetrics {
  assets: number;
  assetsDown: number;
  jobsOpen: number;
  jobsCompleted: number;
  availabilityPercent: number | null;
  downtimeHours: number;
  comebackSharePercent: number | null;
  warrantyExposure: number;
}

export interface MaintenanceSummary {
  status: "ok" | "attention";
  headline: string;
  findings: MaintenanceFinding[];
  metrics: MaintenanceMetrics;
  assetsByStatus: Record<string, number>;
  windowDays: number;
  windowStart: string;
  windowEnd: string;
}

export interface AssetHistory {
  asset: MaintenanceAsset;
  windowDays: number;
  jobs: MaintenanceJob[];
  availability: { percent: number | null; basisMinutes: number; downtimeMinutes: number; hours: number | null };
  costs: { total: number; byKind: Partial<Record<CostKind, number>>; rows: number };
  faultPattern: Array<{
    faultCodeId: string;
    occurrences: number;
    totalDowntimeMinutes: number;
    downtimeHours: number | null;
    comebacks: number;
    lastReportedAt: string;
    faultCode: { id: string; code: string; label: string } | null;
  }>;
  comebacks: { count: number; sharePercent: number | null };
  meter: {
    type: AssetMeterType;
    reading: number;
    readAt: string | null;
    start: number | null;
    end: number | null;
    advanced: number | null;
    costPerUnit: number | null;
  };
  lastJobWarranty: {
    jobId: string;
    jobNumber: string;
    position: WarrantyPosition;
    expiresAt: string | null;
    termDays: number | null;
  } | null;
  openJob: MaintenanceJob | null;
}

// ── API ─────────────────────────────────────────────────────────────────────

export async function fetchSummary(windowDays = 30): Promise<MaintenanceSummary> {
  const body = await api.get<Envelope<MaintenanceSummary>, Envelope<MaintenanceSummary>>(
    "/maintenance/summary",
    { params: { windowDays } },
  );
  return unwrap(body);
}

export async function fetchAssets(query: {
  q?: string;
  status?: AssetStatus | "";
  assetClass?: AssetClass | "";
} = {}): Promise<MaintenanceAsset[]> {
  const body = await api.get<Envelope<MaintenanceAsset[]>, Envelope<MaintenanceAsset[]>>(
    "/maintenance/assets",
    { params: clean(query as Record<string, unknown>) },
  );
  const rows = unwrap(body);
  return Array.isArray(rows) ? rows : [];
}

export async function fetchAssetHistory(assetId: string, windowDays = 90): Promise<AssetHistory> {
  const body = await api.get<Envelope<AssetHistory>, Envelope<AssetHistory>>(
    `/maintenance/assets/${assetId}/history`,
    { params: { windowDays } },
  );
  return unwrap(body);
}

export async function createAsset(payload: Record<string, unknown>): Promise<MaintenanceAsset> {
  const body = await api.post<Envelope<MaintenanceAsset>, Envelope<MaintenanceAsset>>(
    "/maintenance/assets",
    payload,
  );
  return unwrap(body);
}

export async function fetchJobs(query: {
  assetId?: string;
  status?: MaintenanceJobStatus | "";
  comebacksOnly?: boolean;
} = {}): Promise<MaintenanceJob[]> {
  // Send the filter only when it is on. Sending `comebacksOnly=false` invites
  // the classic query-string coercion bug on the way in; sending nothing is
  // unambiguous.
  const params: Record<string, string> = {};
  if (query.assetId) params.assetId = query.assetId;
  if (query.status) params.status = query.status;
  if (query.comebacksOnly) params.comebacksOnly = "true";
  const body = await api.get<Envelope<MaintenanceJob[]>, Envelope<MaintenanceJob[]>>("/maintenance/jobs", {
    params,
  });
  const rows = unwrap(body);
  return Array.isArray(rows) ? rows : [];
}

export async function fetchJob(id: string): Promise<MaintenanceJob> {
  const body = await api.get<Envelope<MaintenanceJob>, Envelope<MaintenanceJob>>(`/maintenance/jobs/${id}`);
  return unwrap(body);
}

export async function createJob(payload: Record<string, unknown>): Promise<MaintenanceJob> {
  const body = await api.post<Envelope<MaintenanceJob>, Envelope<MaintenanceJob>>(
    "/maintenance/jobs",
    payload,
  );
  return unwrap(body);
}

export async function startJob(id: string): Promise<MaintenanceJob> {
  const body = await api.post<Envelope<MaintenanceJob>, Envelope<MaintenanceJob>>(
    `/maintenance/jobs/${id}/start`,
    {},
  );
  return unwrap(body);
}

export async function signOffJob(id: string, signedOffBy: string): Promise<MaintenanceJob> {
  const body = await api.post<Envelope<MaintenanceJob>, Envelope<MaintenanceJob>>(
    `/maintenance/jobs/${id}/sign-off`,
    { signedOffBy },
  );
  return unwrap(body);
}

export async function completeJob(id: string, payload: Record<string, unknown>): Promise<MaintenanceJob> {
  const body = await api.post<Envelope<MaintenanceJob>, Envelope<MaintenanceJob>>(
    `/maintenance/jobs/${id}/complete`,
    payload,
  );
  return unwrap(body);
}

export async function cancelJob(id: string, reason: string): Promise<MaintenanceJob> {
  const body = await api.post<Envelope<MaintenanceJob>, Envelope<MaintenanceJob>>(
    `/maintenance/jobs/${id}/cancel`,
    { reason },
  );
  return unwrap(body);
}

export async function addJobCost(id: string, payload: Record<string, unknown>) {
  const body = await api.post<
    Envelope<{ amount: number }>,
    Envelope<{ amount: number }>
  >(`/maintenance/jobs/${id}/costs`, payload);
  return unwrap(body);
}

// ── Presentation ────────────────────────────────────────────────────────────

/** Money with thin spaces, matching the rest of the app. Null is an em dash. */
export function formatMoney(amount: number | null | undefined, currency = "ZAR"): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, cents] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${currency} ${amount < 0 ? "-" : ""}${grouped}.${cents}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "2-digit" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Minutes as a human duration.
 *
 * Days appear above 48 hours on purpose: "7 days" is the sentence that makes a
 * contract holder act, and "168 hours" is the one they skip over.
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  const days = hours / 24;
  return `${Math.round(days * 10) / 10} days`;
}

/** A percentage that never rounds 99.95 up to "100.0" — that would be a lie. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const bounded = Math.min(100, Math.max(0, value));
  const rounded = Math.round(bounded * 10) / 10;
  return `${rounded >= 100 ? "99.9+" : rounded.toFixed(1)}%`;
}

/**
 * What the warranty position means in words.
 *
 * The middle case is the reason this function exists: "not recorded" is a
 * different sentence from "expired", and only one of them is true when nobody
 * wrote the term down.
 */
export function warrantyText(position: WarrantyPosition | null | undefined, expiresAt?: string | null): string {
  switch (position) {
    case "IN_WARRANTY":
      return expiresAt ? `In warranty to ${formatDate(expiresAt)}` : "In warranty";
    case "OUT_OF_WARRANTY":
      return "Out of warranty";
    case "UNKNOWN":
      return "Warranty not recorded";
    default:
      return "—";
  }
}

export function warrantyTone(position: WarrantyPosition | null | undefined): "success" | "neutral" | "warning" {
  if (position === "IN_WARRANTY") return "success";
  if (position === "OUT_OF_WARRANTY") return "neutral";
  return "warning";
}

/** Derived on the client for display only; the server owns the stored value. */
export function warrantyPositionOf(job: MaintenanceJob, at: Date = new Date()): WarrantyPosition {
  if (job.status === "CANCELLED" || !job.completedAt) return "UNKNOWN";
  if (!job.warrantyExpiresAt) return "UNKNOWN";
  const expiry = new Date(job.warrantyExpiresAt);
  if (Number.isNaN(expiry.getTime())) return "UNKNOWN";
  return at.getTime() <= expiry.getTime() ? "IN_WARRANTY" : "OUT_OF_WARRANTY";
}

export function jobStatusTone(
  status: MaintenanceJobStatus,
): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "REPORTED":
      return "warning";
    case "IN_PROGRESS":
      return "info";
    case "COMPLETED":
      return "success";
    case "SIGNED_OFF":
      return "neutral";
    case "CANCELLED":
      return "danger";
    default:
      return "neutral";
  }
}

export function assetStatusTone(status: AssetStatus): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "IN_SERVICE":
      return "success";
    case "UNDER_REPAIR":
      return "warning";
    case "DOWN":
      return "danger";
    case "RETIRED":
      return "neutral";
    default:
      return "neutral";
  }
}

/** Meter units, spelled for a human: "1 240 h" or "18 402 km". */
export function formatMeter(value: number | null | undefined, type: AssetMeterType): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const whole = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return type === "HOURS" ? `${whole} h` : `${whole} km`;
}

/**
 * Whether a card can still be worked on.
 *
 * Used to decide which actions the row offers, so the UI does not present a
 * button the API will refuse. The server remains the authority; this is the
 * same state machine, mirrored for presentation.
 */
export function allowedJobActions(status: MaintenanceJobStatus): {
  start: boolean;
  complete: boolean;
  signOff: boolean;
  cancel: boolean;
  addCost: boolean;
} {
  return {
    start: status === "REPORTED",
    complete: status === "REPORTED" || status === "IN_PROGRESS",
    signOff: status === "COMPLETED",
    cancel: status !== "SIGNED_OFF" && status !== "CANCELLED",
    addCost: status !== "CANCELLED",
  };
}

/** Sum of the cost lines on a card, for list rendering. */
export function jobCostTotal(job: Pick<MaintenanceJob, "costs">): number {
  if (!job.costs?.length) return 0;
  return Math.round(job.costs.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0) * 100) / 100;
}

/**
 * The sentence at the top of the fleet page.
 *
 * Deliberately one sentence: an operator who has to interpret four tiles before
 * knowing whether the fleet is working will not read them. The tiles are the
 * supporting detail, not the answer.
 */
export function fleetHeadline(summary: MaintenanceSummary | null): string {
  if (!summary) return "Loading the fleet position…";
  if (summary.metrics.assets === 0) {
    return "No units on the register yet — add the first one to start recording work against it.";
  }
  return summary.headline;
}
