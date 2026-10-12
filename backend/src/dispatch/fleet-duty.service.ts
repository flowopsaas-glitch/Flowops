import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../webhooks/outbox.service';
import { AuditService } from '../audit/audit.service';
import { boardSummary, rosterRow, sortRoster } from './fleet-duty.rules';

export type ForceEndActor = { userId?: string; name?: string; role?: string };

/**
 * Fleet Duty Board — the dispatcher's control-room view of the fleet.
 *
 * Combines, per driver: the live duty (craft + vehicle + shift clock), the load
 * in hand (open runs), and what has already landed today. The one control-room
 * action is FORCE END: a driver's phone died mid-shift and the duty is stuck
 * ACTIVE forever — a dispatcher can close it with an attribution note. The
 * driver's own end-duty stays the normal path.
 */
@Injectable()
export class FleetDutyService {
  private readonly logger = new Logger(FleetDutyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async getBoard(companyId: string, now: Date = new Date()) {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [drivers, duties, shipments] = await Promise.all([
      this.prisma.driver.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, phone: true, vehicleReg: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.driverDuty.findMany({
        where: { companyId, status: 'ACTIVE' },
      }),
      this.prisma.shipment.findMany({
        where: {
          companyId,
          driverId: { not: null },
          status: { in: ['PENDING', 'IN_TRANSIT', 'DELIVERED'] },
        },
        select: {
          driverId: true,
          status: true,
          updatedAt: true,
          waybill: { select: { podDeliveredAt: true } },
        },
      }),
    ]);

    const dutyByDriver = new Map<string, any>();
    for (const d of duties) dutyByDriver.set(d.driverId, d);

    const loadsByDriver = new Map<string, { open: number; deliveredToday: number }>();
    for (const s of shipments as any[]) {
      const key = s.driverId!;
      const acc = loadsByDriver.get(key) ?? { open: 0, deliveredToday: 0 };
      if (s.status === 'PENDING' || s.status === 'IN_TRANSIT') acc.open += 1;
      const deliveredAt = s.waybill?.podDeliveredAt ?? s.updatedAt;
      if (s.status === 'DELIVERED' && deliveredAt && new Date(deliveredAt) >= startOfDay) acc.deliveredToday += 1;
      loadsByDriver.set(key, acc);
    }

    const rows = sortRoster(drivers.map((d) => {
      const duty = dutyByDriver.get(d.id) ?? null;
      const loads = loadsByDriver.get(d.id) ?? { open: 0, deliveredToday: 0 };
      return rosterRow({
        driverId: d.id,
        driverName: d.name,
        phone: d.phone,
        duty: duty
          ? {
              id: duty.id,
              mode: duty.mode,
              vehicleReg: duty.vehicleReg,
              driverVehicleReg: d.vehicleReg,
              startedAt: duty.startedAt,
            }
          : null,
        openLoads: loads.open,
        deliveredToday: loads.deliveredToday,
      }, now);
    }));

    return {
      asOf: now.toISOString(),
      summary: boardSummary(rows),
      roster: rows.map((r) => ({
        ...r,
        startedAt: r.startedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Force-end a stuck duty (phone died, app crashed mid-shift). CAS so two
   * dispatchers cannot both win; the closure is attributed and audited.
   */
  async forceEndDuty(companyId: string, dutyId: string, actor: ForceEndActor = {}, note?: string) {
    const duty = await this.prisma.driverDuty.findFirst({ where: { id: dutyId, companyId } });
    if (!duty) throw new NotFoundException('Duty not found');
    if (duty.status !== 'ACTIVE') {
      throw new ConflictException(`This duty already ended at ${duty.endedAt?.toISOString() ?? 'an earlier time'}`);
    }

    const actorName = (actor.name ?? actor.userId ?? 'dispatcher').toString().slice(0, 120);
    const endedAt = new Date();
    const reason = (note ?? '').trim().slice(0, 500);

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.driverDuty.updateMany({
        where: { id: dutyId, companyId, status: 'ACTIVE' },
        data: {
          status: 'COMPLETED',
          endedAt,
          note: reason ? `Force-ended by ${actorName}: ${reason}` : `Force-ended by ${actorName}`,
        },
      });
      if (u.count > 0) {
        await this.outbox.enqueue(tx, companyId, 'driver.duty.force_ended', {
          dutyId,
          driverId: duty.driverId,
          mode: duty.mode,
          startedAt: duty.startedAt,
          endedAt,
          by: actorName,
          reason: reason || null,
        });
      }
      return u;
    });
    if (updated.count === 0) {
      throw new ConflictException('This duty was already ended by someone else.');
    }

    await this.audit.record({
      action: 'driver.duty.force_ended',
      actorType: 'tenant',
      actorId: actor.userId ?? null,
      actorEmail: actor.name ?? null,
      targetType: 'driver_duty',
      targetId: dutyId,
      targetName: duty.driverId,
      metadata: { companyId, forced: true, by: actorName, reason: reason || null, endedAt },
    }).catch(() => undefined);

    this.logger.log(`Duty ${dutyId} force-ended by ${actorName}`);
    return { ok: true, dutyId, endedAt: endedAt.toISOString() };
  }

  /** Guards controller input. */
  static assertDutyId(dutyId: string) {
    if (!dutyId?.trim()) throw new BadRequestException('dutyId is required');
    return dutyId.trim();
  }
}
