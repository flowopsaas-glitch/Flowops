/**
 * Cancel / reschedule requests (Annexure 20a) with Annexure 20b reasons — Wave 3 service behaviour.
 * Prisma is an in-memory fake (backend/test/support), so isolation and the state machine are tested by what
 * actually ends up in the tables, not by which arguments were passed.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FakeTable, snapshot } from '../../test/support/in-memory-db';
import { RailChangeService } from './rail-change.service';
import { RailNetworkService } from './rail-network.service';
import { RailActor, RAIL_AUDIT_ACTION } from './rail-audit';
import { CANCELLATION_CODE_CATALOG } from './catalog/cancellation-codes.catalog';

const HOUR = 3_600_000;
const NOW = new Date('2026-10-02T10:00:00.000Z');
const inHours = (h: number) => new Date(NOW.getTime() + h * HOUR);
const year = new Date().getFullYear();

const MANAGER: RailActor = { id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: UserRole.MANAGER };
const DISPATCHER: RailActor = { id: 'u-dsp', email: 'dan@toc.co.za', name: 'Dan Dispatch', role: UserRole.DISPATCH };

// Catalog rows used as fixtures (verified against the catalog in the first test)
const TOC_CODE = 'CNX-001'; // Abnormal working / yard — Rail Operations
const FM_CODE = 'CNX-002'; // Animal hit by train — Force Majeure
const TRIM_CODE = 'CNX-006'; // Bridge collapsed — Infrastructure Manager
const COULD_BE_3 = 'CNX-003'; // Assets Fire Damage — FM / IM / Rail Ops
const COULD_BE_2 = 'CNX-025'; // Hook-up — IM / Rail Ops (Force Majeure NOT possible)

function make(opts: { entitled?: boolean } = {}) {
  // `defaults` mimic the database: a nullable column that was never written reads back as NULL, not undefined.
  const requests = new FakeTable('cr', {
    unique: [['companyId', 'requestNumber']],
    defaults: () => ({
      status: 'SUBMITTED', slotApplicationId: null, consignmentId: null, handshakeReportId: null, handshakeDeviationId: null, originalDeparture: null,
      proposedDeparture: null, eventOccurredAt: null, acknowledgedAt: null, replacementAccepted: null, closedAt: null, note: null,
    }),
  });
  const codes = new FakeTable('cnx');
  const consignments = new FakeTable('con');
  const slotApps = new FakeTable('sa');
  const reports = new FakeTable('hr');
  const prisma = {
    railSlotChangeRequest: requests, railCancellationCode: codes, railConsignment: consignments,
    railSlotApplication: slotApps, railHandshakeReport: reports,
  };
  const billing = { hasFeature: jest.fn().mockResolvedValue(opts.entitled ?? true) };
  const audit = { record: jest.fn().mockResolvedValue('audit-1') };
  const handshake = { logDeviation: jest.fn(async () => ({ id: 'dev-1' })) };
  // Backed by the real resolver over an empty catalogue, so every existing
  // expectation below exercises the Transnet fallback: the wording a tenant
  // sees today is unchanged unless a network says otherwise.
  const networksDb: Array<Record<string, unknown>> = [];
  const networks = new RailNetworkService({
    railNetwork: {
      findFirst: jest.fn(async ({ where }: any) => {
        const hit = networksDb.find((n) => {
          if (where?.id && n.id !== where.id) return false;
          if (where?.isDefault !== undefined && !!n.isDefault !== !!where.isDefault) return false;
          if (where && 'companyId' in where && n.companyId !== where.companyId) return false;
          return true;
        });
        return hit ?? null;
      }),
    },
    railEscalationRung: { findMany: jest.fn(async () => []) },
  } as any);
  const seedNetwork = (n: Record<string, unknown>) => { networksDb.push(n); return n; };
  const svc = new RailChangeService(prisma as any, billing as any, audit as any, handshake as any, networks);

  const seedRequest = (over: Record<string, any> = {}) =>
    requests.seed({
      companyId: 'A', requestNumber: `CR-T-${requests.rows.length + 1}`, kind: 'CANCEL', status: 'SUBMITTED', initiatedBy: 'TOC',
      cancellationCode: TOC_CODE, cancellationReason: 'Abnormal working / yard', codeResponsibleParty: 'RAIL_OPERATIONS',
      attribution: 'TOC', isForceMajeure: false, isPlannedOccupation: false, trainSlotRef: 'T-100', originalDeparture: inHours(24),
      proposedDeparture: null, requestedAt: NOW, acknowledgedAt: null, replacementAccepted: null, hoursBeforeDeparture: 24,
      noticeBand: 'SHORT_NOTICE', commercialWindow: 'INSIDE_72H', consequence: 'FORFEIT_FEES_PAID_IN_ADVANCE', penaltyApplicable: true,
      penaltyAgainst: 'TOC', penaltyBasis: 'seed', note: null, closedAt: null, handshakeReportId: null, handshakeDeviationId: null, ...over,
    });
  const seedTrim = (over: Record<string, any> = {}) =>
    seedRequest({
      initiatedBy: 'TRIM', cancellationCode: TRIM_CODE, cancellationReason: 'Bridge collapsed', codeResponsibleParty: 'INFRASTRUCTURE_MANAGER',
      attribution: 'TRIM', consequence: 'PENDING_REPLACEMENT_OUTCOME', penaltyApplicable: false, penaltyAgainst: null, ...over,
    });
  const seedUndetermined = (over: Record<string, any> = {}) =>
    seedRequest({
      cancellationCode: COULD_BE_3, cancellationReason: 'Assets Fire Damage', codeResponsibleParty: 'ALLOCATION_REQUIRED', attribution: 'UNDETERMINED',
      consequence: 'PENDING_ALLOCATION', penaltyApplicable: false, penaltyAgainst: null, ...over,
    });
  const actions = () => audit.record.mock.calls.map(([e]) => e.action);
  const entries = () => audit.record.mock.calls.map(([e]) => e);
  return { svc, prisma, billing, audit, handshake, networks, seedNetwork, requests, codes, consignments, slotApps, reports, seedRequest, seedTrim, seedUndetermined, actions, entries };
}
type H = ReturnType<typeof make>;

const dto = (over: Record<string, any> = {}) => ({
  kind: 'CANCEL', initiatedBy: 'TOC', cancellationCode: TOC_CODE, trainSlotRef: 'T-100', originalDeparture: inHours(24).toISOString(), ...over,
});

afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
describe('fixtures', () => {
  it('the chosen catalog rows really are what these tests assume (Annexure 20b)', () => {
    const row = (c: string) => CANCELLATION_CODE_CATALOG.find((x) => x.code === c)!;
    expect(row(TOC_CODE)).toMatchObject({ responsibleParty: 'RAIL_OPERATIONS' });
    expect(row(FM_CODE)).toMatchObject({ responsibleParty: 'FORCE_MAJEURE' });
    expect(row(TRIM_CODE)).toMatchObject({ responsibleParty: 'INFRASTRUCTURE_MANAGER' });
    expect(row(COULD_BE_3)).toMatchObject({ responsibleParty: 'ALLOCATION_REQUIRED', possibleParties: ['FORCE_MAJEURE', 'INFRASTRUCTURE_MANAGER', 'RAIL_OPERATIONS'] });
    expect(row(COULD_BE_2)).toMatchObject({ responsibleParty: 'ALLOCATION_REQUIRED', possibleParties: ['INFRASTRUCTURE_MANAGER', 'RAIL_OPERATIONS'] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('entitlement', () => {
  it('every public method is refused without the `rail` feature, before any data access', async () => {
    const h = make({ entitled: false });
    const s = h.svc;
    const calls: Array<() => Promise<unknown>> = [
      () => s.listCodes('A'), () => s.windows('A'), () => s.preview('A', dto() as any), () => s.list('A'), () => s.get('A', 'x'),
      () => s.create('A', dto() as any, MANAGER), () => s.acknowledge('A', 'x', MANAGER),
      () => s.proposeAlternative('A', 'x', { proposedDeparture: inHours(30).toISOString() }, MANAGER), () => s.accept('A', 'x', MANAGER),
      () => s.confirmCancellation('A', 'x', MANAGER), () => s.close('A', 'x', MANAGER),
      () => s.allocateParty('A', 'x', { attribution: 'TOC', note: 'clearinghouse' }, MANAGER),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.billing.hasFeature).toHaveBeenCalledTimes(calls.length);
    expect(h.billing.hasFeature).toHaveBeenCalledWith('A', 'rail');
    for (const t of [h.requests, h.codes, h.consignments, h.slotApps, h.reports]) for (const fn of t.fns) expect(fn).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
    expect(h.handshake.logDeviation).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('reference data', () => {
  it('serves the 82 Annexure 20b codes from the catalog until the seeder has run', async () => {
    const h = make();
    const codes = await h.svc.listCodes('A');
    expect(codes).toHaveLength(82);
    expect(codes.every((c) => c.fromCatalog)).toBe(true);
    expect(codes[0]).toMatchObject({ code: 'CNX-001', reason: 'Abnormal working / yard', responsibleParty: 'RAIL_OPERATIONS' });
  });

  it('serves the seeded rows once present — and hides deactivated ones', async () => {
    const h = make();
    h.codes.seed({ code: 'CNX-001', sourceRow: 1, reason: 'Abnormal working / yard', responsibleParty: 'RAIL_OPERATIONS', possibleParties: [], sourceText: 'Rail Operations', isActive: true });
    h.codes.seed({ code: 'CNX-002', sourceRow: 2, reason: 'Animal hit by train', responsibleParty: 'FORCE_MAJEURE', possibleParties: [], sourceText: 'Force Majeure', isActive: false });
    const codes = await h.svc.listCodes('A');
    expect(codes.map((c) => c.code)).toEqual(['CNX-001']);
    expect(codes[0].fromCatalog).toBe(false);
  });

  it('a seeded row — not the catalog — decides the allocation once the table is populated', async () => {
    const h = make();
    // The database says CNX-001 is the IM\'s (e.g. a later annexure version): the service must follow the database.
    h.codes.seed({ code: 'CNX-001', sourceRow: 1, reason: 'Abnormal working / yard', responsibleParty: 'INFRASTRUCTURE_MANAGER', possibleParties: [], sourceText: 'Infrastructure Manager', isActive: true });
    const p = await h.svc.preview('A', dto({ initiatedBy: 'TRIM' }) as any, NOW);
    expect(p.attribution).toBe('TRIM');
  });

  it('exposes the Annexure 20a / 21 windows and the 24-step process', async () => {
    const h = make();
    const w = await h.svc.windows('A');
    expect(w.windows).toMatchObject({ noticeWithinMinutes: 15, acknowledgeWithinHours: 1, shortNoticeThresholdHours: 48, commercialWindowHours: 72 });
    expect(w.processSteps).toHaveLength(24);
    expect(w.initiators.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('preview — the server derives the consequence, nothing is saved', () => {
  const p = (h: H, over: Record<string, any> = {}) => h.svc.preview('A', dto(over) as any, NOW);

  it('TOC-caused, 24 h before departure → short notice, inside 72 h, access fees forfeited by the TOC', async () => {
    const h = make();
    const r = await p(h);
    expect(r.attribution).toBe('TOC');
    expect(r.isForceMajeure).toBe(false);
    expect(r.notice).toMatchObject({ noticeBand: 'SHORT_NOTICE', commercialWindow: 'INSIDE_72H', hoursBeforeDeparture: 24, itpRoute: 'EMERGENCY_DYNAMIC_ITP' });
    expect(r.consequence).toMatchObject({ consequence: 'FORFEIT_FEES_PAID_IN_ADVANCE', penaltyApplicable: true, penaltyAgainst: 'TOC' });
    expect(r.needsClearinghouseAllocation).toBe(false);
  });

  it('TOC-caused, 5 days out → planning version, outside 72 h, a credit if the path is reallocated (no penalty)', async () => {
    const h = make();
    const r = await p(h, { originalDeparture: inHours(120).toISOString() });
    expect(r.notice).toMatchObject({ noticeBand: 'PLANNING_VERSION', commercialWindow: 'OUTSIDE_72H', itpRoute: 'PLANNING_VERSION_ITP' });
    expect(r.consequence).toMatchObject({ consequence: 'CREDIT_IF_REALLOCATED', penaltyApplicable: false, penaltyAgainst: null });
  });

  it('the 48 h / 72 h boundaries follow the annexure wording: exactly 48 h is short notice, exactly 72 h is inside the window', async () => {
    const h = make();
    expect((await p(h, { originalDeparture: inHours(48).toISOString() })).notice.noticeBand).toBe('SHORT_NOTICE');
    expect((await p(h, { originalDeparture: inHours(48.01).toISOString() })).notice.noticeBand).toBe('PLANNING_VERSION');
    expect((await p(h, { originalDeparture: inHours(72).toISOString() })).notice.commercialWindow).toBe('INSIDE_72H');
    expect((await p(h, { originalDeparture: inHours(72.01).toISOString() })).notice.commercialWindow).toBe('OUTSIDE_72H');
  });

  it('TRIM-caused → attribution TRIM, the refund waits on the replacement outcome', async () => {
    const h = make();
    const r = await p(h, { initiatedBy: 'TRIM', cancellationCode: TRIM_CODE });
    expect(r.attribution).toBe('TRIM');
    expect(r.consequence).toMatchObject({ consequence: 'PENDING_REPLACEMENT_OUTCOME', penaltyApplicable: false });
  });

  it('a planned occupation removes the TRIM-failure remedy', async () => {
    const h = make();
    const r = await p(h, { initiatedBy: 'TRIM', cancellationCode: TRIM_CODE, isPlannedOccupation: true });
    expect(r.consequence.consequence).toBe('NONE_PLANNED_OCCUPATION');
  });

  it('Force Majeure is recorded distinctly and carries no consequence', async () => {
    const h = make();
    const r = await p(h, { cancellationCode: FM_CODE });
    expect(r).toMatchObject({ attribution: 'FORCE_MAJEURE', isForceMajeure: true });
    expect(r.consequence).toMatchObject({ consequence: 'NONE_FORCE_MAJEURE', penaltyApplicable: false });
  });

  it('a "could be …" reason is NOT assumed to be either party\'s — it waits for the Clearinghouse', async () => {
    const h = make();
    const r = await p(h, { cancellationCode: COULD_BE_3 });
    expect(r.attribution).toBe('UNDETERMINED');
    expect(r.needsClearinghouseAllocation).toBe(true);
    expect(r.consequence).toMatchObject({ consequence: 'PENDING_ALLOCATION', penaltyApplicable: false, penaltyAgainst: null });
    expect(r.code.possibleParties).toEqual(['FORCE_MAJEURE', 'INFRASTRUCTURE_MANAGER', 'RAIL_OPERATIONS']);
  });

  it('refuses to guess the 72-hour test when no departure time is given', async () => {
    const h = make();
    const r = await p(h, { originalDeparture: undefined });
    expect(r.notice).toMatchObject({ noticeBand: 'UNKNOWN', commercialWindow: 'UNKNOWN', hoursBeforeDeparture: null });
    expect(r.consequence.consequence).toBe('PENDING_DEPARTURE_TIME');
    expect(r.warnings.join(' ')).toMatch(/No departure time was given/);
  });

  it('is deliberately immune to a client-supplied attribution / consequence (it only trusts the reason code)', async () => {
    const h = make();
    const r = await p(h, { attribution: 'FORCE_MAJEURE', isForceMajeure: true, consequence: 'NONE_FORCE_MAJEURE', penaltyApplicable: false, commercialWindow: 'OUTSIDE_72H' });
    expect(r.attribution).toBe('TOC');
    expect(r.isForceMajeure).toBe(false);
    expect(r.consequence).toMatchObject({ consequence: 'FORFEIT_FEES_PAID_IN_ADVANCE', penaltyApplicable: true });
    expect(r.notice.commercialWindow).toBe('INSIDE_72H');
  });

  it('warns — without blocking — about who raised it, late notice, planned occupation, and a missing new departure', async () => {
    const h = make();
    const mismatch = await p(h, { initiatedBy: 'TRIM', cancellationCode: TOC_CODE });
    expect(mismatch.warnings.join(' ')).toMatch(/TRIM raised this request, but the chosen reason is allocated to Rail Operations/);
    const toc = await p(h, { initiatedBy: 'TOC', cancellationCode: TRIM_CODE });
    expect(toc.warnings.join(' ')).toMatch(/The TOC raised this request, but the chosen reason is allocated to the Infrastructure Manager/);
    const late = await p(h, { eventOccurredAt: new Date(NOW.getTime() - 45 * 60_000).toISOString() });
    expect(late.noticeLateMinutes).toBe(30);
    expect(late.warnings.join(' ')).toMatch(/30 minute\(s\) later than the 15-minute window/);
    const onTime = await p(h, { eventOccurredAt: new Date(NOW.getTime() - 10 * 60_000).toISOString() });
    expect(onTime.noticeLateMinutes).toBe(0);
    expect(onTime.warnings).toEqual([]);
    expect((await p(h, { isPlannedOccupation: true })).warnings.join(' ')).toMatch(/only affects TRIM-caused cancellations/);
    expect((await p(h, { kind: 'RESCHEDULE' })).warnings.join(' ')).toMatch(/names the proposed new departure/);
    expect((await p(h, { kind: 'RESCHEDULE', proposedDeparture: inHours(40).toISOString() })).warnings).toEqual([]);
  });

  it('rejects an unknown code, bad dates and an event that has not happened yet', async () => {
    const h = make();
    await expect(p(h, { cancellationCode: 'CNX-999' })).rejects.toThrow(/Unknown cancellation code "CNX-999" \(Annexure 20b\)/);
    await expect(p(h, { originalDeparture: 'not-a-date' })).rejects.toThrow(/originalDeparture is not a valid date/);
    await expect(p(h, { proposedDeparture: 'nope' })).rejects.toThrow(/proposedDeparture is not a valid date/);
    await expect(p(h, { eventOccurredAt: inHours(2).toISOString() })).rejects.toThrow(/eventOccurredAt cannot be in the future/);
  });

  it('writes nothing: no row, no audit entry, no deviation', async () => {
    const h = make();
    await p(h);
    await p(h, { cancellationCode: COULD_BE_3 });
    expect(h.requests.rows).toHaveLength(0);
    expect(h.requests.create).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
    expect(h.handshake.logDeviation).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('create', () => {
  it('stores the derived attribution, a snapshot of the 20b reason, and writes an audit entry carrying the actor', async () => {
    const h = make();
    const out = await h.svc.create('A', dto({ attribution: 'FORCE_MAJEURE', penaltyApplicable: false }) as any, MANAGER, NOW);
    expect(out.request).toMatchObject({
      companyId: 'A', requestNumber: `CR-${year}-00001`, kind: 'CANCEL', status: 'SUBMITTED', initiatedBy: 'TOC',
      cancellationCode: TOC_CODE, cancellationReason: 'Abnormal working / yard', codeResponsibleParty: 'RAIL_OPERATIONS',
      attribution: 'TOC', isForceMajeure: false, noticeBand: 'SHORT_NOTICE', commercialWindow: 'INSIDE_72H', hoursBeforeDeparture: 24,
      consequence: 'FORFEIT_FEES_PAID_IN_ADVANCE', penaltyApplicable: true, penaltyAgainst: 'TOC', createdById: 'u-mgr', createdByEmail: 'mia@toc.co.za',
    });
    expect(out.request.acknowledgement).toBe('WAITING');
    expect(out.consequence.consequence).toBe('FORFEIT_FEES_PAID_IN_ADVANCE');
    const [e] = h.entries();
    expect(e).toMatchObject({
      action: RAIL_AUDIT_ACTION.CHANGE_CREATED, actorType: 'tenant', actorId: 'u-mgr', actorEmail: 'mia@toc.co.za', targetType: 'rail_change_request', targetName: `CR-${year}-00001`,
    });
    expect(e.metadata).toMatchObject({ module: 'rail', companyId: 'A', actorRole: 'MANAGER', cancellationCode: TOC_CODE, attribution: 'TOC', penaltyApplicable: true });
  });

  it('numbers requests per tenant, in sequence', async () => {
    const h = make();
    expect((await h.svc.create('B', dto() as any, MANAGER, NOW)).request.requestNumber).toBe(`CR-${year}-00001`);
    expect((await h.svc.create('A', dto() as any, MANAGER, NOW)).request.requestNumber).toBe(`CR-${year}-00001`);
    expect((await h.svc.create('A', dto() as any, MANAGER, NOW)).request.requestNumber).toBe(`CR-${year}-00002`);
  });

  it('survives a number collision between two simultaneous requests by retrying with the next number', async () => {
    const h = make();
    await h.svc.create('A', dto() as any, MANAGER, NOW); // takes 00001
    h.requests.count.mockResolvedValueOnce(0); // the racing request counted before the first committed
    const second = await h.svc.create('A', dto() as any, MANAGER, NOW);
    expect(second.request.requestNumber).toBe(`CR-${year}-00002`);
    expect(h.requests.rows).toHaveLength(2);
  });

  it('gives up (and does not swallow the error) if the collision persists', async () => {
    const h = make();
    await h.svc.create('A', dto() as any, MANAGER, NOW);
    h.requests.count.mockResolvedValue(0);
    await expect(h.svc.create('A', dto() as any, MANAGER, NOW)).rejects.toMatchObject({ code: 'P2002' });
    expect(h.requests.rows).toHaveLength(1);
  });

  it('a "could be …" reason is stored UNDETERMINED with no penalty', async () => {
    const h = make();
    const out = await h.svc.create('A', dto({ cancellationCode: COULD_BE_3 }) as any, MANAGER, NOW);
    expect(out.request).toMatchObject({ attribution: 'UNDETERMINED', codeResponsibleParty: 'ALLOCATION_REQUIRED', consequence: 'PENDING_ALLOCATION', penaltyApplicable: false, penaltyAgainst: null });
  });

  it('keeps the request\'s flags: planned occupation, staging, note, proposed departure', async () => {
    const h = make();
    const out = await h.svc.create('A', dto({
      kind: 'RESCHEDULE', initiatedBy: 'TRIM', cancellationCode: TRIM_CODE, isPlannedOccupation: true, requiresStaging: true, note: 'Bridge works',
      proposedDeparture: inHours(40).toISOString(),
    }) as any, MANAGER, NOW);
    expect(out.request).toMatchObject({
      kind: 'RESCHEDULE', isPlannedOccupation: true, requiresStaging: true, note: 'Bridge works', consequence: 'NONE_PLANNED_OCCUPATION',
    });
    expect(out.request.proposedDeparture).toEqual(inHours(40));
  });

  it('refuses a consignment / slot application / handshake report that belongs to another tenant — and writes nothing', async () => {
    const h = make();
    const foreignCon = h.consignments.seed({ companyId: 'B' });
    const foreignApp = h.slotApps.seed({ companyId: 'B' });
    const foreignReport = h.reports.seed({ companyId: 'B', status: 'DRAFT' });
    const before = snapshot(h.requests);
    await expect(h.svc.create('A', dto({ consignmentId: foreignCon.id }) as any, MANAGER, NOW)).rejects.toThrow(/consignmentId does not belong to this tenant/);
    await expect(h.svc.create('A', dto({ slotApplicationId: foreignApp.id }) as any, MANAGER, NOW)).rejects.toThrow(/slotApplicationId does not belong to this tenant/);
    await expect(h.svc.create('A', dto({ handshakeReportId: foreignReport.id }) as any, MANAGER, NOW)).rejects.toThrow(/handshakeReportId does not belong to this tenant/);
    expect(snapshot(h.requests)).toBe(before);
    expect(h.handshake.logDeviation).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('accepts the tenant\'s own consignment and slot application', async () => {
    const h = make();
    const con = h.consignments.seed({ companyId: 'A' });
    const app = h.slotApps.seed({ companyId: 'A' });
    const out = await h.svc.create('A', dto({ consignmentId: con.id, slotApplicationId: app.id }) as any, MANAGER, NOW);
    expect(out.request).toMatchObject({ consignmentId: con.id, slotApplicationId: app.id });
  });

  it('refuses to log into a handshake report that is already signed off, before saving anything', async () => {
    const h = make();
    const signed = h.reports.seed({ companyId: 'A', status: 'SIGNED_OFF' });
    await expect(h.svc.create('A', dto({ handshakeReportId: signed.id }) as any, MANAGER, NOW)).rejects.toThrow(/cannot be logged while the handshake report is SIGNED_OFF/);
    expect(h.requests.rows).toHaveLength(0);
  });

  describe('Daily Handshake link (Annexure 20a step 7)', () => {
    it.each([
      ['CANCEL', TOC_CODE, 'CANCELLATION', 'CANCELLED', 'THIS_TOC'],
      ['RESCHEDULE', TOC_CODE, 'RESCHEDULE', 'RESCHEDULED', 'THIS_TOC'],
      ['REPLAN', TRIM_CODE, 'RESCHEDULE', 'RESCHEDULED', 'IM'],
      ['CANCEL', FM_CODE, 'CANCELLATION', 'CANCELLED', 'FORCE_MAJEURE'],
      ['CANCEL', COULD_BE_3, 'CANCELLATION', 'CANCELLED', 'UNDETERMINED'],
    ])('%s with %s is logged as a %s deviation, slot impact %s, responsible party %s', async (kind, code, category, slotImpact, party) => {
      const h = make();
      const report = h.reports.seed({ companyId: 'A', status: 'DRAFT' });
      const out = await h.svc.create('A', dto({ kind, cancellationCode: code, handshakeReportId: report.id }) as any, MANAGER, NOW);
      expect(h.handshake.logDeviation).toHaveBeenCalledTimes(1);
      const [companyId, reportId, deviationDto, actor] = h.handshake.logDeviation.mock.calls[0] as unknown as [string, string, any, RailActor];
      expect(companyId).toBe('A');
      expect(reportId).toBe(report.id);
      expect(actor).toBe(MANAGER);
      expect(deviationDto).toMatchObject({
        trainSlotRef: 'T-100', orderNumber: out.request.requestNumber, category, slotImpact, responsibleParty: party,
        rootCause: expect.stringContaining(`Annexure 20b ${code}`), occurredAt: NOW.toISOString(),
      });
      expect(deviationDto.reason).toContain(`[${code}]`);
      expect(out.request).toMatchObject({ handshakeReportId: report.id, handshakeDeviationId: 'dev-1' });
      expect(h.entries()[0].metadata).toMatchObject({ handshakeDeviationId: 'dev-1' });
    });

    it('uses the event time (not "now") as when the deviation occurred', async () => {
      const h = make();
      const report = h.reports.seed({ companyId: 'A', status: 'PENDING_TOC' });
      const event = new Date(NOW.getTime() - 5 * 60_000);
      await h.svc.create('A', dto({ handshakeReportId: report.id, eventOccurredAt: event.toISOString() }) as any, MANAGER, NOW);
      expect((h.handshake.logDeviation.mock.calls[0] as any)[2].occurredAt).toBe(event.toISOString());
    });

    it('does not touch the handshake when no report was named', async () => {
      const h = make();
      const out = await h.svc.create('A', dto() as any, MANAGER, NOW);
      expect(h.handshake.logDeviation).not.toHaveBeenCalled();
      expect(out.request.handshakeDeviationId).toBeNull();
      expect(out.request.handshakeReportId).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('list / get', () => {
  it('only returns the caller\'s requests, newest first, filterable by status and consignment', async () => {
    const h = make();
    const a1 = h.seedRequest({ companyId: 'A', status: 'SUBMITTED', consignmentId: 'c1', createdAt: new Date('2026-09-01') });
    const a2 = h.seedRequest({ companyId: 'A', status: 'CLOSED', consignmentId: 'c2', createdAt: new Date('2026-09-02') });
    h.seedRequest({ companyId: 'B', status: 'SUBMITTED' });
    expect((await h.svc.list('A', {}, NOW)).map((r: any) => r.id)).toEqual([a2.id, a1.id]);
    expect((await h.svc.list('A', { status: 'SUBMITTED' }, NOW)).map((r: any) => r.id)).toEqual([a1.id]);
    expect((await h.svc.list('A', { consignmentId: 'c2' }, NOW)).map((r: any) => r.id)).toEqual([a2.id]);
    expect(await h.svc.list('C', {}, NOW)).toEqual([]);
  });

  it('computes the 1-hour acknowledgement state from the clock — never from a stored flag', async () => {
    const h = make();
    h.seedRequest({ requestedAt: new Date(NOW.getTime() - 30 * 60_000) });
    h.seedRequest({ requestedAt: new Date(NOW.getTime() - 90 * 60_000) });
    h.seedRequest({ requestedAt: new Date(NOW.getTime() - 90 * 60_000), acknowledgedAt: new Date(NOW.getTime() - 60 * 60_000) });
    h.seedRequest({ requestedAt: new Date(NOW.getTime() - 180 * 60_000), acknowledgedAt: new Date(NOW.getTime() - 60 * 60_000) });
    const states = (await h.svc.list('A', {}, NOW)).map((r: any) => r.acknowledgement).sort();
    expect(states).toEqual(['ACKNOWLEDGED_IN_TIME', 'ACKNOWLEDGED_LATE', 'OVERDUE', 'WAITING']);
  });

  it('get is tenant-scoped', async () => {
    const h = make();
    const r = h.seedRequest({ companyId: 'A' });
    expect((await h.svc.get('A', r.id)).id).toBe(r.id);
    await expect(h.svc.get('B', r.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.svc.get('A', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('tenant isolation of the lifecycle', () => {
  it('a request of tenant A cannot be moved, accepted, closed or allocated by tenant B — and nothing changes', async () => {
    const h = make();
    const r = h.seedUndetermined({ status: 'ACKNOWLEDGED' });
    const before = snapshot(h.requests);
    const s = h.svc;
    const attempts = [
      s.acknowledge('B', r.id, MANAGER), s.proposeAlternative('B', r.id, { proposedDeparture: inHours(30).toISOString() }, MANAGER),
      s.accept('B', r.id, MANAGER), s.confirmCancellation('B', r.id, MANAGER), s.close('B', r.id, MANAGER),
      s.allocateParty('B', r.id, { attribution: 'TOC', note: 'clearinghouse' }, MANAGER),
    ];
    for (const a of attempts) await expect(a).rejects.toBeInstanceOf(NotFoundException);
    expect(snapshot(h.requests)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('lifecycle (Annexure 20a): SUBMITTED → ACKNOWLEDGED → (ALTERNATIVE_PROPOSED →) ACCEPTED | CANCELLED_CONFIRMED → CLOSED', () => {
  it('the IM acknowledges within the hour: status, timestamp, "in time" and an audit entry with from/to', async () => {
    const h = make();
    const r = h.seedRequest({ requestedAt: new Date(NOW.getTime() - 20 * 60_000) });
    const out = await h.svc.acknowledge('A', r.id, MANAGER, NOW);
    expect(out).toMatchObject({ status: 'ACKNOWLEDGED', acknowledgedAt: NOW, acknowledgement: 'ACKNOWLEDGED_IN_TIME' });
    expect(h.entries()[0]).toMatchObject({ action: RAIL_AUDIT_ACTION.CHANGE_ACKNOWLEDGED, actorId: 'u-mgr', targetId: r.id });
    expect(h.entries()[0].metadata).toMatchObject({ from: 'SUBMITTED', to: 'ACKNOWLEDGED' });
  });

  it('a late acknowledgement is recorded as late — it is not hidden', async () => {
    const h = make();
    const r = h.seedRequest({ requestedAt: new Date(NOW.getTime() - 3 * HOUR) });
    expect((await h.svc.acknowledge('A', r.id, MANAGER, NOW)).acknowledgement).toBe('ACKNOWLEDGED_LATE');
  });

  it('dispatch-level users may drive the workflow (only formal commitments need a signatory)', async () => {
    const h = make();
    const r = h.seedRequest();
    expect((await h.svc.acknowledge('A', r.id, DISPATCHER, NOW)).status).toBe('ACKNOWLEDGED');
    expect(h.entries()[0]).toMatchObject({ actorId: 'u-dsp', metadata: expect.objectContaining({ actorRole: 'DISPATCH' }) });
  });

  it.each([
    ['SUBMITTED', 'accept'], ['SUBMITTED', 'confirmCancellation'], ['SUBMITTED', 'close'],
    ['ACKNOWLEDGED', 'accept'], ['ACKNOWLEDGED', 'close'], ['ACKNOWLEDGED', 'acknowledge'],
    ['ALTERNATIVE_PROPOSED', 'acknowledge'], ['ALTERNATIVE_PROPOSED', 'close'],
    ['ACCEPTED', 'confirmCancellation'], ['ACCEPTED', 'accept'], ['CANCELLED_CONFIRMED', 'accept'],
    ['CLOSED', 'acknowledge'], ['CLOSED', 'accept'], ['CLOSED', 'confirmCancellation'], ['CLOSED', 'close'],
  ])('%s cannot %s — the illegal move changes nothing and leaves no audit entry', async (status, method) => {
    const h = make();
    const r = h.seedRequest({ status });
    const before = snapshot(h.requests);
    await expect((h.svc as any)[method]('A', r.id, MANAGER, NOW)).rejects.toThrow(/A change request cannot move from/);
    expect(snapshot(h.requests)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('proposes an alternative only after acknowledgement, keeping the earlier note', async () => {
    const h = make();
    const fresh = h.seedRequest({ status: 'SUBMITTED' });
    await expect(h.svc.proposeAlternative('A', fresh.id, { proposedDeparture: inHours(40).toISOString() }, MANAGER, NOW)).rejects.toThrow(/cannot move from SUBMITTED to ALTERNATIVE_PROPOSED/);
    const r = h.seedRequest({ status: 'ACKNOWLEDGED', note: 'first note' });
    const out = await h.svc.proposeAlternative('A', r.id, { proposedDeparture: inHours(40).toISOString(), note: 'Path 22:00' }, MANAGER, NOW);
    expect(out).toMatchObject({ status: 'ALTERNATIVE_PROPOSED', proposedDeparture: inHours(40), note: 'first note\nPath 22:00' });
    expect(h.actions()).toEqual([RAIL_AUDIT_ACTION.CHANGE_ALTERNATIVE_PROPOSED]);
  });

  it('rejects an unparseable proposed departure', async () => {
    const h = make();
    const r = h.seedRequest({ status: 'ACKNOWLEDGED' });
    await expect(h.svc.proposeAlternative('A', r.id, { proposedDeparture: 'soon' }, MANAGER, NOW)).rejects.toThrow(/proposedDeparture is not a valid date/);
    await expect(h.svc.proposeAlternative('A', r.id, { proposedDeparture: '' }, MANAGER, NOW)).rejects.toThrow(/proposedDeparture is required/);
    expect(h.requests.rows[0].status).toBe('ACKNOWLEDGED');
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('checks entitlement before validating input (a tenant without the feature learns nothing)', async () => {
    const h = make({ entitled: false });
    await expect(h.svc.proposeAlternative('A', 'x', { proposedDeparture: 'soon' }, MANAGER, NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('TRIM-caused + replacement ACCEPTED → no refund', async () => {
    const h = make();
    const r = h.seedTrim({ status: 'ALTERNATIVE_PROPOSED' });
    const out = await h.svc.accept('A', r.id, MANAGER, NOW);
    expect(out).toMatchObject({ status: 'ACCEPTED', replacementAccepted: true, consequence: 'NONE_REPLACEMENT_ACCEPTED', penaltyApplicable: false, penaltyAgainst: null });
  });

  it('TRIM-caused + cancellation CONFIRMED (replacement not accepted) → the full Train Path fee is refunded, against TRIM', async () => {
    const h = make();
    const r = h.seedTrim({ status: 'ACKNOWLEDGED' });
    const out = await h.svc.confirmCancellation('A', r.id, MANAGER, NOW);
    expect(out).toMatchObject({ status: 'CANCELLED_CONFIRMED', replacementAccepted: false, consequence: 'FULL_TRAIN_PATH_FEE_REFUND', penaltyApplicable: true, penaltyAgainst: 'TRIM' });
    expect(h.entries()[0].metadata).toMatchObject({ from: 'ACKNOWLEDGED', to: 'CANCELLED_CONFIRMED', consequence: 'FULL_TRAIN_PATH_FEE_REFUND', penaltyApplicable: true });
  });

  it('a TRIM planned occupation is never refunded, even when the cancellation is confirmed', async () => {
    const h = make();
    const r = h.seedTrim({ status: 'ACKNOWLEDGED', isPlannedOccupation: true, consequence: 'NONE_PLANNED_OCCUPATION' });
    expect((await h.svc.confirmCancellation('A', r.id, MANAGER, NOW)).consequence).toBe('NONE_PLANNED_OCCUPATION');
  });

  it('TOC-caused: confirming does not erase the forfeiture; accepting a replacement does not either', async () => {
    const h = make();
    const a = h.seedRequest({ status: 'ACKNOWLEDGED' });
    expect((await h.svc.confirmCancellation('A', a.id, MANAGER, NOW)).consequence).toBe('FORFEIT_FEES_PAID_IN_ADVANCE');
    const b = h.seedRequest({ status: 'ALTERNATIVE_PROPOSED' });
    expect((await h.svc.accept('A', b.id, MANAGER, NOW))).toMatchObject({ consequence: 'FORFEIT_FEES_PAID_IN_ADVANCE', penaltyAgainst: 'TOC' });
  });

  it('Force Majeure stays consequence-free through every step', async () => {
    const h = make();
    const r = h.seedRequest({ status: 'ACKNOWLEDGED', attribution: 'FORCE_MAJEURE', isForceMajeure: true, consequence: 'NONE_FORCE_MAJEURE', penaltyApplicable: false, penaltyAgainst: null });
    expect(await h.svc.confirmCancellation('A', r.id, MANAGER, NOW)).toMatchObject({ consequence: 'NONE_FORCE_MAJEURE', penaltyApplicable: false });
  });

  it('closes an accepted or confirmed request and stamps closedAt', async () => {
    const h = make();
    const a = h.seedRequest({ status: 'ACCEPTED' });
    const b = h.seedRequest({ status: 'CANCELLED_CONFIRMED' });
    expect(await h.svc.close('A', a.id, MANAGER, NOW)).toMatchObject({ status: 'CLOSED', closedAt: NOW });
    expect(await h.svc.close('A', b.id, MANAGER, NOW)).toMatchObject({ status: 'CLOSED', closedAt: NOW });
    expect(h.actions()).toEqual([RAIL_AUDIT_ACTION.CHANGE_CLOSED, RAIL_AUDIT_ACTION.CHANGE_CLOSED]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('allocateParty — the Clearinghouse decides a "could be …" reason', () => {
  const body = (attribution: 'TRIM' | 'TOC' | 'FORCE_MAJEURE', note = 'Clearinghouse ref CH-12') => ({ attribution, note });

  it('is a formal commitment: a dispatcher is refused and nothing changes', async () => {
    const h = make();
    const r = h.seedUndetermined();
    const before = snapshot(h.requests);
    await expect(h.svc.allocateParty('A', r.id, body('TOC'), DISPATCHER, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    expect(snapshot(h.requests)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it.each([
    ['TOC', 'FORFEIT_FEES_PAID_IN_ADVANCE', true, 'TOC', false],
    ['FORCE_MAJEURE', 'NONE_FORCE_MAJEURE', false, null, true],
    ['TRIM', 'PENDING_REPLACEMENT_OUTCOME', false, null, false],
  ] as const)('allocating to %s re-derives the consequence (%s)', async (attribution, consequence, penalty, against, fm) => {
    const h = make();
    const r = h.seedUndetermined();
    const out = await h.svc.allocateParty('A', r.id, body(attribution), MANAGER, NOW);
    expect(out).toMatchObject({ attribution, consequence, penaltyApplicable: penalty, penaltyAgainst: against, isForceMajeure: fm });
    expect(out.note).toMatch(new RegExp(`Clearinghouse allocation: ${attribution} — Clearinghouse ref CH-12`));
    expect(h.entries()[0]).toMatchObject({ action: RAIL_AUDIT_ACTION.CHANGE_PARTY_ALLOCATED, actorId: 'u-mgr' });
    expect(h.entries()[0].metadata).toMatchObject({ from: 'UNDETERMINED', to: attribution, consequence });
  });

  it('allocating to TRIM after the cancellation was confirmed immediately yields the refund', async () => {
    const h = make();
    const r = h.seedUndetermined({ status: 'CANCELLED_CONFIRMED', replacementAccepted: false });
    expect(await h.svc.allocateParty('A', r.id, body('TRIM'), MANAGER, NOW)).toMatchObject({ consequence: 'FULL_TRAIN_PATH_FEE_REFUND', penaltyApplicable: true, penaltyAgainst: 'TRIM' });
  });

  it('only a party the annexure names for that reason may be chosen (Hook-up is IM or Rail Operations — never Force Majeure)', async () => {
    const h = make();
    const r = h.seedRequest({ cancellationCode: COULD_BE_2, cancellationReason: 'Hook-up', codeResponsibleParty: 'ALLOCATION_REQUIRED', attribution: 'UNDETERMINED', consequence: 'PENDING_ALLOCATION', penaltyApplicable: false, penaltyAgainst: null });
    const before = snapshot(h.requests);
    await expect(h.svc.allocateParty('A', r.id, body('FORCE_MAJEURE'), MANAGER, NOW)).rejects.toThrow(/Annexure 20b allows TRIM \/ TOC for "Hook-up", not FORCE_MAJEURE/);
    expect(snapshot(h.requests)).toBe(before);
    expect((await h.svc.allocateParty('A', r.id, body('TRIM'), MANAGER, NOW)).attribution).toBe('TRIM');
  });

  it('a reason the annexure already allocates cannot be re-allocated by anyone', async () => {
    const h = make();
    const r = h.seedRequest(); // CNX-001 → Rail Operations
    await expect(h.svc.allocateParty('A', r.id, body('FORCE_MAJEURE'), MANAGER, NOW)).rejects.toThrow(/already allocates "Abnormal working \/ yard"/);
    expect(h.requests.rows[0].attribution).toBe('TOC');
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('a closed request cannot be re-allocated', async () => {
    const h = make();
    const r = h.seedUndetermined({ status: 'CLOSED' });
    await expect(h.svc.allocateParty('A', r.id, body('TOC'), MANAGER, NOW)).rejects.toThrow(/closed change request cannot be re-allocated/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('the consequence wording follows the tenant\'s network', () => {
  /**
   * Driven through preview(), the same entry point a controller uses, rather
   * than by calling the rules directly: a resolver that is correct but never
   * wired leaves the operator reading the wrong network's name in the one
   * sentence that tells them who owes them money.
   */
  const p = (h: any, over: Record<string, any> = {}) => h.svc.preview('A', dto(over) as any, NOW);
  /** Seed a cancellation code, so the preview derives its attribution from it. */
  const seedCode = (h: any, code: string, party: string) =>
    h.codes.seed({ code, sourceRow: 1, reason: 'test reason', responsibleParty: party, possibleParties: [], sourceText: party, isActive: true });

  it('a Transnet tenant reads Transnet\'s wording, exactly as before', async () => {
    // No network seeded: this is today's behaviour, and it must not move.
    const h = make();
    seedCode(h, TRIM_CODE, 'INFRASTRUCTURE_MANAGER');
    const r = await p(h, { cancellationCode: TRIM_CODE });
    // preview() returns the whole ConsequenceResult under `consequence`; the
    // decision is the `.consequence` field inside it and the wording is `.basis`.
    expect(r.consequence.consequence).toBe('PENDING_REPLACEMENT_OUTCOME');
    expect(r.consequence.basis).toMatch(/TRIM/);
  });

  it('a tenant on another network reads that network\'s name, not Transnet\'s', async () => {
    const h = make();
    h.seedNetwork({ id: 'net-uk', isDefault: true, companyId: null, roleLabels: { TRIM: 'Network Rail' } });
    seedCode(h, TRIM_CODE, 'INFRASTRUCTURE_MANAGER');
    seedCode(h, TOC_CODE, 'RAIL_OPERATIONS');

    // Two different sentences, both of which named TRIM unconditionally:
    //
    //  the BASIS, which is the sentence saying who owes the refund, and
    //  the planned-occupation WARNING, which fires only when the attribution
    //  is NOT the infrastructure manager -- so it needs a TOC code to appear.
    const im = await p(h, { cancellationCode: TRIM_CODE });
    expect(im.consequence.basis).toMatch(/Network Rail/);
    expect(im.consequence.basis).not.toMatch(/TRIM/);

    const toc = await p(h, { cancellationCode: TOC_CODE, isPlannedOccupation: true });
    expect(toc.warnings.join(' ')).toMatch(/Network Rail/);
    expect(toc.warnings.join(' ')).not.toMatch(/TRIM/);
  });

  it('the DECISION is identical whichever network is configured', async () => {
    // The point of separating role from label: a UK tenant gets the same
    // refund, on the same tests, borne by the same party -- only the noun
    // differs. If this ever fails, labelling has leaked into the logic.
    const plain = make();
    seedCode(plain, TRIM_CODE, 'INFRASTRUCTURE_MANAGER');
    const uk = make();
    uk.seedNetwork({ id: 'net-uk', isDefault: true, companyId: null, roleLabels: { TRIM: 'Network Rail' } });
    seedCode(uk, TRIM_CODE, 'INFRASTRUCTURE_MANAGER');

    for (const over of [
      { isPlannedOccupation: true },
      {},
    ]) {
      const a = await p(plain, { cancellationCode: TRIM_CODE, ...over });
      const b = await p(uk, { cancellationCode: TRIM_CODE, ...over });
      expect(b.consequence.consequence).toBe(a.consequence.consequence);
      expect(b.consequence.penaltyApplicable).toBe(a.consequence.penaltyApplicable);
      expect(b.consequence.penaltyAgainst).toBe(a.consequence.penaltyAgainst);
      expect(b.attribution).toBe(a.attribution);
      expect(b.notice).toEqual(a.notice);
    }
  });

  it('a network that labels nothing still reads as Transnet, never as a blank', async () => {
    const h = make();
    h.seedNetwork({ id: 'net-quiet', isDefault: true, companyId: null, roleLabels: null });
    seedCode(h, TRIM_CODE, 'INFRASTRUCTURE_MANAGER');
    const r = await p(h, { cancellationCode: TRIM_CODE });
    expect(r.consequence.basis).toMatch(/TRIM/);
    expect(r.consequence.basis).not.toMatch(/undefined|null/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('the cancellation codes a tenant is offered belong to their network', () => {
  /**
   * Annexure 20b is a Transnet document: 82 rows of Transnet reason codes,
   * each allocated to a responsible party that decides who pays. Every tenant
   * was picking from it.
   *
   * A tenant on another network loads their own codes, and thereafter must
   * not be offered Transnet's -- because picking one attributes the
   * cancellation, and attribution decides money.
   */
  const seedNetwork = (h: any, id: string) => {
    const net = {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where?.companyId && where.companyId !== null) return null; // no tenant-defined network
        return where?.isDefault ? { id } : null;
      }),
    };
    h.prisma.railNetwork = net;
    // The service reads the network inside withTenant(), so the fake has to
    // hand the same client back for tx.railNetwork to resolve.
    h.prisma.withTenant = jest.fn(async (_c: string, fn: any) => fn(h.prisma));
    return net;
  };

  it('offers a Transnet tenant the seeded Transnet codes', async () => {
    const h = make();
    seedNetwork(h, 'net-transnet');
    h.codes.seed({ code: 'CNX-001', sourceRow: 1, reason: 'Transnet reason', responsibleParty: 'RAIL_OPERATIONS', possibleParties: [], sourceText: 'x', isActive: true, networkId: 'net-transnet' });

    const codes = await h.svc.listCodes('A');
    expect(codes.map((c) => c.code)).toContain('CNX-001');
  });

  it("does not offer another network's codes", async () => {
    const h = make();
    seedNetwork(h, 'net-uk');
    h.codes.seed({ code: 'CNX-001', sourceRow: 1, reason: 'Transnet reason', responsibleParty: 'RAIL_OPERATIONS', possibleParties: [], sourceText: 'x', isActive: true, networkId: 'net-transnet' });
    h.codes.seed({ code: 'UK-01', sourceRow: 101, reason: 'Network Rail reason', responsibleParty: 'RAIL_OPERATIONS', possibleParties: [], sourceText: 'y', isActive: true, networkId: 'net-uk' });

    const codes = await h.svc.listCodes('A');
    expect(codes.map((c) => c.code)).toContain('UK-01');
    expect(codes.map((c) => c.code)).not.toContain('CNX-001');
  });

  it('a code with no network is still offered, so old rows do not disappear', async () => {
    const h = make();
    seedNetwork(h, 'net-uk');
    h.codes.seed({ code: 'CNX-LEGACY', sourceRow: 1, reason: 'Unattributed', responsibleParty: 'RAIL_OPERATIONS', possibleParties: [], sourceText: 'x', isActive: true, networkId: null });

    const codes = await h.svc.listCodes('A');
    expect(codes.map((c) => c.code)).toContain('CNX-LEGACY');
  });

  it('a code from another network cannot be used to attribute a cancellation', async () => {
    // The money test: submitting a Transnet code must not be accepted.
    const h = make();
    seedNetwork(h, 'net-uk');
    h.codes.seed({ code: 'CNX-001', sourceRow: 1, reason: 'Transnet reason', responsibleParty: 'RAIL_OPERATIONS', possibleParties: [], sourceText: 'x', isActive: true, networkId: 'net-transnet' });

    await expect(
      h.svc.create('A', dto({ cancellationCode: 'CNX-001' }) as any, MANAGER, NOW),
    ).rejects.toThrow(/Unknown cancellation code/);
  });
});
