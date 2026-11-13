import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DeviationStatus, EscalationStage, HandshakeReportStatus, Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../webhooks/outbox.service';
import {
  CreateHandshakeReportDto, UpdateHandshakeReportDto, LogDeviationDto,
  UpdateDeviationDto, ReviewDeviationDto, ResolveDeviationDto, SignOffReportDto,
} from './dto/handshake.dto';
import {
  RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, railSystemAuditEntry, recordRailAudit,
} from './rail-audit';
import { RAIL_SIGNATORY_ROLES } from './rail-roles';
import { RailNetworkService } from './rail-network.service';

/**
 * Daily Handshake service — Transnet Network Statement, Annexure 28.
 *
 * FlowOps gives the Train Operating Company (TOC) a clean, timestamped,
 * defensible record of every daily deviation reconciliation with the
 * Infrastructure Manager (IM): what happened, who was responsible, the slot
 * impact, and where each unresolved item sits on the escalation ladder
 * (24h → 48h → 72h/Route Logistics Forum → Regulator dispute). This is the
 * evidence a TOC needs to avoid paying for delays it did not cause.
 *
 * Company-scoped throughout. Gated behind the `rail` Enterprise entitlement,
 * mirroring RailService.
 */
@Injectable()
export class RailHandshakeService {
  private readonly logger = new Logger(RailHandshakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly networks: RailNetworkService,
  ) {}

  /** Best-effort audit write attributed to an authenticated user. */
  private record(companyId: string, actor: RailActor, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railAuditEntry(companyId, actor, action, target, metadata));
  }

  /** Best-effort audit write for a change the platform itself made (time-based escalation). */
  private recordSystem(companyId: string, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railSystemAuditEntry(companyId, action, target, metadata));
  }

  /**
   * Formal commitments (sign-off, resolution, Regulator dispute) are made by an
   * authorised representative, not by any user who can edit the report.
   */
  private assertSignatory(actor: RailActor, what: string): void {
    if (!RAIL_SIGNATORY_ROLES.includes(actor.role)) {
      throw new ForbiddenException(
        `${what} must be made by an authorised representative (${RAIL_SIGNATORY_ROLES.join(', ')}).`,
      );
    }
  }

  /**
   * Make user-typed (or user-profile) text safe to embed in the signatory
   * string: no control characters / line breaks (log + CSV forging), and no
   * `[ ] < >` so nobody can type a lookalike `[verified: …]` tag.
   */
  private cleanSignatoryText(value: unknown, max = 160): string {
    return String(value ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ')
      .replace(/[[\]<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  /**
   * The signatory string stored on the report: what the signer typed, followed
   * by the identity the SERVER verified from the JWT. The two can differ — that
   * is the point; the verified part cannot be forged from the request body.
   */
  buildVerifiedSignatory(typedName: string, actor: RailActor): string {
    const typed = this.cleanSignatoryText(typedName);
    if (!typed) throw new BadRequestException('signedOffBy must contain a name or role.');
    const name = this.cleanSignatoryText(actor.name, 120);
    const email = this.cleanSignatoryText(actor.email, 160);
    return `${typed} [verified: ${name} <${email}> (${actor.role})]`;
  }

  // ── Entitlement gate ─────────────────────────────────────────────────────

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException(
        'Rail & Intermodal is an Enterprise feature. Upgrade your plan to run daily handshake reconciliations.',
      );
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Tenant-scoped, year-prefixed report number: HS-2026-00042 */
  private async nextReportNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const count = await this.prisma.railHandshakeReport.count({
      where: { companyId, createdAt: { gte: yearStart } },
    });
    return `HS-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  /**
   * The escalation ladder from Annexure 28, read with NS §6.6.1.14.1,
   * §6.6.1.15.3 and §6.6.1.16. Given the time elapsed since the report window
   * closed, returns the stage an OPEN item should be at.
   *   ≤24h  → TRIM Access Seeker Liaison Manager
   *   ≤48h  → TRIM Head of Access Seeker Service
   *   ≤96h  → TRIM Head of Network Service Planning and Operations — reached
   *           at 72h and held until the 96h resolve-by expires
   *   >96h  → Route Logistics Forum, a later referral rather than a rung
   *
   * Two things this deliberately does not do. It never returns
   * REGULATOR_DISPUTE: lodging with the Regulator is a decision a person makes,
   * taken by lodgeDispute() once the item has been through the Forum, and the
   * clock must never make it for them. And it does not move an item to the
   * Forum at 72h — that rung belongs to the Head of NSP&O, who is entitled to
   * the full 96h to resolve before anyone refers the item onward.
   */
  /**
   * The report's ladder, resolved once per refresh.
   *
   * Reports raised before networks existed carry no networkId and fall through
   * to the default network, so their ladder is unchanged by this refactor.
   */
  private async ladderForReport(networkId: string | null | undefined, companyId?: string | null) {
    if (!networkId) {
      const fallback = await this.networks.defaultNetwork(companyId);
      return this.networks.ladderFor(fallback?.id ?? null);
    }
    return this.networks.ladderFor(networkId);
  }

  /**
   * The last rung whose holder is expected to actually resolve the item,
   * before it is referred onward: the highest rung that is neither a referral
   * nor manual-only.
   *
   * On Transnet this is the Head of NSP&O, who is entitled to the full 96
   * hours from the window end. The reason this is derived rather than named is
   * that the equivalent rung differs by network, and a deadline stamped
   * against the wrong one is a deadline that expires unchallenged.
   */
  private decisionRung(ladder: Awaited<ReturnType<RailNetworkService['ladderFor']>>) {
    const decidable = ladder.filter((r) => !r.isManualOnly && !r.isTerminal);
    return decidable.length > 0 ? decidable[decidable.length - 1] : null;
  }

  /** Annexure 28: the Head of NSP&O must resolve within 96h of the window closing. */
  private static readonly RESOLVE_BY_HOURS = 96;

  private resolveByFor(windowEnd: Date): Date {
    return new Date(windowEnd.getTime() + RailHandshakeService.RESOLVE_BY_HOURS * 3_600_000);
  }

  private hoursSince(d: Date): number {
    return (Date.now() - d.getTime()) / 3_600_000;
  }

  private async getReportOrThrow(companyId: string, reportId: string) {
    const report = await this.prisma.railHandshakeReport.findFirst({
      where: { id: reportId, companyId },
      include: { deviations: { orderBy: { createdAt: 'asc' } } },
    });
    if (!report) throw new NotFoundException('Handshake report not found');
    return report;
  }

  private async getDeviationOrThrow(companyId: string, reportId: string, deviationId: string) {
    const dev = await this.prisma.railHandshakeDeviation.findFirst({
      where: { id: deviationId, reportId, report: { companyId } },
      include: { report: { select: { status: true, reportNumber: true } } },
    });
    if (!dev) throw new NotFoundException('Deviation not found');
    return dev;
  }

  private assertReportStatus(
    status: HandshakeReportStatus,
    allowed: HandshakeReportStatus[],
    action: string,
  ): void {
    if (!allowed.includes(status)) {
      throw new BadRequestException(`${action} is not available while the report is ${status}.`);
    }
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  /** Create a daily handshake report for a 24h operating-day window. */
  async createReport(companyId: string, dto: CreateHandshakeReportDto, actor: RailActor) {
    await this.assertEntitled(companyId);

    // Default the operating day to "yesterday" (the IM issues the report at
    // 08:00 for the previous 24h). Window = 00:00→24:00 of the operating day.
    const day = dto.reportDate ? new Date(dto.reportDate) : new Date(Date.now() - 24 * 3_600_000);
    if (Number.isNaN(day.getTime())) throw new BadRequestException('Invalid reportDate');
    const windowStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
    const windowEnd = new Date(windowStart.getTime() + 24 * 3_600_000);

    const reportNumber = await this.nextReportNumber(companyId);
    const created = await this.prisma.withTenant(companyId, async (tx) => {
      const row = await tx.railHandshakeReport.create({
        data: {
          companyId,
          reportNumber,
          reportDate: windowStart,
          windowStart,
          windowEnd,
          railOperator: dto.railOperator ?? null,
          corridor: dto.corridor ?? null,
          imReference: dto.imReference ?? null,
          notes: dto.notes ?? null,
        },
        include: { deviations: true },
      });
      await this.outbox.enqueue(tx, companyId, 'rail.handshake.report_created', {
        reportId: row.id, reportNumber, reportDate: windowStart.toISOString(),
        corridor: dto.corridor ?? null, railOperator: dto.railOperator ?? null,
      });
      return row;
    });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.REPORT_CREATED,
      { type: RAIL_AUDIT_TARGET.HANDSHAKE_REPORT, id: created.id, name: reportNumber },
      { reportDate: windowStart.toISOString(), corridor: dto.corridor ?? null, railOperator: dto.railOperator ?? null },
    );
    return created;
  }

  async listReports(
    companyId: string,
    filters: { status?: string; corridor?: string } = {},
  ) {
    await this.assertEntitled(companyId);
    const where: Prisma.RailHandshakeReportWhereInput = { companyId };
    if (filters.status) where.status = filters.status as HandshakeReportStatus;
    if (filters.corridor) where.corridor = { contains: filters.corridor, mode: 'insensitive' };

    const reports = await this.prisma.railHandshakeReport.findMany({
      where,
      orderBy: { reportDate: 'desc' },
      take: 100,
      include: { _count: { select: { deviations: true } } },
    });

    // Attach lightweight roll-ups so the list is useful without N+1 fetches.
    const withCounts = await Promise.all(
      reports.map(async (r) => {
        const openCount = await this.prisma.railHandshakeDeviation.count({
          where: { reportId: r.id, status: { in: [DeviationStatus.OPEN, DeviationStatus.DISPUTED] } },
        });
        return { ...r, openItems: openCount };
      }),
    );
    return withCounts;
  }

  async getReport(companyId: string, reportId: string) {
    await this.assertEntitled(companyId);
    const report = await this.getReportOrThrow(companyId, reportId);
    // Recompute escalation stages on read so the ladder is always current.
    return this.withRefreshedEscalation(report);
  }

  async updateReport(companyId: string, reportId: string, dto: UpdateHandshakeReportDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const report = await this.getReportOrThrow(companyId, reportId);
    this.assertReportStatus(
      report.status,
      [HandshakeReportStatus.DRAFT, HandshakeReportStatus.PENDING_TOC],
      'Report metadata updates',
    );
    const updated = await this.prisma.railHandshakeReport.update({
      where: { id: reportId },
      data: {
        railOperator: dto.railOperator ?? report.railOperator,
        corridor: dto.corridor ?? report.corridor,
        imReference: dto.imReference ?? report.imReference,
        notes: dto.notes ?? report.notes,
      },
      include: { deviations: { orderBy: { createdAt: 'asc' } } },
    });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.REPORT_UPDATED,
      { type: RAIL_AUDIT_TARGET.HANDSHAKE_REPORT, id: reportId, name: report.reportNumber },
      { fields: Object.keys(dto) },
    );
    return updated;
  }

  /** IM issues the report to the TOC for review (DRAFT → PENDING_TOC). */
  async issueReport(companyId: string, reportId: string, actor: RailActor) {
    await this.assertEntitled(companyId);
    const report = await this.getReportOrThrow(companyId, reportId);
    if (report.status !== HandshakeReportStatus.DRAFT) {
      throw new BadRequestException('Only a DRAFT report can be issued for review.');
    }
    const issued = await this.prisma.withTenant(companyId, async (tx) => {
      // Compare-and-set on DRAFT. The guard above ran before this transaction
      // opened, so two operators issuing the same report both used to pass it
      // and both enqueue `report_issued` — subscribers saw one report issued
      // twice. A losing caller now emits nothing.
      const { count } = await tx.railHandshakeReport.updateMany({
        where: { id: reportId, companyId, status: HandshakeReportStatus.DRAFT },
        data: { status: HandshakeReportStatus.PENDING_TOC },
      });
      if (count === 0) {
        throw new ConflictException('This report was already issued by someone else.');
      }

      const row = await tx.railHandshakeReport.findFirstOrThrow({
        where: { id: reportId, companyId },
        include: { deviations: { orderBy: { createdAt: 'asc' } } },
      });
      await this.outbox.enqueue(tx, companyId, 'rail.handshake.report_issued', {
        reportId, reportNumber: report.reportNumber,
        from: report.status, to: HandshakeReportStatus.PENDING_TOC,
      });
      return row;
    });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.REPORT_ISSUED,
      { type: RAIL_AUDIT_TARGET.HANDSHAKE_REPORT, id: reportId, name: report.reportNumber },
      { from: report.status, to: HandshakeReportStatus.PENDING_TOC, deviations: report.deviations.length },
    );
    return issued;
  }

  /**
   * TOC signs off the report (Annexure 28 steps 11-12). Allowed even with OPEN
   * items — those remain flagged and continue up the escalation ladder. If any
   * item is DISPUTED the report is marked DISPUTED; if all resolved/agreed it
   * can be CLOSED, otherwise SIGNED_OFF.
   */
  async signOff(companyId: string, reportId: string, dto: SignOffReportDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    this.assertSignatory(actor, 'Signing off a handshake report');
    const report = await this.getReportOrThrow(companyId, reportId);
    if (report.status === HandshakeReportStatus.CLOSED) {
      throw new BadRequestException('Report is already closed.');
    }

    const anyDisputed = report.deviations.some((d) => d.status === DeviationStatus.DISPUTED);
    const anyUnresolved = report.deviations.some(
      (d) => d.status === DeviationStatus.OPEN || d.status === DeviationStatus.LOGGED,
    );
    const status = anyDisputed
      ? HandshakeReportStatus.DISPUTED
      : anyUnresolved
        ? HandshakeReportStatus.SIGNED_OFF
        : HandshakeReportStatus.CLOSED;

    // Bind the server-verified identity to whatever the signer typed.
    const signedOffBy = this.buildVerifiedSignatory(dto.signedOffBy, actor);

    const signed = await this.prisma.withTenant(companyId, async (tx) => {
      const row = await tx.railHandshakeReport.update({
        where: { id: reportId },
        data: { status, signedOffAt: new Date(), signedOffBy },
        include: { deviations: { orderBy: { createdAt: 'asc' } } },
      });
      await this.outbox.enqueue(tx, companyId, 'rail.handshake.signed_off', {
        reportId, reportNumber: report.reportNumber,
        from: report.status, to: status, signedOffBy,
      });
      return row;
    });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.REPORT_SIGNED_OFF,
      { type: RAIL_AUDIT_TARGET.HANDSHAKE_REPORT, id: reportId, name: report.reportNumber },
      {
        from: report.status,
        to: status,
        signedOffBy,
        openItems: report.deviations.filter((d) => d.status === DeviationStatus.OPEN || d.status === DeviationStatus.LOGGED).length,
        disputedItems: report.deviations.filter((d) => d.status === DeviationStatus.DISPUTED).length,
      },
    );
    return signed;
  }

  // ── Deviations ───────────────────────────────────────────────────────────

  async logDeviation(companyId: string, reportId: string, dto: LogDeviationDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const report = await this.getReportOrThrow(companyId, reportId);
    this.assertReportStatus(
      report.status,
      [HandshakeReportStatus.DRAFT, HandshakeReportStatus.PENDING_TOC],
      'Adding deviations',
    );

    // If a consignmentId is supplied, verify it belongs to this tenant.
    if (dto.consignmentId) {
      const owned = await this.prisma.railConsignment.findFirst({
        where: { id: dto.consignmentId, companyId },
        select: { id: true },
      });
      if (!owned) throw new BadRequestException('consignmentId does not belong to this tenant.');
    }

    const deviation = await this.prisma.withTenant(companyId, async (tx) => {
      const row = await tx.railHandshakeDeviation.create({
        data: {
          reportId,
          trainSlotRef: dto.trainSlotRef,
          orderNumber: dto.orderNumber ?? null,
          consignmentId: dto.consignmentId ?? null,
          ...(dto.category ? { category: dto.category } : {}),
          reason: dto.reason,
          rootCause: dto.rootCause ?? null,
          location: dto.location ?? null,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
          delayMinutes: dto.delayMinutes ?? null,
          ...(dto.responsibleParty ? { responsibleParty: dto.responsibleParty } : {}),
          ...(dto.slotImpact ? { slotImpact: dto.slotImpact } : {}),
          costZar: dto.costZar ?? null,
        },
      });
      await this.outbox.enqueue(tx, companyId, 'rail.handshake.deviation_logged', {
        reportId, reportNumber: report.reportNumber, deviationId: row.id,
        trainSlotRef: dto.trainSlotRef, category: dto.category ?? 'OTHER',
        responsibleParty: dto.responsibleParty ?? 'UNDETERMINED', delayMinutes: dto.delayMinutes ?? null,
      });
      return row;
    });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.DEVIATION_LOGGED,
      { type: RAIL_AUDIT_TARGET.HANDSHAKE_DEVIATION, id: deviation.id, name: dto.trainSlotRef },
      {
        reportId, reportNumber: report.reportNumber, category: dto.category ?? 'OTHER',
        responsibleParty: dto.responsibleParty ?? 'UNDETERMINED', delayMinutes: dto.delayMinutes ?? null,
        costZar: dto.costZar ?? null, consignmentId: dto.consignmentId ?? null,
      },
    );
    return deviation;
  }

  async updateDeviation(
    companyId: string, reportId: string, deviationId: string, dto: UpdateDeviationDto, actor: RailActor,
  ) {
    await this.assertEntitled(companyId);
    const dev = await this.getDeviationOrThrow(companyId, reportId, deviationId);
    this.assertReportStatus(
      dev.report.status,
      [HandshakeReportStatus.DRAFT, HandshakeReportStatus.PENDING_TOC],
      'Editing deviations',
    );
    if (dev.status !== DeviationStatus.LOGGED) {
      throw new BadRequestException('Only an unreviewed deviation can be edited.');
    }
    const updated = await this.prisma.railHandshakeDeviation.update({
      where: { id: deviationId },
      data: {
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        ...(dto.rootCause !== undefined ? { rootCause: dto.rootCause } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.occurredAt ? { occurredAt: new Date(dto.occurredAt) } : {}),
        ...(dto.delayMinutes !== undefined ? { delayMinutes: dto.delayMinutes } : {}),
        ...(dto.responsibleParty ? { responsibleParty: dto.responsibleParty } : {}),
        ...(dto.slotImpact ? { slotImpact: dto.slotImpact } : {}),
        ...(dto.costZar !== undefined ? { costZar: dto.costZar } : {}),
        ...(dto.costRecovered !== undefined ? { costRecovered: dto.costRecovered } : {}),
      },
    });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.DEVIATION_UPDATED,
      { type: RAIL_AUDIT_TARGET.HANDSHAKE_DEVIATION, id: deviationId, name: dev.trainSlotRef },
      { reportId, fields: Object.keys(dto) },
    );
    return updated;
  }

  /**
   * TOC review of a single deviation line (Annexure 28 steps 9-10).
   * Agree → AGREED. Disagree → OPEN (red-flagged), entering the escalation
   * ladder at the 24h stage with a required dispute reason.
   */
  async reviewDeviation(
    companyId: string, reportId: string, deviationId: string, dto: ReviewDeviationDto, actor: RailActor,
  ) {
    await this.assertEntitled(companyId);
    const dev = await this.getDeviationOrThrow(companyId, reportId, deviationId);
    this.assertReportStatus(dev.report.status, [HandshakeReportStatus.PENDING_TOC], 'Reviewing deviations');
    if (dev.status !== DeviationStatus.LOGGED) {
      throw new BadRequestException('Only a logged deviation can be reviewed.');
    }

    if (dto.agree) {
      const agreed = await this.prisma.withTenant(companyId, async (tx) => {
        // Compare-and-set on LOGGED, the status the guard above was checked
        // against. Two reviewers hitting Agree and Disagree at once used to
        // both write and both publish `deviation_reviewed` — subscribers saw
        // the same item come back AGREED *and* DISPUTED.
        const { count } = await tx.railHandshakeDeviation.updateMany({
          where: { id: deviationId, reportId, status: DeviationStatus.LOGGED },
          data: { status: DeviationStatus.AGREED, escalationStage: EscalationStage.NONE, disputeReason: null },
        });
        if (count === 0) {
          throw new ConflictException('This item was already reviewed by someone else.');
        }
        const row = await tx.railHandshakeDeviation.findFirstOrThrow({
          where: { id: deviationId, reportId },
        });
        await this.outbox.enqueue(tx, companyId, 'rail.handshake.deviation_reviewed', {
          reportId, reportNumber: dev.report.reportNumber, deviationId, trainSlotRef: dev.trainSlotRef,
          outcome: 'AGREED',
        });
        return row;
      });
      await this.record(
        companyId, actor, RAIL_AUDIT_ACTION.DEVIATION_AGREED,
        { type: RAIL_AUDIT_TARGET.HANDSHAKE_DEVIATION, id: deviationId, name: dev.trainSlotRef },
        { reportId },
      );
      return agreed;
    }

    if (!dto.disputeReason || !dto.disputeReason.trim()) {
      throw new BadRequestException('A dispute reason is required to flag an item as OPEN.');
    }
    const flagged = await this.prisma.withTenant(companyId, async (tx) => {
      const { count } = await tx.railHandshakeDeviation.updateMany({
        where: { id: deviationId, reportId, status: DeviationStatus.LOGGED },
        data: {
          status: DeviationStatus.OPEN,
          disputeReason: dto.disputeReason.trim(),
          escalationStage: EscalationStage.LIAISON_MANAGER_24H,
          escalatedAt: new Date(),
        },
      });
      if (count === 0) {
        throw new ConflictException('This item was already reviewed by someone else.');
      }
      const row = await tx.railHandshakeDeviation.findFirstOrThrow({
        where: { id: deviationId, reportId },
      });
      await this.outbox.enqueue(tx, companyId, 'rail.handshake.deviation_reviewed', {
        reportId, reportNumber: dev.report.reportNumber, deviationId, trainSlotRef: dev.trainSlotRef,
        outcome: 'DISPUTED', disputeReason: dto.disputeReason.trim().slice(0, 500),
      });
      return row;
    });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.DEVIATION_FLAGGED_OPEN,
      { type: RAIL_AUDIT_TARGET.HANDSHAKE_DEVIATION, id: deviationId, name: dev.trainSlotRef },
      { reportId, disputeReason: dto.disputeReason.trim().slice(0, 500), escalationStage: EscalationStage.LIAISON_MANAGER_24H },
    );
    return flagged;
  }

  /**
   * Recompute where each OPEN item sits on the ladder based on elapsed time
   * since the report window closed, and persist any changes. Called on read
   * and by the manual "run escalation" endpoint (a cron can call it too).
   */
  private async withRefreshedEscalation(
    report: Prisma.RailHandshakeReportGetPayload<{ include: { deviations: true } }>,
  ) {
    const updates: Promise<unknown>[] = [];
    // Resolve the ladder once per report, not once per deviation: every OPEN
    // item on a report shares a network and elapsed window, and a ladder read
    // per row would be an N+1 against a table that changes once a year.
    const elapsed = this.hoursSince(report.windowEnd);
    const ladder = await this.ladderForReport(report.networkId, report.companyId);
    const decisionRung = this.decisionRung(ladder);
    const rung = await this.networks.rungForElapsedHours(report.networkId, elapsed);

    const refreshed = report.deviations.map((d) => {
      if (d.status !== DeviationStatus.OPEN) return d;
      // The ladder comes from the report's network, not from a switch in this
      // file. A tenant working against another infrastructure manager climbs
      // that network's rungs, on that network's clock, to that network's
      // people — the Transnet ladder is one row set, not the definition.
      if (!rung) return d;
      const stage = rung.legacyStage ?? EscalationStage.NONE;
      // Whether to write. The stored stage is a faithful projection of the
      // rung, so an unchanged stage means the item is already on the right
      // rung — and rows predating the rung column carry a NULL id, which is
      // NOT treated as a move. Comparing the ids naively there would rewrite
      // every legacy row on first read and flood the audit trail with
      // escalations that never happened. The migration backfills the column.
      const rungChanged = d.escalationRungId != null && d.escalationRungId !== rung.id;
      if (stage !== d.escalationStage || rungChanged) {
        const fromStage = d.escalationStage; // capture before the write is issued
        // The resolve-by is stamped once, the first time the item reaches the
        // last decision-making rung — the final person entitled to resolve it
        // before the item is referred onward. It is never re-stamped: the
        // deadline is fixed from the window end, not from whenever we noticed.
        const reachedDecision = Boolean(decisionRung && rung.id === decisionRung.id);
        const resolveByAt =
          reachedDecision && !d.resolveByAt ? this.resolveByFor(report.windowEnd) : d.resolveByAt;
        updates.push(
          this.prisma.railHandshakeDeviation.update({
            where: { id: d.id },
            data: {
              escalationRungId: rung.id,
              escalationStage: stage,
              escalatedAt: new Date(),
              ...(reachedDecision && !d.resolveByAt ? { resolveByAt } : {}),
            },
          }),
        );
        // The ladder moves with the clock, not with a person — so the audit
        // trail attributes it to the system and records exactly when it moved.
        updates.push(
          this.recordSystem(
            report.companyId, RAIL_AUDIT_ACTION.DEVIATION_ESCALATED,
            { type: RAIL_AUDIT_TARGET.HANDSHAKE_DEVIATION, id: d.id, name: d.trainSlotRef },
            {
              reportId: report.id, reportNumber: report.reportNumber,
              from: fromStage, to: stage, elapsedHoursSinceWindowEnd: Math.round(elapsed * 100) / 100,
              resolveByAt: resolveByAt ? resolveByAt.toISOString() : null,
            },
          ),
        );
        return { ...d, escalationRungId: rung.id, escalationStage: stage, resolveByAt };
      }
      return d;
    });
    if (updates.length) await Promise.all(updates);
    return { ...report, deviations: refreshed };
  }

  /** Statuses whose OPEN items are still climbing the ladder. */
  private static readonly ACTIVE_REPORT_STATUSES = [
    HandshakeReportStatus.PENDING_TOC,
    HandshakeReportStatus.SIGNED_OFF,
    HandshakeReportStatus.DISPUTED,
  ];

  /** Recompute the ladder for a set of reports; returns how many changed. */
  private async escalateReports(
    reports: Prisma.RailHandshakeReportGetPayload<{ include: { deviations: true } }>[],
  ): Promise<number> {
    let moved = 0;
    for (const r of reports) {
      const before = r.deviations
        .filter((d) => d.status === DeviationStatus.OPEN)
        .map((d) => `${d.id}:${d.escalationStage}`)
        .join(',');
      const after = await this.withRefreshedEscalation(r);
      const afterKey = after.deviations
        .filter((d) => d.status === DeviationStatus.OPEN)
        .map((d) => `${d.id}:${d.escalationStage}`)
        .join(',');
      if (before !== afterKey) moved += 1;
    }
    return moved;
  }

  /** Escalate all OPEN items across all open reports for the tenant (manual). */
  async runEscalation(companyId: string, actor: RailActor) {
    await this.assertEntitled(companyId);
    const reports = await this.prisma.railHandshakeReport.findMany({
      where: { companyId, status: { in: RailHandshakeService.ACTIVE_REPORT_STATUSES } },
      include: { deviations: true },
    });
    const moved = await this.escalateReports(reports);
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.ESCALATION_RUN,
      { type: RAIL_AUDIT_TARGET.HANDSHAKE_REPORT, id: companyId, name: 'tenant escalation sweep' },
      { reportsScanned: reports.length, reportsChanged: moved },
    );
    return { reportsScanned: reports.length, reportsChanged: moved };
  }

  /**
   * Hourly platform-wide escalation sweep. Annexure 28 requires unresolved
   * red-flagged items to climb the 24h → 48h → 72h/RLF → Regulator ladder in
   * real time — this keeps the ladder current even if no one opens the page.
   * Runs across all tenants; no entitlement gate (system job).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledEscalationSweep() {
    try {
      const reports = await this.prisma.railHandshakeReport.findMany({
        where: { status: { in: RailHandshakeService.ACTIVE_REPORT_STATUSES } },
        include: { deviations: true },
      });
      if (reports.length === 0) return;
      const moved = await this.escalateReports(reports);
      if (moved > 0) {
        this.logger.log(`Handshake escalation sweep: ${moved}/${reports.length} report(s) advanced on the ladder.`);
      }
    } catch (err) {
      this.logger.warn(`Handshake escalation sweep failed: ${err}`);
    }
  }

  /** Resolve an OPEN item after escalation (agreement reached). */
  async resolveDeviation(
    companyId: string, reportId: string, deviationId: string, dto: ResolveDeviationDto, actor: RailActor,
  ) {
    await this.assertEntitled(companyId);
    this.assertSignatory(actor, 'Resolving a handshake deviation');
    const dev = await this.getDeviationOrThrow(companyId, reportId, deviationId);
    this.assertReportStatus(
      dev.report.status,
      [HandshakeReportStatus.PENDING_TOC, HandshakeReportStatus.SIGNED_OFF],
      'Resolving deviations',
    );
    if (dev.status !== DeviationStatus.OPEN) {
      throw new BadRequestException('Only an OPEN deviation can be resolved.');
    }
    const resolved = await this.prisma.withTenant(companyId, async (tx) => {
      // Compare-and-set on OPEN, the status the guard above was checked
      // against, and the first tenant context this path has had. Two operators
      // resolving the same item used to both write and both record an audit
      // entry — the trail then credited two people with one resolution.
      const { count } = await tx.railHandshakeDeviation.updateMany({
        where: { id: deviationId, reportId, status: DeviationStatus.OPEN },
        data: {
          status: DeviationStatus.RESOLVED,
          resolutionNote: dto.resolutionNote ?? null,
          ...(dto.responsibleParty ? { responsibleParty: dto.responsibleParty } : {}),
          // Annexure 28: monies debited within 24h of resolution.
          costRecovered: dto.costRecovered ?? dev.costRecovered,
          escalationStage: EscalationStage.NONE,
          resolvedAt: new Date(),
        },
      });
      if (count === 0) {
        throw new ConflictException(
          'This item was already resolved or disputed by someone else.',
        );
      }
      return tx.railHandshakeDeviation.findFirstOrThrow({ where: { id: deviationId, reportId } });
    });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.DEVIATION_RESOLVED,
      { type: RAIL_AUDIT_TARGET.HANDSHAKE_DEVIATION, id: deviationId, name: dev.trainSlotRef },
      {
        reportId, resolutionNote: dto.resolutionNote ? dto.resolutionNote.slice(0, 500) : null,
        responsibleParty: dto.responsibleParty ?? null, costRecovered: dto.costRecovered ?? dev.costRecovered,
      },
    );
    return resolved;
  }

  /**
   * Lodge an unresolved OPEN item as a dispute with the Regulator
   * (Annexure 28 final step). Only valid once it has climbed to the RLF stage.
   */
  async lodgeDispute(companyId: string, reportId: string, deviationId: string, actor: RailActor) {
    await this.assertEntitled(companyId);
    this.assertSignatory(actor, 'Lodging a dispute with the Regulator');
    const dev = await this.getDeviationOrThrow(companyId, reportId, deviationId);
    this.assertReportStatus(
      dev.report.status,
      [HandshakeReportStatus.PENDING_TOC, HandshakeReportStatus.SIGNED_OFF, HandshakeReportStatus.DISPUTED],
      'Lodging disputes',
    );
    if (dev.status !== DeviationStatus.OPEN) {
      throw new BadRequestException('Only an OPEN (red-flagged) item can be lodged as a dispute.');
    }
    const regulatorStages = [EscalationStage.ROUTE_LOGISTICS_FORUM, EscalationStage.REGULATOR_DISPUTE];
    if (!regulatorStages.some((stage) => stage === dev.escalationStage)) {
      throw new BadRequestException('A dispute can only be lodged after the item reaches the Route Logistics Forum stage.');
    }
    // The deviation and its parent report move together, or not at all.
    //
    // These were two separate statements with no enclosing transaction. Losing
    // the process between them left an item marked DISPUTED under a report that
    // was still PENDING_TOC — a document lodged with the Regulator that
    // disagrees with itself. Annexure 28 is a compliance record; the report
    // status is what gets read at audit, so the two must never diverge.
    //
    // Both writes are compare-and-set on the state the guards above were
    // checked against, so a second operator lodging the same dispute is refused
    // rather than writing over the first.
    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      const devCount = await tx.railHandshakeDeviation.updateMany({
        where: { id: deviationId, reportId, status: DeviationStatus.OPEN },
        data: { status: DeviationStatus.DISPUTED, escalationStage: EscalationStage.REGULATOR_DISPUTE },
      });
      if (devCount.count === 0) {
        throw new ConflictException(
          'This item was already resolved or disputed by someone else — nothing was lodged.',
        );
      }

      const reportCount = await tx.railHandshakeReport.updateMany({
        where: { id: reportId, companyId, status: dev.report.status },
        data: { status: HandshakeReportStatus.DISPUTED },
      });
      if (reportCount.count === 0) {
        throw new ConflictException(
          'The report changed while the dispute was being lodged — nothing was lodged.',
        );
      }

      return tx.railHandshakeDeviation.findFirstOrThrow({ where: { id: deviationId, reportId } });
    });

    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.DISPUTE_LODGED_REGULATOR,
      { type: RAIL_AUDIT_TARGET.HANDSHAKE_DEVIATION, id: deviationId, name: dev.trainSlotRef },
      { reportId, escalationStageAtLodging: dev.escalationStage },
    );
    return updated;
  }

  async removeDeviation(companyId: string, reportId: string, deviationId: string, actor: RailActor) {
    await this.assertEntitled(companyId);
    const dev = await this.getDeviationOrThrow(companyId, reportId, deviationId);
    this.assertReportStatus(
      dev.report.status,
      [HandshakeReportStatus.DRAFT, HandshakeReportStatus.PENDING_TOC],
      'Deleting deviations',
    );
    if (dev.status !== DeviationStatus.LOGGED) {
      throw new BadRequestException('Only an unreviewed deviation can be deleted.');
    }
    await this.prisma.railHandshakeDeviation.delete({ where: { id: deviationId } });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.DEVIATION_REMOVED,
      { type: RAIL_AUDIT_TARGET.HANDSHAKE_DEVIATION, id: deviationId, name: dev.trainSlotRef },
      { reportId, category: dev.category, reason: dev.reason.slice(0, 200) },
    );
    return { deleted: true };
  }

  // ── Command-centre overview ───────────────────────────────────────────────

  /** KPI roll-up for the handshake dashboard. */
  async overview(companyId: string) {
    await this.assertEntitled(companyId);

    const [reports, openItems, disputes] = await Promise.all([
      this.prisma.railHandshakeReport.count({ where: { companyId } }),
      this.prisma.railHandshakeDeviation.count({
        where: { report: { companyId }, status: DeviationStatus.OPEN },
      }),
      this.prisma.railHandshakeDeviation.count({
        where: { report: { companyId }, status: DeviationStatus.DISPUTED },
      }),
    ]);

    // Deviations grouped by responsible party (who's causing our pain).
    const byParty = await this.prisma.railHandshakeDeviation.groupBy({
      by: ['responsibleParty'],
      where: { report: { companyId } },
      _count: { _all: true },
      _sum: { delayMinutes: true, costZar: true },
    });

    // Cost exposure: unrecovered rand on items where the IM/another party is at fault.
    const exposure = await this.prisma.railHandshakeDeviation.aggregate({
      where: {
        report: { companyId },
        costRecovered: false,
        responsibleParty: { in: ['IM', 'ANOTHER_TOC', 'EXTERNAL'] as any },
      },
      _sum: { costZar: true },
    });

    // Items sitting at the Regulator stage or overdue.
    const atRegulator = await this.prisma.railHandshakeDeviation.count({
      where: { report: { companyId }, escalationStage: EscalationStage.REGULATOR_DISPUTE },
    });

    return {
      totalReports: reports,
      openItems,
      disputes,
      atRegulator,
      recoverableExposureZar: exposure._sum.costZar ?? 0,
      byResponsibleParty: byParty.map((p) => ({
        responsibleParty: p.responsibleParty,
        count: p._count._all,
        totalDelayMinutes: p._sum.delayMinutes ?? 0,
        totalCostZar: p._sum.costZar ?? 0,
      })),
    };
  }
}
