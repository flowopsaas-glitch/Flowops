import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConsolidationService } from './consolidation.service';
import { PrismaService } from '../prisma/prisma.service';
import { StateConflictError } from '../common/state-transition';

/**
 * These tests exist to pin a specific bug shape, not to describe the happy
 * path. Consolidation is a self-relation on ShipmentFile, and a file that is
 * simultaneously a master and a house — or a house pointing at two masters —
 * is a corrupted tree that downstream consolidation maths cannot recover
 * from. Every one of those corruptions starts as a read-then-write that a
 * concurrent request slips between.
 *
 * The tests that matter are the ones that hand the service a STALE snapshot
 * of the row while the stored row has already moved. A test that only
 * exercises the up-front BadRequest would pass against the unfixed code too,
 * and would therefore prove nothing.
 */

type File = {
  id: string;
  companyId: string;
  isMaster: boolean;
  masterFileId: string | null;
};

function file(id: string, over: Partial<File> = {}): File {
  return {
    id,
    companyId: 'co-1',
    isMaster: false,
    masterFileId: null,
    ...over,
  };
}

/**
 * Minimal in-memory stand-in for ShipmentFile. It deliberately evaluates
 * `updateMany` WHERE clauses against the CURRENT row, not the row the caller
 * read — that is the entire point, and it is what makes the races observable.
 */
function makePrisma(files: File[]) {
  const db = { files };

  const matches = (row: File, where: any): boolean => {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.companyId !== undefined && row.companyId !== where.companyId) return false;
    if (where.isMaster !== undefined && row.isMaster !== where.isMaster) return false;
    if (where.masterFileId !== undefined) {
      // Prisma's `masterFileId: null` means "is null".
      if (row.masterFileId !== where.masterFileId) return false;
    }
    if (where.OR !== undefined) {
      if (!where.OR.some((clause: any) => matches(row, clause))) return false;
    }
    return true;
  };

  const prisma = {
    shipmentFile: {
      findFirst: jest.fn(async ({ where }: any) => {
        const row = db.files.find((f) => matches(f, where));
        return row ? { ...row } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of db.files) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      }),
      findMany: jest.fn(async ({ where }: any) =>
        db.files.filter((f) => matches(f, where ?? {})).map((f) => ({ ...f })),
      ),
      count: jest.fn(async ({ where }: any) => db.files.filter((f) => matches(f, where ?? {})).length),
    },
    // Must behave like the real interactive transaction: a throw inside the
    // callback discards every write made inside it. A mock that simply
    // forwards to the callback would let a rolled-back write survive and
    // would make the atomicity test pass for the wrong reason.
    $transaction: jest.fn(async (fn: any) => {
      const snapshot = db.files.map((f) => ({ ...f }));
      try {
        return await fn(prisma);
      } catch (err) {
        db.files.length = 0;
        db.files.push(...snapshot);
        throw err;
      }
    }),
  };

  return { prisma: prisma as any, db };
}

async function build(files: File[]) {
  const { prisma, db } = makePrisma(files);
  const mod: TestingModule = await Test.createTestingModule({
    providers: [ConsolidationService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { svc: mod.get(ConsolidationService), prisma, db };
}

describe('ConsolidationService', () => {
  describe('markAsMaster', () => {
    it('promotes a free-standing file', async () => {
      const { svc, db } = await build([file('a')]);
      const res = await svc.markAsMaster('co-1', 'a');
      expect(res.isMaster).toBe(true);
      expect(db.files[0].isMaster).toBe(true);
    });

    it('refuses a file that is already a house', async () => {
      const { svc, db } = await build([file('a', { masterFileId: 'm1' })]);
      await expect(svc.markAsMaster('co-1', 'a')).rejects.toBeInstanceOf(BadRequestException);
      expect(db.files[0].isMaster).toBe(false);
    });

    it('refuses promotion when a concurrent attach made it a house', async () => {
      // Stale read: this request saw a free-standing file. By the time it
      // writes, another request has linked it under master 'm1'. Without the
      // WHERE clause the update would happily stamp isMaster on a house,
      // producing a file that is both master and house.
      const { svc, prisma, db } = await build([file('a')]);
      prisma.shipmentFile.findFirst.mockResolvedValueOnce({ ...file('a') });

      // The competing request wins the race.
      db.files[0].masterFileId = 'm1';

      await expect(svc.markAsMaster('co-1', 'a')).rejects.toBeInstanceOf(StateConflictError);
      expect(db.files[0].isMaster).toBe(false);
    });

    it('does not touch another company’s file', async () => {
      const { svc, db } = await build([file('a', { companyId: 'co-2' })]);
      await expect(svc.markAsMaster('co-1', 'a')).rejects.toBeInstanceOf(Error);
      expect(db.files[0].isMaster).toBe(false);
    });
  });

  describe('attachHouse', () => {
    it('links a house under a master and flags the master', async () => {
      const { svc, db } = await build([file('m'), file('h')]);
      await svc.attachHouse('co-1', 'm', 'h');
      expect(db.files[0].isMaster).toBe(true);
      expect(db.files[1].masterFileId).toBe('m');
    });

    it('is idempotent when the house is already under this master', async () => {
      const { svc, db } = await build([file('m', { isMaster: true }), file('h', { masterFileId: 'm' })]);
      await svc.attachHouse('co-1', 'm', 'h');
      expect(db.files[1].masterFileId).toBe('m');
    });

    it('refuses to attach a house that is itself a master', async () => {
      const { svc, db } = await build([file('m', { isMaster: true }), file('h', { isMaster: true })]);
      await expect(svc.attachHouse('co-1', 'm', 'h')).rejects.toBeInstanceOf(BadRequestException);
      expect(db.files[1].masterFileId).toBeNull();
    });

    it('refuses to attach a house already under a different master', async () => {
      const { svc } = await build([file('m', { isMaster: true }), file('h', { masterFileId: 'other' })]);
      await expect(svc.attachHouse('co-1', 'm', 'h')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to attach to a master that is itself a house', async () => {
      const { svc, db } = await build([file('m', { masterFileId: 'grand' }), file('h')]);
      await expect(svc.attachHouse('co-1', 'm', 'h')).rejects.toBeInstanceOf(BadRequestException);
      expect(db.files[1].masterFileId).toBeNull();
    });

    it('loses the race when a concurrent promotion makes the house a master', async () => {
      // Stale read: both files looked free-standing. Before this write lands,
      // another request promotes the house to a master. The bare update would
      // then link a master under a master.
      const { svc, prisma, db } = await build([file('m'), file('h')]);
      prisma.shipmentFile.findFirst
        .mockResolvedValueOnce({ ...file('m') })
        .mockResolvedValueOnce({ ...file('h') });

      db.files[1].isMaster = true;

      await expect(svc.attachHouse('co-1', 'm', 'h')).rejects.toBeInstanceOf(StateConflictError);
      expect(db.files[1].masterFileId).toBeNull();
    });

    it('loses the race when another caller attaches the house elsewhere first', async () => {
      const { svc, prisma, db } = await build([file('m'), file('h')]);
      prisma.shipmentFile.findFirst
        .mockResolvedValueOnce({ ...file('m') })
        .mockResolvedValueOnce({ ...file('h') });

      db.files[1].masterFileId = 'other';

      await expect(svc.attachHouse('co-1', 'm', 'h')).rejects.toBeInstanceOf(StateConflictError);
      // The competing attachment stands; this one did not overwrite it.
      expect(db.files[1].masterFileId).toBe('other');
    });

    it('rolls the master flag back if the house link fails', async () => {
      // The two writes must be atomic. If the house link is rejected, the
      // master must not be left flagged with nothing attached to it.
      const { svc, prisma, db } = await build([file('m'), file('h')]);
      prisma.shipmentFile.findFirst
        .mockResolvedValueOnce({ ...file('m') })
        .mockResolvedValueOnce({ ...file('h') });

      db.files[1].isMaster = true;

      await expect(svc.attachHouse('co-1', 'm', 'h')).rejects.toBeInstanceOf(StateConflictError);
      expect(db.files[0].isMaster).toBe(false);
    });
  });

  describe('detachHouse', () => {
    it('clears the link', async () => {
      const { svc, db } = await build([file('m', { isMaster: true }), file('h', { masterFileId: 'm' })]);
      await svc.detachHouse('co-1', 'm', 'h');
      expect(db.files[1].masterFileId).toBeNull();
    });
  });
});
