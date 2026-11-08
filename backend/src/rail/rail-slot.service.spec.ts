/**
 * Slot applications, Annexure 25 self-screening, operator compliance, the corridor-envelope check and
 * the 60-day mobilisation sweeps — Wave 2. Prisma is an in-memory fake (backend/test/support).
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FakeTable, snapshot } from '../../test/support/in-memory-db';
import { RailSlotService } from './rail-slot.service';
import { RailActor } from './rail-audit';
import { REQUIRED_DOCS_OPERATE, REQUIRED_DOCS_SUBMIT } from './rail-compliance';
import { SELF_SCREENING_QUESTIONS } from './catalog/self-screening.catalog';

const DAY = 86_400_000;
const NOW = new Date('2026-10-02T10:00:00.000Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const MANAGER: RailActor = { id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: UserRole.MANAGER };
const DISPATCHER: RailActor = { id: 'u-dsp', email: 'dan@toc.co.za', name: 'Dan Dispatch', role: UserRole.DISPATCH };

/** SYNTHETIC verified corridor for the rejection tests — NOT real corridor data. */
const VERIFIED_ORE = {
  code: 'COR-ORE', name: 'Ore', aliases: ['Cape 2'], workbookRoutes: ['Ore'], sortOrder: 30, isActive: true,
  gauge: 'CAPE_1067MM', electrification: ['DIESEL'], maxAxleLoadTonnes: 26, vehicleProfile: 'B', maxTrainLengthM: 1500,
  dataStatus: 'VERIFIED', contacts: [], sourceRef: 'synthetic test fixture', notes: null,
};

function make(opts: { entitled?: boolean } = {}) {
  const apps = new FakeTable('sa', { unique: [['companyId', 'applicationNumber']], defaults: () => ({ status: 'DRAFT', isDangerousGoods: false }) });
  const docs = new FakeTable('doc');
  const corridors = new FakeTable('cor');
  const yards = new FakeTable('yard');
  const consignments = new FakeTable('con');
  const wagons = new FakeTable('wag');
  const aiEvents = new FakeTable('ai');
  const capacity = new FakeTable('cap', { unique: [['companyId', 'corridorCode', 'validFrom']] });
  const possessions = new FakeTable('pos');
  const consignmentDelegate = {
    ...consignments,
    findFirst: jest.fn(async (args: any) => {
      const c = await consignments.findFirst(args);
      return c ? { ...c, wagons: wagons.rows.filter((w) => w.consignmentId === c.id).map((w) => ({ ...w })) } : null;
    }),
  };
  const prisma = {
    $transaction: async (fn: any) => fn(prisma),
    withTenant: async (_companyId: string, fn: any, _opts?: any) => fn(prisma),
    railSlotApplication: apps, railOperatorComplianceDoc: docs, railCorridorNode: corridors, railYardSpec: yards,
    railConsignment: consignmentDelegate, aiEvent: aiEvents,
    railCorridorCapacity: capacity, railPossessionWindow: possessions,
  };
  const billing = { hasFeature: jest.fn().mockResolvedValue(opts.entitled ?? true) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const outbox = { enqueue: jest.fn().mockResolvedValue('ob1') };
  const svc = new RailSlotService(prisma as any, billing as any, audit as any, outbox as any);

  const seedApp = (over: Record<string, any> = {}) =>
    apps.seed({
      companyId: 'A', applicationNumber: `SA-2026-9${apps.rows.length}`, status: 'DRAFT', corridorCode: 'COR-ORE', isDangerousGoods: false,
      requestedFrom: at(30), requestedUntil: at(30 + 365), firstOperatedAt: null, forfeitureFlaggedAt: null, mobilizeBy: null,
      allocatedAt: null, validFrom: null, validUntil: null, consignmentId: null, selfScreening: null, ...over,
    });
  const seedDocs = (companyId: string, types: string[], over: Record<string, any> = {}) =>
    types.map((docType) => docs.seed({ companyId, docType, status: 'VALID', validFrom: at(-100), validUntil: at(300), referenceNumber: `${docType}-1`, ...over }));
  const answers = (value: 'YES' | 'NO' = 'YES') => SELF_SCREENING_QUESTIONS.map((q) => ({ no: q.no, answer: value, remarks: value === 'NO' ? 'because' : undefined }));
  const draftReady = (over: Record<string, any> = {}) => {
    seedDocs('A', REQUIRED_DOCS_SUBMIT);
    return seedApp({ selfScreening: { answers: answers('YES') }, selfScreeningCompletedAt: NOW, ...over });
  };
  const actions = () => audit.record.mock.calls.map(([e]) => e.action);
  const entries = () => audit.record.mock.calls.map(([e]) => e);
  const seedCapacity = (over: Record<string, any> = {}) =>
    capacity.seed({
      companyId: 'A', corridorCode: 'COR-ORE', validFrom: at(0), validUntil: at(365),
      theoreticalPathsPerDay: 20, capacityFactor: 0.65, practicalPathsPerDay: 13,
      unit: 'PATHS_PER_DAY', dataStatus: 'SOURCE_PENDING', sourceRef: null, notes: null, ...over,
    });
  return { svc, prisma, billing, audit, apps, docs, corridors, yards, consignments, wagons, aiEvents, capacity, possessions, seedApp, seedDocs, seedCapacity, answers, draftReady, actions, entries };
}
type H = ReturnType<typeof make>;
const dto = (over: Record<string, any> = {}) => ({
  corridorCode: 'COR-ORE', requestedFrom: at(10).toISOString(), requestedUntil: at(10 + 365).toISOString(), ...over,
});

afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
describe('entitlement', () => {
  it('every public method is refused without the `rail` feature, before any data access', async () => {
    const h = make({ entitled: false });
    const s = h.svc;
    const calls: Array<() => Promise<unknown>> = [
      () => s.listCorridors('A'), () => s.listYards('A'), () => s.referenceCompleteness('A'), () => s.checkEnvelope('A', { subjects: [{}] } as any),
      () => s.list('A'), () => s.get('A', 'x'), () => s.readiness('A', 'x'), () => s.overview('A'),
      () => s.createApplication('A', dto() as any, MANAGER), () => s.updateApplication('A', 'x', {}, MANAGER),
      () => s.setSelfScreening('A', 'x', { answers: [] }, MANAGER), () => s.submit('A', 'x', MANAGER),
      () => s.startAssessment('A', 'x', MANAGER), () => s.flagCapacityConflict('A', 'x', { note: 'abc' }, MANAGER),
      () => s.resolveCapacityConflict('A', 'x', MANAGER), () => s.allocate('A', 'x', {}, MANAGER),
      () => s.reject('A', 'x', { reason: 'abc' }, MANAGER), () => s.expire('A', 'x', MANAGER), () => s.markOperated('A', 'x', {}, MANAGER),
      () => s.linkConsignment('A', 'x', { consignmentId: 'c' }, MANAGER), () => s.listDocs('A'), () => s.complianceSummary('A'),
      () => s.createDoc('A', { docType: 'RSR_PERMIT', validFrom: at(-1).toISOString(), validUntil: at(1).toISOString() }, MANAGER),
      () => s.verifyDoc('A', 'x', MANAGER), () => s.revokeDoc('A', 'x', { reason: 'abc' }, MANAGER),
      () => s.listCapacity('A'), () => s.capacityPreview('A', 'COR-ORE', at(0), at(10)),
      () => s.upsertCapacity('A', dto() as any, MANAGER), () => s.deleteCapacity('A', 'x', MANAGER),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.billing.hasFeature).toHaveBeenCalledTimes(calls.length);
    expect(h.billing.hasFeature).toHaveBeenCalledWith('A', 'rail');
    for (const t of [h.apps, h.docs, h.corridors, h.yards, h.consignments]) for (const fn of t.fns) expect(fn).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('tenant isolation', () => {
  it('an application of tenant A is invisible to tenant B, and every mutation fails without a trace', async () => {
    const h = make();
    const app = h.seedApp({ status: 'UNDER_ASSESSMENT' });
    h.seedDocs('B', REQUIRED_DOCS_OPERATE);
    const before = snapshot(h.apps, h.docs);
    const s = h.svc;
    const attempts = [
      s.get('B', app.id), s.readiness('B', app.id), s.updateApplication('B', app.id, { commodity: 'x' }, MANAGER),
      s.setSelfScreening('B', app.id, { answers: h.answers() }, MANAGER), s.submit('B', app.id, MANAGER),
      s.startAssessment('B', app.id, MANAGER), s.flagCapacityConflict('B', app.id, { note: 'abc' }, MANAGER),
      s.resolveCapacityConflict('B', app.id, MANAGER), s.allocate('B', app.id, {}, MANAGER), s.reject('B', app.id, { reason: 'abc' }, MANAGER),
      s.expire('B', app.id, MANAGER), s.markOperated('B', app.id, {}, MANAGER), s.linkConsignment('B', app.id, { consignmentId: 'c' }, MANAGER),
    ];
    for (const a of attempts) await expect(a).rejects.toBeInstanceOf(NotFoundException);
    expect(snapshot(h.apps, h.docs)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('list and documents are scoped to the caller', async () => {
    const h = make();
    h.seedApp({ companyId: 'A', applicationNumber: 'A-1' });
    h.seedApp({ companyId: 'B', applicationNumber: 'B-1' });
    h.seedDocs('A', ['RSR_PERMIT']);
    h.seedDocs('B', ['INSURANCE', 'RSR_PERMIT']);
    expect((await h.svc.list('A')).map((a: any) => a.applicationNumber)).toEqual(['A-1']);
    expect((await h.svc.listDocs('B')).map((d: any) => d.docType).sort()).toEqual(['INSURANCE', 'RSR_PERMIT']);
    expect((await h.svc.complianceSummary('A')).documents).toHaveLength(1);
  });

  it('a document of another tenant cannot be verified or revoked', async () => {
    const h = make();
    const [doc] = h.seedDocs('A', ['RSR_PERMIT'], { status: 'PENDING_REVIEW' });
    await expect(h.svc.verifyDoc('B', doc.id, MANAGER, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.svc.revokeDoc('B', doc.id, { reason: 'abc' }, MANAGER, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.docs.rows[0].status).toBe('PENDING_REVIEW');
  });

  it('documents of tenant B do not satisfy tenant A\'s compliance gate', async () => {
    const h = make();
    h.seedDocs('B', REQUIRED_DOCS_SUBMIT);
    const app = h.seedApp({ selfScreening: { answers: h.answers() } });
    await expect(h.svc.submit('A', app.id, MANAGER, NOW)).rejects.toThrow(/RSR_PERMIT: no document on file/);
  });

  it('a consignment of another tenant cannot be linked, checked or marked operated against', async () => {
    const h = make();
    const theirs = h.consignments.seed({ companyId: 'B', consignmentNumber: 'RAIL-B-1', corridor: 'Ore' });
    h.seedDocs('A', REQUIRED_DOCS_OPERATE);
    const allocated = h.seedApp({ status: 'ALLOCATED', allocatedAt: at(-1), mobilizeBy: at(59) });
    await expect(h.svc.linkConsignment('A', allocated.id, { consignmentId: theirs.id }, MANAGER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.svc.checkEnvelope('A', { consignmentId: theirs.id })).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.svc.markOperated('A', allocated.id, { consignmentId: theirs.id }, MANAGER, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.apps.rows.find((a) => a.id === allocated.id)!.consignmentId).toBeNull();
  });

  it('application numbers count per tenant', async () => {
    const h = make();
    h.seedApp({ companyId: 'A' });
    h.seedApp({ companyId: 'A' });
    const year = new Date().getFullYear();
    expect((await h.svc.createApplication('B', dto() as any, MANAGER)).applicationNumber).toBe(`SA-${year}-00001`);
    expect((await h.svc.createApplication('A', dto() as any, MANAGER)).applicationNumber).toBe(`SA-${year}-00003`);
  });

  it('create stamps the caller\'s company — nothing in the DTO can override it', async () => {
    const h = make();
    await h.svc.createApplication('A', dto({ companyId: 'B' }) as any, MANAGER);
    expect(h.apps.rows[0].companyId).toBe('A');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('reference data', () => {
  it('serves the six V4 corridors from the code catalog before the seeder has run', async () => {
    const h = make();
    const list = await h.svc.listCorridors('A');
    expect(list).toHaveLength(6);
    expect(list.every((c) => c.fromCatalog && c.dataStatus === 'SOURCE_PENDING' && c.gauge === null)).toBe(true);
  });
  it('seeded rows win over the catalog', async () => {
    const h = make();
    h.corridors.seed(VERIFIED_ORE);
    const list = await h.svc.listCorridors('A');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ code: 'COR-ORE', gauge: 'CAPE_1067MM', fromCatalog: false });
  });
  it('says plainly that the data is incomplete: 0 of 11 yards, 0 of 6 verified', async () => {
    const h = make();
    const c = await h.svc.referenceCompleteness('A');
    expect(c.corridors).toEqual({ expected: 6, loaded: 6, verified: 0 });
    expect(c.yards).toEqual({ expected: 11, loaded: 0, verified: 0 });
    expect(c.fromCatalogFallback).toBe(true);
    expect(c.message).toMatch(/not been loaded from a cited source/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('createApplication / updateApplication', () => {
  it('creates a DRAFT with a tenant-scoped number, audits it, and attaches the mobilisation view', async () => {
    const h = make();
    const app: any = await h.svc.createApplication('A', dto({ commodity: 'Manganese', trainsPerWeek: 5 }) as any, MANAGER);
    expect(app).toMatchObject({ companyId: 'A', status: 'DRAFT', corridorCode: 'COR-ORE', commodity: 'Manganese', createdById: 'u-mgr' });
    expect(app.applicationNumber).toMatch(/^SA-\d{4}-00001$/);
    expect(app.mobilisation.state).toBe('NOT_ALLOCATED');
    expect(h.entries()[0]).toMatchObject({
      action: 'slot_application.created', actorType: 'tenant', actorId: 'u-mgr', targetType: 'rail_slot_application', targetId: app.id,
      metadata: { module: 'rail', companyId: 'A', corridorCode: 'COR-ORE' },
    });
  });
  it('rejects an unknown corridor', async () => {
    const h = make();
    await expect(h.svc.createApplication('A', dto({ corridorCode: 'COR-NOPE' }) as any, MANAGER)).rejects.toThrow(/Unknown corridor "COR-NOPE"/);
    expect(h.apps.rows).toHaveLength(0);
  });
  it('enforces the 5-year validity window at creation', async () => {
    const h = make();
    const from = new Date('2026-11-01T00:00:00Z');
    await expect(h.svc.createApplication('A', dto({ requestedFrom: from.toISOString(), requestedUntil: '2031-11-01T00:00:00Z' }) as any, MANAGER)).resolves.toBeDefined();
    await expect(h.svc.createApplication('A', dto({ requestedFrom: from.toISOString(), requestedUntil: '2031-11-01T00:00:01Z' }) as any, MANAGER)).rejects.toThrow(/exceed 5 years/);
    await expect(h.svc.createApplication('A', dto({ requestedFrom: from.toISOString(), requestedUntil: from.toISOString() }) as any, MANAGER)).rejects.toThrow(/end after it starts/);
  });
  it('a yard code cannot be validated while no yard data is loaded; a name can be given instead', async () => {
    const h = make();
    await expect(h.svc.createApplication('A', dto({ originYardCode: 'YARD-1' }) as any, MANAGER)).rejects.toThrow(/No transfer-yard reference data is loaded/);
    await expect(h.svc.createApplication('A', dto({ originName: 'Hotazel siding' }) as any, MANAGER)).resolves.toBeDefined();
  });
  it('once yards are loaded, an unknown yard code is rejected and a known one accepted', async () => {
    const h = make();
    h.yards.seed({ code: 'YARD-1', name: 'Test yard', isActive: true, dataStatus: 'SOURCE_PENDING', electrification: [] });
    await expect(h.svc.createApplication('A', dto({ originYardCode: 'YARD-2' }) as any, MANAGER)).rejects.toThrow(/Unknown yard code "YARD-2"/);
    await expect(h.svc.createApplication('A', dto({ originYardCode: 'YARD-1' }) as any, MANAGER)).resolves.toBeDefined();
  });
  it('recovers from a number collision (two simultaneous creates) by retrying with a fresh count', async () => {
    const h = make();
    const year = new Date().getFullYear();
    // another request wins the race for SA-<year>-00001 between our count and our insert
    h.apps.count.mockImplementationOnce(async () => 0);
    h.apps.seed({ companyId: 'A', applicationNumber: `SA-${year}-00001`, status: 'DRAFT', createdAt: new Date() });
    const app = await h.svc.createApplication('A', dto() as any, MANAGER);
    expect(app.applicationNumber).toBe(`SA-${year}-00002`);
  });
  it('only a DRAFT can be edited; editing clears any stale envelope result and re-checks the window', async () => {
    const h = make();
    const draft = h.seedApp({ envelopeCheckStatus: 'UNVERIFIED', envelopeCheck: { status: 'UNVERIFIED' } });
    const out: any = await h.svc.updateApplication('A', draft.id, { commodity: 'Coal', axleLoadTonnes: 20 }, MANAGER);
    expect(out).toMatchObject({ commodity: 'Coal', axleLoadTonnes: 20, envelopeCheckStatus: null, envelopeCheck: null });
    await expect(h.svc.updateApplication('A', draft.id, { requestedUntil: at(30 + 366 * 6).toISOString() }, MANAGER)).rejects.toThrow(/exceed 5 years/);
    const sub = h.seedApp({ status: 'SUBMITTED' });
    await expect(h.svc.updateApplication('A', sub.id, { commodity: 'x' }, MANAGER)).rejects.toThrow(/Only a DRAFT application can be edited/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('Annexure 25 self-screening', () => {
  it('records the answers, stamps completion when all seven are answered, and audits it', async () => {
    const h = make();
    const app = h.seedApp();
    const r: any = await h.svc.setSelfScreening('A', app.id, { accessType: 'Network A', answers: h.answers('YES') }, MANAGER);
    expect(r.evaluation).toMatchObject({ complete: true, flagged: [], unanswered: [] });
    expect(r.application.selfScreeningCompletedAt).toBeInstanceOf(Date);
    expect(r.application.selfScreeningAccessType).toBe('Network A');
    expect(h.entries()[0]).toMatchObject({ action: 'slot_application.self_screened', metadata: { complete: true, accessType: 'Network A' } });
  });
  it('a partial form is stored but not marked complete', async () => {
    const h = make();
    const app = h.seedApp();
    const r: any = await h.svc.setSelfScreening('A', app.id, { answers: h.answers('YES').slice(0, 5) }, MANAGER);
    expect(r.evaluation.unanswered).toEqual(['vi', 'vii']);
    expect(r.application.selfScreeningCompletedAt).toBeNull();
  });
  it('rejects a question answered twice, and any change once the application is past DRAFT', async () => {
    const h = make();
    const app = h.seedApp();
    await expect(h.svc.setSelfScreening('A', app.id, { answers: [{ no: 'i', answer: 'YES' }, { no: 'i', answer: 'NO' }] }, MANAGER)).rejects.toThrow(/answered twice/);
    const sub = h.seedApp({ status: 'SUBMITTED' });
    await expect(h.svc.setSelfScreening('A', sub.id, { answers: h.answers() }, MANAGER)).rejects.toThrow(/only be changed while the application is DRAFT/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('submit — three hard gates', () => {
  it('passes when Annexure 25 is complete, documents are valid and the envelope is not INCOMPATIBLE', async () => {
    const h = make();
    const app = h.draftReady();
    const r: any = await h.svc.submit('A', app.id, MANAGER, NOW);
    expect(r.application).toMatchObject({ status: 'SUBMITTED', envelopeCheckStatus: 'UNVERIFIED' }); // pending corridor → recorded, not blocked
    expect(r.application.submittedAt).toEqual(NOW);
    expect(r.application.complianceSnapshot).toMatchObject({ ok: true, stage: 'SUBMIT' });
    expect(h.entries().at(-1)).toMatchObject({ action: 'slot_application.submitted', metadata: { envelopeStatus: 'UNVERIFIED' } });
    expect(r.readiness.notes[0]).toMatch(/has not confirmed that the rolling stock fits/);
  });

  it('is a formal commitment: only an authorised representative may submit (service-level)', async () => {
    const h = make();
    const app = h.draftReady();
    await expect(h.svc.submit('A', app.id, DISPATCHER, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.apps.rows[0].status).toBe('DRAFT');
  });

  it('only a DRAFT can be submitted', async () => {
    const h = make();
    const app = h.draftReady({ status: 'SUBMITTED' });
    await expect(h.svc.submit('A', app.id, MANAGER, NOW)).rejects.toThrow(/Only a DRAFT application can be submitted/);
  });

  describe('gate 1 — Annexure 25', () => {
    it('blocks an incomplete form, naming the unanswered questions', async () => {
      const h = make();
      h.seedDocs('A', REQUIRED_DOCS_SUBMIT);
      const app = h.seedApp({ selfScreening: { answers: h.answers().slice(0, 4) } });
      await expect(h.svc.submit('A', app.id, MANAGER, NOW)).rejects.toThrow(/self-screening is incomplete \(unanswered: v, vi, vii\)/);
    });
    it('blocks a "No" with no remarks, but a "No" WITH remarks is allowed (flagged for the IM, not blocked)', async () => {
      const h = make();
      h.seedDocs('A', REQUIRED_DOCS_SUBMIT);
      const noRemarks = h.answers('YES'); noRemarks[1] = { no: 'ii', answer: 'NO', remarks: undefined } as any;
      const bad = h.seedApp({ selfScreening: { answers: noRemarks } });
      await expect(h.svc.submit('A', bad.id, MANAGER, NOW)).rejects.toThrow(/"No" answers need remarks \(ii\)/);
      const withRemarks = h.answers('YES'); withRemarks[1] = { no: 'ii', answer: 'NO', remarks: 'leased stock arrives Q2' };
      const good = h.seedApp({ selfScreening: { answers: withRemarks } });
      const r: any = await h.svc.submit('A', good.id, MANAGER, NOW);
      expect(r.readiness.selfScreening.flagged).toEqual(['ii']);
      expect(h.entries().at(-1)!.metadata.selfScreeningFlags).toEqual(['ii']);
    });
    it('blocks an application with no self-screening at all', async () => {
      const h = make();
      h.seedDocs('A', REQUIRED_DOCS_SUBMIT);
      const app = h.seedApp();
      await expect(h.svc.submit('A', app.id, MANAGER, NOW)).rejects.toThrow(/self-screening is incomplete/);
    });
  });

  describe('gate 2 — compliance documents (hard-block when expired)', () => {
    it('an EXPIRED RSR permit blocks submission and the message says when it lapsed', async () => {
      const h = make();
      h.seedDocs('A', ['INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT']);
      h.seedDocs('A', ['RSR_PERMIT'], { validUntil: at(-3) });
      const app = h.seedApp({ selfScreening: { answers: h.answers() } });
      await expect(h.svc.submit('A', app.id, MANAGER, NOW)).rejects.toThrow(/Compliance — RSR_PERMIT: EXPIRED on 2026-09-29/);
      expect(h.apps.rows[0].status).toBe('DRAFT');
    });
    it('a stored VALID status does not save a document whose dates have passed', async () => {
      const h = make();
      h.seedDocs('A', REQUIRED_DOCS_SUBMIT, { status: 'VALID', validUntil: at(-1) });
      const app = h.seedApp({ selfScreening: { answers: h.answers() } });
      await expect(h.svc.submit('A', app.id, MANAGER, NOW)).rejects.toThrow(/EXPIRED/);
    });
    it('missing and unverified documents block too', async () => {
      const h = make();
      h.seedDocs('A', ['RSR_PERMIT'], { status: 'PENDING_REVIEW' });
      const app = h.seedApp({ selfScreening: { answers: h.answers() } });
      await expect(h.svc.submit('A', app.id, MANAGER, NOW)).rejects.toThrow(/RSR_PERMIT: entered but not yet verified[\s\S]*INSURANCE: no document on file/);
    });
    it('dangerous goods need a valid DANGEROUS_GOODS authorisation', async () => {
      const h = make();
      const app = h.draftReady({ isDangerousGoods: true });
      await expect(h.svc.submit('A', app.id, MANAGER, NOW)).rejects.toThrow(/DANGEROUS_GOODS: no document on file/);
      h.seedDocs('A', ['DANGEROUS_GOODS']);
      await expect(h.svc.submit('A', app.id, MANAGER, NOW)).resolves.toBeDefined();
    });
  });

  describe('gate 3 — corridor envelope', () => {
    it('REJECTS when the stated axle load violates a VERIFIED corridor', async () => {
      const h = make();
      h.corridors.seed(VERIFIED_ORE);
      const app = h.draftReady({ gauge: 'CAPE_1067MM', axleLoadTonnes: 30, vehicleProfile: 'B' });
      await expect(h.svc.submit('A', app.id, MANAGER, NOW)).rejects.toThrow(/Corridor envelope — .*axle load 30 t exceeds the Ore corridor limit of 26 t by 4 t/);
      expect(h.apps.rows[0].status).toBe('DRAFT');
    });
    it('REJECTS a gauge mismatch', async () => {
      const h = make();
      h.corridors.seed(VERIFIED_ORE);
      const app = h.draftReady({ gauge: 'STANDARD_1435MM', axleLoadTonnes: 20 });
      await expect(h.svc.submit('A', app.id, MANAGER, NOW)).rejects.toThrow(/gauge STANDARD_1435MM does not match/);
    });
    it('accepts a compatible application on a verified corridor, recording COMPATIBLE', async () => {
      const h = make();
      h.corridors.seed(VERIFIED_ORE);
      const app = h.draftReady({ gauge: 'CAPE_1067MM', axleLoadTonnes: 26, vehicleProfile: 'B' });
      const r: any = await h.svc.submit('A', app.id, MANAGER, NOW);
      expect(r.application.envelopeCheckStatus).toBe('COMPATIBLE');
      expect(r.application.envelopeCheck).toMatchObject({ status: 'COMPATIBLE', corridorVerified: true });
    });
    it('an application that does not declare its particulars is UNVERIFIED on a verified corridor — allowed, but never "COMPATIBLE"', async () => {
      const h = make();
      h.corridors.seed(VERIFIED_ORE);
      const app = h.draftReady();
      const r: any = await h.svc.submit('A', app.id, MANAGER, NOW);
      expect(r.application.envelopeCheckStatus).toBe('UNVERIFIED');
    });
    it('a pending (unverified) corridor never rejects, even for an absurd axle load', async () => {
      const h = make(); // no seeded rows → catalog fallback, SOURCE_PENDING
      const app = h.draftReady({ gauge: 'STANDARD_1435MM', axleLoadTonnes: 40 });
      const r: any = await h.svc.submit('A', app.id, MANAGER, NOW);
      expect(r.application.envelopeCheckStatus).toBe('UNVERIFIED');
    });
  });

  it('readiness() reports the same blockers without changing anything', async () => {
    const h = make();
    const app = h.seedApp();
    const before = snapshot(h.apps);
    const r: any = await h.svc.readiness('A', app.id, NOW);
    expect(r.ready).toBe(false);
    expect(r.blockers.length).toBeGreaterThanOrEqual(5); // self-screening + 4 documents
    expect(snapshot(h.apps)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
    const ok = h.draftReady();
    expect((await h.svc.readiness('A', ok.id, NOW) as any).ready).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('lifecycle and the 60-day mobilisation clock', () => {
  it('walks SUBMITTED → UNDER_ASSESSMENT → CAPACITY_CONFLICT → UNDER_ASSESSMENT → ALLOCATED, auditing each step', async () => {
    const h = make();
    const app = h.seedApp({ status: 'SUBMITTED' });
    await h.svc.startAssessment('A', app.id, MANAGER);
    await h.svc.flagCapacityConflict('A', app.id, { note: 'Clashes with TOC-7 path on the Hotazel section' }, MANAGER);
    expect(h.apps.rows[0]).toMatchObject({ status: 'CAPACITY_CONFLICT', conflictNote: 'Clashes with TOC-7 path on the Hotazel section' });
    await h.svc.resolveCapacityConflict('A', app.id, MANAGER);
    expect(h.apps.rows[0]).toMatchObject({ status: 'UNDER_ASSESSMENT', conflictNote: null });
    await h.svc.allocate('A', app.id, {}, MANAGER, NOW);
    expect(h.actions()).toEqual([
      'slot_application.assessment_started', 'slot_application.capacity_conflict', 'slot_application.conflict_resolved', 'slot_application.allocated',
    ]);
    expect(h.entries()[1].metadata).toMatchObject({ from: 'UNDER_ASSESSMENT', to: 'CAPACITY_CONFLICT' });
  });

  it('refuses every transition the state machine does not allow', async () => {
    const h = make();
    const draft = h.seedApp({ status: 'DRAFT' });
    const submitted = h.seedApp({ status: 'SUBMITTED' });
    const rejected = h.seedApp({ status: 'REJECTED' });
    const allocated = h.seedApp({ status: 'ALLOCATED', mobilizeBy: at(59), allocatedAt: at(-1) });
    await expect(h.svc.allocate('A', draft.id, {}, MANAGER, NOW)).rejects.toThrow(/cannot move from DRAFT to ALLOCATED/);
    await expect(h.svc.allocate('A', submitted.id, {}, MANAGER, NOW)).rejects.toThrow(/cannot move from SUBMITTED to ALLOCATED/);
    await expect(h.svc.startAssessment('A', rejected.id, MANAGER)).rejects.toThrow(/cannot move from REJECTED/);
    await expect(h.svc.reject('A', allocated.id, { reason: 'too late' }, MANAGER)).rejects.toThrow(/cannot move from ALLOCATED to REJECTED/);
    await expect(h.svc.expire('A', submitted.id, MANAGER)).rejects.toThrow(/cannot move from SUBMITTED to EXPIRED/);
  });

  it('allocation starts the clock: mobilizeBy = allocatedAt + exactly 60 days, and the view counts it down', async () => {
    const h = make();
    const app = h.seedApp({ status: 'UNDER_ASSESSMENT' });
    const r: any = await h.svc.allocate('A', app.id, { allocatedAt: NOW.toISOString(), imReference: 'TOL-5521' }, MANAGER, NOW);
    expect(r.allocatedAt).toEqual(NOW);
    expect(r.mobilizeBy).toEqual(new Date(NOW.getTime() + 60 * DAY));
    expect(r.imReference).toBe('TOL-5521');
    expect(r.mobilisation).toMatchObject({ state: 'ON_TRACK', daysRemaining: 60 });
    expect(h.entries()[0].metadata.mobilizeBy).toBe('2026-12-01T10:00:00.000Z');
  });

  it('an allocation dated in the past starts the clock from THAT date (the IM\'s decision date, not today)', async () => {
    const h = make();
    const app = h.seedApp({ status: 'UNDER_ASSESSMENT' });
    const r: any = await h.svc.allocate('A', app.id, { allocatedAt: at(-50).toISOString() }, MANAGER, NOW);
    expect(r.mobilisation).toMatchObject({ state: 'DUE_SOON', daysRemaining: 10 });
  });

  it('the allocated validity window is capped at 5 years and defaults to the requested window', async () => {
    const h = make();
    const a = h.seedApp({ status: 'UNDER_ASSESSMENT', requestedFrom: at(5), requestedUntil: at(5 + 365) });
    const r: any = await h.svc.allocate('A', a.id, {}, MANAGER, NOW);
    expect(r.validFrom).toEqual(at(5));
    expect(r.validUntil).toEqual(at(5 + 365));
    const b = h.seedApp({ status: 'UNDER_ASSESSMENT' });
    await expect(h.svc.allocate('A', b.id, { validFrom: at(0).toISOString(), validUntil: at(366 * 6).toISOString() }, MANAGER, NOW)).rejects.toThrow(/exceed 5 years/);
    expect(h.apps.rows.find((x) => x.id === b.id)!.status).toBe('UNDER_ASSESSMENT');
  });

  it('refuses an allocation date in the future', async () => {
    const h = make();
    const app = h.seedApp({ status: 'UNDER_ASSESSMENT' });
    await expect(h.svc.allocate('A', app.id, { allocatedAt: at(5).toISOString() }, MANAGER, NOW)).rejects.toThrow(/cannot be in the future/);
  });

  it('reject records the reason; expire is only for an ALLOCATED slot', async () => {
    const h = make();
    const app = h.seedApp({ status: 'UNDER_ASSESSMENT' });
    const r: any = await h.svc.reject('A', app.id, { reason: '  Capacity not available  ' }, MANAGER);
    expect(r).toMatchObject({ status: 'REJECTED', rejectionReason: 'Capacity not available' });
    const alloc = h.seedApp({ status: 'ALLOCATED', mobilizeBy: at(10) });
    expect((await h.svc.expire('A', alloc.id, MANAGER) as any).status).toBe('EXPIRED');
  });

  describe('markOperated', () => {
    const allocated = (h: H, over: Record<string, any> = {}) => h.seedApp({ status: 'ALLOCATED', allocatedAt: at(-10), mobilizeBy: at(50), ...over });

    it('records first operation (stopping the forfeiture clock) when the OPERATE document set is valid', async () => {
      const h = make();
      h.seedDocs('A', REQUIRED_DOCS_OPERATE);
      const app = allocated(h);
      const r: any = await h.svc.markOperated('A', app.id, { operatedAt: at(-1).toISOString() }, MANAGER, NOW);
      expect(r.firstOperatedAt).toEqual(at(-1));
      expect(r.mobilisation.state).toBe('OPERATED');
      expect(h.entries()[0]).toMatchObject({ action: 'slot_application.operated', metadata: { afterForfeitureFlag: false } });
    });
    it('HARD-BLOCKS when any OPERATE document has expired — an expired permit cannot "save" a slot', async () => {
      const h = make();
      h.seedDocs('A', REQUIRED_DOCS_OPERATE.filter((t) => t !== 'ACCESS_CONTRACT'));
      h.seedDocs('A', ['ACCESS_CONTRACT'], { validUntil: at(-2) });
      const app = allocated(h);
      await expect(h.svc.markOperated('A', app.id, {}, MANAGER, NOW)).rejects.toThrow(/ACCESS_CONTRACT: EXPIRED/);
      expect(h.apps.rows[0].firstOperatedAt).toBeNull();
    });
    it('SUBMIT-level documents are not enough to operate', async () => {
      const h = make();
      h.seedDocs('A', REQUIRED_DOCS_SUBMIT);
      await expect(h.svc.markOperated('A', allocated(h).id, {}, MANAGER, NOW)).rejects.toThrow(/INTERFACE_AGREEMENT: no document on file/);
    });
    it('only an ALLOCATED, not-yet-operated application; never a future date', async () => {
      const h = make();
      h.seedDocs('A', REQUIRED_DOCS_OPERATE);
      await expect(h.svc.markOperated('A', h.seedApp({ status: 'SUBMITTED' }).id, {}, MANAGER, NOW)).rejects.toThrow(/Only an ALLOCATED application/);
      const done = allocated(h, { firstOperatedAt: at(-3) });
      await expect(h.svc.markOperated('A', done.id, {}, MANAGER, NOW)).rejects.toThrow(/already been marked as operated/);
      await expect(h.svc.markOperated('A', allocated(h).id, { operatedAt: at(5).toISOString() }, MANAGER, NOW)).rejects.toThrow(/cannot be in the future/);
    });
    it('operating after the forfeiture flag is recorded as such (the flag is history, not erased)', async () => {
      const h = make();
      h.seedDocs('A', REQUIRED_DOCS_OPERATE);
      const app = allocated(h, { mobilizeBy: at(-5), forfeitureFlaggedAt: at(-4) });
      await h.svc.markOperated('A', app.id, {}, MANAGER, NOW);
      expect(h.entries()[0].metadata.afterForfeitureFlag).toBe(true);
      expect(h.apps.rows[0].forfeitureFlaggedAt).toEqual(at(-4));
    });
  });

  describe('linkConsignment — rejects wagons that violate the corridor', () => {
    const setup = () => {
      const h = make();
      h.corridors.seed(VERIFIED_ORE);
      const app = h.seedApp({ status: 'ALLOCATED', allocatedAt: at(-1), mobilizeBy: at(59) });
      const con = h.consignments.seed({ companyId: 'A', consignmentNumber: 'RAIL-2026-00007', corridor: 'Ore' });
      return { h, app, con };
    };
    it('links a consignment whose wagons fit', async () => {
      const { h, app, con } = setup();
      h.wagons.seed({ consignmentId: con.id, wagonNumber: 'W1', tareTonnes: 24, loadedTonnes: 80, axles: 4, gauge: 'CAPE_1067MM' }); // 26.0 t axle
      const r: any = await h.svc.linkConsignment('A', app.id, { consignmentId: con.id }, MANAGER);
      expect(r.application.consignmentId).toBe(con.id);
      expect(r.envelope.status).toBe('COMPATIBLE');
      expect(h.entries()[0]).toMatchObject({ action: 'slot_application.consignment_linked', metadata: { consignmentNumber: 'RAIL-2026-00007', envelopeStatus: 'COMPATIBLE', wagons: 1 } });
    });
    it('REJECTS the link when a wagon is over the axle limit, naming the wagon', async () => {
      const { h, app, con } = setup();
      h.wagons.seed({ consignmentId: con.id, wagonNumber: 'OK-1', tareTonnes: 24, loadedTonnes: 70, axles: 4, gauge: 'CAPE_1067MM' });
      h.wagons.seed({ consignmentId: con.id, wagonNumber: 'HEAVY-2', tareTonnes: 25, loadedTonnes: 90, axles: 4, gauge: 'CAPE_1067MM' }); // 28.75
      await expect(h.svc.linkConsignment('A', app.id, { consignmentId: con.id }, MANAGER)).rejects.toThrow(/not compatible with the Ore corridor: HEAVY-2: axle load 28.75 t exceeds/);
      expect(h.apps.rows[0].consignmentId).toBeNull();
    });
    it('REJECTS a gauge mismatch', async () => {
      const { h, app, con } = setup();
      h.wagons.seed({ consignmentId: con.id, wagonNumber: 'WIDE-1', tareTonnes: 20, loadedTonnes: 60, axles: 4, gauge: 'STANDARD_1435MM' });
      await expect(h.svc.linkConsignment('A', app.id, { consignmentId: con.id }, MANAGER)).rejects.toThrow(/WIDE-1: gauge STANDARD_1435MM does not match/);
    });
    it('wagons with undeclared particulars are UNVERIFIED — linked, but the result says the fit is not confirmed', async () => {
      const { h, app, con } = setup();
      h.wagons.seed({ consignmentId: con.id, wagonNumber: 'BARE-1' });
      const r: any = await h.svc.linkConsignment('A', app.id, { consignmentId: con.id }, MANAGER);
      expect(r.envelope.status).toBe('UNVERIFIED');
      expect(r.application.consignmentId).toBe(con.id);
    });
    it('only an ALLOCATED application can take a consignment', async () => {
      const { h, con } = setup();
      const draft = h.seedApp({ status: 'DRAFT' });
      await expect(h.svc.linkConsignment('A', draft.id, { consignmentId: con.id }, MANAGER)).rejects.toThrow(/only be linked to an ALLOCATED application/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('mobilisation sweep (system actor)', () => {
  it('flags an unoperated allocation past mobilizeBy exactly once, audits it as the system, and raises an AiEvent', async () => {
    const h = make();
    const app = h.seedApp({ companyId: 'T1', status: 'ALLOCATED', applicationNumber: 'SA-1', allocatedAt: at(-61), mobilizeBy: at(-1) });
    const first = await h.svc.runMobilisationSweep(NOW);
    expect(first).toEqual({ forfeitureFlagged: 1, expired: 0 });
    expect(h.apps.rows.find((a) => a.id === app.id)!.forfeitureFlaggedAt).toEqual(NOW);
    expect(h.entries()[0]).toMatchObject({
      action: 'slot_application.forfeiture_flagged', actorType: 'system', actorId: null, targetId: app.id, metadata: { companyId: 'T1' },
    });
    expect(h.aiEvents.rows[0]).toMatchObject({ companyId: 'T1', type: 'RAIL_SLOT_FORFEITURE_FLAG', severity: 'high', sourceId: app.id });
    expect(await h.svc.runMobilisationSweep(NOW)).toEqual({ forfeitureFlagged: 0, expired: 0 }); // idempotent
    expect(h.audit.record).toHaveBeenCalledTimes(1);
  });

  it('is exactly on the boundary: not yet due AT mobilizeBy, flagged just after', async () => {
    const h = make();
    h.seedApp({ status: 'ALLOCATED', allocatedAt: at(-60), mobilizeBy: NOW });
    expect(await h.svc.runMobilisationSweep(NOW)).toEqual({ forfeitureFlagged: 0, expired: 0 });
    expect(await h.svc.runMobilisationSweep(new Date(NOW.getTime() + 1))).toEqual({ forfeitureFlagged: 1, expired: 0 });
  });

  it('leaves operated, not-yet-due, flagged and non-ALLOCATED applications alone', async () => {
    const h = make();
    h.seedApp({ status: 'ALLOCATED', mobilizeBy: at(-5), firstOperatedAt: at(-10) });
    h.seedApp({ status: 'ALLOCATED', mobilizeBy: at(20) });
    h.seedApp({ status: 'ALLOCATED', mobilizeBy: at(-5), forfeitureFlaggedAt: at(-4) });
    h.seedApp({ status: 'UNDER_ASSESSMENT', mobilizeBy: null });
    h.seedApp({ status: 'EXPIRED', mobilizeBy: at(-5) });
    expect(await h.svc.runMobilisationSweep(NOW)).toEqual({ forfeitureFlagged: 0, expired: 0 });
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('attributes each tenant\'s flag to that tenant', async () => {
    const h = make();
    h.seedApp({ companyId: 'A', status: 'ALLOCATED', mobilizeBy: at(-2) });
    h.seedApp({ companyId: 'B', status: 'ALLOCATED', mobilizeBy: at(-2) });
    await h.svc.runMobilisationSweep(NOW);
    expect(h.entries().map((e) => e.metadata.companyId).sort()).toEqual(['A', 'B']);
    expect(h.aiEvents.rows.map((e) => e.companyId).sort()).toEqual(['A', 'B']);
  });

  it('expires an ALLOCATED slot whose validity window has ended', async () => {
    const h = make();
    const app = h.seedApp({ status: 'ALLOCATED', firstOperatedAt: at(-300), mobilizeBy: at(-250), validUntil: at(-1) });
    expect(await h.svc.runMobilisationSweep(NOW)).toEqual({ forfeitureFlagged: 0, expired: 1 });
    expect(h.apps.rows.find((a) => a.id === app.id)).toMatchObject({ status: 'EXPIRED', expiredAt: NOW });
    expect(h.entries()[0]).toMatchObject({ action: 'slot_application.expired', actorType: 'system', metadata: { reason: 'validity window ended' } });
  });

  it('a failing AiEvent write does not stop the flag', async () => {
    const h = make();
    h.aiEvents.create.mockRejectedValue(new Error('events locked'));
    h.seedApp({ status: 'ALLOCATED', mobilizeBy: at(-2) });
    expect(await h.svc.runMobilisationSweep(NOW)).toEqual({ forfeitureFlagged: 1, expired: 0 });
  });

  it('the scheduled wrapper never throws', async () => {
    const h = make();
    h.apps.findMany.mockRejectedValue(new Error('db down'));
    await expect(h.svc.scheduledSweeps()).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('compliance documents', () => {
  const docDto = (over: Record<string, any> = {}) => ({ docType: 'RSR_PERMIT' as const, validFrom: at(-10).toISOString(), validUntil: at(355).toISOString(), ...over });

  it('a new document starts PENDING_REVIEW and is audited', async () => {
    const h = make();
    const d: any = await h.svc.createDoc('A', docDto({ referenceNumber: 'RSR-2026-114', issuer: 'RSR' }), MANAGER);
    expect(d).toMatchObject({ companyId: 'A', status: 'PENDING_REVIEW', effectiveStatus: 'PENDING_REVIEW', referenceNumber: 'RSR-2026-114' });
    expect(h.entries()[0]).toMatchObject({ action: 'compliance_doc.created', targetType: 'rail_compliance_doc', metadata: { docType: 'RSR_PERMIT' } });
  });
  it('rejects a window that ends before it starts', async () => {
    const h = make();
    await expect(h.svc.createDoc('A', docDto({ validUntil: at(-20).toISOString() }), MANAGER)).rejects.toThrow(/validUntil cannot be before validFrom/);
  });
  it('verification is an authorised representative\'s attestation', async () => {
    const h = make();
    const [doc] = h.seedDocs('A', ['RSR_PERMIT'], { status: 'PENDING_REVIEW' });
    await expect(h.svc.verifyDoc('A', doc.id, DISPATCHER, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    const v: any = await h.svc.verifyDoc('A', doc.id, MANAGER, NOW);
    expect(v).toMatchObject({ status: 'VALID', verifiedById: 'u-mgr', verifiedByEmail: 'mia@toc.co.za', effectiveStatus: 'VALID' });
    await expect(h.svc.verifyDoc('A', doc.id, MANAGER, NOW)).rejects.toThrow(/already verified/);
  });
  it('an expired or revoked document cannot be verified — enter the renewal', async () => {
    const h = make();
    const [expired] = h.seedDocs('A', ['RSR_PERMIT'], { status: 'PENDING_REVIEW', validUntil: at(-1) });
    const [revoked] = h.seedDocs('A', ['INSURANCE'], { status: 'REVOKED' });
    await expect(h.svc.verifyDoc('A', expired.id, MANAGER, NOW)).rejects.toThrow(/expired document cannot be verified/);
    await expect(h.svc.verifyDoc('A', revoked.id, MANAGER, NOW)).rejects.toThrow(/revoked document cannot be verified/);
  });
  it('revocation needs a signatory and a reason, and takes effect immediately', async () => {
    const h = make();
    const [doc] = h.seedDocs('A', ['RSR_PERMIT']);
    await expect(h.svc.revokeDoc('A', doc.id, { reason: 'permit suspended by RSR' }, DISPATCHER, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    const r: any = await h.svc.revokeDoc('A', doc.id, { reason: 'permit suspended by RSR' }, MANAGER, NOW);
    expect(r).toMatchObject({ status: 'REVOKED', effectiveStatus: 'REVOKED', revokedReason: 'permit suspended by RSR' });
    expect((await h.svc.complianceSummary('A', NOW)).rsrPermit.level).toBe('EXPIRED');
    await expect(h.svc.revokeDoc('A', doc.id, { reason: 'again' }, MANAGER, NOW)).rejects.toThrow(/already revoked/);
  });
  it('listing shows the EFFECTIVE status: a stale VALID flag reads EXPIRED', async () => {
    const h = make();
    h.seedDocs('A', ['INSURANCE'], { status: 'VALID', validUntil: at(-1) });
    expect(((await h.svc.listDocs('A', NOW))[0] as any).effectiveStatus).toBe('EXPIRED');
  });
  it('every document carries a server-computed daysRemaining (negative once expired)', async () => {
    const h = make();
    h.seedDocs('A', ['INSURANCE'], { validUntil: at(12) });
    h.seedDocs('A', ['RSR_PERMIT'], { validUntil: at(-3) });
    const byType = Object.fromEntries((await h.svc.listDocs('A', NOW)).map((d: any) => [d.docType, d.daysRemaining]));
    expect(byType).toEqual({ INSURANCE: 12, RSR_PERMIT: -3 });
  });
  it('the summary carries the RSR guard and both gates', async () => {
    const h = make();
    h.seedDocs('A', REQUIRED_DOCS_SUBMIT.filter((t) => t !== 'RSR_PERMIT'));
    h.seedDocs('A', ['RSR_PERMIT'], { validUntil: at(12) });
    const s = await h.svc.complianceSummary('A', NOW);
    expect(s.rsrPermit.level).toBe('WARNING');
    expect(s.submit.ok).toBe(true);
    expect(s.operate.ok).toBe(false);
    expect(s.submitWithDangerousGoods.missing).toEqual(['DANGEROUS_GOODS']);
  });
  it('the expiry sweep persists EXPIRED once and audits it as the system', async () => {
    const h = make();
    h.seedDocs('T1', ['INSURANCE'], { status: 'VALID', validUntil: at(-2) });
    h.seedDocs('T1', ['RSR_PERMIT'], { status: 'VALID', validUntil: at(40) });
    expect(await h.svc.runComplianceExpirySweep(NOW)).toEqual({ expired: 1 });
    expect(h.docs.rows.map((d) => `${d.docType}:${d.status}`).sort()).toEqual(['INSURANCE:EXPIRED', 'RSR_PERMIT:VALID']);
    expect(h.entries()[0]).toMatchObject({ action: 'compliance_doc.expired', actorType: 'system', metadata: { companyId: 'T1', docType: 'INSURANCE' } });
    expect(await h.svc.runComplianceExpirySweep(NOW)).toEqual({ expired: 0 });
  });
  it('a document valid THROUGH today is not swept', async () => {
    const h = make();
    h.seedDocs('A', ['INSURANCE'], { status: 'VALID', validUntil: new Date('2026-10-02T00:00:00Z') });
    expect(await h.svc.runComplianceExpirySweep(NOW)).toEqual({ expired: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('overview', () => {
  it('summarises applications, the clocks needing attention, the RSR guard and the reference completeness', async () => {
    const h = make();
    h.seedApp({ status: 'DRAFT' });
    h.seedApp({ status: 'ALLOCATED', allocatedAt: at(-50), mobilizeBy: at(10), applicationNumber: 'SA-DUE' });
    h.seedApp({ status: 'ALLOCATED', allocatedAt: at(-70), mobilizeBy: at(-10), forfeitureFlaggedAt: at(-9), applicationNumber: 'SA-FLAG' });
    h.seedApp({ status: 'ALLOCATED', allocatedAt: at(-1), mobilizeBy: at(59), applicationNumber: 'SA-OK' });
    h.seedApp({ companyId: 'B', status: 'ALLOCATED', mobilizeBy: at(2) }); // another tenant — must not appear
    h.seedDocs('A', ['RSR_PERMIT'], { validUntil: at(20) });
    const o = await h.svc.overview('A', NOW);
    expect(o.applications.total).toBe(4);
    expect(o.applications.byStatus).toEqual({ DRAFT: 1, ALLOCATED: 3 });
    expect(o.applications.byMobilisationState).toMatchObject({ NOT_ALLOCATED: 1, DUE_SOON: 1, FORFEITURE_FLAGGED: 1, ON_TRACK: 1 });
    expect(o.applications.needingAttention.map((a: any) => a.applicationNumber).sort()).toEqual(['SA-DUE', 'SA-FLAG']);
    expect(o.compliance.rsrPermit.level).toBe('WARNING');
    expect(o.reference.corridors.expected).toBe(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('checkEnvelope (on-demand tool)', () => {
  it('computes axle load from tare, loaded weight and axle count for manual subjects', async () => {
    const h = make();
    h.corridors.seed(VERIFIED_ORE);
    const r: any = await h.svc.checkEnvelope('A', { corridorCode: 'COR-ORE', subjects: [{ label: 'W-1', gauge: 'CAPE_1067MM', tareTonnes: 25, loadedTonnes: 90, axles: 4 }] as any });
    expect(r).toMatchObject({ status: 'INCOMPATIBLE', source: 'MANUAL', corridor: { code: 'COR-ORE', dataStatus: 'VERIFIED' } });
    expect(r.violations[0]).toMatchObject({ code: 'AXLE_LOAD_EXCEEDED', actual: 28.75, limit: 26 });
  });
  it('checks a consignment\'s wagons, resolving its free-text corridor by name / alias / route', async () => {
    const h = make();
    h.corridors.seed(VERIFIED_ORE);
    const con = h.consignments.seed({ companyId: 'A', consignmentNumber: 'RAIL-2026-00001', corridor: 'Cape 2' });
    h.wagons.seed({ consignmentId: con.id, wagonNumber: 'W1', tareTonnes: 24, loadedTonnes: 70, axles: 4, gauge: 'CAPE_1067MM' });
    const r: any = await h.svc.checkEnvelope('A', { consignmentId: con.id });
    expect(r).toMatchObject({ status: 'COMPATIBLE', source: 'CONSIGNMENT', corridor: { code: 'COR-ORE' }, consignment: { consignmentNumber: 'RAIL-2026-00001', wagons: 1 } });
  });
  it('an unrecognised corridor is UNVERIFIED — never guessed', async () => {
    const h = make();
    const con = h.consignments.seed({ companyId: 'A', consignmentNumber: 'RAIL-2026-00002', corridor: 'Coal Line' });
    h.wagons.seed({ consignmentId: con.id, wagonNumber: 'W1', tareTonnes: 24, loadedTonnes: 70, axles: 4, gauge: 'CAPE_1067MM' });
    const r: any = await h.svc.checkEnvelope('A', { consignmentId: con.id });
    expect(r).toMatchObject({ status: 'UNVERIFIED', corridor: null, corridorQuery: 'Coal Line' });
  });
  it('needs something to check', async () => {
    const h = make();
    await expect(h.svc.checkEnvelope('A', {})).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('corridor capacity — the gap that used to be a free-text note', () => {
  /**
   * Slot applications ask for trainsPerWeek on a corridor and run through to
   * ALLOCATED, but nothing ever computed how much the corridor could carry: the
   * only signal a corridor was over-committed was `conflictNote`, written by a
   * human who happened to notice. Two applications could sit in ALLOCATED over
   * the same dates and nothing would object.
   *
   * The check is ADVISORY and must never block a submission — the IM decides
   * what is allocated, and applying for more than you expect to be granted is
   * legitimate. These tests pin that boundary as firmly as the arithmetic.
   */
  const window = { from: at(100), until: at(200) };

  it('says UNKNOWN rather than inventing a ceiling when no statement covers the period', async () => {
    const h = make();
    h.seedCapacity({ validFrom: at(0), validUntil: at(10) }); // does not overlap the window

    const r: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until);

    expect(r.status).toBe('UNKNOWN');
    expect(r.declaredPathsPerDay).toBeNull();
    expect(r.headroomPathsPerDay).toBeNull();
    expect(r.utilisation).toBeNull();
    expect(r.reason).toMatch(/No capacity statement covers/);
  });

  it('computes headroom from the practical figure, not the theoretical one', async () => {
    const h = make();
    // 20 theoretical x 0.65 = 13 practical. A demand of 7 trains/week = 1/day.
    h.seedCapacity({ validFrom: at(0), validUntil: at(365), theoreticalPathsPerDay: 20, capacityFactor: 0.65, practicalPathsPerDay: 13 });

    const r: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until, { trainsPerWeek: 7 });

    expect(r.declaredPathsPerDay).toBe(13);
    expect(r.demandPathsPerDay).toBe(1);
    expect(r.headroomPathsPerDay).toBe(12);
    expect(r.utilisation).toBeCloseTo(1 / 13, 5);
    expect(r.status).toBe('OK');
  });

  it('grades TIGHT above 90% utilisation and OVERSUBSCRIBED above 100%', async () => {
    const h = make();
    h.seedCapacity({ theoreticalPathsPerDay: 20, capacityFactor: 0.5, practicalPathsPerDay: 10 });

    const tight: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until, { trainsPerWeek: 65 });
    expect(tight.demandPathsPerDay).toBeCloseTo(65 / 7, 5); // ~9.29 of 10 → 92.9%
    expect(tight.status).toBe('TIGHT');

    const over: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until, { trainsPerWeek: 77 });
    expect(over.status).toBe('OVERSUBSCRIBED');
    expect(over.headroomPathsPerDay).toBeLessThan(0);
  });

  it('binds on the most restrictive statement when several cover the period', async () => {
    const h = make();
    h.seedCapacity({ validFrom: at(0), validUntil: at(150), practicalPathsPerDay: 20 });
    h.seedCapacity({ validFrom: at(151), validUntil: at(400), practicalPathsPerDay: 4 });

    const r: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until, { trainsPerWeek: 7 });

    // The corridor is only as strong as its weakest overlapping period.
    expect(r.declaredPathsPerDay).toBe(4);
    expect(r.statements.filter((s: any) => s.binding)).toHaveLength(1);
    expect(r.statements.find((s: any) => s.binding).practicalPathsPerDay).toBe(4);
  });

  it('counts ALLOCATED applications as committed and ignores DRAFT ones', async () => {
    const h = make();
    h.seedCapacity({ practicalPathsPerDay: 10 });
    h.seedApp({ status: 'ALLOCATED', trainsPerWeek: 21, requestedFrom: at(100), requestedUntil: at(200), validFrom: null, validUntil: null });
    h.seedApp({ status: 'DRAFT', trainsPerWeek: 21, requestedFrom: at(100), requestedUntil: at(200), validFrom: null, validUntil: null });

    const r: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until);

    expect(r.committedPathsPerDay).toBe(3); // 21/week = 3/day, ALLOCATED only
    expect(r.contributing).toHaveLength(1);
    expect(r.contributing[0].status).toBe('ALLOCATED');
  });

  it('separates what has been granted from what is merely being asked for', async () => {
    const h = make();
    h.seedCapacity({ practicalPathsPerDay: 10 });
    h.seedApp({ status: 'ALLOCATED', trainsPerWeek: 14, requestedFrom: at(100), requestedUntil: at(200) });
    h.seedApp({ status: 'SUBMITTED', trainsPerWeek: 14, requestedFrom: at(100), requestedUntil: at(200) });

    const r: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until);

    expect(r.committedPathsPerDay).toBe(2);
    expect(r.pendingPathsPerDay).toBe(2);
    expect(r.demandPathsPerDay).toBe(4);
  });

  it('ignores applications whose window does not overlap the period asked about', async () => {
    const h = make();
    h.seedCapacity({ practicalPathsPerDay: 10 });
    h.seedApp({ status: 'ALLOCATED', trainsPerWeek: 70, requestedFrom: at(0), requestedUntil: at(50) }); // ends before the window

    const r: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until);

    expect(r.committedPathsPerDay).toBe(0);
  });

  it('prefers the allocated window over the requested one once the IM has granted it', async () => {
    const h = make();
    h.seedCapacity({ practicalPathsPerDay: 10 });
    // Requested a year, but the IM only granted the first month — that is what consumes capacity.
    h.seedApp({ status: 'ALLOCATED', trainsPerWeek: 70, requestedFrom: at(0), requestedUntil: at(365), validFrom: at(0), validUntil: at(30) });

    const r: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until);

    expect(r.committedPathsPerDay).toBe(0);
  });

  it('surfaces overlapping possessions but never nets them off the ceiling', async () => {
    /**
     * How much a possession actually costs depends on whether it is a full
     * closure or single-line working. Inventing a factor would be a guess
     * dressed up as arithmetic, so the possession is reported and the operator
     * judges it.
     */
    const h = make();
    h.seedCapacity({ practicalPathsPerDay: 10 });
    h.possessions.seed({ companyId: 'A', corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN', status: 'PLANNED', title: 'Sishen–Saldanha relaying', startsAt: at(120), endsAt: at(140) });
    h.possessions.seed({ companyId: 'A', corridorCode: 'COR-ORE', kind: 'ANNUAL_PLAN', status: 'COMPLETED', title: 'Done last year', startsAt: at(0), endsAt: at(5) });

    const r: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until);

    expect(r.possessions.map((p: any) => p.title)).toEqual(['Sishen–Saldanha relaying']);
    // The ceiling AND the headroom are unchanged — the possession is
    // information, not a deduction. Pin headroom specifically: subtracting a
    // possession from the arithmetic would be a guess dressed as a number, and
    // it is the kind of change that looks like an improvement.
    expect(r.declaredPathsPerDay).toBe(10);
    expect(r.headroomPathsPerDay).toBe(10);
  });

  it('never counts another tenant\'s applications', async () => {
    const h = make();
    h.seedCapacity({ practicalPathsPerDay: 10 });
    h.seedApp({ companyId: 'B', status: 'ALLOCATED', trainsPerWeek: 700, requestedFrom: at(100), requestedUntil: at(200) });

    const r: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until);

    expect(r.committedPathsPerDay).toBe(0);
    expect(r.contributing).toHaveLength(0);
  });

  it('converts a TRAINS_PER_WEEK statement to paths per day', async () => {
    const h = make();
    h.seedCapacity({ unit: 'TRAINS_PER_WEEK', practicalPathsPerDay: 70 });

    const r: any = await h.svc.capacityPreview('A', 'COR-ORE', window.from, window.until);

    expect(r.declaredPathsPerDay).toBe(10);
  });

  // ── writing the ledger ────────────────────────────────────────────────────

  it('derives the practical figure server-side and will not accept it from the caller', async () => {
    const h = make();
    const saved: any = await h.svc.upsertCapacity('A', {
      corridorCode: 'COR-ORE', validFrom: at(0).toISOString(), validUntil: at(365).toISOString(),
      theoreticalPathsPerDay: 20,
      // A caller who also sends a contradictory practical figure is ignored.
      ...{ practicalPathsPerDay: 999 } as any,
    } as any, MANAGER);

    expect(saved.practicalPathsPerDay).toBe(13); // 20 x 0.65, not 999
    expect(saved.capacityFactor).toBe(0.65);
  });

  it('honours a stated capacity factor and keeps it auditable', async () => {
    const h = make();
    const saved: any = await h.svc.upsertCapacity('A', {
      corridorCode: 'COR-ORE', validFrom: at(0).toISOString(), validUntil: at(365).toISOString(),
      theoreticalPathsPerDay: 20, capacityFactor: 0.8,
    } as any, MANAGER);

    expect(saved.capacityFactor).toBe(0.8);
    expect(saved.practicalPathsPerDay).toBe(16);
  });

  it('replaces the statement for the same corridor and period instead of stacking', async () => {
    const h = make();
    await h.svc.upsertCapacity('A', { corridorCode: 'COR-ORE', validFrom: at(0).toISOString(), validUntil: at(365).toISOString(), theoreticalPathsPerDay: 20 } as any, MANAGER);
    await h.svc.upsertCapacity('A', { corridorCode: 'COR-ORE', validFrom: at(0).toISOString(), validUntil: at(365).toISOString(), theoreticalPathsPerDay: 30 } as any, MANAGER);

    expect(h.capacity.rows).toHaveLength(1);
    expect(h.capacity.rows[0].theoreticalPathsPerDay).toBe(30);
  });

  it('refuses a period that ends before it starts, and an unknown corridor', async () => {
    const h = make();
    await expect(h.svc.upsertCapacity('A', {
      corridorCode: 'COR-ORE', validFrom: at(100).toISOString(), validUntil: at(50).toISOString(), theoreticalPathsPerDay: 20,
    } as any, MANAGER)).rejects.toThrow(/validUntil must be after validFrom/);

    await expect(h.svc.upsertCapacity('A', {
      corridorCode: 'COR-NOPE', validFrom: at(0).toISOString(), validUntil: at(10).toISOString(), theoreticalPathsPerDay: 20,
    } as any, MANAGER)).rejects.toThrow(/Unknown corridor/);
    expect(h.capacity.rows).toHaveLength(0);
  });

  it('records who stated the capacity and where it came from', async () => {
    const h = make();
    const saved: any = await h.svc.upsertCapacity('A', {
      corridorCode: 'COR-ORE', validFrom: at(0).toISOString(), validUntil: at(365).toISOString(),
      theoreticalPathsPerDay: 20, sourceRef: 'Annexure 33b Capacity_DB FY2026/27', dataStatus: 'VERIFIED',
    } as any, MANAGER);

    expect(h.actions()).toContain('corridor_capacity.set');
    const entry = h.entries().find((e: any) => e.action === 'corridor_capacity.set');
    expect(entry.actorEmail).toBe('mia@toc.co.za');
    expect(entry.targetType).toBe('rail_corridor_capacity');
    expect(entry.targetId).toBe(saved.id);
  });

  it('cannot delete another tenant\'s statement', async () => {
    const h = make();
    const other = h.capacity.seed({ companyId: 'B', corridorCode: 'COR-ORE', validFrom: at(0), validUntil: at(365), theoreticalPathsPerDay: 20, practicalPathsPerDay: 13, unit: 'PATHS_PER_DAY' });

    await expect(h.svc.deleteCapacity('A', other.id, MANAGER)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.capacity.rows).toHaveLength(1);
  });

  // ── the advisory boundary ─────────────────────────────────────────────────

  it('snapshots the capacity picture at submission', async () => {
    const h = make();
    h.seedCapacity({ practicalPathsPerDay: 10 });
    const app = h.draftReady({ trainsPerWeek: 21, requestedFrom: at(100), requestedUntil: at(200) });

    await h.svc.submit('A', app.id, MANAGER, NOW);

    expect(h.apps.rows[0].capacityCheckStatus).toBe('OK');
    expect(h.apps.rows[0].capacityCheck.demandPathsPerDay).toBe(3);
  });

  it('does NOT block submission when the corridor is already over-subscribed', async () => {
    /**
     * The whole point of the boundary. The infrastructure manager decides what
     * is allocated; an operator applying for more than they expect to be
     * granted is behaving rationally, not wrongly. FlowOps records and
     * surfaces — it does not refuse.
     */
    const h = make();
    h.seedCapacity({ practicalPathsPerDay: 2 }); // almost nothing left
    h.seedApp({ status: 'ALLOCATED', trainsPerWeek: 70, requestedFrom: at(100), requestedUntil: at(200) });
    const app = h.draftReady({ trainsPerWeek: 70, requestedFrom: at(100), requestedUntil: at(200) });

    const out: any = await h.svc.submit('A', app.id, MANAGER, NOW);

    expect(out.application.status).toBe('SUBMITTED');
    expect(out.application.capacityCheckStatus).toBe('OVERSUBSCRIBED');
    expect(out.readiness.blockers).toHaveLength(0);
  });

  it('reports the capacity picture through readiness so it is visible before submitting', async () => {
    const h = make();
    h.seedCapacity({ practicalPathsPerDay: 10 });
    const app = h.draftReady({ trainsPerWeek: 21, requestedFrom: at(100), requestedUntil: at(200) });

    const r: any = await h.svc.readiness('A', app.id, NOW);

    expect(r.capacity.status).toBe('OK');
    expect(r.capacity.corridorCode).toBe('COR-ORE');
  });
});
