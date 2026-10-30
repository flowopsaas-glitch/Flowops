import { Body, Controller, Delete, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TruckAppointmentStatus, TruckWindowChangeKind } from '@prisma/client';
import { RailTruckAppointmentsService } from './rail-truck-appointments.service';
import { DriverAttachmentResult, RailTruckWindowChangesService } from './rail-truck-window-changes.service';
import {
  BookTruckAppointmentDto,
  ShiftTruckAppointmentsDto,
  TruckAppointmentTransitionDto,
} from './dto/rail-truck-appointment.dto';
import { AckTruckWindowDto, AssignTruckDriverDto } from './dto/rail-truck-window-change.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_WINDOW_CHANGE_ROLES, RAIL_WRITE_ROLES } from './rail-roles';
import { RequireFeature } from '../billing/require-feature.decorator';

/**
 * Terminal truck appointments — booked gate windows for the road side of the
 * road<->rail handoff. Booking REPORTS overlapping windows instead of hiding
 * them; the terminal operator governs conflicts (no auto-rejection).
 *
 * Anything that MOVES or CANCELS a published window is routed to
 * `RailTruckWindowChangesService`, so there is exactly one code path that can
 * change a window and every change becomes a versioned, acknowledged event.
 */
@ApiTags('Rail / Truck Appointments')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@RequireFeature('rail')
@Controller('rail/truck-appointments')
export class RailTruckAppointmentsController {
  constructor(
    private readonly appointments: RailTruckAppointmentsService,
    private readonly changes: RailTruckWindowChangesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List truck appointments (window order) with measured wait/late figures' })
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('terminalName') terminalName?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.appointments.list(u.companyId, { status, terminalName, from, to });
  }

  /**
   * Read-only counterparty view (haulier / terminal) behind an unguessable
   * share token. No login: the token is the credential, revocable any time.
   */
  @Public()
  @Get('public/:token')
  @ApiOperation({ summary: 'Shared read-only truck appointment (token-gated, no login)' })
  shared(@Param('token') token: string) {
    return this.appointments.getShared(token);
  }

  /**
   * Acknowledge the current window change from the share link.
   *
   * This is the ONLY mutation a share token can perform, and it is bounded on
   * three sides: the token must exist and be unrevoked, it must carry a
   * recorded expiry that has not passed, and it can confirm a window — never
   * move one. A legacy token with no expiry on record is refused here (it still
   * reads) so an immortal unauthenticated link can never write.
   */
  @Public()
  @Post('public/:token/ack')
  @ApiOperation({ summary: 'Confirm the current window change via share link (read + confirm only, never move)' })
  sharedAck(
    @Param('token') token: string,
    @Body() dto: AckTruckWindowDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.changes.acknowledgeByShareToken(token, {
      deviceAckedAt: dto?.deviceAckedAt ? new Date(dto.deviceAckedAt) : null,
      idempotencyKey: dto?.idempotencyKey ?? idempotencyKey ?? null,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Counts by status + average measured wait (timestamp-based only)' })
  summary(@CurrentUser() u: AuthenticatedUser) {
    return this.appointments.summary(u.companyId);
  }

  @Post()
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Book a gate window; response lists any overlapping appointments' })
  book(@CurrentUser() u: AuthenticatedUser, @Body() dto: BookTruckAppointmentDto) {
    return this.appointments.book(u.companyId, dto, u);
  }

  /**
   * Assign the driver, then attach them to the window change that is already
   * open on this appointment, if there is one.
   *
   * Two services, because they own two different facts: the appointment records
   * who is driving, the change records who has been told. Doing only the first
   * would leave an open change addressed to DRIVER:UNASSIGNED — that driver
   * would see the new window in the portal, press confirm, and be refused as
   * NOT_A_RECIPIENT, while the board kept answering "does that truck know?"
   * with DRIVER NOT ASSIGNED.
   *
   * The attachment is best-effort and its OUTCOME IS RETURNED, never assumed: a
   * failure after the assignment is reported in the response and the log rather
   * than rolled back, because the driver is assigned and pretending otherwise
   * would be worse than saying what did not happen.
   */
  @Post(':id/assign-driver')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Assign the driver who will run this window, and attach them to any open window change' })
  async assignDriver(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: AssignTruckDriverDto) {
    const appt = await this.appointments.assignDriver(u.companyId, id, dto.driverId);
    let driverAttachment: DriverAttachmentResult;
    try {
      driverAttachment = await this.changes.attachDriverToActiveWindow({
        companyId: u.companyId,
        appointmentId: appt.id,
        // `assignDriver` resolved this driver inside the calling tenant and
        // stored the resolved name, so both fields are present by construction.
        driver: { id: String(appt.driverId), name: String(appt.driverName ?? appt.driverId) },
        actor: u as any,
      });
    } catch (err: any) {
      driverAttachment = {
        attached: false,
        reason: 'ATTACH_FAILED',
        changeId: null,
        version: null,
        closedRecipientKeys: [],
        recipient: null,
        message: `The driver is assigned, but was not attached to an open window change: ${err?.message ?? err}`,
      };
    }
    return { ...appt, driverAttachment };
  }

  @Post(':id/arrive')
  @Roles(...RAIL_WRITE_ROLES)
  arrive(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: TruckAppointmentTransitionDto) {
    return this.appointments.transition(u.companyId, id, 'ARRIVED', dto);
  }

  @Post(':id/start-loading')
  @Roles(...RAIL_WRITE_ROLES)
  startLoading(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: TruckAppointmentTransitionDto) {
    return this.appointments.transition(u.companyId, id, 'LOADING', dto);
  }

  @Post(':id/complete')
  @Roles(...RAIL_WRITE_ROLES)
  complete(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: TruckAppointmentTransitionDto) {
    return this.appointments.transition(u.companyId, id, 'COMPLETED', dto);
  }

  @Post(':id/no-show')
  @Roles(...RAIL_WRITE_ROLES)
  noShow(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: TruckAppointmentTransitionDto) {
    return this.appointments.transition(u.companyId, id, 'NO_SHOW', dto);
  }

  /**
   * Cancel. A BOOKED window is a window that has not happened yet, so
   * cancelling it is a window change: it goes through the event + notification
   * + acknowledgement loop like any other, with the same cut-off governance.
   * Cancelling an ARRIVED or LOADING appointment is a plain status transition —
   * the window already happened and there is no future window to supersede.
   */
  /**
   * Cancelling splits in two, and the authority differs by branch:
   *   BOOKED           → a versioned window change (the counterparty is told and
   *                      must confirm), so the SERVICE demands the window-change
   *                      permission and refuses a dispatcher with 403.
   *   ARRIVED / LOADING → a plain status transition on a truck already on site,
   *                      which stays ordinary rail-write work.
   * The route therefore keeps RAIL_WRITE_ROLES and the branch decides.
   */
  @Post(':id/cancel')
  @Roles(...RAIL_WRITE_ROLES)
  async cancel(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TruckAppointmentTransitionDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const appt = await this.appointments.getOne(u.companyId, id);
    if (appt.status !== TruckAppointmentStatus.BOOKED) {
      return this.appointments.transition(u.companyId, id, 'CANCELLED', dto);
    }
    const change = await this.changes.recordCancellation({
      companyId: u.companyId,
      appointmentId: id,
      reason: dto?.note ?? null,
      force: dto?.force,
      actor: u as any,
      idempotencyKey: idempotencyKey ?? null,
    });
    const updated = await this.appointments.getOne(u.companyId, id);
    return { ...updated, change };
  }

  /**
   * Move a BOOKED appointment to a new window. Publishes a versioned change
   * (superseding any previous version), notifies the haulier and the assigned
   * driver, and returns the overlapping appointments for the operator to
   * govern — conflicts are reported, never auto-resolved.
   */
  /**
   * Rescheduling a BOOKED window is a window CHANGE, not an edit: it publishes a
   * new version, supersedes the old one and notifies the haulier and the driver.
   * So it carries the dedicated window-change permission, not generic rail
   * write — a dispatcher may confirm that a change arrived, but may not move the
   * terminal's window. The service re-checks this, so the guard is not the only
   * thing standing between a caller and a moved window.
   */
  @Post(':id/reschedule')
  @Roles(...RAIL_WINDOW_CHANGE_ROLES)
  @ApiOperation({ summary: 'Publish a new window version; response lists overlaps + the versioned change' })
  async reschedule(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TruckAppointmentTransitionDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const change = await this.changes.publishWindowChange({
      companyId: u.companyId,
      appointmentId: id,
      kind: TruckWindowChangeKind.RESCHEDULED,
      newWindowStart: dto.windowStart ? new Date(dto.windowStart) : null,
      newWindowEnd: dto.windowEnd ? new Date(dto.windowEnd) : null,
      reason: dto.note ?? null,
      force: dto.force,
      actor: u as any,
      idempotencyKey: idempotencyKey ?? null,
    });
    const appt = await this.appointments.getOne(u.companyId, id);
    const conflicts = await this.appointments.findConflicts(
      u.companyId,
      appt.terminalName,
      new Date(appt.windowStart),
      new Date(appt.windowEnd),
      appt.id,
    );
    return { ...appt, conflicts, forced: change.forced, change };
  }

  @Post(':id/share')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Create (or rotate) the counterparty share link for an appointment' })
  share(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appointments.createShareLink(user.companyId, id);
  }

  @Delete(':id/share')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Revoke the counterparty share link for an appointment' })
  revokeShare(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appointments.revokeShareLink(user.companyId, id);
  }

  /** Shifts a whole day of BOOKED windows — one notified change per window moved. */
  @Post('replan-day')
  @Roles(...RAIL_WINDOW_CHANGE_ROLES)
  @ApiOperation({ summary: 'Shift every BOOKED window at a terminal on a day, each as its own notified change' })
  replanDay(
    @Body() dto: ShiftTruckAppointmentsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.changes.replanDay(user.companyId, dto, user as any, {
      idempotencyKey: idempotencyKey ?? null,
    });
  }
}
