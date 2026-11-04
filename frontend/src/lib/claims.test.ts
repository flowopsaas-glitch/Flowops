import { describe, it, expect } from 'vitest';
import {
  allowedActions,
  amountAtStake,
  approvalProblem,
  claimStatusTone,
  evidenceRefs,
  formatMoney,
  isOverdue,
  isTerminal,
} from './claims';

describe('formatMoney', () => {
  it('always shows two decimals and a currency', () => {
    expect(formatMoney(4250)).toBe('ZAR 4 250.00');
    expect(formatMoney(0)).toBe('ZAR 0.00');
    expect(formatMoney(1234567.5)).toBe('ZAR 1 234 567.50');
  });

  it('renders a missing amount as a dash rather than zero', () => {
    // Zero and "we do not know" are different facts.
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney(Number.NaN)).toBe('—');
  });

  it('keeps the negative sign outside the grouping', () => {
    expect(formatMoney(-1234.5)).toBe('ZAR -1 234.50');
  });
});

describe('allowedActions', () => {
  it('mirrors the server state machine', () => {
    expect(allowedActions('OPEN')).toEqual({
      assess: true,
      approve: false,
      reject: true,
      withdraw: true,
      settle: false,
    });
    expect(allowedActions('UNDER_REVIEW')).toEqual({
      assess: true,
      approve: true,
      reject: true,
      withdraw: true,
      settle: false,
    });
    expect(allowedActions('APPROVED')).toEqual({
      assess: false,
      approve: false,
      reject: false,
      withdraw: true,
      settle: true,
    });
  });

  it('offers nothing on a terminal claim', () => {
    for (const status of ['SETTLED', 'REJECTED', 'WITHDRAWN'] as const) {
      expect(isTerminal(status)).toBe(true);
      const actions = allowedActions(status);
      expect(actions.assess || actions.approve || actions.settle || actions.reject || actions.withdraw).toBe(false);
    }
  });
});

describe('approvalProblem', () => {
  const claim = { claimedAmount: 4000, liabilityCap: null };

  it('accepts a partial approval', () => {
    expect(approvalProblem(1500, claim)).toBeNull();
  });

  it('refuses more than was claimed', () => {
    expect(approvalProblem(4000.01, claim)).toMatch(/cannot exceed the claimed amount/i);
  });

  it('refuses more than the cap', () => {
    expect(approvalProblem(2500, { claimedAmount: 4000, liabilityCap: 2000 })).toMatch(/liability cap/i);
  });

  it('refuses zero and says to reject instead', () => {
    expect(approvalProblem(0, claim)).toMatch(/rejection/i);
  });

  it('treats a cap of zero as a real cap', () => {
    expect(approvalProblem(1, { claimedAmount: 4000, liabilityCap: 0 })).not.toBeNull();
  });
});

describe('amountAtStake', () => {
  it('is what was claimed before approval', () => {
    expect(amountAtStake({ status: 'OPEN', claimedAmount: 4000, approvedAmount: null })).toBe(4000);
  });

  it('is what was approved once approved', () => {
    expect(amountAtStake({ status: 'APPROVED', claimedAmount: 4000, approvedAmount: 2500 })).toBe(2500);
  });

  it('is nothing once the claim is concluded', () => {
    for (const status of ['SETTLED', 'REJECTED', 'WITHDRAWN'] as const) {
      expect(amountAtStake({ status, claimedAmount: 4000, approvedAmount: 2500 })).toBe(0);
    }
  });
});

describe('isOverdue', () => {
  const now = Date.parse('2026-11-04T00:00:00.000Z');

  it('is true only once the response date has passed', () => {
    expect(isOverdue({ status: 'OPEN', respondBy: '2026-11-03T00:00:00.000Z' }, now)).toBe(true);
    expect(isOverdue({ status: 'OPEN', respondBy: '2026-11-05T00:00:00.000Z' }, now)).toBe(false);
  });

  it('is false when no response is owed', () => {
    expect(isOverdue({ status: 'OPEN', respondBy: null }, now)).toBe(false);
  });

  it('is false on a concluded claim, whatever the date', () => {
    expect(isOverdue({ status: 'SETTLED', respondBy: '2020-01-01T00:00:00.000Z' }, now)).toBe(false);
  });
});

describe('claimStatusTone', () => {
  it('gives each status a distinct, meaningful tone', () => {
    expect(claimStatusTone('OPEN')).toBe('info');
    expect(claimStatusTone('UNDER_REVIEW')).toBe('warning');
    expect(claimStatusTone('APPROVED')).toBe('success');
    expect(claimStatusTone('REJECTED')).toBe('danger');
    expect(claimStatusTone('SETTLED')).toBe('neutral');
    expect(claimStatusTone('WITHDRAWN')).toBe('neutral');
  });
});

describe('evidenceRefs', () => {
  it('reads the refs array and tolerates every empty shape', () => {
    expect(evidenceRefs({ evidence: { refs: ['photo:1', 'epod:2'] } })).toEqual(['photo:1', 'epod:2']);
    expect(evidenceRefs({ evidence: null })).toEqual([]);
    expect(evidenceRefs({ evidence: {} })).toEqual([]);
    expect(evidenceRefs({ evidence: { refs: 'nope' as unknown as string[] } })).toEqual([]);
  });
});
