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
} as const;
export type RailAuditAction = (typeof RAIL_AUDIT_ACTION)[keyof typeof RAIL_AUDIT_ACTION];

export const RAIL_AUDIT_TARGET = {
  CONSIGNMENT: 'rail_consignment',
  WAGON: 'rail_wagon',
  LEG: 'rail_intermodal_leg',
  HANDSHAKE_REPORT: 'rail_handshake_report',
  HANDSHAKE_DEVIATION: 'rail_handshake_deviation',
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
    // tenant-scoped diagnostics endpoint filters on it.
    metadata: { module: 'rail', companyId, actorRole: actor.role, ...metadata },
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
    metadata: { module: 'rail', companyId, ...metadata },
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
): Promise<void> {
  try {
    await audit.record(entry);
  } catch (err) {
    logger.warn(`Rail audit write failed for ${entry.action}: ${err}`);
  }
}
