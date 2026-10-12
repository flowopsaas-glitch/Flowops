import { classifyRow, epodState, holdReason, isBillableProof } from './proof-payment.rules';

describe('proof-payment.rules — proof gates payment', () => {
  it('classifies POD states from status + dispute resolution', () => {
    expect(epodState(null)).toBe('NONE');
    expect(epodState({ status: 'CAPTURED' })).toBe('CAPTURED');
    expect(epodState({ status: 'VERIFIED' })).toBe('VERIFIED');
    expect(epodState({ status: 'DISPUTED' })).toBe('DISPUTED');
    expect(epodState({ status: 'DISPUTED', disputeResolution: 'CLEARED' })).toBe('DISPUTED_CLEARED');
    expect(epodState({ status: 'DISPUTED', disputeResolution: 'UPHELD' })).toBe('DISPUTED_UPHELD');
    expect(epodState({ status: 'PENDING' })).toBe('PENDING');
  });

  it('holds the money for unresolved and upheld disputes — and only those', () => {
    for (const s of ['NONE', 'PENDING', 'CAPTURED', 'VERIFIED', 'DISPUTED_CLEARED'] as const) {
      expect(isBillableProof(s)).toBe(true);
    }
    expect(isBillableProof('DISPUTED')).toBe(false);
    expect(isBillableProof('DISPUTED_UPHELD')).toBe(false);
  });

  it('names the hold in language a collections desk can act on', () => {
    expect(holdReason('DISPUTED')).toContain('awaiting resolution');
    expect(holdReason('DISPUTED_UPHELD')).toContain('credit');
    expect(holdReason('VERIFIED')).toBeNull();
    expect(holdReason('CAPTURED')).toBeNull();
  });

  it('classifies board rows: a held row never shows as billable money', () => {
    const held = classifyRow({ billed: false, proofHeld: true, holdReason: 'Proof of delivery disputed — awaiting resolution' });
    expect(held.money).toBe('HELD');
    expect(held.held).toBe(true);
    expect(held.holdReason).toContain('disputed');

    const clean = classifyRow({ billed: false, proofHeld: false });
    expect(clean.money).toBe('UNBILLED');
    const billed = classifyRow({ billed: true, proofHeld: false });
    expect(billed.money).toBe('INVOICED');
    const paid = classifyRow({ billed: true, paid: true, proofHeld: false });
    expect(paid.money).toBe('PAID');
  });
});
