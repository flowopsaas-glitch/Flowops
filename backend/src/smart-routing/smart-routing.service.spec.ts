import { BadRequestException, ConflictException } from '@nestjs/common';
import { SmartRoutingService } from './smart-routing.service';

/**
 * SMART ROUTING — route plan state transitions.
 *
 * A paid feature with no tests. The three lifecycle methods (activate, complete,
 * cancel) all read the status, decide in application code, then write keyed on id
 * alone. That is the exact shape `claimTransition` exists to prevent, and it is
 * documented at length in src/common/state-transition.ts: two callers read the
 * same committed row, both pass the check, and the second write lands as though
 * the first never happened.
 *
 * The plan is small here, but a route plan drives what a driver is told to do.
 */

const COMPANY = 'co-1';

function makePrisma() {
  const plans: any[] = [];
  const tenants: string[] = [];
  const txLog: string[][] = [];

  const match = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('not' in v) return (row as any)[k] !== v.not;
        if ('in' in v) return (v.in as any[]).includes((row as any)[k]);
      }
      return (row as any)[k] === v;
    });

  const model = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `plan-${plans.length + 1}`, createdAt: new Date(), ...data };
      plans.push(row);
      return { ...row };
    }),
    findFirst: jest.fn(async ({ where }: any) => plans.find((p) => match(p, where)) ?? null),
    findMany: jest.fn(async () => plans.map((p) => ({ ...p }))),
    update: jest.fn(async ({ where, data }: any) => {
      const row = plans.find((p) => p.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let n = 0;
      for (const p of plans) {
        if (match(p, where)) {
          Object.assign(p, data);
          n += 1;
        }
      }
      return { count: n };
    }),
  };

  const prisma: any = {
    routePlan: model,
    withTenant: jest.fn(async (companyId: string, fn: any) => {
      tenants.push(companyId);
      const ops: string[] = [];
      txLog.push(ops);
      const tx: any = {
        routePlan: {
          updateMany: jest.fn(async (args: any) => {
            ops.push('updateMany');
            return model.updateMany(args);
          }),
          findFirst: model.findFirst,
        },
      };
      return fn(tx);
    }),
    __plans: plans,
    __tenants: tenants,
    __txLog: txLog,
  };
  return prisma;
}

const build = (prisma: any) => new SmartRoutingService(prisma, { get: jest.fn() } as any);

const seed = (prisma: any, over: any = {}) => {
  const row = {
    id: 'plan-1',
    companyId: COMPANY,
    name: 'Morning run',
    status: 'DRAFT',
    startTime: null,
    createdAt: new Date(),
    ...over,
  };
  prisma.__plans.push(row);
  return row;
};

describe('SmartRoutingService — transitions are compare-and-set', () => {
  it('loses the race cleanly when two callers activate the same draft', async () => {
    // FAILED BEFORE: both read DRAFT, both passed the check, and the second
    // update simply overwrote the first. Nothing threw.
    const prisma = makePrisma();
    seed(prisma, { status: 'DRAFT' });
    prisma.routePlan.updateMany.mockResolvedValue({ count: 0 });

    await expect(build(prisma).activatePlan('plan-1', COMPANY)).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses to complete a plan that is not active', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'DRAFT' });
    await expect(build(prisma).completePlan('plan-1', COMPANY)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses to cancel a completed plan', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'COMPLETED' });
    await expect(build(prisma).cancelPlan('plan-1', COMPANY)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('loses the race cleanly when two callers complete the same active plan', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'ACTIVE', startTime: new Date() });
    prisma.routePlan.updateMany.mockResolvedValue({ count: 0 });

    await expect(build(prisma).completePlan('plan-1', COMPANY)).rejects.toThrow(
      ConflictException,
    );
  });

  it('performs the transition inside a tenant transaction', async () => {
    // FAILED BEFORE: bare this.prisma.routePlan.update, no RLS, no atomicity.
    const prisma = makePrisma();
    seed(prisma, { status: 'DRAFT' });

    await build(prisma).activatePlan('plan-1', COMPANY);

    expect(prisma.__tenants).toContain(COMPANY);
    expect(prisma.__txLog.flat()).toContain('updateMany');
  });

  it('still activates a genuine draft', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'DRAFT' });

    const out = await build(prisma).activatePlan('plan-1', COMPANY);
    expect(out.status).toBe('ACTIVE');
    expect(out.startTime).toBeInstanceOf(Date);
  });

  it('records how long the run actually took when completing', async () => {
    const prisma = makePrisma();
    const started = new Date(Date.now() - 60 * 60 * 1000); // one hour ago
    seed(prisma, { status: 'ACTIVE', startTime: started });

    const out = await build(prisma).completePlan('plan-1', COMPANY);
    expect(out.status).toBe('COMPLETED');
    expect(out.actualTime).toBeCloseTo(60, 0);
  });
});

describe('SmartRoutingService — tenant isolation', () => {
  it('cannot activate or complete another tenant’s plan', async () => {
    const prisma = makePrisma();
    seed(prisma, { id: 'plan-1', companyId: 'co-2', status: 'DRAFT' });

    await expect(build(prisma).activatePlan('plan-1', COMPANY)).rejects.toThrow(
      /not found/i,
    );
    await expect(build(prisma).completePlan('plan-1', COMPANY)).rejects.toThrow(/not found/i);
  });
});
