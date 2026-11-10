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
    // withTenant wraps work in a transaction and sets app.company_id. The
    // harness has no real transaction, so handing the callback the same fake
    // keeps the semantics under test (the claim and the status update) intact
    // without pretending to model isolation.
    withTenant: async (_companyId: string, fn: (tx: any) => Promise<any>) =>
      fn(prismaProxy),

    creditNote: {
      findUnique: async ({ where }: any) =>
        where.id === db.note.id ? { ...db.note } : null,
      findUniqueOrThrow: async ({ where }: any) => {
        if (where.id !== db.note.id) throw new Error('not found');
        return { ...db.note };
      },
      // The read path used by getCreditNote. A jest.fn so a test can hand it
      // a STALE snapshot — that is the only way to make a lost-race test
      // deterministic rather than dependent on promise timing.
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === db.note.id && where.companyId === db.note.companyId
          ? { ...db.note }
          : null,
      ),

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
        // status can arrive as a value, { not: ... } or { in: [...] } — the
        // shapes claimTransition uses for a conditional transition.
        if (where.status !== undefined) {
          const s = where.status;
          const ok =
            typeof s === 'string'
              ? db.note.status === s
              : s?.not !== undefined
                ? db.note.status !== s.not
                : Array.isArray(s?.in)
                  ? s.in.includes(db.note.status)
                  : true;
          if (!ok) return { count: 0 };
        }
        if (where.appliedAmount?.lte !== undefined) {
          if (!(db.note.appliedAmount <= where.appliedAmount.lte)) return { count: 0 };
        }
        for (const [k, v] of Object.entries(data ?? {})) {
          if (typeof v === 'object' && v !== null && 'increment' in (v as any)) {
            db.note[k] += (v as any).increment;
          } else {
            db.note[k] = v;
          }
        }
        return { count: 1 };
      }),
    },
    invoice: {
      findFirst: async ({ where }: any) => ({ id: where.id, companyId: where.companyId }),
    },
  };
  const prismaProxy = prisma;

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

describe('credit note state transitions', () => {
  const DRAFT = { ...NOTE, status: 'DRAFT' };

  it('issues a draft note exactly once when two callers race', async () => {
    // Both read DRAFT, both pass the up-front check. Only one can move it —
    // otherwise issuedAt is stamped twice and two callers each believe they
    // were the one that issued it.
    const { prisma, db } = makeHarness(DRAFT);
    const svc = service(prisma);

    const results = await Promise.allSettled([
      svc.issueCreditNote('cn-1', 'co-1'),
      svc.issueCreditNote('cn-1', 'co-1'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(db.note.status).toBe('ISSUED');
  });

  it('refuses to issue a note that is no longer a draft', async () => {
    const { prisma, db } = makeHarness({ ...NOTE, status: 'ISSUED' });
    const svc = service(prisma);

    await expect(svc.issueCreditNote('cn-1', 'co-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // The up-front check still answers with 400 and the real status, so the
    // caller gets a useful message rather than a bare conflict.
    expect(db.note.status).toBe('ISSUED');
  });

  it('cannot void a note that was applied while the void was in flight', async () => {
    // The decisive case, made deterministic. The void reads the note and sees
    // ISSUED, so the up-front check passes — but by the time it writes, the
    // committed row has been APPLIED. Only the WHERE clause can stop it.
    //
    // Old behaviour: a plain `update({ status: 'VOID' })` lands regardless,
    // so credit already given to a customer is silently voided out.
    const { prisma, db } = makeHarness({ ...NOTE, status: 'APPLIED' });
    // The read this request performed returned the pre-apply snapshot.
    prisma.creditNote.findFirst.mockResolvedValueOnce({ ...NOTE, status: 'ISSUED' });
    const svc = service(prisma);

    await expect(svc.voidCreditNote('cn-1', 'co-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.note.status).toBe('APPLIED');
  });

  it('cannot issue a note that another caller already issued', async () => {
    // Same stale-read shape, for issuing: the check sees DRAFT, the committed
    // row is already ISSUED.
    const { prisma, db } = makeHarness({ ...NOTE, status: 'ISSUED' });
    prisma.creditNote.findFirst.mockResolvedValueOnce({ ...NOTE, status: 'DRAFT' });
    const svc = service(prisma);

    await expect(svc.issueCreditNote('cn-1', 'co-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.note.status).toBe('ISSUED');
  });

  it('voids a draft note', async () => {
    const { prisma, db } = makeHarness({ ...NOTE, status: 'ISSUED' });
    const svc = service(prisma);

    await svc.voidCreditNote('cn-1', 'co-1');
    expect(db.note.status).toBe('VOID');
  });

  it('refuses to void an already-applied note', async () => {
    const { prisma, db } = makeHarness({ ...NOTE, status: 'APPLIED' });
    const svc = service(prisma);

    await expect(svc.voidCreditNote('cn-1', 'co-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.note.status).toBe('APPLIED');
  });
});
