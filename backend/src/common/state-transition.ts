import { ConflictException } from '@nestjs/common';

/**
 * Atomic state transitions.
 *
 * The bug this exists to prevent has now appeared in three places: a credit
 * note being applied twice, a payment being confirmed twice, and a signup
 * being approved twice. The shape is always the same:
 *
 *     const row = await find(...);              // read
 *     if (row.status !== 'EXPECTED') throw ...  // decide in application code
 *     await update({ where: { id }, data: { status: 'NEXT' } });   // write
 *
 * Two callers overlapping both pass the check, because both read the same
 * committed row. The second write overwrites the first, or — worse — the
 * transition happens twice against a single intended effect. Nothing throws
 * and nothing fails a test, which is what makes it worth a primitive instead
 * of nine careful hand-patches.
 *
 * The fix is to make the expectation part of the write:
 *
 *     updateMany({ where: { id, status: 'EXPECTED' },
 *                  data:  { status: 'NEXT' } })
 *
 * The database evaluates the WHERE against the committed row, so exactly one
 * caller can match. `count === 0` means someone else got there first.
 *
 * Usage — always pass a callback, never an awaited promise, or the work
 * happens before this function can guard anything:
 *
 *   await claimTransition(
 *     () => tx.invoice.updateMany({
 *       where: { id, companyId, status: 'DRAFT' },
 *       data:  { status: 'ISSUED' },
 *     }),
 *     'Invoice is no longer a draft.',
 *   );
 */

/** Thrown when a transition was already taken by another caller. */
export class StateConflictError extends ConflictException {
  constructor(message: string) {
    super(message);
    this.name = 'StateConflictError';
  }
}

/**
 * Run a conditional update and require that it matched exactly one row.
 *
 * @param claim  A callback performing `updateMany` with the expected state in
 *               its WHERE clause. Callback, not promise, so it runs here.
 * @param message What to tell the caller who lost the race.
 */
export async function claimTransition(
  claim: () => Promise<{ count: number }>,
  message: string,
): Promise<void> {
  const result = await claim();
  if (!result || result.count === 0) {
    throw new StateConflictError(message);
  }
}

/**
 * As above, but requires the given number of rows to have matched.
 *
 * For the rare legitimate bulk transition, where matching zero rows is a
 * silent no-op that looks like success.
 */
export async function claimTransitionOf(
  claim: () => Promise<{ count: number }>,
  expected: number,
  message: string,
): Promise<void> {
  const result = await claim();
  if (!result || result.count !== expected) {
    throw new StateConflictError(
      `${message} (expected ${expected} row(s), matched ${result?.count ?? 0})`,
    );
  }
}
