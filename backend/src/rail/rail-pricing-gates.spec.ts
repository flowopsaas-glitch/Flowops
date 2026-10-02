/**
 * Phase D — pricing release gates. Each test maps to a gate in the Phase D list and to the
 * controlled matrix (`docs/RAIL-PRICING-SOURCE-MATRIX-2026-10-02.md`).
 *
 * ALL RATES BELOW ARE SYNTHETIC FIXTURES, clearly labelled — no verified Transnet rate has been
 * supplied (matrix P-01…P-14 are UNKNOWN). Tests that need effective dates or a capacity model
 * assert the CURRENT honest behaviour and name the blocking gap; they do not invent the missing data.
 */
import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FakeTable } from '../../test/support/in-memory-db';
import { RailTariffService } from './rail-tariff.service';
import { RailActor } from './rail-audit';
import {
  ScheduleLike, TARIFF_FORMULA_VERSION, calculateTariff, TariffContext, TariffRequest,
} from './rail-tariff.rules';
import {
  PRICING_SOURCE_CATALOG, PRICING_VERIFICATION_STATUSES, validatePricingSourceEntry,
} from './catalog/pricing-sources.catalog';

const MANAGER: RailActor = { id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: UserRole.MANAGER };

// ── pure-calculator fixtures ─────────────────────────────────────────────────
const req = (over: Partial<TariffRequest> = {}): TariffRequest => ({ corridorCode: 'COR-ORE', financialYear: '2026/27', distanceKm: 100, ...over });
const sched = (over: Partial<ScheduleLike> = {}): ScheduleLike => ({
  id: 's1', corridorCode: 'COR-ORE', financialYear: '2026/27', loadedCentsPerGtk: 5, dataStatus: 'VERIFIED', sourceRef: 'SYNTHETIC test tariff', ...over,
});
const ctx = (over: Partial<TariffContext> = {}): TariffContext => ({
  wagons: [{ wagonNumber: 'W1', tareTonnes: 22, loadedTonnes: 60 }, { wagonNumber: 'W2', tareTonnes: 22, loadedTonnes: 58 }],
  latestReadings: [], schedules: [sched()], ancillaryCatalog: [], ...over,
});

// ── service fixtures ─────────────────────────────────────────────────────────
function make(opts: { schedules?: Record<string, any>[] } = {}) {
  const consignments = new FakeTable('con');
  const readings = new FakeTable('wr');
  const schedules = new FakeTable('tar');
  const calcs = new FakeTable('tc', {
    unique: [['companyId', 'calculationNumber']],
    defaults: () => ({ scheduleId: null, gtkLoaded: null, gtkEmpty: null, holdTriggered: false, invoiceDraftId: null, invoiceDraftedAt: null, currency: 'ZAR' }),
  });
  const ancillary = new FakeTable('anc');
  const corridors = new FakeTable('cor');
  const drafts = new FakeTable('draft', { unique: [['id']] });
  for (const s of opts.schedules ?? []) schedules.seed(s);
  const prisma = {
    railConsignment: consignments, railWeighbridgeReading: readings, railTariffSchedule: schedules, railTariffCalculation: calcs,
    railAncillaryServiceCatalog: ancillary, railCorridorNode: corridors, invoiceDraft: drafts,
  };
  const billing = { hasFeature: jest.fn().mockResolvedValue(true) };
  const audit = { record: jest.fn().mockResolvedValue('audit-1') };
  const svc = new RailTariffService(prisma as any, billing as any, audit as any);
  const seedConsignment = (over: Record<string, any> = {}) => consignments.seed({
    companyId: 'A', consignmentNumber: 'RAIL-2026-00007', status: 'LOADING', clientName: 'Seriti Resources', corridor: 'Ore',
    plannedDeparture: new Date('2026-10-05T04:00:00Z'),
    wagons: [
      { id: 'w1', wagonNumber: 'W1', tareTonnes: 22, loadedTonnes: 60, axles: 4 },
      { id: 'w2', wagonNumber: 'W2', tareTonnes: 22, loadedTonnes: 58, axles: 4 },
    ],
    ...over,
  });
  return { svc, audit, consignments, calcs, drafts, seedConsignment };
}
const body = (consignmentId: string, over: Record<string, any> = {}) => ({ consignmentId, distanceKm: 100, ...over });

afterEach(() => jest.restoreAllMocks());

describe('Phase D pricing gates', () => {
  it('D-01 missing rate: no VERIFIED loaded rate ⇒ BLOCKED, nothing priced, never R0.00', () => {
    const r = calculateTariff(req(), ctx({ schedules: [] }));
    expect(r.status).toBe('BLOCKED');
    expect(r.lines).toEqual([]);
    expect(r.subtotalZar).toBe(0);
    expect(r.blockers.join(' ')).toMatch(/never defaulted|cannot be priced/);
    expect(r.formulaVersion).toBe(TARIFF_FORMULA_VERSION);
  });

  it('D-02 missing corridor length: no distanceKm ⇒ BLOCKED naming the missing distance', () => {
    const r = calculateTariff(req({ distanceKm: 0 }), ctx());
    expect(r.status).toBe('BLOCKED');
    expect(r.blockers.join(' ')).toMatch(/distance in km is required/);
  });

  it('D-03 missing consumption factor: diesel with no litres and no factor ⇒ quantity null, INCOMPLETE, not zero', () => {
    const r = calculateTariff(req({ traction: { type: 'DIESEL', litres: null, pricePerUnitZar: 30 } }), ctx());
    expect(r.status).toBe('INCOMPLETE');
    const line = r.lines.find((l) => l.kind === 'TRACTION_ENERGY')!;
    expect(line).toMatchObject({ quantity: null, amountZar: null });
    expect(r.subtotalZar).toBeGreaterThan(0); // priced GTK line only
  });

  it('D-04 route with no price: a rate for another corridor is never borrowed', () => {
    const r = calculateTariff(req({ corridorCode: 'COR-CAPE' }), ctx({ schedules: [sched({ corridorCode: 'COR-ORE' })] }));
    expect(r.status).toBe('BLOCKED');
    expect(r.blockers.join(' ')).toMatch(/COR-CAPE/);
  });

  it('D-05 approved rate (SYNTHETIC pilot fixture): a VERIFIED schedule prices exactly', () => {
    const r = calculateTariff(req(), ctx());
    expect(r.status).toBe('PRICED');
    // 162 t × 100 km = 16200 GTK × 5 c/GTK = R810.00
    expect(r.lines[0]).toMatchObject({ kind: 'GTK_LOADED', quantity: 16200, rate: 5, amountZar: 810 });
    expect(r.subtotalZar).toBe(810);
  });

  it('D-06 expired rate: an earlier-year schedule without escalation opt-in is refused with an instruction (effective-date enforcement pending C-03)', () => {
    const r = calculateTariff(req({ financialYear: '2027/28' }), ctx({ schedules: [sched({ financialYear: '2026/27' })] }));
    expect(r.status).toBe('BLOCKED');
    expect(r.blockers.join(' ')).toMatch(/tick "apply escalation"/);
    // NOTE (GAP-SCHEMA C-03): explicit effectiveFrom/To refusal needs the proposed migration.
    // Until then, FY labels are the only period enforcement — never silent substitution (EXC-040).
  });

  it('D-07 future rate: a later-year schedule is never used for an earlier year (and never de-escalated)', () => {
    const r = calculateTariff(req({ financialYear: '2026/27' }), ctx({ schedules: [sched({ financialYear: '2027/28' })] }));
    expect(r.status).toBe('BLOCKED');
  });

  it('D-08 multiple financial years: escalation compounds per whole FY and is recorded (8.50% UNVERIFIED)', () => {
    const r = calculateTariff(req({ financialYear: '2028/29', allowEscalation: true }), ctx({ schedules: [sched({ financialYear: '2026/27', loadedCentsPerGtk: 5 })] }));
    expect(r.status).toBe('PRICED');
    expect(r.escalationYears).toBe(2);
    // 5 × 1.085² = 5.886125 c/GTK × 16200 GTK = R953.55
    expect(r.lines[0].amountZar).toBe(953.55);
    expect(r.warnings.join(' ')).toMatch(/escalated 2 year\(s\)/);
  });

  it('D-09 Line Closed capacity: pricing never consumes capacity-workbook values (period separation §11.0; EXC-048 open)', () => {
    // The capacity model is not implemented and Line Closed is not an attribute the calculator reads.
    // This test pins the separation: a calculation result carries no capacity fields, and no capacity
    // input can unblock a corridor with no VERIFIED rate.
    const r = calculateTariff(req(), ctx({ schedules: [] }));
    expect(r.status).toBe('BLOCKED');
    expect(r).not.toHaveProperty('spareCapacity');
    expect(r).not.toHaveProperty('bottleneck');
    expect(JSON.stringify(r)).not.toMatch(/Line Closed/i);
  });

  it('D-10 unverified overload penalty: overload with no penalty rate ⇒ penalty line NOT_PRICED, INCOMPLETE', () => {
    const r = calculateTariff(req(), ctx({
      latestReadings: [{ wagonNumber: 'W1', status: 'OVERLOADED', excessTonnes: 3.2, actualTonnes: 85.2, createdAt: '2026-10-02T08:00:00Z' } as any],
    }));
    expect(r.hold.held).toBe(true);
    expect(r.status).toBe('INCOMPLETE');
    const penalty = r.lines.find((l) => l.kind === 'OVERLOAD_PENALTY')!;
    expect(penalty).toMatchObject({ quantity: 3.2, rate: null, amountZar: null });
  });

  it('D-11 VAT not yet decided: the rail draft sets no tax rate (D25 — platform default applies on finalisation)', async () => {
    const h = make({ schedules: [{ corridorCode: 'COR-ORE', financialYear: '2026/27', loadedCentsPerGtk: 5, dataStatus: 'VERIFIED', sourceRef: 'SYNTHETIC test tariff', isActive: true }] });
    const con = h.seedConsignment();
    const saved = await h.svc.calculate('A', body(con.id) as any, MANAGER);
    const out = await h.svc.generateInvoiceDraft('A', (saved.calculation as any).id, {}, MANAGER, new Date('2026-10-02T10:00:00Z'));
    expect((out.draft as any).draftData).not.toHaveProperty('taxRate');
  });

  it('D-12 duplicate source records: pricing-source ids are unique and validated', () => {
    const ids = PRICING_SOURCE_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('P-01');
    for (const e of PRICING_SOURCE_CATALOG) expect(validatePricingSourceEntry(e)).toEqual([]);
    expect(validatePricingSourceEntry({ ...PRICING_SOURCE_CATALOG[0], id: 'X-99' })).not.toEqual([]);
  });

  it('D-13 changed source version: every result carries the formula version (BLOCKED and PRICED)', () => {
    const blocked = calculateTariff(req(), ctx({ schedules: [] }));
    const priced = calculateTariff(req(), ctx());
    expect(blocked.formulaVersion).toBe('rail-tariff/1.1.0');
    expect(priced.formulaVersion).toBe('rail-tariff/1.1.0');
    expect(TARIFF_FORMULA_VERSION).toBe('rail-tariff/1.1.0');
  });

  it('D-14 draft invoice refusal: an INCOMPLETE calculation can never become a draft', async () => {
    const h = make({ schedules: [{ corridorCode: 'COR-ORE', financialYear: '2026/27', loadedCentsPerGtk: 5, dataStatus: 'VERIFIED', sourceRef: 'SYNTHETIC test tariff', isActive: true }] });
    const con = h.seedConsignment();
    // Electric traction with no price ⇒ unpriced line ⇒ INCOMPLETE.
    const saved = await h.svc.calculate('A', body(con.id, { traction: { type: 'ELECTRIC', kWh: 1000 } }) as any, MANAGER);
    expect((saved as any).result.status).toBe('INCOMPLETE');
    await expect(h.svc.generateInvoiceDraft('A', (saved.calculation as any).id, {}, MANAGER, new Date())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('D-15 tenant isolation: another tenant cannot price against (or learn about) this consignment', async () => {
    const h = make({ schedules: [{ corridorCode: 'COR-ORE', financialYear: '2026/27', loadedCentsPerGtk: 5, dataStatus: 'VERIFIED', sourceRef: 'SYNTHETIC test tariff', isActive: true }] });
    const con = h.seedConsignment();
    await expect(h.svc.preview('B', body(con.id) as any)).rejects.toThrow('Rail consignment not found');
  });

  it('D-16 audit trail: saving a calculation records formula version, schedule and counts', async () => {
    const h = make({ schedules: [{ corridorCode: 'COR-ORE', financialYear: '2026/27', loadedCentsPerGtk: 5, dataStatus: 'VERIFIED', sourceRef: 'SYNTHETIC test tariff', isActive: true }] });
    const con = h.seedConsignment();
    const saved = await h.svc.calculate('A', body(con.id) as any, MANAGER);
    expect((saved.calculation as any).inputs).toMatchObject({ formulaVersion: TARIFF_FORMULA_VERSION });
    const entry = h.audit.record.mock.calls.map(([e]) => e).at(-1);
    expect(entry).toMatchObject({ action: 'tariff_calculation.created', metadata: expect.objectContaining({ formulaVersion: TARIFF_FORMULA_VERSION }) });
  });
});

describe('pricing-source catalogue (Phase A)', () => {
  it('holds P-01…P-20 with the only allowed statuses, and nothing approved', () => {
    expect(PRICING_SOURCE_CATALOG.map((e) => e.id)).toEqual([
      'P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06', 'P-07', 'P-08', 'P-09', 'P-10',
      'P-11', 'P-12', 'P-13', 'P-14', 'P-15', 'P-16', 'P-17', 'P-18', 'P-19', 'P-20',
    ]);
    for (const e of PRICING_SOURCE_CATALOG) {
      expect(PRICING_VERIFICATION_STATUSES).toContain(e.verificationStatus);
      expect(e.verificationStatus).toBe('UNVERIFIED');
      expect(e.owner).toBeNull();
      expect(e.independentReviewer).toBeNull();
    }
  });

  it('carries no invented values: only the three brief constants have numbers, all UNVERIFIED', () => {
    const withValues = PRICING_SOURCE_CATALOG.filter((e) => e.value !== null);
    expect(withValues.map((e) => e.id)).toEqual(['P-15', 'P-16', 'P-17']);
    expect(withValues).toMatchObject([{ value: 8.5 }, { value: 4.42 }, { value: 24.64 }]);
    expect(PRICING_SOURCE_CATALOG.filter((e) => e.value === 0)).toEqual([]);
  });

  it('refuses promotion without both sign-offs, and production without an effective period', () => {
    const base = PRICING_SOURCE_CATALOG[0];
    expect(validatePricingSourceEntry({ ...base, verificationStatus: 'APPROVED_FOR_PILOT' }).join(' ')).toMatch(/owner and independent reviewer/);
    expect(validatePricingSourceEntry({ ...base, verificationStatus: 'APPROVED_FOR_PRODUCTION', owner: 'O', independentReviewer: 'R' }).join(' ')).toMatch(/effectiveFrom/);
  });

  it('electric traction lines are flagged as pass-through costs', () => {
    const r = calculateTariff(req({ traction: { type: 'ELECTRIC', kWh: 1000, pricePerUnitZar: 1.5 } }), ctx());
    const line = r.lines.find((l) => l.kind === 'TRACTION_ENERGY')!;
    expect(line.passThrough).toBe(true);
    expect(line.methodology).toMatch(/pass-through/);
  });
});
