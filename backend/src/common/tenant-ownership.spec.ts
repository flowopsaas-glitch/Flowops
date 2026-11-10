import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { BranchesService } from '../branches/branches.service';
import { DriverSafetyService } from '../driver-safety/driver-safety.service';
import { ManifestsService } from '../manifests/manifests.service';

/**
 * Three services shared one shape of bug, and it is subtle enough to be worth
 * stating plainly.
 *
 * Each wrote with `updateMany({ where: { id, companyId }, data: dto })` where
 * `dto` is an untyped request body. The WHERE clause is tenant-scoped, so it
 * looks safe, and it IS safe against READING another tenant's row. It is not
 * safe against WRITING one, because `data` is a separate object from `where`.
 *
 * If the body contains `companyId`, Prisma writes it. The WHERE matched while
 * the caller still owned the row, and the write then re-homes it into another
 * company. Nothing errors, no log looks unusual, and the record simply appears
 * in someone else's tenant — counted against their limits and visible to their
 * users.
 *
 * The fix re-asserts companyId in the data, which is what these same files
 * already did on create. These tests assert on the ARGUMENTS passed to Prisma,
 * because the defect is invisible in the return value.
 */

type Case = {
  name: string;
  model: string;
  make: (prisma: any, billing: any) => any;
  update: (svc: any, id: string, companyId: string, dto: any) => Promise<any>;
};

const cases: Case[] = [
  {
    name: 'branches',
    model: 'branch',
    make: (prisma, billing) => {
      const svc = Object.create(BranchesService.prototype) as BranchesService;
      Object.assign(svc as any, { prisma, billing });
      return svc;
    },
    update: (svc, id, companyId, dto) => svc.update(id, companyId, dto),
  },
  {
    name: 'driver-safety zones',
    model: 'safetyZone',
    make: (prisma, billing) => {
      const svc = Object.create(DriverSafetyService.prototype) as DriverSafetyService;
      Object.assign(svc as any, { prisma, billing });
      return svc;
    },
    update: (svc, id, companyId, dto) => svc.updateZone(id, companyId, dto),
  },
  {
    name: 'manifests',
    model: 'manifest',
    make: (prisma, billing) => {
      const svc = Object.create(ManifestsService.prototype) as ManifestsService;
      Object.assign(svc as any, { prisma, billing });
      return svc;
    },
    update: (svc, id, companyId, dto) => svc.update(id, companyId, dto),
  },
];

function makePrisma(model: string) {
  const writes: any[] = [];
  const prisma: any = {
    [model]: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        writes.push({ where, data });
        // Honour tenant scoping: a row in another company is not found.
        return { count: where.companyId === 'co-1' ? 1 : 0 };
      }),
      findFirst: jest.fn(async () => ({ id: 'rec-1', companyId: 'co-1' })),
    },
  };
  return { prisma, writes };
}

describe('tenant ownership cannot be moved by the request body', () => {
  for (const c of cases) {
    describe(c.name, () => {
      it('ignores a companyId supplied in the payload', async () => {
        const { prisma, writes } = makePrisma(c.model);
        const billing = { assertCanCreate: jest.fn().mockResolvedValue(undefined) };
        const svc = c.make(prisma, billing);

        await c.update(svc, 'rec-1', 'co-1', { name: 'Renamed', companyId: 'victim-co' });

        expect(writes).toHaveLength(1);
        expect(writes[0].data.companyId).toBe('co-1');
        expect(writes[0].data.companyId).not.toBe('victim-co');
      });

      it('keeps the WHERE clause tenant-scoped', async () => {
        const { prisma, writes } = makePrisma(c.model);
        const billing = { assertCanCreate: jest.fn().mockResolvedValue(undefined) };
        const svc = c.make(prisma, billing);

        await c.update(svc, 'rec-1', 'co-1', { name: 'Renamed' });

        expect(writes[0].where).toEqual({ id: 'rec-1', companyId: 'co-1' });
      });

      it('still writes the fields the caller is allowed to change', async () => {
        const { prisma, writes } = makePrisma(c.model);
        const billing = { assertCanCreate: jest.fn().mockResolvedValue(undefined) };
        const svc = c.make(prisma, billing);

        await c.update(svc, 'rec-1', 'co-1', { name: 'Renamed' });

        expect(writes[0].data.name).toBe('Renamed');
      });

      it('404s for a record belonging to another tenant', async () => {
        const { prisma } = makePrisma(c.model);
        const billing = { assertCanCreate: jest.fn().mockResolvedValue(undefined) };
        const svc = c.make(prisma, billing);

        await expect(c.update(svc, 'rec-1', 'co-2', { name: 'X' })).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('tolerates an empty body', async () => {
        const { prisma, writes } = makePrisma(c.model);
        const billing = { assertCanCreate: jest.fn().mockResolvedValue(undefined) };
        const svc = c.make(prisma, billing);

        await c.update(svc, 'rec-1', 'co-1', undefined);

        expect(writes[0].data).toEqual({ companyId: 'co-1' });
      });
    });
  }
});
