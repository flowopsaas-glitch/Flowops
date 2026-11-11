import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RouteOptimizationService } from './route-optimization.service';

/**
 * ROUTE OPTIMIZATION — plan a day's drops across vehicles, optionally via Groq.
 *
 * The service already fetches the deliveries and drivers tenant-scoped. The
 * gap is what comes back: the model returns a list of stops, and each stop's
 * waybillId is written into a delivery allocation without ever being checked
 * against the list that was fetched. A model is a third party that can
 * hallucinate an id — and an id it invents might belong to someone else.
 */

const COMPANY = 'co-1';
const OTHER = 'co-2';

function makeHarness(opts: { groq?: (body: any) => any; waybills?: any[]; drivers?: any[] } = {}) {
  const waybills = opts.waybills ?? [
    { id: 'wb-1', recipientAddress: '1 Main Rd', recipientLat: -26.2, recipientLng: 28.0 },
  ];
  const drivers = opts.drivers ?? [{ id: 'drv-1', name: 'Sipho', vehicleType: 'VAN' }];

  const optimizations: any[] = [];
  const allocations: any[] = [];
  let seq = 0;

  const routeOptimization = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `opt-${++seq}`, ...data };
      optimizations.push(row);
      return { ...row };
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      const { id, companyId } = where;
      return optimizations.find((o) => o.id === id && (companyId ? o.companyId === companyId : true)) ?? null;
    }),
    findMany: jest.fn(async ({ where }: any) =>
      optimizations.filter((o) => where.companyId === undefined || o.companyId === where.companyId),
    ),
    findUnique: jest.fn(async ({ where }: any) => optimizations.find((o) => o.id === where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => {
      const o = optimizations.find((x) => x.id === where.id);
      if (!o) throw new Error('not found');
      Object.assign(o, data);
      return { ...o };
    }),
  };

  const prisma: any = {
    routeOptimization,
    waybill: {
      findMany: jest.fn(async ({ where }: any) =>
        waybills.filter((w) => (where.id?.in ?? []).includes(w.id)),
      ),
    },
    driver: {
      findMany: jest.fn(async ({ where }: any) => drivers.filter((d) => (where.id?.in ?? []).includes(d.id))),
    },
    deliveryAllocation: {
      create: jest.fn(async ({ data }: any) => {
        allocations.push(data);
        return { ...data };
      }),
    },
    $transaction: jest.fn(async (ops: any[]) => {
      const out = [];
      for (const op of ops) out.push(await op);
      return out;
    }),
    __optimizations: optimizations,
    __allocations: allocations,
  };

  const config: any = {
    get: jest.fn((k: string) => (k === 'GROQ_API_KEY' ? 'test-key' : undefined)),
  };

  if (opts.groq) {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(opts.groq!({})) } }] }),
    }));
  } else {
    (global as any).fetch = jest.fn(async () => {
      throw new Error('Groq should not be called');
    });
  }

  return { prisma, config, waybills, drivers, svc: new RouteOptimizationService(prisma, config) };
}

const dto = (over: any = {}) =>
  ({ name: 'Plan', deliveryIds: ['wb-1'], vehicleIds: ['drv-1'], ...over }) as any;

/** Run create() and let the fire-and-forget optimization settle. */
const createAndSettle = async (h: any, body: any = {}) => {
  const out = await h.svc.create(COMPANY, dto(body));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return out;
};

describe('RouteOptimizationService — only this tenant’s waybills get allocated', () => {
  it('allocates the deliveries it was asked to plan', async () => {
    const h = makeHarness({ groq: () => ({ routes: [{ driverId: 'drv-1', stops: [{ waybillId: 'wb-1' }] }] }) });
    await createAndSettle(h);
    expect(h.prisma.__allocations.map((a: any) => a.waybillId)).toEqual(['wb-1']);
  });

  it('drops a waybill the model invented that is not in this company', async () => {
    // FAILED BEFORE: `waybillId: stop.waybillId` straight from the model. The
    // waybills were fetched tenant-scoped, and then never consulted — so an id
    // the model hallucinated, or one belonging to another tenant, was written
    // into a delivery allocation stamped with this company's id. Downstream,
    // that reads as another company's parcel being part of this company's run.
    const h = makeHarness({
      groq: () => ({ routes: [{ driverId: 'drv-1', stops: [{ waybillId: 'wb-1' }, { waybillId: 'wb-foreign' }] }] }),
    });
    await createAndSettle(h);
    expect(h.prisma.__allocations.map((a: any) => a.waybillId)).toEqual(['wb-1']);
  });

  it('stamps every allocation with the tenant, never the model', async () => {
    const h = makeHarness({ groq: () => ({ routes: [{ driverId: 'drv-1', stops: [{ waybillId: 'wb-1' }] }] }) });
    await createAndSettle(h);
    expect(h.prisma.__allocations.every((a: any) => a.companyId === COMPANY)).toBe(true);
  });

  it('does not allocate a duplicate stop for the same waybill twice', async () => {
    const h = makeHarness({
      groq: () => ({ routes: [{ driverId: 'drv-1', stops: [{ waybillId: 'wb-1' }, { waybillId: 'wb-1' }] }] }),
    });
    await createAndSettle(h);
    expect(h.prisma.__allocations).toHaveLength(1);
  });

  it('completes even when the model returns nothing usable', async () => {
    const h = makeHarness({ groq: () => ({ routes: 'not-an-array' }) });
    await createAndSettle(h);
    expect(h.prisma.__optimizations[0].status).toEqual('COMPLETED');
    expect(h.prisma.__allocations).toHaveLength(0);
  });

  it('marks the run failed if the model call blows up', async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new Error('groq down');
    });
    const h = makeHarness({ groq: () => ({}) });
    await createAndSettle(h);
    expect(['FAILED', 'COMPLETED']).toContain(h.prisma.__optimizations[0].status);
  });
});

describe('RouteOptimizationService — input and tenant scoping', () => {
  it('refuses a plan with no deliveries', async () => {
    await expect(makeHarness().svc.create(COMPANY, dto({ deliveryIds: [] }))).rejects.toThrow(BadRequestException);
  });

  it('refuses a plan with no vehicles', async () => {
    await expect(makeHarness().svc.create(COMPANY, dto({ vehicleIds: [] }))).rejects.toThrow(BadRequestException);
  });

  it('findOne cannot read another tenant’s plan', async () => {
    const h = makeHarness();
    await h.svc.create(OTHER, dto());
    const id = h.prisma.__optimizations[0].id;
    await expect(h.svc.findOne(id, COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('getInsights cannot read another tenant’s plan', async () => {
    const h = makeHarness();
    await h.svc.create(OTHER, dto());
    const id = h.prisma.__optimizations[0].id;
    await expect(h.svc.getInsights(id, COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('findAll returns only this tenant’s plans', async () => {
    const h = makeHarness();
    await h.svc.create(COMPANY, dto());
    await h.svc.create(OTHER, dto());
    const out = await h.svc.findAll(COMPANY);
    expect(out.every((o: any) => o.companyId === COMPANY)).toBe(true);
    expect(out).toHaveLength(1);
  });
});
