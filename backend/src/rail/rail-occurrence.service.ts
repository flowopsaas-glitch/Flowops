import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RailOccurrenceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import { RailHandshakeService } from './rail-handshake.service';
import { RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, recordRailAudit } from './rail-audit';
import { assertSignatoryRole } from './rail-roles';
import { CreateOccurrenceDto, NotifyOccurrenceDto, OccurrenceNoteDto } from './dto/rail-occurrence.dto';
import { responsiblePartyFor } from './rail-change.rules';
import { claimTransition } from '../common/state-transition';

/**
 * Safety / security occurrence reports (derailment, collision, OHTE / cable theft, SPAD, hazmat spill …),
 * linked to a Daily Handshake deviation and to the audit_logs row written when they are reported.
 *
 * Evidence: reporting chain and 48-hour preliminary report — register R-015.1 / R-015.5 (Annexures 36 and 41,
 * which define them, were NOT supplied). The brief cites "Annexure 13" for incidents; the register maps 13 to the
 * pantograph specification and 18 / 41 to occurrence management — see the audit ledger §1 row 6.
 */
export const PRELIMINARY_REPORT_HOURS = 48; // [REG R-015.5 — Annexure 36 not supplied; unverified]

const HOUR = 3_600_000;

/** Handshake deviation category per occurrence type — a FlowOps convenience mapping, not from a source. */
const DEVIATION_CATEGORY = {
  DERAILMENT: 'OTHER', COLLISION: 'OPERATIONAL', OHTE_CABLE_THEFT: 'SECURITY', SPAD: 'OPERATIONAL', HAZMAT_SPILL: 'OTHER', OTHER: 'OTHER',
} as const;

@Injectable()
export class RailOccurrenceService {
  private readonly logger = new Logger(RailOccurrenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly handshake: RailHandshakeService,
  ) {}

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException('Rail & Intermodal is an Enterprise feature. Upgrade your plan to record occurrences.');
    }
  }
  private record(companyId: string, actor: RailActor, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railAuditEntry(companyId, actor, action, target, metadata));
  }

  private withState<T extends { preliminaryReportDueAt: Date | null; preliminaryReportFiledAt: Date | null; status: RailOccurrenceStatus }>(o: T, now = new Date()) {
    const overdue = !!o.preliminaryReportDueAt && !o.preliminaryReportFiledAt && o.status !== 'CLOSED' && now.getTime() > o.preliminaryReportDueAt.getTime();
    return { ...o, preliminaryReportOverdue: overdue };
  }

  async list(companyId: string, filters: { status?: string } = {}, now = new Date()) {
    await this.assertEntitled(companyId);
    const where: Prisma.RailOccurrenceReportWhereInput = { companyId };
    if (filters.status) where.status = filters.status as RailOccurrenceStatus;
    const rows = await this.prisma.railOccurrenceReport.findMany({ where, orderBy: { occurredAt: 'desc' }, take: 200 });
    return rows.map((o) => this.withState(o, now));
  }

  private async getOrThrow(companyId: string, id: string) {
    const o = await this.prisma.railOccurrenceReport.findFirst({ where: { id, companyId } });
    if (!o) throw new NotFoundException('Occurrence report not found');
    return o;
  }

  async get(companyId: string, id: string) {
    await this.assertEntitled(companyId);
    return this.withState(await this.getOrThrow(companyId, id));
  }

  private async nextNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.railOccurrenceReport.count({ where: { companyId, createdAt: { gte: new Date(year, 0, 1) } } });
    return `OR-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async create(companyId: string, dto: CreateOccurrenceDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw new BadRequestException('occurredAt must be a valid date.');
    if (occurredAt.getTime() > now.getTime() + 5 * 60_000) throw new BadRequestException('occurredAt cannot be in the future.');

    if (dto.consignmentId && !(await this.prisma.railConsignment.findFirst({ where: { id: dto.consignmentId, companyId }, select: { id: true } }))) {
      throw new BadRequestException('consignmentId does not belong to this tenant.');
    }
    if (dto.handshakeReportId) {
      const report = await this.prisma.railHandshakeReport.findFirst({ where: { id: dto.handshakeReportId, companyId }, select: { id: true, status: true } });
      if (!report) throw new BadRequestException('handshakeReportId does not belong to this tenant.');
      if (report.status !== 'DRAFT' && report.status !== 'PENDING_TOC') throw new BadRequestException(`A deviation cannot be logged while the handshake report is ${report.status}.`);
    }

    let created: Awaited<ReturnType<typeof this.prisma.railOccurrenceReport.create>> | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const occurrenceNumber = await this.nextNumber(companyId);
      try {
        created = await this.prisma.railOccurrenceReport.create({
          data: {
            companyId, occurrenceNumber, type: dto.type, level: dto.level, status: 'REPORTED', corridorCode: dto.corridorCode ?? null, location: dto.location ?? null,
            trainSlotRef: dto.trainSlotRef ?? null, consignmentId: dto.consignmentId ?? null, occurredAt, description: dto.description.trim(),
            responsibleParty: dto.responsibleParty ?? 'UNDETERMINED', fatalities: !!dto.fatalities,
            // a hazmat spill is by definition a hazmat occurrence — the caller cannot un-flag it
            hazmatInvolved: dto.type === 'HAZMAT_SPILL' ? true : !!dto.hazmatInvolved,
            preliminaryReportDueAt: new Date(occurredAt.getTime() + PRELIMINARY_REPORT_HOURS * HOUR),
            createdById: actor.id, createdByEmail: actor.email,
          },
        });
      } catch (err: any) {
        if (err?.code !== 'P2002' || attempt === 2) throw err;
      }
    }
    let occ = created as NonNullable<typeof created>;

    // Link 1 — the Daily Handshake deviation
    let deviationId: string | null = null;
    if (dto.handshakeReportId) {
      const deviation = await this.handshake.logDeviation(companyId, dto.handshakeReportId, {
        trainSlotRef: dto.trainSlotRef ?? occ.occurrenceNumber,
        orderNumber: occ.occurrenceNumber,
        consignmentId: dto.consignmentId,
        category: DEVIATION_CATEGORY[dto.type],
        reason: `${dto.type.replace(/_/g, ' ').toLowerCase()} (${occ.occurrenceNumber}): ${dto.description.trim().slice(0, 300)}`,
        location: dto.location,
        occurredAt: occurredAt.toISOString(),
        responsibleParty: responsiblePartyFor(dto.responsibleParty ?? 'UNDETERMINED'),
      } as never, actor);
      deviationId = deviation.id;
    }

    // Link 2 — the audit_logs row (best-effort: null if the audit write failed)
    const auditLogId = await this.record(companyId, actor, RAIL_AUDIT_ACTION.OCCURRENCE_REPORTED, { type: RAIL_AUDIT_TARGET.OCCURRENCE, id: occ.id, name: occ.occurrenceNumber }, {
      type: dto.type, level: dto.level, occurredAt: occurredAt.toISOString(), corridorCode: dto.corridorCode ?? null, deviationId,
      fatalities: !!dto.fatalities, hazmatInvolved: occ.hazmatInvolved, preliminaryReportDueAt: occ.preliminaryReportDueAt?.toISOString() ?? null,
    });
    if (deviationId || auditLogId) {
      occ = await this.prisma.railOccurrenceReport.update({ where: { id: occ.id }, data: { deviationId, auditLogId } });
    }
    return this.withState(occ, now);
  }

  /** Record that the TCO (immediately, R-015.1) or the Regulator was told. */
  async notify(companyId: string, id: string, dto: NotifyOccurrenceDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    const o = await this.getOrThrow(companyId, id);
    if (o.status === 'CLOSED') throw new BadRequestException('A closed occurrence cannot be updated.');
    const at = dto.at ? new Date(dto.at) : now;
    if (Number.isNaN(at.getTime())) throw new BadRequestException('at must be a valid date.');
    if (at.getTime() > now.getTime() + 5 * 60_000) throw new BadRequestException('A notification time cannot be in the future.');
    const field = dto.to === 'TCO' ? 'reportedToTcoAt' : 'reportedToRsrAt';
    if (o[field]) throw new BadRequestException(`The ${dto.to} has already been recorded as notified.`);
    const updated = await this.prisma.railOccurrenceReport.update({ where: { id }, data: { [field]: at } });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.OCCURRENCE_NOTIFIED, { type: RAIL_AUDIT_TARGET.OCCURRENCE, id, name: o.occurrenceNumber },
      { to: dto.to, at: at.toISOString(), minutesAfterOccurrence: Math.round((at.getTime() - o.occurredAt.getTime()) / 60_000) });
    return this.withState(updated, now);
  }

  async startInvestigation(companyId: string, id: string, dto: OccurrenceNoteDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    const o = await this.getOrThrow(companyId, id);
    if (o.status !== 'REPORTED') throw new BadRequestException(`Only a REPORTED occurrence can move to UNDER_INVESTIGATION (this one is ${o.status}).`);
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      await claimTransition(
        () => tx.railOccurrenceReport.updateMany({
          where: { id, companyId, status: 'REPORTED' },
          data: { status: 'UNDER_INVESTIGATION', investigationNote: dto.note.trim() },
        }),
        'This occurrence has already moved past REPORTED — someone else started the investigation.',
      );
      return tx.railOccurrenceReport.findFirstOrThrow({ where: { id, companyId } });
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.OCCURRENCE_INVESTIGATION_STARTED, { type: RAIL_AUDIT_TARGET.OCCURRENCE, id, name: o.occurrenceNumber }, { note: dto.note.trim().slice(0, 500) });
    return this.withState(updated, now);
  }

  async filePreliminary(companyId: string, id: string, dto: OccurrenceNoteDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    const o = await this.getOrThrow(companyId, id);
    if (o.status !== 'REPORTED' && o.status !== 'UNDER_INVESTIGATION') throw new BadRequestException(`A preliminary report cannot be filed while the occurrence is ${o.status}.`);
    const late = !!o.preliminaryReportDueAt && now.getTime() > o.preliminaryReportDueAt.getTime();
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      // Re-read inside the transaction: the note is appended by concatenating
      // what is already there, so filing against a stale copy would silently
      // drop the other person's note. The note is part of the WHERE clause, so
      // if it changed underneath us the claim matches nothing and we say so
      // instead of overwriting.
      const fresh = await tx.railOccurrenceReport.findFirstOrThrow({ where: { id, companyId } });
      await claimTransition(
        () => tx.railOccurrenceReport.updateMany({
          where: {
            id, companyId,
            status: { in: ['REPORTED', 'UNDER_INVESTIGATION'] },
            investigationNote: fresh.investigationNote,
          },
          data: {
            status: 'PRELIMINARY_REPORT_FILED',
            preliminaryReportFiledAt: now,
            investigationNote: `${fresh.investigationNote ? `${fresh.investigationNote}\n` : ''}${dto.note.trim()}`,
          },
        }),
        'This occurrence changed while the preliminary report was being filed — reopen it and file again.',
      );
      return tx.railOccurrenceReport.findFirstOrThrow({ where: { id, companyId } });
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.OCCURRENCE_PRELIMINARY_FILED, { type: RAIL_AUDIT_TARGET.OCCURRENCE, id, name: o.occurrenceNumber },
      { late, dueAt: o.preliminaryReportDueAt?.toISOString() ?? null, filedAt: now.toISOString() });
    return this.withState(updated, now);
  }

  /** Closing is a formal act — authorised representatives only. */
  async close(companyId: string, id: string, dto: OccurrenceNoteDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    assertSignatoryRole(actor, 'Closing an occurrence report');
    const o = await this.getOrThrow(companyId, id);
    if (o.status === 'CLOSED') throw new BadRequestException('This occurrence is already closed.');
    if (!o.preliminaryReportFiledAt) throw new BadRequestException('File the preliminary report before closing the occurrence.');
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      const fresh = await tx.railOccurrenceReport.findFirstOrThrow({ where: { id, companyId } });
      await claimTransition(
        () => tx.railOccurrenceReport.updateMany({
          where: {
            id, companyId,
            status: { not: 'CLOSED' },
            investigationNote: fresh.investigationNote,
          },
          data: {
            status: 'CLOSED',
            closedAt: now,
            investigationNote: `${fresh.investigationNote ? `${fresh.investigationNote}\n` : ''}Closed: ${dto.note.trim()}`,
          },
        }),
        'This occurrence was closed by someone else, or changed while it was being closed.',
      );
      return tx.railOccurrenceReport.findFirstOrThrow({ where: { id, companyId } });
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.OCCURRENCE_CLOSED, { type: RAIL_AUDIT_TARGET.OCCURRENCE, id, name: o.occurrenceNumber }, { note: dto.note.trim().slice(0, 500) });
    return this.withState(updated, now);
  }
}
