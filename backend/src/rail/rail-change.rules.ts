import type { RailAttribution, RailCancellationParty, RailChangeStatus } from '@prisma/client';
import { ANNEXURE_20A_TIMINGS, ANNEXURE_21_RULES, ITP_PLANNING_VERSIONS } from './catalog/cancellation-process.catalog';

/**
 * Cancel / reschedule rules — pure, so every boundary can be tested.
 *
 * Evidence:
 *   [ANX-20a]  15-minute notice, 1-hour acknowledgement, the >48 h decision, ITP versions
 *   [ANX-21]   24 h dispute window, closed to dispute after 48 h
 *   [REG R-013.2 / R-013.3]  attribution and commercial consequences (NS §5.2.10.9 = RAA Annexure C).
 *              Annexure C and Network Statement Chapter 5 were NOT supplied; the consequences below
 *              are the register's summary of them and are flagged unverified in the audit ledger.
 *
 * NB the brief called these "Annexure 25 flexing windows". The supplied Annexure 25 is the
 * self-screening form; the windows come from 20a / 21 and NS §5.2.10.9.
 */

export const RAIL_FLEX_WINDOWS = {
  /** Annexures 20a steps 1–4: notice within 15 minutes of the event or its discovery. */
  noticeWithinMinutes: ANNEXURE_20A_TIMINGS.noticeWithinMinutes,
  /** 20a step 6: the IM acknowledges within 1 hour. */
  acknowledgeWithinHours: ANNEXURE_20A_TIMINGS.acknowledgeWithinHours,
  /** 20a decision: received MORE than 48 h before real time ⇒ planning versions; otherwise the emergency dynamic ITP. */
  shortNoticeThresholdHours: ANNEXURE_20A_TIMINGS.shortNoticeThresholdHours,
  /** [REG R-013.3 / NS §5.2.10.9] cancelling inside 72 h of departure carries a commercial consequence. */
  commercialWindowHours: 72,
  itpPlanningVersions: ITP_PLANNING_VERSIONS,
  clearinghouse: {
    disputeWindowHours: ANNEXURE_21_RULES.disputeWindowHours,
    closedToDisputeAfterHours: ANNEXURE_21_RULES.closedToDisputeAfterHours,
  },
} as const;

const HOUR = 3_600_000;
const MIN = 60_000;

/** Annexure 20b → who bears it. "Rail Operations" is the train-operating (TOC) side. */
export function attributionFromParty(party: RailCancellationParty): RailAttribution {
  switch (party) {
    case 'RAIL_OPERATIONS': return 'TOC';
    case 'INFRASTRUCTURE_MANAGER': return 'TRIM';
    case 'FORCE_MAJEURE': return 'FORCE_MAJEURE';
    default: return 'UNDETERMINED';
  }
}

export type NoticeBand = 'SHORT_NOTICE' | 'PLANNING_VERSION' | 'AFTER_DEPARTURE' | 'UNKNOWN';
export type CommercialWindow = 'INSIDE_72H' | 'OUTSIDE_72H' | 'UNKNOWN';

export interface NoticeClassification {
  hoursBeforeDeparture: number | null;
  noticeBand: NoticeBand;
  commercialWindow: CommercialWindow;
  /** Which ITP route Annexure 20a prescribes. */
  itpRoute: 'EMERGENCY_DYNAMIC_ITP' | 'PLANNING_VERSION_ITP' | null;
  /** The planning versions the annexure names. WHICH is "relevant" is not defined in the annexure. */
  itpVersionsNamed: readonly string[];
  note: string;
}

/**
 * Where a request sits against the departure it affects.
 * Boundaries follow the source wording exactly: exactly 48 h is NOT "more than 48 h" (short notice);
 * exactly 72 h is NOT "more than 72 h" (inside the commercial window).
 */
export function classifyNotice(requestedAt: Date, originalDeparture: Date | null | undefined): NoticeClassification {
  if (!originalDeparture || Number.isNaN(originalDeparture.getTime())) {
    return { hoursBeforeDeparture: null, noticeBand: 'UNKNOWN', commercialWindow: 'UNKNOWN', itpRoute: null, itpVersionsNamed: [], note: 'No departure time was given, so the notice window cannot be classified.' };
  }
  const hours = (originalDeparture.getTime() - requestedAt.getTime()) / HOUR;
  const commercialWindow: CommercialWindow = hours <= RAIL_FLEX_WINDOWS.commercialWindowHours ? 'INSIDE_72H' : 'OUTSIDE_72H';
  if (hours <= 0) {
    return { hoursBeforeDeparture: hours, noticeBand: 'AFTER_DEPARTURE', commercialWindow, itpRoute: 'EMERGENCY_DYNAMIC_ITP', itpVersionsNamed: [], note: 'Raised at or after the scheduled departure — the emergency dynamic ITP applies.' };
  }
  if (hours <= RAIL_FLEX_WINDOWS.shortNoticeThresholdHours) {
    return { hoursBeforeDeparture: hours, noticeBand: 'SHORT_NOTICE', commercialWindow, itpRoute: 'EMERGENCY_DYNAMIC_ITP', itpVersionsNamed: [], note: 'Received 48 hours or less before real time — Annexure 20a updates an emergency dynamic version of the ITP.' };
  }
  return {
    hoursBeforeDeparture: hours, noticeBand: 'PLANNING_VERSION', commercialWindow, itpRoute: 'PLANNING_VERSION_ITP', itpVersionsNamed: ITP_PLANNING_VERSIONS,
    note: 'Received more than 48 hours before real time — Annexure 20a updates the relevant ITP planning version (7 day / 72 hour / 48 hour). Which one is "relevant" is not defined in the annexure (unverified).',
  };
}

/** Minutes beyond the 15-minute notice, or null when the event time was not given. */
export function noticeLateMinutes(eventOccurredAt: Date | null | undefined, requestedAt: Date): number | null {
  if (!eventOccurredAt || Number.isNaN(eventOccurredAt.getTime())) return null;
  const elapsed = (requestedAt.getTime() - eventOccurredAt.getTime()) / MIN;
  return Math.max(0, Math.ceil(elapsed - RAIL_FLEX_WINDOWS.noticeWithinMinutes));
}

/** The IM owes an acknowledgement within 1 hour of the request. */
export function acknowledgementState(requestedAt: Date, acknowledgedAt: Date | null | undefined, now: Date): 'ACKNOWLEDGED_IN_TIME' | 'ACKNOWLEDGED_LATE' | 'WAITING' | 'OVERDUE' {
  const limit = requestedAt.getTime() + RAIL_FLEX_WINDOWS.acknowledgeWithinHours * HOUR;
  if (acknowledgedAt) return acknowledgedAt.getTime() <= limit ? 'ACKNOWLEDGED_IN_TIME' : 'ACKNOWLEDGED_LATE';
  return now.getTime() > limit ? 'OVERDUE' : 'WAITING';
}

// ── commercial consequence ───────────────────────────────────────────────────

export type ChangeConsequence =
  | 'FORFEIT_FEES_PAID_IN_ADVANCE'
  | 'CREDIT_IF_REALLOCATED'
  | 'FULL_TRAIN_PATH_FEE_REFUND'
  | 'NONE_FORCE_MAJEURE'
  | 'NONE_PLANNED_OCCUPATION'
  | 'NONE_REPLACEMENT_ACCEPTED'
  | 'PENDING_REPLACEMENT_OUTCOME'
  | 'PENDING_ALLOCATION'
  | 'PENDING_DEPARTURE_TIME';

/**
 * What to CALL a role, as opposed to which role it is.
 *
 * `RailAttribution.TRIM` and `RailChangeInitiator.PRASA_OTHER_IM` name ROLES
 * -- the infrastructure manager, another infrastructure manager -- in
 * Transnet's words. The enum values are persisted in rows, are part of the
 * API contract and appear in DTO validation, so they stay: renaming them
 * would be a migration and a breaking change to buy a cosmetic improvement.
 * What genuinely varies by network is the word an operator is shown, which is
 * what this carries.
 *
 * Every field is optional, so a network can label only what it cares about;
 * anything unlabelled falls back to the Transnet wording rather than to a
 * blank or to a raw enum key.
 */
export interface RoleLabels {
  TRIM?: string;
  TOC?: string;
  FORCE_MAJEURE?: string;
  UNDETERMINED?: string;
  YARD_OPERATOR?: string;
  PORT_TERMINAL_OPERATOR?: string;
  PRASA_OTHER_IM?: string;
}

/** Transnet's words for each role. Also the default for every network. */
export const TRANSNET_ROLE_LABELS: Readonly<Required<RoleLabels>> = {
  TRIM: 'TRIM',
  TOC: 'TOC',
  FORCE_MAJEURE: 'Force Majeure',
  UNDETERMINED: 'Undetermined',
  YARD_OPERATOR: 'yard operator',
  PORT_TERMINAL_OPERATOR: 'port terminal operator',
  PRASA_OTHER_IM: 'PRASA or another infrastructure manager',
};

/** Resolve one role to its display word, falling back to Transnet's. */
const labelFor = (labels: RoleLabels | undefined, role: keyof RoleLabels): string =>
  labels?.[role]?.trim() || TRANSNET_ROLE_LABELS[role];

export interface ConsequenceInput {
  attribution: RailAttribution;
  hoursBeforeDeparture: number | null;
  /** Infrastructure-manager-caused only: did the Access Seeker accept the replacement path? undefined = not yet known. */
  replacementAccepted?: boolean | null;
  /** Infrastructure-manager-caused only: a planned occupation is excluded from the IM-failure remedies [REG R-013.3]. */
  isPlannedOccupation?: boolean;
  /** Display words for the roles. Omit for Transnet's wording. */
  labels?: RoleLabels;
}

export interface ConsequenceResult {
  consequence: ChangeConsequence;
  penaltyApplicable: boolean;
  /** Who bears it. For FULL_TRAIN_PATH_FEE_REFUND that is TRIM (the TOC is refunded). */
  penaltyAgainst: 'TOC' | 'TRIM' | null;
  basis: string;
  evidence: string[];
  caveats: string[];
}

const EVIDENCE = ['REG R-013.3 (NS §5.2.10.9 = RAA Annexure C) — Annexure C / NS Chapter 5 not supplied; unverified'];

export function evaluateConsequence(input: ConsequenceInput): ConsequenceResult {
  const out = (consequence: ChangeConsequence, penaltyApplicable: boolean, penaltyAgainst: 'TOC' | 'TRIM' | null, basis: string, caveats: string[] = []): ConsequenceResult =>
    ({ consequence, penaltyApplicable, penaltyAgainst, basis, evidence: EVIDENCE, caveats });
  const { attribution, hoursBeforeDeparture: h } = input;

  if (attribution === 'UNDETERMINED') {
    return out('PENDING_ALLOCATION', false, null, 'The reason is "could be …" in Annexure 20b, so who bears it is decided at the Clearinghouse. No consequence is assumed until it is allocated.');
  }
  if (attribution === 'FORCE_MAJEURE') {
    return out('NONE_FORCE_MAJEURE', false, null, 'Force Majeure: neither the forfeiture nor the refund remedy applies. Recorded distinctly [REG R-013.1].');
  }
  if (attribution === 'TOC') {
    if (h === null) return out('PENDING_DEPARTURE_TIME', false, null, 'The 72-hour test needs the scheduled departure time.');
    if (h > RAIL_FLEX_WINDOWS.commercialWindowHours) {
      return out('CREDIT_IF_REALLOCATED', false, null, `Cancelled more than ${RAIL_FLEX_WINDOWS.commercialWindowHours} h before departure: a credit applies if the train path is reallocated.`);
    }
    return out('FORFEIT_FEES_PAID_IN_ADVANCE', true, 'TOC',
      `${labelFor(input.labels, 'TOC')}-attributed cancellation ${h <= 0 ? 'at or after departure (deemed cancellation)' : `${Math.round(h * 10) / 10} h before departure`}, i.e. within ${RAIL_FLEX_WINDOWS.commercialWindowHours} h and without Force Majeure: access fees paid in advance are forfeited.`);
  }
  // attribution is the infrastructure manager (Transnet: TRIM)
  const im = labelFor(input.labels, 'TRIM');
  if (input.isPlannedOccupation) return out('NONE_PLANNED_OCCUPATION', false, null, `A planned occupation is excluded from the ${im}-failure remedies.`);
  if (input.replacementAccepted === true) return out('NONE_REPLACEMENT_ACCEPTED', false, null, `${im}-caused, but the replacement train path was accepted — no refund.`);
  if (input.replacementAccepted === false) {
    return out('FULL_TRAIN_PATH_FEE_REFUND', true, 'TRIM', `${im}-caused, and the replacement train path was not accepted: the full Train Path fee is refunded.`, ['Subject to the limitation of liability in the Rail Access Agreement.']);
  }
  return out('PENDING_REPLACEMENT_OUTCOME', false, null, `${im}-caused: a refund applies only if the replacement path is not accepted. The outcome is not yet known.`);
}

// ── status machine ───────────────────────────────────────────────────────────

/** SUBMITTED → ACKNOWLEDGED → (ALTERNATIVE_PROPOSED →) ACCEPTED | CANCELLED_CONFIRMED → CLOSED. */
export const CHANGE_TRANSITIONS: Record<RailChangeStatus, RailChangeStatus[]> = {
  SUBMITTED: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['ALTERNATIVE_PROPOSED', 'CANCELLED_CONFIRMED'],
  ALTERNATIVE_PROPOSED: ['ACCEPTED', 'CANCELLED_CONFIRMED'],
  ACCEPTED: ['CLOSED'],
  CANCELLED_CONFIRMED: ['CLOSED'],
  CLOSED: [],
};
export const canChange = (from: RailChangeStatus, to: RailChangeStatus): boolean => CHANGE_TRANSITIONS[from].includes(to);

/** Handshake `ResponsibleParty` for an attribution. */
export function responsiblePartyFor(attribution: RailAttribution): 'THIS_TOC' | 'IM' | 'FORCE_MAJEURE' | 'UNDETERMINED' {
  return ({ TOC: 'THIS_TOC', TRIM: 'IM', FORCE_MAJEURE: 'FORCE_MAJEURE', UNDETERMINED: 'UNDETERMINED' } as const)[attribution];
}

/**
 * Which parties may be chosen when a "could be …" reason is allocated at the Clearinghouse. Maps the
 * annexure's `possibleParties` (RAIL_OPERATIONS / INFRASTRUCTURE_MANAGER / FORCE_MAJEURE) to attributions.
 */
export function allowedAllocations(possibleParties: readonly string[]): RailAttribution[] {
  const m: Record<string, RailAttribution> = { RAIL_OPERATIONS: 'TOC', INFRASTRUCTURE_MANAGER: 'TRIM', FORCE_MAJEURE: 'FORCE_MAJEURE' };
  return possibleParties.map((p) => m[p]).filter((a): a is RailAttribution => !!a);
}

/** A mismatch between WHO raised the request and who the reason is allocated to — flagged, never blocked. */
export function initiatorMismatch(
  initiatedBy: string,
  attribution: RailAttribution,
  labels?: RoleLabels,
): string | null {
  const im = labelFor(labels, 'TRIM');
  const toc = labelFor(labels, 'TOC');
  if (initiatedBy === 'TRIM' && attribution === 'TOC') return `${im} raised this request, but the chosen reason is allocated to Rail Operations (the ${toc} side) in Annexure 20b.`;
  if (initiatedBy === 'TOC' && attribution === 'TRIM') return `The ${toc} raised this request, but the chosen reason is allocated to the Infrastructure Manager in Annexure 20b — check the reason code.`;
  return null;
}
