import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DeviationStatus, EscalationStage, HandshakeReportStatus, Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import {
  CreateHandshakeReportDto, UpdateHandshakeReportDto, LogDeviationDto,
  UpdateDeviationDto, ReviewDeviationDto, ResolveDeviationDto, SignOffReportDto,
} from './dto/handshake.dto';

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
  ) {}

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
   * The escalation ladder from Annexure 28. Given the time elapsed since the
   * report window closed, returns the stage an OPEN item should be at.
   *   ≤24h  → IM Customer Liaison Manager
   *   ≤48h  → IM Head of Customer Liaison
   *   ≤72h  → Route Logistics Forum
   *   >72h  → dispute lodged with the Regulator
   */
  private stageForElapsedHours(hours: number): EscalationStage {
    if (hours <= 24) return EscalationStage.LIAISON_MANAGER_24H;
    if (hours <= 48) return EscalationStage.HEAD_LIAISON_48H;
    if (hours <= 72) return EscalationStage.ROUTE_LOGISTICS_FORUM;
    return EscalationStage.REGULATOR_DISPUTE;
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
      include: { report: { select: { status: true } } },
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
  async createReport(companyId: string, dto: CreateHandshakeReportDto) {
    await this.assertEntitled(companyId);

    // Default the operating day to "yesterday" (the IM issues the report at
    // 08:00 for the previous 24h). Window = 00:00→24:00 of the operating day.
    const day = dto.reportDate ? new Date(dto.reportDate) : new Date(Date.now() - 24 * 3_600_000);
    if (Number.isNaN(day.getTime())) throw new BadRequestException('Invalid reportDate');
    const windowStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
    const windowEnd = new Date(windowStart.getTime() + 24 * 3_600_000);

    const reportNumber = await this.nextReportNumber(companyId);
    return this.prisma.railHandshakeReport.create({
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

  async updateReport(companyId: string, reportId: string, dto: UpdateHandshakeReportDto) {
    await this.assertEntitled(companyId);
    const report = await this.getReportOrThrow(companyId, reportId);
    this.assertReportStatus(
      report.status,
      [HandshakeReportStatus.DRAFT, HandshakeReportStatus.PENDING_TOC],
      'Report metadata updates',
    );
    return this.prisma.railHandshakeReport.update({
      where: { id: reportId },
      data: {
        railOperator: dto.railOperator ?? report.railOperator,
        corridor: dto.corridor ?? report.corridor,
        imReference: dto.imReference ?? report.imReference,
        notes: dto.notes ?? report.notes,
      },
      include: { deviations: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /** IM issues the report to the TOC for review (DRAFT → PENDING_TOC). */
  async issueReport(companyId: string, reportId: string) {
    await this.assertEntitled(companyId);
    const report = await this.getReportOrThrow(companyId, reportId);
    if (report.status !== HandshakeReportStatus.DRAFT) {
      throw new BadRequestException('Only a DRAFT report can be issued for review.');
    }
    return this.prisma.railHandshakeReport.update({
      where: { id: reportId },
      data: { status: HandshakeReportStatus.PENDING_TOC },
      include: { deviations: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /**
   * TOC signs off the report (Annexure 28 steps 11-12). Allowed even with OPEN
   * items — those remain flagged and continue up the escalation ladder. If any
   * item is DISPUTED the report is marked DISPUTED; if all resolved/agreed it
   * can be CLOSED, otherwise SIGNED_OFF.
   */
  async signOff(companyId: string, reportId: string, dto: SignOffReportDto) {
    await this.assertEntitled(companyId);
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

    return this.prisma.railHandshakeReport.update({
      where: { id: reportId },
      data: { status, signedOffAt: new Date(), signedOffBy: dto.signedOffBy },
      include: { deviations: { orderBy: { createdAt: 'asc' } } },
    });
  }

  // ── Deviations ───────────────────────────────────────────────────────────

  async logDeviation(companyId: string, reportId: string, dto: LogDeviationDto) {
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

    return this.prisma.railHandshakeDeviation.create({
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
  }

  async updateDeviation(
    companyId: string, reportId: string, deviationId: string, dto: UpdateDeviationDto,
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
    return this.prisma.railHandshakeDeviation.update({
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
  }

  /**
   * TOC review of a single deviation line (Annexure 28 steps 9-10).
   * Agree → AGREED. Disagree → OPEN (red-flagged), entering the escalation
   * ladder at the 24h stage with a required dispute reason.
   */
  async reviewDeviation(
    companyId: string, reportId: string, deviationId: string, dto: ReviewDeviationDto,
  ) {
    await this.assertEntitled(companyId);
    const dev = await this.getDeviationOrThrow(companyId, reportId, deviationId);
    this.assertReportStatus(dev.report.status, [HandshakeReportStatus.PENDING_TOC], 'Reviewing deviations');
    if (dev.status !== DeviationStatus.LOGGED) {
      throw new BadRequestException('Only a logged deviation can be reviewed.');
    }

    if (dto.agree) {
      return this.prisma.railHandshakeDeviation.update({
        where: { id: deviationId },
        data: { status: DeviationStatus.AGREED, escalationStage: EscalationStage.NONE, disputeReason: null },
      });
    }

    if (!dto.disputeReason || !dto.disputeReason.trim()) {
      throw new BadRequestException('A dispute reason is required to flag an item as OPEN.');
    }
    return this.prisma.railHandshakeDeviation.update({
      where: { id: deviationId },
      data: {
        status: DeviationStatus.OPEN,
        disputeReason: dto.disputeReason.trim(),
        escalationStage: EscalationStage.LIAISON_MANAGER_24H,
        escalatedAt: new Date(),
      },
    });
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
    const refreshed = report.deviations.map((d) => {
      if (d.status !== DeviationStatus.OPEN) return d;
      const elapsed = this.hoursSince(report.windowEnd);
      const stage = this.stageForElapsedHours(elapsed);
      if (stage !== d.escalationStage) {
        updates.push(
          this.prisma.railHandshakeDeviation.update({
            where: { id: d.id },
            data: { escalationStage: stage, escalatedAt: new Date() },
          }),
        );
        return { ...d, escalationStage: stage };
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
  async runEscalation(companyId: string) {
    await this.assertEntitled(companyId);
    const reports = await this.prisma.railHandshakeReport.findMany({
      where: { companyId, status: { in: RailHandshakeService.ACTIVE_REPORT_STATUSES } },
      include: { deviations: true },
    });
    const moved = await this.escalateReports(reports);
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
    companyId: string, reportId: string, deviationId: string, dto: ResolveDeviationDto,
  ) {
    await this.assertEntitled(companyId);
    const dev = await this.getDeviationOrThrow(companyId, reportId, deviationId);
    this.assertReportStatus(
      dev.report.status,
      [HandshakeReportStatus.PENDING_TOC, HandshakeReportStatus.SIGNED_OFF],
      'Resolving deviations',
    );
    if (dev.status !== DeviationStatus.OPEN) {
      throw new BadRequestException('Only an OPEN deviation can be resolved.');
    }
    return this.prisma.railHandshakeDeviation.update({
      where: { id: deviationId },
      data: {
        status: DeviationStatus.RESOLVED,
        resolutionNote: dto.resolutionNote ?? null,
        ...(dto.responsibleParty ? { responsibleParty: dto.responsibleParty } : {}),
        // Annexure 28: monies debited within 24h of resolution — flag recovery.
        costRecovered: dto.costRecovered ?? dev.costRecovered,
        escalationStage: EscalationStage.NONE,
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * Lodge an unresolved OPEN item as a dispute with the Regulator
   * (Annexure 28 final step). Only valid once it has climbed to the RLF stage.
   */
  async lodgeDispute(companyId: string, reportId: string, deviationId: string) {
    await this.assertEntitled(companyId);
    const dev = await this.getDeviationOrThrow(companyId, reportId, deviationId);
    this.assertReportStatus(
      dev.report.status,
      [HandshakeReportStatus.PENDING_TOC, HandshakeReportStatus.SIGNED_OFF, HandshakeReportStatus.DISPUTED],
      'Lodging disputes',
    );
    if (dev.status !== DeviationStatus.OPEN) {
      throw new BadRequestException('Only an OPEN (red-flagged) item can be lodged as a dispute.');
    }
    if (![EscalationStage.ROUTE_LOGISTICS_FORUM, EscalationStage.REGULATOR_DISPUTE].includes(dev.escalationStage)) {
      throw new BadRequestException('A dispute can only be lodged after the item reaches the Route Logistics Forum stage.');
    }
    const updated = await this.prisma.railHandshakeDeviation.update({
      where: { id: deviationId },
      data: { status: DeviationStatus.DISPUTED, escalationStage: EscalationStage.REGULATOR_DISPUTE },
    });
    // Reflect on the parent report.
    await this.prisma.railHandshakeReport.update({
      where: { id: reportId },
      data: { status: HandshakeReportStatus.DISPUTED },
    });
    return updated;
  }

  async removeDeviation(companyId: string, reportId: string, deviationId: string) {
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
