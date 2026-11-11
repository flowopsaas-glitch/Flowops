import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RateCardsService } from './rate-cards.service';

/**
 * RATE CARDS — per-tenant pricing bands.
 *
 * Two things were wrong in `calculate`: it filtered on `minWeight <= weight`
 * with no upper bound at all, and it took `cards[0]` with no ordering, so which
 * card won was up to the database. Together that meant a heavy consignment
 * could be priced off a small-parcel card.
 *
 * The rest of the module was already right — allowlisted writes and
 * tenant-scoped updateMany/deleteMany rather than read-then-write.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';

/**
 * Prisma semantics the fake has to honour: an undefined term is absent, `lte`
 * is false against null, and OR/AND nest. Getting any of this wrong turns the
 * fake into a stricter oracle than the real client and hides the bug.
 */
const matches = (row: any, where: any): boolean => {
  for (const [k, v] of Object.entries(where ?? {})) {
    if (v === undefined) continue;
    if (k === 'OR') {
      if (!(v as any[]).some((w) => matches(row, w))) return false;
      continue;
    }
    if (k === 'AND') {
      if (!(v as any[]).every((w) => matches(row, w))) return false;
      continue;
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      for (const [op, operand] of Object.entries(v as any)) {
        const rv = row[k];
        const ok =
          op === 'lte' ? rv != null && rv <= (operand as number) :
          op === 'gte' ? rv != null && rv >= (operand as number) :
          op === 'lt' ? rv != null && rv < (operand as number) :
          op === 'gt' ? rv != null && rv > (operand as number) :
          true;
        if (!ok) return false;
      }
      continue;
    }
    if (row[k] !== v) return false;
  }
  return true;
};

function makeHarness() {
  const cards: any[] = [];
  let seq = 0;

  const rateCard = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `rc-${++seq}`, isActive: true, currency: 'ZAR', pricePerKg: 0, ...data };
      cards.push(row);
      return { ...row };
    }),
    findMany: jest.fn(async ({ where }: any) => cards.filter((c) => matches(c, where))),
    findFirst: jest.fn(async ({ where }: any) => cards.find((c) => matches(c, where)) ?? null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = cards.filter((x) => matches(x, where));
      hit.forEach((c) => Object.assign(c, data));
      return { count: hit.length };
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const hit = cards.filter((x) => matches(x, where));
      hit.forEach((c) => cards.splice(cards.indexOf(c), 1));
      return { count: hit.length };
    }),
  };

  const prisma: any = { rateCard, __cards: cards };
  return { prisma, svc: new RateCardsService(prisma) };
}

const seedCard = (h: any, over: any = {}) => {
  const row = {
    id: `rc-${h.prisma.__cards.length + 1}`, companyId: COMPANY, name: 'Standard',
    minWeight: null, maxWeight: null, basePrice: 100, pricePerKg: 10, isActive: true, ...over,
  };
  h.prisma.__cards.push(row);
  return row;
};

describe('RateCardsService — tenant scoping', () => {
  it('stamps the caller’s company on create', async () => {
    const h = makeHarness();
    const out = await h.svc.create(COMPANY, { name: 'Standard', basePrice: 50 });
    expect(out.companyId).toEqual(COMPANY);
  });

  it('drops fields outside the allowlist on create', async () => {
    const h = makeHarness();
    await h.svc.create(COMPANY, { name: 'Standard', basePrice: 50, id: 'x', companyId: VICTIM } as any);
    expect(h.prisma.__cards[0].id).not.toEqual('x');
    expect(h.prisma.__cards[0].companyId).toEqual(COMPANY);
  });

  it('cannot update another tenant’s card', async () => {
    const h = makeHarness();
    seedCard(h, { companyId: VICTIM, basePrice: 100 });
    await expect(h.svc.update('rc-1', COMPANY, { basePrice: 1 })).rejects.toThrow(NotFoundException);
    expect(h.prisma.__cards[0].basePrice).toEqual(100);
  });

  it('cannot delete another tenant’s card', async () => {
    const h = makeHarness();
    seedCard(h, { companyId: VICTIM });
    await expect(h.svc.remove('rc-1', COMPANY)).rejects.toThrow(NotFoundException);
    expect(h.prisma.__cards).toHaveLength(1);
  });

  it('calculates using only the caller’s cards', async () => {
    const h = makeHarness();
    seedCard(h, { id: 'mine', basePrice: 100, pricePerKg: 1 });
    seedCard(h, { id: 'theirs', companyId: VICTIM, basePrice: 1, pricePerKg: 0 });

    const out: any = await h.svc.calculate(COMPANY, { weight: 10 });

    expect(out.rateCardId).toEqual('mine');
  });
});

describe('RateCardsService — the weight band', () => {
  it('prices a weight inside the band', async () => {
    const h = makeHarness();
    seedCard(h, { id: 'rc-1', minWeight: 1, maxWeight: 10, basePrice: 100, pricePerKg: 2 });

    const out: any = await h.svc.calculate(COMPANY, { weight: 5 });

    expect(out.price).toEqual(110);
    expect(out.rateCardId).toEqual('rc-1');
  });

  it('does not use a card whose ceiling is below the weight', async () => {
    // FAILED BEFORE: only `minWeight <= weight` was checked, so this 0-5 kg
    // parcel card happily priced a 500 kg consignment.
    const h = makeHarness();
    seedCard(h, { id: 'small', name: 'Small parcel', minWeight: 0, maxWeight: 5, basePrice: 20, pricePerKg: 0 });

    const out: any = await h.svc.calculate(COMPANY, { weight: 500 });

    expect(out.rateCardId).toBeNull();
    expect(out.price).toEqual(0);
  });

  it('does not use a card whose floor is above the weight', async () => {
    const h = makeHarness();
    seedCard(h, { id: 'bulk', minWeight: 1000, maxWeight: 5000, basePrice: 1 });

    const out: any = await h.svc.calculate(COMPANY, { weight: 10 });

    expect(out.rateCardId).toBeNull();
  });

  it('treats a null ceiling as open-ended', async () => {
    const h = makeHarness();
    seedCard(h, { id: 'open', minWeight: 100, maxWeight: null, basePrice: 500, pricePerKg: 1 });

    const out: any = await h.svc.calculate(COMPANY, { weight: 100000 });

    expect(out.rateCardId).toEqual('open');
  });

  it('prefers the narrowest band when cards overlap', async () => {
    const h = makeHarness();
    seedCard(h, { id: 'catchall', name: 'Catch all', minWeight: 0, maxWeight: 1000, basePrice: 10 });
    seedCard(h, { id: 'mid', name: 'Mid band', minWeight: 10, maxWeight: 50, basePrice: 200 });

    const out: any = await h.svc.calculate(COMPANY, { weight: 20 });

    expect(out.rateCardId).toEqual('mid');
  });

  it('is deterministic when two cards are equally specific', async () => {
    const h = makeHarness();
    seedCard(h, { id: 'b', name: 'Bravo', minWeight: 0, maxWeight: 10, basePrice: 1 });
    seedCard(h, { id: 'a', name: 'Alpha', minWeight: 0, maxWeight: 10, basePrice: 2 });

    const out: any = await h.svc.calculate(COMPANY, { weight: 5 });

    expect(out.rateCardId).toEqual('a');
  });
});

describe('RateCardsService — the weight argument', () => {
  it.each([undefined, null, '', 'abc', -1, NaN])('rejects %p', async (weight) => {
    // FAILED BEFORE: undefined reached Prisma as `lte: undefined`, which Prisma
    // drops — leaving "every active card" and pricing off whichever came first.
    const h = makeHarness();
    seedCard(h, { id: 'rc-1' });
    await expect(h.svc.calculate(COMPANY, { weight } as any)).rejects.toThrow(BadRequestException);
  });

  it('accepts a numeric string', async () => {
    const h = makeHarness();
    seedCard(h, { id: 'rc-1', minWeight: 1, maxWeight: 10, basePrice: 100, pricePerKg: 0 });

    const out: any = await h.svc.calculate(COMPANY, { weight: '5' as any });

    expect(out.rateCardId).toEqual('rc-1');
  });

  it('accepts a weight of zero', async () => {
    const h = makeHarness();
    seedCard(h, { id: 'rc-1', minWeight: 0, maxWeight: 10, basePrice: 7, pricePerKg: 0 });

    const out: any = await h.svc.calculate(COMPANY, { weight: 0 });

    expect(out.price).toEqual(7);
  });
});
