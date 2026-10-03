/**
 * Tariff calculation service and the idempotent invoice draft. Prisma is an in-memory fake.
 * ALL RATES BELOW ARE SYNTHETIC FIXTURES — no real c/GTK rate has been supplied. The first thing most of these tests prove
 * is what the service does with NO rate: it refuses.
 */
import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { FakeTable, snapshot } from '../../test/support/in-memory-db';
import { Money } from '../common/money.util';
import { InvoicesService } from '../invoices/invoices.service';
import { RailTariffService } from './rail-tariff.service';
import { RAIL_AUDIT_ACTION, RailActor } from './rail-audit';

const NOW = new Date('2026-10-02T10:00:00.000Z');
const year = new Date().getFullYear();
const MANAGER: RailActor = { id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: UserRole.MANAGER };

const schedule = (over: Record<string, any> = {}) => ({
  corridorCode: 'COR-ORE', financialYear: '2026/27', loadedCentsPerGtk: 5, emptyCentsPerGtk: 2, dieselLitresPer1000Gtk: null, electricKwhPer1000Gtk: null, dieselPricePerLitreZar: null,
  electricityPricePerKwhZar: null, overloadPenaltyPerTonneZar: null, dataStatus: 'VERIFIED', sourceRef: 'SYNTHETIC test tariff', isActive: true, currency: 'ZAR', ...over,
});

function make(opts: { entitled?: boolean; schedules?: Record<string, any>[] } = {}) {
  const consignments = new FakeTable('con');
  const readings = new FakeTable('wr');
  const schedules = new FakeTable('tar');
  const calcs = new FakeTable('tc', {
    unique: [['companyId', 'calculationNumber']],
    defaults: () => ({ scheduleId: null, gtkLoaded: null, gtkEmpty: null, holdTriggered: false, invoiceDraftId: null, invoiceDraftedAt: null, currency: 'ZAR' }),
  });
  const ancillary = new FakeTable('anc');
  const corridors = new FakeTable('cor');
  const drafts = new FakeTable('draft', { unique: [['id']] }); // the primary key is the idempotency key
  for (const s of opts.schedules ?? []) schedules.seed(s);
  const prisma = {
    railConsignment: consignments, railWeighbridgeReading: readings, railTariffSchedule: schedules, railTariffCalculation: calcs,
    railAncillaryServiceCatalog: ancillary, railCorridorNode: corridors, invoiceDraft: drafts,
  };
  const billing = { hasFeature: jest.fn().mockResolvedValue(opts.entitled ?? true) };
  const audit = { record: jest.fn().mockResolvedValue('audit-1') };
  const svc = new RailTariffService(prisma as any, billing as any, audit as any);

  const seedConsignment = (over: Record<string, any> = {}) => consignments.seed({
    companyId: 'A', consignmentNumber: 'RAIL-2026-00007', status: 'LOADING', clientName: 'Seriti Resources', corridor: 'Ore', plannedDeparture: new Date('2026-10-05T04:00:00Z'),
    wagons: [
      { id: 'w1', wagonNumber: 'W1', tareTonnes: 22, loadedTonnes: 60, axles: 4 },
      { id: 'w2', wagonNumber: 'W2', tareTonnes: 22, loadedTonnes: 58, axles: 4 },
    ], ...over,
  });
  const reading = (consignmentId: string, wagonNumber: string, status: string, createdAt: string, over: Record<string, any> = {}) => readings.seed({
    companyId: 'A', consignmentId, wagonNumber, actualTonnes: 100, status, excessTonnes: status === 'OVERLOADED' ? 3 : null, createdAt: new Date(createdAt), ...over,
  });
  const entries = () => audit.record.mock.calls.map(([e]) => e);
  return { svc, prisma, billing, audit, consignments, readings, schedules, calcs, ancillary, corridors, drafts, seedConsignment, reading, entries };
}
const body = (consignmentId: string, over: Record<string, any> = {}) => ({ consignmentId, distanceKm: 100, ...over });

afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
describe('entitlement', () => {
  it('every public method is refused without the `rail` feature, before any data access', async () => {
    const h = make({ entitled: false });
    const calls: Array<() => Promise<unknown>> = [
      () => h.svc.status('A'), () => h.svc.listAncillary('A'), () => h.svc.preview('A', body('x') as any), () => h.svc.calculate('A', body('x') as any, MANAGER),
      () => h.svc.list('A'), () => h.svc.get('A', 'x'), () => h.svc.generateInvoiceDraft('A', 'x', {}, MANAGER, NOW),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    for (const t of [h.consignments, h.readings, h.schedules, h.calcs, h.ancillary, h.corridors, h.drafts]) for (const fn of t.fns) expect(fn).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('status — what can be priced today', () => {
  it('with no rate loaded (today\'s truth) NO corridor can be priced, and it says so', async () => {
    const h = make();
    const s = await h.svc.status('A');
    expect(s.summary).toMatchObject({ corridors: 6, withVerifiedRate: 0 });
    expect(s.corridors.every((c) => c.years.length === 0 && c.hasVerifiedLoadedRate === false)).toBe(true);
    expect(s.message).toMatch(/No corridor has a VERIFIED c\/GTK rate loaded.*refused rather than priced with an invented rate/);
  });

  it('reports the brief\'s constants, labelled as unverified', async () => {
    const s = await make().svc.status('A');
    expect(s.constants).toMatchObject({ infrastructureEscalationPct: 8.5, electricityEscalationPct: 4.42, dieselBasePricePerLitreZar: 24.64 });
    expect(s.constants.source).toMatch(/\[BRIEF\].*unverified/);
  });

  it('reports the 113 Annexure 40 lines: 105 not published, 8 TBD, none priced', async () => {
    const s = await make().svc.status('A');
    expect(s.summary).toMatchObject({ ancillaryLines: 113, ancillaryPublished: 0, ancillaryTbd: 8, ancillaryNotPublished: 105 });
    expect(s.fromCatalogFallback).toBe(true);
  });

  it('only a VERIFIED schedule WITH a loaded rate counts', async () => {
    const h = make({ schedules: [
      schedule(), // COR-ORE: counts
      schedule({ corridorCode: 'COR-NORTH', dataStatus: 'SOURCE_PENDING' }),
      schedule({ corridorCode: 'COR-CAPE', loadedCentsPerGtk: null }),
      schedule({ corridorCode: 'COR-CENTRAL', isActive: false }),
    ] });
    const s = await h.svc.status('A');
    expect(s.summary.withVerifiedRate).toBe(1);
    expect(s.corridors.find((c) => c.code === 'COR-ORE')).toMatchObject({ hasVerifiedLoadedRate: true, years: [{ financialYear: '2026/27', hasLoadedRate: true, hasEmptyRate: true, dataStatus: 'VERIFIED' }] });
    for (const code of ['COR-NORTH', 'COR-CAPE', 'COR-CENTRAL', 'COR-CONTAINER']) {
      expect(s.corridors.find((c) => c.code === code)!.hasVerifiedLoadedRate).toBe(false); // pending / no rate / inactive / none loaded
    }
    expect(s.message).toMatch(/1 of 6 corridors have a VERIFIED loaded rate/);
  });

  it('serves seeded Annexure 40 rows when they exist, instead of the code catalogue', async () => {
    const h = make();
    h.ancillary.seed({ code: 'ANX40-01', name: 'Shunting', serviceName: 'Shunting', unitOfMeasure: 'Per wagon', priceStatus: 'PUBLISHED', unitRateZar: 12.5, serviceNumber: 1, tier: 1, tierName: 'T1', serviceGroup: 'RAIL', isCompulsory: true, isActive: true });
    const list = await h.svc.listAncillary('A');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ code: 'ANX40-01', unitRateZar: 12.5, group: 'RAIL', fromCatalog: false });
    expect((await h.svc.status('A')).summary).toMatchObject({ ancillaryLines: 1, ancillaryPublished: 1 });
  });

  it('listAncillary falls back to the 113 catalogue lines before the seeder has run', async () => {
    const list = await make().svc.listAncillary('A');
    expect(list).toHaveLength(113);
    expect(list.every((a) => a.fromCatalog && a.unitRateZar === null)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('preview', () => {
  it('with NO rate loaded it REFUSES (status BLOCKED, reasons given) and saves nothing', async () => {
    const h = make();
    const c = h.seedConsignment();
    const before = snapshot(h.calcs, h.drafts);
    const out = await h.svc.preview('A', body(c.id) as any);
    expect(out.result.status).toBe('BLOCKED');
    expect(out.result.lines).toEqual([]);
    expect(out.result.blockers.join(' ')).toMatch(/No loaded c\/GTK rate exists for COR-ORE.*never defaulted/);
    expect(snapshot(h.calcs, h.drafts)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('prices a loaded train from the stored weights: 162 t × 100 km × 5 c = R810.00, with the consignment and corridor identified', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment();
    const out = await h.svc.preview('A', body(c.id) as any);
    expect(out.result).toMatchObject({ status: 'PRICED', gtkLoaded: 16_200, subtotalZar: 810, scheduleFinancialYear: '2026/27', escalationYears: 0 });
    expect(out.consignment).toMatchObject({ id: c.id, consignmentNumber: 'RAIL-2026-00007', wagons: 2, clientName: 'Seriti Resources' });
    expect(out.corridor).toEqual({ code: 'COR-ORE', name: 'Ore' });
    expect(out.financialYear).toBe('2026/27');
    expect(out.constants.source).toMatch(/\[BRIEF\]/);
  });

  it('the financial year comes from the planned departure (South African calendar), unless one is given', async () => {
    const h = make({ schedules: [schedule({ financialYear: '2025/26' }), schedule()] });
    const march = h.seedConsignment({ plannedDeparture: new Date('2026-03-31T10:00:00Z'), consignmentNumber: 'R-MAR' });
    const april = h.seedConsignment({ plannedDeparture: new Date('2026-04-01T10:00:00Z'), consignmentNumber: 'R-APR' });
    expect((await h.svc.preview('A', body(march.id) as any)).financialYear).toBe('2025/26');
    expect((await h.svc.preview('A', body(april.id) as any)).financialYear).toBe('2026/27');
    expect((await h.svc.preview('A', body(april.id, { financialYear: '2025/26' }) as any)).financialYear).toBe('2025/26');
  });

  it('with no planned departure and no year given it asks for one rather than guessing', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment({ plannedDeparture: null });
    await expect(h.svc.preview('A', body(c.id) as any)).rejects.toThrow(/financialYear is required: the consignment has no planned departure/);
    expect((await h.svc.preview('A', body(c.id, { financialYear: '2026/27' }) as any)).result.status).toBe('PRICED');
  });

  it('another tenant\'s consignment is a 404', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment({ companyId: 'A' });
    await expect(h.svc.preview('B', body(c.id) as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a corridor text that is not in the catalogue is a blocker — a rate is never picked by guesswork', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment({ corridor: 'Orex line' });
    const out = await h.svc.preview('A', body(c.id) as any);
    expect(out.corridor).toBeNull();
    expect(out.result.status).toBe('BLOCKED');
    expect(out.result.blockers.join(' ')).toMatch(/does not match a corridor in the catalogue/);
  });

  it('the corridor is found by its alias (Cape 2 is the Ore corridor)', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment({ corridor: 'Cape 2' });
    expect((await h.svc.preview('A', body(c.id) as any)).corridor?.code).toBe('COR-ORE');
  });

  it('uses the LATEST weighbridge reading of each wagon for the weight', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment();
    h.reading(c.id, 'W1', 'WITHIN_LIMIT', '2026-10-02T08:00:00Z', { actualTonnes: 70 });
    h.reading(c.id, 'W1', 'WITHIN_LIMIT', '2026-10-02T09:00:00Z', { actualTonnes: 90 }); // the later one counts
    const out = await h.svc.preview('A', body(c.id) as any);
    expect(out.result.grossTonnesLoaded).toBe(170); // 90 + 80
    expect(out.result.weightSources[0]).toMatchObject({ wagonNumber: 'W1', source: 'WEIGHBRIDGE', grossTonnes: 90 });
  });

  it('an overloaded wagon puts the penalty line and the hold into the result; with no penalty rate the result is INCOMPLETE', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment();
    h.reading(c.id, 'W1', 'OVERLOADED', '2026-10-02T08:00:00Z');
    const out = await h.svc.preview('A', body(c.id) as any);
    expect(out.result.hold).toMatchObject({ held: true, totalExcessTonnes: 3 });
    expect(out.result.lines.find((l) => l.kind === 'OVERLOAD_PENALTY')).toMatchObject({ quantity: 3, rate: null, amountZar: null });
    expect(out.result.status).toBe('INCOMPLETE');
  });

  it('an overload that was later corrected adds no penalty line but is surfaced for a decision', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment();
    h.reading(c.id, 'W1', 'OVERLOADED', '2026-10-02T08:00:00Z', { excessTonnes: 4.5 });
    h.reading(c.id, 'W1', 'WITHIN_LIMIT', '2026-10-02T09:00:00Z', { actualTonnes: 79 });
    const out = await h.svc.preview('A', body(c.id) as any);
    expect(out.result.lines.some((l) => l.kind === 'OVERLOAD_PENALTY')).toBe(false);
    expect(out.result.warnings.join(' ')).toMatch(/W1 was recorded 4\.5 t over its limit and later re-weighed within it/);
  });

  it('readings of another tenant\'s consignment never reach the calculation', async () => {
    const h = make({ schedules: [schedule()] });
    const mine = h.seedConsignment({ companyId: 'A' });
    h.readings.seed({ companyId: 'B', consignmentId: mine.id, wagonNumber: 'W1', actualTonnes: 500, status: 'OVERLOADED', excessTonnes: 99, createdAt: new Date('2026-10-02T09:00:00Z') });
    const out = await h.svc.preview('A', body(mine.id) as any);
    expect(out.result.hold.held).toBe(false);
    expect(out.result.grossTonnesLoaded).toBe(162);
  });

  it('only the requested Annexure 40 lines are priced, from the catalogue: TBD / unpublished are unpriced, an unknown code is refused', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment();
    const tbd = (await h.svc.listAncillary('A')).find((a) => a.priceStatus === 'TBD')!;
    const unpriced = await h.svc.preview('A', body(c.id, { ancillary: [{ code: tbd.code, quantity: 2 }] }) as any);
    expect(unpriced.result.status).toBe('INCOMPLETE');
    expect(unpriced.result.lines.find((l) => l.kind === 'ANCILLARY')).toMatchObject({ code: tbd.code, amountZar: null });
    const unknown = await h.svc.preview('A', body(c.id, { ancillary: [{ code: 'ANX40-99', quantity: 1 }] }) as any);
    expect(unknown.result.status).toBe('BLOCKED');
  });

  it('prices a PUBLISHED Annexure 40 line from the seeded table', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment();
    h.ancillary.seed({ code: 'ANX40-01', name: 'Shunting', serviceName: 'Shunting', unitOfMeasure: 'Per wagon movement', priceStatus: 'PUBLISHED', unitRateZar: 12.5, serviceNumber: 1, tier: 1, tierName: 'T1', serviceGroup: 'RAIL', isCompulsory: true, isActive: true });
    const out = await h.svc.preview('A', body(c.id, { ancillary: [{ code: 'ANX40-01', quantity: 3 }] }) as any);
    expect(out.result).toMatchObject({ status: 'PRICED', subtotalZar: 847.5 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('calculate (saving)', () => {
  it('REFUSES a consignment that cannot be priced: a 400 with every reason, and nothing is saved or audited', async () => {
    const h = make();
    const c = h.seedConsignment();
    const before = snapshot(h.calcs);
    await expect(h.svc.calculate('A', body(c.id) as any, MANAGER)).rejects.toThrow(/This consignment cannot be priced: .*No loaded c\/GTK rate exists for COR-ORE/);
    await expect(h.svc.calculate('A', body(c.id) as any, MANAGER)).rejects.toBeInstanceOf(BadRequestException);
    expect(snapshot(h.calcs)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('saves a PRICED calculation with its number, lines, inputs and an audit entry', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment();
    const out = await h.svc.calculate('A', body(c.id, { includeEmptyReturn: true }) as any, MANAGER);
    expect(out.calculation).toMatchObject({
      companyId: 'A', calculationNumber: `TC-${year}-00001`, consignmentId: c.id, consignmentNumber: 'RAIL-2026-00007', corridorCode: 'COR-ORE', financialYear: '2026/27', status: 'PRICED',
      gtkLoaded: 16_200, gtkEmpty: 4_400, subtotalZar: 898, currency: 'ZAR', holdTriggered: false, invoiceDraftId: null, createdById: 'u-mgr', createdByEmail: 'mia@toc.co.za',
    });
    expect((out.calculation.lines as any[]).map((l) => [l.kind, l.amountZar])).toEqual([['GTK_LOADED', 810], ['GTK_EMPTY', 88]]);
    expect(out.calculation.inputs).toMatchObject({ distanceKm: 100, includeEmptyReturn: true, allowEscalation: false, corridorText: 'Ore', escalationYears: 0, scheduleFinancialYear: '2026/27' });
    expect((out.calculation.inputs as any).weightSources).toHaveLength(2);
    expect((out.calculation.inputs as any).constants).toMatchObject({ infrastructureEscalationPct: 8.5 });
    expect(out.result.status).toBe('PRICED');
    expect(h.entries()).toEqual([expect.objectContaining({ action: RAIL_AUDIT_ACTION.TARIFF_CALCULATED, actorId: 'u-mgr', targetType: 'rail_tariff_calculation', targetId: out.calculation.id, targetName: `TC-${year}-00001` })]);
    expect(h.entries()[0].metadata).toMatchObject({ companyId: 'A', status: 'PRICED', subtotalZar: 898, lines: 2, unpricedLines: 0 });
  });

  it('saves an INCOMPLETE calculation (an unpriced line) — and keeps the reasons', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment();
    const tbd = (await h.svc.listAncillary('A')).find((a) => a.priceStatus === 'TBD')!;
    const out = await h.svc.calculate('A', body(c.id, { ancillary: [{ code: tbd.code, quantity: 1 }] }) as any, MANAGER);
    expect(out.calculation).toMatchObject({ status: 'INCOMPLETE', subtotalZar: 810 });
    expect((out.calculation.blockers as string[])).toHaveLength(1);
    expect((out.calculation.blockers as string[])[0]).toContain(tbd.code);
  });

  it('records escalation in the inputs so a saved number can always be explained', async () => {
    const h = make({ schedules: [schedule({ financialYear: '2025/26' })] });
    const c = h.seedConsignment();
    const out = await h.svc.calculate('A', body(c.id, { allowEscalation: true }) as any, MANAGER);
    expect(out.calculation.inputs).toMatchObject({ allowEscalation: true, escalationYears: 1, scheduleFinancialYear: '2025/26' });
    expect(out.calculation.subtotalZar).toBe(878.85);
    expect((out.calculation.warnings as string[]).join(' ')).toMatch(/escalated 1 year\(s\) by 8\.50% a year \[BRIEF\]/);
  });

  it('flags a calculation made while the consignment is on hold, with its penalty line', async () => {
    const h = make({ schedules: [schedule({ overloadPenaltyPerTonneZar: 100 })] });
    const c = h.seedConsignment();
    h.reading(c.id, 'W1', 'OVERLOADED', '2026-10-02T08:00:00Z');
    const out = await h.svc.calculate('A', body(c.id) as any, MANAGER);
    expect(out.calculation).toMatchObject({ holdTriggered: true, status: 'PRICED' });
    expect((out.calculation.lines as any[]).find((l) => l.kind === 'OVERLOAD_PENALTY')).toMatchObject({ amountZar: 300 });
  });

  it('numbers calculations per tenant and survives a collision by retrying', async () => {
    const h = make({ schedules: [schedule()] });
    const a = h.seedConsignment({ companyId: 'A' });
    expect((await h.svc.calculate('A', body(a.id) as any, MANAGER)).calculation.calculationNumber).toBe(`TC-${year}-00001`);
    h.calcs.count.mockResolvedValueOnce(0); // a racing request counted before the first committed
    expect((await h.svc.calculate('A', body(a.id) as any, MANAGER)).calculation.calculationNumber).toBe(`TC-${year}-00002`);
    expect(h.calcs.rows).toHaveLength(2);
  });

  it('an audit failure never loses the calculation', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const h = make({ schedules: [schedule()] });
    h.audit.record.mockRejectedValue(new Error('audit store down'));
    const c = h.seedConsignment();
    expect((await h.svc.calculate('A', body(c.id) as any, MANAGER)).calculation.status).toBe('PRICED');
    expect(h.calcs.rows).toHaveLength(1);
  });

  it('another tenant cannot calculate against (or learn about) this consignment: 404, nothing saved', async () => {
    const h = make({ schedules: [schedule()] });
    const c = h.seedConsignment({ companyId: 'A' });
    await expect(h.svc.calculate('B', body(c.id) as any, MANAGER)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.calcs.rows).toHaveLength(0);
  });
});

describe('list / get', () => {
  it('are tenant-scoped; the list is newest first and filterable by consignment', async () => {
    const h = make({ schedules: [schedule()] });
    const c1 = h.seedConsignment({ companyId: 'A', consignmentNumber: 'R-1' });
    const c2 = h.seedConsignment({ companyId: 'A', consignmentNumber: 'R-2' });
    const first = (await h.svc.calculate('A', body(c1.id) as any, MANAGER)).calculation;
    h.calcs.rows.find((r) => r.id === first.id)!.createdAt = new Date('2026-01-01');
    const second = (await h.svc.calculate('A', body(c2.id) as any, MANAGER)).calculation;
    expect((await h.svc.list('A')).map((r) => r.id)).toEqual([second.id, first.id]);
    expect((await h.svc.list('A', { consignmentId: c1.id })).map((r) => r.id)).toEqual([first.id]);
    expect(await h.svc.list('B')).toEqual([]);
    expect((await h.svc.get('A', first.id)).id).toBe(first.id);
    await expect(h.svc.get('B', first.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('Generate Invoice Draft', () => {
  const priced = async (h: ReturnType<typeof make>, over: Record<string, any> = {}, reqOver: Record<string, any> = {}) => {
    const c = h.seedConsignment(over);
    const out = await h.svc.calculate('A', body(c.id, reqOver) as any, MANAGER);
    h.audit.record.mockClear();
    return { c, calc: out.calculation };
  };

  it('turns a fully priced calculation into ONE draft: one lump-sum line per charge, summing to the calculation', async () => {
    const h = make({ schedules: [schedule()] });
    const { calc } = await priced(h, {}, { includeEmptyReturn: true });
    const out = await h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW);
    expect(out.created).toBe(true);
    const draft = h.drafts.rows[0];
    expect(draft).toMatchObject({ id: `rail-draft-${calc.id}`, companyId: 'A', title: `Rail charges RAIL-2026-00007 (TC-${year}-00001)` });
    expect(Object.keys(draft.draftData).sort()).toEqual(['clientName', 'items', 'notes']);
    expect(draft.draftData.clientName).toBe('Seriti Resources');
    expect(draft.draftData.notes).toBe(`Rail charges — consignment RAIL-2026-00007, corridor COR-ORE, financial year 2026/27 (calculation TC-${year}-00001).`);
    expect(draft.draftData.items.map((i: any) => [i.quantity, i.unitPrice])).toEqual([[1, 810], [1, 88]]);
    expect(Money.sum(draft.draftData.items.map((i: any) => i.unitPrice))).toBe(calc.subtotalZar);
    expect(draft.draftData.items[0].description).toMatch(/^Infrastructure access — loaded train \(COR-ORE\): 162 gross t .* 16200 GTK × 5 c\/GTK$/);
    expect(draft.finalized ?? false).toBe(false);
  });

  it('records where the draft came from (provenance in aiAnalysis, not in draftData)', async () => {
    const h = make({ schedules: [schedule()] });
    const { calc, c } = await priced(h);
    await h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW);
    expect(h.drafts.rows[0].aiAnalysis).toMatchObject({ source: 'RAIL_TARIFF', calculationId: calc.id, calculationNumber: calc.calculationNumber, consignmentId: c.id, lineCount: 1, subtotalZar: 810 });
  });

  it('links the calculation to the draft and audits it once', async () => {
    const h = make({ schedules: [schedule()] });
    const { calc } = await priced(h);
    await h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW);
    expect(h.calcs.rows[0]).toMatchObject({ invoiceDraftId: `rail-draft-${calc.id}`, invoiceDraftedAt: NOW });
    expect(h.entries()).toEqual([expect.objectContaining({ action: RAIL_AUDIT_ACTION.TARIFF_INVOICE_DRAFT_CREATED, actorId: 'u-mgr', targetId: calc.id })]);
    expect(h.entries()[0].metadata).toMatchObject({ invoiceDraftId: `rail-draft-${calc.id}`, subtotalZar: 810 });
  });

  it('is IDEMPOTENT: a second click returns the same draft and creates nothing', async () => {
    const h = make({ schedules: [schedule()] });
    const { calc } = await priced(h);
    const first = await h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW);
    h.audit.record.mockClear();
    const second = await h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW);
    expect(second.created).toBe(false);
    expect(second.draft!.id).toBe(first.draft!.id);
    expect(h.drafts.rows).toHaveLength(1);
    expect(h.drafts.create).toHaveBeenCalledTimes(1);
    expect(h.audit.record).not.toHaveBeenCalled(); // nothing happened the second time
  });

  it('is idempotent under a DOUBLE-CLICK: two simultaneous requests produce exactly one draft, and both get it back', async () => {
    const h = make({ schedules: [schedule()] });
    const { calc } = await priced(h);
    const [a, b] = await Promise.all([h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW), h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW)]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.draft!.id).toBe(b.draft!.id);
    expect(h.drafts.rows).toHaveLength(1);
    expect(h.calcs.rows[0].invoiceDraftId).toBe(`rail-draft-${calc.id}`);
    expect(h.entries().filter((e) => e.action === RAIL_AUDIT_ACTION.TARIFF_INVOICE_DRAFT_CREATED)).toHaveLength(1);
  });

  it('recovers from a crash between creating the draft and linking it: the retry finds the draft and links it', async () => {
    const h = make({ schedules: [schedule()] });
    const { calc } = await priced(h);
    // the draft exists (an earlier attempt created it) but the calculation was never linked
    h.drafts.seed({ id: `rail-draft-${calc.id}`, companyId: 'A', title: 'earlier', draftData: { clientName: 'x', items: [] } });
    expect(h.calcs.rows[0].invoiceDraftId).toBeNull();
    const out = await h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW);
    expect(out.created).toBe(false);
    expect(out.draft!.title).toBe('earlier');
    expect(h.drafts.rows).toHaveLength(1);
    expect(h.calcs.rows[0].invoiceDraftId).toBe(`rail-draft-${calc.id}`);
  });

  it('REFUSES an INCOMPLETE calculation (an unpriced line): no draft, no link', async () => {
    const h = make({ schedules: [schedule()] });
    const tbd = (await h.svc.listAncillary('A')).find((a) => a.priceStatus === 'TBD')!;
    const { calc } = await priced(h, {}, { ancillary: [{ code: tbd.code, quantity: 1 }] });
    await expect(h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW)).rejects.toThrow(/still has unpriced lines \(1\), so it cannot become an invoice draft/);
    expect(h.drafts.rows).toHaveLength(0);
    expect(h.calcs.rows[0].invoiceDraftId).toBeNull();
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('needs a client name — from the consignment or the request — because an invoice cannot be finalised without one', async () => {
    const h = make({ schedules: [schedule()] });
    const { calc } = await priced(h, { clientName: null });
    await expect(h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW)).rejects.toThrow(/A client name is required for an invoice/);
    await expect(h.svc.generateInvoiceDraft('A', calc.id, { clientName: '   ' }, MANAGER, NOW)).rejects.toThrow(/A client name is required/);
    expect(h.drafts.rows).toHaveLength(0);
    const ok = await h.svc.generateInvoiceDraft('A', calc.id, { clientName: '  Kumba Iron Ore  ' }, MANAGER, NOW);
    expect(ok.draft!.draftData.clientName).toBe('Kumba Iron Ore');
  });

  it('another tenant gets a 404 and cannot create — or read — a draft', async () => {
    const h = make({ schedules: [schedule()] });
    const { calc } = await priced(h);
    await expect(h.svc.generateInvoiceDraft('B', calc.id, {}, MANAGER, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.drafts.rows).toHaveLength(0);
  });

  it('a tenant that reaches an already-drafted calculation only ever reads back ITS OWN draft', async () => {
    const h = make({ schedules: [schedule()] });
    const { calc } = await priced(h);
    h.calcs.rows[0].invoiceDraftId = 'someone-elses-draft';
    h.drafts.seed({ id: 'someone-elses-draft', companyId: 'B', title: 'not yours', draftData: {} });
    expect((await h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW)).draft).toBeNull();
  });

  it('truncates a very long line description', async () => {
    const h = make({ schedules: [schedule()] });
    const { calc } = await priced(h);
    h.calcs.rows[0].lines = [{ kind: 'GTK_LOADED', description: 'x'.repeat(300), basis: 'y'.repeat(300), amountZar: 5, quantity: 1, unit: 'GTK', rate: 5, rateUnit: 'c/GTK', evidence: [] }];
    await h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW);
    const description: string = h.drafts.rows[0].draftData.items[0].description;
    expect(description.length).toBeLessThanOrEqual(480);
    expect(description.endsWith('…')).toBe(true);
  });

  describe('it really is a draft the Invoices module can finalise', () => {
    it('draftData holds only keys that exist on the Invoice / InvoiceItem models (create() spreads every other key into Prisma)', async () => {
      const h = make({ schedules: [schedule()] });
      const { calc } = await priced(h, {}, { includeEmptyReturn: true });
      await h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW);
      const data = h.drafts.rows[0].draftData;
      const models = Prisma.dmmf.datamodel.models;
      const invoiceFields = models.find((m) => m.name === 'Invoice')!.fields.map((f) => f.name);
      const itemFields = models.find((m) => m.name === 'InvoiceItem')!.fields.map((f) => f.name);
      for (const k of Object.keys(data)) expect([...invoiceFields, 'items']).toContain(k);
      for (const item of data.items) for (const k of Object.keys(item)) expect(itemFields).toContain(k);
    });

    it('finalizeDraft turns it into an invoice whose subtotal is the calculation and whose VAT is the platform default', async () => {
      const h = make({ schedules: [schedule()] });
      const { calc } = await priced(h, {}, { includeEmptyReturn: true });
      await h.svc.generateInvoiceDraft('A', calc.id, {}, MANAGER, NOW);

      const created: any[] = [];
      const invoicesPrisma = {
        invoiceDraft: h.drafts,
        invoice: { count: jest.fn().mockResolvedValue(0), create: jest.fn(async ({ data }: any) => { created.push(data); return { id: 'inv-1', ...data }; }) },
      };
      const invoices = new InvoicesService(invoicesPrisma as any, {} as any, {} as any, {} as any);
      const invoice: any = await invoices.finalizeDraft(`rail-draft-${calc.id}`, 'A');
      expect(invoice.id).toBe('inv-1');
      expect(created[0]).toMatchObject({ clientName: 'Seriti Resources', companyId: 'A', subtotal: 898, tax: 134.7, total: 1032.7 }); // 898 + 15 %
      expect(created[0].items.create.map((i: any) => [i.quantity, i.unitPrice, i.total])).toEqual([[1, 810, 810], [1, 88, 88]]);
      expect(h.drafts.rows[0]).toMatchObject({ finalized: true, invoiceId: 'inv-1' });
    });
  });
});
