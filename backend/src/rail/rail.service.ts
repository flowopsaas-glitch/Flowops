import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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
    const consignmentNumber = await this.nextConsignmentNumber(companyId);
    const consignment = await this.prisma.railConsignment.create({
      data: {
        company: { connect: { id: companyId } },
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
        consignment: { connect: { id: consignmentId } },
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
        consignment: { connect: { id: consignmentId } },
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
    const consignments = await this.prisma.railConsignment.findMany({
      where: { companyId },
      include: { wagons: true, legs: true },
    });

    const active = consignments.filter(
      (c) => !['COMPLETED', 'CANCELLED'].includes(c.status),
    );
    const inTransit = consignments.filter((c) => c.status === 'IN_TRANSIT');
    const atInterchange = consignments.filter((c) => c.status === 'AT_INTERCHANGE');

    const wagonsInTransit = inTransit.reduce((s, c) => s + c.wagons.length, 0);
    const totalWagons = consignments.reduce((s, c) => s + c.wagons.length, 0);

    // Tonnage moved (completed + offloaded consignments).
    const tonnageMoved = consignments
      .filter((c) => ['OFFLOADED', 'COMPLETED'].includes(c.status))
      .reduce((s, c) => s + (c.tonnage ?? 0), 0);

    const tonnagePlanned = consignments.reduce((s, c) => s + (c.tonnage ?? 0), 0);

    // On-time %: of arrived consignments with a planned arrival, how many hit it.
    const arrived = consignments.filter((c) => c.actualArrival && c.plannedArrival);
    const onTime = arrived.filter(
      (c) => c.actualArrival!.getTime() <= c.plannedArrival!.getTime(),
    );
    const onTimePct = arrived.length ? Math.round((onTime.length / arrived.length) * 100) : null;

    // Average corridor transit time (hours) for departed+arrived consignments.
    const withTransit = consignments.filter((c) => c.actualDeparture && c.actualArrival);
    const avgTransitHours = withTransit.length
      ? Math.round(
          withTransit.reduce(
            (s, c) => s + (c.actualArrival!.getTime() - c.actualDeparture!.getTime()) / 3_600_000,
            0,
          ) / withTransit.length,
        )
      : null;

    // Average interchange dwell (hours) across all legs that recorded dwell.
    const dwellLegs = consignments.flatMap((c) => c.legs).filter((l) => l.dwellHours != null);
    const avgInterchangeDwellHours = dwellLegs.length
      ? Math.round(
          (dwellLegs.reduce((s, l) => s + (l.dwellHours ?? 0), 0) / dwellLegs.length) * 10,
        ) / 10
      : null;

    // Corridor breakdown.
    const byCorridor: Record<string, { consignments: number; tonnage: number }> = {};
    for (const c of consignments) {
      const key = c.corridor || 'Unassigned';
      byCorridor[key] = byCorridor[key] || { consignments: 0, tonnage: 0 };
      byCorridor[key].consignments += 1;
      byCorridor[key].tonnage += c.tonnage ?? 0;
    }

    const atRisk = active.filter((c) => c.riskLevel === 'HIGH' || c.riskLevel === 'CRITICAL').length;

    return {
      generatedAt: new Date().toISOString(),
      metrics: {
        activeConsignments: active.length,
        inTransit: inTransit.length,
        atInterchange: atInterchange.length,
        wagonsInTransit,
        totalWagons,
        tonnageMoved: Math.round(tonnageMoved),
        tonnagePlanned: Math.round(tonnagePlanned),
        onTimePct,
        avgTransitHours,
        avgInterchangeDwellHours,
        atRisk,
      },
      byCorridor: Object.entries(byCorridor).map(([corridor, v]) => ({
        corridor,
        consignments: v.consignments,
        tonnage: Math.round(v.tonnage),
      })),
    };
  }
}
