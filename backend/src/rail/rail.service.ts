import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { CreateRailConsignmentDto } from './dto/create-rail-consignment.dto';
import { UpdateRailConsignmentDto } from './dto/update-rail-consignment.dto';
import { CreateWagonDto } from './dto/wagon.dto';
import { CreateIntermodalLegDto } from './dto/intermodal-leg.dto';

/**
 * Rail / Intermodal coordination service.
 *
 * FlowOps is the intelligence + coordination layer ABOVE the rail network —
 * it manages the consignment lifecycle, wagon register, intermodal handoffs
 * and corridor KPIs. It is deliberately NOT a signalling / slot-allocation /
 * marshalling control system; that remains the rail operator's domain.
 *
 * Every method is company-scoped. No hard deletes on consignments (soft cancel).
 */
@Injectable()
export class RailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // ── Entitlement gate ─────────────────────────────────────────────────────────

  /**
   * Rail & Intermodal is an Enterprise capability (like Freight Forwarding).
   * Every read/write entry point asserts it; helper methods route through
   * create()/get()/list()/overview() so the gate is enforced consignment-wide.
   */
  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException(
        'Rail & Intermodal is an Enterprise feature. Upgrade your plan to coordinate rail consignments and intermodal handoffs.',
      );
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Tenant-scoped, year-prefixed consignment number: RAIL-2026-00042 */
  private async nextConsignmentNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const count = await this.prisma.railConsignment.count({
      where: { companyId, createdAt: { gte: yearStart } },
    });
    return `RAIL-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private toDate(v?: string | null): Date | null {
    return v ? new Date(v) : null;
  }

  // ── Consignment CRUD ─────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateRailConsignmentDto) {
    await this.assertEntitled(companyId);
    const consignmentNumber = await this.nextConsignmentNumber(companyId);
    const consignment = await this.prisma.railConsignment.create({
      data: {
        companyId,
        consignmentNumber,
        commodity: dto.commodity,
        clientName: dto.clientName ?? null,
        tonnage: dto.tonnage ?? null,
        wagonsPlanned: dto.wagonsPlanned ?? null,
        corridor: dto.corridor ?? null,
        originSiding: dto.originSiding ?? null,
        destinationSiding: dto.destinationSiding ?? null,
        railOperator: dto.railOperator ?? null,
        serviceRef: dto.serviceRef ?? null,
        interchangePoint: dto.interchangePoint ?? null,
        plannedDeparture: this.toDate(dto.plannedDeparture),
        plannedArrival: this.toDate(dto.plannedArrival),
        slaHours: dto.slaHours ?? null,
        ...(dto.riskLevel ? { riskLevel: dto.riskLevel } : {}),
        riskNote: dto.riskNote ?? null,
      },
    });

    // Seed the timeline with the opening event.
    await this.prisma.railConsignmentEvent.create({
      data: {
        consignmentId: consignment.id,
        status: 'PLANNED',
        note: 'Consignment created',
        location: dto.originSiding ?? null,
      },
    });

    return consignment;
  }

  async list(
    companyId: string,
    filters: { status?: string; corridor?: string; commodity?: string; q?: string } = {},
  ) {
    await this.assertEntitled(companyId);
    const where: any = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.corridor) where.corridor = filters.corridor;
    if (filters.commodity) where.commodity = { contains: filters.commodity, mode: 'insensitive' };
    if (filters.q) {
      where.OR = [
        { consignmentNumber: { contains: filters.q, mode: 'insensitive' } },
        { clientName: { contains: filters.q, mode: 'insensitive' } },
        { commodity: { contains: filters.q, mode: 'insensitive' } },
        { railOperator: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.railConsignment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { wagons: true, legs: true, events: true } },
      },
    });
  }

  async get(companyId: string, id: string) {
    await this.assertEntitled(companyId);
    const c = await this.prisma.railConsignment.findFirst({
      where: { id, companyId },
      include: {
        wagons: { orderBy: { wagonNumber: 'asc' } },
        legs: { orderBy: { sequence: 'asc' } },
        events: { orderBy: { reachedAt: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException('Rail consignment not found');
    return c;
  }

  async update(companyId: string, id: string, dto: UpdateRailConsignmentDto) {
    await this.get(companyId, id);
    const data: any = { ...dto };
    if (dto.plannedDeparture !== undefined) data.plannedDeparture = this.toDate(dto.plannedDeparture);
    if (dto.plannedArrival !== undefined) data.plannedArrival = this.toDate(dto.plannedArrival);
    return this.prisma.railConsignment.update({ where: { id }, data });
  }

  async cancel(companyId: string, id: string) {
    await this.get(companyId, id);
    await this.prisma.railConsignmentEvent.create({
      data: { consignmentId: id, status: 'CANCELLED', note: 'Consignment cancelled' },
    });
    return this.prisma.railConsignment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Advance the consignment to a new status, timestamp key transitions,
   * record a timeline event, and log a best-effort AI Control Tower event.
   */
  async advanceStatus(companyId: string, id: string, status: string, note?: string, location?: string) {
    const c = await this.get(companyId, id);

    const patch: any = { status: status as any };
    if (status === 'DEPARTED' && !c.actualDeparture) patch.actualDeparture = new Date();
    if (status === 'ARRIVED' && !c.actualArrival) patch.actualArrival = new Date();

    await this.prisma.railConsignmentEvent.create({
      data: {
        consignmentId: id,
        status: status as any,
        note: note ?? null,
        location: location ?? null,
      },
    });

    const updated = await this.prisma.railConsignment.update({ where: { id }, data: patch });

    // Surface in AI Control Tower (best-effort — never blocks the transition).
    try {
      await (this.prisma as any).aiEvent.create({
        data: {
          companyId,
          type: 'RAIL_MILESTONE',
          title: `${c.consignmentNumber}: ${String(status).replace(/_/g, ' ').toLowerCase()}`,
          body: note || `Rail consignment advanced to ${status}${location ? ` at ${location}` : ''}.`,
          severity: 'info',
          resolved: true,
        },
      });
    } catch { /* best-effort */ }

    return updated;
  }

  // ── Wagons (rolling-stock register) ──────────────────────────────────────────

  async addWagon(companyId: string, consignmentId: string, dto: CreateWagonDto) {
    await this.get(companyId, consignmentId);
    return this.prisma.wagon.create({
      data: {
        consignmentId,
        wagonNumber: dto.wagonNumber,
        ...(dto.type ? { type: dto.type } : {}),
        tareTonnes: dto.tareTonnes ?? null,
        loadedTonnes: dto.loadedTonnes ?? null,
        commodity: dto.commodity ?? null,
        sealNumbers: dto.sealNumbers ?? null,
        lastKnownSiding: dto.lastKnownSiding ?? null,
      },
    });
  }

  async removeWagon(companyId: string, consignmentId: string, wagonId: string) {
    await this.get(companyId, consignmentId);
    await this.prisma.wagon.deleteMany({ where: { id: wagonId, consignmentId } });
    return { deleted: true };
  }

  // ── Intermodal legs (road <-> rail <-> port handoffs) ────────────────────────

  async addLeg(companyId: string, consignmentId: string, dto: CreateIntermodalLegDto) {
    await this.get(companyId, consignmentId);
    return this.prisma.intermodalLeg.create({
      data: {
        consignmentId,
        sequence: dto.sequence,
        mode: dto.mode,
        ...(dto.status ? { status: dto.status } : {}),
        fromLocation: dto.fromLocation ?? null,
        toLocation: dto.toLocation ?? null,
        handler: dto.handler ?? null,
        plannedStart: this.toDate(dto.plannedStart),
        plannedEnd: this.toDate(dto.plannedEnd),
        note: dto.note ?? null,
      },
    });
  }

  /**
   * Record a handoff on a leg. When a leg completes we stamp actualEnd and, if
   * we have both actual timestamps, compute the dwell (idle) hours — the core
   * "handoff gap" metric operators can never see today.
   */
  async advanceLeg(companyId: string, consignmentId: string, legId: string, status: string) {
    await this.get(companyId, consignmentId);
    const leg = await this.prisma.intermodalLeg.findFirst({ where: { id: legId, consignmentId } });
    if (!leg) throw new NotFoundException('Intermodal leg not found');

    const patch: any = { status: status as any };
    const now = new Date();
    if (status === 'IN_PROGRESS' && !leg.actualStart) patch.actualStart = now;
    if ((status === 'HANDED_OVER' || status === 'COMPLETED') && !leg.actualEnd) patch.actualEnd = now;

    const start = leg.actualStart ?? (patch.actualStart as Date | undefined);
    const end = (patch.actualEnd as Date | undefined) ?? leg.actualEnd ?? undefined;
    if (start && end) {
      patch.dwellHours = Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
    }

    return this.prisma.intermodalLeg.update({ where: { id: legId }, data: patch });
  }

  // ── KPIs / dashboard ─────────────────────────────────────────────────────────

  /**
   * Rail command-centre metrics for the tenant. All computed from real records.
   */
  async overview(companyId: string) {
    await this.assertEntitled(companyId);

    // ── Perf note (200+ tenants) ───────────────────────────────────────────────
    // Every query below is company-scoped and backed by @@index([companyId,...]),
    // so a tenant only ever touches its own rows — 200 tenants add zero fan-out.
    // We NEVER load all consignments + wagons + legs into JS (the old N+1 risk for
    // a single heavy tenant). Instead we push counts/sums/groupings into Postgres
    // via count/aggregate/groupBy, and only pull the small set of rows we genuinely
    // need to compute (arrived on-time %, transit + dwell averages).

    const where = { companyId } as const;
    const CLOSED = ['COMPLETED', 'CANCELLED'] as const;

    // Status counts in a single grouped query.
    const statusGroups = await this.prisma.railConsignment.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const countByStatus: Record<string, number> = {};
    for (const g of statusGroups) countByStatus[g.status] = g._count._all;
    const totalConsignments = statusGroups.reduce((s, g) => s + g._count._all, 0);

    const inTransitCount = countByStatus['IN_TRANSIT'] ?? 0;
    const atInterchangeCount = countByStatus['AT_INTERCHANGE'] ?? 0;
    const activeCount =
      totalConsignments - (countByStatus['COMPLETED'] ?? 0) - (countByStatus['CANCELLED'] ?? 0);

    // At-risk active consignments — DB count, not a JS scan.
    const atRisk = await this.prisma.railConsignment.count({
      where: { companyId, riskLevel: { in: ['HIGH', 'CRITICAL'] }, status: { notIn: [...CLOSED] } },
    });

    // Tonnage planned (all) and moved (offloaded/completed) via aggregate sums.
    const [tonnagePlannedAgg, tonnageMovedAgg] = await Promise.all([
      this.prisma.railConsignment.aggregate({ where, _sum: { tonnage: true } }),
      this.prisma.railConsignment.aggregate({
        where: { companyId, status: { in: ['OFFLOADED', 'COMPLETED'] } },
        _sum: { tonnage: true },
      }),
    ]);
    const tonnagePlanned = tonnagePlannedAgg._sum.tonnage ?? 0;
    const tonnageMoved = tonnageMovedAgg._sum.tonnage ?? 0;

    // Wagon counts: total for tenant + those on in-transit consignments (DB counts).
    const [totalWagons, wagonsInTransit] = await Promise.all([
      this.prisma.wagon.count({ where: { consignment: { companyId } } }),
      this.prisma.wagon.count({
        where: { consignment: { companyId, status: 'IN_TRANSIT' } },
      }),
    ]);

    // On-time %: only the arrived+planned consignments (bounded) — select just the
    // two timestamps we need, never the full row graph.
    const arrivedRows = await this.prisma.railConsignment.findMany({
      where: { companyId, actualArrival: { not: null }, plannedArrival: { not: null } },
      select: { actualArrival: true, plannedArrival: true, actualDeparture: true },
      take: 1000,
    });
    const onTime = arrivedRows.filter(
      (c) => c.actualArrival!.getTime() <= c.plannedArrival!.getTime(),
    );
    const onTimePct = arrivedRows.length
      ? Math.round((onTime.length / arrivedRows.length) * 100)
      : null;

    // Average corridor transit time (hours) for departed+arrived consignments.
    const withTransit = arrivedRows.filter((c) => c.actualDeparture && c.actualArrival);
    const avgTransitHours = withTransit.length
      ? Math.round(
          withTransit.reduce(
            (s, c) => s + (c.actualArrival!.getTime() - c.actualDeparture!.getTime()) / 3_600_000,
            0,
          ) / withTransit.length,
        )
      : null;

    // Average interchange dwell (hours): DB average over legs that recorded dwell,
    // scoped to this tenant's consignments. No JS flatMap over every leg.
    const dwellAgg = await this.prisma.intermodalLeg.aggregate({
      where: { dwellHours: { not: null }, consignment: { companyId } },
      _avg: { dwellHours: true },
    });
    const avgInterchangeDwellHours =
      dwellAgg._avg.dwellHours != null ? Math.round(dwellAgg._avg.dwellHours * 10) / 10 : null;

    // Corridor breakdown — grouped sum/count in one DB query.
    const corridorGroups = await this.prisma.railConsignment.groupBy({
      by: ['corridor'],
      where,
      _count: { _all: true },
      _sum: { tonnage: true },
    });
    const byCorridor = corridorGroups.map((g) => ({
      corridor: g.corridor || 'Unassigned',
      consignments: g._count._all,
      tonnage: Math.round(g._sum.tonnage ?? 0),
    }));

    return {
      generatedAt: new Date().toISOString(),
      metrics: {
        activeConsignments: activeCount,
        inTransit: inTransitCount,
        atInterchange: atInterchangeCount,
        wagonsInTransit,
        totalWagons,
        tonnageMoved: Math.round(tonnageMoved),
        tonnagePlanned: Math.round(tonnagePlanned),
        onTimePct,
        avgTransitHours,
        avgInterchangeDwellHours,
        atRisk,
      },
      byCorridor,
    };
  }
}
