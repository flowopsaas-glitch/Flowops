/**
 * Proof → Payment rules. Pure, one place, the same truth for every department.
 *
 * The principle: PROOF GATES PAYMENT. A delivery that is disputed is not
 * revenue — it is an argument. Money only flows for deliveries whose proof is
 * not in good standing (no POD yet, captured, verified) or whose dispute has
 * been CLEARED. An UPHELD dispute (or an unresolved one) holds the invoice.
 *
 * The same idea already existed in rail (weighbridge hold on a tariff
 * calculation); this module states it once for every lifecycle.
 */

export type EpodState = 'NONE' | 'PENDING' | 'CAPTURED' | 'VERIFIED' | 'DISPUTED' | 'DISPUTED_CLEARED' | 'DISPUTED_UPHELD';

export type ProofState = 'MISSING' | 'CAPTURED' | 'VERIFIED' | 'HELD';

export type MoneyState = 'UNBILLED' | 'HELD' | 'INVOICED' | 'PAID';

export function epodState(input: {
  status?: string | null;
  disputeResolution?: string | null;
} | null | undefined): EpodState {
  if (!input?.status) return 'NONE';
  if (input.status === 'DISPUTED') {
    if (input.disputeResolution === 'CLEARED') return 'DISPUTED_CLEARED';
    if (input.disputeResolution === 'UPHELD') return 'DISPUTED_UPHELD';
    return 'DISPUTED';
  }
  return input.status as EpodState;
}

/** May this delivery's money flow into an invoice right now? */
export function isBillableProof(state: EpodState): boolean {
  return state === 'NONE' || state === 'PENDING' || state === 'CAPTURED' || state === 'VERIFIED' || state === 'DISPUTED_CLEARED';
}

/** The one-line reason a hold exists (shown on the settle queue). */
export function holdReason(state: EpodState): string | null {
  switch (state) {
    case 'DISPUTED':
      return 'Proof of delivery disputed — awaiting resolution';
    case 'DISPUTED_UPHELD':
      return 'Dispute upheld — settle with the client or issue a credit';
    default:
      return null;
  }
}

/** Classify one row of the cross-lifecycle Proof & Payments board. */
export function classifyRow(input: {
  billed: boolean;
  paid?: boolean;
  proofHeld?: boolean;      // ePOD hold (road) or weighbridge/other hold (rail/sea)
  holdReason?: string | null;
}): { proof: ProofState; money: MoneyState; held: boolean; holdReason: string | null } {
  const held = !!input.proofHeld;
  return {
    proof: held ? 'HELD' : input.billed ? 'VERIFIED' : 'CAPTURED',
    money: held ? 'HELD' : input.paid ? 'PAID' : input.billed ? 'INVOICED' : 'UNBILLED',
    held,
    holdReason: held ? (input.holdReason ?? 'Held') : null,
  };
}
