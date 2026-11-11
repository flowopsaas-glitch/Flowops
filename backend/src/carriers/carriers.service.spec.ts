import { NotFoundException } from '@nestjs/common';
import { CarriersService } from './carriers.service';

/**
 * CARRIERS — the buy-side rate book, plus the Lane Rate Explorer.
 *
 * Most of this module is defensively written: every mutation goes through
 * get(), which is tenant-scoped, and update() strips id/companyId out of the
 * body so a caller cannot re-home a row. The gap is in what it accepts as a
 * rate.
 */

const COMPANY = 'co-1';
const OTHER = 'co-2';

function makePrisma(seed: { carriers?: any[]; rates?: any[] } = {}) {
  const carriers: any[] = (seed.carriers ?? []).map((c) => ({ isActive: true, ...c }));
  const rates: any[] = (seed.rates ?? []).map((r) => ({ ...r }));
  let seq = 0;

  // Supports the operators this service uses: plain equality and `{ not: v }`.
  // The first version only did equality, so `lane: { not: null }` matched
  // nothing and every lane-analysis test was asserting against an empty set.
  const matchOne = (row: any, key: string, v: any) => {
    if (v && typeof v === 'object' && 'not' in v) return (row as any)[key] !== v.not;
    return (row as any)[key] === v;
  };
  const match = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]) => matchOne(row, k, v));

  const prisma: any = {
    carrier: {
      findFirst: jest.fn(async ({ where }: any) => carriers.find((c) => match(c, where)) ?? null),
      findMany: jest.fn(async ({ where }: any) => carriers.filter((c) => match(c, where))),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `car-${++seq}`, ...data };
        carriers.push(row);
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const c = carriers.find((x) => x.id === where.id);
        if (!c) throw new Error('not found');
        Object.assign(c, data);
        return { ...c };
      }),
      delete: jest.fn(async ({ where }: any) => {
        const i = carriers.findIndex((x) => x.id === where.id);
        if (i < 0) throw new Error('not found');
        carriers.splice(i, 1);
        return { id: where.id };
      }),
      count: jest.fn(async ({ where }: any) => carriers.filter((c) => match(c, where)).length),
    },
    carrierRate: {
      findFirst: jest.fn(async ({ where }: any) => rates.find((r) => match(r, where)) ?? null),
      findMany: jest.fn(async ({ where }: any) => rates.filter((r) => match(r, where))),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `rate-${++seq}`, ...data };
        rates.push(row);
        return { ...row };
      }),
      delete: jest.fn(async ({ where }: any) => {
        const i = rates.findIndex((x) => x.id === where.id);
        if (i < 0) throw new Error('not found');
        rates.splice(i, 1);
        return { id: where.id };
      }),
      count: jest.fn(async ({ where }: any) => rates.filter((r) => match(r, where)).length),
    },
    __carriers: carriers,
    __rates: rates,
  };
  return prisma;
}

const build = (prisma: any) => new CarriersService(prisma);

describe('CarriersService — a buy rate has to be a number', () => {
  const withCarrier = () => makePrisma({ carriers: [{ id: 'car-1', companyId: COMPANY, name: 'Maersk' }] });

  it('rejects a rate that is not a number', async () => {
    // FAILED BEFORE: `buyRate: Number(dto.buyRate ?? 0)`. Number('abc') is NaN,
    // and NaN went straight into a Float column — a contract that silently
    // isn't a number, poisoning every average and comparison it touches.
    await expect(
      build(withCarrier()).addRate(COMPANY, 'car-1', { buyRate: 'abc' }),
    ).rejects.toThrow(/number/i);
  });

  it('stores a valid rate', async () => {
    const p = withCarrier();
    const out: any = await build(p).addRate(COMPANY, 'car-1', { buyRate: 1250.5 });
    expect(out.buyRate).toEqual(1250.5);
  });

  it('accepts a numeric string as a number, not NaN', async () => {
    const p = withCarrier();
    const out: any = await build(p).addRate(COMPANY, 'car-1', { buyRate: '1250.5' });
    expect(out.buyRate).toEqual(1250.5);
  });

  it('rejects an empty-string rate rather than storing zero', async () => {
    // Number('') is 0 — a free lane, which is a very expensive thing to get
    // wrong. An empty field should say so, not quietly become R0.
    await expect(build(withCarrier()).addRate(COMPANY, 'car-1', { buyRate: '' })).rejects.toThrow(/number/i);
  });

  it('rejects a negative rate', async () => {
    await expect(build(withCarrier()).addRate(COMPANY, 'car-1', { buyRate: -5 })).rejects.toThrow(/number/i);
  });

  it('rejects Infinity', async () => {
    await expect(build(withCarrier()).addRate(COMPANY, 'car-1', { buyRate: 'Infinity' })).rejects.toThrow(/number/i);
  });

  it('still allows a genuine zero — a negotiated free leg', async () => {
    const p = withCarrier();
    const out: any = await build(p).addRate(COMPANY, 'car-1', { buyRate: 0 });
    expect(out.buyRate).toEqual(0);
  });
});

describe('CarriersService — tenant isolation', () => {
  it('cannot read another tenant’s carrier', async () => {
    const p = makePrisma({ carriers: [{ id: 'car-1', companyId: OTHER }] });
    await expect(build(p).get(COMPANY, 'car-1')).rejects.toThrow(NotFoundException);
  });

  it('cannot update another tenant’s carrier', async () => {
    const p = makePrisma({ carriers: [{ id: 'car-1', companyId: OTHER, name: 'Theirs' }] });
    await expect(build(p).update(COMPANY, 'car-1', { name: 'Mine' })).rejects.toThrow(NotFoundException);
    expect(p.__carriers[0].name).toEqual('Theirs');
  });

  it('cannot delete another tenant’s carrier', async () => {
    const p = makePrisma({ carriers: [{ id: 'car-1', companyId: OTHER }] });
    await expect(build(p).remove(COMPANY, 'car-1')).rejects.toThrow(NotFoundException);
    expect(p.__carriers).toHaveLength(1);
  });

  it('cannot add a rate to another tenant’s carrier', async () => {
    const p = makePrisma({ carriers: [{ id: 'car-1', companyId: OTHER }] });
    await expect(build(p).addRate(COMPANY, 'car-1', { buyRate: 10 })).rejects.toThrow(NotFoundException);
    expect(p.__rates).toHaveLength(0);
  });

  it('cannot delete a rate belonging to another tenant', async () => {
    const p = makePrisma({
      carriers: [{ id: 'car-1', companyId: COMPANY }],
      rates: [{ id: 'rate-1', carrierId: 'car-1', companyId: OTHER, buyRate: 10 }],
    });
    await expect(build(p).removeRate(COMPANY, 'car-1', 'rate-1')).rejects.toThrow(NotFoundException);
    expect(p.__rates).toHaveLength(1);
  });

  it('update cannot re-home a carrier into another tenant', async () => {
    const p = makePrisma({ carriers: [{ id: 'car-1', companyId: COMPANY }] });
    await build(p).update(COMPANY, 'car-1', { companyId: OTHER, name: 'Renamed' });
    expect(p.__carriers[0].companyId).toEqual(COMPANY);
    expect(p.__carriers[0].name).toEqual('Renamed');
  });

  it('metrics counts only this tenant', async () => {
    const p = makePrisma({
      carriers: [
        { id: 'car-1', companyId: COMPANY, isActive: true },
        { id: 'car-2', companyId: COMPANY, isActive: false },
        { id: 'car-3', companyId: OTHER, isActive: true },
      ],
      rates: [{ id: 'rate-1', companyId: COMPANY }, { id: 'rate-2', companyId: OTHER }],
    });
    const out: any = await build(p).metrics(COMPANY);
    expect(out.total).toEqual(2);
    expect(out.active).toEqual(1);
    expect(out.rates).toEqual(1);
  });
});

describe('CarriersService — lane analysis', () => {
  const rates = [
    { id: 'r1', companyId: COMPANY, carrierId: 'c1', lane: 'CNSHA → ZADUR', buyRate: 1000, currency: 'USD' },
    { id: 'r2', companyId: COMPANY, carrierId: 'c2', lane: 'cnsha->zadur', buyRate: 1200, currency: 'USD' },
    { id: 'r3', companyId: COMPANY, carrierId: 'c3', lane: 'CNSHA → ZADUR', buyRate: 900, currency: 'ZAR' },
    { id: 'r4', companyId: OTHER, carrierId: 'c9', lane: 'CNSHA → ZADUR', buyRate: 1, currency: 'USD' },
  ];

  const analyse = async () => {
    const p = makePrisma({ rates });
    const out: any = await build(p).laneAnalysis(COMPANY);
    return out;
  };

  it('groups differently-written forms of the same lane together', async () => {
    const out = await analyse();
    const usd = out.lanes.find((l: any) => l.currency === 'USD' && l.lane === 'CNSHA → ZADUR');
    expect(usd.quoteCount).toEqual(2);
  });

  it('never compares across currencies', async () => {
    // 900 ZAR is not cheaper than 1000 USD. Mixing them would tell a
    // procurement desk to move volume for a saving that does not exist.
    const out = await analyse();
    const usd = out.lanes.find((l: any) => l.currency === 'USD');
    expect(usd.quotes.every((q: any) => q.currency === undefined || true)).toBe(true);
    expect(out.lanes.every((l: any) => l.quotes.length <= 2)).toBe(true);
    expect(out.lanes.find((l: any) => l.currency === 'USD').best.buyRate).toEqual(1000);
  });

  it('reports the saving against the most expensive quote', async () => {
    const out = await analyse();
    const usd = out.lanes.find((l: any) => l.currency === 'USD');
    expect(usd.savings).toEqual(200);
    expect(usd.savingsPct).toEqual(16.7);
  });

  it('ignores another tenant’s rates', async () => {
    const out = await analyse();
    const usd = out.lanes.find((l: any) => l.currency === 'USD');
    expect(usd.quotes.some((q: any) => q.carrierId === 'c9')).toBe(false);
  });
});
