import { ConflictException, ForbiddenException } from '@nestjs/common';
import { CourierManagementService } from './courier-management.service';

/**
 * COURIER MANAGEMENT — a paid Enterprise feature with no tests.
 *
 * The bug pinned here is in reference generation: `nextReference` counts the
 * rows and adds one, with nothing holding a lock between the count and the
 * insert. Two orders created together both read the same count and both get the
 * same reference. `reference` carries no unique constraint, so nothing rejects
 * it either — the duplicate is silent, and two different orders end up
 * unidentifiable by the number a customer would quote.
 */

const COMPANY = 'co-1';

/**
 * A fake Prisma that models the ONE database property the fix depends on.
 *
 * `pg_advisory_xact_lock` cannot be demonstrated with a plain mock: if
 * `$executeRaw` just resolves, nothing serialises and the test proves nothing
 * either way. So the fake implements the lock as a real in-process mutex keyed
 * by lock name, released when the surrounding transaction ends — which is
 * exactly what Postgres does.
 *
 * That makes the concurrency test meaningful AND makes the mistake worth
 * catching catchable: taking the lock in a different transaction from the
 * insert releases it too early, and the two references collide again.
 */
function makePrisma() {
  const orders: any[] = [];
  const tenants: string[] = [];
  const txLog: string[][] = []; // operations recorded per transaction

  // key -> tail of the promise chain waiting on it
  const lockChains = new Map<string, Promise<void>>();

  const model = {
    count: jest.fn(async ({ where }: any) => {
      const from = where?.createdAt?.gte ? new Date(where.createdAt.gte).getTime() : 0;
      return orders.filter((o) => o.companyId === where.companyId && o.createdAt.getTime() >= from)
        .length;
    }),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `ord-${orders.length + 1}`, createdAt: new Date(), ...data };
      orders.push(row);
      return { ...row };
    }),
    findMany: jest.fn(async () => orders.map((o) => ({ ...o }))),
    findFirst: jest.fn(async ({ where }: any) => {
      const hit = orders.find((o) =>
        Object.entries(where ?? {}).every(([k, v]) => (o as any)[k] === v),
      );
      return hit ?? null;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = orders.find((o) => o.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return { ...row };
    }),
  };

  const prisma: any = {
    courierOrder: model,
    driver: { findMany: jest.fn(async () => []) },
    withTenant: jest.fn(async (companyId: string, fn: any) => {
      tenants.push(companyId);
      const ops: string[] = [];
      txLog.push(ops);
      const released: Array<() => void> = [];

      const tx: any = {
        courierOrder: {
          count: jest.fn(async (args: any) => {
            ops.push('count');
            return model.count(args);
          }),
          create: jest.fn(async (args: any) => {
            ops.push('create');
            return model.create(args);
          }),
        },
        $executeRaw: jest.fn(async (strings: any, ...values: any[]) => {
          const sql = String(strings?.sql ?? strings?.raw?.[0] ?? strings ?? '');
          if (!/pg_advisory_xact_lock/.test(sql)) return [];
          ops.push('lock');
          const key = String(values[0] ?? 'default');
          const prev = lockChains.get(key) ?? Promise.resolve();
          let release!: () => void;
          const held = new Promise<void>((r) => {
            release = r;
          });
          lockChains.set(key, prev.then(() => held));
          await prev; // queue behind whoever holds it
          released.push(release);
          return [];
        }),
      };

      try {
        return await fn(tx);
      } finally {
        // Transaction ended: Postgres releases xact locks here, not before.
        released.forEach((r) => r());
      }
    }),
    __orders: orders,
    __tenants: tenants,
    __txLog: txLog,
  };
  return prisma;
}

const billing = (entitled = true) => ({
  hasFeature: jest.fn(async () => entitled),
}) as any;

const build = (prisma: any, ent = true) =>
  new CourierManagementService(prisma, { get: jest.fn() } as any, billing(ent));

const ORDER = {
  clientName: 'Acme',
  pickupAddress: '1 Pickup Rd',
  dropoffAddress: '2 Drop Rd',
};

describe('CourierManagementService — reference allocation', () => {
  it('gives two orders created at the same time different references', async () => {
    // FAILED BEFORE: both counted the same rows and were handed ORD-<year>-00001.
    // `reference` has no unique constraint, so the duplicate was silent.
    const prisma = makePrisma();
    const svc = build(prisma);

    const [a, b] = await Promise.all([
      svc.createOrder(COMPANY, ORDER as any),
      svc.createOrder(COMPANY, ORDER as any),
    ]);

    expect(a.reference).not.toBe(b.reference);
  });

  it('takes the lock in the SAME transaction as the insert', async () => {
    // This is the mistake worth catching: allocating the reference in its own
    // transaction releases the lock the moment that transaction commits, before
    // the row that consumed the number is written. The code then looks correct
    // and fixes nothing.
    const prisma = makePrisma();
    await build(prisma).createOrder(COMPANY, ORDER as any);

    const ops = prisma.__txLog.flat();
    expect(ops).toContain('lock');
    expect(ops).toContain('count');
    expect(ops).toContain('create');
    // lock -> count -> create, in that order, all inside one transaction
    expect(prisma.__txLog[0]).toEqual(['lock', 'count', 'create']);
  });

  it('never writes a courier order outside a tenant transaction', async () => {
    const prisma = makePrisma();
    await build(prisma).createOrder(COMPANY, ORDER as any);
    expect(prisma.__tenants).toEqual([COMPANY]);
    expect(prisma.withTenant).toHaveBeenCalledTimes(1);
  });

  it('never hands out the same reference twice across many orders', async () => {
    const prisma = makePrisma();
    const svc = build(prisma);

    const refs = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      refs.add((await svc.createOrder(COMPANY, ORDER as any)).reference);
    }
    expect(refs.size).toBe(10);
  });

  it('starts each tenant at 00001 rather than padding globally', async () => {
    const prisma = makePrisma();
    const svc = build(prisma);

    const first = await svc.createOrder(COMPANY, ORDER as any);
    await svc.createOrder('co-2', ORDER as any);

    expect(first.reference).toMatch(/^ORD-\d{4}-00001$/);
  });
});

describe('CourierManagementService — entitlement', () => {
  it('refuses to create an order when the company is not entitled', async () => {
    // This is a paid Enterprise feature; the gate is the point of it.
    const prisma = makePrisma();
    const svc = build(prisma, false);

    await expect(svc.createOrder(COMPANY, ORDER as any)).rejects.toThrow(ForbiddenException);
    expect(prisma.__orders).toHaveLength(0);
  });
});

describe('CourierManagementService — tenant isolation', () => {
  it('creates inside withTenant so RLS covers it', async () => {
    const prisma = makePrisma();
    await build(prisma).createOrder(COMPANY, ORDER as any);
    expect(prisma.__tenants).toContain(COMPANY);
  });
});

describe('CourierManagementService — a reference that is already taken', () => {
  // (companyId, reference) became unique in migration
  // 20261113090000_unique_business_references. Same generator shape as
  // Manifest.code: a count over rows created this year, so deleting an order
  // reissues its reference. The constraint turns silent duplication into a
  // P2002, which has to be translated or it reads as a server error.

  const p2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

  it('reports a reused reference as a conflict, not a server error', async () => {
    const prisma = makePrisma();
    prisma.courierOrder.create.mockRejectedValueOnce(p2002());

    await expect(build(prisma).createOrder('co-1', ORDER as any)).rejects.toThrow(
      ConflictException,
    );
  });

  it('names the reference and says nothing was created', async () => {
    const prisma = makePrisma();
    prisma.courierOrder.create.mockRejectedValueOnce(p2002());
    const year = new Date().getFullYear();

    await expect(build(prisma).createOrder('co-1', ORDER as any)).rejects.toThrow(
      new RegExp(`ORD-${year}-00001.*no order was created`, 's'),
    );
  });

  it('does not swallow any other database error', async () => {
    const prisma = makePrisma();
    prisma.courierOrder.create.mockRejectedValueOnce(new Error('connection terminated'));

    await expect(build(prisma).createOrder('co-1', ORDER as any)).rejects.toThrow(
      'connection terminated',
    );
  });
});
