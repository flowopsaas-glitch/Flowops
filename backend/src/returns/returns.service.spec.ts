import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ReturnsService } from './returns.service';

/**
 * RETURNS — 924 lines, no tests.
 *
 * An RMA ends in a refund, so its lifecycle is a money path: approve, collect,
 * inspect, resolve. Three things were wrong with it, all of the same family as
 * bugs fixed elsewhere on the platform and not applied here.
 */

const COMPANY = 'co-1';
const OTHER = 'co-2';

function makePrisma() {
  const rows: any[] = [];
  const tenants: string[] = [];
  const lockChains = new Map<string, Promise<void>>();

  const match = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('not' in v) return (row as any)[k] !== v.not;
        if ('in' in v) return (v.in as any[]).includes((row as any)[k]);
        if ('gte' in v) return (row as any)[k] >= v.gte;
      }
      return (row as any)[k] === v;
    });

  const model = {
    count: jest.fn(async ({ where }: any) => rows.filter((r) => match(r, where)).length),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `ret-${rows.length + 1}`, createdAt: new Date(), status: 'REQUESTED', ...data };
      rows.push(row);
      return { ...row };
    }),
    findFirst: jest.fn(async ({ where }: any) => rows.find((r) => match(r, where)) ?? null),
    findMany: jest.fn(async ({ where }: any) => rows.filter((r) => match(r, where))),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let n = 0;
      for (const r of rows) {
        if (match(r, where)) {
          Object.assign(r, data);
          n += 1;
        }
      }
      return { count: n };
    }),
    delete: jest.fn(async ({ where }: any) => {
      const i = rows.findIndex((r) => r.id === where.id);
      if (i < 0) throw new Error('not found');
      return rows.splice(i, 1)[0];
    }),
    aggregate: jest.fn(async ({ where }: any) => {
      const hit = rows.filter((r) => match(r, where));
      const sum = (k: string) => hit.reduce((a, r) => a + (Number(r[k]) || 0), 0);
      return { _sum: { refundAmount: sum('refundAmount'), restockFee: sum('restockFee') } };
    }),
  };

  const prisma: any = {
    return: model,
    waybill: { findFirst: jest.fn(async () => null) },
    withTenant: jest.fn(async (companyId: string, fn: any) => {
      tenants.push(companyId);
      const released: Array<() => void> = [];
      const tx: any = {
        return: {
          count: model.count,
          create: model.create,
          updateMany: model.updateMany,
          findFirst: model.findFirst,
          update: model.update,
          delete: model.delete,
        },
        $executeRaw: jest.fn(async (strings: any, ...values: any[]) => {
          const sql = String(strings?.sql ?? strings?.raw?.[0] ?? strings ?? '');
          if (!/pg_advisory_xact_lock/.test(sql)) return [];
          const key = String(values[0] ?? 'default');
          const prev = lockChains.get(key) ?? Promise.resolve();
          let release!: () => void;
          const held = new Promise<void>((r) => {
            release = r;
          });
          lockChains.set(key, prev.then(() => held));
          await prev;
          released.push(release);
          return [];
        }),
      };
      try {
        return await fn(tx);
      } finally {
        released.forEach((r) => r());
      }
    }),
    __rows: rows,
    __tenants: tenants,
  };
  return prisma;
}

const notifications = () => ({ notifyReturnStatus: jest.fn() }) as any;

const build = (prisma: any, notif = notifications()) => new ReturnsService(prisma, notif);

const seed = (prisma: any, over: any = {}) => {
  const row = {
    id: 'ret-1',
    companyId: COMPANY,
    rmaNumber: 'RMA-2611-0001',
    status: 'REQUESTED',
    resolution: 'PENDING',
    createdAt: new Date(),
    ...over,
  };
  prisma.__rows.push(row);
  return row;
};

describe('ReturnsService — the lifecycle cannot be bypassed', () => {
  it('refuses to change status through the generic update', async () => {
    // FAILED BEFORE: `update` spread `...dto`, and UpdateReturnDto declares
    // `status?: ReturnStatus`. So PATCH /returns/:id could jump REQUESTED
    // straight to COMPLETED, skipping approval, collection and inspection — and
    // setting a refund with nothing behind it. The state machine in transition()
    // was advisory: real only for callers who chose to use it.
    const prisma = makePrisma();
    seed(prisma);

    await build(prisma)
      .update('ret-1', COMPANY, { status: 'COMPLETED' } as any)
      .then(
        () => {
          throw new Error('update should not have accepted a status change');
        },
        (e) => expect(e).toBeInstanceOf(BadRequestException),
      );
  });

  it('still allows non-status fields through update', async () => {
    const prisma = makePrisma();
    seed(prisma);

    const out = await build(prisma).update('ret-1', COMPANY, { pickupAddress: '9 New Rd' } as any);
    expect(out.pickupAddress).toBe('9 New Rd');
  });
});

describe('ReturnsService — transitions are compare-and-set', () => {
  it('loses the race cleanly when two staff approve the same request', async () => {
    // FAILED BEFORE: assertFrom decided in application code, then
    // `update({ where: { id } })` wrote with no status in the WHERE. Two
    // overlapping approvals both passed and the second overwrote the first.
    const prisma = makePrisma();
    seed(prisma, { status: 'REQUESTED' });
    prisma.return.updateMany.mockResolvedValue({ count: 0 });

    await expect(build(prisma).transition('ret-1', COMPANY, 'approve', {})).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses an illegal transition outright', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'REQUESTED' });

    await expect(build(prisma).transition('ret-1', COMPANY, 'collect', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses to resolve without a concrete resolution', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'INSPECTING' });

    await expect(build(prisma).transition('ret-1', COMPANY, 'resolve', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('approves a genuine request', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'REQUESTED' });

    const out = await build(prisma).transition('ret-1', COMPANY, 'approve', {});
    expect(out.status).toBe('APPROVED');
  });

  it('rejects an unknown action', async () => {
    const prisma = makePrisma();
    seed(prisma);
    await expect(build(prisma).transition('ret-1', COMPANY, 'teleport', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('runs the transition inside a tenant transaction', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'REQUESTED' });
    await build(prisma).transition('ret-1', COMPANY, 'approve', {});
    expect(prisma.__tenants).toContain(COMPANY);
  });
});

describe('ReturnsService — RMA numbers', () => {
  it('gives two returns created at the same time different RMA numbers', async () => {
    // FAILED BEFORE: count-then-increment with no lock, exactly as in
    // courier-management. Two returns created together both got RMA-<yymm>-0001.
    const prisma = makePrisma();
    const svc = build(prisma);

    const [a, b] = await Promise.all([
      svc.create(COMPANY, { customerName: 'A' } as any),
      svc.create(COMPANY, { customerName: 'B' } as any),
    ]);

    expect(a.rmaNumber).not.toBe(b.rmaNumber);
  });
});

describe('ReturnsService — completed returns are financial records', () => {
  it('refuses to delete a completed return that carries a refund', async () => {
    // FAILED BEFORE: remove() deleted any return in any status. A completed
    // return is the record that a refund was agreed — deleting it removes the
    // only evidence, and restock fees and refund amounts go with it.
    const prisma = makePrisma();
    seed(prisma, { status: 'COMPLETED', refundAmount: 250 });

    await expect(build(prisma).remove('ret-1', COMPANY)).rejects.toThrow(BadRequestException);
    expect(prisma.__rows).toHaveLength(1);
  });

  it('still allows deleting a return that was never resolved', async () => {
    const prisma = makePrisma();
    seed(prisma, { status: 'REQUESTED' });
    await expect(build(prisma).remove('ret-1', COMPANY)).resolves.toMatchObject({ deleted: true });
  });

  it('cannot delete another tenant’s return', async () => {
    const prisma = makePrisma();
    seed(prisma, { companyId: OTHER });
    await expect(build(prisma).remove('ret-1', COMPANY)).rejects.toThrow(NotFoundException);
  });
});
