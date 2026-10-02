import type {
  AckState, Attribution, ChangeAction, ChangeBody, ChangeConsequence, ChangeInitiator, ChangeKind, ChangeRequest, ChangeStatus, CodeParty, CommercialWindow,
  ConflictScan, NoticeBand, OccurrenceLevel, OccurrenceReport, OccurrenceStatus, OccurrenceType, PossessionConflict, PossessionKind, PossessionStatus, PossessionWindow,
} from "../api/railChangeApi";
import type { Tone } from "./railSlot";

/**
 * Presentation helpers for the Wave 3 screens (cancel / reschedule, possessions, occurrences). Pure, so the wording,
 * colours and "which buttons show" rules are unit-tested.
 *
 * What this file deliberately does NOT do: decide who bears a cancellation, whether a fee is forfeited or refunded,
 * how many hours of notice were given, or whether a consignment clashes with a possession window. All of that is
 * derived on the server (backend rail-change.rules / rail-possession.rules); these helpers only label what it said.
 */

// ── dates ────────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant → the value a <input type="datetime-local"> expects, in the browser's local time. "" for none / invalid. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A <input type="datetime-local"> value (local time) → an ISO instant for the API. undefined for blank / invalid. */
export function localInputToIso(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** "2026-10-04 10:00" in the browser's local time; "—" when missing. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── cancel / reschedule ──────────────────────────────────────────────────────
export const KIND_LABEL: Record<ChangeKind, string> = { CANCEL: "Cancel", RESCHEDULE: "Reschedule", REPLAN: "Re-plan" };

export const INITIATOR_LABEL: Record<ChangeInitiator, string> = {
  TOC: "Train Operating Company (TOC)", YARD_OPERATOR: "Yard operator (on behalf of the IM)", TRIM: "TRIM (Infrastructure Manager)",
  PORT_TERMINAL_OPERATOR: "Port / port terminal operator", PRASA_OTHER_IM: "PRASA / over-border IM / other IM",
};

export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = {
  SUBMITTED: "Submitted", ACKNOWLEDGED: "Acknowledged", ALTERNATIVE_PROPOSED: "Alternative proposed", ACCEPTED: "Replacement accepted",
  CANCELLED_CONFIRMED: "Cancellation confirmed", CLOSED: "Closed",
};
export const changeStatusTone = (s: ChangeStatus): Tone =>
  ({ SUBMITTED: "info", ACKNOWLEDGED: "info", ALTERNATIVE_PROPOSED: "warn", ACCEPTED: "ok", CANCELLED_CONFIRMED: "danger", CLOSED: "muted" } as const)[s];

export const ATTRIBUTION_LABEL: Record<Attribution, string> = {
  TRIM: "TRIM (Infrastructure Manager)", TOC: "TOC (Rail Operations)", FORCE_MAJEURE: "Force Majeure", UNDETERMINED: "To be allocated at the Clearinghouse",
};
export const attributionTone = (a: Attribution): Tone => ({ TRIM: "info", TOC: "warn", FORCE_MAJEURE: "muted", UNDETERMINED: "warn" } as const)[a];

export const NOTICE_BAND_LABEL: Record<NoticeBand, string> = {
  SHORT_NOTICE: "Short notice (48 h or less) — emergency dynamic ITP",
  PLANNING_VERSION: "More than 48 h — planning-version ITP",
  AFTER_DEPARTURE: "After the scheduled departure",
  UNKNOWN: "Departure time not given",
};
export const COMMERCIAL_WINDOW_LABEL: Record<CommercialWindow, string> = {
  INSIDE_72H: "Inside 72 h of departure", OUTSIDE_72H: "More than 72 h before departure", UNKNOWN: "Cannot be determined",
};

export const CONSEQUENCE_LABEL: Record<ChangeConsequence, string> = {
  FORFEIT_FEES_PAID_IN_ADVANCE: "Access fees paid in advance are forfeited",
  CREDIT_IF_REALLOCATED: "Credit applies if the train path is reallocated",
  FULL_TRAIN_PATH_FEE_REFUND: "Full Train Path fee refunded (TRIM-caused)",
  NONE_FORCE_MAJEURE: "No penalty — Force Majeure",
  NONE_PLANNED_OCCUPATION: "No remedy — planned occupation",
  NONE_REPLACEMENT_ACCEPTED: "No refund — replacement path accepted",
  PENDING_REPLACEMENT_OUTCOME: "Pending — depends on whether the replacement path is accepted",
  PENDING_ALLOCATION: "Pending — the responsible party is decided at the Clearinghouse",
  PENDING_DEPARTURE_TIME: "Pending — needs the scheduled departure time",
};
export const consequenceTone = (c: ChangeConsequence): Tone => ({
  FORFEIT_FEES_PAID_IN_ADVANCE: "danger", CREDIT_IF_REALLOCATED: "ok", FULL_TRAIN_PATH_FEE_REFUND: "ok", NONE_FORCE_MAJEURE: "info",
  NONE_PLANNED_OCCUPATION: "muted", NONE_REPLACEMENT_ACCEPTED: "muted", PENDING_REPLACEMENT_OUTCOME: "warn", PENDING_ALLOCATION: "warn", PENDING_DEPARTURE_TIME: "warn",
} as const)[c];

export const ACK_LABEL: Record<AckState, string> = {
  ACKNOWLEDGED_IN_TIME: "Acknowledged in time (within 1 h)", ACKNOWLEDGED_LATE: "Acknowledged late",
  WAITING: "Waiting for the IM (due within 1 h)", OVERDUE: "IM acknowledgement overdue",
};
export const ackTone = (a: AckState): Tone => ({ ACKNOWLEDGED_IN_TIME: "ok", ACKNOWLEDGED_LATE: "warn", WAITING: "info", OVERDUE: "danger" } as const)[a];

/** Annexure 20b allocation → the attribution it would give. Presentation only (the server enforces the allowed set). */
export function allowedAttributions(possibleParties: readonly string[]): Exclude<Attribution, "UNDETERMINED">[] {
  const m: Record<string, Exclude<Attribution, "UNDETERMINED">> = { RAIL_OPERATIONS: "TOC", INFRASTRUCTURE_MANAGER: "TRIM", FORCE_MAJEURE: "FORCE_MAJEURE" };
  return possibleParties.map((p) => m[p]).filter((a): a is Exclude<Attribution, "UNDETERMINED"> => !!a);
}

export const CODE_PARTY_LABEL: Record<CodeParty, string> = {
  RAIL_OPERATIONS: "Rail Operations (TOC side)", INFRASTRUCTURE_MANAGER: "Infrastructure Manager (TRIM)", FORCE_MAJEURE: "Force Majeure",
  ALLOCATION_REQUIRED: "Could be … — allocated at the Clearinghouse",
};

export type ChangeActionKey = ChangeAction | "propose-alternative" | "allocate-party";

/**
 * The buttons a request offers. This mirrors the server's state machine (SUBMITTED → ACKNOWLEDGED →
 * [ALTERNATIVE_PROPOSED →] ACCEPTED | CANCELLED_CONFIRMED → CLOSED); the server enforces it, this only decides what to show.
 * Allocating a "could be …" party decides who pays, so it is offered to signatories only.
 */
export function availableChangeActions(
  req: Pick<ChangeRequest, "status" | "codeResponsibleParty" | "attribution">, opts: { canWrite: boolean; canSign: boolean },
): ChangeActionKey[] {
  const out: ChangeActionKey[] = [];
  if (opts.canWrite) {
    switch (req.status) {
      case "SUBMITTED": out.push("acknowledge"); break;
      case "ACKNOWLEDGED": out.push("propose-alternative", "confirm-cancellation"); break;
      case "ALTERNATIVE_PROPOSED": out.push("accept", "confirm-cancellation"); break;
      case "ACCEPTED": case "CANCELLED_CONFIRMED": out.push("close"); break;
      default: break;
    }
  }
  if (opts.canSign && req.codeResponsibleParty === "ALLOCATION_REQUIRED" && req.status !== "CLOSED") out.push("allocate-party");
  return out;
}

export const CHANGE_ACTION_LABEL: Record<ChangeActionKey, string> = {
  acknowledge: "IM acknowledged", "propose-alternative": "Propose alternative", accept: "Accept replacement",
  "confirm-cancellation": "Confirm cancellation", close: "Close", "allocate-party": "Allocate party",
};

// ── the cancel / reschedule form ─────────────────────────────────────────────

/** Where the modal was opened from. Everything here is pre-filled, never required. */
export interface ChangeContext {
  consignmentId?: string;
  slotApplicationId?: string;
  /** Set when opened from a Daily Handshake report: the request is then also logged there as a deviation (Annexure 20a step 7). */
  handshakeReportId?: string;
  trainSlotRef?: string;
  originalDeparture?: string | null;
  kind?: ChangeKind;
  initiatedBy?: ChangeInitiator;
}

export interface ChangeFormState {
  kind: ChangeKind; initiatedBy: ChangeInitiator; cancellationCode: string; trainSlotRef: string;
  /** datetime-local values (browser local time) */
  originalDeparture: string; proposedDeparture: string; eventOccurredAt: string;
  isPlannedOccupation: boolean; requiresStaging: boolean; note: string;
}

export const initialChangeForm = (ctx: ChangeContext = {}): ChangeFormState => ({
  kind: ctx.kind ?? "CANCEL", initiatedBy: ctx.initiatedBy ?? "TOC", cancellationCode: "", trainSlotRef: ctx.trainSlotRef ?? "",
  originalDeparture: isoToLocalInput(ctx.originalDeparture), proposedDeparture: "", eventOccurredAt: "",
  isPlannedOccupation: false, requiresStaging: false, note: "",
});

/**
 * The request body for BOTH the preview and the create call. It carries what the user chose and what the modal was
 * opened for — never an attribution, penalty or notice band (the server ignores those fields even if sent).
 * A proposed departure is only meaningful for a reschedule / re-plan.
 */
export function buildChangeBody(form: ChangeFormState, ctx: ChangeContext = {}): ChangeBody {
  const original = localInputToIso(form.originalDeparture);
  const proposed = form.kind === "CANCEL" ? undefined : localInputToIso(form.proposedDeparture);
  const event = localInputToIso(form.eventOccurredAt);
  const note = form.note.trim();
  return {
    kind: form.kind, initiatedBy: form.initiatedBy, cancellationCode: form.cancellationCode, trainSlotRef: form.trainSlotRef.trim(),
    ...(ctx.consignmentId ? { consignmentId: ctx.consignmentId } : {}),
    ...(ctx.slotApplicationId ? { slotApplicationId: ctx.slotApplicationId } : {}),
    ...(ctx.handshakeReportId ? { handshakeReportId: ctx.handshakeReportId } : {}),
    ...(original ? { originalDeparture: original } : {}),
    ...(proposed ? { proposedDeparture: proposed } : {}),
    ...(event ? { eventOccurredAt: event } : {}),
    isPlannedOccupation: form.isPlannedOccupation, requiresStaging: form.requiresStaging,
    ...(note ? { note } : {}),
  };
}

/** The server can only preview / create once it knows which reason and which train. */
export const isChangeFormReady = (form: ChangeFormState): boolean => !!form.cancellationCode && form.trainSlotRef.trim().length > 0;

/** Past-tense wording for the confirmation toast after an action succeeded. */
export const CHANGE_ACTION_DONE: Record<ChangeActionKey, string> = {
  acknowledge: "acknowledged by the IM", "propose-alternative": "alternative proposed", accept: "replacement accepted",
  "confirm-cancellation": "cancellation confirmed", close: "closed", "allocate-party": "party allocated",
};

// ── possession windows ───────────────────────────────────────────────────────
export const POSSESSION_KIND_LABEL: Record<PossessionKind, string> = {
  ANNUAL_PLAN: "Annual plan", LOCKED_60_DAY: "Locked (60-day)", AD_HOC_EMERGENCY: "Ad hoc / emergency",
};
export const POSSESSION_STATUS_LABEL: Record<PossessionStatus, string> = { PLANNED: "Planned", ACTIVE: "Active", COMPLETED: "Completed", CANCELLED: "Cancelled" };
export const possessionStatusTone = (s: PossessionStatus): Tone => ({ PLANNED: "info", ACTIVE: "warn", COMPLETED: "muted", CANCELLED: "muted" } as const)[s];

export const severityTone = (s: PossessionConflict["severity"]): Tone => (s === "HARD" ? "danger" : "warn");
export const severityLabel = (s: PossessionConflict["severity"]): string => (s === "HARD" ? "Locked — cannot be moved" : "Annual plan — not yet locked");

export const possessionActions = (w: Pick<PossessionWindow, "status">, canWrite: boolean): ("complete" | "cancel")[] =>
  canWrite && (w.status === "PLANNED" || w.status === "ACTIVE") ? ["complete", "cancel"] : [];

export interface ConflictSummary { total: number; hard: number; planned: number; consignments: number; windows: number; unchecked: number }

/** Counts for the banner. `consignmentId` narrows it to one consignment (the drawer). */
export function summariseConflicts(scan: ConflictScan | null | undefined, consignmentId?: string): ConflictSummary {
  const conflicts = (scan?.conflicts ?? []).filter((c) => !consignmentId || c.consignmentId === consignmentId);
  return {
    total: conflicts.length,
    hard: conflicts.filter((c) => c.severity === "HARD").length,
    planned: conflicts.filter((c) => c.severity === "PLANNED").length,
    consignments: new Set(conflicts.map((c) => c.consignmentId)).size,
    windows: new Set(conflicts.map((c) => c.windowId)).size,
    // "cannot be checked" is only meaningful for the whole scan; one consignment is unchecked if its id is listed
    unchecked: consignmentId
      ? ((scan?.unscheduled ?? []).includes(consignmentId) ? 1 : 0) + ((scan?.unresolved ?? []).includes(consignmentId) ? 1 : 0)
      : new Set([...(scan?.unscheduled ?? []), ...(scan?.unresolved ?? [])]).size,
  };
}

// ── occurrence reports ───────────────────────────────────────────────────────
export const OCCURRENCE_TYPE_LABEL: Record<OccurrenceType, string> = {
  DERAILMENT: "Derailment", COLLISION: "Collision", OHTE_CABLE_THEFT: "OHTE / cable theft", SPAD: "Signal passed at danger (SPAD)",
  HAZMAT_SPILL: "Hazmat spill", OTHER: "Other",
};
export const OCCURRENCE_LEVEL_LABEL: Record<OccurrenceLevel, string> = {
  LEVEL_1_CODE_GREEN: "Level 1 — Code Green (minor)", LEVEL_2_CODE_ORANGE: "Level 2 — Code Orange (major)", LEVEL_3_CODE_RED: "Level 3 — Code Red (disaster)",
};
export const occurrenceLevelTone = (l: OccurrenceLevel): Tone => ({ LEVEL_1_CODE_GREEN: "ok", LEVEL_2_CODE_ORANGE: "warn", LEVEL_3_CODE_RED: "danger" } as const)[l];
export const OCCURRENCE_STATUS_LABEL: Record<OccurrenceStatus, string> = {
  REPORTED: "Reported", UNDER_INVESTIGATION: "Under investigation", PRELIMINARY_REPORT_FILED: "Preliminary report filed", CLOSED: "Closed",
};
export const occurrenceStatusTone = (s: OccurrenceStatus): Tone =>
  ({ REPORTED: "warn", UNDER_INVESTIGATION: "info", PRELIMINARY_REPORT_FILED: "ok", CLOSED: "muted" } as const)[s];

export type OccurrenceActionKey = "notify-tco" | "notify-rsr" | "investigate" | "preliminary" | "close";

/** Mirrors the server rules (notify once per party, investigate only from REPORTED, close only after the preliminary report, signatory-only). */
export function occurrenceActions(
  o: Pick<OccurrenceReport, "status" | "reportedToTcoAt" | "reportedToRsrAt">, opts: { canWrite: boolean; canSign: boolean },
): OccurrenceActionKey[] {
  const out: OccurrenceActionKey[] = [];
  if (opts.canWrite && o.status !== "CLOSED") {
    if (!o.reportedToTcoAt) out.push("notify-tco");
    if (!o.reportedToRsrAt) out.push("notify-rsr");
    if (o.status === "REPORTED") out.push("investigate");
    if (o.status === "REPORTED" || o.status === "UNDER_INVESTIGATION") out.push("preliminary");
  }
  if (opts.canSign && o.status === "PRELIMINARY_REPORT_FILED") out.push("close");
  return out;
}

export const OCCURRENCE_ACTION_LABEL: Record<OccurrenceActionKey, string> = {
  "notify-tco": "Notified TCO", "notify-rsr": "Notified Regulator", investigate: "Start investigation", preliminary: "File preliminary report", close: "Close",
};

/** The 48-hour preliminary-report clock as one line. The deadline and the overdue flag come from the server. */
export function preliminaryClock(o: Pick<OccurrenceReport, "status" | "preliminaryReportDueAt" | "preliminaryReportFiledAt" | "preliminaryReportOverdue">): { tone: Tone; text: string } {
  if (o.preliminaryReportFiledAt) return { tone: "ok", text: `Filed ${formatDateTime(o.preliminaryReportFiledAt)}` };
  if (o.status === "CLOSED") return { tone: "muted", text: "—" };
  if (!o.preliminaryReportDueAt) return { tone: "muted", text: "—" };
  return o.preliminaryReportOverdue
    ? { tone: "danger", text: `OVERDUE — was due ${formatDateTime(o.preliminaryReportDueAt)}` }
    : { tone: "info", text: `Due ${formatDateTime(o.preliminaryReportDueAt)}` };
}
