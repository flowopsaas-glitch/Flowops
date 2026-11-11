import { NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service';

/**
 * BRANCHES — physical depots, and the company's plan limit on how many.
 *
 * This module was already right, and that is the reason to test it. `update`
 * re-asserts companyId rather than trusting the WHERE clause alone, and `create`
 * runs the plan limit before writing. Both are easy to undo by accident, and
 * nothing was asserting either.
 *
 * The DTOs (CreateBranchDto / UpdateBranchDto) are real classes with
 * class-validator decorators, so the global whitelist does apply here — unlike
 * clients, where an interface left the pipe blind.
 */

const COMPANY = 'co-1';
const VICTIM = 'co-2';

const matches = (row: any, where: any) =>
  Object.entries(where ?? {}).every(([k, v]) => (v === undefined ? true : row[k] === v));

function makeHarness(opts: { overLimit?: boolean } = {}) {
  const branches: any[] = [];
  let seq = 0;

  const branch = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `br-${++seq}`, ...data };
      branches.push(row);
      return { ...row };
    }),
    findMany: jest.fn(async ({ where }: any) => branches.filter((b) => matches(b, where))),
    findFirst: jest.fn(async ({ where }: any) => branches.find((b) => matches(b, where)) ?? null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = branches.filter((b) => matches(b, where));
      hit.forEach((b) => Object.assign(b, data));
      return { count: hit.length };
    }),
  };

  const prisma: any = { branch, __branches: branches };
  const billing: any = {
    assertCanCreate: jest.fn(async () => {
      if (opts.overLimit) throw new Error('Plan limit reached');
    }),
  };

  return { prisma, billing, svc: new BranchesService(prisma, billing) };
}

const seedBranch = (h: any, over: any = {}) => {
  const row = { id: 'br-1', companyId: COMPANY, name: 'Joburg Depot', city: 'Johannesburg', ...over };
  h.prisma.__branches.push(row);
  return row;
};

describe('BranchesService — tenant scoping', () => {
  it('lists only the caller’s branches', async () => {
    const h = makeHarness();
    seedBranch(h, { id: 'a', companyId: COMPANY });
    seedBranch(h, { id: 'b', companyId: VICTIM });
    expect((await h.svc.findAll(COMPANY)).map((b: any) => b.id)).toEqual(['a']);
  });

  it('snapshots only the caller’s branches', async () => {
    const h = makeHarness();
    seedBranch(h, { id: 'a', companyId: COMPANY });
    seedBranch(h, { id: 'b', companyId: VICTIM });
    expect((await h.svc.snapshot(COMPANY)).map((b: any) => b.id)).toEqual(['a']);
  });

  it('cannot update another tenant’s branch', async () => {
    const h = makeHarness();
    seedBranch(h, { companyId: VICTIM });
    await expect(h.svc.update('br-1', COMPANY, { name: 'Taken' })).rejects.toThrow(NotFoundException);
    expect(h.prisma.__branches[0].name).toEqual('Joburg Depot');
  });
});

describe('BranchesService — create', () => {
  it('stamps the caller’s company, never one from the body', async () => {
    const h = makeHarness();
    const out = await h.svc.create(COMPANY, { name: 'Cape Depot', companyId: VICTIM } as any);
    expect(out.companyId).toEqual(COMPANY);
  });

  it('checks the plan limit before writing', async () => {
    const h = makeHarness();
    await h.svc.create(COMPANY, { name: 'Cape Depot' });
    expect(h.billing.assertCanCreate).toHaveBeenCalledWith(COMPANY, 'branch');
  });

  it('writes nothing when the plan limit refuses', async () => {
    const h = makeHarness({ overLimit: true });
    await expect(h.svc.create(COMPANY, { name: 'Over the limit' })).rejects.toThrow(/Plan limit/);
    expect(h.prisma.__branches).toHaveLength(0);
  });
});

describe('BranchesService — update re-asserts the tenant', () => {
  it('ignores a companyId in the body', async () => {
    // The WHERE clause already scopes the write, but companyId is re-asserted in
    // the payload too: without that, a caller could move their own branch into
    // another company, and the WHERE would still match because they own it now.
    const h = makeHarness();
    seedBranch(h);

    await h.svc.update('br-1', COMPANY, { name: 'Renamed', companyId: VICTIM } as any);

    expect(h.prisma.__branches[0].companyId).toEqual(COMPANY);
    expect(h.prisma.__branches[0].name).toEqual('Renamed');
  });

  it('still writes the fields a client may own', async () => {
    const h = makeHarness();
    seedBranch(h);

    const out: any = await h.svc.update('br-1', COMPANY, { name: 'Renamed', city: 'Cape Town' });

    expect(out.name).toEqual('Renamed');
    expect(out.city).toEqual('Cape Town');
  });

  it('reports not-found rather than silently doing nothing', async () => {
    const h = makeHarness();
    await expect(h.svc.update('missing', COMPANY, { name: 'x' })).rejects.toThrow(NotFoundException);
  });
});
