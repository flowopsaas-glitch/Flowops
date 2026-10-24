import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookTruckAppointmentDto, TruckAppointmentTransitionDto } from './dto/rail-truck-appointment.dto';

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
      measuredWaits: waits.length,
      avgWaitMinutes: waits.length
        ? Math.round((waits.reduce((s, w) => s + w, 0) / waits.length) * 10) / 10
        : null,
    };
  }

  async transition(companyId: string, id: string, to: string, dto?: TruckAppointmentTransitionDto) {
    const appt = await this.getOwned(companyId, id);
    if (!(FLOW[appt.status] ?? []).includes(to)) {
      throw new BadRequestException(`Cannot move a ${appt.status} appointment to ${to}`);
    }
    const now = new Date();
    const data: any = { status: to };
    if (to === 'ARRIVED' && !appt.arrivedAt) data.arrivedAt = now;
    if (to === 'LOADING' && !appt.loadingAt) data.loadingAt = now;
    if (to === 'COMPLETED' && !appt.completedAt) data.completedAt = now;
    if (dto?.note) data.note = dto.note;
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
    const conflicts = await this.findConflicts(companyId, appt.terminalName, start, end, id);
    const updated = await this.prisma.terminalTruckAppointment.update({
      where: { id },
      data: { windowStart: start, windowEnd: end, ...(dto.note ? { note: dto.note } : {}) },
    });
    return { ...updated, conflicts };
  }
}
