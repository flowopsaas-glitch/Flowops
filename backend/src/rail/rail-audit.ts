import { Logger } from '@nestjs/common';
import { AuditEntry, AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

/**
 * The slice of the authenticated user the Rail module needs. Controllers pass
 * `@CurrentUser() user: AuthenticatedUser`, which satisfies this.
 */
export type RailActor = Pick<AuthenticatedUser, 'id' | 'email' | 'name' | 'role'>;

/**
 * `AuditLog.action` values written by the Rail module. The names listed in the
 * Wave-1 brief are used verbatim; the remaining transitions follow the same two
 * styles (handshake: snake_case, consignment: dotted) so every mutating method
 * leaves a trace. `AuditLog.targetType` says which record the action is about.
 */
export const RAIL_AUDIT_ACTION = {
  // ── Daily Handshake (Annexure 28) ──────────────────────────────────────────
  REPORT_CREATED: 'report_created',
  REPORT_UPDATED: 'report_updated',
  REPORT_ISSUED: 'report_issued',
  REPORT_SIGNED_OFF: 'report_signed_off',
  DEVIATION_LOGGED: 'deviation_logged',
  DEVIATION_UPDATED: 'deviation_updated',
  DEVIATION_AGREED: 'deviation_agreed',
  DEVIATION_FLAGGED_OPEN: 'deviation_flagged_open',
  DEVIATION_RESOLVED: 'deviation_resolved',
  DEVIATION_REMOVED: 'deviation_removed',
  DEVIATION_ESCALATED: 'deviation_escalated',
  DISPUTE_LODGED_REGULATOR: 'dispute_lodged_regulator',
  ESCALATION_RUN: 'escalation_run',
  // ── Consignment lifecycle ──────────────────────────────────────────────────
  CONSIGNMENT_CREATED: 'consignment.created',
  CONSIGNMENT_UPDATED: 'consignment.updated',
  CONSIGNMENT_STATUS_ADVANCED: 'consignment.status_advanced',
  CONSIGNMENT_CANCELLED: 'consignment.cancelled',
  WAGON_ADDED: 'consignment.wagon_added',
  WAGON_REMOVED: 'consignment.wagon_removed',
  LEG_ADDED: 'consignment.leg_added',
  LEG_ADVANCED: 'consignment.leg_advanced',
  /** A leg transition refused by the leg state machine (audited, never applied). */
  LEG_TRANSITION_REJECTED: 'consignment.leg_transition_rejected',
  /** A handoff readiness approval — one audit row per leg, naming the approver. */
  HANDOFF_READINESS_APPROVED: 'handoff.readiness_approved',
  /** A readiness approval refused because the evidence was incomplete. */
  HANDOFF_READINESS_BLOCKED: 'handoff.readiness_blocked',
  /** A HANDED_OVER transition refused (missing/stale approval or incomplete evidence). */
  HANDOFF_BLOCKED: 'handoff.blocked',
  // ── Slot applications (Wave 2) ─────────────────────────────────────────────
  SLOT_CREATED: 'slot_application.created',
  SLOT_UPDATED: 'slot_application.updated',
  SLOT_SELF_SCREENED: 'slot_application.self_screened',
  SLOT_SUBMITTED: 'slot_application.submitted',
  SLOT_ASSESSMENT_STARTED: 'slot_application.assessment_started',
  SLOT_CAPACITY_CONFLICT: 'slot_application.capacity_conflict',
  SLOT_CONFLICT_RESOLVED: 'slot_application.conflict_resolved',
  SLOT_ALLOCATED: 'slot_application.allocated',
  SLOT_REJECTED: 'slot_application.rejected',
  SLOT_EXPIRED: 'slot_application.expired',
  SLOT_OPERATED: 'slot_application.operated',
  SLOT_CONSIGNMENT_LINKED: 'slot_application.consignment_linked',
  SLOT_FORFEITURE_FLAGGED: 'slot_application.forfeiture_flagged',
  // ── Digital train manifest (the departure document) ────────────────────────
  MANIFEST_CREATED: 'train_manifest.created',
  MANIFEST_UPDATED: 'train_manifest.updated',
  MANIFEST_ISSUED: 'train_manifest.issued',
  MANIFEST_AMENDED: 'train_manifest.amended',
  MANIFEST_DEPARTED: 'train_manifest.departed',
  MANIFEST_ARRIVED: 'train_manifest.arrived',
  MANIFEST_CLOSED: 'train_manifest.closed',
  MANIFEST_CANCELLED: 'train_manifest.cancelled',
  // ── Telemetry (Phase 3) ───────────────────────────────────────────────────
  TELEMETRY_DEVICE_REGISTERED: 'telemetry_device.registered',
  TELEMETRY_DEVICE_UPDATED: 'telemetry_device.updated',
  TELEMETRY_DEVICE_TOKEN_ROTATED: 'telemetry_device.token_rotated',
  TELEMETRY_ALERT_ACKNOWLEDGED: 'telemetry_alert.acknowledged',
  TELEMETRY_ALERT_RESOLVED: 'telemetry_alert.resolved',
  // ── Operator compliance documents (Wave 2) ─────────────────────────────────
  COMPLIANCE_DOC_CREATED: 'compliance_doc.created',
  COMPLIANCE_DOC_VERIFIED: 'compliance_doc.verified',
  COMPLIANCE_DOC_REVOKED: 'compliance_doc.revoked',
  COMPLIANCE_DOC_EXPIRED: 'compliance_doc.expired',
  // ── Cancel / reschedule, possessions, occurrences, dangerous goods (Wave 3) ─
  CHANGE_CREATED: 'change_request.created',
  CHANGE_ACKNOWLEDGED: 'change_request.acknowledged',
  CHANGE_ALTERNATIVE_PROPOSED: 'change_request.alternative_proposed',
  CHANGE_ACCEPTED: 'change_request.accepted',
  CHANGE_CANCELLATION_CONFIRMED: 'change_request.cancellation_confirmed',
  CHANGE_PARTY_ALLOCATED: 'change_request.party_allocated',
  CHANGE_CLOSED: 'change_request.closed',
  POSSESSION_CREATED: 'possession.created',
  POSSESSION_CONFLICT_DETECTED: 'possession.conflict_detected',
  POSSESSION_CANCELLED: 'possession.cancelled',
  POSSESSION_COMPLETED: 'possession.completed',
  POSSESSION_ACTIVATED: 'possession.activated',
  OCCURRENCE_REPORTED: 'occurrence.reported',
  OCCURRENCE_NOTIFIED: 'occurrence.notified',
  OCCURRENCE_INVESTIGATION_STARTED: 'occurrence.investigation_started',
  OCCURRENCE_PRELIMINARY_FILED: 'occurrence.preliminary_report_filed',
  OCCURRENCE_CLOSED: 'occurrence.closed',
  /** A move into DEPARTED / IN_TRANSIT / AT_INTERCHANGE that a dispatch gate (dangerous goods, weighbridge hold) refused. */
  CONSIGNMENT_DISPATCH_BLOCKED: 'consignment.dispatch_blocked',
  // ── Weighbridge, hold and tariffs (Wave 4) ─────────────────────────────────
  WEIGHBRIDGE_READING_RECORDED: 'weighbridge.reading_recorded',
  CONSIGNMENT_HOLD_SET: 'consignment.held_for_load_adjustment',
  CONSIGNMENT_HOLD_CLEARED: 'consignment.hold_cleared',
  TARIFF_CALCULATED: 'tariff_calculation.created',
  TARIFF_INVOICE_DRAFT_CREATED: 'tariff_calculation.invoice_draft_created',
  // ── Terminal truck gate: appointments + the window-change closed loop ──────
  //
  // The appointment layer shipped without any audit trail at all: booking,
  // arriving, cancelling and rescheduling a gate window left no record of who
  // did it. Window changes are now versioned events with named recipients, so
  // every step of the loop is auditable — including the refusals, because a
  // change the governance rules rejected is exactly the kind of thing an
  // operator later needs to prove they tried.
  TRUCK_APPOINTMENT_BOOKED: 'truck_appointment.booked',
  TRUCK_APPOINTMENT_TRANSITIONED: 'truck_appointment.transitioned',
  TRUCK_APPOINTMENT_DAY_REPLANNED: 'truck_appointment.day_replanned',
  TRUCK_SHARE_LINK_ISSUED: 'truck_appointment.share_link_issued',
  TRUCK_SHARE_LINK_REVOKED: 'truck_appointment.share_link_revoked',
  /** A published window change (a new version superseding the previous one). */
  TRUCK_WINDOW_CHANGED: 'truck_window.changed',
  /** A window change refused by the state machine or the cut-off rule. Audited, never applied. */
  TRUCK_WINDOW_CHANGE_REJECTED: 'truck_window.change_rejected',
  /** A previous version moved to SUPERSEDED by a newer change. */
  TRUCK_WINDOW_SUPERSEDED: 'truck_window.superseded',
  /** A recipient confirmed the change. Records the credential that produced it. */
  TRUCK_WINDOW_ACKNOWLEDGED: 'truck_window.acknowledged',
  /** An acknowledgement refused (superseded version, wrong tenant, not a recipient). */
  TRUCK_WINDOW_ACK_REJECTED: 'truck_window.ack_rejected',
  /** The escalation ladder moved on the clock — attributed to the system, not a person. */
  TRUCK_WINDOW_ESCALATED: 'truck_window.escalated',
  TRUCK_GATE_POLICY_UPDATED: 'truck_gate_policy.updated',
} as const;
export type RailAuditAction = (typeof RAIL_AUDIT_ACTION)[keyof typeof RAIL_AUDIT_ACTION];

export const RAIL_AUDIT_TARGET = {
  CONSIGNMENT: 'rail_consignment',
  WAGON: 'rail_wagon',
  LEG: 'rail_intermodal_leg',
  HANDSHAKE_REPORT: 'rail_handshake_report',
  HANDSHAKE_DEVIATION: 'rail_handshake_deviation',
  SLOT_APPLICATION: 'rail_slot_application',
  TRAIN_MANIFEST: 'rail_train_manifest',
  TELEMETRY_DEVICE: 'rail_telemetry_device',
  TELEMETRY_ALERT: 'rail_telemetry_alert',
  COMPLIANCE_DOC: 'rail_compliance_doc',
  CHANGE_REQUEST: 'rail_change_request',
  POSSESSION: 'rail_possession_window',
  OCCURRENCE: 'rail_occurrence_report',
  WEIGHBRIDGE_READING: 'rail_weighbridge_reading',
  TARIFF_CALCULATION: 'rail_tariff_calculation',
  // Audit target TYPES follow the rail_ vocabulary (pinned by rail-audit.spec):
  // they name a subject in the audit log, not a table, so they stay consistent
  // with the other 15 rail targets rather than mirroring the Prisma model names.
  TRUCK_APPOINTMENT: 'rail_truck_appointment',
  TRUCK_WINDOW_CHANGE: 'rail_truck_window_change',
  TRUCK_WINDOW_RECIPIENT: 'rail_truck_window_recipient',
  TRUCK_GATE_POLICY: 'rail_gate_policy',
} as const;

/** Build an audit entry attributed to an authenticated tenant user. */
export function railAuditEntry(
  companyId: string,
  actor: RailActor,
  action: string,
  target: { type: string; id: string; name?: string | null },
  metadata: Record<string, unknown> = {},
): AuditEntry {
  return {
    action,
    actorType: 'tenant',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: target.type,
    targetId: target.id,
    targetName: target.name ?? null,
    // `companyId` lives in metadata because AuditLog has no tenant column; the
    // tenant-scoped diagnostics endpoint filters on it. The built-ins are spread LAST so a caller can
    // never override the tenant, module or actor role (a future `{ ...dto }` must not be able to forge them).
    metadata: { ...metadata, module: 'rail', companyId, actorRole: actor.role },
  };
}

/** Build an audit entry for a change made by the platform itself (cron sweeps, time-based escalation). */
export function railSystemAuditEntry(
  companyId: string,
  action: string,
  target: { type: string; id: string; name?: string | null },
  metadata: Record<string, unknown> = {},
): AuditEntry {
  return {
    action,
    actorType: 'system',
    actorId: null,
    actorEmail: null,
    targetType: target.type,
    targetId: target.id,
    targetName: target.name ?? null,
    metadata: { ...metadata, module: 'rail', companyId },
  };
}

/**
 * Record an audit entry without ever letting a logging problem break the
 * business action (AuditService is already best-effort; this also guards a
 * misbehaving implementation or mock).
 */
export async function recordRailAudit(
  audit: AuditService,
  logger: Logger,
  entry: AuditEntry,
): Promise<string | null> {
  try {
    return (await audit.record(entry)) ?? null;
  } catch (err) {
    logger.warn(`Rail audit write failed for ${entry.action}: ${err}`);
    return null;
  }
}
