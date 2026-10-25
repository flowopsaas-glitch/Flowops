import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookTruckAppointmentDto,
  ShiftTruckAppointmentsDto,
  TruckAppointmentTransitionDto,
} from './dto/rail-truck-appointment.dto';

/**
 * Terminal truck appointments — the road side of the road<->rail handoff.
 *
 * Problem (operator-verified): terminals absorb variability because trucks
 * arrive unscheduled and queue, coordinated by phone. This service is the
 * shared schedule layer: the terminal publishes windows, hauliers book
 * against them, and arrival/loading/completion timestamps are recorded so
 * wait time (arrival -> loading) is measured, never estimated.
 *
 * Honesty rules:
 *  - Overlapping windows are REPORTED (conflicts), never silently hidden;
 *    the terminal operator decides (governance stays human).
 *  - Wait/dwell figures come only from recorded timestamps; appointments
 *    without them contribute nothing to averages.
 */
const FLOW: Record<string, string[]> = {
  BOOKED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'],
  ARRIVED: ['LOADING', 'CANCELLED', 'NO_SHOW'],
  LOADING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

@Injectable()
export class RailTruckAppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOwned(companyId: string, id: string) {
    const appt = await this.prisma.terminalTruckAppointment.findFirst({
      where: { id, companyId },
    });
    if (!appt) throw new NotFoundException('Truck appointment not found');
    return appt;
  }

  private validateWindow(startIso: string, endIso: string) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('windowStart and windowEnd must be valid dates');
    }
    if (end <= start) throw new BadRequestException('windowEnd must be after windowStart');
    return { start, end };
  }

  /** Active appointments at the same terminal overlapping [start, end). */
  async findConflicts(companyId: string, terminalName: string, start: Date, end: Date, excludeId?: string) {
    return this.prisma.terminalTruckAppointment.findMany({
      where: {
        companyId,
        terminalName: { equals: terminalName, mode: 'insensitive' },
        status: { in: ['BOOKED', 'ARRIVED', 'LOADING'] as any },
        windowStart: { lt: end },
        windowEnd: { gt: start },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, haulierName: true, vehicleReg: true, windowStart: true, windowEnd: true, status: true },
      orderBy: { windowStart: 'asc' },
    });
  }

  async book(companyId: string, dto: BookTruckAppointmentDto, user?: any) {
    const { start, end } = this.validateWindow(dto.windowStart, dto.windowEnd);
    const conflicts = await this.findConflicts(companyId, dto.terminalName, start, end);
    const appt = await this.prisma.terminalTruckAppointment.create({
      data: {
        companyId,
        terminalName: dto.terminalName,
        haulierName: dto.haulierName,
        vehicleReg: dto.vehicleReg,
        driverName: dto.driverName,
        purpose: dto.purpose ?? 'DELIVERY',
        windowStart: start,
        windowEnd: end,
        consignmentId: dto.consignmentId,
        legId: dto.legId,
        note: dto.note,
        bookedBy: user?.id ?? user?.email ?? undefined,
      },
    });
    return { ...appt, conflicts, waitMinutes: null, lateArrival: null };
  }

  async list(companyId: string, filters?: { status?: string; terminalName?: string; from?: string; to?: string }) {
    const where: any = { companyId };
    if (filters?.status) where.status = filters.status;
    if (filters?.terminalName) where.terminalName = { equals: filters.terminalName, mode: 'insensitive' };
    if (filters?.from || filters?.to) {
      where.windowStart = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    const rows = await this.prisma.terminalTruckAppointment.findMany({
      where,
      orderBy: { windowStart: 'asc' },
      take: 200,
    });
    return rows.map((r) => ({ ...r, ...this.metrics(r) }));
  }

  /** Measured wait/late figures from recorded timestamps only. */
  metrics(r: { windowStart: Date; arrivedAt: Date | null; loadingAt: Date | null }) {
    const waitMinutes =
      r.arrivedAt && r.loadingAt
        ? Math.round((new Date(r.loadingAt).getTime() - new Date(r.arrivedAt).getTime()) / 60000)
        : null;
    const lateMinutes =
      r.arrivedAt != null
        ? Math.round((new Date(r.arrivedAt).getTime() - new Date(r.windowStart).getTime()) / 60000)
        : null;
    return { waitMinutes, lateMinutes };
  }

  async summary(companyId: string) {
    const rows = await this.prisma.terminalTruckAppointment.findMany({
      where: { companyId },
      select: { status: true, windowStart: true, arrivedAt: true, loadingAt: true },
      take: 1000,
    });
    const waits = rows
      .map((r) => this.metrics(r).waitMinutes)
      .filter((w): w is number => w != null);
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    return {
      total: rows.length,
      byStatus,
      changeCutoffHours: await this.changeCutoffHours(companyId),
      measuredWaits: waits.length,
      avgWaitMinutes: waits.length
        ? Math.round((waits.reduce((s, w) => s + w, 0) / waits.length) * 10) / 10
        : null,
    };
  }

  /** Hours before window start inside which changes are "late changes". */
  async changeCutoffHours(companyId: string): Promise<number> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { terminalGateCutoffHours: true },
    });
    const hours = company?.terminalGateCutoffHours;
    return typeof hours === 'number' && hours >= 0 ? hours : 2;
  }

  /**
   * Window-change governance: inside the cut-off, a BOOKED window may only
   * change as a forced change with a recorded reason. Outside the cut-off
   * the operator edits freely. Nothing is silently auto-moved.
   */
  private async assertWindowChangeAllowed(
    companyId: string,
    appt: { windowStart: Date },
    dto?: TruckAppointmentTransitionDto,
  ): Promise<{ forced: boolean }> {
    const cutoffHours = await this.changeCutoffHours(companyId);
    const cutoffAt = new Date(new Date(appt.windowStart).getTime() - cutoffHours * 3600_000);
    if (new Date() < cutoffAt) return { forced: false };
    if (dto?.force && dto.note?.trim()) return { forced: true };
    throw new BadRequestException(
      `This window starts within the ${cutoffHours}h change cut-off. ` +
        'Inside the cut-off a change must be forced with a recorded reason (force=true and note).',
    );
  }

  private forcedNote(existing: string | null | undefined, dto?: TruckAppointmentTransitionDto) {
    return `${existing ? `${existing}\n` : ''}[forced change inside cut-off] ${dto?.note?.trim()}`;
  }

  // ── Counterparty shared view (haulier / terminal) ──────────────────────

  async createShareLink(companyId: string, id: string) {
    await this.getOwned(companyId, id);
    const token = randomBytes(24).toString('base64url');
    await this.prisma.terminalTruckAppointment.update({
      where: { id },
      data: { shareToken: token, shareTokenIssuedAt: new Date() },
    });
    return { token, path: `/gate/${token}` };
  }

  async revokeShareLink(companyId: string, id: string) {
    await this.getOwned(companyId, id);
    await this.prisma.terminalTruckAppointment.update({
      where: { id },
      data: { shareToken: null, shareTokenIssuedAt: null },
    });
    return { revoked: true };
  }

  /**
   * Read-only view behind a share token. Deliberately limited: no tenant
   * id, no booker, no internal note, no driver name — a counterparty sees
   * the window, the vehicle and the measured state of their booking.
   */
  async getShared(token: string) {
    if (!token || token.length < 16) throw new NotFoundException('Shared appointment not found');
    const appt = await this.prisma.terminalTruckAppointment.findFirst({
      where: { shareToken: token },
    });
    if (!appt) throw new NotFoundException('Shared appointment not found or the link was revoked');
    return {
      terminalName: appt.terminalName,
      haulierName: appt.haulierName,
      vehicleReg: appt.vehicleReg,
      purpose: appt.purpose,
      windowStart: appt.windowStart,
      windowEnd: appt.windowEnd,
      status: appt.status,
      arrivedAt: appt.arrivedAt,
      loadingAt: appt.loadingAt,
      completedAt: appt.completedAt,
      ...this.metrics(appt),
    };
  }

  // ── Day replan: shift every BOOKED window at a terminal on a day ─────

  async shiftDay(companyId: string, dto: ShiftTruckAppointmentsDto, user?: any) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    if (!dto.shiftMinutes || dto.shiftMinutes === 0) {
      throw new BadRequestException('shiftMinutes must be a non-zero number of minutes');
    }
    const dayStart = new Date(`${dto.date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
    const rows = await this.prisma.terminalTruckAppointment.findMany({
      where: {
        companyId,
        terminalName: { equals: dto.terminalName, mode: 'insensitive' },
        status: 'BOOKED',
        windowStart: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { windowStart: 'asc' },
    });
    const deltaMs = dto.shiftMinutes * 60_000;
    const marker = `[replanned ${dto.shiftMinutes > 0 ? '+' : ''}${dto.shiftMinutes}m on ${dto.date}] ${dto.reason.trim()}`;
    let withConflicts = 0;
    for (const r of rows) {
      const windowStart = new Date(new Date(r.windowStart).getTime() + deltaMs);
      const windowEnd = new Date(new Date(r.windowEnd).getTime() + deltaMs);
      await this.prisma.terminalTruckAppointment.update({
        where: { id: r.id },
        data: {
          windowStart,
          windowEnd,
          note: `${r.note ? `${r.note}\n` : ''}${marker}`,
        },
      });
      const conflicts = await this.findConflicts(companyId, r.terminalName, windowStart, windowEnd, r.id);
      if (conflicts.length) withConflicts++;
    }
    return {
      terminalName: dto.terminalName,
      date: dto.date,
      shiftMinutes: dto.shiftMinutes,
      shifted: rows.length,
      withConflicts,
      appointmentIds: rows.map((r) => r.id),
      requestedBy: user?.id ?? user?.email ?? undefined,
    };
  }

  async transition(companyId: string, id: string, to: string, dto?: TruckAppointmentTransitionDto) {
    const appt = await this.getOwned(companyId, id);
    if (!(FLOW[appt.status] ?? []).includes(to)) {
      throw new BadRequestException(`Cannot move a ${appt.status} appointment to ${to}`);
    }
    // Cancelling a BOOKED window is a window change: governance applies.
    let forced = false;
    if (to === 'CANCELLED' && appt.status === 'BOOKED') {
      forced = (await this.assertWindowChangeAllowed(companyId, appt, dto)).forced;
    }
    const now = new Date();
    const data: any = { status: to };
    if (forced) data.note = this.forcedNote(appt.note, dto);
    else if (dto?.note) data.note = dto.note;
    if (to === 'ARRIVED' && !appt.arrivedAt) data.arrivedAt = now;
    if (to === 'LOADING' && !appt.loadingAt) data.loadingAt = now;
    if (to === 'COMPLETED' && !appt.completedAt) data.completedAt = now;
    const updated = await this.prisma.terminalTruckAppointment.update({ where: { id }, data });
    return { ...updated, ...this.metrics(updated) };
  }

  async reschedule(companyId: string, id: string, dto: TruckAppointmentTransitionDto) {
    const appt = await this.getOwned(companyId, id);
    if (appt.status !== 'BOOKED') {
      throw new BadRequestException('Only a BOOKED appointment can be rescheduled');
    }
    if (!dto.windowStart || !dto.windowEnd) {
      throw new BadRequestException('windowStart and windowEnd are required to reschedule');
    }
    const { start, end } = this.validateWindow(dto.windowStart, dto.windowEnd);
    const { forced } = await this.assertWindowChangeAllowed(companyId, appt, dto);
    const conflicts = await this.findConflicts(companyId, appt.terminalName, start, end, id);
    const updated = await this.prisma.terminalTruckAppointment.update({
      where: { id },
      data: {
        windowStart: start,
        windowEnd: end,
        ...(forced ? { note: this.forcedNote(appt.note, dto) } : dto.note ? { note: dto.note } : {}),
      },
    });
    return { ...updated, conflicts, forced };
  }
}
