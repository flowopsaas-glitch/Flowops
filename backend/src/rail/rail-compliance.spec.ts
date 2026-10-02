import {
  ComplianceDocLike, REQUIRED_DOCS_OPERATE, REQUIRED_DOCS_SUBMIT, daysUntilExpiry, effectiveDocStatus, evaluateCompliance,
  requiredDocs, rsrPermitGuard,
} from './rail-compliance';
import { RailComplianceDocType } from '@prisma/client';

const TODAY = new Date('2026-10-02T15:30:00.000Z');
const day = (offset: number) => new Date(Date.UTC(2026, 9, 2 + offset)); // 2026-10-02 + offset days (UTC midnight)

const doc = (docType: RailComplianceDocType, over: Partial<ComplianceDocLike> = {}): ComplianceDocLike => ({
  docType, status: 'VALID', validFrom: day(-100), validUntil: day(200), ...over,
});
const allValid = (types: RailComplianceDocType[]) => types.map((t) => doc(t));

describe('effectiveDocStatus — dates are whole UTC days, inclusive at both ends', () => {
  it('valid on its last day (even late in the day), expired the day after', () => {
    expect(effectiveDocStatus(doc('RSR_PERMIT', { validUntil: day(0) }), TODAY)).toBe('VALID');
    expect(effectiveDocStatus(doc('RSR_PERMIT', { validUntil: day(-1) }), TODAY)).toBe('EXPIRED');
  });
  it('valid on its first day, not valid the day before', () => {
    expect(effectiveDocStatus(doc('RSR_PERMIT', { validFrom: day(0) }), TODAY)).toBe('VALID');
    expect(effectiveDocStatus(doc('RSR_PERMIT', { validFrom: day(1) }), TODAY)).toBe('NOT_YET_VALID');
  });
  it('expiry wins over a stale stored VALID flag — the stored status is never trusted past its dates', () => {
    expect(effectiveDocStatus(doc('INSURANCE', { status: 'VALID', validUntil: day(-30) }), TODAY)).toBe('EXPIRED');
  });
  it('REVOKED always wins', () => {
    expect(effectiveDocStatus(doc('INSURANCE', { status: 'REVOKED' }), TODAY)).toBe('REVOKED');
    expect(effectiveDocStatus(doc('INSURANCE', { status: 'REVOKED', validUntil: day(-5) }), TODAY)).toBe('REVOKED');
  });
  it('PENDING_REVIEW inside its dates is not valid; once past them it is EXPIRED', () => {
    expect(effectiveDocStatus(doc('INSURANCE', { status: 'PENDING_REVIEW' }), TODAY)).toBe('PENDING_REVIEW');
    expect(effectiveDocStatus(doc('INSURANCE', { status: 'PENDING_REVIEW', validUntil: day(-1) }), TODAY)).toBe('EXPIRED');
  });
  it('accepts ISO strings as well as Dates', () => {
    expect(effectiveDocStatus(doc('INSURANCE', { validFrom: '2026-01-01', validUntil: '2026-12-31T00:00:00Z' }), TODAY)).toBe('VALID');
  });
});

describe('daysUntilExpiry', () => {
  it.each([[0, 0], [1, 1], [30, 30], [-1, -1], [-10, -10]])('expiring %i days out → %i', (offset, expected) => {
    expect(daysUntilExpiry(doc('RSR_PERMIT', { validUntil: day(offset) }), TODAY)).toBe(expected);
  });
});

describe('required document sets', () => {
  it('SUBMIT needs RSR permit, insurance, rolling-stock and crew certification', () => {
    expect(REQUIRED_DOCS_SUBMIT).toEqual(['RSR_PERMIT', 'INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT']);
  });
  it('OPERATE adds the interface agreement, access contract and security deposit', () => {
    expect(REQUIRED_DOCS_OPERATE).toEqual([...REQUIRED_DOCS_SUBMIT, 'INTERFACE_AGREEMENT', 'ACCESS_CONTRACT', 'SECURITY_DEPOSIT']);
  });
  it('dangerous goods add the DG authorisation to either stage', () => {
    expect(requiredDocs('SUBMIT', { carriesDangerousGoods: true })).toContain('DANGEROUS_GOODS');
    expect(requiredDocs('OPERATE', { carriesDangerousGoods: true })).toContain('DANGEROUS_GOODS');
    expect(requiredDocs('SUBMIT')).not.toContain('DANGEROUS_GOODS');
  });
  it('returns a copy — callers cannot mutate the shared set', () => {
    requiredDocs('SUBMIT').push('SECURITY_DEPOSIT');
    expect(REQUIRED_DOCS_SUBMIT).toHaveLength(4);
  });
});

describe('evaluateCompliance — the hard gate', () => {
  it('opens only when every required document is valid', () => {
    const r = evaluateCompliance(allValid(REQUIRED_DOCS_SUBMIT), 'SUBMIT', {}, TODAY);
    expect(r).toMatchObject({ ok: true, blockers: [], missing: [], expired: [] });
    expect(r.satisfied).toEqual(REQUIRED_DOCS_SUBMIT);
  });
  it('is closed with nothing on file, naming every missing document', () => {
    const r = evaluateCompliance([], 'SUBMIT', {}, TODAY);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(REQUIRED_DOCS_SUBMIT);
    expect(r.blockers).toHaveLength(4);
  });
  it('an EXPIRED document closes the gate and the blocker says when it lapsed', () => {
    const docs = [...allValid(['INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT']), doc('RSR_PERMIT', { validUntil: day(-3) })];
    const r = evaluateCompliance(docs, 'SUBMIT', {}, TODAY);
    expect(r.ok).toBe(false);
    expect(r.expired).toEqual(['RSR_PERMIT']);
    expect(r.blockers).toEqual(['RSR_PERMIT: EXPIRED on 2026-09-29.']);
  });
  it('a renewal fixes an expired predecessor (history is kept, the valid one counts)', () => {
    const docs = [
      ...allValid(['INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT']),
      doc('RSR_PERMIT', { validUntil: day(-3) }),
      doc('RSR_PERMIT', { validFrom: day(-2), validUntil: day(363) }),
    ];
    expect(evaluateCompliance(docs, 'SUBMIT', {}, TODAY).ok).toBe(true);
  });
  it('an unverified (PENDING_REVIEW) document does not satisfy the gate', () => {
    const docs = [...allValid(['INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT']), doc('RSR_PERMIT', { status: 'PENDING_REVIEW' })];
    const r = evaluateCompliance(docs, 'SUBMIT', {}, TODAY);
    expect(r.ok).toBe(false);
    expect(r.pendingReview).toEqual(['RSR_PERMIT']);
  });
  it('revoked and not-yet-valid documents close the gate with their own reasons', () => {
    const docs = [
      doc('RSR_PERMIT', { status: 'REVOKED' }), doc('INSURANCE', { validFrom: day(5) }),
      doc('ROLLING_STOCK_CERT'), doc('TRAIN_CREW_CERT'),
    ];
    const r = evaluateCompliance(docs, 'SUBMIT', {}, TODAY);
    expect(r.revoked).toEqual(['RSR_PERMIT']);
    expect(r.notYetValid).toEqual(['INSURANCE']);
    expect(r.ok).toBe(false);
  });
  it('dangerous goods cannot be submitted without a valid DG authorisation', () => {
    const docs = allValid(REQUIRED_DOCS_SUBMIT);
    expect(evaluateCompliance(docs, 'SUBMIT', { carriesDangerousGoods: false }, TODAY).ok).toBe(true);
    const dg = evaluateCompliance(docs, 'SUBMIT', { carriesDangerousGoods: true }, TODAY);
    expect(dg.ok).toBe(false);
    expect(dg.missing).toEqual(['DANGEROUS_GOODS']);
    expect(evaluateCompliance([...docs, doc('DANGEROUS_GOODS')], 'SUBMIT', { carriesDangerousGoods: true }, TODAY).ok).toBe(true);
  });
  it('OPERATE is stricter than SUBMIT', () => {
    const submitOnly = allValid(REQUIRED_DOCS_SUBMIT);
    expect(evaluateCompliance(submitOnly, 'SUBMIT', {}, TODAY).ok).toBe(true);
    const op = evaluateCompliance(submitOnly, 'OPERATE', {}, TODAY);
    expect(op.ok).toBe(false);
    expect(op.missing).toEqual(['INTERFACE_AGREEMENT', 'ACCESS_CONTRACT', 'SECURITY_DEPOSIT']);
  });
  it('flags documents about to lapse (≤ 30 days) without blocking', () => {
    const docs = [...allValid(['INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT']), doc('RSR_PERMIT', { validUntil: day(12) })];
    const r = evaluateCompliance(docs, 'SUBMIT', {}, TODAY);
    expect(r.ok).toBe(true);
    expect(r.expiringSoon).toEqual([{ docType: 'RSR_PERMIT', validUntil: day(12).toISOString(), daysRemaining: 12 }]);
  });
  it('a document with a later-valid renewal is not reported as expiring', () => {
    const docs = [...allValid(['INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT']), doc('RSR_PERMIT', { validUntil: day(5) }), doc('RSR_PERMIT', { validUntil: day(300) })];
    expect(evaluateCompliance(docs, 'SUBMIT', {}, TODAY).expiringSoon).toEqual([]);
  });
  it('is evaluated per document type: a valid insurance cannot cover a missing permit', () => {
    const r = evaluateCompliance([doc('INSURANCE')], 'SUBMIT', {}, TODAY);
    expect(r.satisfied).toEqual(['INSURANCE']);
    expect(r.missing).toEqual(['RSR_PERMIT', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT']);
  });
});

describe('rsrPermitGuard', () => {
  it('MISSING when there is no permit at all', () => {
    expect(rsrPermitGuard([], TODAY)).toMatchObject({ level: 'MISSING', validUntil: null, daysRemaining: null });
  });
  it.each([
    [200, 'OK'], [31, 'OK'], [30, 'WARNING'], [8, 'WARNING'], [7, 'CRITICAL'], [0, 'CRITICAL'],
  ])('a permit expiring in %i day(s) is %s', (offset, level) => {
    const g = rsrPermitGuard([doc('RSR_PERMIT', { validUntil: day(offset), referenceNumber: 'RSR-1' })], TODAY);
    expect(g).toMatchObject({ level, daysRemaining: offset, referenceNumber: 'RSR-1' });
  });
  it('EXPIRED the day after, with the date in the message', () => {
    const g = rsrPermitGuard([doc('RSR_PERMIT', { validUntil: day(-1) })], TODAY);
    expect(g.level).toBe('EXPIRED');
    expect(g.message).toContain('2026-10-01');
    expect(g.message).toMatch(/blocked/);
  });
  it('REVOKED reads as expired-level with its own wording', () => {
    const g = rsrPermitGuard([doc('RSR_PERMIT', { status: 'REVOKED' })], TODAY);
    expect(g.level).toBe('EXPIRED');
    expect(g.message).toMatch(/revoked/);
  });
  it('PENDING_REVIEW when the only permit has not been verified', () => {
    expect(rsrPermitGuard([doc('RSR_PERMIT', { status: 'PENDING_REVIEW' })], TODAY).level).toBe('PENDING_REVIEW');
  });
  it('uses the valid permit when an expired one sits beside it, and ignores other document types', () => {
    const g = rsrPermitGuard([doc('INSURANCE'), doc('RSR_PERMIT', { validUntil: day(-40) }), doc('RSR_PERMIT', { validUntil: day(100) })], TODAY);
    expect(g).toMatchObject({ level: 'OK', daysRemaining: 100 });
  });
});
