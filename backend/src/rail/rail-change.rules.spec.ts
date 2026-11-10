import { RailChangeStatus } from '@prisma/client';
import {
  CHANGE_TRANSITIONS, RAIL_FLEX_WINDOWS, acknowledgementState, allowedAllocations, attributionFromParty, canChange,
  classifyNotice, evaluateConsequence, initiatorMismatch, noticeLateMinutes, responsiblePartyFor,
} from './rail-change.rules';
import { CANCELLATION_CODE_CATALOG } from './catalog/cancellation-codes.catalog';

const H = 3_600_000;
const REQ = new Date('2026-10-02T10:00:00.000Z');
const dep = (hoursAhead: number) => new Date(REQ.getTime() + hoursAhead * H);

describe('flexing windows (from Annexures 20a / 21 and NS §5.2.10.9)', () => {
  it('carry exactly the quoted numbers', () => {
    expect(RAIL_FLEX_WINDOWS).toMatchObject({
      noticeWithinMinutes: 15, acknowledgeWithinHours: 1, shortNoticeThresholdHours: 48, commercialWindowHours: 72,
      itpPlanningVersions: ['7_DAY', '72_HOUR', '48_HOUR'], clearinghouse: { disputeWindowHours: 24, closedToDisputeAfterHours: 48 },
    });
  });
});

describe('attribution from the Annexure 20b party', () => {
  it.each([['RAIL_OPERATIONS', 'TOC'], ['INFRASTRUCTURE_MANAGER', 'TRIM'], ['FORCE_MAJEURE', 'FORCE_MAJEURE'], ['ALLOCATION_REQUIRED', 'UNDETERMINED']] as const)(
    '%s → %s', (p, a) => expect(attributionFromParty(p)).toBe(a));
  it('maps every one of the 82 catalog rows, and only the ten "could be" rows are undetermined', () => {
    const attrs = CANCELLATION_CODE_CATALOG.map((c) => attributionFromParty(c.responsibleParty));
    expect(attrs.filter((a) => a === 'UNDETERMINED')).toHaveLength(10);
    expect(attrs.filter((a) => a === 'TOC')).toHaveLength(37);
    expect(attrs.filter((a) => a === 'TRIM')).toHaveLength(29);
    expect(attrs.filter((a) => a === 'FORCE_MAJEURE')).toHaveLength(6);
  });
  it('maps an attribution to the handshake responsible party', () => {
    expect(['TOC', 'TRIM', 'FORCE_MAJEURE', 'UNDETERMINED'].map((a) => responsiblePartyFor(a as never))).toEqual(['THIS_TOC', 'IM', 'FORCE_MAJEURE', 'UNDETERMINED']);
  });
  it('lets a "could be" row be allocated only to the parties the annexure names', () => {
    expect(allowedAllocations(['FORCE_MAJEURE', 'INFRASTRUCTURE_MANAGER', 'RAIL_OPERATIONS']).sort()).toEqual(['FORCE_MAJEURE', 'TOC', 'TRIM']);
    expect(allowedAllocations(['INFRASTRUCTURE_MANAGER', 'RAIL_OPERATIONS']).sort()).toEqual(['TOC', 'TRIM']); // e.g. Hook-up: Force Majeure is NOT an option
    expect(allowedAllocations([])).toEqual([]);
  });
});

describe('classifyNotice — the >48 h decision and the 72 h commercial window', () => {
  it.each([
    // hours before departure, band, window, route
    [200, 'PLANNING_VERSION', 'OUTSIDE_72H', 'PLANNING_VERSION_ITP'],
    [72.01, 'PLANNING_VERSION', 'OUTSIDE_72H', 'PLANNING_VERSION_ITP'],
    [72, 'PLANNING_VERSION', 'INSIDE_72H', 'PLANNING_VERSION_ITP'], // exactly 72 h is NOT "more than 72 h"
    [48.01, 'PLANNING_VERSION', 'INSIDE_72H', 'PLANNING_VERSION_ITP'],
    [48, 'SHORT_NOTICE', 'INSIDE_72H', 'EMERGENCY_DYNAMIC_ITP'], // exactly 48 h is NOT "more than 48 h"
    [24, 'SHORT_NOTICE', 'INSIDE_72H', 'EMERGENCY_DYNAMIC_ITP'],
    [0.01, 'SHORT_NOTICE', 'INSIDE_72H', 'EMERGENCY_DYNAMIC_ITP'],
    [0, 'AFTER_DEPARTURE', 'INSIDE_72H', 'EMERGENCY_DYNAMIC_ITP'],
    [-5, 'AFTER_DEPARTURE', 'INSIDE_72H', 'EMERGENCY_DYNAMIC_ITP'],
  ])('%p h before departure → %s / %s / %s', (hours, band, window, route) => {
    const c = classifyNotice(REQ, dep(hours));
    expect(c).toMatchObject({ noticeBand: band, commercialWindow: window, itpRoute: route });
    expect(c.hoursBeforeDeparture).toBeCloseTo(hours, 6);
  });
  it('names the three planning versions on the >48 h path but admits it cannot say which is "relevant"', () => {
    const c = classifyNotice(REQ, dep(100));
    expect(c.itpVersionsNamed).toEqual(['7_DAY', '72_HOUR', '48_HOUR']);
    expect(c.note).toMatch(/not defined in the annexure \(unverified\)/);
    expect(classifyNotice(REQ, dep(10)).itpVersionsNamed).toEqual([]);
  });
  it('without a departure time it classifies nothing', () => {
    for (const d of [null, undefined, new Date('x')]) {
      expect(classifyNotice(REQ, d as never)).toMatchObject({ noticeBand: 'UNKNOWN', commercialWindow: 'UNKNOWN', hoursBeforeDeparture: null, itpRoute: null });
    }
  });
});

describe('noticeLateMinutes — the 15-minute notice', () => {
  const event = (minAgo: number) => new Date(REQ.getTime() - minAgo * 60_000);
  it.each([[0, 0], [10, 0], [15, 0], [15.5, 1], [16, 1], [45, 30], [75, 60]])('event %p min ago → %p min late', (ago, late) => {
    expect(noticeLateMinutes(event(ago), REQ)).toBe(late);
  });
  it('is null when the event time is unknown and never negative for a future event', () => {
    expect(noticeLateMinutes(null, REQ)).toBeNull();
    expect(noticeLateMinutes(undefined, REQ)).toBeNull();
    expect(noticeLateMinutes(new Date(REQ.getTime() + 600_000), REQ)).toBe(0);
  });
});

describe('acknowledgementState — the IM owes an acknowledgement within 1 hour', () => {
  const at = (min: number) => new Date(REQ.getTime() + min * 60_000);
  it.each([
    [null, 59, 'WAITING'], [null, 60, 'WAITING'], [null, 61, 'OVERDUE'],
    [30, 120, 'ACKNOWLEDGED_IN_TIME'], [60, 120, 'ACKNOWLEDGED_IN_TIME'], [61, 120, 'ACKNOWLEDGED_LATE'],
  ])('acknowledged at %p, checked at +%p min → %s', (ack, now, state) => {
    expect(acknowledgementState(REQ, ack === null ? null : at(ack as number), at(now))).toBe(state);
  });
});

describe('evaluateConsequence — R-013.3', () => {
  it('TOC-attributed, MORE than 72 h out → a credit if reallocated, no penalty', () => {
    expect(evaluateConsequence({ attribution: 'TOC', hoursBeforeDeparture: 72.5 })).toMatchObject({ consequence: 'CREDIT_IF_REALLOCATED', penaltyApplicable: false, penaltyAgainst: null });
  });
  it.each([72, 48, 12, 0.5, 0, -3])('TOC-attributed, %p h out (≤ 72 h) → access fees paid in advance are FORFEITED', (h) => {
    const r = evaluateConsequence({ attribution: 'TOC', hoursBeforeDeparture: h });
    expect(r).toMatchObject({ consequence: 'FORFEIT_FEES_PAID_IN_ADVANCE', penaltyApplicable: true, penaltyAgainst: 'TOC' });
    expect(r.basis).toMatch(/forfeited/);
  });
  it('TOC-attributed with no departure time cannot be decided', () => {
    expect(evaluateConsequence({ attribution: 'TOC', hoursBeforeDeparture: null })).toMatchObject({ consequence: 'PENDING_DEPARTURE_TIME', penaltyApplicable: false });
  });
  it('Force Majeure carries neither remedy, however late', () => {
    for (const h of [100, 10, 0, null]) expect(evaluateConsequence({ attribution: 'FORCE_MAJEURE', hoursBeforeDeparture: h })).toMatchObject({ consequence: 'NONE_FORCE_MAJEURE', penaltyApplicable: false });
  });
  it('an undetermined ("could be …") reason assumes NOTHING until allocated', () => {
    expect(evaluateConsequence({ attribution: 'UNDETERMINED', hoursBeforeDeparture: 1 })).toMatchObject({ consequence: 'PENDING_ALLOCATION', penaltyApplicable: false, penaltyAgainst: null });
  });
  describe('TRIM-caused', () => {
    it('replacement NOT accepted → full Train Path fee refund, borne by TRIM, subject to the liability cap', () => {
      const r = evaluateConsequence({ attribution: 'TRIM', hoursBeforeDeparture: 5, replacementAccepted: false });
      expect(r).toMatchObject({ consequence: 'FULL_TRAIN_PATH_FEE_REFUND', penaltyApplicable: true, penaltyAgainst: 'TRIM' });
      expect(r.caveats.join()).toMatch(/limitation of liability/);
    });
    it('replacement accepted → nothing is due', () => {
      expect(evaluateConsequence({ attribution: 'TRIM', hoursBeforeDeparture: 5, replacementAccepted: true })).toMatchObject({ consequence: 'NONE_REPLACEMENT_ACCEPTED', penaltyApplicable: false });
    });
    it('outcome not yet known → pending (no refund promised)', () => {
      for (const v of [undefined, null]) expect(evaluateConsequence({ attribution: 'TRIM', hoursBeforeDeparture: 5, replacementAccepted: v })).toMatchObject({ consequence: 'PENDING_REPLACEMENT_OUTCOME', penaltyApplicable: false });
    });
    it('a planned occupation is excluded from the TRIM-failure remedies, whatever the replacement outcome', () => {
      expect(evaluateConsequence({ attribution: 'TRIM', hoursBeforeDeparture: 5, isPlannedOccupation: true, replacementAccepted: false })).toMatchObject({ consequence: 'NONE_PLANNED_OCCUPATION', penaltyApplicable: false });
    });
  });
  it('always cites its evidence and says the source annex was not supplied', () => {
    expect(evaluateConsequence({ attribution: 'TOC', hoursBeforeDeparture: 1 }).evidence.join()).toMatch(/R-013\.3.*not supplied; unverified/);
  });
});

describe('change-request state machine', () => {
  const ALL = Object.values(RailChangeStatus);
  it('allows exactly SUBMITTED→ACKNOWLEDGED→(ALTERNATIVE_PROPOSED→)ACCEPTED|CANCELLED_CONFIRMED→CLOSED (all 36 pairs)', () => {
    const allowed = new Set(['SUBMITTED>ACKNOWLEDGED', 'ACKNOWLEDGED>ALTERNATIVE_PROPOSED', 'ACKNOWLEDGED>CANCELLED_CONFIRMED', 'ALTERNATIVE_PROPOSED>ACCEPTED', 'ALTERNATIVE_PROPOSED>CANCELLED_CONFIRMED', 'ACCEPTED>CLOSED', 'CANCELLED_CONFIRMED>CLOSED']);
    for (const a of ALL) for (const b of ALL) expect([a, b, canChange(a, b)]).toEqual([a, b, allowed.has(`${a}>${b}`)]);
  });
  it('CLOSED is terminal', () => expect(CHANGE_TRANSITIONS.CLOSED).toEqual([]));
});

describe('initiatorMismatch (a warning, never a block)', () => {
  it('flags TRIM raising a Rail-Operations reason, and a TOC raising an IM reason', () => {
    expect(initiatorMismatch('TRIM', 'TOC')).toMatch(/allocated to Rail Operations/);
    expect(initiatorMismatch('TOC', 'TRIM')).toMatch(/allocated to the Infrastructure Manager/);
  });
  it('is silent when they agree or the reason is not allocated', () => {
    expect(initiatorMismatch('TOC', 'TOC')).toBeNull();
    expect(initiatorMismatch('TRIM', 'TRIM')).toBeNull();
    expect(initiatorMismatch('TRIM', 'UNDETERMINED')).toBeNull();
    expect(initiatorMismatch('YARD_OPERATOR', 'TOC')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('consequence explanations name the network\'s own infrastructure manager', () => {
  /**
   * The `basis` string is the sentence an operator reads to find out who owes
   * them money. It said "TRIM-caused" unconditionally, so a European operator
   * was told their refund was caused by an entity with no contractual
   * relationship to them.
   *
   * The DECISIONS below were always network-neutral -- who bears a
   * cancellation is a property of the access regime, not of Transnet -- so
   * this block asserts the decisions do not move while the wording does.
   */
  const UK = { TRIM: 'Network Rail', TOC: 'Train Operator' };

  it('a network\'s own name appears in the basis, not Transnet\'s', () => {
    const r = evaluateConsequence({
      attribution: 'TRIM', hoursBeforeDeparture: 5, replacementAccepted: false, labels: UK,
    });
    expect(r.basis).toMatch(/Network Rail/);
    expect(r.basis).not.toMatch(/TRIM/);
  });

  it('the DECISION is unchanged by the label — same refund, same bearer', () => {
    const plain = evaluateConsequence({ attribution: 'TRIM', hoursBeforeDeparture: 5, replacementAccepted: false });
    const labelled = evaluateConsequence({ attribution: 'TRIM', hoursBeforeDeparture: 5, replacementAccepted: false, labels: UK });
    expect(labelled.consequence).toBe(plain.consequence);
    expect(labelled.penaltyApplicable).toBe(plain.penaltyApplicable);
    expect(labelled.penaltyAgainst).toBe(plain.penaltyAgainst);
    expect(labelled.penaltyAgainst).toBe('TRIM'); // the key is stable; only the wording moves
  });

  it('defaults to the Transnet wording when no labels are supplied', () => {
    // Zero behaviour change for existing tenants: the default IS the old text.
    const r = evaluateConsequence({ attribution: 'TRIM', hoursBeforeDeparture: 5, replacementAccepted: false });
    expect(r.basis).toMatch(/TRIM/);
  });

  it('a partial label map still reads as a sentence for the unlabelled roles', () => {
    const r = evaluateConsequence({
      attribution: 'TRIM', hoursBeforeDeparture: 5, replacementAccepted: false, labels: { TRIM: 'Network Rail' },
    });
    expect(r.basis).toMatch(/Network Rail/);
    // TOC was not relabelled, so it falls back rather than rendering a blank.
    const toc = evaluateConsequence({ attribution: 'TOC', hoursBeforeDeparture: 1, labels: { TRIM: 'Network Rail' } });
    expect(toc.basis).toMatch(/TOC/);
  });

  it('the planned-occupation exclusion names the network too', () => {
    const r = evaluateConsequence({
      attribution: 'TRIM', hoursBeforeDeparture: 5, isPlannedOccupation: true, replacementAccepted: false, labels: UK,
    });
    expect(r.basis).toMatch(/Network Rail/);
    expect(r.basis).not.toMatch(/TRIM/);
  });

  it('the initiator mismatch warning uses the network\'s own words for the operator', () => {
    // I first asserted this sentence should name the infrastructure manager.
    // It does not, and should not: it says "allocated to the Infrastructure
    // Manager in Annexure 20b", and "Infrastructure Manager" is already
    // network-neutral, whereas Annexure 20b is a Transnet document that a UK
    // network has no equivalent of. Substituting "Network Rail" there would
    // produce a sentence citing an annexure the reader has never heard of.
    // The role that IS renamed here is the TOC side.
    const msg = initiatorMismatch('TOC', 'TRIM', UK);
    expect(msg).toBeTruthy();
    expect(msg!).toMatch(/Train Operator/);
    expect(msg!).not.toMatch(/\bTOC\b/);
  });
});
