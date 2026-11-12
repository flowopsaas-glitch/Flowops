import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALLOWED_TRANSITIONS,
  AppointmentStatus,
  DockDirection,
  SlotType,
} from './dto/dock.dto';

/**
 * Dock scheduling.
 *
 * A dock is physically single-threaded: one vehicle at a time. The whole value
 * of this module is enforcing that, so the interesting logic is the overlap
 * check and the status machine rather than the CRUD around them.
 *
 * TWO KINDS OF CORRECTNESS, KEPT SEPARATE ON PURPOSE
 *
 *  1. Validity — is this request well formed? (end after start, dock accepts
 *     this direction, dock is active, status move is legal). Cheap, checked
 *     before any write.
 *  2. Exclusivity — does anyone else hold this dock right now? Only answerable
 *     against committed rows, so it is checked inside a transaction.
 *
 * Mixing them is how double-bookings happen: a check that runs outside the
 * transaction observes a snapshot that is already stale.
 *
 * ON THE RACE
 *
 * The overlap check runs inside `prisma.$transaction`, which gives us a
 * consistent read, but does NOT by itself prevent two concurrent transactions
 * from both seeing an empty window and both inserting — that depends on the
 * isolation level. The durable fix is a Postgres EXCLUDE constraint over
 * `tstzrange(scheduledStart, scheduledEnd)` per dock slot, which makes the
 * database reject the overlap regardless of timing. That needs the btree_gist
 * extension and a migration, so it is recorded as follow-up in the module
 * rather than assumed here. Until then this is correct under concurrent
 * serialisable access and mostly correct otherwise.
 */

@Injectable()
export class DockService {
  constructor(private prisma: PrismaService) {}

  // ── Slots ────────────────────────────────────────────────────────────────

  /** Docks at one warehouse. The warehouse is tenant-scoped by id. */
  async listSlots(companyId: string, warehouseId: string, includeInactive = false) {
    await this.assertWarehouse(companyId, warehouseId);
    return this.prisma.dockSlot.findMany({
      where: { warehouseId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
  }

  async createSlot(
    companyId: string,
    data: { warehouseId: string; name: string; type?: SlotType; isActive?: boolean },
  ) {
    await this.assertWarehouse(companyId, data.warehouseId);
    return this.prisma.dockSlot.create({
      data: {
        warehouseId: data.warehouseId,
        name: data.name.trim(),
        ...(data.type ? { type: data.type } : {}),
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
      },
    });
  }

  async updateSlot(
    companyId: string,
    slotId: string,
    data: { name?: string; type?: SlotType; isActive?: boolean },
  ) {
    const slot = await this.assertSlot(companyId, slotId);

    // Taking a dock out of service is the one edit that can strand work: every
    // future booking on it becomes a vehicle arriving at a closed door, which
    // nothing downstream would flag. Refuse it while the dock still owes time,
    // and say how to clear the block.
    if (data.isActive === false) {
      const future = await this.prisma.dockAppointment.findMany({
        where: {
          dockSlotId: slot.id,
          companyId,
          status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
          scheduledEnd: { gt: new Date() },
        },
        select: { id: true, scheduledStart: true, reference: true },
        orderBy: { scheduledStart: 'asc' },
      });
      if (future.length) {
        const first = future[0];
        throw new ConflictException(
          `Dock ${slot.name} has ${future.length} upcoming booking${future.length === 1 ? '' : 's'}, ` +
            `starting ${first.scheduledStart.toISOString()}${first.reference ? ` (${first.reference})` : ''}. ` +
            'Cancel or move them before taking this dock out of service.',
        );
      }
    }

    return this.prisma.dockSlot.update({
      where: { id: slot.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  // ── Appointments ─────────────────────────────────────────────────────────

  async listAppointments(
    companyId: string,
    q: {
      dockSlotId?: string;
      status?: string;
      from?: string;
      to?: string;
      take?: number;
      skip?: number;
    } = {},
  ) {
    // A slot filter must belong to this tenant, otherwise a guessed id would
    // silently return an empty list rather than an error — and "no results"
    // reads as "no bookings", which a dispatcher would act on.
    if (q.dockSlotId) await this.assertSlot(companyId, q.dockSlotId);

    return this.prisma.dockAppointment.findMany({
      where: {
        companyId,
        ...(q.dockSlotId ? { dockSlotId: q.dockSlotId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.from || q.to
          ? {
              scheduledStart: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lt: new Date(q.to) } : {}),
              },
            }
          : {}),
      },
      include: { dockSlot: { select: { id: true, name: true, type: true } } },
      orderBy: { scheduledStart: 'asc' },
      take: Math.min(q.take ?? 100, 500),
      skip: q.skip ?? 0,
    });
  }

  async getAppointment(companyId: string, id: string) {
    const appt = await this.prisma.dockAppointment.findFirst({
      where: { id, companyId },
      include: { dockSlot: { select: { id: true, name: true, type: true, warehouseId: true } } },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  /**
   * Book a dock.
   *
   * The overlap check and the insert share one transaction, so the window we
   * validated is the window we write into.
   */
  async createAppointment(
    companyId: string,
    data: {
      dockSlotId: string;
      type: DockDirection;
      scheduledStart: string;
      scheduledEnd: string;
      carrierName?: string | null;
      vehicleReg?: string | null;
      reference?: string | null;
      notes?: string | null;
    },
  ) {
    const start = new Date(data.scheduledStart);
    const end = new Date(data.scheduledEnd);
    this.assertWindow(start, end);

    const slot = await this.assertSlot(companyId, data.dockSlotId);
    this.assertDirectionAllowed(slot.type as SlotType, data.type);

    // withTenant, not a bare $transaction: the overlap check and the insert
    // must commit together, and setting app.company_id means row-level
    // security covers the write as well as the WHERE clause below.
    return this.prisma.withTenant(companyId, async (tx) => {
      // Half-open intervals: [start, end) and [start2, end2) collide when
      // start < end2 AND start2 < end. Back-to-back bookings that merely touch
      // do not collide, so a dock can be turned over on the hour.
      //
      // The transaction gives a consistent read, but does not by itself stop two
      // concurrent bookings from both seeing an empty window and both inserting
      // -- that depends on the isolation level. The durable fix is a Postgres
      // EXCLUDE constraint over tstzrange(scheduledStart, scheduledEnd) per
      // dock slot, which rejects the overlap regardless of timing. It needs the
      // btree_gist extension, which no migration in this repo has yet required,
      // so it is deliberately left as follow-up rather than shipped blind.
      const clash = await tx.dockAppointment.findMany({
        where: {
          dockSlotId: slot.id,
          companyId,
          // Cancelled and no-show appointments release the dock: they never
          // occupied it, so they must not block the slot.
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          scheduledStart: { lt: end },
          scheduledEnd: { gt: start },
        },
        select: { id: true, scheduledStart: true, scheduledEnd: true, reference: true },
        take: 1,
      });

      if (clash.length) {
        const c = clash[0];
        throw new ConflictException(
          `Dock ${slot.name} is already booked ${c.scheduledStart.toISOString()}–${c.scheduledEnd.toISOString()}` +
            `${c.reference ? ` (${c.reference})` : ''}. Choose another dock or another window.`,
        );
      }

      return tx.dockAppointment.create({
        data: {
          companyId,
          dockSlotId: slot.id,
          type: data.type,
          scheduledStart: start,
          scheduledEnd: end,
          carrierName: data.carrierName ?? null,
          vehicleReg: data.vehicleReg ?? null,
          reference: data.reference ?? null,
          notes: data.notes ?? null,
          status: 'SCHEDULED',
        },
        include: { dockSlot: { select: { id: true, name: true, type: true } } },
      });
    });
  }

  /**
   * Move an appointment to a new window.
   *
   * Re-checks exclusivity against every other appointment, excluding itself —
   * the obvious bug here is matching the row being moved and concluding the
   * dock is busy.
   */
  async reschedule(companyId: string, id: string, startRaw: string, endRaw: string) {
    const start = new Date(startRaw);
    const end = new Date(endRaw);
    this.assertWindow(start, end);

    const existing = await this.getAppointment(companyId, id);
    if (existing.status !== 'SCHEDULED') {
      throw new ConflictException(
        `An appointment that is ${existing.status} cannot be rescheduled; only SCHEDULED ones can.`,
      );
    }

    return this.prisma.withTenant(companyId, async (tx) => {
      const clash = await tx.dockAppointment.findMany({
        where: {
          dockSlotId: existing.dockSlotId,
          companyId,
          id: { not: id },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          scheduledStart: { lt: end },
          scheduledEnd: { gt: start },
        },
        select: { id: true, scheduledStart: true, scheduledEnd: true },
        take: 1,
      });
      if (clash.length) {
        throw new ConflictException(
          `That window is taken (${clash[0].scheduledStart.toISOString()}–${clash[0].scheduledEnd.toISOString()}).`,
        );
      }
      return tx.dockAppointment.update({
        where: { id },
        data: { scheduledStart: start, scheduledEnd: end },
        include: { dockSlot: { select: { id: true, name: true, type: true } } },
      });
    });
  }

  /**
   * Advance the lifecycle.
   *
   * Arrival and completion stamp the clock that matters operationally:
   * actualArrival is what turns a booked window into a measured one, and
   * dwell time (arrival to departure) is the number a warehouse is judged on.
   */
  async transition(
    companyId: string,
    id: string,
    next: AppointmentStatus,
    notes?: string | null,
  ) {
    const appt = await this.getAppointment(companyId, id);
    const from = appt.status as AppointmentStatus;

    if (from === next) return appt; // idempotent: a double-scan is not an error

    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(next)) {
      throw new ConflictException(
        `Cannot move an appointment from ${from} to ${next}. ` +
          `Allowed: ${allowed.length ? allowed.join(', ') : 'none — this state is terminal'}.`,
      );
    }

    const now = new Date();
    const stamps: Record<string, Date | null> = {};
    if (next === 'ARRIVED' || next === 'IN_PROGRESS') {
      stamps.actualArrival = appt.actualArrival ?? now;
    }
    if (next === 'COMPLETED') {
      stamps.actualDepart = appt.actualDepart ?? now;
    }

    return this.prisma.withTenant(companyId, (tx) =>
      tx.dockAppointment.update({
        where: { id, companyId },
        data: {
          status: next,
          ...stamps,
          ...(notes !== undefined && notes !== null ? { notes } : {}),
        },
        include: { dockSlot: { select: { id: true, name: true, type: true } } },
      }),
    );
  }

  /**
   * Free windows for a dock on a given day.
   *
   * Returns gaps rather than appointments so a dispatcher is shown where they
   * can book, not what they must avoid.
   */
  async availability(companyId: string, dockSlotId: string, day: string) {
    const slot = await this.assertSlot(companyId, dockSlotId);

    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    if (Number.isNaN(dayStart.getTime())) {
      throw new BadRequestException('day must be YYYY-MM-DD');
    }

    const booked = await this.prisma.dockAppointment.findMany({
      where: {
        dockSlotId: slot.id,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        scheduledStart: { lt: dayEnd },
        scheduledEnd: { gt: dayStart },
      },
      select: { id: true, scheduledStart: true, scheduledEnd: true, reference: true },
      orderBy: { scheduledStart: 'asc' },
    });

    const gaps: { start: string; end: string }[] = [];
    let cursor = dayStart;
    for (const b of booked) {
      if (cursor < b.scheduledStart) {
        gaps.push({ start: cursor.toISOString(), end: b.scheduledStart.toISOString() });
      }
      if (b.scheduledEnd > cursor) cursor = b.scheduledEnd;
    }
    if (cursor < dayEnd) gaps.push({ start: cursor.toISOString(), end: dayEnd.toISOString() });

    return {
      dockSlotId: slot.id,
      dockName: slot.name,
      day,
      booked: booked.map((b) => ({
        id: b.id,
        start: b.scheduledStart.toISOString(),
        end: b.scheduledEnd.toISOString(),
        reference: b.reference,
      })),
      free: gaps,
    };
  }

  // ── Guards ───────────────────────────────────────────────────────────────

  private assertWindow(start: Date, end: Date) {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('scheduledStart and scheduledEnd must be valid dates');
    }
    if (end <= start) {
      throw new BadRequestException('scheduledEnd must be after scheduledStart');
    }
    // A zero-length window would overlap nothing and never conflict, so it
    // could be booked infinitely. Reject it rather than reason about it.
    if (end.getTime() - start.getTime() < 60_000) {
      throw new BadRequestException('An appointment must be at least one minute long');
    }
  }

  private assertDirectionAllowed(slotType: SlotType, wanted: DockDirection) {
    if (slotType === 'BOTH' || slotType === wanted) return;
    throw new ConflictException(
      `This dock accepts ${slotType} only; it cannot take an ${wanted} appointment.`,
    );
  }

  /** Warehouse must belong to the caller's tenant. */
  private async assertWarehouse(companyId: string, warehouseId: string) {
    const wh = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId },
      select: { id: true },
    });
    if (!wh) throw new NotFoundException('Warehouse not found in this company');
    return wh;
  }

  /** Slot must belong to a warehouse in the caller's tenant. */
  private async assertSlot(companyId: string, slotId: string) {
    const slot = await this.prisma.dockSlot.findFirst({
      where: { id: slotId, warehouse: { companyId } },
      include: { warehouse: { select: { id: true, companyId: true } } },
    });
    if (!slot) throw new NotFoundException('Dock slot not found in this company');
    if (!slot.isActive) throw new ConflictException('This dock is not active');
    return slot;
  }
}
