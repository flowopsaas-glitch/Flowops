import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookTruckAppointmentDto,
  TruckAppointmentTransitionDto,
} from './dto/rail-truck-appointment.dto';
import {
  assessShareToken, findGateConflicts, formatWindow, readGateCutoffHours,
  shareLinkState, shareTokenExpiryFrom, validateGateWindow, withoutShareToken,
} from './rail-truck-gate.shared';

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
 *
 * WINDOW CHANGES ARE NOT HERE. Moving or cancelling a published window is a
 * versioned event with named recipients and an acknowledgement loop, and it
 * lives in `RailTruckWindowChangesService` so there is exactly one code path
 * that can move a window. This service owns the appointment lifecycle
 * (book / arrive / load / complete / no-show), the counterparty share link and
 * the measured wait figures. The controller routes reschedule, day-replan and
 * cancellation-of-a-BOOKED-window to the change service.
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

  /**
   * Tenant-scoped read. Returns the row WITHOUT its share token: this is the
   * read every row-shaped response in this module is built from, so redacting
   * here is what makes the token unreachable from the tenant API rather than
   * absent from one endpoint by luck. `shareLinkState()` is computed from the
   * raw row before it is redacted, so the terminal still sees whether a link
   * exists, when it expires and whether it is a legacy one.
   */
  private async getOwned(companyId: string, id: string) {
    const appt = await this.prisma.terminalTruckAppointment.findFirst({
      where: { id, companyId },
    });
    if (!appt) throw new NotFoundException('Truck appointment not found');
    return withoutShareToken(appt);
  }

  /** Tenant-scoped read for callers that must branch on the current status. */
  async getOne(companyId: string, id: string) {
    return this.getOwned(companyId, id);
  }

  private validateWindow(startIso: string, endIso: string) {
    return validateGateWindow(startIso, endIso);
  }

  /** Active appointments at the same terminal overlapping [start, end). */
  async findConflicts(companyId: string, terminalName: string, start: Date, end: Date, excludeId?: string) {
    return findGateConflicts(this.prisma, companyId, terminalName, start, end, excludeId);
  }

  async book(companyId: string, dto: BookTruckAppointmentDto, user?: any) {
    const { start, end } = this.validateWindow(dto.windowStart, dto.windowEnd);

    // The driver link is what makes "notify the assigned driver" a real
    // recipient rather than a guess at the free-text driverName. A driver from
    // another tenant is refused outright — resolving the id against the calling
    // tenant is the only thing that makes it trustworthy.
    let driver: { id: string; name: string } | null = null;
    if (dto.driverId) {
      driver = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, companyId, isActive: true },
        select: { id: true, name: true },
      });
      if (!driver) throw new BadRequestException('That driver is not an active driver in your company');
    }

    const conflicts = await this.findConflicts(companyId, dto.terminalName, start, end);
    const appt = await this.prisma.terminalTruckAppointment.create({
      data: {
        companyId,
        terminalName: dto.terminalName,
        haulierName: dto.haulierName,
        vehicleReg: dto.vehicleReg,
        // The resolved driver's name wins over a typed label: a name the system
        // looked up is a fact, a name somebody typed is a claim.
        driverName: driver?.name ?? dto.driverName,
        driverId: driver?.id ?? null,
        purpose: dto.purpose ?? 'DELIVERY',
        windowStart: start,
        windowEnd: end,
        consignmentId: dto.consignmentId,
        legId: dto.legId,
        note: dto.note,
        bookedBy: user?.id ?? user?.email ?? undefined,
      },
    });
    return { ...withoutShareToken(appt), conflicts, waitMinutes: null, lateArrival: null };
  }

  /**
   * Attach (or re-attach) the driver who will actually run this window.
   * Separate from booking because the driver is often known later than the
   * window — and because assigning one changes who the closed loop notifies.
   */
  async assignDriver(companyId: string, id: string, driverId: string) {
    const appt = await this.getOwned(companyId, id);
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, companyId, isActive: true },
      select: { id: true, name: true },
    });
    if (!driver) throw new BadRequestException('That driver is not an active driver in your company');
    const updated = await this.prisma.terminalTruckAppointment.update({
      where: { id: appt.id },
      data: { driverId: driver.id, driverName: driver.name },
    });
    return { ...withoutShareToken(updated), ...this.metrics(updated) };
  }

  async list(companyId: string, filters?: { status?: string; terminalName?: string; from?: string; to?: string }, now: Date = new Date()) {
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
    const versions = await this.activeWindowVersions(companyId, rows.map((r) => r.id));
    return rows.map((r) => ({
      // No raw share token in a list served to every rail READ role: the token
      // is a bearer credential (see `withoutShareToken`). `shareLink` below is
      // computed from the unredacted row, so the terminal can still see that a
      // link exists, whether it is legacy, and kill it in one click.
      ...withoutShareToken(r),
      ...this.metrics(r),
      pendingWindowChange: versions.get(r.id) ?? null,
      // Which counterparty links are legacy (unexpiring, read-only) so the
      // terminal can revoke and re-issue them instead of discovering it later.
      shareLink: shareLinkState(r, now),
    }));
  }

  /**
   * The ACTIVE window-change version per appointment, so a list can show
   * "window changed — awaiting acknowledgement" without a second round trip.
   * Returns nothing for appointments with no change, which the caller renders
   * as no banner rather than as a zero.
   */
  private async activeWindowVersions(companyId: string, appointmentIds: string[]) {
    if (!appointmentIds.length) return new Map<string, { id: string; version: number; unacked: number }>();
    const rows = await this.prisma.terminalTruckWindowChange.findMany({
      where: { companyId, appointmentId: { in: appointmentIds }, status: 'ACTIVE' },
      select: { id: true, version: true, appointmentId: true, changeKind: true, changedAt: true, recipients: { select: { ackState: true, deliveryState: true } } },
    });
    const map = new Map<string, { id: string; version: number; unacked: number }>();
    for (const r of rows) {
      map.set(r.appointmentId, {
        id: r.id,
        version: r.version,
        unacked: r.recipients.filter((x) => x.ackState !== 'ACKNOWLEDGED' && x.deliveryState !== 'UNAVAILABLE').length,
      });
    }
    return map;
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
    return readGateCutoffHours(this.prisma, companyId);
  }

  // ── Counterparty shared view (haulier / terminal) ──────────────────────

  async createShareLink(companyId: string, id: string) {
    await this.getOwned(companyId, id);
    const token = randomBytes(24).toString('base64url');
    const issuedAt = new Date();
    const expiresAt = shareTokenExpiryFrom(issuedAt);
    await this.prisma.terminalTruckAppointment.update({
      where: { id },
      data: { shareToken: token, shareTokenIssuedAt: issuedAt, shareTokenExpiresAt: expiresAt },
    });
    return { token, path: `/gate/${token}`, expiresAt: expiresAt.toISOString() };
  }

  async revokeShareLink(companyId: string, id: string) {
    await this.getOwned(companyId, id);
    await this.prisma.terminalTruckAppointment.update({
      where: { id },
      data: { shareToken: null, shareTokenIssuedAt: null, shareTokenExpiresAt: null },
    });
    return { revoked: true };
  }

  /**
   * Read-only view behind a share token. Deliberately limited: no tenant
   * id, no booker, no internal note, no driver name — a counterparty sees
   * the window, the vehicle and the measured state of their booking.
   *
   * An expired token is refused here as well as on the acknowledgement path.
   * A legacy token (issued before expiry was recorded) still reads: a link
   * already sitting in a haulier's inbox must not silently break, and the
   * response says plainly that it has no expiry on record.
   */
  async getShared(token: string, now: Date = new Date()) {
    if (!token || token.length < 16) throw new NotFoundException('Shared appointment not found');
    const appt = await this.prisma.terminalTruckAppointment.findFirst({
      where: { shareToken: token },
    });
    if (!appt) throw new NotFoundException('Shared appointment not found or the link was revoked');

    const validity = assessShareToken(appt, now);
    if (validity.state === 'EXPIRED') {
      throw new NotFoundException('This share link has expired. Ask the operator to re-issue it.');
    }

    const active = await this.prisma.terminalTruckWindowChange.findFirst({
      where: { companyId: appt.companyId, appointmentId: appt.id, status: 'ACTIVE' },
      include: { recipients: true },
      orderBy: { version: 'desc' },
    });
    const haulier = active?.recipients.find((r: any) => r.recipientType === 'HAULIER') ?? null;

    return {
      terminalName: appt.terminalName,
      haulierName: appt.haulierName,
      vehicleReg: appt.vehicleReg,
      purpose: appt.purpose,
      windowStart: appt.windowStart,
      windowEnd: appt.windowEnd,
      windowVersion: appt.windowVersion ?? 1,
      status: appt.status,
      arrivedAt: appt.arrivedAt,
      loadingAt: appt.loadingAt,
      completedAt: appt.completedAt,
      ...this.metrics(appt),
      link: {
        expiresAt: validity.state === 'VALID' ? (validity.expiresAt as Date).toISOString() : null,
        // A legacy link is readable but cannot confirm a change; the page must
        // say so instead of showing a button that always fails.
        canAcknowledge: validity.state === 'VALID',
        noExpiryOnRecord: validity.state === 'LEGACY_NO_EXPIRY',
      },
      // The current change, so the counterparty sees the NEW window with the
      // old one struck through and a single confirm action — without a second
      // round trip and without any tenant internals.
      change: active
        ? {
          id: active.id,
          version: active.version,
          changeKind: active.changeKind,
          changedAt: new Date(active.changedAt).toISOString(),
          reason: active.reason,
          previousWindowText: formatWindow(active.previousWindowStart, active.previousWindowEnd),
          previousWindow: { start: active.previousWindowStart, end: active.previousWindowEnd },
          newWindowText: active.newWindowStart && active.newWindowEnd
            ? formatWindow(active.newWindowStart, active.newWindowEnd)
            : null,
          newWindow: active.newWindowStart && active.newWindowEnd
            ? { start: active.newWindowStart, end: active.newWindowEnd }
            : null,
          acknowledged: haulier?.ackState === 'ACKNOWLEDGED',
          acknowledgedAt: haulier?.ackedAt ? new Date(haulier.ackedAt).toISOString() : null,
        }
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
    if (dto?.note) data.note = dto.note;
    if (to === 'ARRIVED' && !appt.arrivedAt) data.arrivedAt = now;
    if (to === 'LOADING' && !appt.loadingAt) data.loadingAt = now;
    if (to === 'COMPLETED' && !appt.completedAt) data.completedAt = now;
    const updated = await this.prisma.terminalTruckAppointment.update({ where: { id }, data });
    return { ...withoutShareToken(updated), ...this.metrics(updated) };
  }
}
