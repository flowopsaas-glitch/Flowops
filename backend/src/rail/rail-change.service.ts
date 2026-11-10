import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RailAttribution, RailChangeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import { RailHandshakeService } from './rail-handshake.service';
import { RailNetworkService } from './rail-network.service';
import {
  RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, recordRailAudit,
} from './rail-audit';
import { assertSignatoryRole } from './rail-roles';
import { AllocatePartyDto, CreateChangeRequestDto, PreviewChangeRequestDto, ProposeAlternativeDto } from './dto/rail-change.dto';
import { CANCELLATION_CODE_CATALOG, CancellationCodeEntry } from './catalog/cancellation-codes.catalog';
import { CANCELLATION_INITIATORS, CANCELLATION_PROCESS_STEPS } from './catalog/cancellation-process.catalog';
import {
  RAIL_FLEX_WINDOWS, RoleLabels, TRANSNET_ROLE_LABELS, acknowledgementState, allowedAllocations, attributionFromParty,
  canChange, classifyNotice, evaluateConsequence, initiatorMismatch, noticeLateMinutes, responsiblePartyFor,
} from './rail-change.rules';

/** A cancellation code as the API returns it. */
export interface CodeView extends Omit<CancellationCodeEntry, 'possibleParties'> {
  possibleParties: string[];
  fromCatalog: boolean;
}

/**
 * Cancel / reschedule / re-plan requests (Annexure 20a) with Annexure 20b reasons, the 48 h / 72 h windows and
 * the commercial consequence (RAIL-013). Everything that decides a consequence is DERIVED here from the reason
 * code and the clock — the client cannot supply its own attribution or penalty.
 */
@Injectable()
export class RailChangeService {
  private readonly logger = new Logger(RailChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly handshake: RailHandshakeService,
    private readonly networks: RailNetworkService,
  ) {}

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException('Rail & Intermodal is an Enterprise feature. Upgrade your plan to manage cancellations and reschedules.');
    }
  }

  private record(companyId: string, actor: RailActor, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railAuditEntry(companyId, actor, action, target, metadata));
  }

  // ── reference ──────────────────────────────────────────────────────────────

  private toCodeView(row: any, fromCatalog: boolean): CodeView {
    return {
      code: row.code, sourceRow: row.sourceRow, reason: row.reason, responsibleParty: row.responsibleParty,
      possibleParties: [...(row.possibleParties ?? [])], sourceText: row.sourceText, fromCatalog,
    };
  }

  /** Seeded rows win; before the seeder has run, the code catalog (the seed's own source) is served. */
  async listCodes(companyId: string): Promise<CodeView[]> {
    await this.assertEntitled(companyId);
    return this.codes();
  }

  private async codes(): Promise<CodeView[]> {
    const rows = await this.prisma.railCancellationCode.findMany({ where: { isActive: true }, orderBy: { sourceRow: 'asc' } });
    return rows.length ? rows.map((r) => this.toCodeView(r, false)) : CANCELLATION_CODE_CATALOG.map((c) => this.toCodeView(c, true));
  }

  async windows(companyId: string) {
    await this.assertEntitled(companyId);
    return { windows: RAIL_FLEX_WINDOWS, initiators: CANCELLATION_INITIATORS, processSteps: CANCELLATION_PROCESS_STEPS };
  }

  // ── derivation (shared by preview and create) ──────────────────────────────

  private toDate(v: string | undefined | null, field: string): Date | null {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${field} is not a valid date.`);
    return d;
  }

  /**
   * The words this tenant's network uses for each role.
   *
   * Resolved once per request rather than per call site, and it never throws:
   * a network that cannot be read yields the Transnet wording, because an
   * operator asking who owes them a refund must get an answer even if the
   * catalogue is misconfigured.
   */
  private async roleLabelsFor(companyId?: string): Promise<RoleLabels> {
    try {
      const network = await this.networks.defaultNetwork(companyId ?? null);
      const raw = network?.roleLabels as Record<string, unknown> | null | undefined;
      if (!raw || typeof raw !== 'object') return {};
      const out: RoleLabels = {};
      for (const key of ['TRIM', 'TOC', 'FORCE_MAJEURE', 'UNDETERMINED', 'YARD_OPERATOR', 'PORT_TERMINAL_OPERATOR', 'PRASA_OTHER_IM'] as const) {
        const v = raw[key];
        if (typeof v === 'string' && v.trim() !== '') out[key] = v;
      }
      return out;
    } catch {
      return {};
    }
  }

  private async derive(dto: PreviewChangeRequestDto, now: Date, companyId?: string) {
    const code = (await this.codes()).find((c) => c.code === dto.cancellationCode);
    if (!code) throw new BadRequestException(`Unknown cancellation code "${dto.cancellationCode}" (Annexure 20b).`);
    const originalDeparture = this.toDate(dto.originalDeparture, 'originalDeparture');
    const proposedDeparture = this.toDate(dto.proposedDeparture, 'proposedDeparture');
    const eventOccurredAt = this.toDate(dto.eventOccurredAt, 'eventOccurredAt');
    if (eventOccurredAt && eventOccurredAt.getTime() > now.getTime() + 5 * 60_000) throw new BadRequestException('eventOccurredAt cannot be in the future.');

    const attribution = attributionFromParty(code.responsibleParty);
    // The wording a network uses for each role, resolved once per derive().
    // Calls into the database are kept out of the pure rules module, so the
    // rules stay testable and this stays a single read per request.
    const labels = await this.roleLabelsFor(companyId);
    const notice = classifyNotice(now, originalDeparture);
    const consequence = evaluateConsequence({
      attribution, hoursBeforeDeparture: notice.hoursBeforeDeparture, isPlannedOccupation: !!dto.isPlannedOccupation, replacementAccepted: undefined, labels,
    });
    const warnings: string[] = [];
    const mismatch = initiatorMismatch(dto.initiatedBy, attribution, labels);
    if (mismatch) warnings.push(mismatch);
    const late = noticeLateMinutes(eventOccurredAt, now);
    if (late !== null && late > 0) warnings.push(`Notice is ${late} minute(s) later than the ${RAIL_FLEX_WINDOWS.noticeWithinMinutes}-minute window in Annexure 20a.`);
    if (notice.noticeBand === 'UNKNOWN') warnings.push('No departure time was given, so the notice window and the 72-hour consequence cannot be determined.');
    if (dto.isPlannedOccupation && attribution !== 'TRIM') {
      // Falls back to Transnet's word for the role, so an unconfigured tenant
      // reads exactly the sentence they read before this change.
      warnings.push(`"Planned occupation" only affects ${labels.TRIM ?? TRANSNET_ROLE_LABELS.TRIM}-caused cancellations.`);
    }
    if (dto.kind !== 'CANCEL' && !proposedDeparture) warnings.push('A reschedule / re-plan normally names the proposed new departure.');
    return { code, attribution, originalDeparture, proposedDeparture, eventOccurredAt, notice, consequence, late, warnings };
  }

  /** Nothing is saved. */
  async preview(companyId: string, dto: PreviewChangeRequestDto, now = new Date()) {
    await this.assertEntitled(companyId);
    const d = await this.derive(dto, now, companyId);
    return {
      code: { code: d.code.code, reason: d.code.reason, sourceText: d.code.sourceText, responsibleParty: d.code.responsibleParty, possibleParties: d.code.possibleParties },
      attribution: d.attribution,
      isForceMajeure: d.attribution === 'FORCE_MAJEURE',
      notice: d.notice,
      noticeLateMinutes: d.late,
      consequence: d.consequence,
      warnings: d.warnings,
      needsClearinghouseAllocation: d.attribution === 'UNDETERMINED',
    };
  }

  // ── requests ───────────────────────────────────────────────────────────────

  private withClock<T extends { requestedAt: Date; acknowledgedAt: Date | null }>(row: T, now = new Date()) {
    return { ...row, acknowledgement: acknowledgementState(row.requestedAt, row.acknowledgedAt, now) };
  }

  async list(companyId: string, filters: { status?: string; consignmentId?: string } = {}, now = new Date()) {
    await this.assertEntitled(companyId);
    const where: Prisma.RailSlotChangeRequestWhereInput = { companyId };
    if (filters.status) where.status = filters.status as RailChangeStatus;
    if (filters.consignmentId) where.consignmentId = filters.consignmentId;
    const rows = await this.prisma.railSlotChangeRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map((r) => this.withClock(r, now));
  }

  private async getOrThrow(companyId: string, id: string) {
    const row = await this.prisma.railSlotChangeRequest.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Change request not found');
    return row;
  }

  async get(companyId: string, id: string) {
    await this.assertEntitled(companyId);
    return this.withClock(await this.getOrThrow(companyId, id));
  }

  private async nextNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.railSlotChangeRequest.count({ where: { companyId, createdAt: { gte: new Date(year, 0, 1) } } });
    return `CR-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async create(companyId: string, dto: CreateChangeRequestDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    const d = await this.derive(dto, now, companyId);

    // Everything the request points at must belong to THIS tenant.
    if (dto.consignmentId && !(await this.prisma.railConsignment.findFirst({ where: { id: dto.consignmentId, companyId }, select: { id: true } }))) {
      throw new BadRequestException('consignmentId does not belong to this tenant.');
    }
    if (dto.slotApplicationId && !(await this.prisma.railSlotApplication.findFirst({ where: { id: dto.slotApplicationId, companyId }, select: { id: true } }))) {
      throw new BadRequestException('slotApplicationId does not belong to this tenant.');
    }
    if (dto.handshakeReportId) {
      const report = await this.prisma.railHandshakeReport.findFirst({ where: { id: dto.handshakeReportId, companyId }, select: { id: true, status: true } });
      if (!report) throw new BadRequestException('handshakeReportId does not belong to this tenant.');
      if (report.status !== 'DRAFT' && report.status !== 'PENDING_TOC') throw new BadRequestException(`A deviation cannot be logged while the handshake report is ${report.status}.`);
    }

    let created: Awaited<ReturnType<typeof this.prisma.railSlotChangeRequest.create>> | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const requestNumber = await this.nextNumber(companyId);
      try {
        created = await this.prisma.railSlotChangeRequest.create({
          data: {
            companyId, requestNumber, kind: dto.kind, status: 'SUBMITTED', initiatedBy: dto.initiatedBy,
            cancellationCode: d.code.code, cancellationReason: d.code.reason, codeResponsibleParty: d.code.responsibleParty,
            attribution: d.attribution, isForceMajeure: d.attribution === 'FORCE_MAJEURE', isPlannedOccupation: !!dto.isPlannedOccupation,
            trainSlotRef: dto.trainSlotRef, slotApplicationId: dto.slotApplicationId ?? null, consignmentId: dto.consignmentId ?? null,
            originalDeparture: d.originalDeparture, proposedDeparture: d.proposedDeparture, eventOccurredAt: d.eventOccurredAt, requestedAt: now,
            noticeLateMinutes: d.late, hoursBeforeDeparture: d.notice.hoursBeforeDeparture, noticeBand: d.notice.noticeBand, commercialWindow: d.notice.commercialWindow,
            consequence: d.consequence.consequence, penaltyApplicable: d.consequence.penaltyApplicable, penaltyAgainst: d.consequence.penaltyAgainst,
            penaltyBasis: d.consequence.basis, requiresStaging: !!dto.requiresStaging, note: dto.note ?? null,
            createdById: actor.id, createdByEmail: actor.email,
          },
        });
      } catch (err: any) {
        if (err?.code !== 'P2002' || attempt === 2) throw err;
      }
    }
    let req = created as NonNullable<typeof created>;

    // Log it in the Daily Handshake as a deviation (Annexure 20a step 7).
    if (dto.handshakeReportId) {
      const deviation = await this.handshake.logDeviation(companyId, dto.handshakeReportId, {
        trainSlotRef: dto.trainSlotRef,
        orderNumber: req.requestNumber,
        consignmentId: dto.consignmentId,
        category: dto.kind === 'CANCEL' ? 'CANCELLATION' : 'RESCHEDULE',
        reason: `${d.code.reason} [${d.code.code}] — ${dto.kind.toLowerCase()} requested by ${dto.initiatedBy}`,
        rootCause: `Annexure 20b ${d.code.code}: ${d.code.sourceText}`,
        occurredAt: (d.eventOccurredAt ?? now).toISOString(),
        responsibleParty: responsiblePartyFor(d.attribution),
        slotImpact: dto.kind === 'CANCEL' ? 'CANCELLED' : 'RESCHEDULED',
      } as never, actor);
      req = await this.prisma.railSlotChangeRequest.update({ where: { id: req.id }, data: { handshakeReportId: dto.handshakeReportId, handshakeDeviationId: deviation.id } });
    }

    await this.record(companyId, actor, RAIL_AUDIT_ACTION.CHANGE_CREATED, { type: RAIL_AUDIT_TARGET.CHANGE_REQUEST, id: req.id, name: req.requestNumber }, {
      kind: dto.kind, initiatedBy: dto.initiatedBy, cancellationCode: d.code.code, attribution: d.attribution, noticeBand: d.notice.noticeBand,
      commercialWindow: d.notice.commercialWindow, consequence: d.consequence.consequence, penaltyApplicable: d.consequence.penaltyApplicable,
      handshakeDeviationId: req.handshakeDeviationId, warnings: d.warnings,
    });
    return { request: this.withClock(req, now), warnings: d.warnings, consequence: d.consequence, notice: d.notice };
  }

  /** Re-derive the consequence after a fact changed (replacement outcome, Clearinghouse allocation). */
  private reevaluate(req: { attribution: RailAttribution; hoursBeforeDeparture: number | null; isPlannedOccupation: boolean }, replacementAccepted: boolean | null | undefined) {
    return evaluateConsequence({ attribution: req.attribution, hoursBeforeDeparture: req.hoursBeforeDeparture, isPlannedOccupation: req.isPlannedOccupation, replacementAccepted });
  }

  private async move(
    companyId: string, id: string, to: RailChangeStatus, actor: RailActor, action: string, patch: (req: Awaited<ReturnType<RailChangeService['getOrThrow']>>) => Prisma.RailSlotChangeRequestUpdateInput,
    now: Date,
  ) {
    await this.assertEntitled(companyId);
    const req = await this.getOrThrow(companyId, id);
    if (!canChange(req.status, to)) throw new BadRequestException(`A change request cannot move from ${req.status} to ${to}.`);
    const updated = await this.prisma.railSlotChangeRequest.update({ where: { id }, data: { ...patch(req), status: to } });
    await this.record(companyId, actor, action, { type: RAIL_AUDIT_TARGET.CHANGE_REQUEST, id, name: req.requestNumber }, {
      from: req.status, to, consequence: updated.consequence, penaltyApplicable: updated.penaltyApplicable,
    });
    return this.withClock(updated, now);
  }

  /** The IM acknowledged the request (it owes this within 1 hour). */
  acknowledge(companyId: string, id: string, actor: RailActor, now = new Date()) {
    return this.move(companyId, id, 'ACKNOWLEDGED', actor, RAIL_AUDIT_ACTION.CHANGE_ACKNOWLEDGED, () => ({ acknowledgedAt: now }), now);
  }

  async proposeAlternative(companyId: string, id: string, dto: ProposeAlternativeDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId); // entitlement first — never leak validation detail to a tenant that cannot use the feature
    const proposed = this.toDate(dto.proposedDeparture, 'proposedDeparture');
    if (!proposed) throw new BadRequestException('proposedDeparture is required.');
    return this.move(companyId, id, 'ALTERNATIVE_PROPOSED', actor, RAIL_AUDIT_ACTION.CHANGE_ALTERNATIVE_PROPOSED,
      (req) => ({ proposedDeparture: proposed, note: dto.note ? `${req.note ? `${req.note}\n` : ''}${dto.note}` : req.note }), now);
  }

  /** The TOC accepted the replacement slot (step 14–16): any "replacement not accepted" remedy falls away. */
  accept(companyId: string, id: string, actor: RailActor, now = new Date()) {
    return this.move(companyId, id, 'ACCEPTED', actor, RAIL_AUDIT_ACTION.CHANGE_ACCEPTED, (req) => {
      const c = this.reevaluate(req, true);
      return { replacementAccepted: true, consequence: c.consequence, penaltyApplicable: c.penaltyApplicable, penaltyAgainst: c.penaltyAgainst, penaltyBasis: c.basis };
    }, now);
  }

  /** The cancellation stands (steps 18–21): no replacement was taken up. */
  confirmCancellation(companyId: string, id: string, actor: RailActor, now = new Date()) {
    return this.move(companyId, id, 'CANCELLED_CONFIRMED', actor, RAIL_AUDIT_ACTION.CHANGE_CANCELLATION_CONFIRMED, (req) => {
      const c = this.reevaluate(req, false);
      return { replacementAccepted: false, consequence: c.consequence, penaltyApplicable: c.penaltyApplicable, penaltyAgainst: c.penaltyAgainst, penaltyBasis: c.basis };
    }, now);
  }

  close(companyId: string, id: string, actor: RailActor, now = new Date()) {
    return this.move(companyId, id, 'CLOSED', actor, RAIL_AUDIT_ACTION.CHANGE_CLOSED, () => ({ closedAt: now }), now);
  }

  /**
   * Record the Clearinghouse's allocation of a "could be …" reason. This decides who bears a commercial
   * consequence, so only an authorised representative may do it, and only to a party the annexure names.
   */
  async allocateParty(companyId: string, id: string, dto: AllocatePartyDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    assertSignatoryRole(actor, 'Allocating a responsible party');
    const req = await this.getOrThrow(companyId, id);
    if (req.codeResponsibleParty !== 'ALLOCATION_REQUIRED') {
      throw new BadRequestException(`Annexure 20b already allocates "${req.cancellationReason}" — only a "could be …" reason is allocated at the Clearinghouse.`);
    }
    if (req.status === 'CLOSED') throw new BadRequestException('A closed change request cannot be re-allocated.');
    const code = (await this.codes()).find((c) => c.code === req.cancellationCode);
    const allowed = allowedAllocations(code?.possibleParties ?? []);
    if (!allowed.includes(dto.attribution)) {
      throw new BadRequestException(`Annexure 20b allows ${allowed.join(' / ') || 'no party'} for "${req.cancellationReason}", not ${dto.attribution}.`);
    }
    const next = { ...req, attribution: dto.attribution as RailAttribution };
    const c = this.reevaluate(next, req.replacementAccepted);
    const updated = await this.prisma.railSlotChangeRequest.update({
      where: { id },
      data: {
        attribution: dto.attribution, isForceMajeure: dto.attribution === 'FORCE_MAJEURE', consequence: c.consequence,
        penaltyApplicable: c.penaltyApplicable, penaltyAgainst: c.penaltyAgainst, penaltyBasis: c.basis,
        note: `${req.note ? `${req.note}\n` : ''}Clearinghouse allocation: ${dto.attribution} — ${dto.note.trim()}`,
      },
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.CHANGE_PARTY_ALLOCATED, { type: RAIL_AUDIT_TARGET.CHANGE_REQUEST, id, name: req.requestNumber },
      { from: req.attribution, to: dto.attribution, consequence: c.consequence, note: dto.note.trim().slice(0, 500) });
    return this.withClock(updated, now);
  }
}
