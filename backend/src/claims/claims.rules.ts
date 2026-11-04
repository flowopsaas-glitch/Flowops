import type { ClaimStatus, ClaimLiability } from '@prisma/client';

/**
 * The claim lifecycle, in one place.
 *
 * A claim is money: it starts as an allegation, becomes an assessment, and may
 * end as a credit note against a client's account. The transitions below are the
 * only legal moves, and the service refuses anything else rather than writing a
 * status that no screen expects.
 *
 *                        ┌──────────────► REJECTED (terminal)
 *   OPEN ──► UNDER_REVIEW ─┼──────────────► APPROVED ──► SETTLED (terminal)
 *     │            │       └──────────────► WITHDRAWN (terminal)
 *     └────────────┴──────────────────────► WITHDRAWN
 *
 * `SETTLED`, `REJECTED` and `WITHDRAWN` are terminal. There is no reopen: a
 * settled or rejected claim is a concluded financial record, and quietly moving
 * it back would rewrite history that finance may already have acted on. A new
 * claim is raised instead.
 */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  OPEN: ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'WITHDRAWN'],
  APPROVED: ['SETTLED', 'WITHDRAWN'],
  REJECTED: [],
  SETTLED: [],
  WITHDRAWN: [],
};

export const TERMINAL_CLAIM_STATUSES: ClaimStatus[] = ['SETTLED', 'REJECTED', 'WITHDRAWN'];

export function isTerminal(status: ClaimStatus): boolean {
  return TERMINAL_CLAIM_STATUSES.includes(status);
}

export function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Reasons a status change is refused, in words an operator can act on. */
export function transitionRefusal(from: ClaimStatus, to: ClaimStatus): string {
  if (isTerminal(from)) {
    return `This claim is ${from.toLowerCase()} and cannot change again. Raise a new claim if the position changes.`;
  }
  return `A claim that is ${from.toLowerCase()} cannot move to ${to.toLowerCase()}.`;
}

/**
 * Liability has to be stated before a claim can be approved.
 *
 * UNASSESSED is a real answer ("nobody has decided yet"), not a placeholder to
 * be silently treated as CARRIER. An operator's liability position comes from
 * their trading terms or their insurer, and the platform records the basis the
 * human gives — it does not pick one.
 */
export function liabilityIsAssessed(liability: ClaimLiability, basis: string | null | undefined): boolean {
  return liability !== 'UNASSESSED' && Boolean(basis && basis.trim().length >= 3);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface ApprovalCheck {
  ok: boolean;
  /** Present when ok is false. */
  reason?: string;
}

/**
 * Whether an approved amount is payable.
 *
 * Never above what was claimed — a claim cannot grow by being approved. Never
 * above the operator's stated cap for this claim. And never zero: approving
 * nothing is a rejection, and must be recorded as one.
 */
export function checkApprovalAmount(
  approvedAmount: number,
  claimedAmount: number,
  liabilityCap: number | null | undefined,
): ApprovalCheck {
  if (!Number.isFinite(approvedAmount)) {
    return { ok: false, reason: 'Approved amount must be a number.' };
  }
  if (approvedAmount <= 0) {
    return {
      ok: false,
      reason: 'An approved amount of zero is a rejection. Reject the claim instead so the reason is recorded.',
    };
  }
  if (approvedAmount > claimedAmount) {
    return {
      ok: false,
      reason: `Approved amount cannot exceed the claimed amount (${claimedAmount.toFixed(2)}).`,
    };
  }
  if (liabilityCap != null && approvedAmount > liabilityCap) {
    return {
      ok: false,
      reason: `Approved amount exceeds the liability cap set on this claim (${liabilityCap.toFixed(2)}).`,
    };
  }
  return { ok: true };
}

/**
 * Next claim number from the highest existing one for the year.
 *
 * Count-based numbering collides as soon as two claims are raised at once, so
 * the service derives from the last number and retries on a unique violation.
 */
export function nextClaimNumber(lastNumber: string | null | undefined, year: number): string {
  const prefix = `CLM-${year}-`;
  let sequence = 1;
  if (lastNumber && lastNumber.startsWith(prefix)) {
    const parsed = Number.parseInt(lastNumber.slice(prefix.length), 10);
    if (Number.isFinite(parsed)) sequence = parsed + 1;
  }
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}
