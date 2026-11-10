import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RailDataStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import {
  RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, recordRailAudit,
} from './rail-audit';
import { RecordWeighbridgeReadingDto } from './dto/rail-weighbridge.dto';
import { CORRIDOR_CATALOG } from './catalog/corridors.catalog';
import { CorridorEnvelopeException, resolveCorridor } from './rail-reference';
import { axleLoadBand } from './rail-envelope';
import { deriveHold, evaluateOverload } from './rail-tariff.rules';

interface CorridorLimit {
  code: string; name: string; aliases: string[]; workbookRoutes: string[]; maxAxleLoadTonnes: number | null; dataStatus: RailDataStatus;
  /** Section-level axle-load departures, carried through so the floor can be computed. */
  envelopeExceptions?: CorridorEnvelopeException[] | null;
}

const FUTURE_SKEW_MS = 5 * 60_000;

/**
 * Weighbridge readings and the HOLD_FOR_LOAD_ADJUSTMENT hold (RAIL-014/015).
 *
 * The rule is the brief's: a wagon is overloaded when `actualTonnes > maxAxleLoadTonnes × axles`. The limit comes from the
 * consignment's corridor ONLY when that corridor's data is VERIFIED (today none is, so none is trusted), and/or from a limit the
 * caller enters with the reading (the wagon's own rating, recorded as MANUAL) — when both exist the STRICTER applies, so a
 * higher entered figure can never relax a verified limit. With neither, the reading is UNVERIFIED: it never passes and never holds.
 *
 * The same holds for the axle count: when both a registered and an entered count exist the SMALLER applies.
 *
 * Readings are append-only. The hold is derived from the most recently RECORDED reading of each wagon, so correcting an
 * overload is simply weighing the wagon again within its limit; there is no manual override of a hold.
 */
@Injectable()
export class RailWeighbridgeService {
  private readonly logger = new Logger(RailWeighbridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException('Rail & Intermodal is an Enterprise feature. Upgrade your plan to record weighbridge readings.');
    }
  }

  private record(companyId: string, actor: RailActor, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railAuditEntry(companyId, actor, action, target, metadata));
  }

  private async corridors(): Promise<CorridorLimit[]> {
    const rows = await this.prisma.railCorridorNode.findMany({ where: { isActive: true } });
    const source: ReadonlyArray<{ code: string; name: string; aliases?: string[] | null; workbookRoutes?: string[] | null; maxAxleLoadTonnes?: number | null; envelopeExceptions?: unknown; dataStatus: RailDataStatus }> = rows.length ? rows : CORRIDOR_CATALOG;
    return source.map((c) => ({
      code: c.code, name: c.name, aliases: [...(c.aliases ?? [])], workbookRoutes: [...(c.workbookRoutes ?? [])], maxAxleLoadTonnes: c.maxAxleLoadTonnes ?? null, dataStatus: c.dataStatus,
      envelopeExceptions: (c.envelopeExceptions ?? null) as CorridorEnvelopeException[] | null,
    }));
  }

  async list(companyId: string, filters: { consignmentId?: string } = {}) {
    await this.assertEntitled(companyId);
    const where: Prisma.RailWeighbridgeReadingWhereInput = { companyId };
    if (filters.consignmentId) where.consignmentId = filters.consignmentId;
    return this.prisma.railWeighbridgeReading.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async recordReading(companyId: string, dto: RecordWeighbridgeReadingDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);

    // 404, not 403: another tenant's consignment is invisible, as everywhere else in the rail module.
    const consignment = await this.prisma.railConsignment.findFirst({ where: { id: dto.consignmentId, companyId }, include: { wagons: true } });
    if (!consignment) throw new NotFoundException('Rail consignment not found');
    if (consignment.status === 'CANCELLED') throw new BadRequestException('A cancelled consignment takes no new weighbridge readings.');
    const wagonNumber = dto.wagonNumber.trim();
    const wagon = consignment.wagons.find((w) => w.wagonNumber === wagonNumber);
    if (!wagon) throw new BadRequestException(`Wagon "${wagonNumber.slice(0, 40)}" is not registered on ${consignment.consignmentNumber}.`);

    let weighedAt = now;
    if (dto.weighedAt) {
      weighedAt = new Date(dto.weighedAt);
      if (Number.isNaN(weighedAt.getTime())) throw new BadRequestException('weighedAt is not a valid date.');
      if (weighedAt.getTime() > now.getTime() + FUTURE_SKEW_MS) throw new BadRequestException('weighedAt cannot be in the future.');
    }

    // The limit. A corridor's published maximum is authoritative once it has been loaded from a
    // cited source — VERIFIED or PARTIAL. PARTIAL counts: Chapter 2 of the Network Statement
    // supplies the axle load, and what a PARTIAL corridor lacks is the vehicle profile, which
    // this check never consults. Ignoring a published axle load because of a missing profile
    // would weigh an overloaded wagon onto a 20 t line and find nothing wrong with it.
    // A limit entered with the reading (the wagon's own rating) can only make it STRICTER — a
    // higher figure must never relax a published limit, or an overload could be typed away.
    // With no published corridor limit, an entered one stands alone (MANUAL); neither, no limit.
    const corridor = resolveCorridor(await this.corridors(), consignment.corridor);
    const cited = corridor?.dataStatus === 'VERIFIED' || corridor?.dataStatus === 'PARTIAL';
    const envelope = cited && corridor ? axleLoadBand(corridor.maxAxleLoadTonnes, corridor.envelopeExceptions) : null;
    // Within the band the route decides, and a weighbridge does not know the route — so the
    // floor applies: the most restrictive limit the corridor publishes anywhere.
    const corridorLimit = envelope ? envelope.floorTonnes : null;
    const manualLimit = typeof dto.maxAxleLoadTonnes === 'number' ? dto.maxAxleLoadTonnes : null;
    let maxAxleLoadTonnes: number | null = null;
    let limitSource: 'CORRIDOR' | 'MANUAL' | 'NONE' = 'NONE';
    if (corridorLimit !== null && manualLimit !== null) {
      maxAxleLoadTonnes = Math.min(corridorLimit, manualLimit);
      limitSource = manualLimit < corridorLimit ? 'MANUAL' : 'CORRIDOR';
    } else if (corridorLimit !== null) {
      maxAxleLoadTonnes = corridorLimit;
      limitSource = 'CORRIDOR';
    } else if (manualLimit !== null) {
      maxAxleLoadTonnes = manualLimit;
      limitSource = 'MANUAL';
    }
    // The axle count follows the same rule as the limit: it may TIGHTEN the check, never relax it. Allowed mass is
    // limit × axles, so typing a larger count than the wagon is registered with would raise the allowance and clear a
    // genuine overload. When both are known the SMALLER applies; an entered count is only believed outright for a wagon
    // that has none registered. (A wrong register is corrected by re-registering the wagon, which is audited.)
    const registeredAxles = wagon.axles ?? null;
    const enteredAxles = dto.axles ?? null;
    const axles = registeredAxles !== null && enteredAxles !== null ? Math.min(registeredAxles, enteredAxles) : enteredAxles ?? registeredAxles;
    const axlesOverridden = registeredAxles !== null && enteredAxles !== null && enteredAxles > registeredAxles;
    const judged = evaluateOverload({ actualTonnes: dto.actualTonnes, axles, maxAxleLoadTonnes });
    const evaluation = axlesOverridden
      ? { ...judged, reason: `${judged.reason} The ${enteredAxles} axles entered exceed the ${registeredAxles} registered for ${wagonNumber}, so the registered count was used — correct the wagon register if it is wrong.` }
      : judged;

    const reading = await this.prisma.railWeighbridgeReading.create({
      data: {
        companyId, consignmentId: consignment.id, wagonId: wagon.id, wagonNumber, weighbridge: dto.weighbridge?.trim() || null, weighedAt, actualTonnes: dto.actualTonnes,
        axles, maxAxleLoadTonnes, limitSource, corridorCode: corridor?.code ?? null, allowedTonnes: evaluation.allowedTonnes, excessTonnes: evaluation.excessTonnes,
        status: evaluation.status, note: dto.note?.trim() || null, createdById: actor.id, createdByEmail: actor.email,
      },
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.WEIGHBRIDGE_READING_RECORDED, { type: RAIL_AUDIT_TARGET.WEIGHBRIDGE_READING, id: reading.id, name: `${consignment.consignmentNumber} ${wagonNumber}` }, {
      consignmentId: consignment.id, consignmentNumber: consignment.consignmentNumber, wagonNumber, actualTonnes: dto.actualTonnes, axles, maxAxleLoadTonnes, limitSource,
      status: evaluation.status, excessTonnes: evaluation.excessTonnes, axlesEntered: enteredAxles, axlesRegistered: registeredAxles, axlesOverridden,
    });

    // The hold follows the LATEST reading of each wagon.
    const all = await this.prisma.railWeighbridgeReading.findMany({ where: { companyId, consignmentId: consignment.id }, orderBy: { createdAt: 'asc' } });
    const decision = deriveHold(all);
    const wasHeld = consignment.holdStatus === 'HOLD_FOR_LOAD_ADJUSTMENT';
    const target = { type: RAIL_AUDIT_TARGET.CONSIGNMENT, id: consignment.id, name: consignment.consignmentNumber };
    if (decision.held) {
      await this.prisma.railConsignment.update({
        where: { id: consignment.id },
        data: { holdStatus: 'HOLD_FOR_LOAD_ADJUSTMENT', holdReason: decision.reason, holdSetAt: wasHeld ? consignment.holdSetAt ?? now : now, holdClearedAt: null },
      });
      if (!wasHeld) {
        await this.record(companyId, actor, RAIL_AUDIT_ACTION.CONSIGNMENT_HOLD_SET, target, { readingId: reading.id, wagons: decision.wagons, totalExcessTonnes: decision.totalExcessTonnes });
      }
    } else if (wasHeld) {
      await this.prisma.railConsignment.update({ where: { id: consignment.id }, data: { holdStatus: 'NONE', holdReason: null, holdClearedAt: now } });
      await this.record(companyId, actor, RAIL_AUDIT_ACTION.CONSIGNMENT_HOLD_CLEARED, target, { readingId: reading.id, previousReason: consignment.holdReason });
    }

    return {
      reading,
      evaluation,
      hold: { held: decision.held, status: decision.held ? 'HOLD_FOR_LOAD_ADJUSTMENT' : 'NONE', reason: decision.reason, wagons: decision.wagons, totalExcessTonnes: decision.totalExcessTonnes, changed: decision.held !== wasHeld },
    };
  }
}
