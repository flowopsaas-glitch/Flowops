import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuotesService } from './quotes.service';

/**
 * QUOTES — customer-facing prices.
 *
 * Tenant scoping was already right: `accept` uses updateMany({id, companyId})
 * rather than read-then-write, and every read filters on companyId. `create`
 * names its fields and sets companyId, so no mass assignment.
 *
 * The defect was in the money. `weight` arrived on an untyped body and was used
 * two different ways in the same calculation, so the breakdown a customer is
 * shown as the explanation of their price did not add up.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';

const matches = (row: any, where: any) =>
  Object.entries(where ?? {}).every(([k, v]) => (v === undefined ? true : row[k] === v));

function makeHarness() {
  const quotes: any[] = [];
  let seq = 0;

  const quote = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `q-${++seq}`, accepted: false, createdAt: new Date(), ...data };
      quotes.push(row);
      return { ...row };
    }),
    findMany: jest.fn(async ({ where }: any) => quotes.filter((q) => matches(q, where))),
    findFirst: jest.fn(async ({ where }: any) => quotes.find((q) => matches(q, where)) ?? null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = quotes.filter((q) => matches(q, where));
      hit.forEach((q) => Object.assign(q, data));
      return { count: hit.length };
    }),
  };

  const prisma: any = { quote, __quotes: quotes };
  return { prisma, svc: new QuotesService(prisma) };
}

const seedQuote = (h: any, over: any = {}) => {
  const row = {
    id: 'q-1', companyId: COMPANY, price: 155, weight: 5, accepted: false,
    expiresAt: new Date(Date.now() + 86_400_000), ...over,
  };
  h.prisma.__quotes.push(row);
  return row;
};

const newQuote = (over: any = {}) => ({
  fromAddress: '1 Main Rd, Johannesburg',
  toAddress: '42 Beach Rd, Cape Town',
  weight: 5,
  ...over,
});

describe('QuotesService — tenant scoping', () => {
  it('stamps the caller’s company on create', async () => {
    const h = makeHarness();
    const out = await h.svc.create(COMPANY, newQuote());
    expect(out.companyId).toEqual(COMPANY);
  });

  it('lists only the caller’s quotes', async () => {
    const h = makeHarness();
    seedQuote(h, { id: 'a', companyId: COMPANY });
    seedQuote(h, { id: 'b', companyId: VICTIM });
    expect((await h.svc.findAll(COMPANY)).map((q: any) => q.id)).toEqual(['a']);
  });

  it('cannot accept another tenant’s quote', async () => {
    const h = makeHarness();
    seedQuote(h, { companyId: VICTIM });
    await expect(h.svc.accept('q-1', COMPANY)).rejects.toThrow(NotFoundException);
    expect(h.prisma.__quotes[0].accepted).toBe(false);
  });

  it('accepts its own quote', async () => {
    const h = makeHarness();
    seedQuote(h);
    const out: any = await h.svc.accept('q-1', COMPANY);
    expect(out.accepted).toBe(true);
  });

  it('metrics only aggregates the caller’s quotes', async () => {
    const h = makeHarness();
    seedQuote(h, { id: 'a', companyId: COMPANY, price: 100, accepted: true });
    seedQuote(h, { id: 'b', companyId: VICTIM, price: 9999, accepted: true });

    const out: any = await h.svc.metrics(COMPANY);

    expect(out.total).toEqual(1);
    expect(out.wonValue).toEqual(100);
  });
});

describe('QuotesService — the price and its breakdown', () => {
  it('prices at base plus per-kilo', async () => {
    const h = makeHarness();
    const out: any = await h.svc.create(COMPANY, newQuote({ weight: 5 }));
    expect(out.price).toEqual(80 + 15 * 5);
  });

  it('produces a breakdown that adds up to its own total', async () => {
    // FAILED BEFORE: `price` used `dto.weight || 1` but the breakdown used the
    // bare `dto.weight`. At weight 0 that emitted { base: 80, perKg: 0,
    // total: 95 } — the explanation shown to the customer contradicted the
    // price it was explaining.
    const h = makeHarness();
    const out: any = await h.svc.create(COMPANY, newQuote({ weight: 0 }));

    expect(out.breakdown).toEqual({ base: 80, perKg: 0, total: 80 });
    expect(out.breakdown.base + out.breakdown.perKg).toEqual(out.breakdown.total);
    expect(out.breakdown.total).toEqual(out.price);
  });

  it('keeps the breakdown consistent at every weight', async () => {
    const h = makeHarness();
    for (const weight of [0, 1, 5, 250]) {
      const out: any = await h.svc.create(COMPANY, newQuote({ weight }));
      expect(out.breakdown.base + out.breakdown.perKg).toEqual(out.breakdown.total);
      expect(out.breakdown.total).toEqual(out.price);
    }
  });

  it('stores the validated weight, not a defaulted one', async () => {
    const h = makeHarness();
    const out: any = await h.svc.create(COMPANY, newQuote({ weight: 0 }));
    expect(out.weight).toEqual(0);
  });
});

describe('QuotesService — the weight argument', () => {
  it.each([-1, -100, 'abc', NaN, undefined, null])('rejects %p', async (weight) => {
    // FAILED BEFORE: -100 kg produced a quote of -R1420.
    const h = makeHarness();
    await expect(h.svc.create(COMPANY, newQuote({ weight } as any))).rejects.toThrow(
      BadRequestException,
    );
    expect(h.prisma.__quotes).toHaveLength(0);
  });

  it('accepts a numeric string', async () => {
    const h = makeHarness();
    const out: any = await h.svc.create(COMPANY, newQuote({ weight: '5' as any }));
    expect(out.price).toEqual(155);
  });
});

describe('QuotesService — metrics', () => {
  it('measures win rate over decided quotes only', async () => {
    const h = makeHarness();
    seedQuote(h, { id: 'won', price: 100, accepted: true });
    seedQuote(h, { id: 'lost', price: 100, accepted: false, expiresAt: new Date(Date.now() - 1000) });
    seedQuote(h, { id: 'open', price: 100, accepted: false, expiresAt: new Date(Date.now() + 86_400_000) });

    const out: any = await h.svc.metrics(COMPANY);

    expect(out.accepted).toEqual(1);
    expect(out.expired).toEqual(1);
    expect(out.pending).toEqual(1);
    expect(out.winRatePct).toEqual(50);   // 1 of 2 decided — pipeline excluded
    expect(out.acceptRatePct).toEqual(33.3); // 1 of 3 total
  });

  it('reports zero rather than NaN when nothing is decided', async () => {
    const h = makeHarness();
    seedQuote(h, { id: 'open', accepted: false, expiresAt: new Date(Date.now() + 86_400_000) });

    const out: any = await h.svc.metrics(COMPANY);

    expect(out.winRatePct).toEqual(0);
    expect(out.avgWonValue).toEqual(0);
  });
});
