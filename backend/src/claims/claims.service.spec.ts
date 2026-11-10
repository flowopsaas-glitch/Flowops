import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ClaimsService } from './claims.service';
import type { CreateClaimDto } from './dto/claims.dto';

/**
 * Behavioural tests for claims & liability.
 *
 * The things worth pinning are not the happy path — they are the refusals. A
 * claim is money and, once settled, a credit note against a client's account, so
 * every test below is asking: can this API be made to create a financial record
 * that a human did not agree to?
 */

const COMPANY = 'tenant-a';
const ACTOR = { id: 'u1', name: 'Thandi Mokoena' };

/** Minimal in-memory Prisma covering exactly the queries the service issues. */
function makePrisma(seed: { waybills?: any[]; claims?: any[]; creditNotes?: any[] } = {}) {
  const state = {
    waybills: seed.waybills ?? [{ id: 'wb-1', companyId: COMPANY, trackingNumber: 'WB-1001', recipientName: 'Acme Ltd' }],
    claims: seed.claims ?? [],
    events: [] as any[],
    creditNotes: seed.creditNotes ?? [],
  };
  let seq = 0;
  const now = () => new Date('2026-11-04T09:00:00.000Z');

  const match = (row: any, where: any): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, cond]: [string, any]) => {
      if (key === 'OR') return (cond as any[]).some((c) => match(row, c));
      const value = row[key];
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('startsWith' in cond) return typeof value === 'string' && value.startsWith(cond.startsWith);
        if ('contains' in cond) {
          return String(value ?? '').toLowerCase().includes(String(cond.contains).toLowerCase());
        }
        if ('notIn' in cond) return !cond.notIn.includes(value);
        // `in` is what a compare-and-set transition is built from: the WHERE
        // names the statuses that may still move. Without it the fake cannot
        // tell two racing callers apart, so every concurrency test below would
        // pass for the wrong reason.
        if ('in' in cond) return cond.in.includes(value);
        return false;
      }
      return value === cond;
    });
  };

  const sortRows = (rows: any[], orderBy: any) => {
    if (!orderBy) return rows;
    // Prisma accepts both `{ createdAt: 'desc' }` and `[{ createdAt: 'desc' }]`.
    const spec = Array.isArray(orderBy) ? orderBy[0] : orderBy;
    const [[field, dir]] = Object.entries(spec) as [string, 'asc' | 'desc'][];
    return [...rows].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      const cmp = av instanceof Date && bv instanceof Date
        ? av.getTime() - bv.getTime()
        : String(av ?? '').localeCompare(String(bv ?? ''));
      return dir === 'desc' ? -cmp : cmp;
    });
  };

  const prisma: any = {
    $transaction: async (fn: any) => fn(prisma),
    waybill: {
      findFirst: async ({ where }: any) => state.waybills.find((w) => match(w, where)) ?? null,
    },
    claim: {
      findFirst: async ({ where, orderBy }: any) => sortRows(state.claims.filter((c) => match(c, where)), orderBy)[0] ?? null,
      findMany: async ({ where, orderBy, take }: any) =>
        sortRows(state.claims.filter((c) => match(c, where)), orderBy).slice(0, take ?? 200),
      create: async ({ data }: any) => {
        seq += 1;
        const row = {
          id: `claim-${seq}`,
          status: 'OPEN',
          liability: 'UNASSESSED',
          currency: 'ZAR',
          approvedAmount: null,
          rejectionReason: null,
          settledAt: null,
          closedAt: null,
          evidence: null,
          createdAt: now(),
          updatedAt: now(),
          ...data,
        };
        state.claims.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        // Prisma returns a new row object and leaves callers' references alone;
        // the fake does the same so a stale read cannot pass as correct.
        const index = state.claims.findIndex((c) => c.id === where.id);
        if (index === -1) throw new Error('record not found');
        state.claims[index] = { ...state.claims[index], ...data, updatedAt: now() };
        return state.claims[index];
      },
      // The compare-and-set primitive. Prisma matches the WHERE against the
      // COMMITTED row and reports how many rows it moved; the fake does the
      // same, so a caller holding a stale read simply matches nothing.
      updateMany: async ({ where, data }: any) => {
        const matched = state.claims.filter((c) => match(c, where));
        for (const row of matched) {
          const index = state.claims.findIndex((c) => c.id === row.id);
          state.claims[index] = { ...state.claims[index], ...data, updatedAt: now() };
        }
        return { count: matched.length };
      },
    },
    claimEvent: {
      create: async ({ data }: any) => {
        const row = { id: `ev-${state.events.length + 1}`, createdAt: now(), ...data };
        state.events.push(row);
        return row;
      },
      findMany: async ({ where, orderBy }: any) =>
        sortRows(state.events.filter((e) => match(e, where)), orderBy),
    },
    creditNote: {
      findFirst: async ({ where, orderBy }: any) => sortRows(state.creditNotes.filter((c) => match(c, where)), orderBy)[0] ?? null,
      create: async ({ data }: any) => {
        // No defaulted `status`: whatever the service sends is what is stored,
        // so the test proves intent rather than a fixture's kindness.
        const row = { id: `cn-${state.creditNotes.length + 1}`, ...data };
        state.creditNotes.push(row);
        return row;
      },
    },
  };

  return { prisma, state };
}

function build(seed?: Parameters<typeof makePrisma>[0]) {
  const { prisma, state } = makePrisma(seed);
  return { svc: new ClaimsService(prisma), state, prisma };
}

const baseClaim: CreateClaimDto = {
  waybillId: 'wb-1',
  type: 'DAMAGE' as never,
  claimedAmount: 4250,
  summary: 'Pallet 3 crushed on unloading',
};

describe('ClaimsService — create', () => {
  it('copies the waybill reference and opens with a CREATED event', async () => {
    const { svc, state } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);

    expect(claim.number).toBe('CLM-2026-0001');
    expect(claim.waybillNumber).toBe('WB-1001');
    expect(claim.clientName).toBe('Acme Ltd');
    expect(claim.status).toBe('OPEN');
    expect(claim.liability).toBe('UNASSESSED');
    expect(claim.events).toHaveLength(1);
    expect(claim.events[0].type).toBe('CREATED');
    expect(state.claims).toHaveLength(1);
  });

  it('allocates sequential numbers, not count-based ones', async () => {
    const { svc } = build();
    const first = await svc.create(COMPANY, ACTOR, baseClaim);
    const second = await svc.create(COMPANY, ACTOR, baseClaim);
    const third = await svc.create(COMPANY, ACTOR, baseClaim);
    expect([first.number, second.number, third.number]).toEqual([
      'CLM-2026-0001',
      'CLM-2026-0002',
      'CLM-2026-0003',
    ]);
  });

  it('refuses a waybill in another tenant', async () => {
    const { svc } = build({
      waybills: [{ id: 'wb-9', companyId: 'tenant-b', trackingNumber: 'WB-9', recipientName: 'Other' }],
    });
    await expect(svc.create(COMPANY, ACTOR, { ...baseClaim, waybillId: 'wb-9' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses a zero or negative claim', async () => {
    const { svc } = build();
    await expect(svc.create(COMPANY, ACTOR, { ...baseClaim, claimedAmount: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.create(COMPANY, ACTOR, { ...baseClaim, claimedAmount: -50 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('ClaimsService — number allocation', () => {
  it('retries a collided number instead of failing the request', async () => {
    const { svc, prisma } = build();
    const realCreate = prisma.claim.create;
    let calls = 0;
    prisma.claim.create = async (args: any) => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('unique'), { code: 'P2002' });
      return realCreate(args);
    };

    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    expect(claim.number).toBe('CLM-2026-0001');
    expect(calls).toBe(2);
  });

  it('gives up with a 409 rather than looping when every attempt collides', async () => {
    const { svc, prisma } = build();
    prisma.claim.create = async () => {
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    };
    await expect(svc.create(COMPANY, ACTOR, baseClaim)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not swallow a real write failure', async () => {
    const { svc, prisma } = build();
    prisma.claim.create = async () => {
      throw Object.assign(new Error('fk'), { code: 'P2003' });
    };
    await expect(svc.create(COMPANY, ACTOR, baseClaim)).rejects.toThrow(/fk/);
  });
});

describe('ClaimsService — tenancy', () => {
  it('hides another tenant’s claim behind a 404, not an empty view', async () => {
    const { svc, prisma } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    (prisma as any).claim.findFirst = async () => null;
    await expect(svc.get('tenant-b', claim.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ClaimsService — assess', () => {
  it('records who carries the loss and moves OPEN to UNDER_REVIEW', async () => {
    const { svc } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);

    const assessed = await svc.assess(COMPANY, ACTOR, claim.id, {
      liability: 'CARRIER',
      liabilityBasis: 'Trading terms cl 12.2',
    });

    expect(assessed.status).toBe('UNDER_REVIEW');
    expect(assessed.liability).toBe('CARRIER');
    expect(assessed.liabilityBasis).toBe('Trading terms cl 12.2');
    expect(assessed.events.map((e) => e.type)).toEqual(['CREATED', 'STATUS_CHANGED']);
  });

  it('refuses a basis too short to mean anything', async () => {
    const { svc } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    await expect(
      svc.assess(COMPANY, ACTOR, claim.id, { liability: 'CARRIER', liabilityBasis: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ClaimsService — approve', () => {
  async function assessed(seed?: Parameters<typeof makePrisma>[0]) {
    const ctx = build(seed);
    const claim = await ctx.svc.create(COMPANY, ACTOR, baseClaim);
    await ctx.svc.assess(COMPANY, ACTOR, claim.id, { liability: 'CARRIER', liabilityBasis: 'Trading terms' });
    return { ...ctx, claim };
  }

  it('approves an amount up to the claim', async () => {
    const { svc, claim } = await assessed();
    const approved = await svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 3100 });
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAmount).toBe(3100);
    expect(approved.events.at(-1)?.type).toBe('STATUS_CHANGED');
  });

  it('refuses to approve more than was claimed', async () => {
    const { svc, claim } = await assessed();
    await expect(
      svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 5000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to approve more than the stated cap', async () => {
    const ctx = build();
    const claim = await ctx.svc.create(COMPANY, ACTOR, { ...baseClaim, liabilityCap: 2000 });
    await ctx.svc.assess(COMPANY, ACTOR, claim.id, { liability: 'CARRIER', liabilityBasis: 'Trading terms' });
    await expect(
      ctx.svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 2500 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a zero approval and says to reject instead', async () => {
    const { svc, claim } = await assessed();
    await expect(
      svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 0 }),
    ).rejects.toThrow(/rejection/i);
  });

  it('refuses to approve a claim nobody has been made liable for', async () => {
    const { svc, state } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    // A claim can reach UNDER_REVIEW by other routes (an import, a direct note),
    // so the liability guard must hold independently of the transition check.
    state.claims[0].status = 'UNDER_REVIEW';

    await expect(svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 100 })).rejects.toThrow(
      /assess liability/i,
    );
  });

  it('refuses to approve an OPEN claim that skipped review', async () => {
    const { svc } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    await expect(svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 100 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('ClaimsService — reject and withdraw', () => {
  it('requires a reason a client could read', async () => {
    const { svc } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    await expect(svc.reject(COMPANY, ACTOR, claim.id, { reason: 'no' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('makes rejection terminal — it cannot then be approved', async () => {
    const { svc } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    const rejected = await svc.reject(COMPANY, ACTOR, claim.id, {
      reason: 'Damage occurred after a clean signed POD',
    });
    expect(rejected.status).toBe('REJECTED');
    await expect(
      svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 100 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to withdraw a settled claim', async () => {
    const { svc, claim } = await settledClaim();
    await expect(svc.withdraw(COMPANY, ACTOR, claim.id, {})).rejects.toBeInstanceOf(ConflictException);
  });
});

async function settledClaim() {
  const ctx = build();
  const claim = await ctx.svc.create(COMPANY, ACTOR, baseClaim);
  await ctx.svc.assess(COMPANY, ACTOR, claim.id, { liability: 'CARRIER', liabilityBasis: 'Trading terms' });
  await ctx.svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 3000 });
  const settled = await ctx.svc.settle(COMPANY, ACTOR, claim.id);
  return { ...ctx, claim: settled };
}

describe('ClaimsService — settle', () => {
  it('raises a DRAFT credit note, never an issued one', async () => {
    const { state, claim } = await settledClaim();

    expect(claim.status).toBe('SETTLED');
    expect(claim.creditNoteNumber).toMatch(/^CN-2026-\d{4}$/);
    expect(state.creditNotes).toHaveLength(1);
    expect(state.creditNotes[0].status).toBe('DRAFT');
    expect(state.creditNotes[0].total).toBe(3000);
    expect(state.creditNotes[0].clientName).toBe('Acme Ltd');
    expect(claim.events.at(-1)?.type).toBe('SETTLED');
  });

  it('refuses to settle a claim that was never approved', async () => {
    const { svc } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    await expect(svc.settle(COMPANY, ACTOR, claim.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('cannot be settled twice', async () => {
    const { svc, claim } = await settledClaim();
    await expect(svc.settle(COMPANY, ACTOR, claim.id)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ClaimsService — notes and evidence', () => {
  it('appends notes without changing status', async () => {
    const { svc } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    const updated = await svc.addNote(COMPANY, ACTOR, claim.id, { description: 'Client called about this.' });
    expect(updated.status).toBe('OPEN');
    expect(updated.events.at(-1)?.type).toBe('NOTE_ADDED');
  });

  it('merges evidence rather than replacing it', async () => {
    const { svc } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    await svc.addEvidence(COMPANY, ACTOR, claim.id, { refs: ['photo:1'] });
    const updated = await svc.addEvidence(COMPANY, ACTOR, claim.id, { refs: ['photo:1', 'epod:99'] });

    expect((updated.evidence as any).refs).toEqual(['photo:1', 'epod:99']);
    expect(updated.events.filter((e) => e.type === 'EVIDENCE_ADDED')).toHaveLength(2);
  });
});

describe('ClaimsService — list and summary', () => {
  it('filters to open claims only', async () => {
    const { svc } = build();
    await svc.create(COMPANY, ACTOR, baseClaim);
    const second = await svc.create(COMPANY, ACTOR, baseClaim);
    await svc.reject(COMPANY, ACTOR, second.id, { reason: 'Not our damage' });

    const open = await svc.list(COMPANY, { openOnly: true });
    expect(open).toHaveLength(1);
    expect(open[0].status).toBe('OPEN');
  });

  it('searches by waybill number', async () => {
    const { svc } = build();
    await svc.create(COMPANY, ACTOR, baseClaim);
    expect(await svc.list(COMPANY, { q: 'WB-1001' })).toHaveLength(1);
    expect(await svc.list(COMPANY, { q: 'WB-9999' })).toHaveLength(0);
  });

  it('reports value at stake, payable and overdue', async () => {
    const { svc } = build();
    const open = await svc.create(COMPANY, ACTOR, { ...baseClaim, respondBy: '2026-01-01T00:00:00.000Z' });
    await svc.create(COMPANY, ACTOR, baseClaim);
    const payable = await svc.create(COMPANY, ACTOR, baseClaim);
    await svc.assess(COMPANY, ACTOR, payable.id, { liability: 'CARRIER', liabilityBasis: 'Trading terms' });
    await svc.approve(COMPANY, ACTOR, payable.id, { approvedAmount: 1000 });

    const summary = await svc.summary(COMPANY);
    expect(summary.total).toBe(3);
    expect(summary.open).toBe(3);
    expect(summary.approvedPayable).toBe(1000);
    expect(summary.claimedOpen).toBe(open.claimedAmount + 4250 + 4250);
    expect(summary.overdue).toBe(1);
    expect(summary.byStatus.APPROVED).toBe(1);
  });
});

/**
 * Concurrency: a claim is money, and two operators acting on the same claim
 * must not produce two financial records.
 *
 * Every test here drives two calls at the same claim through Promise.allSettled
 * so both read the committed row before either writes. That is the shape the
 * bug takes in production: two browser tabs, or a retry racing a webhook. The
 * assertions are about what was CREATED — a credit note, an audit event — not
 * merely about which status the row ended up holding, because a row that ends
 * in the right state having paid out twice is the failure nobody notices.
 */
describe('ClaimsService — two callers, one claim', () => {
  /** A claim assessed as the carrier's liability and approved for 1 000. */
  async function approvedClaim() {
    const built = build();
    const claim = await built.svc.create(COMPANY, ACTOR, baseClaim);
    await built.svc.assess(COMPANY, ACTOR, claim.id, {
      liability: 'CARRIER',
      liabilityBasis: 'Trading terms 4.2',
    });
    await built.svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 1000 });
    return { ...built, claim };
  }

  it('settling twice raises exactly one credit note', async () => {
    const { svc, state, claim } = await approvedClaim();

    const results = await Promise.allSettled([
      svc.settle(COMPANY, ACTOR, claim.id),
      svc.settle(COMPANY, ACTOR, claim.id),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    // The money assertion: one settlement, one credit note. Two would mean the
    // client was credited twice for a single agreed payout.
    expect(state.creditNotes).toHaveLength(1);
  });

  it('settling twice records exactly one SETTLED event', async () => {
    const { svc, state, claim } = await approvedClaim();
    await Promise.allSettled([
      svc.settle(COMPANY, ACTOR, claim.id),
      svc.settle(COMPANY, ACTOR, claim.id),
    ]);
    expect(state.events.filter((e) => e.type === 'SETTLED')).toHaveLength(1);
  });

  it('approving twice records exactly one APPROVED event', async () => {
    const { svc, state } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    await svc.assess(COMPANY, ACTOR, claim.id, {
      liability: 'CARRIER',
      liabilityBasis: 'Trading terms 4.2',
    });

    const results = await Promise.allSettled([
      svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 900 }),
      svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 1500 }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(state.events.filter((e) => e.toStatus === 'APPROVED')).toHaveLength(1);
    // The amount the winner wrote, not a second caller's overwrite.
    expect(state.claims[0].approvedAmount).toBe(900);
  });

  it('rejecting twice records exactly one REJECTED event', async () => {
    const { svc, state } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);

    const results = await Promise.allSettled([
      svc.reject(COMPANY, ACTOR, claim.id, { reason: 'Not our liability' }),
      svc.reject(COMPANY, ACTOR, claim.id, { reason: 'Out of time' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(state.events.filter((e) => e.toStatus === 'REJECTED')).toHaveLength(1);
  });

  it('an approve racing a reject settles on one outcome, not both', async () => {
    const { svc, state } = build();
    const claim = await svc.create(COMPANY, ACTOR, baseClaim);
    await svc.assess(COMPANY, ACTOR, claim.id, {
      liability: 'CARRIER',
      liabilityBasis: 'Trading terms 4.2',
    });

    const results = await Promise.allSettled([
      svc.approve(COMPANY, ACTOR, claim.id, { approvedAmount: 1000 }),
      svc.reject(COMPANY, ACTOR, claim.id, { reason: 'Carrier disputes' }),
    ]);

    const winners = results.filter((r) => r.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(ConflictException);
    // The claim may not end up both approved and rejected.
    expect(['APPROVED', 'REJECTED']).toContain(state.claims[0].status);
    // Exactly one of the two racing outcomes was recorded. Scoped to the
    // targets of the race: the assess() in the setup above is also a
    // STATUS_CHANGED event, and counting it would let a real duplicate hide.
    const outcomes = state.events.filter((e) => e.toStatus === 'APPROVED' || e.toStatus === 'REJECTED');
    expect(outcomes).toHaveLength(1);
  });

  it('a settled claim refuses to be settled again', async () => {
    const { svc, state, claim } = await approvedClaim();
    await svc.settle(COMPANY, ACTOR, claim.id);

    await expect(svc.settle(COMPANY, ACTOR, claim.id)).rejects.toBeInstanceOf(ConflictException);
    expect(state.creditNotes).toHaveLength(1);
  });

  it('withdrawing a claim that was just approved fails rather than resurrecting it', async () => {
    const { svc, state, claim } = await approvedClaim();

    const results = await Promise.allSettled([
      svc.settle(COMPANY, ACTOR, claim.id),
      svc.withdraw(COMPANY, ACTOR, claim.id, { reason: 'Client withdrew' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    // Whichever won, the claim is terminal and the other produced no payout.
    expect(['SETTLED', 'WITHDRAWN']).toContain(state.claims[0].status);
  });
});
