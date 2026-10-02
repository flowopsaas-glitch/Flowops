/**
 * Rail consignment service — Wave 1.
 *
 * Covers: the `rail` entitlement gate, tenant isolation (consignments, wagons,
 * legs), lifecycle timestamps, dwell maths and the audit trail. Prisma is an
 * in-memory fake so isolation is tested by behaviour.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RailService } from './rail.service';
import { RAIL_AUDIT_ACTION, RailActor } from './rail-audit';

const H = 3_600_000;
const MANAGER: RailActor = { id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: UserRole.MANAGER };

type Row = Record<string, any>;

function makeDb() {
  const db = {
    consignments: [] as Row[], events: [] as Row[], wagons: [] as Row[], legs: [] as Row[], aiEvents: [] as Row[], seq: 0,
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

  const prisma = {
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
      aggregate: jest.fn(async () => ({ _avg: { dwellHours: null } })),
    },
    aiEvent: {
      create: jest.fn(async ({ data }: any) => {
        db.aiEvents.push(data);
        return data;
      }),
    },
  };

  const seedConsignment = (over: Row = {}) => {
    const row = {
      id: id('con'), companyId: 'A', consignmentNumber: `RAIL-2026-9${db.seq}`, status: 'PLANNED', commodity: 'Manganese',
      actualDeparture: null, actualArrival: null, createdAt: new Date(), ...over,
    };
    db.consignments.push(row);
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
  return { db, prisma, seedConsignment, seedWagon, seedLeg };
}

function makeService(opts: { entitled?: boolean } = {}) {
  const harness = makeDb();
  const billing = { hasFeature: jest.fn().mockResolvedValue(opts.entitled ?? true) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
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
    for (const table of Object.values(prisma)) {
      for (const fn of Object.values(table)) expect(fn).not.toHaveBeenCalled();
    }
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

    const departed = await svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER, 'left yard', 'Hotazel');
    expect(departed.actualDeparture).toBeInstanceOf(Date);
    const firstStamp = departed.actualDeparture;

    await new Promise((r) => setTimeout(r, 5));
    const again = await svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER);
    expect(again.actualDeparture).toEqual(firstStamp); // never overwritten

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
    const c = seedConsignment();
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

  describe('intermodal legs', () => {
    it('addLeg is audited', async () => {
      const { svc, audit, seedConsignment } = makeService();
      const c = seedConsignment();
      const leg = await svc.addLeg('A', c.id, { sequence: 2, mode: 'PORT' as any }, MANAGER);
      expect(auditEntries(audit)[0]).toMatchObject({
        action: 'consignment.leg_added', targetType: 'rail_intermodal_leg', targetId: leg.id, metadata: { mode: 'PORT', sequence: 2 },
      });
    });

    it('IN_PROGRESS stamps actualStart; HANDED_OVER stamps actualEnd and computes dwell hours', async () => {
      const { svc, audit, seedConsignment, seedLeg } = makeService();
      const c = seedConsignment();
      const leg = seedLeg(c.id, { actualStart: new Date(Date.now() - 5 * H), status: 'IN_PROGRESS' });

      const out = await svc.advanceLeg('A', c.id, leg.id, 'HANDED_OVER', MANAGER);

      expect(out.actualEnd).toBeInstanceOf(Date);
      expect(out.dwellHours).toBeCloseTo(5, 1);
      expect(auditEntries(audit)[0]).toMatchObject({
        action: 'consignment.leg_advanced', metadata: { from: 'IN_PROGRESS', to: 'HANDED_OVER' },
      });
      expect(auditEntries(audit)[0].metadata.dwellHours).toBeCloseTo(5, 1);
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
      const leg = seedLeg(c.id, { actualStart: new Date(Date.now() + 3 * H) }); // clock skew: start "in the future"
      const out = await svc.advanceLeg('A', c.id, leg.id, 'COMPLETED', MANAGER);
      expect(out.dwellHours).toBe(0);
    });
  });

  it('records the full lifecycle as one audit event per transition, all tenant-attributed', async () => {
    const { svc, audit } = makeService();
    const c = await svc.create('A', { commodity: 'Coal' }, MANAGER);
    await svc.advanceStatus('A', c.id, 'LOADING', MANAGER);
    await svc.advanceStatus('A', c.id, 'DEPARTED', MANAGER);
    await svc.cancel('A', c.id, MANAGER);
    expect(auditActions(audit)).toEqual([
      'consignment.created', 'consignment.status_advanced', 'consignment.status_advanced', 'consignment.cancelled',
    ]);
    for (const e of auditEntries(audit)) {
      expect(e).toMatchObject({ actorType: 'tenant', actorId: 'u-mgr', metadata: { module: 'rail', companyId: 'A' } });
    }
  });

  it('an audit-write failure never breaks the business action', async () => {
    const { svc, audit } = makeService();
    audit.record.mockRejectedValue(new Error('audit store down'));
    await expect(svc.create('A', { commodity: 'Coal' }, MANAGER)).resolves.toMatchObject({ commodity: 'Coal' });
  });
});
