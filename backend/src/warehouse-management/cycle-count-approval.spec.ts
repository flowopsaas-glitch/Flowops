import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WarehouseManagementService } from './warehouse-management.service';

/**
 * CYCLE COUNT APPROVAL — the point where a physical count becomes stock.
 *
 * Two defects lived here, and they compound:
 *
 *   1. NOT ATOMIC. The "is it COMPLETED?" check was a read. Two concurrent
 *      approvals both passed it and both ran the loop, posting every
 *      adjustment and every stock movement twice.
 *
 *   2. ABSOLUTE OVERWRITE SOLD AS AN ADJUSTMENT. It wrote
 *      `quantityOnHand: line.countedQty` — an absolute — while the movement
 *      ledger recorded `quantity: line.variance`, a delta. Anything that moved
 *      between the count and the approval was silently erased, and the two
 *      records of the same event disagreed with each other.
 *
 * The harness below models BOTH: `increment` is honoured as a delta, and
 * `updateMany` is honoured as a compare-and-set. A harness that applies every
 * write blindly would let these tests pass against the broken code.
 */

const COMPANY = 'co-1';

interface ItemRow {
  id: string;
  companyId: string;
  sku: string;
  binId: string;
  quantityOnHand: number;
  quantityAvailable: number;
  quantityAllocated: number;
}

function makeHarness(opts: {
  systemQty: number;
  countedQty: number;
  onHandNow: number;
}) {
  const variance = opts.countedQty - opts.systemQty;

  const item: ItemRow = {
    id: 'item-1',
    companyId: COMPANY,
    sku: 'SKU-1',
    binId: 'bin-1',
    // NOTE: deliberately NOT equal to systemQty when the caller passes a
    // different onHandNow — that gap models stock that moved after the count.
    quantityOnHand: opts.onHandNow,
    quantityAvailable: opts.onHandNow,
    quantityAllocated: 0,
  };

  const movements: any[] = [];
  const lineUpdates: any[] = [];
  const cycleCountUpdates: any[] = [];
  let claimCount = 0;
  let claimLimit = 1; // how many callers may win the CAS before it returns 0

  const cc = {
    id: 'cc-1',
    companyId: COMPANY,
    countNumber: 'CC-0001',
    status: 'COMPLETED',
    totalVariances: 1,
    lines: [
      {
        id: 'line-1',
        sku: 'SKU-1',
        binCode: 'A-01',
        systemQty: opts.systemQty,
        countedQty: opts.countedQty,
        variance,
      },
    ],
  };

  const tx = {
    cycleCount: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        cycleCountUpdates.push({ where, data });
        if (
          where.id !== cc.id ||
          (where.companyId && where.companyId !== cc.companyId) ||
          (where.status && where.status !== cc.status)
        ) {
          return { count: 0 };
        }
        if (claimCount >= claimLimit) return { count: 0 };
        claimCount += 1;
        cc.status = 'APPROVED';
        return { count: 1 };
      }),
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === cc.id
          ? { id: cc.id, status: cc.status, countNumber: cc.countNumber }
          : null,
      ),
    },
    inventoryItem: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.sku === item.sku && where.companyId === COMPANY ? { ...item } : null,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        if (where.id !== item.id) throw new Error('no such item');
        for (const [k, v] of Object.entries<any>(data)) {
          if (v && typeof v === 'object' && 'increment' in v) {
            (item as any)[k] += v.increment; // DELTA
          } else {
            (item as any)[k] = v; // absolute
          }
        }
        return { ...item };
      }),
    },
    cycleCountLine: {
      update: jest.fn(async ({ where, data }: any) => {
        lineUpdates.push({ where, data });
        return { id: where.id, ...data };
      }),
    },
    stockMovement: {
      create: jest.fn(async ({ data }: any) => {
        movements.push(data);
        return { id: `mv-${movements.length}`, ...data };
      }),
    },
  };

  // The top level mirrors `tx` on purpose. The FIXED code writes through `tx`
  // (inside withTenant); the ORIGINAL code wrote through `this.prisma`. Sharing
  // the mocks means this suite still exercises the real defect when run against
  // a reverted copy, instead of dying on "cannot read property of undefined" —
  // which would look like a failure but prove nothing about behaviour.
  const prisma = {
    ...tx,
    cycleCount: {
      ...tx.cycleCount,
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id !== cc.id) return null;
        if (where.companyId && where.companyId !== cc.companyId) return null;
        if (where.status && where.status !== cc.status) return null;
        return { ...cc, lines: cc.lines.map((l) => ({ ...l })) };
      }),
    },
    withTenant: jest.fn(async (_companyId: string, fn: any) => fn(tx)),
  };

  return {
    prisma: prisma as any,
    tx,
    item,
    movements,
    lineUpdates,
    cycleCountUpdates,
    cc,
    variance,
    setClaimLimit: (n: number) => {
      claimLimit = n;
    },
  };
}

async function service(prisma: any) {
  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      WarehouseManagementService,
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: { get: (_k: string, d?: any) => d ?? '' } },
    ],
  }).compile();
  return mod.get(WarehouseManagementService);
}

describe('WarehouseManagementService.approveCycleCount', () => {
  it('posts the variance as a DELTA, not as an absolute overwrite', async () => {
    // counted 12, system said 10 -> variance +2.
    const h = makeHarness({ systemQty: 10, countedQty: 12, onHandNow: 10 });
    const svc = await service(h.prisma);

    await svc.approveCycleCount('cc-1', COMPANY, 'u-1');

    expect(h.variance).toBe(2);
    expect(h.item.quantityOnHand).toBe(12);
    const data = (h.tx.inventoryItem.update as jest.Mock).mock.calls[0][0].data;
    expect(data.quantityOnHand).toEqual({ increment: 2 });
  });

  it('preserves stock that moved between the count and the approval', async () => {
    // THE ABSOLUTE-OVERWRITE DEFECT. The count was taken when the system said
    // 10 and 12 were counted (+2). Since then a sale of 3 went out, so on-hand
    // is 7. An absolute write would set it to 12, inventing 5 units. A delta
    // gives 9: the counted figure plus the movement that happened after.
    const h = makeHarness({ systemQty: 10, countedQty: 12, onHandNow: 7 });
    const svc = await service(h.prisma);

    await svc.approveCycleCount('cc-1', COMPANY, 'u-1');

    expect(h.item.quantityOnHand).toBe(9);
  });

  it('records a movement whose quantity matches the delta it applied', async () => {
    // The ledger and the stock level must describe the SAME event. Previously
    // the ledger said "+2" while the level was set to an absolute, so the two
    // disagreed by whatever had moved in between.
    const h = makeHarness({ systemQty: 10, countedQty: 12, onHandNow: 7 });
    const svc = await service(h.prisma);

    await svc.approveCycleCount('cc-1', COMPANY, 'u-1');

    expect(h.movements).toHaveLength(1);
    expect(h.movements[0].quantity).toBe(2);
    expect(h.movements[0].type).toBe('CYCLE_COUNT');
  });

  it('posts the adjustments only ONCE when two approvals race', async () => {
    // THE ATOMICITY DEFECT. Both callers read COMPLETED before either writes.
    const h = makeHarness({ systemQty: 10, countedQty: 12, onHandNow: 10 });
    const svc = await service(h.prisma);

    const results = await Promise.all([
      svc.approveCycleCount('cc-1', COMPANY, 'u-1'),
      svc.approveCycleCount('cc-1', COMPANY, 'u-2'),
    ]);

    expect(h.movements).toHaveLength(1);
    expect(h.item.quantityOnHand).toBe(12);

    const posted = results.filter((r: any) => r.adjustmentsPosted === 1);
    const skipped = results.filter((r: any) => r.alreadyApproved === true);
    expect(posted).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect((skipped[0] as any).adjustmentsPosted).toBe(0);
  });

  it('claims with a compare-and-set scoped to the company', async () => {
    const h = makeHarness({ systemQty: 10, countedQty: 12, onHandNow: 10 });
    const svc = await service(h.prisma);

    await svc.approveCycleCount('cc-1', COMPANY, 'u-1');

    const where = (h.tx.cycleCount.updateMany as jest.Mock).mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'cc-1', companyId: COMPANY, status: 'COMPLETED' });
  });

  it('refuses a count that is not in COMPLETED state', async () => {
    const h = makeHarness({ systemQty: 10, countedQty: 12, onHandNow: 10 });
    h.cc.status = 'DRAFT';
    const svc = await service(h.prisma);

    await expect(svc.approveCycleCount('cc-1', COMPANY, 'u-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(h.movements).toHaveLength(0);
  });

  it('skips lines with no variance and posts no movement for them', async () => {
    const h = makeHarness({ systemQty: 10, countedQty: 10, onHandNow: 10 });
    const svc = await service(h.prisma);

    const res: any = await svc.approveCycleCount('cc-1', COMPANY, 'u-1');

    expect(h.variance).toBe(0);
    expect(h.movements).toHaveLength(0);
    expect(h.item.quantityOnHand).toBe(10);
    expect(res.adjustmentsPosted).toBe(0);
  });
});
