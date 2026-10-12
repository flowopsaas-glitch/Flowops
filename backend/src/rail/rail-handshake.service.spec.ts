/**
 * Daily Handshake service — Wave 1.
 *
 * Covers: tenant isolation, the `rail` entitlement gate, the 24h/48h/72h/Regulator
 * escalation math, verified-signatory binding, state-machine guards and the
 * audit trail. Prisma is replaced by a small in-memory fake so isolation is
 * tested by BEHAVIOUR (tenant B really cannot see tenant A's rows), not just by
 * asserting which arguments were passed.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DeviationStatus, EscalationStage, HandshakeReportStatus, UserRole,
} from '@prisma/client';
import { RailHandshakeService } from './rail-handshake.service';
import { RailActor } from './rail-audit';
import { RAIL_AUDIT_ACTION } from './rail-audit';
import { RAIL_SIGNATORY_ROLES } from './rail-roles';

const H = 3_600_000;
const NOW = new Date('2026-10-02T12:00:00.000Z').getTime();

const MANAGER: RailActor = { id: 'u-mgr', email: 'mia@toc.co.za', name: 'Mia Manager', role: UserRole.MANAGER };
const DISPATCHER: RailActor = { id: 'u-dsp', email: 'dan@toc.co.za', name: 'Dan Dispatch', role: UserRole.DISPATCH };

type Row = Record<string, any>;

// ── In-memory Prisma fake ─────────────────────────────────────────────────────

function makeDb() {
  const db = { reports: [] as Row[], deviations: [] as Row[], consignments: [] as Row[], seq: 0 };
  const id = (p: string) => `${p}-${++db.seq}`;

  /** Evaluate the subset of Prisma `where` the service uses. */
  const matches = (row: Row, where: Row = {}, relations: Record<string, (r: Row) => Row | undefined> = {}): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true;
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('in' in cond) return cond.in.includes(row[key]);
        if ('gte' in cond) return row[key] >= cond.gte;
        if ('contains' in cond) return String(row[key] ?? '').toLowerCase().includes(String(cond.contains).toLowerCase());
        if (relations[key]) {
          const related = relations[key](row);
          return !!related && matches(related, cond);
        }
      }
      return row[key] === cond;
    });

  const reportOf = (dev: Row) => db.reports.find((r) => r.id === dev.reportId);
  // Like a real database, hand back COPIES: a later update must not mutate objects the caller already holds.
  const withDeviations = (rep: Row) => ({
    ...rep,
    deviations: db.deviations
      .filter((d) => d.reportId === rep.id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((d) => ({ ...d })),
  });

  const prisma = {
    $transaction: async (fn: any) => fn(prisma),
    withTenant: async (_companyId: string, fn: any, _opts?: any) => fn(prisma),
    railHandshakeReport: {
      count: jest.fn(async ({ where }: any) => db.reports.filter((r) => matches(r, where)).length),
      create: jest.fn(async ({ data, include }: any) => {
        const row = {
          id: id('rep'), status: 'DRAFT', signedOffAt: null, signedOffBy: null, notes: null,
          createdAt: new Date(NOW), updatedAt: new Date(NOW), ...data,
        };
        db.reports.push(row);
        return include ? withDeviations(row) : row;
      }),
      findFirst: jest.fn(async ({ where, include }: any) => {
        const row = db.reports.find((r) => matches(r, where));
        return row ? (include ? withDeviations(row) : { ...row }) : null;
      }),
      findMany: jest.fn(async ({ where, include }: any) =>
        db.reports.filter((r) => matches(r, where)).map((r) => ({
          ...(include?.deviations ? withDeviations(r) : { ...r }),
          ...(include?._count ? { _count: { deviations: db.deviations.filter((d) => d.reportId === r.id).length } } : {}),
        })),
      ),
      update: jest.fn(async ({ where, data, include }: any) => {
        const row = db.reports.find((r) => r.id === where.id);
        Object.assign(row, data);
        return include ? withDeviations(row) : { ...row };
      }),
    },
    railHandshakeDeviation: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: id('dev'), status: 'LOGGED', escalationStage: 'NONE', category: 'OTHER', responsibleParty: 'UNDETERMINED',
          slotImpact: 'NONE', costRecovered: false, rootCause: null, disputeReason: null, resolutionNote: null,
          createdAt: db.seq, updatedAt: new Date(NOW), ...data,
        };
        db.deviations.push(row);
        return { ...row };
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const row = db.deviations.find((d) => matches(d, where, { report: reportOf }));
        if (!row) return null;
        return { ...row, report: { status: reportOf(row)!.status } };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = db.deviations.find((d) => d.id === where.id);
        Object.assign(row, data);
        return { ...row };
      }),
      delete: jest.fn(async ({ where }: any) => {
        db.deviations.splice(db.deviations.findIndex((d) => d.id === where.id), 1);
      }),
      count: jest.fn(async ({ where }: any) => db.deviations.filter((d) => matches(d, where, { report: reportOf })).length),
      groupBy: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _sum: { costZar: 0 } })),
    },
    railConsignment: {
      findFirst: jest.fn(async ({ where }: any) => db.consignments.find((c) => matches(c, where)) ?? null),
    },
  };

  const seedReport = (over: Row = {}) => {
    const row = {
      id: id('rep'), companyId: 'A', reportNumber: `HS-2026-0000${db.seq}`, status: 'PENDING_TOC',
      reportDate: new Date(NOW - 36 * H), windowStart: new Date(NOW - 36 * H), windowEnd: new Date(NOW - 12 * H),
      railOperator: 'TRIM', corridor: 'Ore', imReference: null, notes: null, signedOffAt: null, signedOffBy: null,
      createdAt: new Date(NOW - 12 * H), updatedAt: new Date(NOW - 12 * H), ...over,
    };
    db.reports.push(row);
    return row;
  };
  const seedDeviation = (reportId: string, over: Row = {}) => {
    const row = {
      id: id('dev'), reportId, trainSlotRef: 'NS-0412', orderNumber: null, consignmentId: null, category: 'DELAY',
      reason: 'Late release from yard', rootCause: null, location: null, occurredAt: null, delayMinutes: 90,
      responsibleParty: 'IM', slotImpact: 'DELAYED', costZar: 1000, costRecovered: false, status: 'LOGGED',
      escalationStage: 'NONE', disputeReason: null, resolutionNote: null, resolvedAt: null, escalatedAt: null,
      resolveByAt: null, otherTrainPathsImpacted: null, slaKpisImpacted: null,
      createdAt: db.seq, updatedAt: new Date(NOW), ...over,
    };
    db.deviations.push(row);
    return row;
  };
  return { db, prisma, seedReport, seedDeviation };
}

function makeService(opts: { entitled?: boolean } = {}) {
  const { db, prisma, seedReport, seedDeviation } = makeDb();
  const billing = { hasFeature: jest.fn().mockResolvedValue(opts.entitled ?? true) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const outbox = { enqueue: jest.fn().mockResolvedValue('ob1') };
  const svc = new RailHandshakeService(prisma as any, billing as any, audit as any, outbox as any);
  return { svc, db, prisma, billing, audit, outbox, seedReport, seedDeviation };
}

/** The `AuditService.record` calls, as plain entries. */
const auditEntries = (audit: { record: jest.Mock }) => audit.record.mock.calls.map(([e]) => e);
const auditActions = (audit: { record: jest.Mock }) => auditEntries(audit).map((e) => e.action);

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => {
  jest.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Escalation math
// ═══════════════════════════════════════════════════════════════════════════════
describe('escalation ladder — stageForElapsedHours()', () => {
  const stage = (hours: number): EscalationStage => (makeService().svc as any).stageForElapsedHours(hours);

  it.each([
    // [hours since report window closed, expected stage]
    [-5, EscalationStage.LIAISON_MANAGER_24H], // window not closed yet
    [0, EscalationStage.LIAISON_MANAGER_24H],
    [23.99, EscalationStage.LIAISON_MANAGER_24H],
    [24, EscalationStage.LIAISON_MANAGER_24H], // boundary is inclusive (<= 24)
    [24.01, EscalationStage.HEAD_LIAISON_48H],
    [48, EscalationStage.HEAD_LIAISON_48H],
    [48.01, EscalationStage.HEAD_NSPO_72H],
    [72, EscalationStage.HEAD_NSPO_72H],
    [72.01, EscalationStage.HEAD_NSPO_72H], // NSP&O holds it - they have until 96h
    [96, EscalationStage.HEAD_NSPO_72H],    // resolve-by boundary is inclusive
    [96.01, EscalationStage.ROUTE_LOGISTICS_FORUM],
    [500, EscalationStage.ROUTE_LOGISTICS_FORUM],
  ])('%p h elapsed → %s', (hours, expected) => {
    expect(stage(hours)).toBe(expected);
  });

  /**
   * The ladder now follows Annexure 28 (NS §6.6.1.14.1/.15.3/.16), closing
   * gaps G-1 and G-2.
   *
   * This replaces the characterisation tests that used to pin the old,
   * compressed ladder. Those existed so that changing the ladder could not
   * happen silently; the owner's approval of G-1..G-5 on 2026-10-04 was that
   * decision, and they are updated rather than deleted. What changed is
   * recorded in the source register as Revision 10 and in the wave 5
   * migration, including the note that rows already sitting at
   * ROUTE_LOGISTICS_FORUM keep their value while its meaning shifts.
   */
  describe('the ladder matches the source (gaps G-1 and G-2, closed)', () => {
    it('the 72h rung is the Head of Network Service Planning and Operations, not the Route Logistics Forum', () => {
      expect(stage(72)).toBe(EscalationStage.HEAD_NSPO_72H);
      expect(stage(72)).not.toBe(EscalationStage.ROUTE_LOGISTICS_FORUM);
    });

    it('the Head of NSP&O holds the item for the full 96h resolve-by before anyone refers it onward', () => {
      expect(stage(73)).toBe(EscalationStage.HEAD_NSPO_72H);
      expect(stage(95)).toBe(EscalationStage.HEAD_NSPO_72H);
      expect(stage(96)).toBe(EscalationStage.HEAD_NSPO_72H);
    });

    it('the Forum is a later referral, reached only after the 96h resolve-by expires', () => {
      expect(stage(96.01)).toBe(EscalationStage.ROUTE_LOGISTICS_FORUM);
    });

    it("the clock never lodges a dispute with the Regulator - that is a person's decision", () => {
      for (const hours of [0, 24, 49, 73, 97, 500, 10_000]) {
        expect(stage(hours)).not.toBe(EscalationStage.REGULATOR_DISPUTE);
      }
    });
  });

  describe('the 96h resolve-by deadline', () => {
    it('is stamped from the window end, not from when the escalation was noticed', () => {
      const { svc } = makeService();
      const windowEnd = new Date('2026-10-01T08:00:00.000Z');
      const resolveBy = (svc as any).resolveByFor(windowEnd) as Date;
      expect(resolveBy.toISOString()).toBe('2026-10-05T08:00:00.000Z'); // windowEnd + 96h
    });
  });
});

describe('escalation ladder — applied on read (getReport) and by the sweep', () => {
  const openDev = (over: Row = {}) => ({
    status: DeviationStatus.OPEN, escalationStage: EscalationStage.LIAISON_MANAGER_24H, ...over,
  });

  it.each([
    [10, EscalationStage.LIAISON_MANAGER_24H, false],
    [30, EscalationStage.HEAD_LIAISON_48H, true],
    [60, EscalationStage.HEAD_NSPO_72H, true],
    [80, EscalationStage.HEAD_NSPO_72H, true],
    [100, EscalationStage.ROUTE_LOGISTICS_FORUM, true],
  ])('a report window that closed %ph ago puts an OPEN item at %s (persisted: %s)', async (hoursAgo, expected, persists) => {
    const { svc, prisma, seedReport, seedDeviation } = makeService();
    const rep = seedReport({ windowEnd: new Date(NOW - hoursAgo * H) });
    const dev = seedDeviation(rep.id, openDev());

    const out = await svc.getReport('A', rep.id);

    expect(out.deviations.find((d: Row) => d.id === dev.id)!.escalationStage).toBe(expected);
    if (persists) {
      // The 96h resolve-by is stamped only when the item lands on the NSP&O rung.
      const stampedDeadline = expected === EscalationStage.HEAD_NSPO_72H ? { resolveByAt: expect.any(Date) } : {};
      expect(prisma.railHandshakeDeviation.update).toHaveBeenCalledWith({
        where: { id: dev.id },
        data: { escalationStage: expected, escalatedAt: expect.any(Date), ...stampedDeadline },
      });
    } else {
      expect(prisma.railHandshakeDeviation.update).not.toHaveBeenCalled(); // already at the right rung
    }
  });

  it('measures elapsed time from the report window END, not from when the item was flagged', async () => {
    // Flagged a moment ago (escalatedAt = now) on a report that closed 80h ago. Under the old ladder this
    // jumped straight to the Regulator; it is now still with the Head of NSP&O, who has the full 96h.
    const { svc, seedReport, seedDeviation } = makeService();
    const rep = seedReport({ windowEnd: new Date(NOW - 80 * H) });
    const dev = seedDeviation(rep.id, openDev({ escalatedAt: new Date(NOW) }));
    const out = await svc.getReport('A', rep.id);
    expect(out.deviations.find((d: Row) => d.id === dev.id)!.escalationStage).toBe(EscalationStage.HEAD_NSPO_72H);
  });

  it('only OPEN items climb: LOGGED, AGREED, RESOLVED and DISPUTED items are never moved', async () => {
    const { svc, prisma, seedReport, seedDeviation } = makeService();
    const rep = seedReport({ windowEnd: new Date(NOW - 100 * H) });
    for (const status of [DeviationStatus.LOGGED, DeviationStatus.AGREED, DeviationStatus.RESOLVED, DeviationStatus.DISPUTED]) {
      seedDeviation(rep.id, { status, escalationStage: EscalationStage.NONE });
    }
    await svc.getReport('A', rep.id);
    expect(prisma.railHandshakeDeviation.update).not.toHaveBeenCalled();
  });

  it('records each ladder move in the audit trail as a SYSTEM action with from/to and elapsed hours', async () => {
    const { svc, audit, seedReport, seedDeviation } = makeService();
    const rep = seedReport({ windowEnd: new Date(NOW - 30 * H) });
    const dev = seedDeviation(rep.id, openDev());

    await svc.getReport('A', rep.id);

    const [entry] = auditEntries(audit);
    expect(entry).toMatchObject({
      action: RAIL_AUDIT_ACTION.DEVIATION_ESCALATED,
      actorType: 'system',
      actorId: null,
      targetType: 'rail_handshake_deviation',
      targetId: dev.id,
      metadata: {
        module: 'rail', companyId: 'A', from: EscalationStage.LIAISON_MANAGER_24H, to: EscalationStage.HEAD_LIAISON_48H,
        elapsedHoursSinceWindowEnd: 30,
      },
    });
  });

  it('runEscalation counts reports whose ladder moved and audits the manual run', async () => {
    const { svc, audit, seedReport, seedDeviation } = makeService();
    const moving = seedReport({ windowEnd: new Date(NOW - 30 * H) });
    seedDeviation(moving.id, openDev());
    const settled = seedReport({ windowEnd: new Date(NOW - 5 * H) });
    seedDeviation(settled.id, openDev());

    const res = await svc.runEscalation('A', MANAGER);

    expect(res).toEqual({ reportsScanned: 2, reportsChanged: 1 });
    expect(auditActions(audit)).toContain(RAIL_AUDIT_ACTION.ESCALATION_RUN);
  });

  it('runEscalation never touches another tenant\'s reports', async () => {
    const { svc, prisma, seedReport, seedDeviation } = makeService();
    const theirs = seedReport({ companyId: 'B', windowEnd: new Date(NOW - 90 * H) });
    seedDeviation(theirs.id, openDev());
    const res = await svc.runEscalation('A', MANAGER);
    expect(res.reportsScanned).toBe(0);
    expect(prisma.railHandshakeDeviation.update).not.toHaveBeenCalled();
  });
});

describe('lodgeDispute — the Regulator rung', () => {
  const setup = (stage: EscalationStage, status: DeviationStatus = DeviationStatus.OPEN) => {
    const s = makeService();
    const rep = s.seedReport({ status: HandshakeReportStatus.SIGNED_OFF, windowEnd: new Date(NOW - 5 * H) });
    const dev = s.seedDeviation(rep.id, { status, escalationStage: stage });
    return { ...s, rep, dev };
  };

  // HEAD_NSPO_72H is refused too: the Head of NSP&O still has until 96h to
  // resolve, and the Route Logistics Forum has not seen the item yet.
  it.each([EscalationStage.NONE, EscalationStage.LIAISON_MANAGER_24H, EscalationStage.HEAD_LIAISON_48H, EscalationStage.HEAD_NSPO_72H])(
    'is refused while the item is still at %s',
    async (stage) => {
      const { svc, rep, dev, audit } = setup(stage);
      await expect(svc.lodgeDispute('A', rep.id, dev.id, MANAGER)).rejects.toThrow(/Route Logistics Forum stage/);
      expect(auditActions(audit)).toEqual([]);
    },
  );

  it.each([EscalationStage.ROUTE_LOGISTICS_FORUM, EscalationStage.REGULATOR_DISPUTE])(
    'is allowed at %s: the item and report become DISPUTED and it is audited',
    async (stage) => {
      const { svc, rep, dev, db, audit } = setup(stage);
      const out = await svc.lodgeDispute('A', rep.id, dev.id, MANAGER);

      expect(out.status).toBe(DeviationStatus.DISPUTED);
      expect(out.escalationStage).toBe(EscalationStage.REGULATOR_DISPUTE);
      expect(db.reports.find((r) => r.id === rep.id)!.status).toBe(HandshakeReportStatus.DISPUTED);
      expect(auditEntries(audit)).toEqual([
        expect.objectContaining({
          action: RAIL_AUDIT_ACTION.DISPUTE_LODGED_REGULATOR, actorId: MANAGER.id, targetId: dev.id,
          metadata: expect.objectContaining({ escalationStageAtLodging: stage }),
        }),
      ]);
    },
  );

  it('only an OPEN item can be lodged', async () => {
    const { svc, rep, dev } = setup(EscalationStage.ROUTE_LOGISTICS_FORUM, DeviationStatus.AGREED);
    await expect(svc.lodgeDispute('A', rep.id, dev.id, MANAGER)).rejects.toThrow(/Only an OPEN/);
  });

  it('is a formal commitment: a dispatcher cannot lodge it (service-level, not just the route)', async () => {
    const { svc, rep, dev, audit, db } = setup(EscalationStage.REGULATOR_DISPUTE);
    await expect(svc.lodgeDispute('A', rep.id, dev.id, DISPATCHER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.deviations.find((d) => d.id === dev.id)!.status).toBe(DeviationStatus.OPEN);
    expect(auditActions(audit)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Verified signatory
// ═══════════════════════════════════════════════════════════════════════════════
describe('signOff — verified signatory binding', () => {
  const setup = (devStatuses: DeviationStatus[] = []) => {
    const s = makeService();
    const rep = s.seedReport({ status: HandshakeReportStatus.PENDING_TOC });
    for (const status of devStatuses) s.seedDeviation(rep.id, { status });
    return { ...s, rep };
  };

  it('stores what the signer typed followed by the identity the server verified from the JWT', async () => {
    const { svc, rep, db } = setup();
    const out = await svc.signOff('A', rep.id, { signedOffBy: 'Mia M., Ops Manager' }, MANAGER);
    const expected = 'Mia M., Ops Manager [verified: Mia Manager <mia@toc.co.za> (MANAGER)]';
    expect(out.signedOffBy).toBe(expected);
    expect(db.reports.find((r) => r.id === rep.id)!.signedOffBy).toBe(expected);
    expect(out.signedOffAt).toBeInstanceOf(Date);
  });

  it('shows BOTH identities when they differ — someone signing "as the CEO" is visibly not the CEO', async () => {
    const { svc, rep } = setup();
    const out = await svc.signOff('A', rep.id, { signedOffBy: 'Chief Executive' }, MANAGER);
    expect(out.signedOffBy).toBe('Chief Executive [verified: Mia Manager <mia@toc.co.za> (MANAGER)]');
  });

  it('neutralises a forged "[verified: …]" tag typed into the signatory field', async () => {
    const { svc, rep } = setup();
    const out = await svc.signOff(
      'A', rep.id, { signedOffBy: 'CEO Bob [verified: Bob <bob@corp.co.za> (ADMIN)]' }, MANAGER,
    );
    // brackets/angle-brackets are stripped from the typed part, so only ONE real verification tag can exist
    expect(out.signedOffBy).toBe('CEO Bob verified: Bob bob@corp.co.za (ADMIN) [verified: Mia Manager <mia@toc.co.za> (MANAGER)]');
    expect((out.signedOffBy.match(/\[verified:/g) ?? []).length).toBe(1);
    expect(out.signedOffBy.endsWith('(MANAGER)]')).toBe(true);
  });

  it('strips control characters and line breaks (log / CSV forging)', async () => {
    const { svc, rep } = setup();
    const out = await svc.signOff('A', rep.id, { signedOffBy: 'Mia\r\n"=cmd|calc"\t\u0000 M' }, MANAGER);
    // eslint-disable-next-line no-control-regex
    expect(out.signedOffBy).not.toMatch(/[\r\n\t\u0000]/);
    expect(out.signedOffBy.startsWith('Mia "=cmd|calc" M [verified:')).toBe(true);
  });

  it('sanitises the actor profile too, so a hostile display name cannot break the tag', async () => {
    const { svc, rep } = setup();
    const evil: RailActor = { ...MANAGER, name: 'Eve] [verified: Root', email: 'eve@x.co>' };
    const out = await svc.signOff('A', rep.id, { signedOffBy: 'Eve' }, evil);
    expect(out.signedOffBy).toBe('Eve [verified: Eve verified: Root <eve@x.co> (MANAGER)]');
    expect((out.signedOffBy.match(/\[verified:/g) ?? []).length).toBe(1);
  });

  it.each(['', '   ', '[]<>', '\r\n\t'])('rejects a signatory that is empty after cleaning (%j)', async (typed) => {
    const { svc, rep, audit } = setup();
    await expect(svc.signOff('A', rep.id, { signedOffBy: typed }, MANAGER)).rejects.toBeInstanceOf(BadRequestException);
    expect(auditActions(audit)).toEqual([]);
  });

  it('caps the typed part at 160 characters', async () => {
    const { svc, rep } = setup();
    const out = await svc.signOff('A', rep.id, { signedOffBy: 'x'.repeat(500) }, MANAGER);
    expect(out.signedOffBy.split(' [verified:')[0]).toHaveLength(160);
  });

  it('only authorised representatives may sign: roles outside the signatory set are refused', async () => {
    for (const role of Object.values(UserRole)) {
      const { svc, rep, db } = setup();
      const actor: RailActor = { ...MANAGER, role };
      const attempt = svc.signOff('A', rep.id, { signedOffBy: 'X' }, actor);
      if (RAIL_SIGNATORY_ROLES.includes(role)) {
        await expect(attempt).resolves.toBeDefined();
      } else {
        await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.reports.find((r) => r.id === rep.id)!.signedOffBy).toBeNull();
      }
    }
  });

  describe('resulting report status', () => {
    it('no deviations → CLOSED', async () => {
      const { svc, rep } = setup([]);
      expect((await svc.signOff('A', rep.id, { signedOffBy: 'X' }, MANAGER)).status).toBe(HandshakeReportStatus.CLOSED);
    });
    it('all agreed / resolved → CLOSED', async () => {
      const { svc, rep } = setup([DeviationStatus.AGREED, DeviationStatus.RESOLVED]);
      expect((await svc.signOff('A', rep.id, { signedOffBy: 'X' }, MANAGER)).status).toBe(HandshakeReportStatus.CLOSED);
    });
    it('an OPEN or LOGGED item stays flagged → SIGNED_OFF (sign-off covers open items, Annexure 28)', async () => {
      for (const status of [DeviationStatus.OPEN, DeviationStatus.LOGGED]) {
        const { svc, rep } = setup([DeviationStatus.AGREED, status]);
        expect((await svc.signOff('A', rep.id, { signedOffBy: 'X' }, MANAGER)).status).toBe(HandshakeReportStatus.SIGNED_OFF);
      }
    });
    it('any DISPUTED item → DISPUTED (wins over open items)', async () => {
      const { svc, rep } = setup([DeviationStatus.OPEN, DeviationStatus.DISPUTED]);
      expect((await svc.signOff('A', rep.id, { signedOffBy: 'X' }, MANAGER)).status).toBe(HandshakeReportStatus.DISPUTED);
    });
    it('an already CLOSED report cannot be signed again', async () => {
      const s = makeService();
      const rep = s.seedReport({ status: HandshakeReportStatus.CLOSED });
      await expect(s.svc.signOff('A', rep.id, { signedOffBy: 'X' }, MANAGER)).rejects.toThrow(/already closed/);
    });
  });

  it('writes a report_signed_off audit event carrying the verified signatory and the item counts', async () => {
    const { svc, rep, audit } = setup([DeviationStatus.OPEN, DeviationStatus.LOGGED, DeviationStatus.DISPUTED]);
    await svc.signOff('A', rep.id, { signedOffBy: 'Mia M.' }, MANAGER);
    expect(auditEntries(audit)).toEqual([
      expect.objectContaining({
        action: RAIL_AUDIT_ACTION.REPORT_SIGNED_OFF,
        actorType: 'tenant', actorId: 'u-mgr', actorEmail: 'mia@toc.co.za',
        targetType: 'rail_handshake_report', targetId: rep.id, targetName: rep.reportNumber,
        metadata: expect.objectContaining({
          module: 'rail', companyId: 'A', actorRole: 'MANAGER', from: 'PENDING_TOC', to: 'DISPUTED',
          signedOffBy: 'Mia M. [verified: Mia Manager <mia@toc.co.za> (MANAGER)]', openItems: 2, disputedItems: 1,
        }),
      }),
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tenant isolation
// ═══════════════════════════════════════════════════════════════════════════════
describe('tenant isolation', () => {
  it('a report belonging to tenant A is invisible to tenant B (404, not 403)', async () => {
    const { svc, prisma, seedReport } = makeService();
    const rep = seedReport({ companyId: 'A' });
    await expect(svc.getReport('B', rep.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.railHandshakeReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: rep.id, companyId: 'B' } }),
    );
  });

  it('listReports returns only the caller\'s reports', async () => {
    const { svc, seedReport } = makeService();
    seedReport({ companyId: 'A', reportNumber: 'HS-A-1' });
    seedReport({ companyId: 'A', reportNumber: 'HS-A-2' });
    seedReport({ companyId: 'B', reportNumber: 'HS-B-1' });
    const a = await svc.listReports('A');
    const b = await svc.listReports('B');
    expect(a.map((r) => r.reportNumber).sort()).toEqual(['HS-A-1', 'HS-A-2']);
    expect(b.map((r) => r.reportNumber)).toEqual(['HS-B-1']);
  });

  it('every mutating method refuses another tenant\'s report and leaves no side effects', async () => {
    const { svc, db, audit, seedReport, seedDeviation } = makeService();
    const rep = seedReport({ companyId: 'A', status: HandshakeReportStatus.PENDING_TOC });
    const dev = seedDeviation(rep.id, { status: DeviationStatus.OPEN, escalationStage: EscalationStage.ROUTE_LOGISTICS_FORUM });
    const before = JSON.stringify([db.reports, db.deviations]);

    const attempts: Array<[string, Promise<unknown>]> = [
      ['updateReport', svc.updateReport('B', rep.id, { notes: 'x' }, MANAGER)],
      ['issueReport', svc.issueReport('B', rep.id, MANAGER)],
      ['signOff', svc.signOff('B', rep.id, { signedOffBy: 'X' }, MANAGER)],
      ['logDeviation', svc.logDeviation('B', rep.id, { trainSlotRef: 'T', reason: 'r' }, MANAGER)],
      ['updateDeviation', svc.updateDeviation('B', rep.id, dev.id, { reason: 'x' }, MANAGER)],
      ['reviewDeviation', svc.reviewDeviation('B', rep.id, dev.id, { agree: true }, MANAGER)],
      ['resolveDeviation', svc.resolveDeviation('B', rep.id, dev.id, {}, MANAGER)],
      ['lodgeDispute', svc.lodgeDispute('B', rep.id, dev.id, MANAGER)],
      ['removeDeviation', svc.removeDeviation('B', rep.id, dev.id, MANAGER)],
    ];
    for (const [name, attempt] of attempts) {
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
      void name;
    }
    expect(JSON.stringify([db.reports, db.deviations])).toBe(before); // nothing changed
    expect(audit.record).not.toHaveBeenCalled(); // and nothing was audited
  });

  it('a deviation id is not enough: it must belong to the named report AND tenant', async () => {
    const { svc, seedReport, seedDeviation } = makeService();
    const mine = seedReport({ companyId: 'A' });
    const other = seedReport({ companyId: 'A' });
    const dev = seedDeviation(other.id, { status: DeviationStatus.LOGGED });
    // right tenant, wrong report
    await expect(svc.removeDeviation('A', mine.id, dev.id, MANAGER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to link a deviation to another tenant\'s consignment', async () => {
    const { svc, db, audit, seedReport } = makeService();
    const rep = seedReport({ companyId: 'A', status: HandshakeReportStatus.DRAFT });
    db.consignments.push({ id: 'c-theirs', companyId: 'B' }, { id: 'c-mine', companyId: 'A' });

    await expect(
      svc.logDeviation('A', rep.id, { trainSlotRef: 'T1', reason: 'r', consignmentId: 'c-theirs' }, MANAGER),
    ).rejects.toThrow(/does not belong to this tenant/);
    expect(db.deviations).toHaveLength(0);
    expect(audit.record).not.toHaveBeenCalled();

    await expect(
      svc.logDeviation('A', rep.id, { trainSlotRef: 'T1', reason: 'r', consignmentId: 'c-mine' }, MANAGER),
    ).resolves.toMatchObject({ consignmentId: 'c-mine' });
  });

  it('overview() scopes every query to the caller\'s company', async () => {
    const { svc, prisma } = makeService();
    await svc.overview('A');
    const wheres = [
      ...(prisma.railHandshakeReport.count as jest.Mock).mock.calls.map(([a]) => a.where),
      ...(prisma.railHandshakeDeviation.count as jest.Mock).mock.calls.map(([a]) => a.where),
      ...(prisma.railHandshakeDeviation.groupBy as jest.Mock).mock.calls.map(([a]) => a.where),
      ...(prisma.railHandshakeDeviation.aggregate as jest.Mock).mock.calls.map(([a]) => a.where),
    ];
    expect(wheres.length).toBeGreaterThanOrEqual(5);
    for (const w of wheres) {
      expect(w.companyId === 'A' || w.report?.companyId === 'A').toBe(true);
    }
  });

  it('report numbers are generated per tenant', async () => {
    const { svc, seedReport } = makeService();
    seedReport({ companyId: 'A', createdAt: new Date(NOW) });
    seedReport({ companyId: 'A', createdAt: new Date(NOW) });
    const forB = await svc.createReport('B', {}, MANAGER);
    expect(forB.reportNumber).toBe('HS-2026-00001'); // B has none yet — A's two do not count
    const forA = await svc.createReport('A', {}, MANAGER);
    expect(forA.reportNumber).toBe('HS-2026-00003');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Entitlement
// ═══════════════════════════════════════════════════════════════════════════════
describe('rail entitlement gate', () => {
  it('every public method is refused without the `rail` feature, before any data access', async () => {
    const { svc, prisma, audit, billing } = makeService({ entitled: false });
    const calls: Array<() => Promise<unknown>> = [
      () => svc.createReport('A', {}, MANAGER),
      () => svc.listReports('A'),
      () => svc.getReport('A', 'r'),
      () => svc.updateReport('A', 'r', {}, MANAGER),
      () => svc.issueReport('A', 'r', MANAGER),
      () => svc.signOff('A', 'r', { signedOffBy: 'X' }, MANAGER),
      () => svc.logDeviation('A', 'r', { trainSlotRef: 'T', reason: 'r' }, MANAGER),
      () => svc.updateDeviation('A', 'r', 'd', {}, MANAGER),
      () => svc.reviewDeviation('A', 'r', 'd', { agree: true }, MANAGER),
      () => svc.runEscalation('A', MANAGER),
      () => svc.resolveDeviation('A', 'r', 'd', {}, MANAGER),
      () => svc.lodgeDispute('A', 'r', 'd', MANAGER),
      () => svc.removeDeviation('A', 'r', 'd', MANAGER),
      () => svc.overview('A'),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(billing.hasFeature).toHaveBeenCalledTimes(calls.length);
    expect(billing.hasFeature).toHaveBeenCalledWith('A', 'rail');
    for (const table of Object.values(prisma)) {
      for (const fn of Object.values(table)) expect(fn).not.toHaveBeenCalled();
    }
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('the entitlement is checked for the CALLER\'s tenant', async () => {
    const { svc, billing, seedReport } = makeService();
    const rep = seedReport({ companyId: 'A' });
    await svc.getReport('A', rep.id);
    expect(billing.hasFeature).toHaveBeenLastCalledWith('A', 'rail');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// State machine + audit trail
// ═══════════════════════════════════════════════════════════════════════════════
describe('handshake lifecycle — guards and audit trail', () => {
  it('walks the whole lifecycle and leaves one audit event per transition, in order', async () => {
    const { svc, audit, seedReport } = makeService();
    const rep = seedReport({ status: HandshakeReportStatus.DRAFT, windowEnd: new Date(NOW - 5 * H) });

    const d1 = await svc.logDeviation('A', rep.id, { trainSlotRef: 'NS-1', reason: 'late' }, MANAGER);
    const d2 = await svc.logDeviation('A', rep.id, { trainSlotRef: 'NS-2', reason: 'cancelled' }, MANAGER);
    await svc.issueReport('A', rep.id, MANAGER);
    await svc.reviewDeviation('A', rep.id, d1.id, { agree: true }, MANAGER);
    await svc.reviewDeviation('A', rep.id, d2.id, { agree: false, disputeReason: 'IM fault' }, MANAGER);
    await svc.signOff('A', rep.id, { signedOffBy: 'Mia M.' }, MANAGER);
    await svc.resolveDeviation('A', rep.id, d2.id, { resolutionNote: 'agreed' }, MANAGER);

    expect(auditActions(audit)).toEqual([
      RAIL_AUDIT_ACTION.DEVIATION_LOGGED,
      RAIL_AUDIT_ACTION.DEVIATION_LOGGED,
      RAIL_AUDIT_ACTION.REPORT_ISSUED,
      RAIL_AUDIT_ACTION.DEVIATION_AGREED,
      RAIL_AUDIT_ACTION.DEVIATION_FLAGGED_OPEN,
      RAIL_AUDIT_ACTION.REPORT_SIGNED_OFF,
      RAIL_AUDIT_ACTION.DEVIATION_RESOLVED,
    ]);
    // the brief's exact action names
    expect(RAIL_AUDIT_ACTION).toMatchObject({
      REPORT_CREATED: 'report_created', DEVIATION_LOGGED: 'deviation_logged', REPORT_ISSUED: 'report_issued',
      DEVIATION_AGREED: 'deviation_agreed', DEVIATION_FLAGGED_OPEN: 'deviation_flagged_open',
      REPORT_SIGNED_OFF: 'report_signed_off', DEVIATION_RESOLVED: 'deviation_resolved',
      DISPUTE_LODGED_REGULATOR: 'dispute_lodged_regulator',
    });
    // every entry is tenant-attributed and tagged with the company
    for (const e of auditEntries(audit)) {
      expect(e).toMatchObject({ actorType: 'tenant', actorId: 'u-mgr', metadata: { module: 'rail', companyId: 'A' } });
    }
  });

  it('createReport audits report_created and defaults the operating day to yesterday', async () => {
    const { svc, audit } = makeService();
    const out = await svc.createReport('A', { corridor: 'Ore', railOperator: 'TRIM' }, MANAGER);
    const yesterday = new Date(NOW - 24 * H);
    const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
    expect(out.windowStart).toEqual(start);
    expect(out.windowEnd).toEqual(new Date(start.getTime() + 24 * H)); // a 24h window
    expect(auditEntries(audit)[0]).toMatchObject({
      action: 'report_created', targetId: out.id, targetName: out.reportNumber,
      metadata: { corridor: 'Ore', railOperator: 'TRIM', companyId: 'A' },
    });
  });

  it('rejects an invalid reportDate', async () => {
    const { svc } = makeService();
    await expect(svc.createReport('A', { reportDate: 'not-a-date' }, MANAGER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('flagging OPEN needs a dispute reason, starts the ladder at 24h and audits deviation_flagged_open', async () => {
    const { svc, audit, seedReport, seedDeviation } = makeService();
    const rep = seedReport({ status: HandshakeReportStatus.PENDING_TOC });
    const dev = seedDeviation(rep.id);

    await expect(svc.reviewDeviation('A', rep.id, dev.id, { agree: false }, MANAGER)).rejects.toThrow(/dispute reason/);
    await expect(svc.reviewDeviation('A', rep.id, dev.id, { agree: false, disputeReason: '   ' }, MANAGER)).rejects.toThrow(/dispute reason/);
    expect(audit.record).not.toHaveBeenCalled();

    const out = await svc.reviewDeviation('A', rep.id, dev.id, { agree: false, disputeReason: '  IM released the path late ' }, MANAGER);
    expect(out).toMatchObject({
      status: DeviationStatus.OPEN, disputeReason: 'IM released the path late', escalationStage: EscalationStage.LIAISON_MANAGER_24H,
    });
    expect(auditEntries(audit)[0]).toMatchObject({
      action: 'deviation_flagged_open',
      metadata: { disputeReason: 'IM released the path late', escalationStage: EscalationStage.LIAISON_MANAGER_24H },
    });
  });

  it('agreeing clears the ladder and any earlier dispute reason', async () => {
    const { svc, seedReport, seedDeviation } = makeService();
    const rep = seedReport({ status: HandshakeReportStatus.PENDING_TOC });
    const dev = seedDeviation(rep.id, { disputeReason: 'old', escalationStage: EscalationStage.LIAISON_MANAGER_24H });
    const out = await svc.reviewDeviation('A', rep.id, dev.id, { agree: true }, MANAGER);
    expect(out).toMatchObject({ status: DeviationStatus.AGREED, escalationStage: EscalationStage.NONE, disputeReason: null });
  });

  it('review is only possible while the report is PENDING_TOC and the item is LOGGED', async () => {
    const draft = makeService();
    const r1 = draft.seedReport({ status: HandshakeReportStatus.DRAFT });
    const d1 = draft.seedDeviation(r1.id);
    await expect(draft.svc.reviewDeviation('A', r1.id, d1.id, { agree: true }, MANAGER)).rejects.toThrow(/while the report is DRAFT/);

    const pending = makeService();
    const r2 = pending.seedReport({ status: HandshakeReportStatus.PENDING_TOC });
    const d2 = pending.seedDeviation(r2.id, { status: DeviationStatus.AGREED });
    await expect(pending.svc.reviewDeviation('A', r2.id, d2.id, { agree: true }, MANAGER)).rejects.toThrow(/Only a logged deviation/);
  });

  it('only a DRAFT report can be issued', async () => {
    const { svc, seedReport } = makeService();
    const rep = seedReport({ status: HandshakeReportStatus.PENDING_TOC });
    await expect(svc.issueReport('A', rep.id, MANAGER)).rejects.toThrow(/Only a DRAFT report/);
  });

  it('deviations can only be logged / edited / deleted while the report is DRAFT or PENDING_TOC', async () => {
    const { svc, seedReport, seedDeviation } = makeService();
    const rep = seedReport({ status: HandshakeReportStatus.CLOSED });
    const dev = seedDeviation(rep.id);
    await expect(svc.logDeviation('A', rep.id, { trainSlotRef: 'T', reason: 'r' }, MANAGER)).rejects.toThrow(/Adding deviations/);
    await expect(svc.updateDeviation('A', rep.id, dev.id, { reason: 'x' }, MANAGER)).rejects.toThrow(/Editing deviations/);
    await expect(svc.removeDeviation('A', rep.id, dev.id, MANAGER)).rejects.toThrow(/Deleting deviations/);
  });

  it('only an OPEN item can be resolved, by a signatory, and the resolution is audited', async () => {
    const { svc, audit, seedReport, seedDeviation } = makeService();
    const rep = seedReport({ status: HandshakeReportStatus.SIGNED_OFF });
    const logged = seedDeviation(rep.id, { status: DeviationStatus.LOGGED });
    const open = seedDeviation(rep.id, { status: DeviationStatus.OPEN, escalationStage: EscalationStage.HEAD_LIAISON_48H, costRecovered: false });

    await expect(svc.resolveDeviation('A', rep.id, logged.id, {}, MANAGER)).rejects.toThrow(/Only an OPEN/);
    await expect(svc.resolveDeviation('A', rep.id, open.id, {}, DISPATCHER)).rejects.toBeInstanceOf(ForbiddenException);

    const out = await svc.resolveDeviation('A', rep.id, open.id, { resolutionNote: 'IM accepted fault', costRecovered: true }, MANAGER);
    expect(out).toMatchObject({
      status: DeviationStatus.RESOLVED, escalationStage: EscalationStage.NONE, costRecovered: true, resolutionNote: 'IM accepted fault',
    });
    expect(out.resolvedAt).toBeInstanceOf(Date);
    expect(auditActions(audit)).toEqual(['deviation_resolved']);
  });

  it('removing a deviation audits what was removed', async () => {
    const { svc, audit, db, seedReport, seedDeviation } = makeService();
    const rep = seedReport({ status: HandshakeReportStatus.DRAFT });
    const dev = seedDeviation(rep.id, { reason: 'duplicate entry' });
    await svc.removeDeviation('A', rep.id, dev.id, MANAGER);
    expect(db.deviations).toHaveLength(0);
    expect(auditEntries(audit)[0]).toMatchObject({
      action: 'deviation_removed', targetId: dev.id, metadata: { reportId: rep.id, reason: 'duplicate entry' },
    });
  });

  it('updating report metadata is audited with the fields touched', async () => {
    const { svc, audit, seedReport } = makeService();
    const rep = seedReport({ status: HandshakeReportStatus.DRAFT });
    await svc.updateReport('A', rep.id, { imReference: 'TOL-99' }, MANAGER);
    expect(auditEntries(audit)[0]).toMatchObject({ action: 'report_updated', metadata: { fields: ['imReference'] } });
  });

  it('an audit-write failure never breaks the business action', async () => {
    const { svc, audit, seedReport } = makeService();
    audit.record.mockRejectedValue(new Error('audit store down'));
    const rep = seedReport({ status: HandshakeReportStatus.DRAFT });
    await expect(svc.issueReport('A', rep.id, MANAGER)).resolves.toMatchObject({ status: HandshakeReportStatus.PENDING_TOC });
  });
});
