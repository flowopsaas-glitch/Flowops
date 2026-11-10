import { claimTransition, claimTransitionOf, StateConflictError } from './state-transition';

/**
 * The state-transition primitive.
 *
 * These tests exist because the guard is easy to defeat by accident. The two
 * ways to do that are:
 *
 *   - passing an already-awaited promise, so the write happens before the
 *     guard ever sees it and every caller "wins"; and
 *   - treating count === 0 as success, which turns a lost race into a silent
 *     no-op that looks exactly like a win.
 *
 * Both are pinned below.
 */

/** A row that can only be claimed once, like a real conditional UPDATE. */
function oneShotClaim() {
  let taken = false;
  return jest.fn(async () => {
    if (taken) return { count: 0 };
    taken = true;
    return { count: 1 };
  });
}

describe('claimTransition', () => {
  it('allows the first caller through', async () => {
    const claim = oneShotClaim();
    await expect(claimTransition(claim, 'gone')).resolves.toBeUndefined();
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('rejects the second caller with a conflict', async () => {
    const claim = oneShotClaim();
    await claimTransition(claim, 'already taken');

    await expect(claimTransition(claim, 'already taken')).rejects.toBeInstanceOf(StateConflictError);
  });

  it('is a 409, not a 500 or a silent success', async () => {
    const claim = oneShotClaim();
    await claimTransition(claim, 'x');

    const err = await claimTransition(claim, 'x').catch((e) => e);
    expect(err).toBeInstanceOf(StateConflictError);
    expect(err.getStatus()).toBe(409);
  });

  it('carries the caller-supplied message so the loser knows what happened', async () => {
    const claim = oneShotClaim();
    await claimTransition(claim, 'Payment was refunded by someone else.');

    await expect(claimTransition(claim, 'Payment was refunded by someone else.')).rejects.toThrow(
      /refunded by someone else/,
    );
  });

  it('treats a missing or undefined result as a loss, never as a win', async () => {
    // A driver that returns undefined must not be read as "fine, presumably".
    await expect(claimTransition(async () => undefined as any, 'x')).rejects.toBeInstanceOf(
      StateConflictError,
    );
    await expect(claimTransition(async () => ({ count: 0 }), 'x')).rejects.toBeInstanceOf(
      StateConflictError,
    );
  });

  it('runs the claim lazily — passing an awaited promise would defeat it', async () => {
    // The guard only works if the callback is invoked inside claimTransition.
    // If a caller awaited it first, the write would already have happened and
    // the count check would be guarding nothing.
    const claim = oneShotClaim();
    await claimTransition(claim, 'x');
    expect(claim).toHaveBeenCalledTimes(1);
  });
});

describe('claimTransitionOf', () => {
  it('requires an exact row count', async () => {
    await expect(claimTransitionOf(async () => ({ count: 3 }), 3, 'ok')).resolves.toBeUndefined();
    await expect(claimTransitionOf(async () => ({ count: 2 }), 3, 'bulk')).rejects.toThrow(/expected 3/);
  });

  it('rejects a silent no-op that would otherwise look like success', async () => {
    await expect(claimTransitionOf(async () => ({ count: 0 }), 5, 'bulk')).rejects.toBeInstanceOf(
      StateConflictError,
    );
  });
});
