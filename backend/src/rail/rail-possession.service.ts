import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, RailPossessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import {
  RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, railSystemAuditEntry, recordRailAudit,
} from './rail-audit';
import { CreatePossessionDto } from './dto/rail-possession.dto';
import { CORRIDOR_CATALOG } from './catalog/corridors.catalog';
import { CorridorIdentity } from './rail-reference';
import { ACTIVE_CONSIGNMENT_STATUSES, ConflictScan, detectPossessionConflicts, isEffectivelyLocked, possessionLockedFrom } from './rail-possession.rules';

/**
 * Possession windows (Annual Plan / 60-day Locked / Ad-hoc Emergency) and automatic conflict detection
 * against the tenant's ACTIVE consignments. Detection is advisory — it raises the alarm (audit + AiEvent
 * + banner); it never blocks a consignment. Consignments that cannot be checked are listed, not assumed clear.
 */
@Injectable()
export class RailPossessionService {
  private readonly logger = new Logger(RailPossessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException('Rail & Intermodal is an Enterprise feature. Upgrade your plan to track possession windows.');
    }
  }
  private record(companyId: string, actor: RailActor, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railAuditEntry(companyId, actor, action, target, metadata));
  }

  /** Corridor identities (DB rows when seeded, otherwise the code catalog — same fallback as the reference service). */
  private async corridors(): Promise<CorridorIdentity[]> {
    const rows = await this.prisma.railCorridorNode.findMany({ where: { isActive: true } });
    const source: readonly CorridorIdentity[] = rows.length ? rows : CORRIDOR_CATALOG;
    return source.map((c) => ({ code: c.code, name: c.name, aliases: c.aliases ?? [], workbookRoutes: c.workbookRoutes ?? [] }));
  }

  private view<T extends { kind: any; startsAt: Date }>(w: T, now = new Date()) {
    return { ...w, locked: isEffectivelyLocked(w, now), lockedFrom: w.kind === 'ANNUAL_PLAN' ? possessionLockedFrom(w).toISOString() : null };
  }

  async list(companyId: string, filters: { corridorCode?: string; status?: string } = {}, now = new Date()) {
    await this.assertEntitled(companyId);
    const where: Prisma.RailPossessionWindowWhereInput = { companyId };
    if (filters.corridorCode) where.corridorCode = filters.corridorCode;
    if (filters.status) where.status = filters.status as RailPossessionStatus;
    const rows = await this.prisma.railPossessionWindow.findMany({ where, orderBy: { startsAt: 'asc' }, take: 300 });
    return rows.map((w) => this.view(w, now));
  }

  /** Conflicts between this tenant's live windows and its active consignments (optionally one consignment). */
  async conflicts(companyId: string, consignmentId?: string, now = new Date()): Promise<ConflictScan> {
    await this.assertEntitled(companyId);
    return this.scan(companyId, consignmentId, now);
  }

  private async scan(companyId: string, consignmentId: string | undefined, now: Date): Promise<ConflictScan> {
    const [windows, consignments, corridors] = await Promise.all([
      this.prisma.railPossessionWindow.findMany({ where: { companyId, status: { in: ['PLANNED', 'ACTIVE'] } } }),
      this.prisma.railConsignment.findMany({
        where: { companyId, status: { in: [...ACTIVE_CONSIGNMENT_STATUSES] }, ...(consignmentId ? { id: consignmentId } : {}) },
        select: { id: true, consignmentNumber: true, status: true, corridor: true, plannedDeparture: true, plannedArrival: true, actualDeparture: true, slaHours: true },
        take: 1000,
      }),
      this.corridors(),
    ]);
    return detectPossessionConflicts(windows, consignments, corridors, now);
  }

  async create(companyId: string, dto: CreatePossessionDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    const corridors = await this.corridors();
    if (!corridors.some((c) => c.code === dto.corridorCode)) throw new BadRequestException(`Unknown corridor "${dto.corridorCode}".`);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new BadRequestException('startsAt / endsAt must be valid dates.');
    if (endsAt.getTime() <= startsAt.getTime()) throw new BadRequestException('A possession window must end after it starts.');
    if (endsAt.getTime() < now.getTime() && dto.kind !== 'AD_HOC_EMERGENCY') throw new BadRequestException('A planned possession window cannot lie wholly in the past.');

    const row = await this.prisma.railPossessionWindow.create({
      data: {
        companyId, corridorCode: dto.corridorCode, kind: dto.kind, status: 'PLANNED', title: dto.title.trim(), location: dto.location ?? null,
        description: dto.description ?? null, imReference: dto.imReference ?? null, startsAt, endsAt,
        noticeGivenAt: dto.noticeGivenAt ? new Date(dto.noticeGivenAt) : null, createdById: actor.id, createdByEmail: actor.email,
      },
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.POSSESSION_CREATED, { type: RAIL_AUDIT_TARGET.POSSESSION, id: row.id, name: row.title },
      { corridorCode: row.corridorCode, kind: row.kind, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });

    // Automatic detection: does the new window clash with a consignment that is already booked?
    const scan = await this.scan(companyId, undefined, now);
    const mine = scan.conflicts.filter((c) => c.windowId === row.id);
    if (mine.length) {
      await this.record(companyId, actor, RAIL_AUDIT_ACTION.POSSESSION_CONFLICT_DETECTED, { type: RAIL_AUDIT_TARGET.POSSESSION, id: row.id, name: row.title },
        { conflicts: mine.map((c) => ({ consignment: c.consignmentNumber, overlapHours: c.overlapHours, severity: c.severity })) });
      try {
        await this.prisma.aiEvent.create({
          data: {
            companyId, type: 'RAIL_POSSESSION_CONFLICT', severity: mine.some((c) => c.severity === 'HARD') ? 'high' : 'medium', sourceType: 'RAIL_POSSESSION', sourceId: row.id,
            title: `Possession "${row.title}" overlaps ${mine.length} consignment(s)`,
            body: mine.map((c) => `${c.consignmentNumber}: ${c.overlapHours} h (${c.severity})`).join('; '),
          },
        });
      } catch { /* best-effort */ }
    }
    return { window: this.view(row, now), conflicts: mine, unscheduled: scan.unscheduled, unresolved: scan.unresolved };
  }

  private async setStatus(companyId: string, id: string, to: RailPossessionStatus, from: RailPossessionStatus[], actor: RailActor, action: string) {
    await this.assertEntitled(companyId);
    const w = await this.prisma.railPossessionWindow.findFirst({ where: { id, companyId } });
    if (!w) throw new NotFoundException('Possession window not found');
    if (!from.includes(w.status)) throw new BadRequestException(`A ${w.status} possession window cannot become ${to}.`);
    const updated = await this.prisma.railPossessionWindow.update({ where: { id }, data: { status: to } });
    await this.record(companyId, actor, action, { type: RAIL_AUDIT_TARGET.POSSESSION, id, name: w.title }, { from: w.status, to });
    return this.view(updated);
  }

  cancel(companyId: string, id: string, actor: RailActor) {
    return this.setStatus(companyId, id, 'CANCELLED', ['PLANNED', 'ACTIVE'], actor, RAIL_AUDIT_ACTION.POSSESSION_CANCELLED);
  }
  complete(companyId: string, id: string, actor: RailActor) {
    return this.setStatus(companyId, id, 'COMPLETED', ['PLANNED', 'ACTIVE'], actor, RAIL_AUDIT_ACTION.POSSESSION_COMPLETED);
  }

  /** PLANNED → ACTIVE when its time arrives, ACTIVE/PLANNED → COMPLETED once it has passed. Hourly, platform-wide. */
  async runStatusSweep(now = new Date()) {
    const due = await this.prisma.railPossessionWindow.findMany({ where: { status: { in: ['PLANNED', 'ACTIVE'] }, startsAt: { lt: now } } });
    let activated = 0;
    let completed = 0;
    for (const w of due) {
      const to: RailPossessionStatus = w.endsAt.getTime() < now.getTime() ? 'COMPLETED' : 'ACTIVE';
      if (to === w.status) continue;
      await this.prisma.railPossessionWindow.update({ where: { id: w.id }, data: { status: to } });
      to === 'ACTIVE' ? (activated += 1) : (completed += 1);
      await recordRailAudit(this.audit, this.logger, railSystemAuditEntry(w.companyId, to === 'ACTIVE' ? RAIL_AUDIT_ACTION.POSSESSION_ACTIVATED : RAIL_AUDIT_ACTION.POSSESSION_COMPLETED,
        { type: RAIL_AUDIT_TARGET.POSSESSION, id: w.id, name: w.title }, { from: w.status, to }));
    }
    return { activated, completed };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledSweep() {
    try { await this.runStatusSweep(); } catch (err) { this.logger.warn(`Possession status sweep failed: ${err}`); }
  }
}
