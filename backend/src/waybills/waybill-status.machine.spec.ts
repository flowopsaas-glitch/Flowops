import {
  getTransitionMode,
  guardTransition,
  illegalTransitionMessage,
  isLegalTransition,
  legalNextStatuses,
  legalPredecessorStatuses,
  TRANSITION_CALLERS,
  WAYBILL_TRANSITIONS,
} from './waybill-status.machine';
import { WaybillStatus } from '@prisma/client';

/**
 * The waybill lifecycle is the spine of the operation. These tests pin:
 *  - strict enforcement is the DEFAULT (an illegal move is refused, not logged);
 *  - the legacy boolean env var still works, and `warn`/`off` are explicit;
 *  - the caller registry never names a transition that the machine considers
 *    illegal (a typo in a caller's intent would otherwise only show up in prod).
 */

const ALL = Object.keys(WAYBILL_TRANSITIONS) as WaybillStatus[];

describe('waybill state machine — legality map', () => {
  it('every status has an entry (no status is accidentally unguarded)', () => {
    expect(ALL.sort()).toEqual(Object.values(WaybillStatus).sort());
  });

  it('terminal states go nowhere', () => {
    expect(legalNextStatuses('DELIVERED')).toEqual([]);
    expect(legalNextStatuses('CANCELLED')).toEqual([]);
  });

  it('a no-op transition is always legal', () => {
    for (const status of ALL) expect(isLegalTransition(status, status)).toBe(true);
  });

  it('never points at itself as a "next" state', () => {
    for (const status of ALL) expect(WAYBILL_TRANSITIONS[status]).not.toContain(status);
  });

  it('the same parcel can be delivered from both the hub and the road', () => {
    expect(isLegalTransition('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
    expect(isLegalTransition('PENDING', 'DELIVERED')).toBe(false);
  });
});

describe('guardTransition — enforcement modes', () => {
  const original = { mode: process.env.WAYBILL_TRANSITION_MODE, legacy: process.env.WAYBILL_STRICT_TRANSITIONS };

  beforeEach(() => {
    delete process.env.WAYBILL_TRANSITION_MODE;
    delete process.env.WAYBILL_STRICT_TRANSITIONS;
  });

  afterAll(() => {
    if (original.mode === undefined) delete process.env.WAYBILL_TRANSITION_MODE;
    else process.env.WAYBILL_TRANSITION_MODE = original.mode;
    if (original.legacy === undefined) delete process.env.WAYBILL_STRICT_TRANSITIONS;
    else process.env.WAYBILL_STRICT_TRANSITIONS = original.legacy;
  });

  it('defaults to STRICT — an illegal transition is refused', () => {
    expect(getTransitionMode()).toBe('strict');
    expect(() => guardTransition('PENDING', 'DELIVERED', { waybillId: 'wb-1' })).toThrow(
      /Illegal waybill transition PENDING → DELIVERED/,
    );
  });

  it('calls the caller hook before throwing, so the refusal can be audited', () => {
    const hook = jest.fn((msg: string) => {
      throw new Error(`hooked: ${msg}`);
    });
    expect(() => guardTransition('DELIVERED', 'IN_TRANSIT', {}, hook as any)).toThrow(/hooked:/);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('a legal transition passes in every mode', () => {
    for (const mode of ['strict', 'warn', 'off']) {
      process.env.WAYBILL_TRANSITION_MODE = mode;
      expect(() => guardTransition('OUT_FOR_DELIVERY', 'DELIVERED')).not.toThrow();
    }
  });

  it('warn mode allows the transition (for a live incident) but is explicit', () => {
    process.env.WAYBILL_TRANSITION_MODE = 'warn';
    expect(getTransitionMode()).toBe('warn');
    expect(() => guardTransition('PENDING', 'DELIVERED')).not.toThrow();
  });

  it('off mode allows silently', () => {
    process.env.WAYBILL_TRANSITION_MODE = 'off';
    expect(() => guardTransition('CANCELLED', 'IN_TRANSIT')).not.toThrow();
  });

  it('keeps the legacy boolean env working: false = warn, true = strict', () => {
    process.env.WAYBILL_STRICT_TRANSITIONS = 'false';
    expect(getTransitionMode()).toBe('warn');
    expect(() => guardTransition('PENDING', 'DELIVERED')).not.toThrow();

    process.env.WAYBILL_STRICT_TRANSITIONS = 'true';
    expect(getTransitionMode()).toBe('strict');
    expect(() => guardTransition('PENDING', 'DELIVERED')).toThrow();
  });

  it('an unknown mode falls back to strict (a typo must not disable the guard)', () => {
    process.env.WAYBILL_TRANSITION_MODE = 'strictish';
    expect(getTransitionMode()).toBe('strict');
  });

  it('a missing prior status is not guarded (new record)', () => {
    expect(() => guardTransition(null, 'COLLECTED')).not.toThrow();
    expect(() => guardTransition(undefined, 'DELIVERED')).not.toThrow();
  });
});

describe('the refusal message', () => {
  it('names the waybill, the caller and the legal alternatives', () => {
    const msg = illegalTransitionMessage('DELIVERED', 'OUT_FOR_DELIVERY', {
      trackingNumber: 'FO-0001',
      actor: 'waybills.update',
    });
    expect(msg).toContain('DELIVERED → OUT_FOR_DELIVERY');
    expect(msg).toContain('FO-0001');
    expect(msg).toContain('by waybills.update');
    expect(msg).toContain('none (terminal state)');
  });

  it('lists the legal next states for a non-terminal state', () => {
    expect(illegalTransitionMessage('PENDING', 'DELIVERED', {})).toMatch(
      /Legal next: \[COLLECTED, AT_ORIGIN_HUB, CANCELLED, IN_TRANSIT, OUT_FOR_DELIVERY\]/,
    );
  });
});

describe('retry visits and the predecessor lookup', () => {
  it('a failed first attempt can be completed on the retry visit', () => {
    // The old table forced every re-attempt through OUT_FOR_DELIVERY first,
    // which the ePOD path does not do — a delivered-on-retry parcel was
    // therefore recorded as an illegal jump.
    expect(isLegalTransition('FAILED_DELIVERY', 'DELIVERED')).toBe(true);
  });

  it('a parcel that never went out for delivery still cannot be signed for', () => {
    expect(isLegalTransition('AT_DESTINATION_HUB', 'DELIVERED')).toBe(false);
    expect(isLegalTransition('AT_ORIGIN_HUB', 'DELIVERED')).toBe(false);
    expect(isLegalTransition('PENDING', 'DELIVERED')).toBe(false);
  });

  it('predecessors are the exact inverse of the legality table', () => {
    for (const to of ALL) {
      // `from === to` is always legal (a no-op write) but is not a "predecessor":
      // the table never lists a status as its own next state.
      const expected = ALL.filter((from) => from !== to && isLegalTransition(from, to)).sort();
      expect(legalPredecessorStatuses(to).sort()).toEqual(expected);
    }
  });

  it('the arrivals a linehaul may write are derived, so the old loose whitelist is gone', () => {
    const arrivals = legalPredecessorStatuses('AT_DESTINATION_HUB');
    expect(arrivals.sort()).toEqual(['AT_ORIGIN_HUB', 'FAILED_DELIVERY', 'IN_TRANSIT']);
    expect(arrivals).not.toContain('COLLECTED');
    expect(arrivals).not.toContain('OUT_FOR_DELIVERY');
  });

  it('terminal states have predecessors but never successors', () => {
    expect(legalPredecessorStatuses('DELIVERED').length).toBeGreaterThan(0);
    expect(legalNextStatuses('DELIVERED')).toEqual([]);
  });
});

describe('the caller registry (documentation that is tested)', () => {
  it('every target a caller declares is a legal waybill status', () => {
    const statuses = new Set(Object.values(WaybillStatus) as string[]);
    for (const [caller, targets] of Object.entries(TRANSITION_CALLERS)) {
      for (const target of targets) {
        expect(`${caller}:${target}:${statuses.has(target)}`).toBe(`${caller}:${target}:true`);
      }
    }
  });

  it('every caller can reach its declared targets from at least one state', () => {
    for (const [caller, targets] of Object.entries(TRANSITION_CALLERS)) {
      for (const target of targets as WaybillStatus[]) {
        const reachable = ALL.some((from) => isLegalTransition(from, target));
        expect(`${caller}:${target}:${reachable}`).toBe(`${caller}:${target}:true`);
      }
    }
  });
});
