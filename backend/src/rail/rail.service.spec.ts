/**
 * Rail consignment service — Wave 1.
 *
 * Covers: the `rail` entitlement gate, tenant isolation (consignments, wagons,
 * legs), lifecycle timestamps, dwell maths and the audit trail. Prisma is an
 * in-memory fake so isolation is tested by behaviour.
 *
 * Wave 3 adds the dangerous-goods (DG) fields, the readiness summary on the list,
 * `getDangerousGoods`, status validation, and the dispatch gate (see the last block).
 */
import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RailService } from './rail.service';
import { RAIL_AUDIT_ACTION, RailActor } from './rail-audit';

const H = 3_600_000;
const MANAGER: RailActor = { id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: UserRole.MANAGER };
const MOVEMENT_TRANSITIONS = [
  ['LOADING', 'DEPARTED'],
  ['DEPARTED', 'IN_TRANSIT'],
  ['DEPARTED', 'AT_INTERCHANGE'],
] as const;
const NON_MOVEMENT_TRANSITIONS = [
  ['PLANNED', 'WAGONS_ALLOCATED'],
  ['WAGONS_ALLOCATED', 'LOADING'],
  ['IN_TRANSIT', 'ARRIVED'],
  ['ARRIVED', 'OFFLOADED'],
  ['OFFLOADED', 'COMPLETED'],
  ['PLANNED', 'CANCELLED'],
] as const;

type Row = Record<string, any>;

function makeDb() {
  const db = {
    consignments: [] as Row[], events: [] as Row[], wagons: [] as Row[], legs: [] as Row[], aiEvents: [] as Row[], seq: 0,
    tariffs: [] as Row[], auditRows: [] as Row[],
  };
  const id = (p: string) => `${p}-${++db.seq}`;

  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true;
      if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('in' in cond) return cond.in.includes(row[key]);
        if ('gte' in cond) return row[key] >= cond.gte;
        if ('contains' in cond) return String(row[key] ?? '').toLowerCase().includes(String(cond.contains).toLowerCase());
      }
      return row[key] === cond;
    });

  const hydrate = (c: Row) => ({
    ...c,
    wagons: db.wagons.filter((w) => w.consignmentId === c.id).map((w) => ({ ...w })),
    legs: db.legs.filter((l) => l.consignmentId === c.id).map((l) => ({ ...l })),
    events: db.events.filter((e) => e.consignmentId === c.id).map((e) => ({ ...e })),
  });

  const prisma: any = {
    railConsignment: {
      count: jest.fn(async ({ where }: any) => db.consignments.filter((c) => matches(c, where)).length),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: id('con'), status: 'PLANNED', actualDeparture: null, actualArrival: null, createdAt: new Date(), ...data,
        };
        db.consignments.push(row);
        return { ...row };
      }),
      findFirst: jest.fn(async ({ where, include }: any) => {
        const row = db.consignments.find((c) => matches(c, where));
        return row ? (include ? hydrate(row) : { ...row }) : null;
      }),
      findMany: jest.fn(async ({ where }: any) => db.consignments.filter((c) => matches(c, where)).map((c) => ({ ...c }))),
      update: jest.fn(async ({ where, data }: any) => {
        const row = db.consignments.find((c) => c.id === where.id);
        Object.assign(row, data);
        return { ...row };
      }),
      groupBy: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _sum: { tonnage: 0 } })),
    },
    railConsignmentEvent: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: id('evt'), reachedAt: new Date(), ...data };
        db.events.push(row);
        return row;
      }),
    },
    wagon: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: id('wag'), ...data };
        db.wagons.push(row);
        return { ...row };
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const keep = db.wagons.filter((w) => !matches(w, where));
        const count = db.wagons.length - keep.length;
        db.wagons = keep;
        return { count };
      }),
      count: jest.fn(async () => 0),
      findMany: jest.fn(async ({ where }: any) => db.wagons.filter((w) => matches(w, where)).map((w) => ({ ...w }))),
    },
    intermodalLeg: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: id('leg'), status: 'PENDING', actualStart: null, actualEnd: null, dwellHours: null, ...data };
        db.legs.push(row);
        return { ...row };
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const row = db.legs.find((l) => matches(l, where));
        return row ? { ...row } : null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = db.legs.find((l) => l.id === where.id);
        Object.assign(row, data);
        return { ...row };
      }),
      // Compare-and-set used by the hardened advanceLeg: only matches when the
      // leg is still in the status it was validated against.
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = db.legs.find((l) => matches(l, where));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => {
        const row = db.legs.find((l) => matches(l, where));
        if (!row) throw new Error('leg not found');
        return { ...row };
      }),
      aggregate: jest.fn(async () => ({ _avg: { dwellHours: null } })),
      findMany: jest.fn(async ({ where }: any) => db.legs.filter((l) => matches(l, where)).map((l) => ({ ...l }))),
    },
    // Handoff gating reads: the saved tariff calculation for the consignment
    // and the readiness approval written to the audit trail.
    railTariffCalculation: {
      findFirst: jest.fn(async ({ where }: any) => db.tariffs.find((t) => matches(t, where)) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: id('tc'), createdAt: new Date(), ...data };
        db.tariffs.push(row);
        return row;
      }),
    },
    auditLog: {
      findFirst: jest.fn(async ({ where }: any) => db.auditRows.find((a) => matches(a, where)) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: id('aud'), createdAt: new Date(), ...data };
        db.auditRows.push(row);
        return row;
      }),
    },
    aiEvent: {
      create: jest.fn(async ({ data }: any) => {
        db.aiEvents.push(data);
        return data;
      }),
    },
  };
  prisma.$transaction = jest.fn((callback: (tx: any) => Promise<any>) => callback(prisma));
  (prisma as any).withTenant = jest.fn((_companyId: string, callback: (tx: any) => Promise<any>) => callback(prisma));

  const seedConsignment = (over: Row = {}) => {
    const row = {
      id: id('con'), companyId: 'A', consignmentNumber: `RAIL-2026-9${db.seq}`, status: 'PLANNED', commodity: 'Manganese',
      actualDeparture: null, actualArrival: null, createdAt: new Date(), ...over,
    };
    db.consignments.push(row);
    return row;
  };
  /** Seed a PRICED tariff calculation — the billing evidence a handoff requires. */
  const seedPricedTariff = (consignmentId: string, over: Row = {}) => {
    const row = { id: id('tc'), companyId: 'A', consignmentId, status: 'PRICED', holdTriggered: false, createdAt: new Date(), ...over };
    db.tariffs.push(row);
    return row;
  };
  /** Approve handoff readiness the way the API does: through the audit trail. */
  const seedHandoffApproval = (legId: string, fingerprint: string, companyId = 'A') => {
    const row = {
      id: id('aud'), action: 'handoff.readiness_approved', targetType: 'rail_intermodal_leg', targetId: legId,
      actorType: 'tenant', actorId: 'u-mgr', actorEmail: 'mgr@flowops.test', createdAt: new Date(),
      metadata: { module: 'rail', companyId, fingerprint },
    };
    db.auditRows.push(row);
    return row;
  };
  const seedWagon = (consignmentId: string, over: Row = {}) => {
    const row = { id: id('wag'), consignmentId, wagonNumber: 'MNR-000001', ...over };
    db.wagons.push(row);
    return row;
  };
  const seedLeg = (consignmentId: string, over: Row = {}) => {
    const row = { id: id('leg'), consignmentId, sequence: 1, mode: 'RAIL', status: 'PENDING', actualStart: null, actualEnd: null, dwellHours: null, ...over };
    db.legs.push(row);
    return row;
  };
  return { db, prisma, seedConsignment, seedWagon, seedLeg, seedPricedTariff, seedHandoffApproval };
}

function makeService(opts: { entitled?: boolean } = {}) {
  const harness = makeDb();
  const billing = { hasFeature: jest.fn().mockResolvedValue(opts.entitled ?? true) };
  // AuditService.record persists to `audit_logs` in production, which is what
  // the handoff approval lookup reads back — mirror that here.
  const audit = {
    record: jest.fn(async (entry: any) => {
      harness.db.auditRows.push({ id: `aud-${harness.db.auditRows.length + 1}`, createdAt: new Date(), ...entry });
    }),
  };
  const svc = new RailService(harness.prisma as any, billing as any, audit as any);
  return { svc, billing, audit, ...harness };
}

const auditEntries = (audit: { record: jest.Mock }) => audit.record.mock.calls.map(([e]) => e);
const auditActions = (audit: { record: jest.Mock }) => auditEntries(audit).map((e) => e.action);

afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
describe('rail entitlement gate', () => {
  it('every public method is refused without the `rail` feature, before any data access', async () => {
    const { svc, prisma, billing, audit } = makeService({ entitled: false });
    const calls: Array<() => Promise<unknown>> = [
      () => svc.create('A', { commodity: 'Coal' }, MANAGER),
      () => svc.list('A'),
      () => svc.get('A', 'c1'),
      () => svc.getDangerousGoods('A', 'c1'),
      () => svc.update('A', 'c1', {}, MANAGER), // routes through get()
      () => svc.cancel('A', 'c1', MANAGER),
      () => svc.advanceStatus('A', 'c1', 'DEPARTED', MANAGER),
      () => svc.addWagon('A', 'c1', { wagonNumber: 'W1' }, MANAGER),
      () => svc.removeWagon('A', 'c1', 'w1', MANAGER),
      () => svc.addLeg('A', 'c1', { sequence: 1, mode: 'RAIL' as any }, MANAGER),
      () => svc.advanceLeg('A', 'c1', 'l1', 'COMPLETED', MANAGER),
      () => svc.overview('A'),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenException);

    expect(billing.hasFeature).toHaveBeenCalledTimes(calls.length);
    expect(billing.hasFeature).toHaveBeenCalledWith('A', 'rail');
    for (const [name, table] of Object.entries(prisma)) {
      if (name === '$transaction' || name === 'withTenant') continue;
      for (const fn of Object.values(table)) expect(fn).not.toHaveBeenCalled();
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect((prisma as any).withTenant).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('the upgrade message tells the tenant what to do', async () => {
    const { svc } = makeService({ entitled: false });
    await expect(svc.list('A')).rejects.toThrow(/Enterprise feature/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('tenant isolation', () => {
  it('a consignment of tenant A is invisible to tenant B (404, not 403)', async () => {
    const { svc, prisma, seedConsignment } = makeService();
    const c = seedConsignment({ companyId: 'A' });
    await expect(svc.get('B', c.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.railConsignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: c.id, companyId: 'B' } }),
    );
  });

  it('list returns only the caller\'s consignments, whatever the filters', async () => {
    const { svc, seedConsignment } = makeService();
    seedConsignment({ companyId: 'A', consignmentNumber: 'A-1', commodity: 'Coal', clientName: 'Seriti' });
    seedConsignment({ companyId: 'B', consignmentNumber: 'B-1', commodity: 'Coal', clientName: 'Seriti' });
    expect((await svc.list('A')).map((c) => c.consignmentNumber)).toEqual(['A-1']);
    expect((await svc.list('B', { commodity: 'coal' })).map((c) => c.consignmentNumber)).toEqual(['B-1']);
    // free-text search is OR-ed across fields — it must still stay inside the tenant
    expect((await svc.list('A', { q: 'seriti' })).map((c) => c.consignmentNumber)).toEqual(['A-1']);
  });

  it('every mutating method refuses another tenant\'s consignment and leaves no side effects', async () => {
    const { svc, db, audit, seedConsignment, seedWagon, seedLeg } = makeService();
    const c = seedConsignment({ companyId: 'A' });
    const w = seedWagon(c.id);
    const l = seedLeg(c.id);
    const before = JSON.stringify([db.consignments, db.wagons, db.legs, db.events]);

    const attempts = [
      svc.update('B', c.id, { commodity: 'Hijacked' }, MANAGER),
      svc.cancel('B', c.id, MANAGER),
      svc.advanceStatus('B', c.id, 'DEPARTED', MANAGER),
      svc.addWagon('B', c.id, { wagonNumber: 'EVIL-1' }, MANAGER),
      svc.removeWagon('B', c.id, w.id, MANAGER),
      svc.addLeg('B', c.id, { sequence: 9, mode: 'ROAD' as any }, MANAGER),
      svc.advanceLeg('B', c.id, l.id, 'COMPLETED', MANAGER),
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toBeInstanceOf(NotFoundException);

    expect(JSON.stringify([db.consignments, db.wagons, db.legs, db.events])).toBe(before);
    expect(audit.record).not.toHaveBeenCalled();
    expect(db.aiEvents).toHaveLength(0);
  });

  it('a wagon id from ANOTHER consignment cannot be deleted through this one', async () => {
    const { svc, db, audit, seedConsignment, seedWagon } = makeService();
    const mine = seedConsignment({ companyId: 'A' });
    const theirs = seedConsignment({ companyId: 'B' });
    const theirWagon = seedWagon(theirs.id);

    const res = await svc.removeWagon('A', mine.id, theirWagon.id, MANAGER);

    expect(res).toEqual({ deleted: false });
    expect(db.wagons.map((w) => w.id)).toContain(theirWagon.id);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('a leg id from another consignment is a 404', async () => {
    const { svc, seedConsignment, seedLeg } = makeService();
    const mine = seedConsignment({ companyId: 'A' });
    const other = seedConsignment({ companyId: 'A' });
    const otherLeg = seedLeg(other.id);
    await expect(svc.advanceLeg('A', mine.id, otherLeg.id, 'COMPLETED', MANAGER)).rejects.toThrow(/Intermodal leg not found/);
  });

  it('consignment numbers count per tenant and per year', async () => {
    const { svc, seedConsignment } = makeService();
    const year = new Date().getFullYear();
    seedConsignment({ companyId: 'A' });
    seedConsignment({ companyId: 'A' });
    const forB = await svc.create('B', { commodity: 'Coal' }, MANAGER);
    expect(forB.consignmentNumber).toBe(`RAIL-${year}-00001`); // A's two do not count against B
    const forA = await svc.create('A', { commodity: 'Coal' }, MANAGER);
    expect(forA.consignmentNumber).toBe(`RAIL-${year}-00003`);
  });

  it('create always stamps the caller\'s company — nothing in the DTO can override it', async () => {
    const { svc, db } = makeService();
    await svc.create('A', { commodity: 'Coal', companyId: 'B' } as any, MANAGER);
    expect(db.consignments[0].companyId).toBe('A');
  });

  it('overview() scopes every aggregate to the caller\'s company', async () => {
    const { svc, prisma } = makeService();
    await svc.overview('A');
    const wheres: any[] = [
      ...(prisma.railConsignment.groupBy as jest.Mock).mock.calls.map(([a]) => a.where),
      ...(prisma.railConsignment.count as jest.Mock).mock.calls.map(([a]) => a.where),
      ...(prisma.railConsignment.aggregate as jest.Mock).mock.calls.map(([a]) => a.where),
      ...(prisma.railConsignment.findMany as jest.Mock).mock.calls.map(([a]) => a.where),
      ...(prisma.wagon.count as jest.Mock).mock.calls.map(([a]) => a.where),
      ...(prisma.intermodalLeg.aggregate as jest.Mock).mock.calls.map(([a]) => a.where),
      ...(prisma.intermodalLeg.findMany as jest.Mock).mock.calls.map(([a]) => a.where),
    ];
    expect(wheres.length).toBeGreaterThanOrEqual(8);
    for (const w of wheres) {
      expect(w.companyId === 'A' || w.consignment?.companyId === 'A').toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('consignment lifecycle', () => {
  it('create: opens the timeline, audits consignment.created and returns the record', async () => {
    const { svc, db, audit } = makeService();
    const c = await svc.create(
      'A',
      { commodity: 'Manganese', corridor: 'Ore', tonnage: 6000, railOperator: 'TOC-1', originSiding: 'Hotazel', plannedDeparture: '2026-10-10T06:00:00Z' },
      MANAGER,
    );
    expect(c).toMatchObject({ companyId: 'A', status: 'PLANNED', commodity: 'Manganese', corridor: 'Ore' });
    expect(c.plannedDeparture).toEqual(new Date('2026-10-10T06:00:00Z'));
    expect(db.events).toEqual([expect.objectContaining({ consignmentId: c.id, status: 'PLANNED', location: 'Hotazel' })]);
    expect(auditEntries(audit)).toEqual([
      expect.objectContaining({
        action: 'consignment.created', actorType: 'tenant', actorId: 'u-mgr', actorEmail: 'mia@toc.co.za',
        targetType: 'rail_consignment', targetId: c.id, targetName: c.consignmentNumber,
        metadata: expect.objectContaining({ module: 'rail', companyId: 'A', actorRole: 'MANAGER', commodity: 'Manganese', corridor: 'Ore', tonnage: 6000 }),
      }),
    ]);
  });

  it('advanceStatus: DEPARTED stamps actualDeparture once; ARRIVED stamps actualArrival once', async () => {
    const { svc, seedConsignment } = makeService();
    const c = seedConsignment();

    await svc.advanceStatus('A', c.id, 'WAGONS_ALLOCATED', MANAGER);
    await svc.advanceStatus('A', c.id, 'LOADING', MANAGER);
    const departed = await svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER, 'left yard', 'Hotazel');
    expect(departed.actualDeparture).toBeInstanceOf(Date);
    const firstStamp = departed.actualDeparture;

    await new Promise((r) => setTimeout(r, 5));
    const again = await svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER);
    expect(again.actualDeparture).toEqual(firstStamp); // never overwritten

    await svc.advanceStatus('A', c.id, 'IN_TRANSIT', MANAGER);
    const arrived = await svc.advanceStatus('A', c.id, 'ARRIVED', MANAGER);
    expect(arrived.actualArrival).toBeInstanceOf(Date);
  });

  it('advanceStatus: records a timeline event, an AiEvent and audits from → to', async () => {
    const { svc, db, audit, seedConsignment } = makeService();
    const c = seedConsignment({ status: 'LOADING', consignmentNumber: 'RAIL-2026-00042' });

    await svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER, 'left yard', 'Hotazel');

    expect(db.events).toEqual([expect.objectContaining({ consignmentId: c.id, status: 'DEPARTED', note: 'left yard', location: 'Hotazel' })]);
    expect(db.aiEvents).toEqual([expect.objectContaining({ companyId: 'A', type: 'RAIL_MILESTONE', title: 'RAIL-2026-00042: departed' })]);
    expect(auditEntries(audit)).toEqual([
      expect.objectContaining({
        action: RAIL_AUDIT_ACTION.CONSIGNMENT_STATUS_ADVANCED, targetId: c.id, targetName: 'RAIL-2026-00042',
        metadata: expect.objectContaining({ from: 'LOADING', to: 'DEPARTED', location: 'Hotazel', note: 'left yard', companyId: 'A' }),
      }),
    ]);
  });

  it('advanceStatus: a failing AiEvent write never blocks the transition', async () => {
    const { svc, prisma, seedConsignment } = makeService();
    (prisma.aiEvent.create as jest.Mock).mockRejectedValue(new Error('events table locked'));
    const c = seedConsignment({ status: 'DEPARTED' });
    await expect(svc.advanceStatus('A', c.id, 'IN_TRANSIT', MANAGER)).resolves.toMatchObject({ status: 'IN_TRANSIT' });
  });

  it('cancel: soft-cancels (never deletes), records the event and audits consignment.cancelled with the prior status', async () => {
    const { svc, db, audit, seedConsignment } = makeService();
    const c = seedConsignment({ status: 'IN_TRANSIT' });

    const out = await svc.cancel('A', c.id, MANAGER);

    expect(out.status).toBe('CANCELLED');
    expect(db.consignments).toHaveLength(1); // still there
    expect(db.events).toEqual([expect.objectContaining({ status: 'CANCELLED', note: 'Consignment cancelled' })]);
    expect(auditEntries(audit)).toEqual([
      expect.objectContaining({ action: 'consignment.cancelled', targetId: c.id, metadata: expect.objectContaining({ from: 'IN_TRANSIT' }) }),
    ]);
  });

  it('update: audits the fields that were changed, converting dates', async () => {
    const { svc, audit, seedConsignment } = makeService();
    const c = seedConsignment();
    const out = await svc.update('A', c.id, { commodity: 'Chrome', plannedArrival: '2026-10-12T00:00:00Z' }, MANAGER);
    expect(out.commodity).toBe('Chrome');
    expect(out.plannedArrival).toEqual(new Date('2026-10-12T00:00:00Z'));
    expect(auditEntries(audit)[0]).toMatchObject({ action: 'consignment.updated', metadata: { fields: ['commodity', 'plannedArrival'] } });
  });

  it('wagons: add and remove are audited against the wagon, with the consignment number', async () => {
    const { svc, db, audit, seedConsignment } = makeService();
    const c = seedConsignment({ consignmentNumber: 'RAIL-2026-00007' });

    const wagon = await svc.addWagon('A', c.id, { wagonNumber: 'SAR-064213', loadedTonnes: 60 }, MANAGER);
    expect(db.wagons).toHaveLength(1);
    const removed = await svc.removeWagon('A', c.id, wagon.id, MANAGER);

    expect(removed).toEqual({ deleted: true });
    expect(db.wagons).toHaveLength(0);
    expect(auditEntries(audit)).toEqual([
      expect.objectContaining({
        action: 'consignment.wagon_added', targetType: 'rail_wagon', targetId: wagon.id, targetName: 'SAR-064213',
        metadata: expect.objectContaining({ consignmentNumber: 'RAIL-2026-00007' }),
      }),
      expect.objectContaining({ action: 'consignment.wagon_removed', targetType: 'rail_wagon', targetId: wagon.id }),
    ]);
  });

  it('wagons: the corridor-envelope particulars (axles, gauge, profile) are persisted, and default to NULL — never to a value', async () => {
    const { svc, db, seedConsignment } = makeService();
    const c = seedConsignment();
    await svc.addWagon('A', c.id, { wagonNumber: 'FULL-1', axles: 4, gauge: 'CAPE_1067MM' as any, vehicleProfile: 'B' as any }, MANAGER);
    await svc.addWagon('A', c.id, { wagonNumber: 'BARE-1' }, MANAGER);
    expect(db.wagons[0]).toMatchObject({ axles: 4, gauge: 'CAPE_1067MM', vehicleProfile: 'B' });
    expect(db.wagons[1]).toMatchObject({ axles: null, gauge: null, vehicleProfile: null });
  });

  describe('intermodal legs', () => {
    it('addLeg is audited', async () => {
      const { svc, audit, seedConsignment } = makeService();
      const c = seedConsignment();
      const leg = await svc.addLeg('A', c.id, { sequence: 2, mode: 'PORT' as any }, MANAGER);
      expect(auditEntries(audit)[0]).toMatchObject({
        action: 'consignment.leg_added', targetType: 'rail_intermodal_leg', targetId: leg.id, metadata: { mode: 'PORT', sequence: 2 },
      });
    });

    it('IN_PROGRESS stamps actualStart; a readiness-approved HANDED_OVER stamps actualEnd and computes dwell hours', async () => {
      const { svc, audit, seedConsignment, seedLeg, seedPricedTariff, seedHandoffApproval } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, {
        actualStart: new Date(Date.now() - 5 * H), status: 'IN_PROGRESS',
        handler: 'Transnet Freight Rail', toLocation: 'Hotazel Yard',
      });
      seedPricedTariff(c.id);
      const readiness = await svc.handoffReadiness('A', c.id, leg.id);
      expect(readiness.ready).toBe(true);
      seedHandoffApproval(leg.id, readiness.fingerprint);

      const out = await svc.advanceLeg('A', c.id, leg.id, 'HANDED_OVER', MANAGER);

      expect(out.actualEnd).toBeInstanceOf(Date);
      expect(out.dwellHours).toBeCloseTo(5, 1);
      expect(auditActions(audit)).toEqual(['consignment.leg_advanced']);
      expect(auditEntries(audit)[0]).toMatchObject({
        action: 'consignment.leg_advanced', metadata: { from: 'IN_PROGRESS', to: 'HANDED_OVER' },
      });
      expect(auditEntries(audit)[0].metadata.dwellHours).toBeCloseTo(5, 1);
      // The handover references the approval's evidence fingerprint.
      expect(auditEntries(audit)[0].metadata.handoffFingerprint).toBe(readiness.fingerprint);
    });

    it('starting a leg stamps actualStart and computes no dwell yet', async () => {
      const { svc, seedConsignment, seedLeg } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id);
      const out = await svc.advanceLeg('A', c.id, leg.id, 'IN_PROGRESS', MANAGER);
      expect(out.actualStart).toBeInstanceOf(Date);
      expect(out.dwellHours).toBeNull();
    });

    it('dwell never goes negative', async () => {
      const { svc, seedConsignment, seedLeg } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { status: 'HANDED_OVER', actualStart: new Date(Date.now() + 3 * H) }); // clock skew: start "in the future"
      const out = await svc.advanceLeg('A', c.id, leg.id, 'COMPLETED', MANAGER);
      expect(out.dwellHours).toBe(0);
    });

    it('rejects an illegal leg transition (COMPLETED is terminal) and audits the refusal without moving the leg', async () => {
      const { svc, audit, db, seedConsignment, seedLeg } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { status: 'COMPLETED', actualStart: new Date(Date.now() - 9 * H), actualEnd: new Date() });

      await expect(svc.advanceLeg('A', c.id, leg.id, 'IN_PROGRESS', MANAGER)).rejects.toThrow(/terminal/i);

      expect(db.legs[0].status).toBe('COMPLETED');
      expect(auditEntries(audit)).toEqual([
        expect.objectContaining({ action: 'consignment.leg_transition_rejected', metadata: expect.objectContaining({ from: 'COMPLETED', attempted: 'IN_PROGRESS' }) }),
      ]);
    });

    it('rejects an unknown leg status listing the valid statuses', async () => {
      const { svc, db, seedConsignment, seedLeg } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { status: 'IN_PROGRESS', actualStart: new Date() });
      await expect(svc.advanceLeg('A', c.id, leg.id, 'SHIPPED', MANAGER))
        .rejects.toThrow(/Use one of: PENDING, IN_PROGRESS, HANDED_OVER, COMPLETED, DELAYED/);
      expect(db.legs[0].status).toBe('IN_PROGRESS');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Handoff gating (evidence ordering + approval)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('handoff gating', () => {
    const startedLeg = () => ({ actualStart: new Date(Date.now() - 4 * H), status: 'IN_PROGRESS' });

    it('HANDED_OVER is refused while the billing evidence is missing — and the refusal is audited, not applied', async () => {
      const { svc, audit, db, seedConsignment, seedLeg } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { ...startedLeg(), handler: 'TFR', toLocation: 'Hotazel' });

      await expect(svc.advanceLeg('A', c.id, leg.id, 'HANDED_OVER', MANAGER))
        .rejects.toThrow(/BILLING_EVIDENCE: No saved tariff calculation/);

      expect(db.legs[0].status).toBe('IN_PROGRESS');
      expect(db.legs[0].actualEnd).toBeNull();
      expect(auditEntries(audit)).toEqual([
        expect.objectContaining({ action: 'handoff.blocked', metadata: expect.objectContaining({ attemptedStatus: 'HANDED_OVER' }) }),
      ]);
    });

    it('HANDED_OVER is refused while the leg has not started (ordering) — even with billing evidence in place', async () => {
      const { svc, seedConsignment, seedLeg, seedPricedTariff } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { status: 'PENDING', handler: 'TFR', toLocation: 'Hotazel' });
      seedPricedTariff(c.id);

      // PENDING → HANDED_OVER is itself illegal (must start first).
      await expect(svc.advanceLeg('A', c.id, leg.id, 'HANDED_OVER', MANAGER))
        .rejects.toThrow(/Illegal leg transition PENDING → HANDED_OVER/);
    });

    it('a handler and location are required before custody moves', async () => {
      const { svc, seedConsignment, seedLeg, seedPricedTariff } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { ...startedLeg() }); // no handler, no location
      seedPricedTariff(c.id);

      await expect(svc.advanceLeg('A', c.id, leg.id, 'HANDED_OVER', MANAGER))
        .rejects.toThrow(/HANDLER_ASSIGNED: No handler recorded.*LOCATION_RECORDED: No handover location recorded/s);
    });

    it('a PRICED tariff alone is not enough — a readiness approval must cover the evidence', async () => {
      const { svc, seedConsignment, seedLeg, seedPricedTariff } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { ...startedLeg(), handler: 'TFR', toLocation: 'Hotazel' });
      seedPricedTariff(c.id);

      await expect(svc.advanceLeg('A', c.id, leg.id, 'HANDED_OVER', MANAGER))
        .rejects.toThrow(/no handoff readiness approval recorded/i);
    });

    it('an approval granted before the evidence changed no longer covers it (stale approval)', async () => {
      const { svc, seedConsignment, seedLeg, seedPricedTariff, seedHandoffApproval } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { ...startedLeg(), handler: 'TFR', toLocation: 'Hotazel' });
      seedPricedTariff(c.id);
      seedHandoffApproval(leg.id, 'stale-fingerprint-from-an-earlier-evidence-state');

      await expect(svc.advanceLeg('A', c.id, leg.id, 'HANDED_OVER', MANAGER))
        .rejects.toThrow(/granted for different evidence/);
    });

    it('approveHandoffReadiness refuses while evidence is incomplete and audits the blocker list', async () => {
      const { svc, audit, seedConsignment, seedLeg } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { ...startedLeg() });
      await expect(svc.approveHandoffReadiness('A', c.id, leg.id, MANAGER))
        .rejects.toThrow(/incomplete evidence/);
      expect(auditEntries(audit)).toEqual([
        expect.objectContaining({
          action: 'handoff.readiness_blocked',
          metadata: expect.objectContaining({ blockers: expect.arrayContaining([expect.stringContaining('BILLING_EVIDENCE')]) }),
        }),
      ]);
    });

    it('the full sequence works: approve readiness, then hand over; readiness report names the approver and steps', async () => {
      const { svc, audit, seedConsignment, seedLeg, seedPricedTariff } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { ...startedLeg(), handler: 'TFR', toLocation: 'Hotazel' });
      seedPricedTariff(c.id);

      const approval = await svc.approveHandoffReadiness('A', c.id, leg.id, MANAGER, 'paperwork checked');
      expect(approval.approvedSteps).toEqual(
        expect.arrayContaining(['LEG_STARTED', 'HANDLER_ASSIGNED', 'LOCATION_RECORDED', 'BILLING_EVIDENCE', 'HOLD_CLEARED']),
      );

      const report = await svc.handoffReadiness('A', c.id, leg.id);
      expect(report).toMatchObject({ ready: true, canHandOver: true });
      expect(report.approval).toMatchObject({ approvedBy: 'mia@toc.co.za', coversCurrentEvidence: true });

      const out = await svc.advanceLeg('A', c.id, leg.id, 'HANDED_OVER', MANAGER);
      expect(out.status).toBe('HANDED_OVER');
      expect(auditActions(audit)).toEqual(['handoff.readiness_approved', 'consignment.leg_advanced']);
    });

    it('another tenant\'s approval row can never satisfy the gate', async () => {
      const { svc, seedConsignment, seedLeg, seedPricedTariff, seedHandoffApproval } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { ...startedLeg(), handler: 'TFR', toLocation: 'Hotazel' });
      seedPricedTariff(c.id);
      const readiness = await svc.handoffReadiness('A', c.id, leg.id);
      seedHandoffApproval(leg.id, readiness.fingerprint, 'B'); // approval belongs to tenant B

      await expect(svc.advanceLeg('A', c.id, leg.id, 'HANDED_OVER', MANAGER))
        .rejects.toThrow(/no handoff readiness approval recorded/i);
    });

    it('a load-adjustment hold blocks the handoff even when everything else is in place', async () => {
      const { svc, seedConsignment, seedLeg, seedPricedTariff } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { ...startedLeg(), handler: 'TFR', toLocation: 'Hotazel' });
      seedPricedTariff(c.id, { holdTriggered: true });

      const report = await svc.handoffReadiness('A', c.id, leg.id);
      expect(report.ready).toBe(false);
      expect(report.blockers.join(' ')).toMatch(/HOLD_CLEARED/);
    });

    it('IN_PROGRESS and DELAYED are not gated (only the custody handover is)', async () => {
      const { svc, seedConsignment, seedLeg } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { status: 'PENDING' });
      const started = await svc.advanceLeg('A', c.id, leg.id, 'IN_PROGRESS', MANAGER);
      expect(started.actualStart).toBeInstanceOf(Date);
      const delayed = await svc.advanceLeg('A', c.id, leg.id, 'DELAYED', MANAGER);
      expect(delayed.status).toBe('DELAYED');
    });
  });

  it('records the full lifecycle as one audit event per transition, all tenant-attributed', async () => {
    const { svc, audit } = makeService();
    const c = await svc.create('A', { commodity: 'Coal' }, MANAGER);
    await svc.advanceStatus('A', c.id, 'WAGONS_ALLOCATED', MANAGER);
    await svc.advanceStatus('A', c.id, 'LOADING', MANAGER);
    await svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER);
    await svc.cancel('A', c.id, MANAGER);
    expect(auditActions(audit)).toEqual([
      'consignment.created', 'consignment.status_advanced', 'consignment.status_advanced',
      'consignment.status_advanced', 'consignment.cancelled',
    ]);
    for (const e of auditEntries(audit)) {
      expect(e).toMatchObject({ actorType: 'tenant', actorId: 'u-mgr', metadata: { module: 'rail', companyId: 'A' } });
    }
  });

  it('an audit-write failure never breaks the business action', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { svc, audit } = makeService();
    audit.record.mockRejectedValue(new Error('audit store down'));
    await expect(svc.create('A', { commodity: 'Coal' }, MANAGER)).resolves.toMatchObject({ commodity: 'Coal' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Wave 3 — dangerous goods (RAIL-011)
// ═══════════════════════════════════════════════════════════════════════════════
describe('dangerous goods', () => {
  const DG_FULL = {
    isDangerousGoods: true, unNumber: 'UN1203', imdgClass: '3', placardRef: 'Placard 3 — flammable liquid',
    emergencyContact24h: '+27 11 555 0100', msdsDocumentUrl: 'https://example.org/msds/petrol.pdf',
  };

  describe('stored values are normalised, and only what was sent is touched', () => {
    it('create: "un 1203" → UN1203, class upper-cased, blanks → NULL, flag defaults to false', async () => {
      const { svc, db } = makeService();
      await svc.create('A', { commodity: 'Petrol', isDangerousGoods: true, unNumber: ' un 1203 ', imdgClass: ' 1.4s ', placardRef: '  ', emergencyContact24h: ' +27 11 555 0100 ' } as any, MANAGER);
      await svc.create('A', { commodity: 'Coal' }, MANAGER);
      expect(db.consignments[0]).toMatchObject({ isDangerousGoods: true, unNumber: 'UN1203', imdgClass: '1.4S', placardRef: null, emergencyContact24h: '+27 11 555 0100', msdsDocumentUrl: null });
      expect(db.consignments[1]).toMatchObject({ isDangerousGoods: false, unNumber: null, imdgClass: null, placardRef: null, emergencyContact24h: null, msdsDocumentUrl: null });
    });

    it('a malformed value is stored as typed (upper-cased) so the gate can reject it, never silently "fixed"', async () => {
      const { svc, db } = makeService();
      await svc.create('A', { commodity: 'Petrol', isDangerousGoods: true, unNumber: 'abc' } as any, MANAGER);
      expect(db.consignments[0].unNumber).toBe('ABC');
    });

    it('addWagon stores the same normalised DG columns', async () => {
      const { svc, db, seedConsignment } = makeService();
      const c = seedConsignment();
      await svc.addWagon('A', c.id, { wagonNumber: 'TANK-1', isDangerousGoods: true, unNumber: '1203', imdgClass: '3' } as any, MANAGER);
      await svc.addWagon('A', c.id, { wagonNumber: 'FLAT-1' }, MANAGER);
      expect(db.wagons[0]).toMatchObject({ isDangerousGoods: true, unNumber: 'UN1203', imdgClass: '3', msdsDocumentUrl: null });
      expect(db.wagons[1]).toMatchObject({ isDangerousGoods: false, unNumber: null });
    });

    it('update only touches the DG fields that were actually sent', async () => {
      const { svc, db, audit, seedConsignment } = makeService();
      const c = seedConsignment({ ...DG_FULL });
      await svc.update('A', c.id, { placardRef: '  Placard 3A  ', unNumber: '1267' } as any, MANAGER);
      expect(db.consignments[0]).toMatchObject({ ...DG_FULL, unNumber: 'UN1267', placardRef: 'Placard 3A' });
      expect(auditEntries(audit)[0].metadata.fields).toEqual(['placardRef', 'unNumber']);
    });

    it('update treats an explicit null flag as "not sent" — it never tries to write NULL into the NOT NULL column', async () => {
      const { svc, db, prisma, seedConsignment } = makeService();
      const c = seedConsignment({ ...DG_FULL });
      await svc.update('A', c.id, { isDangerousGoods: null, placardRef: 'P9' } as any, MANAGER);
      expect(db.consignments[0].isDangerousGoods).toBe(true);
      expect((prisma.railConsignment.update as jest.Mock).mock.calls[0][0].data).not.toHaveProperty('isDangerousGoods');
    });

    it('update can clear a DG field with a blank value, and can switch the flag off', async () => {
      const { svc, db, seedConsignment } = makeService();
      const c = seedConsignment({ ...DG_FULL });
      await svc.update('A', c.id, { msdsDocumentUrl: '   ', imdgClass: '', isDangerousGoods: false } as any, MANAGER);
      expect(db.consignments[0]).toMatchObject({ msdsDocumentUrl: null, imdgClass: null, isDangerousGoods: false, unNumber: 'UN1203' });
    });
  });

  describe('list: the readiness summary behind the DG badge', () => {
    it('reports required / ready / number of problems per consignment', async () => {
      const { svc, seedConsignment, seedWagon } = makeService();
      seedConsignment({ consignmentNumber: 'NONE' });
      seedConsignment({ consignmentNumber: 'READY', ...DG_FULL });
      seedConsignment({ consignmentNumber: 'GAPS', ...DG_FULL, placardRef: null, msdsDocumentUrl: '' });
      seedConsignment({ consignmentNumber: 'BAD', ...DG_FULL, unNumber: 'ABC' });
      const wagonOnly = seedConsignment({ consignmentNumber: 'WAGON' });
      seedWagon(wagonOnly.id, { wagonNumber: 'TANK-9', isDangerousGoods: true });
      const byNumber = Object.fromEntries((await svc.list('A')).map((c: any) => [c.consignmentNumber, c.dg]));
      expect(byNumber).toEqual({
        NONE: { required: false, ready: true, problems: 0 },
        READY: { required: true, ready: true, problems: 0 },
        GAPS: { required: true, ready: false, problems: 2 },
        BAD: { required: true, ready: false, problems: 1 },
        WAGON: { required: true, ready: false, problems: 5 },
      });
    });

    it('loads only the FLAGGED wagons of the listed consignments — never every wagon, and nothing at all for an empty list', async () => {
      const { svc, prisma, seedConsignment, seedWagon } = makeService();
      expect(await svc.list('A')).toEqual([]);
      expect(prisma.wagon.findMany).not.toHaveBeenCalled();

      const mine = seedConsignment({ companyId: 'A' });
      const theirs = seedConsignment({ companyId: 'B' });
      seedWagon(mine.id, { wagonNumber: 'PLAIN' });
      seedWagon(theirs.id, { wagonNumber: 'THEIRS', isDangerousGoods: true });
      const rows: any[] = await svc.list('A');
      expect(prisma.wagon.findMany).toHaveBeenCalledTimes(1);
      expect((prisma.wagon.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ consignmentId: { in: [mine.id] }, isDangerousGoods: true });
      expect(rows[0].dg).toEqual({ required: false, ready: true, problems: 0 }); // B's flagged wagon does not leak into A's badge
    });

    it('keeps every existing field on the row (the badge is additive)', async () => {
      const { svc, seedConsignment } = makeService();
      seedConsignment({ consignmentNumber: 'KEEP', commodity: 'Coal' });
      const [row] = (await svc.list('A')) as any[];
      expect(row).toMatchObject({ consignmentNumber: 'KEEP', commodity: 'Coal', dg: { required: false } });
    });
  });

  describe('getDangerousGoods: exactly what the gate sees', () => {
    it('a complete DG consignment is ready and does not block departure', async () => {
      const { svc, seedConsignment } = makeService();
      const c = seedConsignment({ consignmentNumber: 'RAIL-DG-1', ...DG_FULL });
      expect(await svc.getDangerousGoods('A', c.id)).toMatchObject({ required: true, ready: true, blocksDeparture: false, consignmentNumber: 'RAIL-DG-1', missing: [], invalid: [] });
    });

    it('lists what is missing and malformed, and says departure is blocked', async () => {
      const { svc, seedConsignment } = makeService();
      const c = seedConsignment({ consignmentNumber: 'RAIL-DG-2', ...DG_FULL, imdgClass: null, emergencyContact24h: 'call me' });
      const out = await svc.getDangerousGoods('A', c.id);
      expect(out).toMatchObject({ required: true, ready: false, blocksDeparture: true });
      expect(out.missing).toEqual([{ scope: 'CONSIGNMENT', ref: 'RAIL-DG-2', fields: ['imdgClass'] }]);
      expect(out.invalid).toEqual([expect.objectContaining({ scope: 'CONSIGNMENT', field: 'emergencyContact24h', reason: expect.stringContaining('must be a phone number') })]);
    });

    it('a consignment with no dangerous goods never blocks', async () => {
      const { svc, seedConsignment } = makeService();
      const c = seedConsignment();
      expect(await svc.getDangerousGoods('A', c.id)).toMatchObject({ required: false, ready: true, blocksDeparture: false });
    });

    it('a flagged wagon inherits the consignment\'s DG values where its own are empty', async () => {
      const { svc, seedConsignment, seedWagon } = makeService();
      const c = seedConsignment({ isDangerousGoods: false, unNumber: 'UN1203', imdgClass: '3', placardRef: 'P3', emergencyContact24h: '+27 11 555 0100', msdsDocumentUrl: 'https://example.org/m.pdf' });
      seedWagon(c.id, { wagonNumber: 'TANK-1', isDangerousGoods: true });
      expect(await svc.getDangerousGoods('A', c.id)).toMatchObject({ required: true, ready: true, dgWagons: 1 });
    });

    it('is tenant-scoped (another tenant\'s consignment is a 404)', async () => {
      const { svc, seedConsignment } = makeService();
      const c = seedConsignment({ companyId: 'A', ...DG_FULL });
      await expect(svc.getDangerousGoods('B', c.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('advanceStatus validates the status it is given', () => {
    it.each(['SHIPPED', 'DISPATCHED', '', 'departed'])('rejects "%s" with a 400 that lists the valid statuses — before touching any data', async (bad) => {
      const { svc, prisma, db, audit, seedConsignment } = makeService();
      const c = seedConsignment();
      const before = JSON.stringify([db.consignments, db.events]);
      await expect(svc.advanceStatus('A', c.id, bad, MANAGER)).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.advanceStatus('A', c.id, bad, MANAGER)).rejects.toThrow(/Use one of: PLANNED, WAGONS_ALLOCATED, LOADING, DEPARTED, IN_TRANSIT, AT_INTERCHANGE, ARRIVED, OFFLOADED, COMPLETED, CANCELLED/);
      expect(prisma.railConsignment.findFirst).not.toHaveBeenCalled();
      expect(JSON.stringify([db.consignments, db.events])).toBe(before);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('truncates a very long bogus status in the message', async () => {
      const { svc, seedConsignment } = makeService();
      const c = seedConsignment();
      await expect(svc.advanceStatus('A', c.id, 'x'.repeat(500), MANAGER)).rejects.toThrow(/Unknown status "x{40}"\./);
    });
  });

  describe('the dispatch gate (the brief says "DISPATCHED"; this model\'s dispatch event is DEPARTED)', () => {
    const blockedBody = { ...DG_FULL, placardRef: null, msdsDocumentUrl: null };

    it.each(MOVEMENT_TRANSITIONS)('a DG consignment with missing details cannot move from %s to %s — nothing changes except one audit entry', async (from, status) => {
      const { svc, prisma, db, audit, seedConsignment } = makeService();
      const c = seedConsignment({ status: from, consignmentNumber: 'RAIL-DG-3', ...blockedBody });
      const before = JSON.stringify([db.consignments, db.wagons, db.events]);

      await expect(svc.advanceStatus('A', c.id, status, MANAGER, 'leaving', 'Hotazel')).rejects.toThrow(/Dispatch blocked — dangerous-goods details are incomplete: consignment: missing Placard reference, Safety data sheet \(MSDS\) link/);

      expect(JSON.stringify([db.consignments, db.wagons, db.events])).toBe(before);
      expect(prisma.railConsignment.update).not.toHaveBeenCalled();
      expect(prisma.railConsignmentEvent.create).not.toHaveBeenCalled();
      expect(db.aiEvents).toHaveLength(0);
      expect(db.consignments[0].actualDeparture).toBeNull();
      expect(auditActions(audit)).toEqual([RAIL_AUDIT_ACTION.CONSIGNMENT_DISPATCH_BLOCKED]);
      expect(auditEntries(audit)[0]).toMatchObject({
        action: 'consignment.dispatch_blocked', actorType: 'tenant', actorId: 'u-mgr', targetType: 'rail_consignment', targetId: c.id, targetName: 'RAIL-DG-3',
        metadata: { module: 'rail', companyId: 'A', actorRole: 'MANAGER', attemptedStatus: status, from, invalid: [], missing: [{ scope: 'CONSIGNMENT', ref: 'RAIL-DG-3', fields: ['placardRef', 'msdsDocumentUrl'] }] },
      });
    });

    it('the gate cannot be skipped by jumping ahead (PLANNED straight to AT_INTERCHANGE is still blocked)', async () => {
      const { svc, seedConsignment } = makeService();
      const c = seedConsignment({ status: 'PLANNED', ...blockedBody });
      await expect(svc.advanceStatus('A', c.id, 'AT_INTERCHANGE', MANAGER)).rejects.toThrow(/Dispatch blocked/);
    });

    it.each(NON_MOVEMENT_TRANSITIONS)('moving from %s to %s is NOT gated — paperwork can be finished while loading, and a cancel is never trapped', async (from, status) => {
      const { svc, audit, seedConsignment } = makeService();
      const c = seedConsignment({ status: from, ...blockedBody });
      await expect(svc.advanceStatus('A', c.id, status, MANAGER)).resolves.toMatchObject({ status });
      expect(auditActions(audit)).toEqual([RAIL_AUDIT_ACTION.CONSIGNMENT_STATUS_ADVANCED]);
    });

    it('cancel() is never blocked by incomplete DG data', async () => {
      const { svc, seedConsignment } = makeService();
      const c = seedConsignment({ status: 'LOADING', ...blockedBody });
      await expect(svc.cancel('A', c.id, MANAGER)).resolves.toMatchObject({ status: 'CANCELLED' });
    });

    it.each(MOVEMENT_TRANSITIONS)('a DG consignment whose details are complete moves from %s to %s normally', async (from, status) => {
      const { svc, audit, seedConsignment } = makeService();
      const c = seedConsignment({ status: from, ...DG_FULL });
      const out = await svc.advanceStatus('A', c.id, status, MANAGER, 'go', 'Hotazel');
      expect(out.status).toBe(status);
      if (status === 'DEPARTED') expect(out.actualDeparture).toBeInstanceOf(Date);
      expect(auditActions(audit)).toEqual([RAIL_AUDIT_ACTION.CONSIGNMENT_STATUS_ADVANCED]);
    });

    it('a non-DG consignment is never gated', async () => {
      const { svc, seedConsignment } = makeService();
      const c = seedConsignment({ status: 'LOADING' });
      await expect(svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER)).resolves.toMatchObject({ status: 'DEPARTED' });
    });

    it('a malformed value blocks just like a missing one, and the message says why', async () => {
      const { svc, seedConsignment } = makeService();
      const c = seedConsignment({ ...DG_FULL, unNumber: 'ABC', msdsDocumentUrl: 'http://insecure.example/msds.pdf' });
      await expect(svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER)).rejects.toThrow(/UN number must be UN followed by four digits \(e\.g\. UN1203\); consignment: Safety data sheet \(MSDS\) link must be an https:\/\/ link/);
    });

    it('a flagged wagon with incomplete details blocks the whole consignment, naming the wagon', async () => {
      const { svc, db, seedConsignment, seedWagon } = makeService();
      const c = seedConsignment({ status: 'LOADING' }); // the consignment itself is not flagged
      seedWagon(c.id, { wagonNumber: 'TANK-77', isDangerousGoods: true, unNumber: 'UN1203' });
      await expect(svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER)).rejects.toThrow(/wagon TANK-77: missing IMDG class, Placard reference, 24-hour emergency contact, Safety data sheet \(MSDS\) link/);
      expect(db.consignments[0].status).toBe('LOADING');
    });

    it('fixing the gap lifts the block — the same request then succeeds', async () => {
      const { svc, seedConsignment } = makeService();
      const c = seedConsignment({ status: 'LOADING', ...blockedBody });
      await expect(svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER)).rejects.toThrow(/Dispatch blocked/);
      await svc.update('A', c.id, { placardRef: 'Placard 3', msdsDocumentUrl: 'https://example.org/msds.pdf' } as any, MANAGER);
      await expect(svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER)).resolves.toMatchObject({ status: 'DEPARTED' });
    });

    it('the refusal is a 400 even when the audit write itself fails', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { svc, audit, seedConsignment } = makeService();
      audit.record.mockRejectedValue(new Error('audit store down'));
      const c = seedConsignment({ ...blockedBody });
      await expect(svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('another tenant cannot probe the gate: it gets a 404, and no blocked-dispatch entry is written for the owner', async () => {
      const { svc, audit, seedConsignment } = makeService();
      const c = seedConsignment({ companyId: 'A', ...blockedBody });
      await expect(svc.advanceStatus('B', c.id, 'DEPARTED', MANAGER)).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Wave 4 — the weighbridge HOLD_FOR_LOAD_ADJUSTMENT gate (alongside the dangerous-goods gate)
// ═══════════════════════════════════════════════════════════════════════════════
describe('weighbridge hold gate', () => {
  const HOLD = { holdStatus: 'HOLD_FOR_LOAD_ADJUSTMENT', holdReason: 'Overloaded: W1 (3.2 t over). Reduce the load and re-weigh the wagon within its limit.', holdSetAt: new Date('2026-10-02T08:00:00Z') };
  const DG_BAD = { isDangerousGoods: true, unNumber: 'UN1203', imdgClass: '3' }; // placard, contact and MSDS missing

  it.each(MOVEMENT_TRANSITIONS)('a consignment on HOLD_FOR_LOAD_ADJUSTMENT cannot move from %s to %s — nothing changes except one audit entry', async (from, status) => {
    const { svc, prisma, db, audit, seedConsignment } = makeService();
    const c = seedConsignment({ status: from, consignmentNumber: 'RAIL-H-1', ...HOLD });
    const before = JSON.stringify([db.consignments, db.wagons, db.events]);

    await expect(svc.advanceStatus('A', c.id, status, MANAGER, 'leaving')).rejects.toThrow(
      /^Dispatch blocked — held for load adjustment: Overloaded: W1 \(3\.2 t over\)\. Reduce the load and re-weigh the wagon within its limit\.\.$/,
    );

    expect(JSON.stringify([db.consignments, db.wagons, db.events])).toBe(before);
    expect(prisma.railConsignment.update).not.toHaveBeenCalled();
    expect(prisma.railConsignmentEvent.create).not.toHaveBeenCalled();
    expect(db.aiEvents).toHaveLength(0);
    expect(auditActions(audit)).toEqual([RAIL_AUDIT_ACTION.CONSIGNMENT_DISPATCH_BLOCKED]);
    expect(auditEntries(audit)[0]).toMatchObject({
      action: 'consignment.dispatch_blocked', actorId: 'u-mgr', targetId: c.id, targetName: 'RAIL-H-1',
      metadata: { companyId: 'A', attemptedStatus: status, from, hold: { status: 'HOLD_FOR_LOAD_ADJUSTMENT', reason: HOLD.holdReason } },
    });
  });

  it('the hold cannot be skipped by jumping ahead (PLANNED straight to AT_INTERCHANGE)', async () => {
    const { svc, seedConsignment } = makeService();
    const c = seedConsignment({ status: 'PLANNED', ...HOLD });
    await expect(svc.advanceStatus('A', c.id, 'AT_INTERCHANGE', MANAGER)).rejects.toThrow(/held for load adjustment/);
  });

  it.each(NON_MOVEMENT_TRANSITIONS)('moving from %s to %s is NOT gated by the hold — the load can be adjusted while loading, and a cancel is never trapped', async (from, status) => {
    const { svc, seedConsignment } = makeService();
    const c = seedConsignment({ status: from, ...HOLD });
    await expect(svc.advanceStatus('A', c.id, status, MANAGER)).resolves.toMatchObject({ status });
  });

  it('cancel() is never blocked by a hold', async () => {
    const { svc, seedConsignment } = makeService();
    const c = seedConsignment({ status: 'LOADING', ...HOLD });
    await expect(svc.cancel('A', c.id, MANAGER)).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it('a consignment whose hold is NONE (or lifted) moves normally', async () => {
    const { svc, seedConsignment } = makeService();
    for (const hold of [{}, { holdStatus: 'NONE', holdReason: null }]) {
      const c = seedConsignment({ status: 'LOADING', ...hold });
      await expect(svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER)).resolves.toMatchObject({ status: 'DEPARTED' });
    }
  });

  it('with no recorded reason the message still says what to do', async () => {
    const { svc, seedConsignment } = makeService();
    const c = seedConsignment({ status: 'LOADING', holdStatus: 'HOLD_FOR_LOAD_ADJUSTMENT', holdReason: null });
    await expect(svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER)).rejects.toThrow(/held for load adjustment: a wagon has not been re-weighed within its limit/);
  });

  it('a consignment that is BOTH on hold AND missing dangerous-goods details is told both, in one sentence', async () => {
    const { svc, audit, seedConsignment } = makeService();
    const c = seedConsignment({ status: 'LOADING', consignmentNumber: 'RAIL-H-2', ...DG_BAD, ...HOLD });
    let message = '';
    await svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER).catch((e) => { message = e.message; });
    expect(message).toMatch(/^Dispatch blocked — dangerous-goods details are incomplete: .*missing .*; and held for load adjustment: Overloaded: W1/);
    expect(auditEntries(audit)[0].metadata).toMatchObject({ hold: { status: 'HOLD_FOR_LOAD_ADJUSTMENT' }, missing: [expect.objectContaining({ scope: 'CONSIGNMENT' })] });
  });

  it('a dangerous-goods-only refusal is unchanged (no hold wording, no hold in the audit)', async () => {
    const { svc, audit, seedConsignment } = makeService();
    const c = seedConsignment({ status: 'LOADING', ...DG_BAD });
    await expect(svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER)).rejects.toThrow(/^Dispatch blocked — dangerous-goods details are incomplete: [^;]*\.$/);
    expect(auditEntries(audit)[0].metadata).not.toHaveProperty('hold');
  });

  it('the refusal is a 400 even when the audit write itself fails', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { svc, audit, seedConsignment } = makeService();
    audit.record.mockRejectedValue(new Error('audit store down'));
    const c = seedConsignment({ ...HOLD });
    await expect(svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('another tenant cannot probe the hold: a 404, and nothing is written for the owner', async () => {
    const { svc, audit, seedConsignment } = makeService();
    const c = seedConsignment({ companyId: 'A', ...HOLD });
    await expect(svc.advanceStatus('B', c.id, 'DEPARTED', MANAGER)).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
