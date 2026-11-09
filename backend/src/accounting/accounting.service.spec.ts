import { BadRequestException, ConflictException } from '@nestjs/common';
import { AccountingService } from './accounting.service';

/**
 * Credit-note application — concurrency regression tests.
 *
 * `applyCreditNote` used to read the note, compute `appliedAmount + amount` in
 * JavaScript, and write the result back. Two callers that overlapped both read
 * the same starting balance and the second write overwrote the first: credit
 * that had been applied against an invoice disappeared from the record while
 * the customer kept it. Nothing threw, and the only symptom was a note that
 * looked under-applied forever.
 *
 * The harness below emulates the semantics that matter — `updateMany` evaluates
 * its WHERE against the COMMITTED row and `increment` is computed by the
 * database — so these tests fail against the old read-modify-write version and
 * pass against the atomic claim. That is the whole point of them.
 */

type Row = Record<string, any>;

/**
 * A credit note whose `appliedAmount` behaves like a real column: a plain
 * `update` writes whatever it is handed (last write wins, losing the other
 * caller's work), while `updateMany` + `increment` is applied to the committed
 * value and refuses when the WHERE no longer matches.
 */
function makeHarness(note: Row) {
  const db = { note: { ...note } };

  const prisma: any = {
    creditNote: {
      findUnique: async ({ where }: any) =>
        where.id === db.note.id ? { ...db.note } : null,
      findUniqueOrThrow: async ({ where }: any) => {
        if (where.id !== db.note.id) throw new Error('not found');
        return { ...db.note };
      },
      // The read path used by getCreditNote.
      findFirst: async ({ where }: any) =>
        where.id === db.note.id && where.companyId === db.note.companyId
          ? { ...db.note }
          : null,

      // Last-write-wins, exactly as Postgres would: whatever value the caller
      // computed is what lands, regardless of what happened in between.
      update: jest.fn(async ({ where, data }: any) => {
        if (where.id !== db.note.id) throw new Error('not found');
        db.note = { ...db.note, ...data };
        return { ...db.note, items: [] };
      }),

      // The atomic claim: WHERE is checked against the committed row and
      // `increment` is applied to it.
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.id !== db.note.id) return { count: 0 };
        if (where.companyId && where.companyId !== db.note.companyId) return { count: 0 };
        if (where.status && where.status !== db.note.status) return { count: 0 };
        if (where.appliedAmount?.lte !== undefined) {
          if (!(db.note.appliedAmount <= where.appliedAmount.lte)) return { count: 0 };
        }
        if (data.appliedAmount?.increment !== undefined) {
          db.note.appliedAmount += data.appliedAmount.increment;
        }
        return { count: 1 };
      }),
    },
    invoice: {
      findFirst: async ({ where }: any) => ({ id: where.id, companyId: where.companyId }),
    },
  };

  return { prisma, db };
}

const NOTE = {
  id: 'cn-1',
  companyId: 'co-1',
  status: 'ISSUED',
  total: 1000,
  appliedAmount: 0,
  invoiceId: null,
  appliedAt: null,
  items: [],
};

const service = (prisma: any) => new AccountingService(prisma);

describe('applyCreditNote', () => {
  it('accumulates two overlapping applications instead of losing the first', async () => {
    // The regression. Both callers read appliedAmount = 0 before either writes.
    // Old behaviour: 300 then 200 land as 200 — R300 of credit vanishes.
    const { prisma, db } = makeHarness(NOTE);
    const svc = service(prisma);

    // Interleave them: A reaches the guard, B completes, then A writes.
    const a = svc.applyCreditNote('cn-1', 'co-1', { amount: 300 } as any);
    const b = svc.applyCreditNote('cn-1', 'co-1', { amount: 200 } as any);
    await Promise.all([a, b]);

    expect(db.note.appliedAmount).toBe(500);
  });

  it('refuses a second application that would exceed the note total', async () => {
    const { prisma, db } = makeHarness(NOTE);
    const svc = service(prisma);

    await svc.applyCreditNote('cn-1', 'co-1', { amount: 600 } as any);
    // Sequentially the balance is visible, so the amount validation rejects it.
    await expect(
      svc.applyCreditNote('cn-1', 'co-1', { amount: 600 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.note.appliedAmount).toBe(600);
  });

  it('refuses the loser when two callers both pass the amount check on a stale read', async () => {
    // The case the atomic claim exists for. Both callers read appliedAmount = 0
    // and both legitimately pass "600 <= 1000 remaining", so the amount check
    // cannot save us — only the WHERE clause sees the committed 600 and stops
    // the second one landing. Without the claim, both write and the note reads
    // 600 while R1,200 of credit has actually gone out.
    const { prisma, db } = makeHarness(NOTE);
    const svc = service(prisma);

    const results = await Promise.allSettled([
      svc.applyCreditNote('cn-1', 'co-1', { amount: 600 } as any),
      svc.applyCreditNote('cn-1', 'co-1', { amount: 600 } as any),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(db.note.appliedAmount).toBe(600);
    expect(db.note.appliedAmount).toBeLessThanOrEqual(db.note.total);
  });

  it('keeps a note ISSUED while a balance remains and marks it APPLIED when exhausted', async () => {
    const { prisma, db } = makeHarness(NOTE);
    const svc = service(prisma);

    await svc.applyCreditNote('cn-1', 'co-1', { amount: 400 } as any);
    expect(db.note.status).toBe('ISSUED');

    await svc.applyCreditNote('cn-1', 'co-1', { amount: 600 } as any);
    expect(db.note.status).toBe('APPLIED');
    expect(db.note.appliedAt).toBeTruthy();
  });

  it('applies the remaining balance when no amount is given', async () => {
    const { prisma, db } = makeHarness({ ...NOTE, appliedAmount: 700 });
    const svc = service(prisma);

    await svc.applyCreditNote('cn-1', 'co-1', {} as any);
    expect(db.note.appliedAmount).toBe(1000);
    expect(db.note.status).toBe('APPLIED');
  });

  it('rejects a note that is not ISSUED', async () => {
    const { prisma, db } = makeHarness({ ...NOTE, status: 'DRAFT' });
    const svc = service(prisma);

    await expect(
      svc.applyCreditNote('cn-1', 'co-1', { amount: 100 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.note.appliedAmount).toBe(0);
  });

  it('never leaves the balance above the note total under a burst', async () => {
    const { prisma, db } = makeHarness(NOTE);
    const svc = service(prisma);

    // Ten callers racing to apply R200 each against a R1000 note: five must win.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        svc.applyCreditNote('cn-1', 'co-1', { amount: 200 } as any),
      ),
    );

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(5);
    expect(db.note.appliedAmount).toBe(1000);
    expect(db.note.appliedAmount).toBeLessThanOrEqual(db.note.total);
  });
});
