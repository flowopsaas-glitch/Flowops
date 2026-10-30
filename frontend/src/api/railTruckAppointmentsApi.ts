import { api } from "./client";

export type TruckAppointmentStatus =
  | "BOOKED" | "ARRIVED" | "LOADING" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

export interface TruckAppointment {
  id: string;
  terminalName: string;
  haulierName: string;
  vehicleReg: string;
  /**
   * A FlowOps driver in this tenant, and the only kind that can receive a portal
   * confirmation. Null/absent means the board must report DRIVER NOT ASSIGNED
   * rather than invent a recipient. `driverName` alone is a haulier's own driver
   * typed in as free text: it is a label, not a notification channel.
   */
  driverId?: string | null;
  driverName?: string | null;
  purpose: string;
  windowStart: string;
  windowEnd: string;
  arrivedAt?: string | null;
  loadingAt?: string | null;
  completedAt?: string | null;
  status: TruckAppointmentStatus;
  consignmentId?: string | null;
  note?: string | null;
  shareToken?: string | null;
  /**
   * The state of the counterparty link, without making the terminal decode it:
   * a LEGACY link never expires and can only be killed by revocation, so the
   * operator has to be able to see which of their links are in that state.
   */
  shareLink?: ShareLinkState | null;
  /** Current window version. 1 = as booked; every published change increments it. */
  windowVersion?: number | null;
  /** The ACTIVE window change, when one exists (list surfaces it without an N+1). */
  pendingWindowChange?: { id: string; version: number; unacked: number } | null;
  waitMinutes?: number | null;
  lateMinutes?: number | null;
  conflicts?: { id: string; haulierName: string; vehicleReg: string }[];
}

export type ShareLinkValidity = "ABSENT" | "VALID" | "LEGACY_NO_EXPIRY" | "EXPIRED";

export interface ShareLinkState {
  state: ShareLinkValidity;
  /** True only for a link issued before expiry enforcement. */
  legacy: boolean;
  canAcknowledge: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
  /** Operator-facing warning text, or null when there is nothing to warn about. */
  warning: string | null;
}

export interface TruckAppointmentSummary {
  total: number;
  byStatus: Record<string, number>;
  measuredWaits: number;
  avgWaitMinutes: number | null;
  changeCutoffHours?: number;
}

const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;

export async function listTruckAppointments(params?: Record<string, string>): Promise<TruckAppointment[]> {
  const r = await api.get("/rail/truck-appointments", { params });
  const body = unwrap(r);
  return Array.isArray(body) ? body : [];
}

export async function getTruckAppointmentSummary(): Promise<TruckAppointmentSummary> {
  const r = await api.get("/rail/truck-appointments/summary");
  return unwrap(r);
}

export async function bookTruckAppointment(dto: Record<string, unknown>): Promise<TruckAppointment> {
  const r = await api.post("/rail/truck-appointments", dto);
  return unwrap(r);
}

export async function transitionTruckAppointment(
  id: string,
  action: "arrive" | "start-loading" | "complete" | "no-show" | "cancel" | "reschedule",
  dto?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<TruckAppointment & { forced?: boolean; change?: WindowChange }> {
  const r = await api.post(`/rail/truck-appointments/${id}/${action}`, dto ?? {}, headers(idempotencyKey));
  return unwrap(r);
}

/** `X-Idempotency-Key` is what makes a retried or offline-flushed mutation safe. */
function headers(idempotencyKey?: string) {
  return idempotencyKey ? { headers: { "X-Idempotency-Key": idempotencyKey } } : undefined;
}

/**
 * A driver the terminal can assign to a gate window. Only ACTIVE drivers in the
 * tenant are assignable — the server refuses anything else with 400 — so the
 * picker filters rather than offering a choice that will be refused.
 */
export interface AssignableDriver {
  id: string;
  name: string | null;
  isActive?: boolean | null;
  status?: string | null;
}

/**
 * The tenant's drivers, for assigning one to a truck appointment. Degrades to an
 * empty list rather than throwing: a role that cannot read drivers must still be
 * able to read the gate board, and the caller says why the picker is empty.
 */
export async function listAssignableDrivers(): Promise<AssignableDriver[]> {
  const r = await api.get("/drivers");
  const body = unwrap(r);
  const rows: AssignableDriver[] = Array.isArray(body) ? body : [];
  return rows.filter((d) => d && d.id && d.isActive !== false);
}

/**
 * What assigning a driver did to the window change that was already open.
 *
 * Assignment is two facts: the appointment now records who is driving, and — if
 * a change was already published — that change now has this driver as a named
 * recipient who can confirm it. The server reports which of those happened, so
 * the UI states the outcome instead of assuming that assigning a driver told
 * them something.
 */
export interface DriverAttachment {
  attached: boolean;
  reason: "ATTACHED" | "NO_ACTIVE_CHANGE" | "ALREADY_A_RECIPIENT" | "ALREADY_ACKNOWLEDGED" | "ATTACH_FAILED";
  changeId: string | null;
  version: number | null;
  /** Recipients closed out because they are no longer who the terminal must ask. */
  closedRecipientKeys: string[];
  recipient: {
    deliveryState: TruckWindowDeliveryState;
    deliveryReason: string | null;
    ackState: "UNACKED" | "ACKNOWLEDGED";
    /** When this driver's acknowledgement clock started. */
    toldAt: string;
  } | null;
  /** A sentence from the server, safe to show verbatim. */
  message: string;
}

export async function assignTruckDriver(
  id: string,
  driverId: string,
): Promise<TruckAppointment & { driverAttachment: DriverAttachment }> {
  const r = await api.post(`/rail/truck-appointments/${id}/assign-driver`, { driverId });
  return unwrap(r);
}

export interface SharedTruckAppointment {
  terminalName: string;
  haulierName: string;
  vehicleReg: string;
  purpose: string;
  windowStart: string;
  windowEnd: string;
  windowVersion?: number;
  status: TruckAppointmentStatus;
  arrivedAt?: string | null;
  loadingAt?: string | null;
  completedAt?: string | null;
  waitMinutes?: number | null;
  lateMinutes?: number | null;
  /** The state of the link itself — the page must not offer a confirm it cannot honour. */
  link?: {
    expiresAt: string | null;
    canAcknowledge: boolean;
    /** A link issued before expiry enforcement: readable, but it cannot confirm. */
    noExpiryOnRecord?: boolean;
  };
  /** The window change currently in force, if the operator published one. */
  change?: SharedWindowChange | null;
}

/** What a counterparty is allowed to see about a change: no tenant internals. */
export interface SharedWindowChange {
  id: string;
  version: number;
  changeKind: "RESCHEDULED" | "REPLANNED" | "CANCELLED";
  changedAt: string;
  reason: string | null;
  previousWindowText: string;
  previousWindow: { start: string; end: string };
  newWindowText: string | null;
  newWindow: { start: string; end: string } | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

/** Public, token-gated counterparty view — no login required. */
export async function getSharedTruckAppointment(token: string): Promise<SharedTruckAppointment> {
  const r = await api.get(`/rail/truck-appointments/public/${encodeURIComponent(token)}`);
  return unwrap(r);
}

/**
 * Confirm the current window change from the share link.
 *
 * The token is the credential, so its rules apply: revoked → 404, expired → 409,
 * and a legacy token with no recorded expiry is refused for this mutation (it
 * still reads). `deviceAckedAt` is the time the counterparty tapped confirm;
 * the server stores it separately from the time it observed the request and
 * never measures with it.
 */
export async function ackSharedTruckAppointment(
  token: string,
  opts: { deviceAckedAt?: string; idempotencyKey?: string } = {},
): Promise<{ recipient: WindowRecipient; change: WindowChange; idempotentReplay: boolean }> {
  const r = await api.post(
    `/rail/truck-appointments/public/${encodeURIComponent(token)}/ack`,
    { ...(opts.deviceAckedAt ? { deviceAckedAt: opts.deviceAckedAt } : {}) },
    headers(opts.idempotencyKey),
  );
  return unwrap(r);
}

export async function createTruckShareLink(id: string): Promise<{ token: string; path: string; expiresAt?: string }> {
  const r = await api.post(`/rail/truck-appointments/${id}/share`, {});
  return unwrap(r);
}

export async function revokeTruckShareLink(id: string): Promise<{ revoked: boolean }> {
  const r = await api.delete(`/rail/truck-appointments/${id}/share`);
  return unwrap(r);
}

export interface ReplanDayResult {
  terminalName: string;
  date: string;
  shiftMinutes: number;
  reason: string;
  shifted: number;
  withConflicts: number;
  appointmentIds: string[];
  /** Windows the replan refused to move (already closed, status moved on) — reported, never swallowed. */
  skipped: { appointmentId: string; vehicleReg: string; reason: string }[];
}

export async function replanTruckDay(
  dto: { terminalName: string; date: string; shiftMinutes: number; reason: string },
  idempotencyKey?: string,
): Promise<ReplanDayResult> {
  const r = await api.post("/rail/truck-appointments/replan-day", dto, headers(idempotencyKey));
  return unwrap(r);
}

// ── The window-change closed loop ────────────────────────────────────────────

export type TruckWindowDeliveryState =
  | "QUEUED" | "PUBLISHED" | "SENT" | "DELIVERED" | "FAILED" | "UNAVAILABLE";
export type TruckWindowChannel =
  | "REALTIME" | "PUSH" | "SHARE_LINK" | "DRIVER_PORTAL" | "IN_APP" | "WEBHOOK" | "NONE";
export type TruckWindowEscalation = "NONE" | "REMINDER" | "ESCALATED";

/** One channel's OBSERVED outcome. A reason is present whenever the state is not a success. */
export interface WindowChannelOutcome {
  channel: TruckWindowChannel;
  state: TruckWindowDeliveryState;
  at: string | null;
  reason?: string | null;
  detail?: Record<string, unknown>;
}

export interface WindowRecipient {
  id: string;
  recipientType: "HAULIER" | "DRIVER";
  /** "DRIVER NOT ASSIGNED" when there is nobody to tell — never a fabricated name. */
  recipientLabel: string;
  driverId: string | null;
  delivery: {
    channels: TruckWindowChannel[];
    state: TruckWindowDeliveryState;
    reason: string | null;
    detail: WindowChannelOutcome[];
    dispatchedAt: string | null;
    deliveredAt: string | null;
  };
  ack: {
    state: "UNACKED" | "ACKNOWLEDGED";
    /** Server-observed. This is the only time the KPIs measure with. */
    ackedAt: string | null;
    /** Device-reported (an offline confirmation flushed later). Labelled wherever shown. */
    ackDeviceAt: string | null;
    source: "TENANT_USER" | "DRIVER_PORTAL" | "SHARE_TOKEN" | null;
    byLabel: string | null;
    /** change→ack: the headline measurement, server-observed timestamps only. */
    latencyMinutes: number | null;
    /**
     * told→ack. The same as `latencyMinutes` except for a driver attached to the
     * change after it was published, who could not have confirmed before they
     * were told. Both are carried so neither has to be blended into the other.
     */
    latencyFromToldMinutes: number | null;
  };
  escalation: {
    stage: TruckWindowEscalation;
    ackDueMinutes: number;
    /** How old the change is. A fact about the change, whatever the recipient. */
    minutesSinceChange: number;
    /** When THIS recipient's clock started: the change time, or their attachment time. */
    toldAt: string;
    /** True for a recipient attached after the change was published (a driver assigned later). */
    attachedAfterChange: boolean;
    /** What this recipient has actually had to respond. The deadline runs from here. */
    minutesSinceTold: number;
    minutesUntilDue: number;
    overdue: boolean;
    reminderDue: boolean;
    escalationDue: boolean;
    sinceChange: string;
    sinceTold: string;
  };
}

export interface WindowChange {
  id: string;
  appointmentId: string;
  version: number;
  changeKind: "RESCHEDULED" | "REPLANNED" | "CANCELLED";
  status: "ACTIVE" | "SUPERSEDED";
  previousWindow: { start: string; end: string; text: string };
  newWindow: { start: string; end: string; text: string } | null;
  reason: string | null;
  forced: boolean;
  insideCutoff: boolean;
  cutoffHours: number;
  truckStatusAtChange: TruckAppointmentStatus;
  windowAlreadyClosed: boolean;
  changedAt: string;
  changedBy: { id: string | null; email: string | null; role: string | null } | null;
  supersededAt: string | null;
  appointment: {
    id: string;
    terminalName: string;
    haulierName: string;
    vehicleReg: string;
    driverName: string | null;
    driverId: string | null;
    status: TruckAppointmentStatus;
    windowStart: string;
    windowEnd: string;
    windowVersion: number;
    arrivedAt: string | null;
  };
  recipients: WindowRecipient[];
  idempotentReplay?: boolean;
}

export interface WindowAckBoard {
  terminalName: string | null;
  computedAt: string;
  source: string;
  changes: number;
  counts: {
    acknowledged: number;
    unacknowledged: number;
    stale: number;
    escalated: number;
    reminderDue: number;
    driverNotAssigned: number;
    /**
     * Recipients with no deliverable channel. They are counted HERE and kept out
     * of unacknowledged / stale / escalated: a terminal reading "3 not
     * confirmed" needs those to be three parties it can still reach.
     */
    unreachable: number;
  };
  /** How the counts were built, so the board is auditable from its own payload. */
  method?: string;
  rows: WindowChange[];
}

export interface AckLatencySummary {
  medianMinutes: number | null;
  p90Minutes: number | null;
  n: number;
  minMinutes: number | null;
  maxMinutes: number | null;
  medianText: string;
  p90Text: string;
}

export interface WindowKpis {
  computedAt: string;
  window: { from: string | null; to: string | null };
  changesExamined: number;
  /** Changes where no driver was attached — their own count, never a failure. */
  driverNotAssignedChanges: number;
  /** Recipients attached after their change was published (drivers assigned later). */
  recipientsAttachedAfterChange: number;
  source: string;
  method: string;
  /**
   * Acknowledgement rate per recipient type, with its denominator stated. A
   * recipient with no channel is EXCLUDED from the denominator and reported in
   * `unreachable`, so a missing driver assignment never reads as a driver who
   * failed to confirm.
   */
  ackRate: {
    HAULIER: AckRateSummary;
    DRIVER: AckRateSummary;
    definition: string;
  };
  ackLatency: AckLatencySummary & {
    byRecipientType: { HAULIER: AckLatencySummary; DRIVER: AckLatencySummary };
    /**
     * The same acknowledgements measured from when each recipient became
     * addressable. Identical to the figures above unless a driver was attached
     * after the change; shown beside them, with its own n, never merged into
     * them — one late assignment must not move a number that describes the
     * terminal's process.
     */
    fromTold: AckLatencySummary & { definition: string };
  };
  ackedBeforeArrival: {
    ackedBeforeArrival: number;
    ackedAfterArrival: number;
    neverAcked: number;
    denominator: number;
    excludedNoArrival: number;
    /** No recipient could have been told: excluded, and counted here. */
    excludedUnreachable: number;
    percent: number | null;
    percentText: string;
    definition: string;
    /** Always names the arrival as TERMINAL-RECORDED — it is not a GPS arrival. */
    arrivalSource: string;
  };
  staleUnackedChanges: number;
  unreachableRecipients: number;
}

export interface AckRateSummary {
  acknowledged: number;
  notAcknowledged: number;
  /** Reachable recipients only. */
  denominator: number;
  unreachable: number;
  driverNotAssigned: number;
  percent: number | null;
  /** "UNKNOWN" when the denominator is empty — never "0%". */
  percentText: string;
}

export interface GateAckPolicy {
  terminalName: string;
  ackDueMinutes: number;
  reminderAfterMinutes: number;
  escalateAfterMinutes: number;
  updatedAt?: string;
}

const CHANGES = "/rail/truck-window-changes";

export async function listWindowChanges(params?: Record<string, string>): Promise<WindowChange[]> {
  const r = await api.get(CHANGES, { params });
  const body = unwrap(r);
  return Array.isArray(body) ? body : [];
}

export async function getWindowAckBoard(terminalName?: string): Promise<WindowAckBoard> {
  const r = await api.get(`${CHANGES}/board`, { params: terminalName ? { terminalName } : undefined });
  return unwrap(r);
}

export async function getWindowKpis(params?: Record<string, string>): Promise<WindowKpis> {
  const r = await api.get(`${CHANGES}/kpis`, { params });
  return unwrap(r);
}

export async function getWindowChange(id: string): Promise<WindowChange> {
  const r = await api.get(`${CHANGES}/${encodeURIComponent(id)}`);
  return unwrap(r);
}

export async function getWindowChangeHistory(appointmentId: string): Promise<WindowChange[]> {
  const r = await api.get(`${CHANGES}/appointment/${encodeURIComponent(appointmentId)}`);
  const body = unwrap(r);
  return Array.isArray(body) ? body : [];
}

/** Acknowledge as the signed-in tenant user — the HAULIER-side confirmation. */
export async function ackWindowChange(
  id: string,
  opts: { idempotencyKey?: string } = {},
): Promise<{ recipient: WindowRecipient; change: WindowChange; idempotentReplay: boolean }> {
  const r = await api.post(`${CHANGES}/${encodeURIComponent(id)}/ack`, {}, headers(opts.idempotencyKey));
  return unwrap(r);
}

export async function listGateAckPolicies(): Promise<{
  defaults: GateAckPolicy & { source: "DEFAULT" };
  policies: GateAckPolicy[];
}> {
  const r = await api.get(`${CHANGES}/gate-policies`);
  return unwrap(r);
}

export async function upsertGateAckPolicy(
  terminalName: string,
  dto: { ackDueMinutes: number; reminderAfterMinutes: number; escalateAfterMinutes: number },
): Promise<GateAckPolicy> {
  const r = await api.put(`${CHANGES}/gate-policies`, { terminalName, ...dto });
  return unwrap(r);
}
