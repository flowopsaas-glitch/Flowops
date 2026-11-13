import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, RailCapacityUnit, RailSlotApplicationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../webhooks/outbox.service';
import type { FlowOpsEvent } from '../webhooks/event-catalog';
import {
  RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, railSystemAuditEntry, recordRailAudit,
} from './rail-audit';
import { assertSignatoryRole } from './rail-roles';
import {
  AllocateApplicationDto, ConflictDto, CreateComplianceDocDto, CreateSlotApplicationDto, EnvelopeCheckDto,
  LinkConsignmentDto, MarkOperatedDto, RejectApplicationDto, RevokeComplianceDocDto, SelfScreeningDto,
  UpdateSlotApplicationDto, UpsertCorridorCapacityDto,
} from './dto/rail-slot.dto';
import { CORRIDOR_CATALOG } from './catalog/corridors.catalog';
import { EXPECTED_CORRIDOR_COUNT, EXPECTED_TRANSFER_YARD_COUNT, YARD_CATALOG } from './catalog/yards.catalog';
import {
  SELF_SCREENING_QUESTIONS, SELF_SCREENING_VERSION, evaluateSelfScreening, SelfScreeningAnswer,
} from './catalog/self-screening.catalog';
import { EnvelopeCorridor, EnvelopeSubject, checkEnvelope, wagonToSubject } from './rail-envelope';
import {
  daysUntilExpiry, effectiveDocStatus, evaluateCompliance, rsrPermitGuard,
} from './rail-compliance';
import {
  canTransition, checkValidityWindow, computeMobilizeBy, isForfeitureDue, isValidityEnded, mobilisationView,
} from './rail-slot.rules';
import { CorridorIdentity, resolveCorridor } from './rail-reference';
import { claimTransition } from '../common/state-transition';

/** A corridor or yard as the API returns it: the DB row when seeded, else the code catalog. */
export interface ReferenceView extends EnvelopeCorridor, CorridorIdentity {
  name: string;
  aliases: string[];
  workbookRoutes: string[];
  sortOrder: number;
  contacts: unknown;
  sourceRef: string | null;
  notes: string | null;
  fromCatalog: boolean;
}

/**
 * Slot applications, operator compliance documents and the corridor-envelope check
 * (RAIL-005, RAIL-006, RAIL-012).
 *
 * FlowOps RECORDS the IM's decisions; it never grants access. Tenant-scoped throughout, gated
 * behind the `rail` entitlement. Reference data (corridors, yards) is platform-wide and
 * read-only here.
 */
@Injectable()
export class RailSlotService {
  private readonly logger = new Logger(RailSlotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // ── plumbing ───────────────────────────────────────────────────────────────

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException('Rail & Intermodal is an Enterprise feature. Upgrade your plan to manage slot applications and compliance.');
    }
  }

  private record(companyId: string, actor: RailActor, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railAuditEntry(companyId, actor, action, target, metadata));
  }
  private recordSystem(companyId: string, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railSystemAuditEntry(companyId, action, target, metadata));
  }

  private toDate(v: string | Date | null | undefined, field: string): Date | null {
    if (v == null) return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${field} is not a valid date.`);
    return d;
  }

  // ── reference data ─────────────────────────────────────────────────────────

  private toView(row: any, fromCatalog = false): ReferenceView {
    return {
      code: row.code, name: row.name, aliases: row.aliases ?? [], workbookRoutes: row.workbookRoutes ?? [], sortOrder: row.sortOrder ?? 0,
      gauge: row.gauge ?? null, electrification: row.electrification ?? [], maxAxleLoadTonnes: row.maxAxleLoadTonnes ?? null,
      vehicleProfile: row.vehicleProfile ?? null, maxTrainLengthM: row.maxTrainLengthM ?? null,
      contacts: row.contacts ?? [], dataStatus: row.dataStatus ?? 'SOURCE_PENDING', sourceRef: row.sourceRef ?? null, notes: row.notes ?? null,
      fromCatalog,
      // yards only
      ...(row.sidingCapacityWagons !== undefined ? { sidingCapacityWagons: row.sidingCapacityWagons } : {}),
      ...(row.corridorCode !== undefined ? { corridorCode: row.corridorCode } : {}),
      ...(row.isTransferYard !== undefined ? { isTransferYard: row.isTransferYard } : {}),
    } as ReferenceView;
  }

  /** Seeded rows win; before the seeder has run the code catalog (the seed's own source) is served instead. */
  async listCorridors(companyId: string): Promise<ReferenceView[]> {
    await this.assertEntitled(companyId);
    return this.corridors();
  }

  private async corridors(): Promise<ReferenceView[]> {
    const rows = await this.prisma.railCorridorNode.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return rows.length ? rows.map((r) => this.toView(r)) : CORRIDOR_CATALOG.map((c) => this.toView(c, true));
  }

  async listYards(companyId: string): Promise<ReferenceView[]> {
    await this.assertEntitled(companyId);
    return this.yards();
  }

  private async yards(): Promise<ReferenceView[]> {
    const rows = await this.prisma.railYardSpec.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    return rows.length ? rows.map((r) => this.toView(r)) : YARD_CATALOG.map((y) => this.toView(y, true));
  }

  /** How much of the reference data is actually loaded — surfaced so nobody mistakes "empty" for "complete". */
  async referenceCompleteness(companyId: string) {
    await this.assertEntitled(companyId);
    return this.completeness();
  }

  private async completeness() {
    const [corridors, yards] = await Promise.all([this.corridors(), this.yards()]);
    const verified = (xs: ReferenceView[]) => xs.filter((x) => x.dataStatus === 'VERIFIED').length;
    return {
      corridors: { expected: EXPECTED_CORRIDOR_COUNT, loaded: corridors.length, verified: verified(corridors) },
      yards: { expected: EXPECTED_TRANSFER_YARD_COUNT, loaded: yards.length, verified: verified(yards) },
      fromCatalogFallback: corridors.some((c) => c.fromCatalog),
      message:
        verified(corridors) < corridors.length || yards.length < EXPECTED_TRANSFER_YARD_COUNT
          ? 'Corridor limits and the transfer-yard list have not been loaded from a cited source. Envelope checks report UNVERIFIED — they never confirm a fit.'
          : 'Reference data is loaded and verified.',
    };
  }

  private async corridorOrThrow(code: string): Promise<ReferenceView> {
    const corridor = (await this.corridors()).find((c) => c.code === code);
    if (!corridor) throw new BadRequestException(`Unknown corridor "${code}". Use a code from the corridor catalog (e.g. COR-ORE).`);
    return corridor;
  }

  private async assertYardCodes(...codes: Array<string | undefined | null>): Promise<void> {
    const given = codes.filter((c): c is string => !!c);
    if (!given.length) return;
    const yards = await this.yards();
    if (!yards.length) throw new BadRequestException('No transfer-yard reference data is loaded, so a yard code cannot be validated. Use the origin / destination name fields instead.');
    for (const c of given) if (!yards.some((y) => y.code === c)) throw new BadRequestException(`Unknown yard code "${c}".`);
  }

  // ── envelope ───────────────────────────────────────────────────────────────

  private subjectOfApplication(app: { applicationNumber: string; gauge?: any; axleLoadTonnes?: number | null; vehicleProfile?: any; trainLengthM?: number | null; tractionType?: any }): EnvelopeSubject {
    return {
      label: `Application ${app.applicationNumber}`, gauge: app.gauge ?? null, axleLoadTonnes: app.axleLoadTonnes ?? null,
      vehicleProfile: app.vehicleProfile ?? null, trainLengthM: app.trainLengthM ?? null, tractionType: app.tractionType ?? null,
    };
  }

  /** The tenant's consignment and its wagons as envelope subjects. 404 if it is not this tenant's. */
  private async consignmentSubjects(companyId: string, consignmentId: string) {
    const c = await this.prisma.railConsignment.findFirst({ where: { id: consignmentId, companyId }, include: { wagons: true } });
    if (!c) throw new NotFoundException('Rail consignment not found');
    return { consignment: c, subjects: c.wagons.map((w) => wagonToSubject(w)) };
  }

  /**
   * On-demand corridor-envelope check for manual particulars or for a consignment's wagons.
   * Never throws for INCOMPATIBLE — the caller (a checker tool) wants the result. The slot
   * workflow turns INCOMPATIBLE into a rejection.
   */
  async checkEnvelope(companyId: string, dto: EnvelopeCheckDto) {
    await this.assertEntitled(companyId);
    let subjects: EnvelopeSubject[] = [];
    let source: 'MANUAL' | 'CONSIGNMENT' = 'MANUAL';
    let consignmentInfo: { id: string; consignmentNumber: string; corridor: string | null; wagons: number } | null = null;
    let corridorText = dto.corridorCode ?? null;

    if (dto.consignmentId) {
      const { consignment, subjects: s } = await this.consignmentSubjects(companyId, dto.consignmentId);
      subjects = s;
      source = 'CONSIGNMENT';
      consignmentInfo = { id: consignment.id, consignmentNumber: consignment.consignmentNumber, corridor: consignment.corridor ?? null, wagons: consignment.wagons.length };
      corridorText = corridorText ?? consignment.corridor ?? null;
    } else if (dto.subjects?.length) {
      subjects = dto.subjects.map((s, i) => ({
        label: s.label ?? `Item ${i + 1}`, gauge: s.gauge ?? null, vehicleProfile: s.vehicleProfile ?? null,
        trainLengthM: s.trainLengthM ?? null, tractionType: s.tractionType ?? null,
        axleLoadTonnes: s.axleLoadTonnes ?? wagonToSubject({ wagonNumber: 'x', tareTonnes: s.tareTonnes, loadedTonnes: s.loadedTonnes, axles: s.axles }).axleLoadTonnes ?? null,
      }));
    } else {
      throw new BadRequestException('Provide either a consignmentId or at least one subject to check.');
    }

    const corridors = await this.corridors();
    // A catalog code is used exactly; a consignment's free-text corridor is matched by name / alias / route, never fuzzily.
    const corridor = resolveCorridor(corridors, corridorText);
    const result = checkEnvelope(corridor, subjects);
    return {
      ...result,
      source,
      consignment: consignmentInfo,
      corridor: corridor ? { code: corridor.code, name: corridor.name, dataStatus: corridor.dataStatus } : null,
      corridorQuery: corridorText,
    };
  }

  // ── slot applications: reads ───────────────────────────────────────────────

  private withClock<T extends { status: RailSlotApplicationStatus; mobilizeBy: Date | null; allocatedAt: Date | null; firstOperatedAt: Date | null; forfeitureFlaggedAt: Date | null }>(app: T, now = new Date()) {
    return { ...app, mobilisation: mobilisationView(app, now) };
  }

  async list(companyId: string, filters: { status?: string; corridorCode?: string } = {}) {
    await this.assertEntitled(companyId);
    const where: Prisma.RailSlotApplicationWhereInput = { companyId };
    if (filters.status) where.status = filters.status as RailSlotApplicationStatus;
    if (filters.corridorCode) where.corridorCode = filters.corridorCode;
    const rows = await this.prisma.railSlotApplication.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    const now = new Date();
    return rows.map((r) => this.withClock(r, now));
  }

  private async getOrThrow(companyId: string, id: string) {
    const app = await this.prisma.railSlotApplication.findFirst({ where: { id, companyId } });
    if (!app) throw new NotFoundException('Slot application not found');
    return app;
  }

  async get(companyId: string, id: string) {
    await this.assertEntitled(companyId);
    return this.withClock(await this.getOrThrow(companyId, id));
  }

  /** Side-effect-free "can this be submitted, and if not why not" — the same gates `submit` enforces. */
  async readiness(companyId: string, id: string, asOf = new Date()) {
    await this.assertEntitled(companyId);
    const app = await this.getOrThrow(companyId, id);
    return this.evaluateReadiness(companyId, app, asOf);
  }

  private async evaluateReadiness(companyId: string, app: Awaited<ReturnType<RailSlotService['getOrThrow']>>, asOf: Date) {
    const docs = await this.prisma.railOperatorComplianceDoc.findMany({ where: { companyId } });
    const compliance = evaluateCompliance(docs, 'SUBMIT', { carriesDangerousGoods: app.isDangerousGoods }, asOf);
    const answers = ((app.selfScreening as { answers?: SelfScreeningAnswer[] } | null)?.answers ?? []) as SelfScreeningAnswer[];
    const selfScreening = evaluateSelfScreening(answers);
    const corridor = (await this.corridors()).find((c) => c.code === app.corridorCode);
    const envelope = checkEnvelope(corridor, [this.subjectOfApplication(app)], asOf);
    const window = checkValidityWindow(app.requestedFrom, app.requestedUntil);
    // Advisory: reported so the applicant can see the corridor's headroom, but
    // never a blocker — the infrastructure manager decides what is allocated,
    // and applying for more than you expect to be granted is legitimate.
    const capacity = await this.capacityForApplication(companyId, app);

    const blockers: string[] = [];
    if (!selfScreening.complete) blockers.push(`Annexure 25 self-screening is incomplete (unanswered: ${selfScreening.unanswered.join(', ') || 'none'}${selfScreening.unknownQuestions.length ? `; unknown: ${selfScreening.unknownQuestions.join(', ')}` : ''}).`);
    if (selfScreening.missingRemarks.length) blockers.push(`Annexure 25 "No" answers need remarks (${selfScreening.missingRemarks.join(', ')}).`);
    blockers.push(...compliance.blockers.map((b) => `Compliance — ${b}`));
    if (envelope.status === 'INCOMPATIBLE') blockers.push(...envelope.violations.map((v) => `Corridor envelope — ${v.message}`));
    if (!window.ok) blockers.push(window.reason as string);
    return {
      ready: blockers.length === 0 && app.status === 'DRAFT',
      status: app.status,
      blockers,
      selfScreening,
      compliance,
      envelope,
      window,
      capacity,
      /** UNVERIFIED does not block, but it is shown so the applicant knows the IM, not FlowOps, confirmed the fit. */
      notes: envelope.status === 'UNVERIFIED' ? ['The corridor envelope could not be verified — submission is allowed, but FlowOps has not confirmed that the rolling stock fits.'] : [],
    };
  }

  async overview(companyId: string, now = new Date()) {
    await this.assertEntitled(companyId);
    const [apps, docs, completeness] = await Promise.all([
      this.prisma.railSlotApplication.findMany({ where: { companyId } }),
      this.prisma.railOperatorComplianceDoc.findMany({ where: { companyId } }),
      this.completeness(),
    ]);
    const byStatus: Record<string, number> = {};
    const byClock: Record<string, number> = {};
    const attention: Array<ReturnType<RailSlotService['withClock']>> = [];
    for (const a of apps) {
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      const v = mobilisationView(a, now);
      byClock[v.state] = (byClock[v.state] ?? 0) + 1;
      if (v.state === 'DUE_SOON' || v.state === 'OVERDUE' || v.state === 'FORFEITURE_FLAGGED') attention.push(this.withClock(a, now));
    }
    return {
      generatedAt: now.toISOString(),
      applications: { total: apps.length, byStatus, byMobilisationState: byClock, needingAttention: attention.slice(0, 10) },
      compliance: {
        rsrPermit: rsrPermitGuard(docs, now),
        submit: evaluateCompliance(docs, 'SUBMIT', {}, now),
        operate: evaluateCompliance(docs, 'OPERATE', {}, now),
      },
      reference: completeness,
    };
  }

  // ── slot applications: writes ──────────────────────────────────────────────

  private async nextApplicationNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.railSlotApplication.count({ where: { companyId, createdAt: { gte: new Date(year, 0, 1) } } });
    return `SA-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private assertWindow(from: Date, until: Date): void {
    const w = checkValidityWindow(from, until);
    if (!w.ok) throw new BadRequestException(w.reason);
  }

  async createApplication(companyId: string, dto: CreateSlotApplicationDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    await this.corridorOrThrow(dto.corridorCode);
    await this.assertYardCodes(dto.originYardCode, dto.destinationYardCode);
    const requestedFrom = this.toDate(dto.requestedFrom, 'requestedFrom') as Date;
    const requestedUntil = this.toDate(dto.requestedUntil, 'requestedUntil') as Date;
    this.assertWindow(requestedFrom, requestedUntil);

    let created: Awaited<ReturnType<typeof this.prisma.railSlotApplication.create>> | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const applicationNumber = await this.nextApplicationNumber(companyId);
      try {
        created = await this.prisma.withTenant(companyId, async (tx) => {
          const row = await tx.railSlotApplication.create({
            data: {
              companyId, applicationNumber, status: 'DRAFT', corridorCode: dto.corridorCode,
              originName: dto.originName ?? null, destinationName: dto.destinationName ?? null,
              originYardCode: dto.originYardCode ?? null, destinationYardCode: dto.destinationYardCode ?? null,
              railOperator: dto.railOperator ?? null, imReference: dto.imReference ?? null, tractionType: dto.tractionType ?? null,
              commodity: dto.commodity ?? null, isDangerousGoods: dto.isDangerousGoods ?? false,
              trainsPerWeek: dto.trainsPerWeek ?? null, wagonsPerTrain: dto.wagonsPerTrain ?? null, annualTonnes: dto.annualTonnes ?? null,
              gauge: dto.gauge ?? null, axleLoadTonnes: dto.axleLoadTonnes ?? null, vehicleProfile: dto.vehicleProfile ?? null,
              trainLengthM: dto.trainLengthM ?? null, requestedFrom, requestedUntil,
              createdById: actor.id, createdByEmail: actor.email,
            },
          });
          await this.outbox.enqueue(tx, companyId, 'rail.slot.created', {
            applicationId: row.id, applicationNumber, corridorCode: dto.corridorCode,
            requestedFrom: requestedFrom.toISOString(), requestedUntil: requestedUntil.toISOString(),
            isDangerousGoods: dto.isDangerousGoods ?? false,
          });
          return row;
        });
      } catch (err: any) {
        // Two simultaneous creates can compute the same number; the unique index rejects the second — retry with a fresh count.
        if (err?.code !== 'P2002' || attempt === 2) throw err;
      }
    }
    const app = created as NonNullable<typeof created>;
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.SLOT_CREATED, { type: RAIL_AUDIT_TARGET.SLOT_APPLICATION, id: app.id, name: app.applicationNumber },
      { corridorCode: app.corridorCode, requestedFrom: requestedFrom.toISOString(), requestedUntil: requestedUntil.toISOString(), isDangerousGoods: app.isDangerousGoods });
    return this.withClock(app);
  }

  async updateApplication(companyId: string, id: string, dto: UpdateSlotApplicationDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const app = await this.getOrThrow(companyId, id);
    if (app.status !== 'DRAFT') throw new BadRequestException(`Only a DRAFT application can be edited (this one is ${app.status}).`);
    if (dto.corridorCode) await this.corridorOrThrow(dto.corridorCode);
    await this.assertYardCodes(dto.originYardCode, dto.destinationYardCode);
    const from = dto.requestedFrom ? (this.toDate(dto.requestedFrom, 'requestedFrom') as Date) : app.requestedFrom;
    const until = dto.requestedUntil ? (this.toDate(dto.requestedUntil, 'requestedUntil') as Date) : app.requestedUntil;
    this.assertWindow(from, until);
    const { requestedFrom: _f, requestedUntil: _u, ...rest } = dto;
    void _f; void _u;
    const updated = await this.prisma.railSlotApplication.update({
      where: { id },
      data: { ...rest, requestedFrom: from, requestedUntil: until, envelopeCheckStatus: null, envelopeCheck: Prisma.DbNull },
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.SLOT_UPDATED, { type: RAIL_AUDIT_TARGET.SLOT_APPLICATION, id, name: app.applicationNumber }, { fields: Object.keys(dto) });
    return this.withClock(updated);
  }

  /** Annexure 25 — the cover page of the application. Stored as answered; evaluated by the shared rules. */
  async setSelfScreening(companyId: string, id: string, dto: SelfScreeningDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const app = await this.getOrThrow(companyId, id);
    if (app.status !== 'DRAFT') throw new BadRequestException(`The self-screening form can only be changed while the application is DRAFT (this one is ${app.status}).`);
    const seen = new Set<string>();
    for (const a of dto.answers) {
      if (seen.has(a.no)) throw new BadRequestException(`Question (${a.no}) is answered twice.`);
      seen.add(a.no);
    }
    const evaluation = evaluateSelfScreening(dto.answers);
    const completedAt = evaluation.complete ? new Date() : null;
    const updated = await this.prisma.railSlotApplication.update({
      where: { id },
      data: {
        selfScreening: { version: SELF_SCREENING_VERSION, answers: dto.answers.map((a) => ({ no: a.no, answer: a.answer, remarks: a.remarks?.trim() || undefined })) } as unknown as Prisma.InputJsonValue,
        selfScreeningAccessType: dto.accessType ?? app.selfScreeningAccessType,
        selfScreeningCompletedAt: completedAt,
      },
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.SLOT_SELF_SCREENED, { type: RAIL_AUDIT_TARGET.SLOT_APPLICATION, id, name: app.applicationNumber },
      { complete: evaluation.complete, flagged: evaluation.flagged, unanswered: evaluation.unanswered, accessType: dto.accessType ?? null });
    return { application: this.withClock(updated), evaluation, questions: SELF_SCREENING_QUESTIONS.length };
  }

  /**
   * DRAFT → SUBMITTED. A formal commitment (an application fee is payable on submission, per
   * the register), so only an authorised representative may do it. Three hard gates, in this
   * order: Annexure 25 complete → compliance documents valid (an EXPIRED document blocks) →
   * corridor envelope not INCOMPATIBLE. An UNVERIFIED envelope is recorded, not blocked.
   */
  async submit(companyId: string, id: string, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    assertSignatoryRole(actor, 'Submitting a slot application');
    const app = await this.getOrThrow(companyId, id);
    if (!canTransition(app.status, 'SUBMITTED')) throw new BadRequestException(`Only a DRAFT application can be submitted (this one is ${app.status}).`);

    const r = await this.evaluateReadiness(companyId, app, now);
    if (r.blockers.length) {
      throw new BadRequestException(`Cannot submit ${app.applicationNumber}: ${r.blockers.join(' ')}`);
    }
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      const u = await tx.railSlotApplication.update({
        where: { id },
        data: {
          status: 'SUBMITTED', submittedAt: now, envelopeCheckStatus: r.envelope.status,
          envelopeCheck: r.envelope as unknown as Prisma.InputJsonValue, complianceSnapshot: r.compliance as unknown as Prisma.InputJsonValue,
          // Advisory snapshot: what the corridor looked like at the moment of
          // submitting, so the decision can be reviewed later against the
          // headroom that existed when it was taken.
          capacityCheckStatus: r.capacity.status,
          capacityCheck: r.capacity as unknown as Prisma.InputJsonValue,
        },
      });
      await this.outbox.enqueue(tx, companyId, 'rail.slot.submitted', {
        applicationId: id, applicationNumber: app.applicationNumber, corridorCode: app.corridorCode,
        envelopeStatus: r.envelope.status, isDangerousGoods: app.isDangerousGoods,
        capacityStatus: r.capacity.status,
        requestedFrom: app.requestedFrom.toISOString(), requestedUntil: app.requestedUntil.toISOString(),
      });
      return u;
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.SLOT_SUBMITTED, { type: RAIL_AUDIT_TARGET.SLOT_APPLICATION, id, name: app.applicationNumber },
      { envelopeStatus: r.envelope.status, complianceSatisfied: r.compliance.satisfied, selfScreeningFlags: r.selfScreening.flagged, capacityStatus: r.capacity.status });
    return { application: this.withClock(updated), readiness: r };
  }

  private async transition(
    companyId: string, id: string, to: RailSlotApplicationStatus, actor: RailActor, action: string,
    patch: Prisma.RailSlotApplicationUpdateInput, metadata: (app: { applicationNumber: string; status: RailSlotApplicationStatus }) => Record<string, unknown> = () => ({}),
    guard?: (app: Awaited<ReturnType<RailSlotService['getOrThrow']>>) => void,
    now: Date = new Date(),
    event?: FlowOpsEvent,
  ) {
    await this.assertEntitled(companyId);
    const app = await this.getOrThrow(companyId, id);
    if (!canTransition(app.status, to)) throw new BadRequestException(`An application cannot move from ${app.status} to ${to}.`);
    guard?.(app);
    // The status change and its outbox event commit atomically: a webhook
    // subscriber can never observe an event for a change that rolled back (or
    // miss one because the process died after commit).
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      // Compare-and-set on the status the guard above was checked against.
      // The read that passed the guard happened before this transaction
      // opened, so two operators acting on the same application both passed
      // it, both wrote, and both published — subscribers saw one transition
      // announced twice. A losing caller now writes nothing and emits nothing.
      const { count } = await tx.railSlotApplication.updateMany({
        where: { id, companyId, status: app.status },
        data: { ...patch, status: to },
      });
      if (count === 0) {
        throw new ConflictException(
          `This application was already moved from ${app.status} by someone else.`,
        );
      }
      const u = await tx.railSlotApplication.findFirstOrThrow({ where: { id, companyId } });
      if (event) {
        await this.outbox.enqueue(tx, companyId, event, {
          applicationId: id, applicationNumber: app.applicationNumber,
          corridorCode: app.corridorCode, from: app.status, to,
        });
      }
      return u;
    });
    await this.record(companyId, actor, action, { type: RAIL_AUDIT_TARGET.SLOT_APPLICATION, id, name: app.applicationNumber }, { from: app.status, to, ...metadata(app) });
    return this.withClock(updated, now);
  }

  startAssessment(companyId: string, id: string, actor: RailActor) {
    return this.transition(companyId, id, 'UNDER_ASSESSMENT', actor, RAIL_AUDIT_ACTION.SLOT_ASSESSMENT_STARTED, { assessmentStartedAt: new Date(), conflictNote: null });
  }

  /** UNDER_ASSESSMENT → CAPACITY_CONFLICT, or CAPACITY_CONFLICT → UNDER_ASSESSMENT when resolved. */
  flagCapacityConflict(companyId: string, id: string, dto: ConflictDto, actor: RailActor) {
    return this.transition(companyId, id, 'CAPACITY_CONFLICT', actor, RAIL_AUDIT_ACTION.SLOT_CAPACITY_CONFLICT,
      { conflictFlaggedAt: new Date(), conflictNote: dto.note.trim() }, () => ({ note: dto.note.trim().slice(0, 500) }),
      undefined, undefined, 'rail.slot.capacity_conflict');
  }

  resolveCapacityConflict(companyId: string, id: string, actor: RailActor) {
    return this.transition(companyId, id, 'UNDER_ASSESSMENT', actor, RAIL_AUDIT_ACTION.SLOT_CONFLICT_RESOLVED, { conflictNote: null },
      undefined, undefined, undefined, 'rail.slot.conflict_resolved');
  }

  // ── Corridor capacity ─────────────────────────────────────────────────────
  //
  // Slot applications ask for trainsPerWeek on a corridor over a window, and
  // the lifecycle runs right through to ALLOCATED. What this service never had
  // was any notion of how much the corridor can carry, so the only signal that
  // a corridor was over-committed was `conflictNote`: free text, written by a
  // human who happened to notice. Two applications could sit in ALLOCATED on
  // the same corridor over the same dates and nothing would object.
  //
  // A train path occupies one slot on EVERY section it traverses, so a route's
  // ceiling is its BOTTLENECK section — never the sum of its sections. The
  // theoretical figure is what that bottleneck can pass; the practical figure
  // applies a capacity factor, because a timetable at 100% of theoretical is
  // one delay away from collapse.
  //
  // The check is ADVISORY and never blocks a submission. The infrastructure
  // manager decides what is allocated, and operators legitimately apply for
  // more than they expect to be granted. What this adds is that they can see
  // it — before they apply, and after they hold it.
  //
  // Tenant-scoped on purpose: FlowOps can see no other operator's applications
  // and must not imply knowledge of what has been allocated to them, so this
  // measures THIS operator's own commitments. A corridor with no statement
  // yields UNKNOWN rather than a number nobody can stand behind.

  /** Annexure 33b's own capacity factor. Stored per statement, not assumed. */
  static readonly CAPACITY_FACTOR_DEFAULT = 0.65;

  /** Utilisation above this is TIGHT; above 1.0 is OVERSUBSCRIBED. */
  static readonly CAPACITY_TIGHT_THRESHOLD = 0.9;

  /** Statuses that consume corridor capacity because the IM has granted them. */
  private static readonly CAPACITY_COMMITTED: RailSlotApplicationStatus[] = ['ALLOCATED'];
  /** Statuses asking for capacity that has not been granted yet. */
  private static readonly CAPACITY_PENDING: RailSlotApplicationStatus[] = [
    'SUBMITTED', 'UNDER_ASSESSMENT', 'CAPACITY_CONFLICT',
  ];

  private static pathsPerDay(value: number, unit: RailCapacityUnit): number {
    return unit === 'TRAINS_PER_WEEK' ? value / 7 : value;
  }

  private static windowsOverlap(aFrom: Date, aUntil: Date, bFrom: Date, bUntil: Date): boolean {
    return aFrom.getTime() <= bUntil.getTime() && bFrom.getTime() <= aUntil.getTime();
  }

  async listCapacity(companyId: string, corridorCode?: string) {
    await this.assertEntitled(companyId);
    return this.prisma.railCorridorCapacity.findMany({
      where: { companyId, ...(corridorCode ? { corridorCode } : {}) },
      orderBy: [{ corridorCode: 'asc' }, { validFrom: 'asc' }],
    });
  }

  async upsertCapacity(companyId: string, dto: UpsertCorridorCapacityDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    await this.corridorOrThrow(dto.corridorCode);

    const validFrom = this.toDate(dto.validFrom, 'validFrom');
    const validUntil = this.toDate(dto.validUntil, 'validUntil');
    if (!validFrom || !validUntil) throw new BadRequestException('validFrom and validUntil are required.');
    if (validUntil.getTime() <= validFrom.getTime()) {
      throw new BadRequestException('validUntil must be after validFrom.');
    }

    const factor = dto.capacityFactor ?? RailSlotService.CAPACITY_FACTOR_DEFAULT;
    // Derived server-side: accepting it from the caller would let the two
    // figures contradict each other and make the headroom meaningless.
    const practicalPathsPerDay = dto.theoreticalPathsPerDay * factor;

    const data = {
      companyId,
      corridorCode: dto.corridorCode,
      validFrom,
      validUntil,
      theoreticalPathsPerDay: dto.theoreticalPathsPerDay,
      capacityFactor: factor,
      practicalPathsPerDay,
      unit: dto.unit ?? 'PATHS_PER_DAY',
      dataStatus: dto.dataStatus ?? 'SOURCE_PENDING',
      sourceRef: dto.sourceRef?.trim() || null,
      notes: dto.notes?.trim() || null,
      createdById: actor?.id ?? null,
      createdByEmail: actor?.email ?? null,
    };

    const saved = await this.prisma.railCorridorCapacity.upsert({
      where: {
        companyId_corridorCode_validFrom: {
          companyId, corridorCode: dto.corridorCode, validFrom,
        },
      },
      create: data,
      update: { ...data, createdById: undefined, createdByEmail: undefined },
    });

    await this.record(companyId, actor, RAIL_AUDIT_ACTION.CORRIDOR_CAPACITY_SET,
      { type: RAIL_AUDIT_TARGET.CORRIDOR_CAPACITY, id: saved.id, name: `${dto.corridorCode} ${validFrom.toISOString().slice(0, 10)}` },
      { theoreticalPathsPerDay: saved.theoreticalPathsPerDay, capacityFactor: factor, practicalPathsPerDay, dataStatus: saved.dataStatus });

    return saved;
  }

  async deleteCapacity(companyId: string, id: string, actor: RailActor) {
    await this.assertEntitled(companyId);
    const row = await this.prisma.railCorridorCapacity.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Corridor capacity statement not found.');
    await this.prisma.railCorridorCapacity.delete({ where: { id } });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.CORRIDOR_CAPACITY_CLEARED,
      { type: RAIL_AUDIT_TARGET.CORRIDOR_CAPACITY, id, name: `${row.corridorCode} ${row.validFrom.toISOString().slice(0, 10)}` }, {});
    return { deleted: true };
  }

  /**
   * How much of a corridor this tenant is already holding over a window.
   *
   * `trainsPerWeek` lets a caller ask "what would it look like if I also
   * applied for N trains?" without writing anything.
   */
  async capacityPreview(
    companyId: string,
    corridorCode: string,
    from: Date,
    until: Date,
    opts: { trainsPerWeek?: number | null; excludeApplicationId?: string } = {},
  ) {
    await this.assertEntitled(companyId);
    await this.corridorOrThrow(corridorCode);
    if (until.getTime() <= from.getTime()) {
      throw new BadRequestException('until must be after from.');
    }
    return this.evaluateCapacity(companyId, corridorCode, from, until, opts);
  }

  /** The computation, shared by the preview endpoint and the submission snapshot. */
  private async evaluateCapacity(
    companyId: string,
    corridorCode: string,
    from: Date,
    until: Date,
    opts: { trainsPerWeek?: number | null; excludeApplicationId?: string } = {},
  ) {
    const statements = await this.prisma.railCorridorCapacity.findMany({
      where: {
        companyId,
        corridorCode,
        validFrom: { lte: until },
        validUntil: { gte: from },
      },
      orderBy: { practicalPathsPerDay: 'asc' },
    });

    // Possessions take the corridor away for a while. Surfaced, never netted
    // off: how much a possession actually costs depends on whether it is a full
    // closure or single-line working, and inventing a factor would be a guess
    // dressed up as arithmetic.
    const possessions = await this.prisma.railPossessionWindow.findMany({
      where: {
        companyId,
        corridorCode,
        status: { in: ['PLANNED', 'ACTIVE'] },
        startsAt: { lte: until },
        endsAt: { gte: from },
      },
      orderBy: { startsAt: 'asc' },
    });

    const applications = await this.prisma.railSlotApplication.findMany({
      where: {
        companyId,
        corridorCode,
        status: { in: [...RailSlotService.CAPACITY_COMMITTED, ...RailSlotService.CAPACITY_PENDING] },
      },
      select: {
        id: true, applicationNumber: true, status: true, trainsPerWeek: true,
        requestedFrom: true, requestedUntil: true, validFrom: true, validUntil: true,
      },
    });

    let committedPathsPerDay = 0;
    let pendingPathsPerDay = 0;
    const contributing: Array<{ applicationNumber: string; status: string; pathsPerDay: number }> = [];

    for (const app of applications) {
      if (opts.excludeApplicationId && app.id === opts.excludeApplicationId) continue;
      // Allocated windows are the real ones; until then the requested window is
      // the only estimate available.
      const aFrom = app.validFrom ?? app.requestedFrom;
      const aUntil = app.validUntil ?? app.requestedUntil;
      if (!RailSlotService.windowsOverlap(aFrom, aUntil, from, until)) continue;

      const daily = (app.trainsPerWeek ?? 0) / 7;
      if (daily <= 0) continue;

      if (RailSlotService.CAPACITY_COMMITTED.includes(app.status)) committedPathsPerDay += daily;
      else pendingPathsPerDay += daily;
      contributing.push({ applicationNumber: app.applicationNumber, status: app.status, pathsPerDay: daily });
    }

    // No statement covering the window: say so rather than inventing a ceiling.
    if (statements.length === 0) {
      return {
        status: 'UNKNOWN' as const,
        corridorCode,
        from: from.toISOString(),
        until: until.toISOString(),
        declaredPathsPerDay: null,
        committedPathsPerDay,
        pendingPathsPerDay,
        thisApplicationPathsPerDay: opts.trainsPerWeek ? opts.trainsPerWeek / 7 : 0,
        demandPathsPerDay: committedPathsPerDay + pendingPathsPerDay + (opts.trainsPerWeek ? opts.trainsPerWeek / 7 : 0),
        headroomPathsPerDay: null,
        utilisation: null,
        statements: [],
        possessions: possessions.map((p) => ({ id: p.id, title: p.title, kind: p.kind, startsAt: p.startsAt, endsAt: p.endsAt })),
        contributing,
        reason: 'No capacity statement covers this corridor for that period, so no headroom can be stated. Add one to get a number.',
      };
    }

    // Where several statements overlap, the binding one is the most
    // restrictive — the corridor is only as strong as its weakest period.
    const binding = statements[0];
    const declaredPathsPerDay = RailSlotService.pathsPerDay(binding.practicalPathsPerDay, binding.unit);
    const thisApplication = opts.trainsPerWeek ? opts.trainsPerWeek / 7 : 0;
    const demand = committedPathsPerDay + pendingPathsPerDay + thisApplication;
    const utilisation = declaredPathsPerDay > 0 ? demand / declaredPathsPerDay : null;
    const headroom = declaredPathsPerDay - demand;

    let status: 'OK' | 'TIGHT' | 'OVERSUBSCRIBED';
    if (utilisation === null) status = 'OK';
    else if (utilisation > 1) status = 'OVERSUBSCRIBED';
    else if (utilisation > RailSlotService.CAPACITY_TIGHT_THRESHOLD) status = 'TIGHT';
    else status = 'OK';

    return {
      status,
      corridorCode,
      from: from.toISOString(),
      until: until.toISOString(),
      declaredPathsPerDay,
      theoreticalPathsPerDay: binding.theoreticalPathsPerDay,
      capacityFactor: binding.capacityFactor,
      dataStatus: binding.dataStatus,
      sourceRef: binding.sourceRef,
      committedPathsPerDay,
      pendingPathsPerDay,
      thisApplicationPathsPerDay: thisApplication,
      demandPathsPerDay: demand,
      headroomPathsPerDay: headroom,
      utilisation,
      statements: statements.map((st) => ({
        id: st.id,
        validFrom: st.validFrom.toISOString(),
        validUntil: st.validUntil.toISOString(),
        practicalPathsPerDay: RailSlotService.pathsPerDay(st.practicalPathsPerDay, st.unit),
        dataStatus: st.dataStatus,
        binding: st.id === binding.id,
      })),
      possessions: possessions.map((p) => ({ id: p.id, title: p.title, kind: p.kind, startsAt: p.startsAt, endsAt: p.endsAt })),
      contributing,
      reason: null,
    };
  }

  /** The capacity picture for one application, for the readiness payload and the snapshot. */
  private async capacityForApplication(
    companyId: string,
    app: { id: string; corridorCode: string; trainsPerWeek: number | null; requestedFrom: Date; requestedUntil: Date; validFrom: Date | null; validUntil: Date | null },
  ) {
    const from = app.validFrom ?? app.requestedFrom;
    const until = app.validUntil ?? app.requestedUntil;
    return this.evaluateCapacity(companyId, app.corridorCode, from, until, {
      trainsPerWeek: app.trainsPerWeek,
      excludeApplicationId: app.id,
    });
  }

  /**
   * Record the IM's allocation. Starts the 60-day mobilisation clock: mobilizeBy = allocatedAt + 60 days.
   * The validity window (defaults to the requested one) may not exceed 5 years.
   */
  async allocate(companyId: string, id: string, dto: AllocateApplicationDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    const app = await this.getOrThrow(companyId, id);
    const allocatedAt = this.toDate(dto.allocatedAt, 'allocatedAt') ?? now;
    if (allocatedAt.getTime() > now.getTime() + 86_400_000) throw new BadRequestException('allocatedAt cannot be in the future.');
    const validFrom = this.toDate(dto.validFrom, 'validFrom') ?? app.requestedFrom;
    const validUntil = this.toDate(dto.validUntil, 'validUntil') ?? app.requestedUntil;
    this.assertWindow(validFrom, validUntil);
    const mobilizeBy = computeMobilizeBy(allocatedAt);
    return this.transition(
      companyId, id, 'ALLOCATED', actor, RAIL_AUDIT_ACTION.SLOT_ALLOCATED,
      { allocatedAt, mobilizeBy, validFrom, validUntil, forfeitureFlaggedAt: null, ...(dto.imReference ? { imReference: dto.imReference } : {}) },
      () => ({ allocatedAt: allocatedAt.toISOString(), mobilizeBy: mobilizeBy.toISOString(), validFrom: validFrom.toISOString(), validUntil: validUntil.toISOString() }),
      undefined,
      now,
      'rail.slot.allocated',
    );
  }

  reject(companyId: string, id: string, dto: RejectApplicationDto, actor: RailActor) {
    return this.transition(companyId, id, 'REJECTED', actor, RAIL_AUDIT_ACTION.SLOT_REJECTED,
      { rejectedAt: new Date(), rejectionReason: dto.reason.trim() }, () => ({ reason: dto.reason.trim().slice(0, 500) }),
      undefined, undefined, 'rail.slot.rejected');
  }

  expire(companyId: string, id: string, actor: RailActor) {
    return this.transition(companyId, id, 'EXPIRED', actor, RAIL_AUDIT_ACTION.SLOT_EXPIRED, { expiredAt: new Date() }, (a) => ({ reason: 'manual', was: a.status }),
      undefined, undefined, 'rail.slot.expired');
  }

  /**
   * Record that the slot has run for the first time. This stops the forfeiture clock, so it is
   * gated by the stricter OPERATE document set — an expired permit cannot be used to "save" a slot.
   */
  async markOperated(companyId: string, id: string, dto: MarkOperatedDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    const app = await this.getOrThrow(companyId, id);
    if (app.status !== 'ALLOCATED') throw new BadRequestException(`Only an ALLOCATED application can be marked operated (this one is ${app.status}).`);
    if (app.firstOperatedAt) throw new BadRequestException('This application has already been marked as operated.');
    const docs = await this.prisma.railOperatorComplianceDoc.findMany({ where: { companyId } });
    const gate = evaluateCompliance(docs, 'OPERATE', { carriesDangerousGoods: app.isDangerousGoods }, now);
    if (!gate.ok) throw new BadRequestException(`Cannot record operation of ${app.applicationNumber}: ${gate.blockers.join(' ')}`);
    const operatedAt = this.toDate(dto.operatedAt, 'operatedAt') ?? now;
    if (operatedAt.getTime() > now.getTime() + 86_400_000) throw new BadRequestException('operatedAt cannot be in the future.');
    if (dto.consignmentId) await this.consignmentSubjects(companyId, dto.consignmentId); // tenant ownership
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      const u = await tx.railSlotApplication.update({
        where: { id },
        data: { firstOperatedAt: operatedAt, ...(dto.consignmentId ? { consignmentId: dto.consignmentId } : {}) },
      });
      await this.outbox.enqueue(tx, companyId, 'rail.slot.operated', {
        applicationId: id, applicationNumber: app.applicationNumber, corridorCode: app.corridorCode,
        operatedAt: operatedAt.toISOString(), consignmentId: dto.consignmentId ?? null,
      });
      return u;
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.SLOT_OPERATED, { type: RAIL_AUDIT_TARGET.SLOT_APPLICATION, id, name: app.applicationNumber },
      { operatedAt: operatedAt.toISOString(), mobilizeBy: app.mobilizeBy?.toISOString() ?? null, afterForfeitureFlag: !!app.forfeitureFlaggedAt, consignmentId: dto.consignmentId ?? null });
    return this.withClock(updated, now);
  }

  /** Attach a consignment to an ALLOCATED slot. REJECTS the link when its wagons violate the corridor's gauge or axle load. */
  async linkConsignment(companyId: string, id: string, dto: LinkConsignmentDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const app = await this.getOrThrow(companyId, id);
    if (app.status !== 'ALLOCATED') throw new BadRequestException(`A consignment can only be linked to an ALLOCATED application (this one is ${app.status}).`);
    const { consignment, subjects } = await this.consignmentSubjects(companyId, dto.consignmentId);
    const corridor = (await this.corridors()).find((c) => c.code === app.corridorCode);
    const envelope = checkEnvelope(corridor, subjects);
    if (envelope.status === 'INCOMPATIBLE') {
      throw new BadRequestException(`Consignment ${consignment.consignmentNumber} is not compatible with the ${corridor?.name ?? app.corridorCode} corridor: ${envelope.violations.map((v) => v.message).join(' ')}`);
    }
    const updated = await this.prisma.railSlotApplication.update({ where: { id }, data: { consignmentId: consignment.id } });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.SLOT_CONSIGNMENT_LINKED, { type: RAIL_AUDIT_TARGET.SLOT_APPLICATION, id, name: app.applicationNumber },
      { consignmentId: consignment.id, consignmentNumber: consignment.consignmentNumber, envelopeStatus: envelope.status, wagons: subjects.length });
    return { application: this.withClock(updated), envelope };
  }

  // ── compliance documents ───────────────────────────────────────────────────

  private withEffective<T extends { docType: any; status: any; validFrom: Date; validUntil: Date }>(doc: T, now = new Date()) {
    // Both computed on the server so the UI never re-derives a deadline from the browser clock.
    return { ...doc, effectiveStatus: effectiveDocStatus(doc, now), daysRemaining: daysUntilExpiry(doc, now) };
  }

  async listDocs(companyId: string, now = new Date()) {
    await this.assertEntitled(companyId);
    const docs = await this.prisma.railOperatorComplianceDoc.findMany({ where: { companyId }, orderBy: [{ docType: 'asc' }, { validUntil: 'desc' }] });
    return docs.map((d) => this.withEffective(d, now));
  }

  /** Summary for the compliance tab: RSR permit guard + what SUBMIT and OPERATE are currently missing. */
  async complianceSummary(companyId: string, now = new Date()) {
    await this.assertEntitled(companyId);
    const docs = await this.prisma.railOperatorComplianceDoc.findMany({ where: { companyId }, orderBy: [{ docType: 'asc' }, { validUntil: 'desc' }] });
    return {
      rsrPermit: rsrPermitGuard(docs, now),
      submit: evaluateCompliance(docs, 'SUBMIT', {}, now),
      submitWithDangerousGoods: evaluateCompliance(docs, 'SUBMIT', { carriesDangerousGoods: true }, now),
      operate: evaluateCompliance(docs, 'OPERATE', {}, now),
      documents: docs.map((d) => this.withEffective(d, now)),
    };
  }

  async createDoc(companyId: string, dto: CreateComplianceDocDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const validFrom = this.toDate(dto.validFrom, 'validFrom') as Date;
    const validUntil = this.toDate(dto.validUntil, 'validUntil') as Date;
    if (validUntil.getTime() < validFrom.getTime()) throw new BadRequestException('validUntil cannot be before validFrom.');
    const doc = await this.prisma.railOperatorComplianceDoc.create({
      data: {
        companyId, docType: dto.docType, status: 'PENDING_REVIEW', referenceNumber: dto.referenceNumber ?? null, issuer: dto.issuer ?? null,
        validFrom, validUntil, documentUrl: dto.documentUrl ?? null, notes: dto.notes ?? null, createdById: actor.id, createdByEmail: actor.email,
      },
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.COMPLIANCE_DOC_CREATED, { type: RAIL_AUDIT_TARGET.COMPLIANCE_DOC, id: doc.id, name: `${dto.docType}${dto.referenceNumber ? ` ${dto.referenceNumber}` : ''}` },
      { docType: dto.docType, validFrom: validFrom.toISOString(), validUntil: validUntil.toISOString() });
    return this.withEffective(doc);
  }

  private async getDocOrThrow(companyId: string, id: string) {
    const doc = await this.prisma.railOperatorComplianceDoc.findFirst({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Compliance document not found');
    return doc;
  }

  /** An authorised representative attests that the document is genuine and in date. It cannot verify an expired or revoked one. */
  async verifyDoc(companyId: string, id: string, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    assertSignatoryRole(actor, 'Verifying a compliance document');
    const doc = await this.getDocOrThrow(companyId, id);
    const eff = effectiveDocStatus(doc, now);
    if (eff === 'EXPIRED' || eff === 'REVOKED') throw new BadRequestException(`A ${eff.toLowerCase()} document cannot be verified. Enter the renewal instead.`);
    if (doc.status === 'VALID') throw new BadRequestException('This document is already verified.');
    // Verifying twice would re-stamp verifiedAt and, worse, record two audit
    // entries for one attestation and credit the second signatory for the
    // first one's check. The WHERE is what stops it: only the caller whose
    // UPDATE matches a still-unverified row gets to record the event.
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      await claimTransition(
        () => tx.railOperatorComplianceDoc.updateMany({
          where: { id, companyId, status: { not: 'VALID' } },
          data: { status: 'VALID', verifiedAt: now, verifiedById: actor.id, verifiedByEmail: actor.email },
        }),
        'This document was verified by someone else first.',
      );
      return tx.railOperatorComplianceDoc.findFirstOrThrow({ where: { id, companyId } });
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.COMPLIANCE_DOC_VERIFIED, { type: RAIL_AUDIT_TARGET.COMPLIANCE_DOC, id, name: doc.docType }, { docType: doc.docType, validUntil: doc.validUntil.toISOString() });
    return this.withEffective(updated, now);
  }

  async revokeDoc(companyId: string, id: string, dto: RevokeComplianceDocDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    assertSignatoryRole(actor, 'Revoking a compliance document');
    const doc = await this.getDocOrThrow(companyId, id);
    if (doc.status === 'REVOKED') throw new BadRequestException('This document is already revoked.');
    // Revocation is irreversible and the reason is evidence. Two signatories
    // revoking at once would both pass the pre-check, and the second write
    // would replace the first one's reason while keeping both audit entries —
    // leaving a record that says it was revoked for a reason nobody wrote.
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      await claimTransition(
        () => tx.railOperatorComplianceDoc.updateMany({
          where: { id, companyId, status: { not: 'REVOKED' } },
          data: { status: 'REVOKED', revokedAt: now, revokedReason: dto.reason.trim() },
        }),
        'This document was revoked by someone else first.',
      );
      return tx.railOperatorComplianceDoc.findFirstOrThrow({ where: { id, companyId } });
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.COMPLIANCE_DOC_REVOKED, { type: RAIL_AUDIT_TARGET.COMPLIANCE_DOC, id, name: doc.docType }, { docType: doc.docType, reason: dto.reason.trim().slice(0, 500) });
    return this.withEffective(updated, now);
  }

  // ── automatic sweeps (system actor) ────────────────────────────────────────

  /**
   * Hourly, platform-wide. (1) An ALLOCATED, never-operated slot past mobilizeBy gets the forfeiture
   * flag. (2) An ALLOCATED slot past its validity window becomes EXPIRED. Neither needs a user, so the
   * audit trail attributes them to the system.
   */
  async runMobilisationSweep(now = new Date()) {
    let forfeitureFlagged = 0;
    let expired = 0;

    const overdue = await this.prisma.railSlotApplication.findMany({
      where: { status: 'ALLOCATED', firstOperatedAt: null, forfeitureFlaggedAt: null, mobilizeBy: { lt: now } },
    });
    for (const app of overdue) {
      if (!isForfeitureDue(app, now)) continue;
      await this.prisma.railSlotApplication.update({ where: { id: app.id }, data: { forfeitureFlaggedAt: now } });
      forfeitureFlagged += 1;
      await this.recordSystem(app.companyId, RAIL_AUDIT_ACTION.SLOT_FORFEITURE_FLAGGED, { type: RAIL_AUDIT_TARGET.SLOT_APPLICATION, id: app.id, name: app.applicationNumber },
        { mobilizeBy: app.mobilizeBy?.toISOString() ?? null, allocatedAt: app.allocatedAt?.toISOString() ?? null });
      try {
        await this.prisma.aiEvent.create({
          data: {
            companyId: app.companyId, type: 'RAIL_SLOT_FORFEITURE_FLAG', severity: 'high', sourceType: 'RAIL_SLOT', sourceId: app.id,
            title: `${app.applicationNumber}: slot unoperated past the 60-day mobilisation window`,
            body: `Allocated ${app.allocatedAt?.toISOString().slice(0, 10)}, mobilise-by ${app.mobilizeBy?.toISOString().slice(0, 10)}. The slot is flagged for forfeiture.`,
          },
        });
      } catch { /* best-effort */ }
    }

    const ended = await this.prisma.railSlotApplication.findMany({ where: { status: 'ALLOCATED', validUntil: { lt: now } } });
    for (const app of ended) {
      if (!isValidityEnded(app, now)) continue;
      await this.prisma.railSlotApplication.update({ where: { id: app.id }, data: { status: 'EXPIRED', expiredAt: now } });
      expired += 1;
      await this.recordSystem(app.companyId, RAIL_AUDIT_ACTION.SLOT_EXPIRED, { type: RAIL_AUDIT_TARGET.SLOT_APPLICATION, id: app.id, name: app.applicationNumber },
        { reason: 'validity window ended', validUntil: app.validUntil?.toISOString() ?? null });
    }
    return { forfeitureFlagged, expired };
  }

  /** Persist EXPIRED on documents whose last valid day has passed (enforcement never relies on this — see effectiveDocStatus). */
  async runComplianceExpirySweep(now = new Date()) {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const stale = await this.prisma.railOperatorComplianceDoc.findMany({ where: { status: { in: ['VALID', 'PENDING_REVIEW'] }, validUntil: { lt: today } } });
    for (const d of stale) {
      await this.prisma.railOperatorComplianceDoc.update({ where: { id: d.id }, data: { status: 'EXPIRED' } });
      await this.recordSystem(d.companyId, RAIL_AUDIT_ACTION.COMPLIANCE_DOC_EXPIRED, { type: RAIL_AUDIT_TARGET.COMPLIANCE_DOC, id: d.id, name: d.docType }, { docType: d.docType, validUntil: d.validUntil.toISOString() });
    }
    return { expired: stale.length };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledSweeps() {
    try {
      const m = await this.runMobilisationSweep();
      const c = await this.runComplianceExpirySweep();
      if (m.forfeitureFlagged || m.expired || c.expired) {
        this.logger.log(`Rail sweeps: ${m.forfeitureFlagged} slot(s) flagged for forfeiture, ${m.expired} slot(s) expired, ${c.expired} document(s) expired.`);
      }
    } catch (err) {
      this.logger.warn(`Rail sweeps failed: ${err}`);
    }
  }
}
