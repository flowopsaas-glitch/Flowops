/**
 * Possession windows (Annual Plan / 60-day Locked / Ad-hoc Emergency) and automatic conflict detection against the
 * tenant's active consignments — Wave 3 service behaviour. Prisma is an in-memory fake (backend/test/support).
 *
 * Detection is ADVISORY: it raises the alarm (audit + AiEvent + banner) and never blocks a consignment. A consignment that
 * cannot be checked is reported as such, never assumed clear.
 */
import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FakeTable, snapshot } from '../../test/support/in-memory-db';
import { RailPossessionService } from './rail-possession.service';
import { RailActor, RAIL_AUDIT_ACTION } from './rail-audit';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date('2026-10-02T10:00:00.000Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);
const atH = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

const MANAGER: RailActor = { id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: UserRole.MANAGER };

function make(opts: { entitled?: boolean } = {}) {
  const windows = new FakeTable('pw');
  const consignments = new FakeTable('con');
  const corridors = new FakeTable('cor');
  const aiEvents = new FakeTable('ai');
  const prisma = {
    $transaction: async (fn: any) => fn(prisma),
    withTenant: async (_companyId: string, fn: any, _opts?: any) => fn(prisma),
    railPossessionWindow: windows, railConsignment: consignments, railCorridorNode: corridors, aiEvent: aiEvents,
  };
  const billing = { hasFeature: jest.fn().mockResolvedValue(opts.entitled ?? true) };
  const audit = { record: jest.fn().mockResolvedValue('audit-1') };
  const outbox = { enqueue: jest.fn().mockResolvedValue('ob1') };
  const svc = new RailPossessionService(prisma as any, billing as any, audit as any, outbox as any);

  const seedWindow = (over: Record<string, any> = {}) =>
    windows.seed({
      companyId: 'A', corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN', status: 'PLANNED', title: 'Ore line maintenance',
      startsAt: at(11), endsAt: at(13), ...over,
    });
  const seedCon = (over: Record<string, any> = {}) =>
    consignments.seed({
      companyId: 'A', consignmentNumber: `RC-${consignments.rows.length + 1}`, status: 'PLANNED', corridor: 'Ore',
      plannedDeparture: at(10), plannedArrival: at(12), actualDeparture: null, slaHours: null, ...over,
    });
  const actions = () => audit.record.mock.calls.map(([e]) => e.action);
  const entries = () => audit.record.mock.calls.map(([e]) => e);
  return { svc, prisma, billing, audit, windows, consignments, corridors, aiEvents, seedWindow, seedCon, actions, entries };
}

const body = (over: Record<string, any> = {}) => ({
  corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN', title: 'Ore line maintenance', startsAt: at(11).toISOString(), endsAt: at(13).toISOString(), ...over,
});

afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
describe('entitlement', () => {
  it('every tenant-facing method is refused without the `rail` feature, before any data access', async () => {
    const h = make({ entitled: false });
    const calls: Array<() => Promise<unknown>> = [
      () => h.svc.list('A'), () => h.svc.conflicts('A'), () => h.svc.create('A', body() as any, MANAGER),
      () => h.svc.cancel('A', 'x', MANAGER), () => h.svc.complete('A', 'x', MANAGER),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.billing.hasFeature).toHaveBeenCalledWith('A', 'rail');
    for (const t of [h.windows, h.consignments, h.corridors, h.aiEvents]) for (const fn of t.fns) expect(fn).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('create', () => {
  it('records a PLANNED window, trims the title, and writes an audit entry carrying the actor', async () => {
    const h = make();
    const out = await h.svc.create('A', body({ title: '  Ore line maintenance  ', location: 'Km 120', imReference: 'IM-77', noticeGivenAt: at(-5).toISOString() }) as any, MANAGER, NOW);
    expect(out.window).toMatchObject({
      companyId: 'A', corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN', status: 'PLANNED', title: 'Ore line maintenance', location: 'Km 120', imReference: 'IM-77',
      createdById: 'u-mgr', createdByEmail: 'mia@toc.co.za',
    });
    expect(out.window.startsAt).toEqual(at(11));
    expect(out.window.noticeGivenAt).toEqual(at(-5));
    expect(out.conflicts).toEqual([]);
    expect(h.entries()[0]).toMatchObject({ action: RAIL_AUDIT_ACTION.POSSESSION_CREATED, actorType: 'tenant', actorId: 'u-mgr', targetType: 'rail_possession_window', targetName: 'Ore line maintenance' });
    expect(h.entries()[0].metadata).toMatchObject({ module: 'rail', companyId: 'A', corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN' });
  });

  describe('the 60-day lock (Annual Plan windows lock 60 days before they start; the other kinds are locked from the start)', () => {
    it.each([
      ['ANNUAL_PLAN', 90, false],
      ['ANNUAL_PLAN', 61, false],
      ['ANNUAL_PLAN', 60, true],
      ['ANNUAL_PLAN', 30, true],
      ['LOCKED_60_DAY', 90, true],
      ['AD_HOC_EMERGENCY', 1, true],
    ])('%s starting in %i days → locked: %s', async (kind, days, locked) => {
      const h = make();
      const out = await h.svc.create('A', body({ kind, startsAt: at(days).toISOString(), endsAt: at(days + 1).toISOString() }) as any, MANAGER, NOW);
      expect(out.window.locked).toBe(locked);
      expect(out.window.lockedFrom).toBe(kind === 'ANNUAL_PLAN' ? new Date(at(days).getTime() - 60 * DAY).toISOString() : null);
    });
  });

  it('rejects an unknown corridor, unparseable dates, an inverted range, and a window wholly in the past — writing nothing', async () => {
    const h = make();
    await expect(h.svc.create('A', body({ corridorCode: 'COR-NOPE' }) as any, MANAGER, NOW)).rejects.toThrow(/Unknown corridor "COR-NOPE"/);
    await expect(h.svc.create('A', body({ startsAt: 'later' }) as any, MANAGER, NOW)).rejects.toThrow(/valid dates/);
    await expect(h.svc.create('A', body({ endsAt: 'later' }) as any, MANAGER, NOW)).rejects.toThrow(/valid dates/);
    await expect(h.svc.create('A', body({ startsAt: at(5).toISOString(), endsAt: at(5).toISOString() }) as any, MANAGER, NOW)).rejects.toThrow(/must end after it starts/);
    await expect(h.svc.create('A', body({ startsAt: at(6).toISOString(), endsAt: at(5).toISOString() }) as any, MANAGER, NOW)).rejects.toThrow(/must end after it starts/);
    await expect(h.svc.create('A', body({ startsAt: at(-5).toISOString(), endsAt: at(-3).toISOString() }) as any, MANAGER, NOW)).rejects.toThrow(/cannot lie wholly in the past/);
    expect(h.windows.rows).toHaveLength(0);
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('an ad-hoc EMERGENCY may be recorded after the fact (the IM often tells the TOC late)', async () => {
    const h = make();
    const out = await h.svc.create('A', body({ kind: 'AD_HOC_EMERGENCY', startsAt: at(-2).toISOString(), endsAt: at(-1).toISOString() }) as any, MANAGER, NOW);
    expect(out.window.kind).toBe('AD_HOC_EMERGENCY');
  });

  it('accepts a corridor that exists in the seeded table, and falls back to the catalog when the table is empty', async () => {
    const h = make();
    expect((await h.svc.create('A', body({ corridorCode: 'COR-CAPE' }) as any, MANAGER, NOW)).window.corridorCode).toBe('COR-CAPE'); // catalog fallback
    h.corridors.seed({ code: 'COR-ONLY', name: 'Only', aliases: [], workbookRoutes: [], isActive: true });
    await expect(h.svc.create('A', body({ corridorCode: 'COR-CAPE' }) as any, MANAGER, NOW)).rejects.toThrow(/Unknown corridor "COR-CAPE"/); // the DB is now authoritative
    expect((await h.svc.create('A', body({ corridorCode: 'COR-ONLY' }) as any, MANAGER, NOW)).window.corridorCode).toBe('COR-ONLY');
  });

  describe('automatic conflict detection', () => {
    it('an ANNUAL_PLAN window not yet locked (starts > 60 days out) that overlaps a booked consignment → a PLANNED-severity conflict, audited and raised as a medium AiEvent', async () => {
      const h = make();
      h.seedCon({ consignmentNumber: 'RC-100', plannedDeparture: at(100), plannedArrival: at(102) });
      const out = await h.svc.create('A', body({ startsAt: at(101).toISOString(), endsAt: at(103).toISOString() }) as any, MANAGER, NOW);
      expect(out.conflicts).toHaveLength(1);
      expect(out.conflicts[0]).toMatchObject({ consignmentNumber: 'RC-100', corridorCode: 'COR-ORE', severity: 'PLANNED', overlapHours: 24 });
      expect(h.actions()).toEqual([RAIL_AUDIT_ACTION.POSSESSION_CREATED, RAIL_AUDIT_ACTION.POSSESSION_CONFLICT_DETECTED]);
      expect(h.entries()[1].metadata.conflicts).toEqual([{ consignment: 'RC-100', overlapHours: 24, severity: 'PLANNED' }]);
      expect(h.aiEvents.rows).toHaveLength(1);
      expect(h.aiEvents.rows[0]).toMatchObject({ companyId: 'A', type: 'RAIL_POSSESSION_CONFLICT', severity: 'medium', sourceType: 'RAIL_POSSESSION', sourceId: out.window.id });
      expect(h.aiEvents.rows[0].body).toContain('RC-100: 24 h (PLANNED)');
    });

    it('an ANNUAL_PLAN window that is already inside its 60-day lock is a HARD conflict, exactly like a locked one', async () => {
      const h = make();
      h.seedCon({ consignmentNumber: 'RC-102', plannedDeparture: at(10), plannedArrival: at(12) });
      const out = await h.svc.create('A', body({ startsAt: at(11).toISOString(), endsAt: at(13).toISOString() }) as any, MANAGER, NOW);
      expect(out.window.locked).toBe(true);
      expect(out.conflicts[0]).toMatchObject({ consignmentNumber: 'RC-102', severity: 'HARD' });
    });

    it('a locked or emergency window is a HARD conflict → high severity', async () => {
      const h = make();
      h.seedCon({ consignmentNumber: 'RC-101', plannedDeparture: at(10), plannedArrival: at(12) });
      const out = await h.svc.create('A', body({ kind: 'AD_HOC_EMERGENCY', startsAt: at(10.5).toISOString(), endsAt: at(11).toISOString() }) as any, MANAGER, NOW);
      expect(out.conflicts[0]).toMatchObject({ severity: 'HARD', overlapHours: 12 });
      expect(h.aiEvents.rows[0].severity).toBe('high');
    });

    it('no overlap → no conflict audit entry and no AiEvent', async () => {
      const h = make();
      h.seedCon({ plannedDeparture: at(1), plannedArrival: at(3) });
      const out = await h.svc.create('A', body() as any, MANAGER, NOW);
      expect(out.conflicts).toEqual([]);
      expect(h.actions()).toEqual([RAIL_AUDIT_ACTION.POSSESSION_CREATED]);
      expect(h.aiEvents.rows).toHaveLength(0);
    });

    it('touching ends are not an overlap (a train arriving the moment the window starts)', async () => {
      const h = make();
      h.seedCon({ plannedDeparture: at(9), plannedArrival: at(11) });
      expect((await h.svc.create('A', body({ startsAt: at(11).toISOString(), endsAt: at(13).toISOString() }) as any, MANAGER, NOW)).conflicts).toEqual([]);
    });

    it('only the tenant\'s own consignments are considered — another tenant\'s train is never reported', async () => {
      const h = make();
      h.seedCon({ companyId: 'B', consignmentNumber: 'B-1' });
      const out = await h.svc.create('A', body() as any, MANAGER, NOW);
      expect(out.conflicts).toEqual([]);
      expect(out.unscheduled).toEqual([]);
      expect(h.entries().every((e) => e.metadata.companyId === 'A')).toBe(true);
    });

    it('a consignment that is already delivered or cancelled does not occupy the path', async () => {
      const h = make();
      h.seedCon({ status: 'DELIVERED' });
      h.seedCon({ status: 'CANCELLED' });
      expect((await h.svc.create('A', body() as any, MANAGER, NOW)).conflicts).toEqual([]);
    });

    it('a consignment that CANNOT be checked is listed, never assumed clear: no schedule → unscheduled, unknown corridor → unresolved', async () => {
      const h = make();
      h.seedCon({ consignmentNumber: 'RC-NOSCHED', plannedDeparture: null, plannedArrival: null });
      h.seedCon({ consignmentNumber: 'RC-NOCORR', corridor: 'Atlantis' });
      h.seedCon({ consignmentNumber: 'RC-OK', plannedDeparture: at(1), plannedArrival: at(2) });
      const out = await h.svc.create('A', body() as any, MANAGER, NOW);
      expect(out.conflicts).toEqual([]);
      expect(out.unscheduled).toEqual(['RC-NOSCHED']);
      expect(out.unresolved).toEqual(['RC-NOCORR']);
    });

    it('resolves a consignment\'s free-text corridor through its aliases ("Cape 2" is the Ore corridor)', async () => {
      const h = make();
      h.seedCon({ consignmentNumber: 'RC-ALIAS', corridor: 'Cape 2' });
      expect((await h.svc.create('A', body() as any, MANAGER, NOW)).conflicts.map((c: any) => c.consignmentNumber)).toEqual(['RC-ALIAS']);
    });

    it('works out the occupied time from the actual departure and SLA hours when no arrival was planned', async () => {
      const h = make();
      h.seedCon({ consignmentNumber: 'RC-SLA', plannedDeparture: at(1), plannedArrival: null, actualDeparture: at(11), slaHours: 24 });
      const out = await h.svc.create('A', body() as any, MANAGER, NOW);
      expect(out.conflicts[0]).toMatchObject({ consignmentNumber: 'RC-SLA', overlapHours: 24 });
    });

    it('a failure to raise the AiEvent never fails the possession itself (best-effort alarm)', async () => {
      const h = make();
      h.seedCon();
      h.aiEvents.create.mockRejectedValueOnce(new Error('db down'));
      const out = await h.svc.create('A', body() as any, MANAGER, NOW);
      expect(out.window.id).toBeDefined();
      expect(out.conflicts).toHaveLength(1);
      expect(h.windows.rows).toHaveLength(1);
    });

    it('detection is advisory: it does not alter or block the consignment', async () => {
      const h = make();
      const c = h.seedCon();
      const before = snapshot(h.consignments);
      await h.svc.create('A', body() as any, MANAGER, NOW);
      expect(snapshot(h.consignments)).toBe(before);
      expect(h.consignments.update).not.toHaveBeenCalled();
      expect(h.consignments.rows[0].id).toBe(c.id);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('conflicts()', () => {
  it('scans only PLANNED / ACTIVE windows — cancelled and completed windows are history', async () => {
    const h = make();
    h.seedCon({ consignmentNumber: 'RC-1' });
    const live = h.seedWindow({ status: 'PLANNED', title: 'live' });
    h.seedWindow({ status: 'ACTIVE', title: 'active', corridorCode: 'COR-CAPE' }); // other corridor
    h.seedWindow({ status: 'CANCELLED', title: 'cancelled' });
    h.seedWindow({ status: 'COMPLETED', title: 'done' });
    const scan = await h.svc.conflicts('A', undefined, NOW);
    expect(scan.conflicts.map((c) => c.windowId)).toEqual([live.id]);
    expect(scan.consignmentsChecked).toBe(1);
  });

  it('can be limited to a single consignment (the drawer banner)', async () => {
    const h = make();
    const one = h.seedCon({ consignmentNumber: 'RC-1' });
    h.seedCon({ consignmentNumber: 'RC-2' });
    h.seedWindow();
    const all = await h.svc.conflicts('A', undefined, NOW);
    expect(all.conflicts.map((c) => c.consignmentNumber).sort()).toEqual(['RC-1', 'RC-2']);
    const scoped = await h.svc.conflicts('A', one.id, NOW);
    expect(scoped.conflicts.map((c) => c.consignmentNumber)).toEqual(['RC-1']);
    expect(scoped.consignmentsChecked).toBe(1);
  });

  it('reports a window that has become locked as HARD, and one that is not yet locked as PLANNED', async () => {
    const h = make();
    h.seedCon({ plannedDeparture: at(10), plannedArrival: at(12) });
    h.seedCon({ plannedDeparture: at(100), plannedArrival: at(102) });
    h.seedWindow({ title: 'soon', startsAt: at(11), endsAt: at(13) }); // starts in 11 d → locked (inside 60 d)
    h.seedWindow({ title: 'far', startsAt: at(101), endsAt: at(103) }); // starts in 101 d → not locked
    const scan = await h.svc.conflicts('A', undefined, NOW);
    expect(scan.conflicts.map((c) => [c.windowTitle, c.severity]).sort()).toEqual([['far', 'PLANNED'], ['soon', 'HARD']]);
  });

  it('is tenant-scoped on both sides: tenant B sees none of A\'s windows or consignments', async () => {
    const h = make();
    h.seedCon({ companyId: 'A' });
    h.seedWindow({ companyId: 'A' });
    const b = await h.svc.conflicts('B', undefined, NOW);
    expect(b).toMatchObject({ conflicts: [], unscheduled: [], unresolved: [], consignmentsChecked: 0 });
  });

  it('a consignment id from another tenant simply finds nothing', async () => {
    const h = make();
    const theirs = h.seedCon({ companyId: 'B' });
    h.seedWindow({ companyId: 'A' });
    const scan = await h.svc.conflicts('A', theirs.id, NOW);
    expect(scan).toMatchObject({ conflicts: [], consignmentsChecked: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('list', () => {
  it('returns only the caller\'s windows, soonest first, with the lock state computed against the clock', async () => {
    const h = make();
    const later = h.seedWindow({ title: 'later', startsAt: at(100), endsAt: at(101) });
    const sooner = h.seedWindow({ title: 'sooner', startsAt: at(20), endsAt: at(21) });
    h.seedWindow({ companyId: 'B', title: 'theirs' });
    const rows = await h.svc.list('A', {}, NOW);
    expect(rows.map((r: any) => r.id)).toEqual([sooner.id, later.id]);
    expect(rows.map((r: any) => r.locked)).toEqual([true, false]);
  });

  it('filters by corridor and by status', async () => {
    const h = make();
    h.seedWindow({ title: 'ore', corridorCode: 'COR-ORE' });
    h.seedWindow({ title: 'cape', corridorCode: 'COR-CAPE', status: 'CANCELLED' });
    expect((await h.svc.list('A', { corridorCode: 'COR-CAPE' }, NOW)).map((r: any) => r.title)).toEqual(['cape']);
    expect((await h.svc.list('A', { status: 'PLANNED' }, NOW)).map((r: any) => r.title)).toEqual(['ore']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('cancel / complete', () => {
  it.each([
    ['cancel', 'PLANNED', 'CANCELLED', RAIL_AUDIT_ACTION.POSSESSION_CANCELLED],
    ['cancel', 'ACTIVE', 'CANCELLED', RAIL_AUDIT_ACTION.POSSESSION_CANCELLED],
    ['complete', 'PLANNED', 'COMPLETED', RAIL_AUDIT_ACTION.POSSESSION_COMPLETED],
    ['complete', 'ACTIVE', 'COMPLETED', RAIL_AUDIT_ACTION.POSSESSION_COMPLETED],
  ])('%s moves a %s window to %s and audits it with from/to', async (method, from, to, action) => {
    const h = make();
    const w = h.seedWindow({ status: from });
    const out = await (h.svc as any)[method]('A', w.id, MANAGER);
    expect(out.status).toBe(to);
    expect(h.windows.rows[0].status).toBe(to);
    expect(h.entries()[0]).toMatchObject({ action, actorId: 'u-mgr', targetId: w.id });
    expect(h.entries()[0].metadata).toMatchObject({ from, to });
  });

  it.each([
    ['cancel', 'CANCELLED'], ['cancel', 'COMPLETED'], ['complete', 'CANCELLED'], ['complete', 'COMPLETED'],
  ])('%s is refused on a %s window — and nothing changes', async (method, status) => {
    const h = make();
    const w = h.seedWindow({ status });
    const before = snapshot(h.windows);
    await expect((h.svc as any)[method]('A', w.id, MANAGER)).rejects.toBeInstanceOf(BadRequestException);
    expect(snapshot(h.windows)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('another tenant\'s window cannot be cancelled or completed', async () => {
    const h = make();
    const w = h.seedWindow({ companyId: 'A' });
    const before = snapshot(h.windows);
    await expect(h.svc.cancel('B', w.id, MANAGER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.svc.complete('B', w.id, MANAGER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.svc.cancel('A', 'missing', MANAGER)).rejects.toBeInstanceOf(NotFoundException);
    expect(snapshot(h.windows)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('a cancelled window stops raising conflicts', async () => {
    const h = make();
    h.seedCon();
    const w = h.seedWindow();
    expect((await h.svc.conflicts('A', undefined, NOW)).conflicts).toHaveLength(1);
    await h.svc.cancel('A', w.id, MANAGER);
    expect((await h.svc.conflicts('A', undefined, NOW)).conflicts).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('runStatusSweep (hourly, platform-wide)', () => {
  it('activates a window whose time has come, completes one that has passed, and leaves the rest alone', async () => {
    const h = make();
    const starting = h.seedWindow({ title: 'starting', status: 'PLANNED', startsAt: atH(-1), endsAt: atH(5) });
    const over = h.seedWindow({ title: 'over', status: 'ACTIVE', startsAt: atH(-10), endsAt: atH(-1) });
    const missed = h.seedWindow({ title: 'missed', status: 'PLANNED', startsAt: atH(-10), endsAt: atH(-2) });
    const future = h.seedWindow({ title: 'future', status: 'PLANNED', startsAt: atH(5), endsAt: atH(8) });
    const cancelled = h.seedWindow({ title: 'cancelled', status: 'CANCELLED', startsAt: atH(-1), endsAt: atH(5) });
    const stillOn = h.seedWindow({ title: 'still on', status: 'ACTIVE', startsAt: atH(-1), endsAt: atH(5) });

    const out = await h.svc.runStatusSweep(NOW);
    expect(out).toEqual({ activated: 1, completed: 2 });
    const status = (id: string) => h.windows.rows.find((r) => r.id === id)!.status;
    expect([status(starting.id), status(over.id), status(missed.id), status(future.id), status(cancelled.id), status(stillOn.id)])
      .toEqual(['ACTIVE', 'COMPLETED', 'COMPLETED', 'PLANNED', 'CANCELLED', 'ACTIVE']);
    expect(h.actions().sort()).toEqual([RAIL_AUDIT_ACTION.POSSESSION_ACTIVATED, RAIL_AUDIT_ACTION.POSSESSION_COMPLETED, RAIL_AUDIT_ACTION.POSSESSION_COMPLETED]);
  });

  it('audits as the SYSTEM (no actor), attributed to the window\'s own tenant', async () => {
    const h = make();
    h.seedWindow({ companyId: 'A', status: 'PLANNED', startsAt: atH(-1), endsAt: atH(5) });
    h.seedWindow({ companyId: 'B', status: 'PLANNED', startsAt: atH(-1), endsAt: atH(5) });
    await h.svc.runStatusSweep(NOW);
    expect(h.entries()).toHaveLength(2);
    for (const e of h.entries()) expect(e).toMatchObject({ actorType: 'system', actorId: null, actorEmail: null });
    expect(h.entries().map((e) => e.metadata.companyId).sort()).toEqual(['A', 'B']);
    expect(h.entries()[0].metadata).toMatchObject({ from: 'PLANNED', to: 'ACTIVE' });
  });

  it('is idempotent: a second run at the same time changes nothing and audits nothing', async () => {
    const h = make();
    h.seedWindow({ status: 'PLANNED', startsAt: atH(-1), endsAt: atH(5) });
    h.seedWindow({ status: 'ACTIVE', startsAt: atH(-10), endsAt: atH(-1) });
    await h.svc.runStatusSweep(NOW);
    h.audit.record.mockClear();
    const before = snapshot(h.windows);
    expect(await h.svc.runStatusSweep(NOW)).toEqual({ activated: 0, completed: 0 });
    expect(snapshot(h.windows)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('the scheduled job never throws — a failed sweep is logged and the next hour tries again', async () => {
    const h = make();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    h.windows.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(h.svc.scheduledSweep()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Possession status sweep failed'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('corridors belong to a network', () => {
  /**
   * The six corridors in the catalogue are Transnet's V4 corridors, and every
   * tenant was offered all of them. A possession window is a booking of track
   * on a specific corridor, so a European operator was being invited to book
   * maintenance on the Ore line between Sishen and Saldanha.
   *
   * What is NOT being fixed here: the technical envelope (gauge,
   * electrification, axle load) is still SOURCE_PENDING, because Network
   * Statement Chapter 2 was never supplied to this repository. Inventing
   * those numbers would be worse than leaving them null -- the envelope check
   * correctly reports UNVERIFIED rather than rejecting against a guess.
   */
  const TRANSNET = 'net-transnet';
  const UK = 'net-uk';

  function withNetworks(h: any, networks: Array<Record<string, unknown>>) {
    h.prisma.railNetwork = {
      findFirst: jest.fn(async ({ where }: any) => {
        const hit = networks.find((n) => {
          if (where?.id && n.id !== where.id) return false;
          if (where?.isDefault !== undefined && !!n.isDefault !== !!where.isDefault) return false;
          if (where && 'companyId' in where && n.companyId !== where.companyId) return false;
          return true;
        });
        return hit ?? null;
      }),
    };
    return h;
  }

  it('offers a Transnet tenant the Transnet corridors', async () => {
    const h = withNetworks(make(), [{ id: TRANSNET, isDefault: true, companyId: null }]);
    h.corridors.seed({ code: 'COR-ORE', name: 'Ore', aliases: [], workbookRoutes: [], networkId: TRANSNET, isActive: true });

    const created = await h.svc.create('A', {
      corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN', title: 'Ore line maintenance',
      startsAt: at(11).toISOString(), endsAt: at(13).toISOString(),
    } as any, MANAGER, NOW);
    expect(created).toBeDefined();
  });

  it("does not offer another network's corridors", async () => {
    const h = withNetworks(make(), [{ id: UK, isDefault: true, companyId: null }]);
    h.corridors.seed({ code: 'COR-ORE', name: 'Ore', aliases: [], workbookRoutes: [], networkId: TRANSNET, isActive: true });
    h.corridors.seed({ code: 'COR-WCML', name: 'West Coast Main Line', aliases: [], workbookRoutes: [], networkId: UK, isActive: true });

    await expect(
      h.svc.create('A', {
        corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN', title: 'Ore line maintenance',
        startsAt: at(11).toISOString(), endsAt: at(13).toISOString(),
      } as any, MANAGER, NOW),
    ).rejects.toThrow(/Unknown corridor/);

    const ok = await h.svc.create('A', {
      corridorCode: 'COR-WCML', kind: 'ANNUAL_PLAN', title: 'WCML maintenance',
      startsAt: at(11).toISOString(), endsAt: at(13).toISOString(),
    } as any, MANAGER, NOW);
    expect(ok).toBeDefined();
  });

  it('a corridor with no network is still offered, so nothing regresses on old rows', async () => {
    // Rows seeded before this change carry NULL. Treating NULL as "nobody's"
    // would make every existing corridor vanish.
    const h = withNetworks(make(), [{ id: UK, isDefault: true, companyId: null }]);
    h.corridors.seed({ code: 'COR-LEGACY', name: 'Legacy corridor', aliases: [], workbookRoutes: [], networkId: null, isActive: true });

    const created = await h.svc.create('A', {
      corridorCode: 'COR-LEGACY', kind: 'ANNUAL_PLAN', title: 'Legacy work',
      startsAt: at(11).toISOString(), endsAt: at(13).toISOString(),
    } as any, MANAGER, NOW);
    expect(created).toBeDefined();
  });
});
