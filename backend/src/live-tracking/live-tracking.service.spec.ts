import { NotFoundException } from '@nestjs/common';
import { LiveTrackingService } from './live-tracking.service';

/**
 * LIVE TRACKING — driver GPS sessions.
 *
 * The invariant is one active session per driver. It is enforced in two
 * statements with nothing between them: end any active session, then create a
 * new one. Two overlapping starts both run the first, both run the second, and
 * the driver ends up with two live sessions — two rows accumulating distance,
 * and a dispatch board showing the same driver twice.
 */

const COMPANY = 'co-1';
const OTHER = 'co-2';

function makePrisma() {
  const rows: any[] = [];
  const tenants: string[] = [];
  const lockChains = new Map<string, Promise<void>>();
  let seq = 0;

  const match = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]) => (row as any)[k] === v);

  const model = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `sess-${++seq}`, isActive: true, ...data };
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
  };

  const prisma: any = {
    liveTrackingSession: model,
    withTenant: jest.fn(async (companyId: string, fn: any) => {
      tenants.push(companyId);
      const released: Array<() => void> = [];
      const tx: any = {
        liveTrackingSession: model,
        // Modelled as a real mutex released at transaction end — exactly what
        // pg_advisory_xact_lock does. A $executeRaw that just resolves would
        // serialise nothing and the concurrency test would prove nothing.
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

const build = (prisma: any) => new LiveTrackingService(prisma);

const active = (prisma: any, driverId: string, companyId = COMPANY) =>
  prisma.__rows.filter((r) => r.driverId === driverId && r.companyId === companyId && r.isActive);

describe('LiveTrackingService — one active session per driver', () => {
  it('ends the previous session when a new one starts', async () => {
    const prisma = makePrisma();
    const svc = build(prisma);

    await svc.startSession(COMPANY, { driverId: 'drv-1' } as any);
    await svc.startSession(COMPANY, { driverId: 'drv-1' } as any);

    expect(active(prisma, 'drv-1')).toHaveLength(1);
  });

  it('leaves exactly one active session when two starts overlap', async () => {
    // FAILED BEFORE: both calls ended the old session and both created a new one.
    // End-then-create in two statements is not an invariant; the gap between
    // them is where the second start slips through.
    const prisma = makePrisma();
    const svc = build(prisma);

    await Promise.all([
      svc.startSession(COMPANY, { driverId: 'drv-1' } as any),
      svc.startSession(COMPANY, { driverId: 'drv-1' } as any),
    ]);

    expect(active(prisma, 'drv-1')).toHaveLength(1);
  });

  it('performs the start inside a tenant transaction', async () => {
    const prisma = makePrisma();
    await build(prisma).startSession(COMPANY, { driverId: 'drv-1' } as any);
    expect(prisma.__tenants).toContain(COMPANY);
  });

  it('does not end another driver’s session', async () => {
    const prisma = makePrisma();
    const svc = build(prisma);

    await svc.startSession(COMPANY, { driverId: 'drv-1' } as any);
    await svc.startSession(COMPANY, { driverId: 'drv-2' } as any);

    expect(active(prisma, 'drv-1')).toHaveLength(1);
    expect(active(prisma, 'drv-2')).toHaveLength(1);
  });

  it('does not end another tenant’s session for the same driver id', async () => {
    const prisma = makePrisma();
    const svc = build(prisma);

    await svc.startSession(OTHER, { driverId: 'drv-1' } as any);
    await svc.startSession(COMPANY, { driverId: 'drv-1' } as any);

    expect(active(prisma, 'drv-1', OTHER)).toHaveLength(1);
    expect(active(prisma, 'drv-1', COMPANY)).toHaveLength(1);
  });
});

describe('LiveTrackingService — session is tenant-scoped', () => {
  const seed = (prisma: any, over: any = {}) => {
    const row = {
      id: 'sess-1',
      companyId: COMPANY,
      driverId: 'drv-1',
      isActive: true,
      distanceCovered: 0,
      stopsCompleted: 0,
      currentLat: null,
      currentLng: null,
      ...over,
    };
    prisma.__rows.push(row);
    return row;
  };

  for (const [name, call] of [
    ['updateLocation', (svc: any) => svc.updateLocation('sess-1', COMPANY, { lat: 1, lng: 2 })],
    ['stopCompleted', (svc: any) => svc.stopCompleted('sess-1', COMPANY, {})],
    ['endSession', (svc: any) => svc.endSession('sess-1', COMPANY)],
  ] as const) {
    it(`${name} cannot touch another tenant’s session`, async () => {
      const prisma = makePrisma();
      seed(prisma, { companyId: OTHER });
      await expect(call(build(prisma))).rejects.toThrow(NotFoundException);
    });
  }

  it('endSession ends the driver’s own session', async () => {
    const prisma = makePrisma();
    seed(prisma);
    const out = await build(prisma).endSession('sess-1', COMPANY);
    expect(out.isActive).toBe(false);
    expect(active(prisma, 'drv-1')).toHaveLength(0);
  });

  it('a second endSession is refused rather than silently re-ending', async () => {
    const prisma = makePrisma();
    seed(prisma);
    await build(prisma).endSession('sess-1', COMPANY);
    await expect(build(prisma).endSession('sess-1', COMPANY)).rejects.toThrow(NotFoundException);
  });
});
