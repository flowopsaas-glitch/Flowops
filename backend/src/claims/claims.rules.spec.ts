import type { ClaimStatus } from '@prisma/client';
import {
  CLAIM_TRANSITIONS,
  canTransition,
  checkApprovalAmount,
  isTerminal,
  liabilityIsAssessed,
  nextClaimNumber,
  roundMoney,
  transitionRefusal,
} from './claims.rules';

describe('claims rules — state machine', () => {
  const ALL: ClaimStatus[] = ['OPEN', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SETTLED', 'WITHDRAWN'];

  it('has a transition list for every status, so no status is silently unstoppable', () => {
    for (const status of ALL) {
      expect(Array.isArray(CLAIM_TRANSITIONS[status])).toBe(true);
    }
  });

  it('treats SETTLED, REJECTED and WITHDRAWN as terminal', () => {
    for (const status of ['SETTLED', 'REJECTED', 'WITHDRAWN'] as ClaimStatus[]) {
      expect(isTerminal(status)).toBe(true);
      for (const to of ALL) expect(canTransition(status, to)).toBe(false);
    }
  });

  it('never allows a claim to reopen into an earlier state', () => {
    expect(canTransition('SETTLED', 'OPEN')).toBe(false);
    expect(canTransition('REJECTED', 'UNDER_REVIEW')).toBe(false);
    expect(canTransition('APPROVED', 'OPEN')).toBe(false);
  });

  it('allows the forward path OPEN → UNDER_REVIEW → APPROVED → SETTLED', () => {
    expect(canTransition('OPEN', 'UNDER_REVIEW')).toBe(true);
    expect(canTransition('UNDER_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'SETTLED')).toBe(true);
  });

  it('refuses to skip review', () => {
    expect(canTransition('OPEN', 'APPROVED')).toBe(false);
    expect(canTransition('OPEN', 'SETTLED')).toBe(false);
  });

  it('explains a refusal in words an operator can act on', () => {
    expect(transitionRefusal('SETTLED', 'OPEN')).toMatch(/settled/i);
    expect(transitionRefusal('SETTLED', 'OPEN')).toMatch(/new claim/i);
    expect(transitionRefusal('OPEN', 'SETTLED')).toMatch(/cannot move to settled/i);
  });
});

describe('claims rules — liability', () => {
  it('treats UNASSESSED as no assessment, whatever the basis says', () => {
    expect(liabilityIsAssessed('UNASSESSED', 'Trading terms cl 12.2')).toBe(false);
  });

  it('requires a basis with substance', () => {
    expect(liabilityIsAssessed('CARRIER', '')).toBe(false);
    expect(liabilityIsAssessed('CARRIER', '   ')).toBe(false);
    expect(liabilityIsAssessed('CARRIER', 'cl')).toBe(false);
    expect(liabilityIsAssessed('CARRIER', null)).toBe(false);
    expect(liabilityIsAssessed('CARRIER', 'cl. 12.2')).toBe(true);
  });

  it('accepts any party as the carrier of the loss', () => {
    for (const party of ['CARRIER', 'INSURER', 'CLIENT', 'THIRD_PARTY'] as const) {
      expect(liabilityIsAssessed(party, 'basis stated')).toBe(true);
    }
  });
});

describe('claims rules — approval amounts', () => {
  it('approves a partial amount', () => {
    expect(checkApprovalAmount(1500, 4000, null)).toEqual({ ok: true });
  });

  it('approves the full amount', () => {
    expect(checkApprovalAmount(4000, 4000, null)).toEqual({ ok: true });
  });

  it('refuses more than was claimed, and says by how much is allowed', () => {
    const check = checkApprovalAmount(4000.01, 4000, null);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('4000.00');
  });

  it('refuses more than the liability cap', () => {
    const check = checkApprovalAmount(2500, 4000, 2000);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('2000.00');
  });

  it('allows exactly the cap', () => {
    expect(checkApprovalAmount(2000, 4000, 2000)).toEqual({ ok: true });
  });

  it('treats a cap of zero as a cap', () => {
    expect(checkApprovalAmount(1, 4000, 0).ok).toBe(false);
  });

  it('refuses zero and points at rejection instead', () => {
    const check = checkApprovalAmount(0, 4000, null);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/reject/i);
  });

  it('refuses a negative approval', () => {
    expect(checkApprovalAmount(-100, 4000, null).ok).toBe(false);
  });

  it('refuses a non-finite approval', () => {
    expect(checkApprovalAmount(Number.NaN, 4000, null).ok).toBe(false);
    expect(checkApprovalAmount(Number.POSITIVE_INFINITY, 4000, null).ok).toBe(false);
  });
});

describe('claims rules — numbering', () => {
  it('starts the year at 0001', () => {
    expect(nextClaimNumber(null, 2026)).toBe('CLM-2026-0001');
    expect(nextClaimNumber(undefined, 2026)).toBe('CLM-2026-0001');
  });

  it('increments the last number of that year', () => {
    expect(nextClaimNumber('CLM-2026-0041', 2026)).toBe('CLM-2026-0042');
    expect(nextClaimNumber('CLM-2026-0009', 2026)).toBe('CLM-2026-0010');
  });

  it('pads past four digits rather than truncating', () => {
    expect(nextClaimNumber('CLM-2026-9999', 2026)).toBe('CLM-2026-10000');
  });

  it('ignores a number from another year', () => {
    expect(nextClaimNumber('CLM-2025-0700', 2026)).toBe('CLM-2026-0001');
  });

  it('starts over rather than emitting NaN on a malformed tail', () => {
    expect(nextClaimNumber('CLM-2026-????', 2026)).toBe('CLM-2026-0001');
  });
});

describe('claims rules — money rounding', () => {
  it('rounds to cents', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
  });

  it('round-trips values that are already whole cents', () => {
    expect(roundMoney(4250)).toBe(4250);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});
