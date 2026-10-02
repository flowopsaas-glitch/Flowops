/**
 * Weighbridge readings and the HOLD_FOR_LOAD_ADJUSTMENT hold. Prisma is an in-memory fake.
 * The corridor limits below are SYNTHETIC fixtures — no real corridor limit has been supplied, and the six catalogue corridors
 * are SOURCE_PENDING with no limit, which is exactly the default these tests start from.
 */
import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FakeTable, snapshot } from '../../test/support/in-memory-db';
import { RailWeighbridgeService } from './rail-weighbridge.service';
import { RAIL_AUDIT_ACTION, RailActor } from './rail-audit';

const NOW = new Date('2026-10-02T10:00:00.000Z');
const MIN = 60_000;
const MANAGER: RailActor = { id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: UserRole.MANAGER };

const wagon = (n: string, axles: number | null = 4) => ({ id: `wag-${n}`, wagonNumber: n, axles });

function make(opts: { entitled?: boolean; verifiedCorridor?: { limit: number; status?: 'VERIFIED' | 'SOURCE_PENDING' } } = {}) {
  const readings = new FakeTable('wr', { defaults: () => ({ wagonId: null, weighbridge: null, axles: null, maxAxleLoadTonnes: null, limitSource: 'NONE', corridorCode: null, allowedTonnes: null, excessTonnes: null, note: null }) });
  const consignments = new FakeTable('con');
  const corridors = new FakeTable('cor');
  if (opts.verifiedCorridor) {
    corridors.seed({
      code: 'COR-ORE', name: 'Ore', aliases: ['Cape 2'], workbookRoutes: ['Ore'], isActive: true, maxAxleLoadTonnes: opts.verifiedCorridor.limit, dataStatus: opts.verifiedCorridor.status ?? 'VERIFIED',
    });
  }
  const prisma = { railWeighbridgeReading: readings, railConsignment: consignments, railCorridorNode: corridors };
  const billing = { hasFeature: jest.fn().mockResolvedValue(opts.entitled ?? true) };
  const audit = { record: jest.fn().mockResolvedValue('audit-1') };
  const svc = new RailWeighbridgeService(prisma as any, billing as any, audit as any);

  // `findFirst` of the fake ignores `include`, so the wagons live on the seeded row.
  const seedConsignment = (over: Record<string, any> = {}) => consignments.seed({
    companyId: 'A', consignmentNumber: 'RAIL-1', status: 'LOADING', corridor: 'Ore', holdStatus: 'NONE', holdReason: null, holdSetAt: null, holdClearedAt: null,
    wagons: [wagon('W1'), wagon('W2')], ...over,
  });
  const actions = () => audit.record.mock.calls.map(([e]) => e.action);
  const entries = () => audit.record.mock.calls.map(([e]) => e);
  const consignment = (id: string) => consignments.rows.find((r) => r.id === id)!;
  return { svc, prisma, billing, audit, readings, consignments, corridors, seedConsignment, actions, entries, consignment };
}
const dto = (consignmentId: string, over: Record<string, any> = {}) => ({ consignmentId, wagonNumber: 'W1', actualTonnes: 70, ...over });

afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
describe('entitlement and isolation', () => {
  it('every public method is refused without the `rail` feature, before any data access', async () => {
    const h = make({ entitled: false });
    await expect(h.svc.list('A')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.svc.recordReading('A', dto('x') as any, MANAGER, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    for (const t of [h.readings, h.consignments, h.corridors]) for (const fn of t.fns) expect(fn).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('another tenant\'s consignment is a 404 — nothing is written, held or audited', async () => {
    const h = make();
    const c = h.seedConsignment({ companyId: 'A' });
    const before = snapshot(h.readings, h.consignments);
    await expect(h.svc.recordReading('B', dto(c.id) as any, MANAGER, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(snapshot(h.readings, h.consignments)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('list is tenant-scoped, filterable by consignment, newest first', async () => {
    const h = make();
    h.readings.seed({ companyId: 'A', consignmentId: 'c1', wagonNumber: 'W1', actualTonnes: 1, status: 'UNVERIFIED', createdAt: new Date('2026-10-01') });
    h.readings.seed({ companyId: 'A', consignmentId: 'c1', wagonNumber: 'W1', actualTonnes: 2, status: 'UNVERIFIED', createdAt: new Date('2026-10-02') });
    h.readings.seed({ companyId: 'A', consignmentId: 'c2', wagonNumber: 'W9', actualTonnes: 3, status: 'UNVERIFIED' });
    h.readings.seed({ companyId: 'B', consignmentId: 'c1', wagonNumber: 'W1', actualTonnes: 4, status: 'UNVERIFIED' });
    expect((await h.svc.list('A')).length).toBe(3);
    expect((await h.svc.list('A', { consignmentId: 'c1' })).map((r) => r.actualTonnes)).toEqual([2, 1]);
    expect(await h.svc.list('C')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('validation', () => {
  it('a wagon that is not on the consignment is refused (the number is trimmed first)', async () => {
    const h = make();
    const c = h.seedConsignment();
    await expect(h.svc.recordReading('A', dto(c.id, { wagonNumber: 'NOPE' }) as any, MANAGER, NOW)).rejects.toThrow(/Wagon "NOPE" is not registered on RAIL-1/);
    expect((await h.svc.recordReading('A', dto(c.id, { wagonNumber: '  W1  ' }) as any, MANAGER, NOW)).reading.wagonNumber).toBe('W1');
    expect(h.readings.rows).toHaveLength(1);
  });

  it('a cancelled consignment takes no readings', async () => {
    const h = make();
    const c = h.seedConsignment({ status: 'CANCELLED' });
    await expect(h.svc.recordReading('A', dto(c.id) as any, MANAGER, NOW)).rejects.toThrow(/cancelled consignment takes no new weighbridge readings/);
    expect(h.readings.rows).toHaveLength(0);
  });

  it('weighedAt: defaults to now, rejects garbage, rejects the future (a few minutes of clock skew are tolerated)', async () => {
    const h = make();
    const c = h.seedConsignment();
    expect((await h.svc.recordReading('A', dto(c.id) as any, MANAGER, NOW)).reading.weighedAt).toEqual(NOW);
    await expect(h.svc.recordReading('A', dto(c.id, { weighedAt: 'noonish' }) as any, MANAGER, NOW)).rejects.toThrow(/weighedAt is not a valid date/);
    await expect(h.svc.recordReading('A', dto(c.id, { weighedAt: new Date(NOW.getTime() + 10 * MIN).toISOString() }) as any, MANAGER, NOW)).rejects.toThrow(/cannot be in the future/);
    const earlier = new Date(NOW.getTime() - 90 * MIN);
    expect((await h.svc.recordReading('A', dto(c.id, { weighedAt: earlier.toISOString() }) as any, MANAGER, NOW)).reading.weighedAt).toEqual(earlier);
    expect((await h.svc.recordReading('A', dto(c.id, { weighedAt: new Date(NOW.getTime() + 4 * MIN).toISOString() }) as any, MANAGER, NOW)).reading.status).toBeDefined();
    expect(h.readings.rows).toHaveLength(3);
  });

  it('a refused reading leaves no trace', async () => {
    const h = make();
    const c = h.seedConsignment();
    const before = snapshot(h.readings, h.consignments);
    await expect(h.svc.recordReading('A', dto(c.id, { wagonNumber: 'NOPE' }) as any, MANAGER, NOW)).rejects.toBeInstanceOf(BadRequestException);
    expect(snapshot(h.readings, h.consignments)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('where the limit comes from', () => {
  it('with no corridor data (today\'s truth) and no entered limit the reading is UNVERIFIED — it never passes and never holds', async () => {
    const h = make();
    const c = h.seedConsignment();
    const out = await h.svc.recordReading('A', dto(c.id, { actualTonnes: 500 }) as any, MANAGER, NOW);
    expect(out.reading).toMatchObject({ status: 'UNVERIFIED', limitSource: 'NONE', maxAxleLoadTonnes: null, allowedTonnes: null, excessTonnes: null, corridorCode: 'COR-ORE' });
    expect(out.evaluation.reason).toMatch(/No maximum axle load is known for this corridor/);
    expect(out.hold.held).toBe(false);
    expect(h.consignment(c.id).holdStatus).toBe('NONE');
  });

  it('a VERIFIED corridor limit is used: 20 t × 4 axles = 80 t', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment();
    const ok = await h.svc.recordReading('A', dto(c.id, { actualTonnes: 80 }) as any, MANAGER, NOW); // exactly at the limit
    expect(ok.reading).toMatchObject({ status: 'WITHIN_LIMIT', limitSource: 'CORRIDOR', maxAxleLoadTonnes: 20, axles: 4, allowedTonnes: 80, excessTonnes: null, corridorCode: 'COR-ORE' });
    const over = await h.svc.recordReading('A', dto(c.id, { wagonNumber: 'W2', actualTonnes: 80.001 }) as any, MANAGER, NOW);
    expect(over.reading).toMatchObject({ status: 'OVERLOADED', excessTonnes: 0.001 });
  });

  it('a corridor limit that is not VERIFIED is not trusted', async () => {
    const h = make({ verifiedCorridor: { limit: 20, status: 'SOURCE_PENDING' } });
    const c = h.seedConsignment();
    const out = await h.svc.recordReading('A', dto(c.id, { actualTonnes: 500 }) as any, MANAGER, NOW);
    expect(out.reading).toMatchObject({ status: 'UNVERIFIED', limitSource: 'NONE' });
    expect(out.hold.held).toBe(false);
  });

  it('an entered limit alone is MANUAL and is judged', async () => {
    const h = make();
    const c = h.seedConsignment();
    const out = await h.svc.recordReading('A', dto(c.id, { actualTonnes: 90, maxAxleLoadTonnes: 20 }) as any, MANAGER, NOW);
    expect(out.reading).toMatchObject({ status: 'OVERLOADED', limitSource: 'MANUAL', maxAxleLoadTonnes: 20, allowedTonnes: 80, excessTonnes: 10 });
    expect(out.hold.held).toBe(true);
  });

  it('an entered limit can TIGHTEN a verified one (a wagon rated below the corridor)…', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment();
    const out = await h.svc.recordReading('A', dto(c.id, { actualTonnes: 75, maxAxleLoadTonnes: 18 }) as any, MANAGER, NOW); // 18 × 4 = 72
    expect(out.reading).toMatchObject({ status: 'OVERLOADED', limitSource: 'MANUAL', maxAxleLoadTonnes: 18, allowedTonnes: 72, excessTonnes: 3 });
  });

  it('…but can NEVER relax it: a higher figure is ignored and the corridor limit stands', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment();
    const out = await h.svc.recordReading('A', dto(c.id, { actualTonnes: 90, maxAxleLoadTonnes: 30 }) as any, MANAGER, NOW);
    expect(out.reading).toMatchObject({ status: 'OVERLOADED', limitSource: 'CORRIDOR', maxAxleLoadTonnes: 20, allowedTonnes: 80, excessTonnes: 10 });
    expect(out.hold.held).toBe(true);
  });

  it('the axle count: the request wins, then the wagon\'s registered count; with neither the reading is UNVERIFIED', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment({ wagons: [wagon('W1', 4), wagon('W2', null)] });
    expect((await h.svc.recordReading('A', dto(c.id, { actualTonnes: 70 }) as any, MANAGER, NOW)).reading.axles).toBe(4);
    expect((await h.svc.recordReading('A', dto(c.id, { actualTonnes: 70, axles: 2 }) as any, MANAGER, NOW)).reading).toMatchObject({ axles: 2, status: 'OVERLOADED', allowedTonnes: 40 });
    const none = await h.svc.recordReading('A', dto(c.id, { wagonNumber: 'W2', actualTonnes: 70 }) as any, MANAGER, NOW);
    expect(none.reading).toMatchObject({ status: 'UNVERIFIED', axles: null });
    expect(none.evaluation.reason).toMatch(/axle count/);
  });

  it('the corridor is found by alias, route name or code, exactly (no fuzzy matching)', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    for (const text of ['Cape 2', 'ore', 'COR-ORE']) {
      const c = h.seedConsignment({ corridor: text, consignmentNumber: `R-${text}` });
      expect((await h.svc.recordReading('A', dto(c.id, { actualTonnes: 70 }) as any, MANAGER, NOW)).reading.limitSource).toBe('CORRIDOR');
    }
    const other = h.seedConsignment({ corridor: 'Orex line', consignmentNumber: 'R-other' });
    expect((await h.svc.recordReading('A', dto(other.id, { actualTonnes: 70 }) as any, MANAGER, NOW)).reading).toMatchObject({ limitSource: 'NONE', corridorCode: null });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('the hold', () => {
  const over = (h: ReturnType<typeof make>, id: string, wagonNumber = 'W1', actualTonnes = 90) => h.svc.recordReading('A', dto(id, { wagonNumber, actualTonnes }) as any, MANAGER, NOW);

  it('an overloaded wagon puts the consignment on HOLD_FOR_LOAD_ADJUSTMENT, with a reason, once, and audits it', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment();
    const out = await over(h, c.id);
    expect(out.hold).toMatchObject({ held: true, status: 'HOLD_FOR_LOAD_ADJUSTMENT', changed: true, totalExcessTonnes: 10, wagons: [{ wagonNumber: 'W1', excessTonnes: 10 }] });
    expect(out.hold.reason).toBe('Overloaded: W1 (10 t over). Reduce the load and re-weigh the wagon within its limit.');
    expect(h.consignment(c.id)).toMatchObject({ holdStatus: 'HOLD_FOR_LOAD_ADJUSTMENT', holdSetAt: NOW, holdClearedAt: null, holdReason: out.hold.reason });
    expect(h.actions()).toEqual([RAIL_AUDIT_ACTION.WEIGHBRIDGE_READING_RECORDED, RAIL_AUDIT_ACTION.CONSIGNMENT_HOLD_SET]);
    expect(h.entries()[1]).toMatchObject({ action: 'consignment.held_for_load_adjustment', targetType: 'rail_consignment', targetId: c.id, actorId: 'u-mgr', metadata: { totalExcessTonnes: 10 } });
  });

  it('a wagon within its limit does not hold the consignment', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment();
    const out = await over(h, c.id, 'W1', 70);
    expect(out.hold).toMatchObject({ held: false, status: 'NONE', changed: false, reason: null });
    expect(h.consignment(c.id).holdStatus).toBe('NONE');
    expect(h.actions()).toEqual([RAIL_AUDIT_ACTION.WEIGHBRIDGE_READING_RECORDED]); // no hold entry
  });

  it('re-weighing the wagon within its limit LIFTS the hold, and audits that', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment();
    const first = await over(h, c.id);
    h.audit.record.mockClear();
    const later = new Date(NOW.getTime() + 30 * MIN);
    jest.useFakeTimers().setSystemTime(later); // the second reading is RECORDED later
    try {
      const out = await h.svc.recordReading('A', dto(c.id, { actualTonnes: 78 }) as any, MANAGER, later);
      expect(out.hold).toMatchObject({ held: false, status: 'NONE', changed: true });
    } finally {
      jest.useRealTimers();
    }
    expect(h.consignment(c.id)).toMatchObject({ holdStatus: 'NONE', holdReason: null, holdClearedAt: later });
    expect(h.actions()).toEqual([RAIL_AUDIT_ACTION.WEIGHBRIDGE_READING_RECORDED, RAIL_AUDIT_ACTION.CONSIGNMENT_HOLD_CLEARED]);
    expect(h.entries()[1].metadata).toMatchObject({ previousReason: first.hold.reason });
  });

  it('a hold on two wagons needs BOTH re-weighed: fixing one leaves the hold on the other, with an updated reason and no second "set" entry', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment();
    await over(h, c.id, 'W1', 90);
    await over(h, c.id, 'W2', 85);
    expect(h.actions().filter((a) => a === RAIL_AUDIT_ACTION.CONSIGNMENT_HOLD_SET)).toHaveLength(1);
    expect(h.consignment(c.id).holdReason).toBe('Overloaded: W1 (10 t over), W2 (5 t over). Reduce the load and re-weigh each wagon within its limit.');
    const firstHeldAt = h.consignment(c.id).holdSetAt;

    jest.useFakeTimers().setSystemTime(new Date(NOW.getTime() + 60 * MIN));
    try {
      const out = await h.svc.recordReading('A', dto(c.id, { wagonNumber: 'W1', actualTonnes: 79 }) as any, MANAGER, new Date(NOW.getTime() + 60 * MIN));
      expect(out.hold).toMatchObject({ held: true, changed: false, totalExcessTonnes: 5, wagons: [{ wagonNumber: 'W2', excessTonnes: 5 }] });
    } finally {
      jest.useRealTimers();
    }
    expect(h.consignment(c.id).holdReason).toBe('Overloaded: W2 (5 t over). Reduce the load and re-weigh the wagon within its limit.');
    expect(h.consignment(c.id).holdSetAt).toEqual(firstHeldAt); // when the hold began does not move
    expect(h.actions().filter((a) => a === RAIL_AUDIT_ACTION.CONSIGNMENT_HOLD_SET)).toHaveLength(1);
    expect(h.actions().filter((a) => a === RAIL_AUDIT_ACTION.CONSIGNMENT_HOLD_CLEARED)).toHaveLength(0);
  });

  it('an UNVERIFIED reading neither sets nor clears a hold (it says nothing about the limit)', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment({ wagons: [wagon('W1', 4), wagon('W2', null)] });
    await over(h, c.id, 'W1', 90); // held
    await h.svc.recordReading('A', dto(c.id, { wagonNumber: 'W2', actualTonnes: 70 }) as any, MANAGER, NOW); // W2: no axles → UNVERIFIED
    expect(h.consignment(c.id).holdStatus).toBe('HOLD_FOR_LOAD_ADJUSTMENT');
  });

  it('a re-weigh that is STILL over the limit keeps the hold — the stricter of an entered and the verified limit applies', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment();
    await over(h, c.id, 'W1', 90);
    const later = new Date(NOW.getTime() + 60 * MIN);
    jest.useFakeTimers().setSystemTime(later);
    try {
      // 70 t on ONE axle against min(20, 30) = 20 t allowed: still overloaded, so nothing is lifted.
      const out = await h.svc.recordReading('A', dto(c.id, { wagonNumber: 'W1', actualTonnes: 70, axles: 1, maxAxleLoadTonnes: 30 }) as any, MANAGER, later);
      expect(out.reading).toMatchObject({ status: 'OVERLOADED', allowedTonnes: 20, excessTonnes: 50 });
      expect(out.hold).toMatchObject({ held: true, changed: false, totalExcessTonnes: 50 });
    } finally {
      jest.useRealTimers();
    }
    expect(h.consignment(c.id).holdStatus).toBe('HOLD_FOR_LOAD_ADJUSTMENT');
  });

  it('a later overloaded reading re-imposes a hold that had been lifted', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment();
    await over(h, c.id, 'W1', 90);
    jest.useFakeTimers().setSystemTime(new Date(NOW.getTime() + 60 * MIN));
    try {
      await h.svc.recordReading('A', dto(c.id, { actualTonnes: 70 }) as any, MANAGER, new Date(NOW.getTime() + 60 * MIN));
      expect(h.consignment(c.id).holdStatus).toBe('NONE');
      jest.setSystemTime(new Date(NOW.getTime() + 120 * MIN));
      await h.svc.recordReading('A', dto(c.id, { actualTonnes: 95 }) as any, MANAGER, new Date(NOW.getTime() + 120 * MIN));
    } finally {
      jest.useRealTimers();
    }
    expect(h.consignment(c.id)).toMatchObject({ holdStatus: 'HOLD_FOR_LOAD_ADJUSTMENT', holdClearedAt: null });
    expect(h.actions().filter((a) => a === RAIL_AUDIT_ACTION.CONSIGNMENT_HOLD_SET)).toHaveLength(2);
  });

  it('holds are per consignment: tenant A\'s hold is invisible to — and unaffected by — tenant B', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const a = h.seedConsignment({ companyId: 'A' });
    const b = h.seedConsignment({ companyId: 'B', consignmentNumber: 'RAIL-B' });
    await over(h, a.id, 'W1', 90);
    expect(h.consignment(a.id).holdStatus).toBe('HOLD_FOR_LOAD_ADJUSTMENT');
    expect(h.consignment(b.id).holdStatus).toBe('NONE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('the record itself', () => {
  it('readings are append-only: recording never edits or deletes an earlier one', async () => {
    const h = make({ verifiedCorridor: { limit: 20 } });
    const c = h.seedConsignment();
    await h.svc.recordReading('A', dto(c.id, { actualTonnes: 90 }) as any, MANAGER, NOW);
    await h.svc.recordReading('A', dto(c.id, { actualTonnes: 70 }) as any, MANAGER, NOW);
    expect(h.readings.rows).toHaveLength(2);
    expect(h.readings.update).not.toHaveBeenCalled();
    expect(h.readings.updateMany).not.toHaveBeenCalled();
    expect(h.readings.delete).not.toHaveBeenCalled();
  });

  it('stores who recorded it, the weighbridge name and a trimmed note', async () => {
    const h = make();
    const c = h.seedConsignment();
    const out = await h.svc.recordReading('A', dto(c.id, { weighbridge: '  Hotazel WB-2 ', note: '  second pass  ' }) as any, MANAGER, NOW);
    expect(out.reading).toMatchObject({ companyId: 'A', consignmentId: c.id, wagonId: 'wag-W1', weighbridge: 'Hotazel WB-2', note: 'second pass', createdById: 'u-mgr', createdByEmail: 'mia@toc.co.za' });
    expect(h.entries()[0]).toMatchObject({ action: 'weighbridge.reading_recorded', targetType: 'rail_weighbridge_reading', targetName: 'RAIL-1 W1', metadata: { companyId: 'A', wagonNumber: 'W1', limitSource: 'NONE', status: 'UNVERIFIED' } });
  });

  it('an audit failure never loses the reading or the hold', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const h = make({ verifiedCorridor: { limit: 20 } });
    h.audit.record.mockRejectedValue(new Error('audit store down'));
    const c = h.seedConsignment();
    const out = await h.svc.recordReading('A', dto(c.id, { actualTonnes: 90 }) as any, MANAGER, NOW);
    expect(out.hold.held).toBe(true);
    expect(h.readings.rows).toHaveLength(1);
    expect(h.consignment(c.id).holdStatus).toBe('HOLD_FOR_LOAD_ADJUSTMENT');
  });
});
