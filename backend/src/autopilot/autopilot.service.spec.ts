import { ForbiddenException } from '@nestjs/common';
import { AutopilotService } from './autopilot.service';

/**
 * AUTOPILOT — the thing that assigns drivers on its own.
 *
 * detectSignals finds pickups that are PENDING with no driver. autoAssign
 * then picks the least-loaded available driver and writes the assignment.
 * That gap between reading "unassigned" and writing "assigned" is the whole
 * risk surface of an autonomous actor: two overlapping runs both see the same
 * unclaimed pickup and both claim it.
 */

const COMPANY = 'co-1';
const OTHER = 'co-2';

/** A PENDING collection created long enough ago to qualify for auto-assign. */
const stale = (over: any = {}) => ({
  id: 'col-1',
  clientName: 'Acme',
  pickupAddress: '12 Main Rd',
  // The detection query is PENDING + driverId null, so a seed row without
  // those is invisible to it — which made the detection tests fail for a
  // reason that had nothing to do with the service.
  status: 'PENDING',
  driverId: null,
  createdAt: new Date(Date.now() - 120 * 60 * 1000),
  scheduledAt: null,
  ...over,
});

function makeHarness(opts: {
  collections?: any[];
  drivers?: any[];
  loads?: Record<string, number>;
  entitled?: boolean;
} = {}) {
  const collections: any[] = (opts.collections ?? [stale()]).map((c) => ({ ...c }));
  // Drivers must carry companyId or the tenant filter matches nothing, which
  // silently sends every run down the "no available driver" path.
  const drivers: any[] = (opts.drivers ?? [
    { id: 'drv-1', name: 'Sipho', companyId: COMPANY },
    { id: 'drv-2', name: 'Thandi', companyId: COMPANY },
  ]).map((d) => ({ ...d }));
  const loads = opts.loads ?? { 'drv-1': 0, 'drv-2': 1 };

  const chatMessages: any[] = [];
  const events: any[] = [];
  const staffNotifications: any[] = [];
  const emits: any[] = [];

  const collection = {
    findMany: jest.fn(async ({ where }: any) => {
      return collections.filter((c) => {
        if (where.companyId !== undefined && c.companyId !== where.companyId) return false;
        if (where.status !== undefined && c.status !== where.status) return false;
        if ('driverId' in where && c.driverId !== where.driverId) return false;
        if ('createdAt' in where) return false;
        return true;
      });
    }),
    count: jest.fn(async ({ where }: any) => loads[where.driverId] ?? 0),
    findFirst: jest.fn(async ({ where }: any) =>
      collections.find(
        (c) => c.id === where.id && (where.companyId === undefined || c.companyId === where.companyId),
      ) ?? null,
    ),
    // Models Prisma's updateMany — a WHERE that carries the expected state, so
    // the database decides who wins.
    updateMany: jest.fn(async ({ where, data }: any) => {
      let n = 0;
      for (const c of collections) {
        const ok =
          c.id === where.id &&
          (where.companyId === undefined || c.companyId === where.companyId) &&
          (where.status === undefined || c.status === where.status) &&
          (!('driverId' in where) || c.driverId === where.driverId);
        if (ok) {
          Object.assign(c, data);
          n += 1;
        }
      }
      return { count: n };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const c = collections.find((x) => x.id === where.id);
      if (!c) throw new Error('not found');
      Object.assign(c, data);
      return { ...c };
    }),
  };

  const prisma: any = {
    collection,
    driver: {
      findMany: jest.fn(async ({ where }: any) =>
        drivers.filter((d) => where.companyId === undefined || d.companyId === where.companyId),
      ),
    },
    driverChatMessage: {
      create: jest.fn(async ({ data }: any) => {
        chatMessages.push(data);
        return { ...data };
      }),
    },
    shipment: { findMany: jest.fn(async () => []) },
    waybill: { findMany: jest.fn(async () => []) },
    aiEvent: {
      create: jest.fn(async ({ data }: any) => {
        events.push(data);
        return { ...data };
      }),
      findMany: jest.fn(async () => events),
    },
    company: {
      findUnique: jest.fn(async ({ where }: any) => ({
        id: where.id,
        autopilotEnabled: true,
        autopilotAggression: 'MEDIUM',
      })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    withTenant: jest.fn(async (_companyId: string, fn: any) => fn(prisma)),
    __collections: collections,
    __chat: chatMessages,
    __events: events,
  };

  const billing: any = { hasFeature: jest.fn(async () => opts.entitled ?? true) };
  const clawLogic: any = {};
  const config: any = { get: jest.fn((_k: string, d?: any) => d) };
  const gateway: any = {
    emitDispatchAssigned: jest.fn((_c: string, p: any) => emits.push({ kind: 'dispatch', p })),
    emitToCompany: jest.fn((_c: string, _e: string, p: any) => emits.push({ kind: 'company', p })),
  };
  const notifications: any = {
    create: jest.fn(async (companyId: string, dto: any) => {
      staffNotifications.push({ companyId, ...dto });
      return dto;
    }),
    __all: staffNotifications,
  };

  return {
    prisma,
    billing,
    config,
    gateway,
    notifications,
    staffNotifications,
    emits,
    svc: new AutopilotService(prisma, billing, clawLogic, config, gateway, notifications as any),
  };
}

const withCompany = (rows: any[]) => rows.map((r) => ({ companyId: COMPANY, ...r }));

describe('AutopilotService — an autonomous assignment happens exactly once', () => {
  const twoRuns = async (h: any) => {
    // detectSignals is where a run learns what is unassigned. Two overlapping
    // runs both see the same pickup before either has written.
    const runOnce = async () => {
      const signals = await h.svc.detectSignals(COMPANY);
      const out = [];
      for (const sig of signals) {
        out.push(await (h.svc as any).execute(COMPANY, sig));
      }
      return out;
    };
    return Promise.all([runOnce(), runOnce()]);
  };

  it('detects a pickup that has been unassigned too long', async () => {
    const h = makeHarness({ collections: withCompany([stale()]) });
    const signals = await h.svc.detectSignals(COMPANY);
    expect(signals.some((s: any) => s.kind === 'UNASSIGNED_COLLECTION')).toBe(true);
  });

  it('assigns it to the least-loaded driver', async () => {
    const h = makeHarness({
      collections: withCompany([stale()]),
      drivers: withCompany([{ id: 'drv-1', name: 'Sipho' }, { id: 'drv-2', name: 'Thandi' }]),
      loads: { 'drv-1': 3, 'drv-2': 1 },
    });
    await (h.svc as any).execute(COMPANY, (await h.svc.detectSignals(COMPANY))[0]);
    expect(h.prisma.__collections[0].driverId).toEqual('drv-2');
  });

  it('does not assign two different drivers when runs overlap', async () => {
    // FAILED BEFORE: detectSignals reads PENDING + driverId null; the update
    // writes by id alone. Two overlapping runs both read the same unclaimed
    // pickup, both pick a driver, and the second overwrites the first — so the
    // driver who was told to go is no longer the driver on the job.
    const h = makeHarness({
      collections: withCompany([stale()]),
      loads: { 'drv-1': 0, 'drv-2': 0 },
    });
    await twoRuns(h);
    expect(h.prisma.__collections[0].driverId).toEqual('drv-1');
  });

  it('tells only one driver to go', async () => {
    // The expensive consequence: two drivers driving to the same pickup.
    const h = makeHarness({
      collections: withCompany([stale()]),
      loads: { 'drv-1': 0, 'drv-2': 0 },
    });
    await twoRuns(h);
    expect(h.prisma.__chat).toHaveLength(1);
  });

  it('moves the collection to ASSIGNED exactly once', async () => {
    const h = makeHarness({
      collections: withCompany([stale()]),
      loads: { 'drv-1': 0, 'drv-2': 0 },
    });
    await twoRuns(h);
    expect(h.prisma.__collections[0].status).toEqual('ASSIGNED');
    expect(h.prisma.__events.filter((e: any) => e.body?.includes('Auto-assigned')).length).toEqual(1);
  });

  it('leaves the pickup alone when no driver is available', async () => {
    const h = makeHarness({ collections: withCompany([stale()]), drivers: [] });
    await (h.svc as any).execute(COMPANY, (await h.svc.detectSignals(COMPANY))[0]);
    expect(h.prisma.__collections[0].driverId).toBeNull();
    expect(h.prisma.__chat).toHaveLength(0);
  });
});

describe('AutopilotService — gating and scoping', () => {
  it('refuses to run for a tenant without the feature', async () => {
    const h = makeHarness({ entitled: false });
    await expect(h.svc.run(COMPANY)).rejects.toThrow(ForbiddenException);
  });

  it('does not see another tenant’s unassigned pickups', async () => {
    const h = makeHarness({
      collections: [{ ...stale(), companyId: OTHER }],
    });
    const signals = await h.svc.detectSignals(COMPANY);
    expect(signals.some((s: any) => s.kind === 'UNASSIGNED_COLLECTION')).toBe(false);
  });

  it('does not assign another tenant’s collection', async () => {
    const h = makeHarness({
      collections: [{ ...stale({ id: 'col-1' }), companyId: OTHER }],
    });
    // Smuggle a foreign entity through the private path the way a stale signal
    // would: the guard belongs in the write, not only in the detection.
    const sig: any = {
      kind: 'UNASSIGNED_COLLECTION', severity: 'medium', confidence: 0.9,
      entity: { type: 'collection', id: 'col-1' }, summary: 'x',
      recommendedAction: 'x', autoActionable: true,
    };
    await (h.svc as any).execute(COMPANY, sig);
    expect(h.prisma.__collections[0].driverId).toBeNull();
  });

  it('rejects an invalid aggression setting', async () => {
    const h = makeHarness();
    await expect(h.svc.setConfig(COMPANY, { aggression: 'NUCLEAR' })).rejects.toThrow(ForbiddenException);
  });

  it('accepts a valid aggression setting', async () => {
    const h = makeHarness();
    await h.svc.setConfig(COMPANY, { aggression: 'high' });
    expect(h.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { autopilotAggression: 'HIGH' } }),
    );
  });

  it('refuses config changes for a tenant without the feature', async () => {
    const h = makeHarness({ entitled: false });
    await expect(h.svc.setConfig(COMPANY, { enabled: true })).rejects.toThrow(ForbiddenException);
  });
});
