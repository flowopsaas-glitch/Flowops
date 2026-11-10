/**
 * Safety / security occurrence reports (derailment, collision, OHTE / cable theft, SPAD, hazmat spill …) linked to a
 * Daily Handshake deviation AND to the audit_logs row — Wave 3 service behaviour. Prisma is an in-memory fake.
 *
 * The 48-hour preliminary-report deadline and the TCO / Regulator notification chain come from register R-015.1 / R-015.5;
 * Annexures 36 / 41, which define them, were not supplied, so those rules are marked unverified in the audit ledger.
 */
import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FakeTable, snapshot } from '../../test/support/in-memory-db';
import { PRELIMINARY_REPORT_HOURS, RailOccurrenceService } from './rail-occurrence.service';
import { RailActor, RAIL_AUDIT_ACTION } from './rail-audit';

const HOUR = 3_600_000;
const MIN = 60_000;
const NOW = new Date('2026-10-02T10:00:00.000Z');
const atH = (h: number) => new Date(NOW.getTime() + h * HOUR);
const year = new Date().getFullYear();

const MANAGER: RailActor = { id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: UserRole.MANAGER };
const DISPATCHER: RailActor = { id: 'u-dsp', email: 'dan@toc.co.za', name: 'Dan Dispatch', role: UserRole.DISPATCH };

function make(opts: { entitled?: boolean; auditResult?: string | null } = {}) {
  // `defaults` mimic the database: a nullable column that was never written reads back as NULL, not undefined.
  const occurrences = new FakeTable('or', {
    unique: [['companyId', 'occurrenceNumber']],
    defaults: () => ({
      status: 'REPORTED', corridorCode: null, location: null, trainSlotRef: null, consignmentId: null, deviationId: null, auditLogId: null,
      reportedToTcoAt: null, reportedToRsrAt: null, preliminaryReportDueAt: null, preliminaryReportFiledAt: null, investigationNote: null, closedAt: null,
      createdById: null, createdByEmail: null,
    }),
  });
  const consignments = new FakeTable('con');
  const reports = new FakeTable('hr');
  // withTenant is the tenant-context wrapper the service runs writes through.
  // In memory there is no transaction to open, so it just hands back the same
  // delegates — the service's logic is what these tests are checking, not the
  // transaction. What matters is that the CAS in the WHERE clause still runs.
  const prisma: Record<string, any> = {
    railOccurrenceReport: occurrences,
    railConsignment: consignments,
    railHandshakeReport: reports,
  };
  prisma.withTenant = async (_companyId: string, fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  const billing = { hasFeature: jest.fn().mockResolvedValue(opts.entitled ?? true) };
  const audit = { record: jest.fn().mockResolvedValue(opts.auditResult === undefined ? 'audit-1' : opts.auditResult) };
  const handshake = { logDeviation: jest.fn(async () => ({ id: 'dev-1' })) };
  const svc = new RailOccurrenceService(prisma as any, billing as any, audit as any, handshake as any);

  const seedOccurrence = (over: Record<string, any> = {}) =>
    occurrences.seed({
      companyId: 'A', occurrenceNumber: `OR-T-${occurrences.rows.length + 1}`, type: 'DERAILMENT', level: 'LEVEL_2_CODE_ORANGE', status: 'REPORTED',
      occurredAt: atH(-2), description: 'Derailment at km 120', responsibleParty: 'UNDETERMINED', fatalities: false, hazmatInvolved: false,
      reportedToTcoAt: null, reportedToRsrAt: null, preliminaryReportDueAt: atH(46), preliminaryReportFiledAt: null, investigationNote: null,
      closedAt: null, deviationId: null, auditLogId: null, ...over,
    });
  const actions = () => audit.record.mock.calls.map(([e]) => e.action);
  const entries = () => audit.record.mock.calls.map(([e]) => e);
  return { svc, prisma, billing, audit, handshake, occurrences, consignments, reports, seedOccurrence, actions, entries };
}
type H = ReturnType<typeof make>;

const body = (over: Record<string, any> = {}) => ({
  type: 'DERAILMENT', level: 'LEVEL_2_CODE_ORANGE', occurredAt: atH(-1).toISOString(), description: '  Derailment of 3 wagons at km 120  ', ...over,
});

afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
describe('entitlement', () => {
  it('every public method is refused without the `rail` feature, before any data access', async () => {
    const h = make({ entitled: false });
    const s = h.svc;
    const calls: Array<() => Promise<unknown>> = [
      () => s.list('A'), () => s.get('A', 'x'), () => s.create('A', body() as any, MANAGER), () => s.notify('A', 'x', { to: 'TCO' }, MANAGER),
      () => s.startInvestigation('A', 'x', { note: 'abc' }, MANAGER), () => s.filePreliminary('A', 'x', { note: 'abc' }, MANAGER), () => s.close('A', 'x', { note: 'abc' }, MANAGER),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.billing.hasFeature).toHaveBeenCalledTimes(calls.length);
    for (const t of [h.occurrences, h.consignments, h.reports]) for (const fn of t.fns) expect(fn).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
    expect(h.handshake.logDeviation).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('create', () => {
  it('records a REPORTED occurrence with the 48-hour preliminary-report deadline and links it to the audit_logs row', async () => {
    const h = make();
    const occurredAt = atH(-1);
    const out = await h.svc.create('A', body({ occurredAt: occurredAt.toISOString(), corridorCode: 'COR-ORE', location: 'Km 120', trainSlotRef: 'T-100' }) as any, MANAGER, NOW);
    expect(out).toMatchObject({
      companyId: 'A', occurrenceNumber: `OR-${year}-00001`, type: 'DERAILMENT', level: 'LEVEL_2_CODE_ORANGE', status: 'REPORTED',
      description: 'Derailment of 3 wagons at km 120', corridorCode: 'COR-ORE', location: 'Km 120', trainSlotRef: 'T-100',
      responsibleParty: 'UNDETERMINED', fatalities: false, hazmatInvolved: false, createdById: 'u-mgr', createdByEmail: 'mia@toc.co.za',
      preliminaryReportFiledAt: null, preliminaryReportOverdue: false,
    });
    expect(PRELIMINARY_REPORT_HOURS).toBe(48);
    expect(out.preliminaryReportDueAt).toEqual(new Date(occurredAt.getTime() + 48 * HOUR));
    expect(out.auditLogId).toBe('audit-1');
    expect(h.entries()).toHaveLength(1);
    expect(h.entries()[0]).toMatchObject({ action: RAIL_AUDIT_ACTION.OCCURRENCE_REPORTED, actorType: 'tenant', actorId: 'u-mgr', targetType: 'rail_occurrence_report', targetId: out.id, targetName: out.occurrenceNumber });
    expect(h.entries()[0].metadata).toMatchObject({ module: 'rail', companyId: 'A', type: 'DERAILMENT', level: 'LEVEL_2_CODE_ORANGE', corridorCode: 'COR-ORE', fatalities: false });
    // the link is persisted on the row, not just returned
    expect(h.occurrences.rows[0].auditLogId).toBe('audit-1');
  });

  it('a hazmat spill is by definition a hazmat occurrence — the caller cannot un-flag it; other types follow the flag', async () => {
    const h = make();
    expect((await h.svc.create('A', body({ type: 'HAZMAT_SPILL', hazmatInvolved: false }) as any, MANAGER, NOW)).hazmatInvolved).toBe(true);
    expect((await h.svc.create('A', body({ type: 'DERAILMENT', hazmatInvolved: true }) as any, MANAGER, NOW)).hazmatInvolved).toBe(true);
    expect((await h.svc.create('A', body({ type: 'COLLISION' }) as any, MANAGER, NOW)).hazmatInvolved).toBe(false);
  });

  it('keeps the severity facts the reporter gave: fatalities and responsible party', async () => {
    const h = make();
    const out = await h.svc.create('A', body({ fatalities: true, responsibleParty: 'TRIM', level: 'LEVEL_3_CODE_RED' }) as any, MANAGER, NOW);
    expect(out).toMatchObject({ fatalities: true, responsibleParty: 'TRIM', level: 'LEVEL_3_CODE_RED' });
  });

  it('numbers occurrences per tenant and survives a number collision by retrying', async () => {
    const h = make();
    expect((await h.svc.create('B', body() as any, MANAGER, NOW)).occurrenceNumber).toBe(`OR-${year}-00001`);
    expect((await h.svc.create('A', body() as any, MANAGER, NOW)).occurrenceNumber).toBe(`OR-${year}-00001`);
    h.occurrences.count.mockResolvedValueOnce(0); // a racing request counted before the first committed
    expect((await h.svc.create('A', body() as any, MANAGER, NOW)).occurrenceNumber).toBe(`OR-${year}-00002`);
    expect(h.occurrences.rows.filter((r) => r.companyId === 'A')).toHaveLength(2);
  });

  it('rejects an unparseable time, and a time that has not happened yet (a few minutes of clock skew are tolerated)', async () => {
    const h = make();
    await expect(h.svc.create('A', body({ occurredAt: 'yesterday-ish' }) as any, MANAGER, NOW)).rejects.toThrow(/occurredAt must be a valid date/);
    await expect(h.svc.create('A', body({ occurredAt: new Date(NOW.getTime() + 10 * MIN).toISOString() }) as any, MANAGER, NOW)).rejects.toThrow(/occurredAt cannot be in the future/);
    expect(h.occurrences.rows).toHaveLength(0);
    const skew = await h.svc.create('A', body({ occurredAt: new Date(NOW.getTime() + 4 * MIN).toISOString() }) as any, MANAGER, NOW);
    expect(skew.status).toBe('REPORTED');
  });

  it('refuses a consignment / handshake report that belongs to another tenant — and writes nothing', async () => {
    const h = make();
    const foreignCon = h.consignments.seed({ companyId: 'B' });
    const foreignReport = h.reports.seed({ companyId: 'B', status: 'DRAFT' });
    await expect(h.svc.create('A', body({ consignmentId: foreignCon.id }) as any, MANAGER, NOW)).rejects.toThrow(/consignmentId does not belong to this tenant/);
    await expect(h.svc.create('A', body({ handshakeReportId: foreignReport.id }) as any, MANAGER, NOW)).rejects.toThrow(/handshakeReportId does not belong to this tenant/);
    expect(h.occurrences.rows).toHaveLength(0);
    expect(h.handshake.logDeviation).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('refuses to log into a handshake report that is already signed — before saving anything', async () => {
    const h = make();
    const signed = h.reports.seed({ companyId: 'A', status: 'SIGNED_OFF' });
    await expect(h.svc.create('A', body({ handshakeReportId: signed.id }) as any, MANAGER, NOW)).rejects.toThrow(/cannot be logged while the handshake report is SIGNED_OFF/);
    expect(h.occurrences.rows).toHaveLength(0);
  });

  describe('link to the Daily Handshake deviation', () => {
    it.each([
      ['DERAILMENT', 'OTHER'], ['COLLISION', 'OPERATIONAL'], ['OHTE_CABLE_THEFT', 'SECURITY'], ['SPAD', 'OPERATIONAL'], ['HAZMAT_SPILL', 'OTHER'], ['OTHER', 'OTHER'],
    ])('a %s is logged as a "%s" deviation, keyed by the occurrence number, and the link is saved on the row', async (type, category) => {
      const h = make();
      const report = h.reports.seed({ companyId: 'A', status: 'DRAFT' });
      const out = await h.svc.create('A', body({ type, handshakeReportId: report.id, location: 'Km 120', trainSlotRef: 'T-100' }) as any, MANAGER, NOW);
      expect(h.handshake.logDeviation).toHaveBeenCalledTimes(1);
      const [companyId, reportId, dto, actor] = h.handshake.logDeviation.mock.calls[0] as unknown as [string, string, any, RailActor];
      expect([companyId, reportId, actor]).toEqual(['A', report.id, MANAGER]);
      expect(dto).toMatchObject({ trainSlotRef: 'T-100', orderNumber: out.occurrenceNumber, category, location: 'Km 120', responsibleParty: 'UNDETERMINED' });
      expect(dto.reason).toContain(out.occurrenceNumber);
      expect(out).toMatchObject({ deviationId: 'dev-1', auditLogId: 'audit-1' });
      expect(h.entries()[0].metadata).toMatchObject({ deviationId: 'dev-1' });
    });

    it('falls back to the occurrence number as the slot reference when no train was named', async () => {
      const h = make();
      const report = h.reports.seed({ companyId: 'A', status: 'PENDING_TOC' });
      const out = await h.svc.create('A', body({ handshakeReportId: report.id }) as any, MANAGER, NOW);
      expect((h.handshake.logDeviation.mock.calls[0] as any)[2].trainSlotRef).toBe(out.occurrenceNumber);
    });

    it.each([['TRIM', 'IM'], ['TOC', 'THIS_TOC'], ['FORCE_MAJEURE', 'FORCE_MAJEURE'], ['UNDETERMINED', 'UNDETERMINED']])(
      'responsible party %s is passed to the handshake as %s', async (party, mapped) => {
        const h = make();
        const report = h.reports.seed({ companyId: 'A', status: 'DRAFT' });
        await h.svc.create('A', body({ handshakeReportId: report.id, responsibleParty: party }) as any, MANAGER, NOW);
        expect((h.handshake.logDeviation.mock.calls[0] as any)[2].responsibleParty).toBe(mapped);
      });

    it('truncates a very long description in the deviation reason (the full text stays on the occurrence)', async () => {
      const h = make();
      const report = h.reports.seed({ companyId: 'A', status: 'DRAFT' });
      const long = 'x'.repeat(3000);
      const out = await h.svc.create('A', body({ handshakeReportId: report.id, description: long }) as any, MANAGER, NOW);
      expect((h.handshake.logDeviation.mock.calls[0] as any)[2].reason.length).toBeLessThan(400);
      expect(out.description).toHaveLength(3000);
    });

    it('does not touch the handshake when no report was named', async () => {
      const h = make();
      const out = await h.svc.create('A', body() as any, MANAGER, NOW);
      expect(h.handshake.logDeviation).not.toHaveBeenCalled();
      expect(out.deviationId).toBeNull();
    });
  });

  describe('the audit link is best-effort — a safety record must never be lost to a logging problem', () => {
    it('audit returns null (write failed) → the occurrence is still saved, just without an auditLogId; the deviation link is kept', async () => {
      const h = make({ auditResult: null });
      const report = h.reports.seed({ companyId: 'A', status: 'DRAFT' });
      const out = await h.svc.create('A', body({ handshakeReportId: report.id }) as any, MANAGER, NOW);
      expect(out.status).toBe('REPORTED');
      expect(out.auditLogId).toBeNull();
      expect(out.deviationId).toBe('dev-1');
      expect(h.occurrences.rows).toHaveLength(1);
    });

    it('audit throws outright → still saved (and the failure is logged, not swallowed silently)', async () => {
      const h = make();
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      h.audit.record.mockRejectedValueOnce(new Error('audit table locked'));
      const out = await h.svc.create('A', body() as any, MANAGER, NOW);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Rail audit write failed for occurrence.reported'));
      expect(out.status).toBe('REPORTED');
      expect(out.auditLogId).toBeNull();
      expect(h.occurrences.rows).toHaveLength(1);
    });

    it('no deviation and no audit id → no second write at all', async () => {
      const h = make({ auditResult: null });
      await h.svc.create('A', body() as any, MANAGER, NOW);
      expect(h.occurrences.update).not.toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('preliminary-report clock (overdue is computed from the clock, never stored)', () => {
  it.each([
    ['before the deadline', { preliminaryReportDueAt: atH(10) }, false],
    ['after the deadline, not filed', { preliminaryReportDueAt: atH(-1) }, true],
    ['after the deadline but filed', { preliminaryReportDueAt: atH(-1), preliminaryReportFiledAt: atH(-2), status: 'PRELIMINARY_REPORT_FILED' }, false],
    ['after the deadline but closed', { preliminaryReportDueAt: atH(-1), status: 'CLOSED' }, false],
    ['no deadline recorded', { preliminaryReportDueAt: null }, false],
  ])('%s → overdue: %s', async (_label, patch, overdue) => {
    const h = make();
    const o = h.seedOccurrence(patch);
    const rows = await h.svc.list('A', {}, NOW);
    expect(rows.find((r: any) => r.id === o.id)!.preliminaryReportOverdue).toBe(overdue);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('list / get', () => {
  it('returns only the caller\'s occurrences, latest event first, filterable by status', async () => {
    const h = make();
    const older = h.seedOccurrence({ occurredAt: atH(-30) });
    const newer = h.seedOccurrence({ occurredAt: atH(-3), status: 'UNDER_INVESTIGATION' });
    h.seedOccurrence({ companyId: 'B' });
    expect((await h.svc.list('A', {}, NOW)).map((r: any) => r.id)).toEqual([newer.id, older.id]);
    expect((await h.svc.list('A', { status: 'UNDER_INVESTIGATION' }, NOW)).map((r: any) => r.id)).toEqual([newer.id]);
    expect(await h.svc.list('C', {}, NOW)).toEqual([]);
  });

  it('get is tenant-scoped', async () => {
    const h = make();
    const o = h.seedOccurrence();
    expect((await h.svc.get('A', o.id)).id).toBe(o.id);
    await expect(h.svc.get('B', o.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('tenant isolation of the workflow', () => {
  it('tenant B can neither notify, investigate, file nor close tenant A\'s occurrence — nothing changes, nothing is audited', async () => {
    const h = make();
    const o = h.seedOccurrence({ status: 'UNDER_INVESTIGATION', preliminaryReportFiledAt: atH(-1) });
    const before = snapshot(h.occurrences);
    const s = h.svc;
    const attempts = [
      s.notify('B', o.id, { to: 'TCO' }, MANAGER, NOW), s.startInvestigation('B', o.id, { note: 'abc' }, MANAGER, NOW),
      s.filePreliminary('B', o.id, { note: 'abc' }, MANAGER, NOW), s.close('B', o.id, { note: 'abc' }, MANAGER, NOW),
    ];
    for (const a of attempts) await expect(a).rejects.toBeInstanceOf(NotFoundException);
    expect(snapshot(h.occurrences)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('notify — the TCO immediately, the Regulator when required (R-015.1)', () => {
  it('records the TCO notification at the given time and reports how many minutes after the event it was', async () => {
    const h = make();
    const o = h.seedOccurrence({ occurredAt: atH(-1) });
    const at = new Date(NOW.getTime() - 40 * MIN); // 20 min after the event
    const out = await h.svc.notify('A', o.id, { to: 'TCO', at: at.toISOString() }, MANAGER, NOW);
    expect(out.reportedToTcoAt).toEqual(at);
    expect(out.reportedToRsrAt).toBeNull();
    expect(h.entries()[0]).toMatchObject({ action: RAIL_AUDIT_ACTION.OCCURRENCE_NOTIFIED, actorId: 'u-mgr' });
    expect(h.entries()[0].metadata).toMatchObject({ to: 'TCO', minutesAfterOccurrence: 20 });
  });

  it('defaults to "now", and the Regulator is tracked separately from the TCO', async () => {
    const h = make();
    const o = h.seedOccurrence();
    const tco = await h.svc.notify('A', o.id, { to: 'TCO' }, MANAGER, NOW);
    expect(tco.reportedToTcoAt).toEqual(NOW);
    const rsr = await h.svc.notify('A', o.id, { to: 'RSR' }, MANAGER, NOW);
    expect(rsr).toMatchObject({ reportedToTcoAt: NOW, reportedToRsrAt: NOW });
  });

  it('a party can only be recorded as notified once — the first record stands', async () => {
    const h = make();
    const o = h.seedOccurrence();
    await h.svc.notify('A', o.id, { to: 'TCO' }, MANAGER, NOW);
    await expect(h.svc.notify('A', o.id, { to: 'TCO', at: atH(1).toISOString() }, MANAGER, new Date(NOW.getTime() + 2 * HOUR))).rejects.toThrow(/TCO has already been recorded as notified/);
    expect(h.occurrences.rows[0].reportedToTcoAt).toEqual(NOW);
    expect(h.audit.record).toHaveBeenCalledTimes(1);
  });

  it('rejects an unparseable time, a time in the future, and a closed occurrence', async () => {
    const h = make();
    const o = h.seedOccurrence();
    await expect(h.svc.notify('A', o.id, { to: 'RSR', at: 'noon' }, MANAGER, NOW)).rejects.toThrow(/at must be a valid date/);
    await expect(h.svc.notify('A', o.id, { to: 'RSR', at: atH(1).toISOString() }, MANAGER, NOW)).rejects.toThrow(/cannot be in the future/);
    const closed = h.seedOccurrence({ status: 'CLOSED' });
    await expect(h.svc.notify('A', closed.id, { to: 'RSR' }, MANAGER, NOW)).rejects.toThrow(/closed occurrence cannot be updated/);
    expect(h.occurrences.rows.every((r) => r.reportedToRsrAt === null)).toBe(true);
    expect(h.audit.record).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('investigation → preliminary report → close', () => {
  it('starts an investigation only from REPORTED, saving the note', async () => {
    const h = make();
    const o = h.seedOccurrence();
    const out = await h.svc.startInvestigation('A', o.id, { note: '  RSR inspector on site  ' }, MANAGER, NOW);
    expect(out).toMatchObject({ status: 'UNDER_INVESTIGATION', investigationNote: 'RSR inspector on site' });
    expect(h.actions()).toEqual([RAIL_AUDIT_ACTION.OCCURRENCE_INVESTIGATION_STARTED]);
    await expect(h.svc.startInvestigation('A', o.id, { note: 'again' }, MANAGER, NOW)).rejects.toThrow(/Only a REPORTED occurrence can move to UNDER_INVESTIGATION \(this one is UNDER_INVESTIGATION\)/);
  });

  it.each(['PRELIMINARY_REPORT_FILED', 'CLOSED'])('cannot start an investigation from %s', async (status) => {
    const h = make();
    const o = h.seedOccurrence({ status });
    await expect(h.svc.startInvestigation('A', o.id, { note: 'abc' }, MANAGER, NOW)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.occurrences.rows[0].status).toBe(status);
  });

  it.each(['REPORTED', 'UNDER_INVESTIGATION'])('files the preliminary report from %s, appending to the existing investigation note', async (status) => {
    const h = make();
    const o = h.seedOccurrence({ status, investigationNote: 'first note' });
    const out = await h.svc.filePreliminary('A', o.id, { note: 'Preliminary findings' }, MANAGER, NOW);
    expect(out).toMatchObject({ status: 'PRELIMINARY_REPORT_FILED', preliminaryReportFiledAt: NOW, investigationNote: 'first note\nPreliminary findings', preliminaryReportOverdue: false });
  });

  it('the audit entry says whether the report was filed LATE (after occurredAt + 48 h)', async () => {
    const h = make();
    const onTime = h.seedOccurrence({ preliminaryReportDueAt: atH(1) });
    const late = h.seedOccurrence({ preliminaryReportDueAt: atH(-1) });
    await h.svc.filePreliminary('A', onTime.id, { note: 'abc' }, MANAGER, NOW);
    await h.svc.filePreliminary('A', late.id, { note: 'abc' }, MANAGER, NOW);
    expect(h.entries().map((e) => [e.action, e.metadata.late])).toEqual([
      [RAIL_AUDIT_ACTION.OCCURRENCE_PRELIMINARY_FILED, false], [RAIL_AUDIT_ACTION.OCCURRENCE_PRELIMINARY_FILED, true],
    ]);
  });

  it.each(['PRELIMINARY_REPORT_FILED', 'CLOSED'])('cannot file a preliminary report while the occurrence is %s', async (status) => {
    const h = make();
    const o = h.seedOccurrence({ status });
    const before = snapshot(h.occurrences);
    await expect(h.svc.filePreliminary('A', o.id, { note: 'abc' }, MANAGER, NOW)).rejects.toThrow(new RegExp(`cannot be filed while the occurrence is ${status}`));
    expect(snapshot(h.occurrences)).toBe(before);
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  describe('close is a formal act', () => {
    it('a dispatcher is refused (authorised representatives only) and nothing changes', async () => {
      const h = make();
      const o = h.seedOccurrence({ status: 'PRELIMINARY_REPORT_FILED', preliminaryReportFiledAt: atH(-1) });
      const before = snapshot(h.occurrences);
      await expect(h.svc.close('A', o.id, { note: 'All actions complete' }, DISPATCHER, NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(snapshot(h.occurrences)).toBe(before);
      expect(h.audit.record).not.toHaveBeenCalled();
    });

    it('cannot close before the preliminary report is filed', async () => {
      const h = make();
      const o = h.seedOccurrence({ status: 'UNDER_INVESTIGATION' });
      await expect(h.svc.close('A', o.id, { note: 'done' }, MANAGER, NOW)).rejects.toThrow(/File the preliminary report before closing/);
      expect(h.occurrences.rows[0].status).toBe('UNDER_INVESTIGATION');
    });

    it('closes with a note, stamps closedAt, and an already-closed occurrence cannot be closed again', async () => {
      const h = make();
      const o = h.seedOccurrence({ status: 'PRELIMINARY_REPORT_FILED', preliminaryReportFiledAt: atH(-1), investigationNote: 'earlier' });
      const out = await h.svc.close('A', o.id, { note: 'All actions complete' }, MANAGER, NOW);
      expect(out).toMatchObject({ status: 'CLOSED', closedAt: NOW, investigationNote: 'earlier\nClosed: All actions complete', preliminaryReportOverdue: false });
      expect(h.entries()[0]).toMatchObject({ action: RAIL_AUDIT_ACTION.OCCURRENCE_CLOSED, actorId: 'u-mgr' });
      await expect(h.svc.close('A', o.id, { note: 'again' }, MANAGER, NOW)).rejects.toThrow(/already closed/);
      expect(h.audit.record).toHaveBeenCalledTimes(1);
    });
  });

  it('walks the whole happy path and leaves one audit entry per step', async () => {
    const h: H = make();
    const created = await h.svc.create('A', body() as any, MANAGER, NOW);
    await h.svc.notify('A', created.id, { to: 'TCO' }, MANAGER, NOW);
    await h.svc.startInvestigation('A', created.id, { note: 'investigating' }, MANAGER, NOW);
    await h.svc.filePreliminary('A', created.id, { note: 'prelim' }, MANAGER, NOW);
    const closed = await h.svc.close('A', created.id, { note: 'closed out' }, MANAGER, NOW);
    expect(closed.status).toBe('CLOSED');
    expect(h.actions()).toEqual([
      RAIL_AUDIT_ACTION.OCCURRENCE_REPORTED, RAIL_AUDIT_ACTION.OCCURRENCE_NOTIFIED, RAIL_AUDIT_ACTION.OCCURRENCE_INVESTIGATION_STARTED,
      RAIL_AUDIT_ACTION.OCCURRENCE_PRELIMINARY_FILED, RAIL_AUDIT_ACTION.OCCURRENCE_CLOSED,
    ]);
    expect(h.entries().every((e) => e.targetId === created.id && e.actorId === 'u-mgr')).toBe(true);
  });
});

/**
 * Concurrency on a safety register.
 *
 * These reports are regulatory records and the note is appended by
 * concatenating what is already there. Under the old check-then-write, two
 * people acting at once would each read the same row and both write — one
 * note lost, two audit entries for one event. The transitions now put the
 * expectation in the WHERE clause, so the database decides who won.
 *
 * Each test below lets the pre-check pass and then moves the row out from
 * under the write, which is exactly the interleaving the check cannot see.
 */
describe('transitions are claimed, not merely checked', () => {
  // Flips the row just before the write lands, after the pre-check has read it.
  const moveUnderneath = (h: H, table: any, mutate: (row: any) => void) => {
    const original = table.updateMany.getMockImplementation();
    let done = false;
    table.updateMany.mockImplementation(async (args: any) => {
      if (!done) { done = true; mutate(h.occurrences.rows[0]); }
      return original!(args);
    });
  };

  it('a second caller starting the investigation loses the claim instead of overwriting', async () => {
    const h = make();
    const o = h.seedOccurrence({ status: 'REPORTED' });

    // Another caller moves REPORTED -> UNDER_INVESTIGATION after we read it.
    moveUnderneath(h, h.occurrences, (row) => { row.status = 'UNDER_INVESTIGATION'; });

    await expect(
      h.svc.startInvestigation('A', o.id, { note: 'mine' }, MANAGER, NOW),
    ).rejects.toThrow(/someone else started the investigation/i);

    // The winner's state survives; the loser wrote nothing.
    expect(h.occurrences.rows[0].status).toBe('UNDER_INVESTIGATION');
    expect(h.occurrences.rows[0].investigationNote).not.toBe('mine');
  });

  it('a preliminary report is refused when the note changed underneath, rather than dropping it', async () => {
    const h = make();
    const o = h.seedOccurrence({ status: 'UNDER_INVESTIGATION', investigationNote: 'first note' });

    // Someone else appends to the note between our read and our write.
    moveUnderneath(h, h.occurrences, (row) => {
      row.investigationNote = 'first note\nother person note';
    });

    await expect(
      h.svc.filePreliminary('A', o.id, { note: 'my prelim' }, MANAGER, NOW),
    ).rejects.toThrow(/changed while the preliminary report was being filed/i);

    // The other person's note is intact — that is the whole point.
    expect(h.occurrences.rows[0].investigationNote).toBe('first note\nother person note');
    expect(h.occurrences.rows[0].status).toBe('UNDER_INVESTIGATION');
    expect(h.occurrences.rows[0].preliminaryReportFiledAt).toBeNull();
    // No audit entry: the filing did not happen.
    expect(h.actions()).not.toContain(RAIL_AUDIT_ACTION.OCCURRENCE_PRELIMINARY_FILED);
  });

  it('closing is refused when someone else closed it in the meantime', async () => {
    const h = make();
    const o = h.seedOccurrence({ status: 'PRELIMINARY_REPORT_FILED', preliminaryReportFiledAt: NOW });

    moveUnderneath(h, h.occurrences, (row) => { row.status = 'CLOSED'; });

    await expect(
      h.svc.close('A', o.id, { note: 'closing too' }, MANAGER, NOW),
    ).rejects.toThrow(/closed by someone else/i);
    expect(h.actions()).not.toContain(RAIL_AUDIT_ACTION.OCCURRENCE_CLOSED);
  });

  it('appends to an existing note in the happy path (proving the CAS is not just refusing everything)', async () => {
    const h = make();
    const o = h.seedOccurrence({ status: 'UNDER_INVESTIGATION', investigationNote: 'first note' });

    const filed = await h.svc.filePreliminary('A', o.id, { note: 'my prelim' }, MANAGER, NOW);

    expect(filed.status).toBe('PRELIMINARY_REPORT_FILED');
    expect(filed.investigationNote).toBe('first note\nmy prelim');
  });
});
