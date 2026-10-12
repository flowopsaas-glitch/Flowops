import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IntermodalLegStatus, RailConsignmentStatus, RailHoldStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import {
  RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, recordRailAudit,
} from './rail-audit';
import {
  describeLegTransition,
  evaluateHandoffReadiness,
  HandoffEvidence,
  HandoffReadiness,
  isApprovalValid,
  isLegalLegTransition,
} from './rail-handoff.policy';
import { evaluateDangerousGoods, isMovementStatus, normaliseUnNumber } from './rail-dangerous-goods';
import { boundedAverage, rollingWindow, safeRate } from '../common/kpi/kpi-math';
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
  private readonly logger = new Logger(RailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  /** Best-effort audit write — never blocks or fails the business action. */
  private record(companyId: string, actor: RailActor, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railAuditEntry(companyId, actor, action, target, metadata));
  }

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

  /** Dangerous-goods columns from a DTO, normalised (UN number → UN1203, class upper-cased). */
  private dgColumns(dto: {
    isDangerousGoods?: boolean; unNumber?: string; imdgClass?: string; placardRef?: string; emergencyContact24h?: string; msdsDocumentUrl?: string;
  }) {
    return {
      isDangerousGoods: dto.isDangerousGoods ?? false,
      unNumber: normaliseUnNumber(dto.unNumber),
      imdgClass: dto.imdgClass?.trim() ? dto.imdgClass.trim().toUpperCase() : null,
      placardRef: dto.placardRef?.trim() || null,
      emergencyContact24h: dto.emergencyContact24h?.trim() || null,
      msdsDocumentUrl: dto.msdsDocumentUrl?.trim() || null,
    };
  }

  private readonly allowedTransitions: Record<RailConsignmentStatus, readonly RailConsignmentStatus[]> = {
    PLANNED: ['WAGONS_ALLOCATED', 'CANCELLED'],
    WAGONS_ALLOCATED: ['LOADING', 'CANCELLED'],
    LOADING: ['DEPARTED', 'CANCELLED'],
    DEPARTED: ['IN_TRANSIT', 'AT_INTERCHANGE', 'CANCELLED'],
    IN_TRANSIT: ['AT_INTERCHANGE', 'ARRIVED', 'CANCELLED'],
    AT_INTERCHANGE: ['IN_TRANSIT', 'ARRIVED', 'CANCELLED'],
    ARRIVED: ['OFFLOADED', 'CANCELLED'],
    OFFLOADED: ['COMPLETED'],
    COMPLETED: [],
    CANCELLED: [],
  };

  // ── Consignment CRUD ─────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateRailConsignmentDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const waybillIds = [...new Set(dto.waybillIds ?? [])];
    if (waybillIds.length) {
      const count = await this.prisma.waybill.count({
        where: { id: { in: waybillIds }, companyId },
      });
      if (count !== waybillIds.length) {
        throw new BadRequestException('One or more waybills do not belong to this company');
      }
    }
    const consignmentNumber = await this.nextConsignmentNumber(companyId);
    const consignment = await this.prisma.withTenant(companyId, async (tx) => {
      const created = await tx.railConsignment.create({
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
          ...this.dgColumns(dto),
        },
      });

      if (waybillIds.length) {
        const linked = await tx.waybill.updateMany({
          where: { id: { in: waybillIds }, companyId, railConsignmentId: null },
          data: { railConsignmentId: created.id },
        });
        if (linked.count !== waybillIds.length) {
          throw new BadRequestException(
            'One or more waybills are already linked to another rail consignment',
          );
        }
      }

      await tx.railConsignmentEvent.create({
        data: {
          consignmentId: created.id,
          status: 'PLANNED',
          note: waybillIds.length
            ? `Consignment created with ${waybillIds.length} linked waybill(s)`
            : 'Consignment created',
          location: dto.originSiding ?? null,
        },
      });
      return created;
    });

    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.CONSIGNMENT_CREATED,
      { type: RAIL_AUDIT_TARGET.CONSIGNMENT, id: consignment.id, name: consignmentNumber },
      { commodity: dto.commodity, corridor: dto.corridor ?? null, tonnage: dto.tonnage ?? null, railOperator: dto.railOperator ?? null },
    );

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
    const rows = await this.prisma.railConsignment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { wagons: true, legs: true, events: true } },
      },
    });

    // Dangerous-goods readiness for the list badge. Only wagons that are themselves flagged are loaded
    // (a handful), never every wagon of every consignment.
    const dgWagons = rows.length
      ? await this.prisma.wagon.findMany({
          where: { consignmentId: { in: rows.map((r) => r.id) }, isDangerousGoods: true },
          select: { consignmentId: true, wagonNumber: true, isDangerousGoods: true, unNumber: true, imdgClass: true, placardRef: true, emergencyContact24h: true, msdsDocumentUrl: true },
        })
      : [];
    return rows.map((r) => {
      const dg = evaluateDangerousGoods(r, dgWagons.filter((w) => w.consignmentId === r.id));
      return {
        ...r,
        dg: {
          required: dg.required, ready: dg.ready,
          problems: dg.missing.reduce((n, g) => n + g.fields.length, 0) + dg.invalid.length,
        },
      };
    });
  }

  /** The dangerous-goods readiness of one consignment, exactly as the dispatch gate sees it. */
  async getDangerousGoods(companyId: string, id: string) {
    const c = await this.get(companyId, id);
    const dg = evaluateDangerousGoods(c, c.wagons);
    return { ...dg, blocksDeparture: dg.required && !dg.ready, consignmentNumber: c.consignmentNumber };
  }

  async get(companyId: string, id: string) {
    await this.assertEntitled(companyId);
    const c = await this.prisma.railConsignment.findFirst({
      where: { id, companyId },
      include: {
        wagons: { orderBy: { wagonNumber: 'asc' } },
        legs: { orderBy: { sequence: 'asc' } },
        events: { orderBy: { reachedAt: 'asc' } },
        waybills: {
          select: {
            id: true, trackingNumber: true, status: true, totalAmount: true,
            podDeliveredAt: true, createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!c) throw new NotFoundException('Rail consignment not found');
    return c;
  }

  async update(companyId: string, id: string, dto: UpdateRailConsignmentDto, actor: RailActor) {
    const existing = await this.get(companyId, id);
    const data: any = { ...dto };
    if (dto.plannedDeparture !== undefined) data.plannedDeparture = this.toDate(dto.plannedDeparture);
    if (dto.plannedArrival !== undefined) data.plannedArrival = this.toDate(dto.plannedArrival);
    // Dangerous-goods values are normalised on the way in, but only the ones actually sent are touched.
    // `isDangerousGoods` is a NOT NULL column: an explicit null means "not sent", never "write NULL" (that would be a 500).
    if (data.isDangerousGoods === null) delete data.isDangerousGoods;
    if (dto.unNumber !== undefined) data.unNumber = normaliseUnNumber(dto.unNumber);
    if (dto.imdgClass !== undefined) data.imdgClass = dto.imdgClass.trim() ? dto.imdgClass.trim().toUpperCase() : null;
    for (const k of ['placardRef', 'emergencyContact24h', 'msdsDocumentUrl'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k]?.trim() || null;
    }
    const updated = await this.prisma.railConsignment.update({ where: { id }, data });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.CONSIGNMENT_UPDATED,
      { type: RAIL_AUDIT_TARGET.CONSIGNMENT, id, name: existing.consignmentNumber },
      { fields: Object.keys(dto) },
    );
    return updated;
  }

  async cancel(companyId: string, id: string, actor: RailActor) {
    const existing = await this.get(companyId, id);
    await this.prisma.railConsignmentEvent.create({
      data: { consignmentId: id, status: 'CANCELLED', note: 'Consignment cancelled' },
    });
    const cancelled = await this.prisma.railConsignment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.CONSIGNMENT_CANCELLED,
      { type: RAIL_AUDIT_TARGET.CONSIGNMENT, id, name: existing.consignmentNumber },
      { from: existing.status },
    );
    return cancelled;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Advance the consignment to a new status, timestamp key transitions,
   * record a timeline event, and log a best-effort AI Control Tower event.
   */
  async advanceStatus(companyId: string, id: string, status: string, actor: RailActor, note?: string, location?: string) {
    // An unknown status used to reach Prisma and surface as a 500; reject it up front.
    if (!(Object.values(RailConsignmentStatus) as string[]).includes(status)) {
      throw new BadRequestException(`Unknown status "${String(status).slice(0, 40)}". Use one of: ${Object.values(RailConsignmentStatus).join(', ')}.`);
    }
    const c = await this.get(companyId, id);
    if (!Object.values(RailConsignmentStatus).includes(status as RailConsignmentStatus)) {
      throw new BadRequestException(`Invalid rail consignment status: ${status}`);
    }
    const nextStatus = status as RailConsignmentStatus;
    if (c.status === nextStatus) {
      return c;
    }
    // ── DISPATCH GATES: dangerous goods, and the weighbridge hold ──────────────
    // The brief says "DISPATCHED"; this model has no such status — DEPARTED is the dispatch event, and
    // IN_TRANSIT / AT_INTERCHANGE are covered too so a gate cannot be skipped by jumping ahead. Both gates are
    // evaluated together so the user is told everything that stops them, in one sentence.
    if (isMovementStatus(nextStatus)) {
      const dg = evaluateDangerousGoods(c, c.wagons);
      const dgBlocked = dg.required && !dg.ready;
      const held = c.holdStatus === RailHoldStatus.HOLD_FOR_LOAD_ADJUSTMENT;
      if (dgBlocked || held) {
        const reasons = [
          ...(dgBlocked ? [`dangerous-goods details are incomplete: ${dg.summary}`] : []),
          ...(held ? [`held for load adjustment: ${c.holdReason ?? 'a wagon has not been re-weighed within its limit'}`] : []),
        ];
        await this.record(
          companyId, actor, RAIL_AUDIT_ACTION.CONSIGNMENT_DISPATCH_BLOCKED,
          { type: RAIL_AUDIT_TARGET.CONSIGNMENT, id, name: c.consignmentNumber },
          { attemptedStatus: nextStatus, from: c.status, missing: dg.missing, invalid: dg.invalid, ...(held ? { hold: { status: c.holdStatus, reason: c.holdReason ?? null } } : {}) },
        );
        throw new BadRequestException(`Dispatch blocked — ${reasons.join('; and ')}.`);
      }
    }

    if (!this.allowedTransitions[c.status].includes(nextStatus)) {
      throw new BadRequestException(
        `Cannot move rail consignment from ${c.status} to ${nextStatus}`,
      );
    }

    const patch: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === 'DEPARTED' && !c.actualDeparture) patch.actualDeparture = new Date();
    if (nextStatus === 'ARRIVED' && !c.actualArrival) patch.actualArrival = new Date();

    const updated = await this.prisma.withTenant(companyId, async (tx) => {
      await tx.railConsignmentEvent.create({
        data: {
          consignmentId: id,
          status: nextStatus,
          note: note ?? null,
          location: location ?? null,
        },
      });
      return tx.railConsignment.update({ where: { id }, data: patch });
    });

    // Surface in AI Control Tower (best-effort — never blocks the transition).
    try {
      await (this.prisma as any).aiEvent.create({
        data: {
          companyId,
          type: 'RAIL_MILESTONE',
          title: `${c.consignmentNumber}: ${String(nextStatus).replace(/_/g, ' ').toLowerCase()}`,
          body: note || `Rail consignment advanced to ${nextStatus}${location ? ` at ${location}` : ''}.`,
          severity: 'info',
          resolved: true,
        },
      });
    } catch { /* best-effort */ }

    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.CONSIGNMENT_STATUS_ADVANCED,
      { type: RAIL_AUDIT_TARGET.CONSIGNMENT, id, name: c.consignmentNumber },
      { from: c.status, to: status, location: location ?? null, note: note ? note.slice(0, 200) : null },
    );

    return updated;
  }

  // ── Wagons (rolling-stock register) ──────────────────────────────────────────

  async addWagon(companyId: string, consignmentId: string, dto: CreateWagonDto, actor: RailActor) {
    const consignment = await this.get(companyId, consignmentId);
    const wagon = await this.prisma.wagon.create({
      data: {
        consignmentId,
        wagonNumber: dto.wagonNumber,
        ...(dto.type ? { type: dto.type } : {}),
        tareTonnes: dto.tareTonnes ?? null,
        loadedTonnes: dto.loadedTonnes ?? null,
        commodity: dto.commodity ?? null,
        sealNumbers: dto.sealNumbers ?? null,
        lastKnownSiding: dto.lastKnownSiding ?? null,
        axles: dto.axles ?? null,
        gauge: dto.gauge ?? null,
        vehicleProfile: dto.vehicleProfile ?? null,
        ...this.dgColumns(dto),
      },
    });
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.WAGON_ADDED,
      { type: RAIL_AUDIT_TARGET.WAGON, id: wagon.id, name: dto.wagonNumber },
      { consignmentId, consignmentNumber: consignment.consignmentNumber },
    );
    return wagon;
  }

  async removeWagon(companyId: string, consignmentId: string, wagonId: string, actor: RailActor) {
    const consignment = await this.get(companyId, consignmentId);
    // The consignment lookup above proves tenant ownership; the deleteMany is
    // additionally pinned to that consignment, so a wagon id from another
    // consignment (or tenant) matches nothing.
    const res = await this.prisma.wagon.deleteMany({ where: { id: wagonId, consignmentId } });
    if (res.count > 0) {
      await this.record(
        companyId, actor, RAIL_AUDIT_ACTION.WAGON_REMOVED,
        { type: RAIL_AUDIT_TARGET.WAGON, id: wagonId },
        { consignmentId, consignmentNumber: consignment.consignmentNumber },
      );
    }
    return { deleted: res.count > 0 };
  }

  // ── Intermodal legs (road <-> rail <-> port handoffs) ────────────────────────

  async addLeg(companyId: string, consignmentId: string, dto: CreateIntermodalLegDto, actor: RailActor) {
    const consignment = await this.get(companyId, consignmentId);
    const leg = await this.prisma.intermodalLeg.create({
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
    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.LEG_ADDED,
      { type: RAIL_AUDIT_TARGET.LEG, id: leg.id },
      { consignmentId, consignmentNumber: consignment.consignmentNumber, mode: dto.mode, sequence: dto.sequence },
    );
    return leg;
  }

  /**
   * Handoff readiness report for a leg.
   *
   * Read-only: evaluates the prerequisite evidence (leg started, receiver named,
   * location known, tariff/billing evidence stored AND priced, no load hold) and
   * reports whether a handover may be recorded, plus whether an approval exists
   * that covers the CURRENT evidence (the approval is fingerprinted).
   */
  async handoffReadiness(companyId: string, consignmentId: string, legId: string) {
    const consignment = await this.get(companyId, consignmentId);
    const leg = await this.prisma.intermodalLeg.findFirst({ where: { id: legId, consignmentId } });
    if (!leg) throw new NotFoundException('Intermodal leg not found');

    const evidence = await this.gatherHandoffEvidence(leg);
    const readiness = evaluateHandoffReadiness(evidence);
    const approval = await this.findHandoffApproval(companyId, legId);

    return {
      consignmentId,
      consignmentNumber: consignment.consignmentNumber,
      legId,
      status: leg.status,
      ...readiness,
      approval: approval
        ? {
            approvedAt: approval.createdAt,
            approvedBy: approval.actorEmail ?? approval.actorId ?? null,
            coversCurrentEvidence: isApprovalValid(readiness, approval.fingerprint),
          }
        : null,
      /** True only when the evidence is complete AND an approval covers it. */
      canHandOver: readiness.ready && isApprovalValid(readiness, approval?.fingerprint),
    };
  }

  /**
   * Approve a leg's handoff readiness — the auditable "who signed off which
   * step" record.
   *
   * Refuses (and audits the refusal) when the evidence is incomplete, so an
   * approval can never exist ahead of its evidence. The approval stores the
   * evidence fingerprint; if the evidence later changes, the approval stops
   * covering it and the handoff is refused again until it is re-approved.
   */
  async approveHandoffReadiness(
    companyId: string,
    consignmentId: string,
    legId: string,
    actor: RailActor,
    note?: string,
  ) {
    const consignment = await this.get(companyId, consignmentId);
    const leg = await this.prisma.intermodalLeg.findFirst({ where: { id: legId, consignmentId } });
    if (!leg) throw new NotFoundException('Intermodal leg not found');

    const evidence = await this.gatherHandoffEvidence(leg);
    const readiness = evaluateHandoffReadiness(evidence);
    const target = { type: RAIL_AUDIT_TARGET.LEG, id: legId };

    if (!readiness.ready) {
      await this.record(
        companyId, actor, RAIL_AUDIT_ACTION.HANDOFF_READINESS_BLOCKED, target,
        {
          consignmentId, consignmentNumber: consignment.consignmentNumber,
          blockers: readiness.blockers,
          checks: readiness.checks.map((c) => ({ code: c.code, ok: c.ok })),
          fingerprint: readiness.fingerprint,
        },
      );
      throw new BadRequestException(
        `Handoff readiness cannot be approved — incomplete evidence: ${readiness.blockers.join('; ')}`,
      );
    }

    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.HANDOFF_READINESS_APPROVED, target,
      {
        consignmentId, consignmentNumber: consignment.consignmentNumber,
        note: note ?? null,
        fingerprint: readiness.fingerprint,
        // One entry per step that this approval signs off, attributed to the
        // approver — the record an auditor asks for ("who approved each step").
        approvedSteps: readiness.checks.map((c) => ({ step: c.code, label: c.label, detail: c.detail })),
      },
    );

    return {
      approved: true as const,
      legId,
      fingerprint: readiness.fingerprint,
      approvedSteps: readiness.checks.map((c) => c.code),
      approvedBy: actor.email ?? actor.id,
      approvedAt: new Date(),
    };
  }

  /**
   * Advance an intermodal leg. Handovers (HANDED_OVER) are gated: the leg must
   * have started, the receiver and location must be recorded, billing evidence
   * must be stored and priced, and a readiness approval must cover exactly this
   * evidence. Illegal transitions are rejected before any write.
   */
  async advanceLeg(companyId: string, consignmentId: string, legId: string, status: string, actor: RailActor) {
    const consignment = await this.get(companyId, consignmentId);
    const leg = await this.prisma.intermodalLeg.findFirst({ where: { id: legId, consignmentId } });
    if (!leg) throw new NotFoundException('Intermodal leg not found');
    if (!Object.values(IntermodalLegStatus).includes(status as IntermodalLegStatus)) {
      throw new BadRequestException(
        `Invalid intermodal leg status: ${status}. Use one of: ${Object.values(IntermodalLegStatus).join(', ')}`,
      );
    }
    const nextStatus = status as IntermodalLegStatus;
    if (leg.status === nextStatus) return leg;

    const target = { type: RAIL_AUDIT_TARGET.LEG, id: legId };

    // ── State machine: reject unknown/illegal targets before touching data ──
    if (!isLegalLegTransition(leg.status, nextStatus)) {
      const message = describeLegTransition(leg.status, nextStatus);
      await this.record(companyId, actor, RAIL_AUDIT_ACTION.LEG_TRANSITION_REJECTED, target, {
        consignmentId, consignmentNumber: consignment.consignmentNumber,
        from: leg.status, attempted: nextStatus, reason: 'illegal_transition',
      });
      throw new BadRequestException(message);
    }

    // ── Handoff gate: evidence + approval, checked before the write ──────────
    let readiness: HandoffReadiness | null = null;
    if (nextStatus === 'HANDED_OVER' && leg.status !== 'HANDED_OVER') {
      const evidence = await this.gatherHandoffEvidence(leg);
      readiness = evaluateHandoffReadiness(evidence);
      const approval = await this.findHandoffApproval(companyId, legId);

      if (!readiness.ready) {
        await this.record(companyId, actor, RAIL_AUDIT_ACTION.HANDOFF_BLOCKED, target, {
          consignmentId, consignmentNumber: consignment.consignmentNumber,
          attemptedStatus: nextStatus, blockers: readiness.blockers,
          checks: readiness.checks.map((c) => ({ code: c.code, ok: c.ok })),
          fingerprint: readiness.fingerprint,
        });
        throw new BadRequestException(
          `Handoff blocked — evidence incomplete: ${readiness.blockers.join('; ')}`,
        );
      }

      if (!isApprovalValid(readiness, approval?.fingerprint)) {
        await this.record(companyId, actor, RAIL_AUDIT_ACTION.HANDOFF_BLOCKED, target, {
          consignmentId, consignmentNumber: consignment.consignmentNumber,
          attemptedStatus: nextStatus, reason: approval ? 'stale_approval' : 'no_approval',
          fingerprint: readiness.fingerprint,
        });
        throw new ConflictException(
          approval
            ? 'Handoff blocked — the readiness approval was granted for different evidence (it changed since sign-off). Re-approve readiness.'
            : 'Handoff blocked — no handoff readiness approval recorded. Approve readiness (or ask an authorised user to) before handing over.',
        );
      }
    }

    const patch: Record<string, unknown> = { status: nextStatus };
    const now = new Date();
    if (nextStatus === 'IN_PROGRESS' && !leg.actualStart) patch.actualStart = now;
    if ((nextStatus === 'HANDED_OVER' || nextStatus === 'COMPLETED') && !leg.actualEnd) patch.actualEnd = now;

    const start = leg.actualStart ?? (patch.actualStart as Date | undefined);
    const end = (patch.actualEnd as Date | undefined) ?? leg.actualEnd ?? undefined;
    if (start && end) {
      patch.dwellHours = Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
    }

    // Compare-and-set on the status we validated: if another operator moved this
    // leg between the read and the write, we refuse instead of overwriting.
    const claimed = await this.prisma.intermodalLeg.updateMany({
      where: { id: legId, consignmentId, status: leg.status as any },
      data: patch,
    });
    if (claimed.count === 0) {
      throw new ConflictException('Leg status changed while advancing — refresh and try again');
    }

    const updated = await this.prisma.intermodalLeg.findFirstOrThrow({
      where: { id: legId, consignmentId },
    });

    await this.record(
      companyId, actor, RAIL_AUDIT_ACTION.LEG_ADVANCED, target,
      {
        consignmentId, consignmentNumber: consignment.consignmentNumber,
        from: leg.status, to: status, dwellHours: patch.dwellHours ?? null,
        handoffFingerprint: readiness?.fingerprint ?? null,
      },
    );
    return updated;
  }

  /** Assemble the handoff evidence snapshot for a leg (single source of truth). */
  private async gatherHandoffEvidence(leg: {
    id: string; status: string; actualStart?: Date | null; handler?: string | null;
    toLocation?: string | null; consignmentId: string;
  }): Promise<HandoffEvidence> {
    const tariff = await this.prisma.railTariffCalculation.findFirst({
      where: { consignmentId: leg.consignmentId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, holdTriggered: true },
    });
    return {
      legId: leg.id,
      status: leg.status,
      actualStart: leg.actualStart ?? null,
      handler: leg.handler ?? null,
      toLocation: leg.toLocation ?? null,
      tariff: tariff ?? null,
    };
  }

  /** Latest readiness approval for a leg, read from the immutable audit trail. */
  private async findHandoffApproval(companyId: string, legId: string) {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        action: RAIL_AUDIT_ACTION.HANDOFF_READINESS_APPROVED,
        targetType: RAIL_AUDIT_TARGET.LEG,
        targetId: legId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    const metadata = (row.metadata ?? {}) as Record<string, any>;
    // Defence in depth: an audit row for another tenant must never satisfy a
    // readiness check (audit rows are filtered by tenant in metadata).
    if (metadata.companyId && metadata.companyId !== companyId) return null;
    return {
      id: row.id,
      createdAt: row.createdAt,
      actorId: row.actorId,
      actorEmail: row.actorEmail,
      fingerprint: metadata.fingerprint as string | undefined,
    };
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
    // On-time + transit: only consignments that ACTUALLY arrived inside the last
    // 90 days and carried a planned arrival. CANCELLED never counts, a missing
    // estimate is not "late", and one stuck 5-month-old row cannot set the number.
    const window = rollingWindow(90);
    const arrivedRows = await this.prisma.railConsignment.findMany({
      where: {
        companyId,
        status: { notIn: ['CANCELLED', 'PLANNED', 'WAGONS_ALLOCATED', 'LOADING'] },
        actualArrival: { not: null, gte: window.start, lt: window.end },
        plannedArrival: { not: null },
      },
      select: { actualArrival: true, plannedArrival: true, actualDeparture: true },
      take: 1000,
    });
    const onTime = arrivedRows.filter(
      (c) => c.actualArrival!.getTime() <= c.plannedArrival!.getTime(),
    );
    const onTimePct = safeRate(onTime.length, arrivedRows.length).percentage;

    // Average corridor transit time (hours) — bounded: a negative duration (clock
    // skew) or a >30-day one is bad data and is dropped, not averaged in.
    const transit = boundedAverage(
      arrivedRows.map((c) =>
        c.actualDeparture && c.actualArrival
          ? (c.actualArrival.getTime() - c.actualDeparture.getTime()) / 3_600_000
          : null,
      ),
      { min: 0, max: 30 * 24, unit: 'hours', trimFrom: 20 },
    );
    const avgTransitHours = transit.value;

    // Average interchange dwell (hours): DB aggregate over legs that recorded a
    // dwell, scoped to this tenant, bounded to a plausible 120 h. The sample
    // count travels with the value; legs outside the bounds are excluded and
    // counted instead of dragging the average.
    const dwellSamples = await this.prisma.intermodalLeg.findMany({
      where: { dwellHours: { not: null }, consignment: { companyId } },
      select: { dwellHours: true },
      take: 5000,
    });
    const dwell = boundedAverage(dwellSamples.map((l) => l.dwellHours), {
      min: 0,
      max: 120,
      unit: 'hours',
    });
    const avgInterchangeDwellHours = dwell.value;

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
