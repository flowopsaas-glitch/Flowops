/**
 * Rail intermodal handoff policy.
 *
 * A handoff is the moment physical custody of a consignment passes from one
 * operator to the next (road → rail, rail → port, rail → road). Losing track of
 * that moment is what produces the "where is my cargo" phone calls, and moving
 * cargo before the paperwork exists is what produces unrecoverable revenue.
 *
 * This module is deliberately pure (no Prisma, no Nest) so every rule below can
 * be unit-tested and so the same logic is used by the API, by the readiness
 * report and by the audit trail. The service supplies a `HandoffEvidence`
 * snapshot; this module decides what is ready.
 *
 * Rules encoded here:
 *  1. ORDERING — a leg cannot be handed over before it has started
 *     (actualStart), and cannot complete before a handover was recorded.
 *  2. EVIDENCE — the receiver must be named (handler) and the drop-off location
 *     known before custody moves.
 *  3. BILLING — the consignment must have a saved tariff calculation whose every
 *     line is priced (PRICED). Cash/tariff evidence is stored and verified BEFORE
 *     the handoff, never reconstructed afterwards.
 *  4. APPROVAL — a readiness approval must exist, recorded against the exact
 *     evidence snapshot it was granted for (fingerprint). If the evidence
 *     changes after approval, the approval no longer covers it.
 */

export const INTERMODAL_LEG_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'HANDED_OVER',
  'COMPLETED',
  'DELAYED',
] as const;
export type IntermodalLegStatusName = (typeof INTERMODAL_LEG_STATUSES)[number];

/**
 * Legal leg transitions. Forward-only through the lifecycle, with DELAYED
 * reachable from, and returning to, the working states. COMPLETED is terminal.
 */
export const LEG_TRANSITIONS: Record<IntermodalLegStatusName, readonly IntermodalLegStatusName[]> = {
  PENDING: ['IN_PROGRESS', 'DELAYED'],
  IN_PROGRESS: ['HANDED_OVER', 'COMPLETED', 'DELAYED'],
  HANDED_OVER: ['COMPLETED', 'DELAYED'],
  DELAYED: ['IN_PROGRESS', 'HANDED_OVER', 'COMPLETED'],
  COMPLETED: [],
};

export function isKnownLegStatus(status: string): status is IntermodalLegStatusName {
  return (INTERMODAL_LEG_STATUSES as readonly string[]).includes(status);
}

export function isLegalLegTransition(from: string, to: string): boolean {
  if (!isKnownLegStatus(from) || !isKnownLegStatus(to)) return false;
  if (from === to) return true; // idempotent re-record (e.g. a double scan)
  return LEG_TRANSITIONS[from].includes(to);
}

export function describeLegTransition(from: string, to: string): string {
  if (!isKnownLegStatus(from)) return `Unknown current leg status "${String(from).slice(0, 40)}".`;
  if (!isKnownLegStatus(to)) {
    return `Unknown leg status "${String(to).slice(0, 40)}". Use one of: ${INTERMODAL_LEG_STATUSES.join(', ')}.`;
  }
  const allowed = LEG_TRANSITIONS[from];
  return allowed.length === 0
    ? `Leg is ${from} (terminal) — no further transitions are allowed.`
    : `Illegal leg transition ${from} → ${to}. From ${from} you may move to: ${allowed.join(', ')}.`;
}

/** The evidence snapshot a handoff readiness decision is made against. */
export interface HandoffEvidence {
  legId: string;
  status: string;
  /** When the leg actually started (null = never started). */
  actualStart: Date | string | null;
  /** Who receives custody (carrier/operator on the next leg). */
  handler: string | null;
  /** Where custody is handed over. */
  toLocation: string | null;
  /** The saved tariff calculation for this consignment, if any. */
  tariff: { id: string; status: string; holdTriggered?: boolean | null } | null;
}

export interface HandoffCheck {
  code: 'LEG_STARTED' | 'HANDLER_ASSIGNED' | 'LOCATION_RECORDED' | 'BILLING_EVIDENCE' | 'HOLD_CLEARED';
  label: string;
  ok: boolean;
  detail: string;
}

export interface HandoffReadiness {
  legId: string;
  ready: boolean;
  checks: HandoffCheck[];
  blockers: string[];
  /** Stable fingerprint of the evidence a readiness approval is bound to. */
  fingerprint: string;
}

/**
 * Deterministic fingerprint of the evidence snapshot. Two snapshots that would
 * lead to the same handoff produce the same fingerprint; any material change
 * (handler, location, start time, tariff row) produces a different one — which
 * invalidates a stale approval.
 */
export function handoffFingerprint(evidence: HandoffEvidence): string {
  const started = evidence.actualStart ? new Date(evidence.actualStart).toISOString() : 'not-started';
  return [
    evidence.legId,
    started,
    (evidence.handler ?? '').trim().toLowerCase(),
    (evidence.toLocation ?? '').trim().toLowerCase(),
    evidence.tariff?.id ?? 'no-tariff',
    evidence.tariff?.status ?? 'no-tariff',
  ].join('|');
}

/**
 * Evaluate handoff readiness. Blocker order is the order the operator must fix
 * them in, so the message is a checklist rather than a wall of complaints.
 */
export function evaluateHandoffReadiness(
  evidence: HandoffEvidence,
  options: { requireBillingEvidence?: boolean } = {},
): HandoffReadiness {
  const requireBilling = options.requireBillingEvidence !== false;
  const checks: HandoffCheck[] = [];

  checks.push({
    code: 'LEG_STARTED',
    label: 'Leg has started',
    ok: Boolean(evidence.actualStart),
    detail: evidence.actualStart
      ? `Started ${new Date(evidence.actualStart).toISOString()}`
      : 'The leg has not been started (no actual start time) — record IN_PROGRESS first',
  });

  checks.push({
    code: 'HANDLER_ASSIGNED',
    label: 'Receiving operator named',
    ok: Boolean(evidence.handler && evidence.handler.trim()),
    detail: evidence.handler?.trim()
      ? `Handler: ${evidence.handler}`
      : 'No handler recorded — name the carrier/operator taking custody',
  });

  checks.push({
    code: 'LOCATION_RECORDED',
    label: 'Handover location recorded',
    ok: Boolean(evidence.toLocation && evidence.toLocation.trim()),
    detail: evidence.toLocation?.trim()
      ? `Location: ${evidence.toLocation}`
      : 'No handover location recorded — set toLocation before handing over',
  });

  if (requireBilling) {
    const priced = Boolean(evidence.tariff && evidence.tariff.status === 'PRICED');
    checks.push({
      code: 'BILLING_EVIDENCE',
      label: 'Tariff/billing evidence stored and verified',
      ok: priced,
      detail: priced
        ? `Tariff calculation ${evidence.tariff!.id} is PRICED`
        : evidence.tariff
          ? `Tariff calculation ${evidence.tariff.id} is ${evidence.tariff.status} — every line must be priced before a handoff`
          : 'No saved tariff calculation for this consignment — produce and save one before handing over',
    });
  }

  // A load-adjustment hold is an operational stop, not a paperwork gap: cargo
  // under hold must not change custody.
  checks.push({
    code: 'HOLD_CLEARED',
    label: 'No load-adjustment hold',
    ok: !evidence.tariff?.holdTriggered,
    detail: evidence.tariff?.holdTriggered
      ? 'The tariff calculation is under a load-adjustment hold — clear the hold before handover'
      : 'Clear',
  });

  const blockers = checks.filter((c) => !c.ok).map((c) => `${c.code}: ${c.detail}`);

  return {
    legId: evidence.legId,
    ready: blockers.length === 0,
    checks,
    blockers,
    fingerprint: handoffFingerprint(evidence),
  };
}

/**
 * A readiness approval is only valid for the exact evidence it was granted
 * against. `approvedFingerprint` comes from the audit trail (metadata), so the
 * approval itself is immutable and attributable.
 */
export function isApprovalValid(
  readiness: HandoffReadiness,
  approvedFingerprint: string | null | undefined,
): boolean {
  return Boolean(approvedFingerprint) && approvedFingerprint === readiness.fingerprint;
}
