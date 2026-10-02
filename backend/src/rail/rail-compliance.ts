import type { RailComplianceDocStatus, RailComplianceDocType } from '@prisma/client';
import { COMPLIANCE_EXPIRY_CRITICAL_DAYS, COMPLIANCE_EXPIRY_WARNING_DAYS } from './rail-reference';

/**
 * Operator compliance gate — which controlled documents must be valid before a step may happen.
 *
 * REQUIRED SETS are a FlowOps proposal derived from the register (R-006.1 access prerequisites,
 * R-010.1 conditions precedent, R-005.4 dangerous-goods evidence); the brief names the eight
 * document types but not which are needed when. Owner to confirm — change them here.
 *   SUBMIT  — to submit a slot application: RSR permit, insurance, rolling-stock and crew
 *             certification (+ dangerous-goods authorisation when the cargo is dangerous goods).
 *   OPERATE — to record first operation of an allocated slot: all of SUBMIT plus the interface
 *             agreement, the access contract and the security deposit.
 *
 * Dates are whole UTC days and inclusive at both ends: a document "valid until 2026-10-02" is
 * valid for all of 2 October.
 */

export type ComplianceStage = 'SUBMIT' | 'OPERATE';

export const REQUIRED_DOCS_SUBMIT: RailComplianceDocType[] = ['RSR_PERMIT', 'INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT'];
export const REQUIRED_DOCS_OPERATE: RailComplianceDocType[] = [
  ...REQUIRED_DOCS_SUBMIT, 'INTERFACE_AGREEMENT', 'ACCESS_CONTRACT', 'SECURITY_DEPOSIT',
];

export function requiredDocs(stage: ComplianceStage, opts: { carriesDangerousGoods?: boolean } = {}): RailComplianceDocType[] {
  const base = stage === 'SUBMIT' ? REQUIRED_DOCS_SUBMIT : REQUIRED_DOCS_OPERATE;
  return opts.carriesDangerousGoods ? [...base, 'DANGEROUS_GOODS'] : [...base];
}

export interface ComplianceDocLike {
  id?: string;
  docType: RailComplianceDocType;
  status: RailComplianceDocStatus;
  validFrom: Date | string;
  validUntil: Date | string;
  referenceNumber?: string | null;
}

export type EffectiveDocStatus = 'VALID' | 'EXPIRED' | 'REVOKED' | 'PENDING_REVIEW' | 'NOT_YET_VALID';

const DAY = 86_400_000;
export const startOfUtcDay = (d: Date | string): number => {
  const t = new Date(d);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
};

/** The status that matters for enforcement — the stored status is only ever a record of a human decision. */
export function effectiveDocStatus(doc: ComplianceDocLike, asOf: Date = new Date()): EffectiveDocStatus {
  if (doc.status === 'REVOKED') return 'REVOKED';
  const today = startOfUtcDay(asOf);
  if (today > startOfUtcDay(doc.validUntil)) return 'EXPIRED'; // expiry wins over a stale VALID flag
  if (today < startOfUtcDay(doc.validFrom)) return 'NOT_YET_VALID';
  if (doc.status === 'PENDING_REVIEW') return 'PENDING_REVIEW';
  return 'VALID';
}

/** Whole days from today to the last valid day (0 = expires today, negative = already expired). */
export function daysUntilExpiry(doc: ComplianceDocLike, asOf: Date = new Date()): number {
  return Math.round((startOfUtcDay(doc.validUntil) - startOfUtcDay(asOf)) / DAY);
}

export interface ComplianceEvaluation {
  stage: ComplianceStage;
  /** True only when every required document is satisfied. Hard-block when false. */
  ok: boolean;
  required: RailComplianceDocType[];
  satisfied: RailComplianceDocType[];
  missing: RailComplianceDocType[];
  expired: RailComplianceDocType[];
  revoked: RailComplianceDocType[];
  pendingReview: RailComplianceDocType[];
  notYetValid: RailComplianceDocType[];
  expiringSoon: { docType: RailComplianceDocType; validUntil: string; daysRemaining: number }[];
  /** One human-readable line per reason the gate is closed. */
  blockers: string[];
}

export function evaluateCompliance(
  docs: readonly ComplianceDocLike[],
  stage: ComplianceStage,
  opts: { carriesDangerousGoods?: boolean } = {},
  asOf: Date = new Date(),
): ComplianceEvaluation {
  const required = requiredDocs(stage, opts);
  const out: ComplianceEvaluation = {
    stage, ok: false, required, satisfied: [], missing: [], expired: [], revoked: [], pendingReview: [], notYetValid: [],
    expiringSoon: [], blockers: [],
  };
  for (const type of required) {
    const ofType = docs.filter((d) => d.docType === type);
    const withStatus = ofType.map((d) => ({ d, s: effectiveDocStatus(d, asOf) }));
    const valid = withStatus.filter((x) => x.s === 'VALID');
    if (valid.length) {
      out.satisfied.push(type);
      // the soonest-expiring valid doc is the one that matters for a warning, unless a later one covers it
      const latest = valid.reduce((a, b) => (startOfUtcDay(b.d.validUntil) > startOfUtcDay(a.d.validUntil) ? b : a)).d;
      const days = daysUntilExpiry(latest, asOf);
      if (days <= COMPLIANCE_EXPIRY_WARNING_DAYS) out.expiringSoon.push({ docType: type, validUntil: new Date(latest.validUntil).toISOString(), daysRemaining: days });
      continue;
    }
    const has = (s: EffectiveDocStatus) => withStatus.some((x) => x.s === s);
    if (has('PENDING_REVIEW')) { out.pendingReview.push(type); out.blockers.push(`${type}: entered but not yet verified by an authorised representative.`); }
    else if (has('NOT_YET_VALID')) { out.notYetValid.push(type); out.blockers.push(`${type}: not yet valid (starts after today).`); }
    else if (has('EXPIRED')) {
      out.expired.push(type);
      const latest = withStatus.filter((x) => x.s === 'EXPIRED').reduce((a, b) => (startOfUtcDay(b.d.validUntil) > startOfUtcDay(a.d.validUntil) ? b : a)).d;
      out.blockers.push(`${type}: EXPIRED on ${new Date(latest.validUntil).toISOString().slice(0, 10)}.`);
    } else if (has('REVOKED')) { out.revoked.push(type); out.blockers.push(`${type}: revoked.`); }
    else { out.missing.push(type); out.blockers.push(`${type}: no document on file.`); }
  }
  out.ok = out.blockers.length === 0;
  return out;
}

export type RsrGuardLevel = 'OK' | 'WARNING' | 'CRITICAL' | 'EXPIRED' | 'PENDING_REVIEW' | 'MISSING';

export interface RsrPermitGuard {
  level: RsrGuardLevel;
  validUntil: string | null;
  daysRemaining: number | null;
  referenceNumber: string | null;
  message: string;
}

/** The RSR-permit expiry guard shown on the compliance tab. */
export function rsrPermitGuard(docs: readonly ComplianceDocLike[], asOf: Date = new Date()): RsrPermitGuard {
  const permits = docs.filter((d) => d.docType === 'RSR_PERMIT');
  if (permits.length === 0) return { level: 'MISSING', validUntil: null, daysRemaining: null, referenceNumber: null, message: 'No RSR Safety Permit is on file. Slot applications cannot be submitted.' };
  const ranked = permits
    .map((d) => ({ d, s: effectiveDocStatus(d, asOf) }))
    .sort((a, b) => startOfUtcDay(b.d.validUntil) - startOfUtcDay(a.d.validUntil));
  const valid = ranked.find((x) => x.s === 'VALID');
  if (valid) {
    const days = daysUntilExpiry(valid.d, asOf);
    const level: RsrGuardLevel = days <= COMPLIANCE_EXPIRY_CRITICAL_DAYS ? 'CRITICAL' : days <= COMPLIANCE_EXPIRY_WARNING_DAYS ? 'WARNING' : 'OK';
    return {
      level, validUntil: new Date(valid.d.validUntil).toISOString(), daysRemaining: days, referenceNumber: valid.d.referenceNumber ?? null,
      message: level === 'OK' ? `RSR Safety Permit valid for ${days} more day(s).` : `RSR Safety Permit expires in ${days} day(s). Renew before it lapses — an expired permit blocks submissions.`,
    };
  }
  const pending = ranked.find((x) => x.s === 'PENDING_REVIEW');
  if (pending) return { level: 'PENDING_REVIEW', validUntil: new Date(pending.d.validUntil).toISOString(), daysRemaining: daysUntilExpiry(pending.d, asOf), referenceNumber: pending.d.referenceNumber ?? null, message: 'An RSR Safety Permit is on file but has not been verified by an authorised representative.' };
  const top = ranked[0];
  return { level: 'EXPIRED', validUntil: new Date(top.d.validUntil).toISOString(), daysRemaining: daysUntilExpiry(top.d, asOf), referenceNumber: top.d.referenceNumber ?? null, message: `The RSR Safety Permit ${top.s === 'REVOKED' ? 'was revoked' : `expired on ${new Date(top.d.validUntil).toISOString().slice(0, 10)}`}. Slot applications are blocked until a valid permit is on file.` };
}
